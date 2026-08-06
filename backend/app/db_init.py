"""数据库初始化模块：应用启动时自动执行 backend/sql/init.sql。

职责：
1. 按 DATABASE_URL 中配置的库名自动创建数据库（不存在时）；
2. 执行 init.sql 的建表与老库兼容段（全部 IF NOT EXISTS，可重复执行）；
3. 仅当数据库为全新（无用户数据）时，写入演示数据段，避免每次重启重置数据。

init.sql 同时支持手工执行：mysql -u root -p < backend/sql/init.sql。
"""

import logging
import re
from pathlib import Path

import asyncmy
from sqlalchemy.engine import make_url

from app.config import settings

logger = logging.getLogger("app.db_init")

# init.sql 中演示数据段的起始标记（注释行），用于把文件切分为 schema 段与 seed 段
_SEED_MARKER = "-- ==== 演示数据（SEED） ===="

_INIT_SQL_PATH = Path(__file__).resolve().parents[1] / "sql" / "init.sql"

# 合法数据库名 / 表名字符，防止配置中的库名被注入
_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9_]+$")


def _parse_sql(text: str) -> tuple[list[str], list[str]]:
    """把 init.sql 文本切分为 (schema 语句列表, seed 语句列表)。

    - 按 _SEED_MARKER 注释行将文件分为两段，逐段按 ``;`` 切分为单条语句；
    - 忽略注释行（-- 开头）与空语句；
    - CREATE DATABASE / USE 交由本模块处理（已连接到目标库），不返回。
    """
    if _SEED_MARKER in text:
        schema_text, seed_text = text.split(_SEED_MARKER, 1)
    else:
        schema_text, seed_text = text, ""

    def split_statements(part: str) -> list[str]:
        statements: list[str] = []
        for raw in part.split(";"):
            cleaned = "\n".join(
                ln for ln in raw.splitlines() if not ln.strip().startswith("--")
            ).strip()
            if not cleaned:
                continue
            first = cleaned.splitlines()[0].strip().upper()
            if first.startswith("CREATE DATABASE") or first.startswith("USE"):
                continue
            statements.append(cleaned)
        return statements

    return split_statements(schema_text), split_statements(seed_text)


def load_init_sql() -> tuple[list[str], list[str]]:
    """读取并解析 init.sql，返回 (schema 语句, seed 语句)。"""
    text = _INIT_SQL_PATH.read_text(encoding="utf-8")
    return _parse_sql(text)


async def _connect(url: object, database: str | None = None) -> object:
    """建立 asyncmy 原始连接（绕过 SQLAlchemy，便于执行建库等语句）。"""
    return await asyncmy.connect(
        host=url.host,
        port=url.port or 3306,
        user=url.username,
        password=url.password or "",
        database=database,
        charset="utf8mb4",
        autocommit=True,
    )


async def _query_all(conn: object, sql: str) -> list[tuple]:
    """在连接上执行单条 SQL 并返回全部结果行。"""
    cur = conn.cursor()
    try:
        await cur.execute(sql)
        return await cur.fetchall()
    finally:
        await cur.close()


async def _ensure_database(url: object, db_name: str) -> None:
    """数据库不存在时创建（CREATE DATABASE IF NOT EXISTS 语义）。"""
    conn = await _connect(url)
    try:
        # db_name 已通过 _IDENTIFIER_RE 校验，可安全拼入 SQL
        rows = await _query_all(
            conn,
            f"SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = '{db_name}'",
        )
        if not rows:
            await _query_all(
                conn,
                f"CREATE DATABASE `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
            )
            logger.info("数据库 %s 不存在，已自动创建", db_name)
        else:
            logger.info("数据库 %s 已存在，跳过创建", db_name)
    finally:
        conn.close()


async def _is_fresh_database(conn: object) -> bool:
    """全新数据库判定：users 表不存在或表中没有任何用户。"""
    rows = await _query_all(
        conn,
        "SELECT COUNT(*) FROM information_schema.TABLES "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'",
    )
    if not rows or rows[0][0] == 0:
        return True
    rows = await _query_all(conn, "SELECT COUNT(*) FROM users")
    return not rows or rows[0][0] == 0


async def _execute_statements(conn: object, statements: list[str], phase: str) -> None:
    """逐条执行 SQL 语句；任一语句失败则中止并给出明确错误。"""
    cur = conn.cursor()
    try:
        for stmt in statements:
            try:
                await cur.execute(stmt)
                if cur.description is not None:
                    await cur.fetchall()
            except Exception as exc:
                preview = " ".join(stmt.split())[:120]
                raise RuntimeError(f"执行 init.sql {phase} 语句失败：{preview}") from exc
    finally:
        await cur.close()


async def init_database() -> None:
    """应用启动时调用：建库 -> 执行建表/兼容段 -> 全新库时写入演示数据。"""
    url = make_url(settings.DATABASE_URL)
    if url.drivername != "mysql+asyncmy" or not url.host:
        logger.warning("DATABASE_URL 不是 MySQL（%s），跳过自动建库与 init.sql", url.drivername)
        return

    db_name = url.database
    if not db_name:
        raise RuntimeError("DATABASE_URL 未指定数据库名，无法自动初始化")
    if not _IDENTIFIER_RE.match(db_name):
        raise RuntimeError(f"数据库名非法：{db_name}")

    await _ensure_database(url, db_name)

    schema_statements, seed_statements = load_init_sql()
    conn = await _connect(url, database=db_name)
    try:
        await _execute_statements(conn, schema_statements, "建表/迁移")
        if await _is_fresh_database(conn):
            await _execute_statements(conn, seed_statements, "演示数据")
            logger.info(
                "init.sql 执行完成：建库、建表、演示数据（共 %d 条语句）",
                len(schema_statements) + len(seed_statements),
            )
        else:
            logger.info(
                "数据库已有用户数据，仅执行建表/迁移（%d 条语句），跳过演示数据",
                len(schema_statements),
            )
    finally:
        conn.close()
