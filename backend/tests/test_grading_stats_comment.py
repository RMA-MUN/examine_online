"""阅卷统计与评语透出测试。"""

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


async def _seed(db: AsyncSession):
    teacher = User(username="tg1", password_hash="x", role="teacher", name="T")
    db.add(teacher)
    await db.flush()
    course = Course(name="数学", teacher_id=teacher.id)
    db.add(course)
    await db.flush()
    exam = await create_exam(db, {
        "title": "考", "course_id": course.id,
        "start_time": datetime(2026, 8, 10, 10, 0, 0),
        "end_time": datetime(2026, 8, 10, 12, 0, 0), "duration": 120,
        "status": "published",
    })
    await assign_subject_to_teacher(db, teacher.id, course.id)
    student = User(username="st1", password_hash="x", role="student", name="S")
    db.add(student)
    await db.flush()
    record = ExamRecord(student_id=student.id, exam_id=exam.id,
                        start_time=datetime.now(), status="submitted")
    db.add(record)
    await db.flush()
    q = Question(exam_id=exam.id, type="essay", content="题", answer="答", score=10)
    db.add(q)
    await db.flush()
    ans = Answer(record_id=record.id, question_id=q.id, student_answer="作答")
    db.add(ans)
    await db.commit()
    return teacher, exam, ans


@pytest.mark.asyncio
async def test_grading_stats_shape(client, db: AsyncSession):
    teacher, exam, _ = await _seed(db)
    resp = await client.get(f"/api/exams/{exam.id}/grading-stats", headers=_auth_header(teacher))
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert (data["pending"], data["done"], data["total"]) == (1, 0, 1)
    assert data["avg_seconds_per_record"] is None
    assert data["consistency_rate"] is None


@pytest.mark.asyncio
async def test_grade_with_comment_roundtrip(client, db: AsyncSession):
    teacher, _, ans = await _seed(db)
    resp = await client.put(f"/api/answers/{ans.id}/grade",
                            json={"score": 8, "teacher_comment": "思路正确"},
                            headers=_auth_header(teacher))
    assert resp.status_code == 200
    await db.refresh(ans)
    assert ans.teacher_comment == "思路正确"


@pytest.mark.asyncio
async def test_record_answers_include_rubric(client, db: AsyncSession):
    teacher, _, ans = await _seed(db)
    question = await db.get(Question, ans.question_id)
    question.grading_rubric = [
        {"criterion_id": "c1", "criterion": "关键概念正确", "points": 6},
        {"criterion_id": "c2", "criterion": "表述规范", "points": 4},
    ]
    await db.commit()
    record_id = ans.record_id
    resp = await client.get(f"/api/records/{record_id}/answers", headers=_auth_header(teacher))
    assert resp.status_code == 200
    item = [a for a in resp.json()["data"] if a["id"] == ans.id][0]
    assert item["question"]["grading_rubric"] == [
        {"criterion_id": "c1", "criterion": "关键概念正确", "points": 6},
        {"criterion_id": "c2", "criterion": "表述规范", "points": 4},
    ]


@pytest.mark.asyncio
async def test_student_result_strips_rubric_but_teacher_keeps(client, db: AsyncSession):
    teacher, exam, ans = await _seed(db)
    question = await db.get(Question, ans.question_id)
    question.grading_rubric = [
        {"criterion_id": "c1", "criterion": "关键概念正确", "points": 6},
        {"criterion_id": "c2", "criterion": "表述规范", "points": 4},
    ]
    await db.commit()
    record_id = ans.record_id
    record = await db.get(ExamRecord, record_id)
    from sqlalchemy import select
    from app.models.user import User as UserModel
    res = await db.execute(select(UserModel).where(UserModel.username == "st1"))
    student = res.scalar_one()
    # 学生端：无 rubric
    resp = await client.get(f"/api/records/{record_id}/result", headers=_auth_header(student))
    assert resp.status_code == 200
    item = [a for a in resp.json()["data"] if a["id"] == ans.id][0]
    assert item["question"]["grading_rubric"] is None
    # 教师端：保留 rubric
    resp = await client.get(f"/api/records/{record_id}/answers", headers=_auth_header(teacher))
    assert resp.status_code == 200
    item = [a for a in resp.json()["data"] if a["id"] == ans.id][0]
    assert item["question"]["grading_rubric"] is not None


@pytest.mark.asyncio
async def test_grading_stats_nonexistent_exam_404(client, db: AsyncSession):
    teacher, _, _ = await _seed(db)
    resp = await client.get("/api/exams/999999/grading-stats", headers=_auth_header(teacher))
    assert resp.status_code == 404
