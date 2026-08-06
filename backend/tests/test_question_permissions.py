"""题目接口权限测试：题目读写仅限教师/管理员，且教师须具备该考试所属课程的管理权限。"""

from datetime import datetime

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.course import Course
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


async def _make_user(db: AsyncSession, role: str, username: str) -> User:
    user = User(username=username, password_hash="x", role=role, name=role)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def _make_course_exam(db: AsyncSession, teacher: User, title="考试"):
    course = Course(name="高等数学", teacher_id=teacher.id)
    db.add(course)
    await db.flush()
    exam = await create_exam(db, {
        "title": title, "course_id": course.id,
        "start_time": datetime(2026, 8, 10, 10, 0, 0),
        "end_time": datetime(2026, 8, 10, 12, 0, 0), "duration": 120,
        "status": "published",
    })
    return course, exam


async def _make_question(db: AsyncSession, exam, content="1+1=?"):
    q = Question(exam_id=exam.id, type="single", content=content,
                 answer="A", score=5, options='["1","2"]', sort_order=1)
    db.add(q)
    await db.commit()
    await db.refresh(q)
    return q


@pytest.mark.asyncio
async def test_student_cannot_list_questions(client, db: AsyncSession):
    teacher = await _make_user(db, "teacher", "t1")
    student = await _make_user(db, "student", "s1")
    _, exam = await _make_course_exam(db, teacher)
    resp = await client.get(f"/api/exams/{exam.id}/questions", headers=_auth_header(student))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_unassigned_teacher_cannot_list_questions(client, db: AsyncSession):
    teacher_a = await _make_user(db, "teacher", "ta")
    teacher_b = await _make_user(db, "teacher", "tb")
    course, exam = await _make_course_exam(db, teacher_a)
    await assign_subject_to_teacher(db, teacher_a.id, course.id)
    resp = await client.get(f"/api/exams/{exam.id}/questions", headers=_auth_header(teacher_b))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_assigned_teacher_can_list_questions(client, db: AsyncSession):
    teacher = await _make_user(db, "teacher", "t1")
    course, exam = await _make_course_exam(db, teacher)
    await assign_subject_to_teacher(db, teacher.id, course.id)
    await _make_question(db, exam)
    resp = await client.get(f"/api/exams/{exam.id}/questions", headers=_auth_header(teacher))
    assert resp.status_code == 200
    assert resp.json()["data"]["total"] == 1


@pytest.mark.asyncio
async def test_admin_can_list_questions(client, db: AsyncSession):
    teacher = await _make_user(db, "teacher", "t1")
    admin = await _make_user(db, "admin", "a1")
    _, exam = await _make_course_exam(db, teacher)
    resp = await client.get(f"/api/exams/{exam.id}/questions", headers=_auth_header(admin))
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_unassigned_teacher_cannot_create_question(client, db: AsyncSession):
    teacher_a = await _make_user(db, "teacher", "ta")
    teacher_b = await _make_user(db, "teacher", "tb")
    course, exam = await _make_course_exam(db, teacher_a)
    await assign_subject_to_teacher(db, teacher_a.id, course.id)
    payload = {"type": "single", "content": "1+1=?", "answer": "A",
               "score": 5, "options": ["1", "2"], "sort_order": 1}
    resp = await client.post(f"/api/exams/{exam.id}/questions",
                             json=payload, headers=_auth_header(teacher_b))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_other_teacher_cannot_touch_question_of_unassigned_exam(client, db: AsyncSession):
    teacher_a = await _make_user(db, "teacher", "ta")
    teacher_b = await _make_user(db, "teacher", "tb")
    course, exam = await _make_course_exam(db, teacher_a)
    await assign_subject_to_teacher(db, teacher_a.id, course.id)
    question = await _make_question(db, exam)
    resp = await client.put(f"/api/questions/{question.id}",
                            json={"content": "2+2=?"}, headers=_auth_header(teacher_b))
    assert resp.status_code == 403
    resp = await client.delete(f"/api/questions/{question.id}", headers=_auth_header(teacher_b))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_assigned_teacher_can_update_and_delete_question(client, db: AsyncSession):
    teacher = await _make_user(db, "teacher", "t1")
    course, exam = await _make_course_exam(db, teacher)
    await assign_subject_to_teacher(db, teacher.id, course.id)
    question = await _make_question(db, exam)
    resp = await client.put(f"/api/questions/{question.id}",
                            json={"content": "2+2=?"}, headers=_auth_header(teacher))
    assert resp.status_code == 200
    resp = await client.delete(f"/api/questions/{question.id}", headers=_auth_header(teacher))
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_unassigned_teacher_cannot_import_questions(client, db: AsyncSession):
    teacher_a = await _make_user(db, "teacher", "ta")
    teacher_b = await _make_user(db, "teacher", "tb")
    course, exam = await _make_course_exam(db, teacher_a)
    await assign_subject_to_teacher(db, teacher_a.id, course.id)
    payload = {"questions": [{"type": "single", "content": "1+1=?", "answer": "A",
                              "score": 5, "options": ["1", "2"], "sort_order": 0}]}
    resp = await client.post(f"/api/exams/{exam.id}/questions/import",
                             json=payload, headers=_auth_header(teacher_b))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_import_file_exceeding_size_limit_rejected(client, db: AsyncSession):
    teacher = await _make_user(db, "teacher", "t1")
    course, exam = await _make_course_exam(db, teacher)
    await assign_subject_to_teacher(db, teacher.id, course.id)
    files = {"file": (
        "big.xlsx",
        b"x" * (10 * 1024 * 1024 + 1),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )}
    resp = await client.post(
        f"/api/exams/{exam.id}/questions/import-file",
        files=files,
        headers=_auth_header(teacher),
    )
    assert resp.status_code == 413
