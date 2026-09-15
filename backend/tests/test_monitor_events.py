"""监控防作弊事件测试：学生上报事件、教师按考试/记录查询事件。"""

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


class _FakeRedis:
    """内存切屏计数器：实现 incr/ttl/expire/get 的真实语义，测试不依赖外部 Redis。"""

    def __init__(self):
        self.counts: dict = {}

    async def incr(self, key):
        self.counts[key] = self.counts.get(key, 0) + 1
        return self.counts[key]

    async def ttl(self, key):
        return -1

    async def expire(self, key, seconds):
        return True

    async def get(self, key):
        value = self.counts.get(key)
        return None if value is None else str(value)


@pytest.fixture(autouse=True)
def _fake_switch_redis(monkeypatch):
    """切屏计数走内存 fake：与 anti_cheat_service 的 Redis 用法同语义。"""
    import app.services.anti_cheat_service as anti_cheat_module

    monkeypatch.setattr(anti_cheat_module, "redis_client", _FakeRedis(), raising=True)


async def _make_setup(db: AsyncSession):
    teacher = User(username="mon_t", password_hash="x", role="teacher", name="T")
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
    student = User(username="mon_s", password_hash="x", role="student", name="S")
    db.add(student)
    await db.flush()
    record = ExamRecord(
        student_id=student.id,
        exam_id=exam.id,
        start_time=datetime.now() - timedelta(minutes=5),
        status="ongoing",
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return teacher, student, exam, record


@pytest.mark.asyncio
async def test_student_can_post_switch_event(client, db: AsyncSession):
    _, student, exam, record = await _make_setup(db)
    resp = await client.post(
        f"/api/exams/{exam.id}/events",
        json={"event_type": "switch"},
        headers=_auth_header(student),
    )
    assert resp.status_code == 201
    assert resp.json()["data"]["event_type"] == "switch"
    # 切屏上报经唯一计数源累加：记录的 switch_count 与 Redis 计数同步为 1
    await db.refresh(record)
    assert record.switch_count == 1


@pytest.mark.asyncio
async def test_post_event_requires_login(client, db: AsyncSession):
    _, _, exam, _ = await _make_setup(db)
    resp = await client.post(f"/api/exams/{exam.id}/events", json={"event_type": "blur"})
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_teacher_can_list_exam_events(client, db: AsyncSession):
    teacher, student, exam, _ = await _make_setup(db)
    await client.post(
        f"/api/exams/{exam.id}/events",
        json={"event_type": "blur", "detail": {"seconds": 12}},
        headers=_auth_header(student),
    )
    resp = await client.get(
        f"/api/exams/{exam.id}/events", headers=_auth_header(teacher)
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["total"] == 1


@pytest.mark.asyncio
async def test_teacher_can_list_record_events(client, db: AsyncSession):
    teacher, student, exam, record = await _make_setup(db)
    await client.post(
        f"/api/exams/{exam.id}/events",
        json={"event_type": "paste"},
        headers=_auth_header(student),
    )
    resp = await client.get(
        f"/api/records/{record.id}/events", headers=_auth_header(teacher)
    )
    assert resp.status_code == 200
    assert len(resp.json()["data"]) == 1


@pytest.mark.asyncio
async def test_student_cannot_list_exam_events(client, db: AsyncSession):
    _, student, exam, _ = await _make_setup(db)
    resp = await client.get(
        f"/api/exams/{exam.id}/events", headers=_auth_header(student)
    )
    assert resp.status_code == 403
