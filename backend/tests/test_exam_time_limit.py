"""考试作答时长限制测试：保存/交卷超过 start_time + duration 必须被拒绝，防超时作弊。"""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.exam import Exam
from app.models.exam_record import ExamRecord
from app.models.user import User
from app.services.exam_student_service import save_answers, submit_exam


async def _make_exam_with_record(
    db: AsyncSession,
    start_minutes_ago: int,
    duration_minutes: int,
) -> tuple[Exam, User, ExamRecord]:
    teacher = User(username="t1", password_hash="x", role="teacher", name="T")
    db.add(teacher)
    await db.flush()
    course = Course(name="课程", teacher_id=teacher.id)
    db.add(course)
    await db.flush()
    student = User(username="s1", password_hash="x", role="student", name="S")
    db.add(student)
    await db.flush()
    exam = Exam(
        course_id=course.id, title="考试",
        start_time=datetime.now() - timedelta(minutes=start_minutes_ago),
        end_time=datetime.now() + timedelta(minutes=60),
        duration=duration_minutes, total_score=100, pass_score=60,
        status="ongoing",
    )
    db.add(exam)
    await db.flush()
    record = ExamRecord(
        student_id=student.id, exam_id=exam.id,
        start_time=datetime.now() - timedelta(minutes=start_minutes_ago),
        status="ongoing",
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return exam, student, record


@pytest.mark.asyncio
async def test_save_answers_allowed_within_duration(db: AsyncSession):
    exam, student, _ = await _make_exam_with_record(db, start_minutes_ago=10, duration_minutes=30)
    with patch("app.services.exam_student_service.redis_client", new=AsyncMock()) as redis_mock:
        success, error = await save_answers(db, exam.id, student.id, {"1": "A"})
    assert success is True
    assert error is None
    redis_mock.set.assert_awaited_once()


@pytest.mark.asyncio
async def test_save_answers_rejected_after_duration_elapsed(db: AsyncSession):
    exam, student, _ = await _make_exam_with_record(db, start_minutes_ago=40, duration_minutes=30)
    with patch("app.services.exam_student_service.redis_client", new=AsyncMock()) as redis_mock:
        success, error = await save_answers(db, exam.id, student.id, {"1": "A"})
    assert success is False
    assert error is not None
    redis_mock.set.assert_not_awaited()


@pytest.mark.asyncio
async def test_submit_exam_allowed_within_duration(db: AsyncSession):
    exam, student, _ = await _make_exam_with_record(db, start_minutes_ago=10, duration_minutes=30)
    with patch("app.services.exam_student_service.redis_client", new=AsyncMock()):
        record, error = await submit_exam(db, exam.id, student.id, {"1": "A"})
    assert record is not None and error is None
    assert record.status == "submitted"


@pytest.mark.asyncio
async def test_submit_exam_rejected_after_duration_elapsed(db: AsyncSession):
    exam, student, record = await _make_exam_with_record(
        db, start_minutes_ago=40, duration_minutes=30
    )
    with patch("app.services.exam_student_service.redis_client", new=AsyncMock()):
        result, error = await submit_exam(db, exam.id, student.id, {"1": "A"})
    assert result is None
    assert error is not None
    await db.refresh(record)
    assert record.status == "ongoing"
