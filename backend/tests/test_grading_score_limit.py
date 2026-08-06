"""阅卷评分上限测试：教师评分必须在 0 到题目分值之间，防止总分失真。"""

from datetime import datetime

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.answer import Answer
from app.models.course import Course
from app.models.exam_record import ExamRecord
from app.models.question import Question
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


async def _make_gradable(db: AsyncSession, question_score: int = 10):
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
    question = Question(exam_id=exam.id, type="essay", content="简述",
                        answer="要点", score=question_score, sort_order=1)
    db.add(question)
    await db.flush()
    record = ExamRecord(student_id=student.id, exam_id=exam.id,
                        start_time=datetime.now(), status="submitted")
    db.add(record)
    await db.flush()
    answer = Answer(record_id=record.id, question_id=question.id,
                    student_answer="要点", score=0)
    db.add(answer)
    await db.commit()
    await db.refresh(answer)
    return teacher, answer, question


@pytest.mark.asyncio
async def test_grade_over_question_score_rejected(client, db: AsyncSession):
    teacher, answer, question = await _make_gradable(db, question_score=10)
    resp = await client.put(f"/api/answers/{answer.id}/grade",
                            json={"score": 11}, headers=_auth_header(teacher))
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_grade_negative_score_rejected(client, db: AsyncSession):
    teacher, answer, _ = await _make_gradable(db)
    resp = await client.put(f"/api/answers/{answer.id}/grade",
                            json={"score": -1}, headers=_auth_header(teacher))
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_grade_zero_score_accepted(client, db: AsyncSession):
    teacher, answer, _ = await _make_gradable(db)
    resp = await client.put(f"/api/answers/{answer.id}/grade",
                            json={"score": 0}, headers=_auth_header(teacher))
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_grade_within_question_score_accepted(client, db: AsyncSession):
    teacher, answer, question = await _make_gradable(db, question_score=10)
    resp = await client.put(f"/api/answers/{answer.id}/grade",
                            json={"score": 8}, headers=_auth_header(teacher))
    assert resp.status_code == 200
    assert resp.json()["data"]["score"] == 8
