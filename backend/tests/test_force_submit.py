"""P0 监考三件套测试（二）：教师对考试记录强制交卷。

TDD RED：被测端点 POST /api/records/{record_id}/force-submit 尚未实现，
本文件测试先行，预期全部失败（404 / 405）。
"""

from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.course import Course
from app.models.exam import Exam
from app.models.exam_record import ExamRecord
from app.models.user import User
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


async def _make_setup(db: AsyncSession):
    teacher = User(username="fs_t", password_hash="x", role="teacher", name="T")
    db.add(teacher)
    await db.flush()
    course = Course(name="数据结构与算法", teacher_id=teacher.id)
    db.add(course)
    await db.flush()
    exam = Exam(
        course_id=course.id,
        title="期中考试",
        start_time=datetime.now() - timedelta(minutes=10),
        end_time=datetime.now() + timedelta(minutes=60),
        duration=60,
        total_score=100,
        pass_score=60,
        status="ongoing",
    )
    db.add(exam)
    await db.flush()
    await assign_subject_to_teacher(db, teacher.id, course.id)
    student = User(username="fs_s", password_hash="x", role="student", name="S")
    db.add(student)
    await db.flush()
    record = ExamRecord(
        student_id=student.id,
        exam_id=exam.id,
        start_time=datetime.now() - timedelta(minutes=5),
        status="ongoing",
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return teacher, student, exam, record


@pytest.mark.asyncio
async def test_force_submit_ongoing_record(client, db: AsyncSession):
    teacher, _, _, record = await _make_setup(db)
    r = await client.post(
        f"/api/records/{record.id}/force-submit",
        headers=_auth_header(teacher),
    )
    assert r.status_code == 200
    assert r.json()["data"]["status"] == "submitted"
    await db.refresh(record)
    assert record.status == "submitted"
    assert record.submit_time is not None


@pytest.mark.asyncio
async def test_force_submit_missing_record_returns_404(client, db: AsyncSession):
    teacher, _, _, _ = await _make_setup(db)
    r = await client.post(
        "/api/records/999999/force-submit",
        headers=_auth_header(teacher),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_force_submit_requires_teacher_role(client, db: AsyncSession):
    _, student, _, record = await _make_setup(db)
    r = await client.post(
        f"/api/records/{record.id}/force-submit",
        headers=_auth_header(student),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_force_submit_is_idempotent(client, db: AsyncSession):
    teacher, _, _, record = await _make_setup(db)
    headers = _auth_header(teacher)
    first = await client.post(f"/api/records/{record.id}/force-submit", headers=headers)
    second = await client.post(f"/api/records/{record.id}/force-submit", headers=headers)
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["data"]["status"] == "submitted"
