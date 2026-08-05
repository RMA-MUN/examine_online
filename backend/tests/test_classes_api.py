import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.user import User
from app.services.class_service import create_class
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


@pytest.mark.asyncio
async def test_teacher_can_list_classes(client, db: AsyncSession):
    await create_class(db, "一班")
    teacher = await _make_user(db, "teacher", "t1")
    resp = await client.get("/api/classes", headers=_auth_header(teacher))
    assert resp.status_code == 200
    assert resp.json()["data"]["total"] == 1
    assert resp.json()["data"]["items"][0]["name"] == "一班"


@pytest.mark.asyncio
async def test_admin_can_list_classes(client, db: AsyncSession):
    admin = await _make_user(db, "admin", "a1")
    resp = await client.get("/api/classes", headers=_auth_header(admin))
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_student_cannot_list_classes(client, db: AsyncSession):
    student = await _make_user(db, "student", "s1")
    resp = await client.get("/api/classes", headers=_auth_header(student))
    assert resp.status_code == 403
