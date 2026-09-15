"""题库与组卷测试：bank 列表/新建/from-bank 复制，学生无权限。"""

from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.course import Course
from app.models.exam import Exam
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
    teacher = User(username="bank_t", password_hash="x", role="teacher", name="T")
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
    student = User(username="bank_s", password_hash="x", role="student", name="S")
    db.add(student)
    await db.flush()
    await db.commit()
    return teacher, student, course, exam


@pytest.mark.asyncio
async def test_bank_create_and_list(client, db: AsyncSession):
    teacher, _, course, _ = await _make_setup(db)
    resp = await client.post(
        "/api/bank/questions",
        json={
            "type": "single",
            "content": "下列关于线性表的叙述中，正确的是？",
            "options": ["A", "B", "C", "D"],
            "answer": "C",
            "score": 5,
            "course_id": course.id,
            "difficulty": "medium",
            "tags": ["线性表"],
        },
        headers=_auth_header(teacher),
    )
    assert resp.status_code in (200, 201)
    bank_id = resp.json()["data"]["id"]
    assert resp.json()["data"]["exam_id"] is None

    resp = await client.get("/api/bank/questions", headers=_auth_header(teacher))
    assert resp.status_code == 200
    assert resp.json()["data"]["total"] >= 1
    ids = [q["id"] for q in resp.json()["data"]["items"]]
    assert bank_id in ids


@pytest.mark.asyncio
async def test_from_bank_copies_with_source_ref(client, db: AsyncSession):
    teacher, _, course, exam = await _make_setup(db)
    resp = await client.post(
        "/api/bank/questions",
        json={
            "type": "single",
            "content": "快速排序最坏时间复杂度为？",
            "options": ["O(n log n)", "O(n^2)", "O(n)", "O(log n)"],
            "answer": "B",
            "score": 5,
            "course_id": course.id,
            "difficulty": "hard",
        },
        headers=_auth_header(teacher),
    )
    assert resp.status_code in (200, 201)
    bank_id = resp.json()["data"]["id"]

    resp = await client.post(
        f"/api/exams/{exam.id}/questions/from-bank",
        json={"bank_ids": [bank_id]},
        headers=_auth_header(teacher),
    )
    assert resp.status_code in (200, 201)
    items = resp.json()["data"]
    assert len(items) == 1
    assert items[0]["exam_id"] == exam.id
    assert items[0]["source_question_id"] == bank_id


@pytest.mark.asyncio
async def test_student_cannot_access_bank(client, db: AsyncSession):
    _, student, _, _ = await _make_setup(db)
    resp = await client.get("/api/bank/questions", headers=_auth_header(student))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_from_bank_rejects_other_subject_item(client, db: AsyncSession):
    teacher, _, _, exam = await _make_setup(db)
    other = User(username="bank_t2", password_hash="x", role="teacher", name="T2")
    db.add(other)
    await db.flush()
    other_course = Course(name="大学英语", teacher_id=other.id)
    db.add(other_course)
    await db.flush()
    await assign_subject_to_teacher(db, other.id, other_course.id)

    resp = await client.post(
        "/api/bank/questions",
        json={
            "type": "single",
            "content": "下列选项中发音不同的是？",
            "options": ["A", "B", "C", "D"],
            "answer": "A",
            "score": 5,
            "course_id": other_course.id,
        },
        headers=_auth_header(other),
    )
    assert resp.status_code in (200, 201)
    other_bank_id = resp.json()["data"]["id"]

    resp = await client.post(
        f"/api/exams/{exam.id}/questions/from-bank",
        json={"bank_ids": [other_bank_id]},
        headers=_auth_header(teacher),
    )
    assert resp.status_code == 403
