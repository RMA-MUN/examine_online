"""db_init 模块测试：验证 init.sql 的解析与分段逻辑。"""

import pytest

from app.db_init import _parse_sql, load_init_sql

FAKE_SQL = """-- 头注释
CREATE DATABASE IF NOT EXISTS exam_system CHARACTER SET utf8mb4;
USE exam_system;

CREATE TABLE IF NOT EXISTS users (
    id INT NOT NULL AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL,
    PRIMARY KEY (id)
);

-- ==== 演示数据（SEED） ====

START TRANSACTION;
INSERT INTO users (username) VALUES ('demo');
COMMIT;
"""


class TestParseSql:
    def test_schema_and_seed_split(self):
        schema, seed = _parse_sql(FAKE_SQL)
        assert schema == [
            "CREATE TABLE IF NOT EXISTS users (\n    id INT NOT NULL AUTO_INCREMENT,\n    username VARCHAR(50) NOT NULL,\n    PRIMARY KEY (id)\n)"
        ]
        assert seed == [
            "START TRANSACTION",
            "INSERT INTO users (username) VALUES ('demo')",
            "COMMIT",
        ]

    def test_create_database_and_use_are_filtered(self):
        schema, _ = _parse_sql(FAKE_SQL)
        assert not any(s.upper().startswith(("CREATE DATABASE", "USE ")) for s in schema)

    def test_comments_and_blank_statements_removed(self):
        schema, seed = _parse_sql("-- 只有注释\n\n\n; -- 空语句\n;\nSELECT 1;\n")
        assert schema == ["SELECT 1"]
        assert seed == []

    def test_without_seed_marker_returns_empty_seed(self):
        schema, seed = _parse_sql("SELECT 1;")
        assert schema == ["SELECT 1"]
        assert seed == []


class TestLoadInitSql:
    def test_real_init_sql_exists_and_loads(self):
        schema, seed = load_init_sql()
        assert len(schema) > 50
        assert len(seed) > 20

    def test_all_tables_created(self):
        schema, _ = load_init_sql()
        ddl = "\n".join(schema)
        for table in (
            "classes",
            "users",
            "courses",
            "teacher_subjects",
            "exams",
            "questions",
            "exam_records",
            "answers",
            "exam_classes",
            "exam_students",
            "ai_grading_tasks",
        ):
            assert f"CREATE TABLE IF NOT EXISTS {table}" in ddl, table

    def test_schema_includes_ai_columns_and_migrations(self):
        schema, _ = load_init_sql()
        ddl = "\n".join(schema)
        for column in (
            "grading_rubric",
            "ai_score",
            "ai_feedback",
            "ai_model",
            "ai_graded_at",
            "grading_source",
            "override_reason",
            "class_id",
        ):
            assert column in ddl, column

    def test_statements_contain_no_embedded_semicolons(self):
        """解析后的每条语句内部不应再出现 ';'，保证可逐条执行。"""
        schema, seed = load_init_sql()
        for stmt in schema + seed:
            assert ";" not in stmt, f"语句内残留分号：{stmt[:80]}"

    def test_seed_phase_is_transactional(self):
        _, seed = load_init_sql()
        joined = "\n".join(seed)
        assert joined.startswith("START TRANSACTION")
        assert "COMMIT" in joined
