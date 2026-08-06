"""班级学生批量管理测试：可用学生列表、批量加入/移除、跨班保护。"""

from datetime import datetime

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.class_ import SchoolClass
from app.models.user import User
from app.services.class_service import (
    add_students_to_class, get_available_students, remove_students_from_class,
)
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


async def _make_class(db: AsyncSession, name="计科2401") -> SchoolClass:
    cls = SchoolClass(name=name)
    db.add(cls)
    await db.commit()
    await db.refresh(cls)
    return cls


async def _make_user(db: AsyncSession, username: str, role="student", class_id=None) -> User:
    user = User(username=username, password_hash="x", role=role, name=username, class_id=class_id)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.mark.asyncio
async def test_get_available_students_only_unassigned(db: AsyncSession):
    cls = await _make_class(db)
    await _make_user(db, "s1", class_id=cls.id)
    await _make_user(db, "s2")
    available = await get_available_students(db)
    assert [u.username for u in available] == ["s2"]


@pytest.mark.asyncio
async def test_add_students_skips_invalid_and_non_student(db: AsyncSession):
    cls = await _make_class(db)
    s1 = await _make_user(db, "s1")
    t1 = await _make_user(db, "t1", role="teacher")
    updated = await add_students_to_class(db, cls.id, [s1.id, t1.id, 9999])
    assert updated == 1
    await db.refresh(s1)
    assert s1.class_id == cls.id


@pytest.mark.asyncio
async def test_remove_students_only_affects_this_class(db: AsyncSession):
    cls_a = await _make_class(db, "A班")
    cls_b = await _make_class(db, "B班")
    s1 = await _make_user(db, "s1", class_id=cls_a.id)
    s2 = await _make_user(db, "s2", class_id=cls_b.id)
    updated = await remove_students_from_class(db, cls_a.id, [s1.id, s2.id])
    assert updated == 1
    await db.refresh(s1)
    await db.refresh(s2)
    assert s1.class_id is None
    assert s2.class_id == cls_b.id


@pytest.mark.asyncio
async def test_api_batch_add_and_remove(client, db: AsyncSession):
    admin = await _make_user(db, "admin1", role="admin")
    cls = await _make_class(db)
    s1 = await _make_user(db, "s1")
    s2 = await _make_user(db, "s2")

    resp = await client.post(
        f"/api/admin/classes/{cls.id}/students/batch",
        json={"action": "add", "student_ids": [s1.id, s2.id]},
        headers=_auth_header(admin),
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["updated"] == 2

    resp = await client.post(
        f"/api/admin/classes/{cls.id}/students/batch",
        json={"action": "remove", "student_ids": [s1.id]},
        headers=_auth_header(admin),
    )
    assert resp.json()["data"]["updated"] == 1

    resp = await client.get(f"/api/admin/classes/{cls.id}/students", headers=_auth_header(admin))
    assert [s["username"] for s in resp.json()["data"]] == ["s2"]


@pytest.mark.asyncio
async def test_api_available_students(client, db: AsyncSession):
    admin = await _make_user(db, "admin1", role="admin")
    cls = await _make_class(db)
    await _make_user(db, "s1", class_id=cls.id)
    await _make_user(db, "s2")
    resp = await client.get(f"/api/admin/classes/{cls.id}/available-students", headers=_auth_header(admin))
    assert resp.status_code == 200
    assert [s["username"] for s in resp.json()["data"]] == ["s2"]


@pytest.mark.asyncio
async def test_api_batch_rejects_missing_class(client, db: AsyncSession):
    admin = await _make_user(db, "admin1", role="admin")
    resp = await client.post(
        "/api/admin/classes/9999/students/batch",
        json={"action": "add", "student_ids": [1]},
        headers=_auth_header(admin),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_api_batch_rejects_non_admin(client, db: AsyncSession):
    teacher = await _make_user(db, "t1", role="teacher")
    cls = await _make_class(db)
    resp = await client.post(
        f"/api/admin/classes/{cls.id}/students/batch",
        json={"action": "add", "student_ids": [1]},
        headers=_auth_header(teacher),
    )
    assert resp.status_code == 403
