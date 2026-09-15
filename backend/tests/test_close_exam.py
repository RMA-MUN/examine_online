"""P0 监考三件套测试（三）：教师结束考试（close）。

TDD RED：被测端点 PUT /api/exams/{exam_id}/close 尚未实现，
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
    teacher = User(username="ce_t", password_hash="x", role="teacher", name="T")
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
    student = User(username="ce_s", password_hash="x", role="student", name="S")
    db.add(student)
    await db.flush()
    await db.commit()
    await db.refresh(exam)
    return teacher, student, exam


@pytest.mark.asyncio
async def test_close_exam_sets_finished(client, db: AsyncSession):
    teacher, _, exam = await _make_setup(db)
    r = await client.put(
        f"/api/exams/{exam.id}/close",
        headers=_auth_header(teacher),
    )
    assert r.status_code == 200
    assert r.json()["data"]["status"] == "finished"
    await db.refresh(exam)
    assert exam.status == "finished"


@pytest.mark.asyncio
async def test_close_exam_missing_returns_404(client, db: AsyncSession):
    admin = User(username="ce_admin", password_hash="x", role="admin", name="A")
    db.add(admin)
    await db.commit()
    # 管理员不受教师授权限制，可直达“考试不存在”分支
    r = await client.put(
        "/api/exams/999999/close",
        headers=_auth_header(admin),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_close_exam_requires_teacher_role(client, db: AsyncSession):
    _, student, exam = await _make_setup(db)
    r = await client.put(
        f"/api/exams/{exam.id}/close",
        headers=_auth_header(student),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_close_exam_forbidden_for_unassigned_teacher(client, db: AsyncSession):
    _, _, exam = await _make_setup(db)
    outsider = User(username="ce_out", password_hash="x", role="teacher", name="O")
    db.add(outsider)
    await db.commit()
    r = await client.put(
        f"/api/exams/{exam.id}/close",
        headers=_auth_header(outsider),
    )
    assert r.status_code == 403
