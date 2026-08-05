import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.exam_record import ExamRecord
from app.models.question import Question
from app.models.user import User
from app.services.exam_service import create_exam
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


async def _make_submitted_record(db: AsyncSession, student: User, owner: User) -> ExamRecord:
    from datetime import datetime
    exam = await create_exam(db, {
        "title": "考试", "course_id": 1,
        "start_time": datetime(2026, 8, 10, 10, 0, 0),
        "end_time": datetime(2026, 8, 10, 12, 0, 0), "duration": 120,
        "status": "published",
    })
    db.add(Question(exam_id=exam.id, type="essay", content="简述",
                    answer="要点", score=10, sort_order=1))
    record = ExamRecord(student_id=student.id, exam_id=exam.id,
                        start_time=datetime.now(), status="submitted",
                        score=7)
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


@pytest.mark.asyncio
async def test_student_can_view_own_result(client, db: AsyncSession):
    student = await _make_user(db, "student", "s1")
    record = await _make_submitted_record(db, student, student)
    resp = await client.get(f"/api/records/{record.id}/result", headers=_auth_header(student))
    assert resp.status_code == 200
    assert resp.json()["code"] == 200


@pytest.mark.asyncio
async def test_student_cannot_view_others_result(client, db: AsyncSession):
    student_a = await _make_user(db, "student", "sa")
    student_b = await _make_user(db, "student", "sb")
    record = await _make_submitted_record(db, student_a, student_a)
    resp = await client.get(f"/api/records/{record.id}/result", headers=_auth_header(student_b))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_student_cannot_view_ongoing_result(client, db: AsyncSession):
    from datetime import datetime
    student = await _make_user(db, "student", "s1")
    exam = await create_exam(db, {
        "title": "考试", "course_id": 1,
        "start_time": datetime(2026, 8, 10, 10, 0, 0),
        "end_time": datetime(2026, 8, 10, 12, 0, 0), "duration": 120,
        "status": "published",
    })
    record = ExamRecord(student_id=student.id, exam_id=exam.id,
                        start_time=datetime.now(), status="ongoing")
    db.add(record)
    await db.commit()
    await db.refresh(record)
    resp = await client.get(f"/api/records/{record.id}/result", headers=_auth_header(student))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_teacher_cannot_access_student_result(client, db: AsyncSession):
    student = await _make_user(db, "student", "s1")
    teacher = await _make_user(db, "teacher", "t1")
    record = await _make_submitted_record(db, student, student)
    resp = await client.get(f"/api/records/{record.id}/result", headers=_auth_header(teacher))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_result_omits_last_error(client, db: AsyncSession):
    student = await _make_user(db, "student", "s1")
    record = await _make_submitted_record(db, student, student)
    resp = await client.get(f"/api/records/{record.id}/result", headers=_auth_header(student))
    body = resp.json()
    for answer in body["data"]:
        assert "last_error" not in answer["ai_grading"]
