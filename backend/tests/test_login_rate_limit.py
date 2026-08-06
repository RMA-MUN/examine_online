"""登录限流测试：连续失败达到阈值后锁定 IP，防止暴力破解。"""

from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

import app.api.auth as auth_module
from app.database import get_db
from app.main import app
from app.models.user import User
from app.utils.security import hash_password_async


@pytest_asyncio.fixture
async def client(db: AsyncSession):
    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


class _FakeRedis:
    """可控的 Redis 假实现：fail/expire/delete 计数器落在一个简单字典上。"""

    def __init__(self):
        self.values: dict = {}
        self.lock_on: int | None = None

    async def get(self, key):
        return self.values.get(key)

    async def set(self, key, value, ex=None):
        self.values[key] = value

    async def delete(self, key):
        self.values.pop(key, None)

    async def expire(self, key, ttl):
        pass

    async def incr(self, key):
        current = int(self.values.get(key, 0) or 0) + 1
        self.values[key] = str(current)
        if self.lock_on is not None and current >= self.lock_on:
            self.values[f"login:lock:{key.rsplit(':', 1)[-1]}"] = "1"
        return current


async def _make_user_with_password(db: AsyncSession, username="s1", password="secret123"):
    user = User(username=username, password_hash=await hash_password_async(password),
                role="student", name="学生")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def _patch_redis(monkeypatch, fake: _FakeRedis):
    monkeypatch.setattr(auth_module, "redis_client", fake, raising=False)


@pytest.mark.asyncio
async def test_wrong_password_returns_401(client, db: AsyncSession, monkeypatch):
    await _make_user_with_password(db)
    fake = _FakeRedis()
    _patch_redis(monkeypatch, fake)
    resp = await client.post("/api/auth/login", json={"username": "s1", "password": "wrong"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_failed_attempts_below_limit_still_allows_login(client, db: AsyncSession, monkeypatch):
    await _make_user_with_password(db)
    fake = _FakeRedis()
    fake.lock_on = 5
    _patch_redis(monkeypatch, fake)
    for _ in range(4):
        resp = await client.post("/api/auth/login", json={"username": "s1", "password": "wrong"})
        assert resp.status_code == 401
    resp = await client.post("/api/auth/login", json={"username": "s1", "password": "secret123"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_lockout_after_max_failures(client, db: AsyncSession, monkeypatch):
    await _make_user_with_password(db)
    fake = _FakeRedis()
    fake.lock_on = 5
    _patch_redis(monkeypatch, fake)
    for _ in range(5):
        await client.post("/api/auth/login", json={"username": "s1", "password": "wrong"})
    resp = await client.post("/api/auth/login", json={"username": "s1", "password": "wrong"})
    assert resp.status_code == 429


@pytest.mark.asyncio
async def test_locked_ip_rejected_even_with_correct_password(client, db: AsyncSession, monkeypatch):
    await _make_user_with_password(db)
    fake = _FakeRedis()
    fake.lock_on = 5
    _patch_redis(monkeypatch, fake)
    for _ in range(5):
        await client.post("/api/auth/login", json={"username": "s1", "password": "wrong"})
    resp = await client.post("/api/auth/login", json={"username": "s1", "password": "secret123"})
    assert resp.status_code == 429


@pytest.mark.asyncio
async def test_successful_login_clears_failure_count(client, db: AsyncSession, monkeypatch):
    await _make_user_with_password(db)
    fake = _FakeRedis()
    fake.lock_on = 5
    _patch_redis(monkeypatch, fake)
    for _ in range(3):
        await client.post("/api/auth/login", json={"username": "s1", "password": "wrong"})
    await client.post("/api/auth/login", json={"username": "s1", "password": "secret123"})
    assert fake.values.get("login:fail:testclient") is None
