"""P0 监考三件套测试（一）：教师处置监控事件（警告 / 标记正常）。

TDD RED：被测端点 PATCH /api/exams/{exam_id}/events/{event_id}/handle 尚未实现，
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
from app.models.monitor_event import MonitorEvent
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
    teacher = User(username="hdl_t", password_hash="x", role="teacher", name="T")
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
    student = User(username="hdl_s", password_hash="x", role="student", name="S")
    db.add(student)
    await db.flush()
    record = ExamRecord(
        student_id=student.id,
        exam_id=exam.id,
        start_time=datetime.now() - timedelta(minutes=5),
        status="ongoing",
    )
    db.add(record)
    await db.flush()
    event = MonitorEvent(
        exam_id=exam.id,
        record_id=record.id,
        student_id=student.id,
        event_type="switch",
        detail={"seconds": 5},
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return teacher, student, exam, record, event


@pytest.mark.asyncio
async def test_handle_event_marks_warn(client, db: AsyncSession):
    teacher, _, exam, _, event = await _make_setup(db)
    r = await client.patch(
        f"/api/exams/{exam.id}/events/{event.id}/handle",
        json={"action": "warn"},
        headers=_auth_header(teacher),
    )
    assert r.status_code == 200
    assert r.json()["data"]["handled_action"] == "warn"
    assert r.json()["data"]["handled_by"] == teacher.id


@pytest.mark.asyncio
async def test_handle_event_marks_normal(client, db: AsyncSession):
    teacher, _, exam, _, event = await _make_setup(db)
    r = await client.patch(
        f"/api/exams/{exam.id}/events/{event.id}/handle",
        json={"action": "normal"},
        headers=_auth_header(teacher),
    )
    assert r.status_code == 200
    assert r.json()["data"]["handled_action"] == "normal"


@pytest.mark.asyncio
async def test_handle_event_exam_mismatch_returns_404(client, db: AsyncSession):
    teacher, _, exam, _, event = await _make_setup(db)
    other_exam = Exam(
        course_id=exam.course_id,
        title="另一场考试",
        start_time=datetime.now() - timedelta(minutes=10),
        end_time=datetime.now() + timedelta(minutes=60),
        duration=60,
        total_score=100,
        pass_score=60,
        status="ongoing",
    )
    db.add(other_exam)
    await db.commit()
    # 事件属于 exam，却以 other_exam（教师同样有管理权）的路径处置 → 404
    r = await client.patch(
        f"/api/exams/{other_exam.id}/events/{event.id}/handle",
        json={"action": "warn"},
        headers=_auth_header(teacher),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_handle_event_missing_returns_404(client, db: AsyncSession):
    teacher, _, exam, _, _ = await _make_setup(db)
    r = await client.patch(
        f"/api/exams/{exam.id}/events/999999/handle",
        json={"action": "warn"},
        headers=_auth_header(teacher),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_handle_event_requires_teacher_role(client, db: AsyncSession):
    _, student, exam, _, event = await _make_setup(db)
    r = await client.patch(
        f"/api/exams/{exam.id}/events/{event.id}/handle",
        json={"action": "warn"},
        headers=_auth_header(student),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_handle_event_rejects_invalid_action(client, db: AsyncSession):
    teacher, _, exam, _, event = await _make_setup(db)
    r = await client.patch(
        f"/api/exams/{exam.id}/events/{event.id}/handle",
        json={"action": "ban"},
        headers=_auth_header(teacher),
    )
    assert r.status_code == 422
