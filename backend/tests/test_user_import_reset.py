"""用户导入与重置密码测试。"""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.user import User
from app.services.user_service import batch_import_users, reset_password
from app.utils.security import create_access_token, verify_password_async


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
async def test_batch_import_partial_success(db: AsyncSession):
    ok, errors = await batch_import_users(db, [
        {"username": "u1", "password": "Password123!", "name": "甲", "role": "student"},
        {"username": "u1", "password": "Password123!", "name": "重复", "role": "student"},
        {"username": "u2", "password": "123", "name": "短密码", "role": "student"},
    ])
    assert ok == 1
    assert {e["row"] for e in errors} == {3, 4}


@pytest.mark.asyncio
async def test_reset_password_flow(client, db: AsyncSession):
    admin = User(username="adm2", password_hash="x", role="admin", name="A")
    stu = User(username="stu9", password_hash="x", role="student", name="S")
    db.add_all([admin, stu])
    await db.commit()
    resp = await client.post(f"/api/users/{stu.id}/reset-password",
                             json={"new_password": "Newpass123!"},
                             headers=_auth_header(admin))
    assert resp.status_code == 200
    await db.refresh(stu)
    assert await verify_password_async("Newpass123!", stu.password_hash)


@pytest.mark.asyncio
async def test_reset_password_missing_user_404(client, db: AsyncSession):
    admin = User(username="adm3", password_hash="x", role="admin", name="A")
    db.add(admin)
    await db.commit()
    resp = await client.post("/api/users/999999/reset-password",
                             json={"new_password": "Newpass123!"},
                             headers=_auth_header(admin))
    assert resp.status_code == 404
