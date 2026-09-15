"""成绩分析聚合测试：逐题统计 + 学生分页（Task 8 TDD RED）。"""
import pytest
import pytest_asyncio
from datetime import datetime
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.answer import Answer
from app.models.course import Course
from app.models.exam import Exam
from app.models.exam_record import ExamRecord
from app.models.question import Question
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


async def _make_user(db: AsyncSession, role: str, username: str, **kw) -> User:
    user = User(username=username, password_hash="x", role=role, name=username, **kw)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def _seed_exam(db: AsyncSession):
    teacher = await _make_user(db, "teacher", "t_analytics")
    course = Course(name="数据结构", teacher_id=teacher.id)
    db.add(course)
    await db.commit()
    await db.refresh(course)
    await assign_subject_to_teacher(db, teacher.id, course.id)
    exam = Exam(
        course_id=course.id,
        title="期中考试",
        start_time=datetime(2026, 8, 10, 10, 0, 0),
        end_time=datetime(2026, 8, 10, 12, 0, 0),
        duration=120,
        total_score=100,
        pass_score=60,
        status="finished",
    )
    db.add(exam)
    await db.commit()
    await db.refresh(exam)
    q1 = Question(exam_id=exam.id, type="single", content="单选1", score=5, sort_order=1)
    q2 = Question(exam_id=exam.id, type="essay", content="简答1", score=10, sort_order=2)
    db.add_all([q1, q2])
    await db.commit()
    await db.refresh(q1)
    await db.refresh(q2)
    s1 = await _make_user(db, "student", "s_ana1")
    s2 = await _make_user(db, "student", "s_ana2")
    r1 = ExamRecord(student_id=s1.id, exam_id=exam.id, start_time=datetime(2026, 8, 10, 10, 0, 0),
                    submit_time=datetime(2026, 8, 10, 11, 0, 0), score=80, status="graded", switch_count=1)
    r2 = ExamRecord(student_id=s2.id, exam_id=exam.id, start_time=datetime(2026, 8, 10, 10, 0, 0),
                    submit_time=datetime(2026, 8, 10, 11, 5, 0), score=55, status="graded", switch_count=4)
    db.add_all([r1, r2])
    await db.commit()
    await db.refresh(r1)
    await db.refresh(r2)
    db.add_all([
        Answer(record_id=r1.id, question_id=q1.id, student_answer="A", score=5, is_correct=True, grading_source="teacher"),
        Answer(record_id=r1.id, question_id=q2.id, student_answer="要点", score=8, grading_source="teacher"),
        Answer(record_id=r2.id, question_id=q1.id, student_answer="B", score=0, is_correct=False, grading_source="teacher"),
        Answer(record_id=r2.id, question_id=q2.id, student_answer="略", score=5, grading_source="teacher"),
    ])
    await db.commit()
    return exam, teacher


@pytest.mark.asyncio
async def test_exam_questions_stats_200_and_shape(client, db: AsyncSession):
    exam, teacher = await _seed_exam(db)
    resp = await client.get(f"/api/statistics/exam/{exam.id}/questions", headers=_auth_header(teacher))
    assert resp.status_code == 200
    items = resp.json()["data"]
    assert isinstance(items, list)
    assert len(items) == 2
    for item in items:
        assert set(["question_id", "type", "avg_score", "correct_rate", "distribution"]) <= set(item.keys())


@pytest.mark.asyncio
async def test_exam_students_pagination_200(client, db: AsyncSession):
    exam, teacher = await _seed_exam(db)
    resp = await client.get(
        f"/api/statistics/exam/{exam.id}/students",
        params={"page": 1, "page_size": 10},
        headers=_auth_header(teacher),
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["total"] == 2
    assert len(data["items"]) == 2
    first = data["items"][0]
    assert set(["student", "score", "switch_count", "status", "rank"]) <= set(first.keys())
    # 80 分排第一
    assert first["score"] == 80
    assert first["rank"] == 1


@pytest.mark.asyncio
async def test_student_forbidden_on_analytics(client, db: AsyncSession):
    exam, _ = await _seed_exam(db)
    student = await _make_user(db, "student", "s_forbid")
    resp = await client.get(f"/api/statistics/exam/{exam.id}/questions", headers=_auth_header(student))
    assert resp.status_code == 403
    resp2 = await client.get(f"/api/statistics/exam/{exam.id}/students", headers=_auth_header(student))
    assert resp2.status_code == 403


@pytest.mark.asyncio
async def test_unassigned_teacher_forbidden_on_other_exam(client, db: AsyncSession):
    exam, _ = await _seed_exam(db)
    outsider = await _make_user(db, "teacher", "t_outsider")
    resp = await client.get(f"/api/statistics/exam/{exam.id}/questions", headers=_auth_header(outsider))
    assert resp.status_code == 403
    resp2 = await client.get(f"/api/statistics/exam/{exam.id}/students", headers=_auth_header(outsider))
    assert resp2.status_code == 403
