"""系统管理接口测试：审计日志分页与系统参数读写鉴权。"""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.system_param import SystemParam
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


async def _make_admin(db: AsyncSession) -> User:
    admin = User(username="adm1", password_hash="x", role="admin", name="A")
    db.add(admin)
    await db.commit()
    await db.refresh(admin)
    return admin


@pytest.mark.asyncio
async def test_logs_empty_page(client, db: AsyncSession):
    admin = await _make_admin(db)
    resp = await client.get("/api/admin/logs", headers=_auth_header(admin))
    assert resp.status_code == 200
    assert resp.json()["data"]["total"] == 0


@pytest.mark.asyncio
async def test_params_roundtrip(client, db: AsyncSession):
    admin = await _make_admin(db)
    # NOTE decision (Step-1 option a): sqlite create_all does not run init.sql
    # seeds, so seed default.duration explicitly before GET.
    db.add(SystemParam(key="default.duration", value="120"))
    await db.commit()
    resp = await client.get("/api/admin/params", headers=_auth_header(admin))
    assert resp.status_code == 200
    assert resp.json()["data"]["default.duration"] == "120"
    resp = await client.put("/api/admin/params", json={"items": {"default.duration": "90"}},
                            headers=_auth_header(admin))
    assert resp.status_code == 200
    assert resp.json()["data"]["default.duration"] == "90"


@pytest.mark.asyncio
async def test_params_unknown_key_rejected(client, db: AsyncSession):
    admin = await _make_admin(db)
    resp = await client.put("/api/admin/params", json={"items": {"nope.key": "1"}},
                            headers=_auth_header(admin))
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_logs_forbidden_for_teacher(client, db: AsyncSession):
    teacher = User(username="t9", password_hash="x", role="teacher", name="T")
    db.add(teacher)
    await db.commit()
    resp = await client.get("/api/admin/logs", headers=_auth_header(teacher))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_exam_create_writes_audit_log(client, db: AsyncSession):
    from app.models.course import Course
    admin = await _make_admin(db)
    teacher = User(username="audit_t", password_hash="x", role="teacher", name="T")
    db.add(teacher)
    await db.flush()
    course = Course(name="审计课", teacher_id=teacher.id)
    db.add(course)
    await db.commit()
    await db.refresh(course)
    resp = await client.post("/api/exams", json={
        "title": "审计考试", "course_id": course.id,
        "start_time": "2026-08-10T10:00:00", "end_time": "2026-08-10T12:00:00",
        "duration": 120,
    }, headers=_auth_header(admin))
    assert resp.status_code == 200
    exam_id = resp.json()["data"]["id"]
    resp = await client.get("/api/admin/logs", params={"type": "exam."},
                            headers=_auth_header(admin))
    assert resp.status_code == 200
    items = resp.json()["data"]["items"]
    assert any(i["action"] == "exam.create" and i["target_id"] == exam_id
               and i["target_type"] == "exam" for i in items)
