from datetime import datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exam import Exam
from app.models.exam_record import ExamRecord
from app.models.user import User
from app.schemas.exam import ExamResponse
from app.services.exam_service import create_exam, get_student_eligible_exams


async def _make_student(db: AsyncSession, username="s1") -> User:
    student = User(username=username, password_hash="x", role="student", name="学生")
    db.add(student)
    await db.commit()
    await db.refresh(student)
    return student


async def _make_exam(db: AsyncSession, title="考试", **kw) -> Exam:
    data = {
        "title": title, "course_id": 1,
        "start_time": datetime(2026, 8, 10, 10, 0, 0),
        "end_time": datetime(2026, 8, 10, 12, 0, 0), "duration": 120,
        "total_score": 100, "pass_score": 60,
    }
    data.update(kw)
    return await create_exam(db, data)


@pytest.mark.asyncio
async def test_student_exam_list_status_none_without_record(db: AsyncSession):
    student = await _make_student(db)
    exam = await _make_exam(db, status="published")
    exams, total = await get_student_eligible_exams(db, student.id)
    assert total == 1
    assert getattr(exams[0], "student_record_status", None) is None


@pytest.mark.asyncio
async def test_student_exam_list_status_ongoing(db: AsyncSession):
    student = await _make_student(db)
    exam = await _make_exam(db, status="published")
    db.add(ExamRecord(student_id=student.id, exam_id=exam.id,
                      start_time=datetime.now(), status="ongoing"))
    await db.commit()
    exams, _ = await get_student_eligible_exams(db, student.id)
    assert exams[0].student_record_status == "ongoing"


@pytest.mark.asyncio
async def test_student_exam_list_status_submitted(db: AsyncSession):
    student = await _make_student(db)
    exam = await _make_exam(db, status="published")
    db.add(ExamRecord(student_id=student.id, exam_id=exam.id,
                      start_time=datetime.now(), status="submitted"))
    await db.commit()
    exams, _ = await get_student_eligible_exams(db, student.id)
    assert exams[0].student_record_status == "submitted"


@pytest.mark.asyncio
async def test_exam_response_serializes_record_status(db: AsyncSession):
    student = await _make_student(db)
    exam = await _make_exam(db, status="published")
    db.add(ExamRecord(student_id=student.id, exam_id=exam.id,
                      start_time=datetime.now(), status="graded"))
    await db.commit()
    exams, _ = await get_student_eligible_exams(db, student.id)
    resp = ExamResponse.model_validate(exams[0])
    assert resp.student_record_status == "graded"
