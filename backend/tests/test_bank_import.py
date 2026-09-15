"""Task 3: 题库独立导入测试 — POST /api/bank/questions/import-file（multipart），复用 exam 导入解析。"""

import io

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.user import User
from app.utils.security import create_access_token


@pytest_asyncio.fixture
async def client(db: AsyncSession):
    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


def _auth_header(user: User) -> dict:
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return {"Authorization": f"Bearer {token}"}


async def _make_user(db: AsyncSession, role: str, username: str) -> User:
    user = User(username=username, password_hash="x", role=role, name=role)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def _make_bank_xlsx_bytes() -> bytes:
    import openpyxl

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["题型", "题目内容", "选项", "答案", "分值", "解析"])
    ws.append(["单选", "下列关于线性表的叙述中，正确的是？", "A.顺序存储插入无需移动\nB.链式存储可随机访问\nC.顺序支持随机访问\nD.空间开销相同", "C", "5", ""])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.mark.asyncio
async def test_bank_import_file(client, db: AsyncSession):
    teacher = await _make_user(db, "teacher", "bank_imp_t")
    files = {
        "file": (
            "bank.xlsx",
            _make_bank_xlsx_bytes(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    }
    r = await client.post("/api/bank/questions/import-file", files=files, headers=_auth_header(teacher))
    assert r.status_code in (200, 201)
    payload = r.json()["data"]
    count = payload.get("count", payload.get("imported_count"))
    assert count == 1

    # 落盘校验：题库列表应包含新题（exam_id 为空的题库题）
    r = await client.get("/api/bank/questions", headers=_auth_header(teacher))
    assert r.status_code == 200
    contents = [q["content"] for q in r.json()["data"]["items"]]
    assert "下列关于线性表的叙述中，正确的是？" in contents


@pytest.mark.asyncio
async def test_bank_import_requires_teacher(client, db: AsyncSession):
    student = await _make_user(db, "student", "bank_imp_s")
    files = {
        "file": (
            "bank.xlsx",
            _make_bank_xlsx_bytes(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    }
    r = await client.post("/api/bank/questions/import-file", files=files, headers=_auth_header(student))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_bank_import_rejects_bad_extension(client, db: AsyncSession):
    teacher = await _make_user(db, "teacher", "bank_imp_t2")
    files = {"file": ("bank.txt", b"not a workbook", "text/plain")}
    r = await client.post("/api/bank/questions/import-file", files=files, headers=_auth_header(teacher))
    assert r.status_code == 400


def _make_bank_xlsx_bytes_with_bad_row() -> bytes:
    import openpyxl

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["题型", "题目内容", "选项", "答案", "分值", "解析"])
    # 第 2 行：非法题型，解析必须失败且不落盘
    ws.append(["问答题", "这是什么？", "", "不知道", "5", ""])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.mark.asyncio
async def test_bank_import_parse_error_returns_http_400(client, db: AsyncSession):
    """解析失败必须回 HTTP 400（而非装饰器的 201），且不写入任何题库题。"""
    teacher = await _make_user(db, "teacher", "bank_imp_t3")
    files = {
        "file": (
            "bank.xlsx",
            _make_bank_xlsx_bytes_with_bad_row(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    }
    r = await client.post("/api/bank/questions/import-file", files=files, headers=_auth_header(teacher))
    assert r.status_code == 400
    body = r.json()
    assert body["code"] == 400
    errors = body["data"]["errors"]
    assert len(errors) == 1 and errors[0]["row"] == 2

    r = await client.get("/api/bank/questions", headers=_auth_header(teacher))
    assert r.status_code == 200
    assert r.json()["data"]["total"] == 0
