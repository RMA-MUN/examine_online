"""用户列表班级筛选测试：class_id > 0 筛班级、-1 筛未分配、缺省返回全部。"""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.user import User
from app.services.user_service import get_users
from app.utils.security import create_access_token


async def _make_user(db: AsyncSession, username: str, class_id=None) -> User:
    user = User(username=username, password_hash="x", role="student", name=username, class_id=class_id)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.mark.asyncio
async def test_get_users_filters_by_class_id(db: AsyncSession):
    await _make_user(db, "s1", class_id=1)
    await _make_user(db, "s2", class_id=1)
    await _make_user(db, "s3", class_id=2)
    users, total = await get_users(db, class_id=1)
    assert total == 2
    assert {u.username for u in users} == {"s1", "s2"}


@pytest.mark.asyncio
async def test_get_users_filters_unassigned_with_minus_one(db: AsyncSession):
    await _make_user(db, "s1", class_id=1)
    await _make_user(db, "s2")
    users, total = await get_users(db, class_id=-1)
    assert total == 1
    assert users[0].username == "s2"


@pytest.mark.asyncio
async def test_get_users_without_class_id_returns_all(db: AsyncSession):
    await _make_user(db, "s1", class_id=1)
    await _make_user(db, "s2")
    users, total = await get_users(db)
    assert total == 2


# ---- API 层 ----


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


@pytest.mark.asyncio
async def test_api_users_class_id_filter(client, db: AsyncSession):
    admin = User(username="admin1", password_hash="x", role="admin", name="A", class_id=2)
    db.add(admin)
    await db.commit()
    await db.refresh(admin)
    await _make_user(db, "s1", class_id=1)
    await _make_user(db, "s2")
    resp = await client.get("/api/users?class_id=1", headers=_auth_header(admin))
    assert resp.status_code == 200
    assert resp.json()["data"]["total"] == 1
    resp = await client.get("/api/users?class_id=-1", headers=_auth_header(admin))
    assert resp.json()["data"]["total"] == 1
    assert resp.json()["data"]["items"][0]["username"] == "s2"
