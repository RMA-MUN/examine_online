"""考试作答提交服务测试：交卷幂等性（记录已存在答案行时不冲突）。"""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select

from app.models.answer import Answer
from app.models.course import Course
from app.models.exam import Exam
from app.models.exam_record import ExamRecord
from app.models.question import Question
from app.models.user import User
from app.services.exam_student_service import submit_exam


@pytest.mark.asyncio
async def test_submit_exam_replaces_existing_answers_without_conflict(db):
    """进行中记录已存在答案行（占位答案/上次提交残留）时，交卷应替换而非报唯一键冲突。"""
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
        course_id=course.id,
        title="考试",
        start_time=datetime.now() - timedelta(minutes=10),
        end_time=datetime.now() + timedelta(minutes=20),
        duration=30,
        total_score=100,
        pass_score=60,
        status="ongoing",
    )
    db.add(exam)
    await db.flush()
    question = Question(
        exam_id=exam.id, type="single", content="1+1=?", options='["A","B"]', answer="A", score=10
    )
    db.add(question)
    await db.flush()
    record = ExamRecord(
        student_id=student.id,
        exam_id=exam.id,
        start_time=datetime.now() - timedelta(minutes=5),
        status="ongoing",
    )
    db.add(record)
    await db.flush()
    db.add(Answer(record_id=record.id, question_id=question.id, student_answer="B", score=0))
    await db.commit()

    with patch(
        "app.services.exam_student_service.redis_client", new=AsyncMock()
    ) as redis_mock:
        result, err = await submit_exam(db, exam.id, student.id, {str(question.id): "A"})

    assert result is not None and err is None
    assert result.status == "submitted"
    assert result.score == 10

    answers = (
        await db.execute(select(Answer).where(Answer.record_id == record.id))
    ).scalars().all()
    assert len(answers) == 1
    assert answers[0].student_answer == "A"
    assert answers[0].is_correct is True
