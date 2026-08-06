"""阅卷定稿状态校验测试：仅已提交（submitted）的记录可定稿，进行中/已定稿不可重复操作。"""

from datetime import datetime

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.course import Course
from app.models.exam_record import ExamRecord
from app.models.user import User
from app.services.exam_service import create_exam
from app.services.teacher_subject_service import assign_subject_to_teacher
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


async def _make_teacher_and_record(db: AsyncSession, record_status: str) -> tuple[User, ExamRecord]:
    teacher = User(username="t1", password_hash="x", role="teacher", name="T")
    db.add(teacher)
    await db.flush()
    course = Course(name="高等数学", teacher_id=teacher.id)
    db.add(course)
    await db.flush()
    exam = await create_exam(db, {
        "title": "考试", "course_id": course.id,
        "start_time": datetime(2026, 8, 10, 10, 0, 0),
        "end_time": datetime(2026, 8, 10, 12, 0, 0), "duration": 120,
        "status": "published",
    })
    await assign_subject_to_teacher(db, teacher.id, course.id)
    student = User(username="s1", password_hash="x", role="student", name="S")
    db.add(student)
    await db.flush()
    record = ExamRecord(student_id=student.id, exam_id=exam.id,
                        start_time=datetime.now(), status=record_status)
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return teacher, record


@pytest.mark.asyncio
async def test_finalize_submitted_record_accepted(client, db: AsyncSession):
    teacher, record = await _make_teacher_and_record(db, "submitted")
    resp = await client.put(f"/api/records/{record.id}/finalize", headers=_auth_header(teacher))
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "graded"


@pytest.mark.asyncio
async def test_finalize_ongoing_record_rejected(client, db: AsyncSession):
    teacher, record = await _make_teacher_and_record(db, "ongoing")
    resp = await client.put(f"/api/records/{record.id}/finalize", headers=_auth_header(teacher))
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_finalize_graded_record_rejected(client, db: AsyncSession):
    teacher, record = await _make_teacher_and_record(db, "graded")
    resp = await client.put(f"/api/records/{record.id}/finalize", headers=_auth_header(teacher))
    assert resp.status_code == 400
