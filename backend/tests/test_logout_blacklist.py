"""登出黑名单测试：登出后 token 应立即失效，无法再访问受保护接口。"""

from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

import app.services.auth_service as auth_service_module
import app.utils.deps as deps_module
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


async def _make_user(db: AsyncSession, role: str = "student", username: str = "s1") -> User:
    user = User(username=username, password_hash="x", role=role, name=role)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def _blacklist_redis(blacklisted: set) -> AsyncMock:
    """构造一个受控的 Redis mock：仅黑名单 key 返回命中，set 时登记入黑名单。"""
    redis_mock = AsyncMock()
    redis_mock.get = AsyncMock(
        side_effect=lambda key: "1" if key in blacklisted else None
    )
    redis_mock.set = AsyncMock(
        side_effect=lambda key, value, ex=None: blacklisted.add(key) or True
    )
    return redis_mock


@pytest.mark.asyncio
async def test_normal_token_accesses_protected_api(client, db: AsyncSession, monkeypatch):
    user = await _make_user(db)
    blacklisted: set = set()
    monkeypatch.setattr(deps_module, "redis_client", _blacklist_redis(blacklisted), raising=False)
    resp = await client.get("/api/records", headers=_auth_header(user))
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_logout_blacklists_token_and_rejects_next_request(
    client, db: AsyncSession, monkeypatch
):
    user = await _make_user(db)
    blacklisted: set = set()
    redis_mock = _blacklist_redis(blacklisted)
    monkeypatch.setattr(deps_module, "redis_client", redis_mock, raising=False)
    monkeypatch.setattr(auth_service_module, "redis_client", redis_mock, raising=False)

    token = create_access_token({"sub": str(user.id), "role": user.role})
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post("/api/auth/logout", headers=headers)
    assert resp.status_code == 200
    assert len(blacklisted) == 1

    resp = await client.get("/api/records", headers=headers)
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_blacklisted_token_rejected_even_with_valid_signature(
    client, db: AsyncSession, monkeypatch
):
    user = await _make_user(db)
    blacklisted: set = set()
    redis_mock = _blacklist_redis(blacklisted)
    monkeypatch.setattr(deps_module, "redis_client", redis_mock, raising=False)

    token = create_access_token({"sub": str(user.id), "role": user.role})
    blacklisted.add(f"blacklist:token:{token}")

    resp = await client.get("/api/records", headers=_auth_header(user))
    assert resp.status_code == 401
