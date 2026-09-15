"""Task 5: P1 报告导出 + 全屏公告。

TDD RED：被测端点 POST /api/statistics/exam/{id}/report 与
POST+GET /api/exams/{id}/announcements 尚未实现，本文件测试先行，预期失败（404）。
"""

from datetime import datetime, timedelta

import pytest
import pytest_asyncio
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


async def _seed_report(db: AsyncSession):
    """1 教师 × 1 考试 × 2 学生 × 2 题（聚合输入最小集）。"""
    teacher = User(username="rep_t", password_hash="x", role="teacher", name="T")
    db.add(teacher)
    await db.flush()
    course = Course(name="数据结构", teacher_id=teacher.id)
    db.add(course)
    await db.flush()
    await assign_subject_to_teacher(db, teacher.id, course.id)
    exam = Exam(
        course_id=course.id,
        title="期中考试",
        start_time=datetime.now() - timedelta(minutes=60),
        end_time=datetime.now() + timedelta(minutes=60),
        duration=120,
        total_score=100,
        pass_score=60,
        status="ongoing",
    )
    db.add(exam)
    await db.flush()
    q1 = Question(exam_id=exam.id, type="single", content="单选1", score=10, sort_order=1, tags=["线性表"])
    q2 = Question(exam_id=exam.id, type="single", content="单选2", score=10, sort_order=2, tags=["排序"])
    db.add_all([q1, q2])
    await db.flush()
    s1 = User(username="rep_s1", password_hash="x", role="student", name="S1")
    s2 = User(username="rep_s2", password_hash="x", role="student", name="S2")
    db.add_all([s1, s2])
    await db.flush()
    r1 = ExamRecord(
        student_id=s1.id, exam_id=exam.id,
        start_time=datetime.now() - timedelta(minutes=50),
        submit_time=datetime.now() - timedelta(minutes=10),
        score=80, status="graded",
    )
    r2 = ExamRecord(
        student_id=s2.id, exam_id=exam.id,
        start_time=datetime.now() - timedelta(minutes=50),
        submit_time=datetime.now() - timedelta(minutes=9),
        score=50, status="graded",
    )
    db.add_all([r1, r2])
    await db.flush()
    db.add_all([
        Answer(record_id=r1.id, question_id=q1.id, student_answer="A", score=10,
               is_correct=True, grading_source="teacher"),
        Answer(record_id=r1.id, question_id=q2.id, student_answer="A", score=8,
               is_correct=False, grading_source="teacher"),
        Answer(record_id=r2.id, question_id=q1.id, student_answer="B", score=4,
               is_correct=False, grading_source="teacher"),
        Answer(record_id=r2.id, question_id=q2.id, student_answer="A", score=6,
               is_correct=False, grading_source="teacher"),
    ])
    await db.commit()
    for obj in (teacher, s1, s2, exam, r1, r2):
        await db.refresh(obj)
    return teacher, s1, s2, exam


@pytest.mark.asyncio
async def test_report_returns_file(client, db: AsyncSession):
    teacher, _, _, exam = await _seed_report(db)
    r = await client.post(
        f"/api/statistics/exam/{exam.id}/report",
        json={"sections": ["scores", "quality", "knowledge"]},
        headers=_auth_header(teacher),
    )
    assert r.status_code == 200
    assert "spreadsheetml.sheet" in r.headers["content-type"]
    assert len(r.content) > 0


@pytest.mark.asyncio
async def test_report_sections_optional_backward_compat(client, db: AsyncSession):
    """sections 缺省（向后兼容）时返回全量报告，不断言具体 sheet。"""
    teacher, _, _, exam = await _seed_report(db)
    r = await client.post(
        f"/api/statistics/exam/{exam.id}/report",
        json={},
        headers=_auth_header(teacher),
    )
    assert r.status_code == 200
    assert "spreadsheetml.sheet" in r.headers["content-type"]


@pytest.mark.asyncio
async def test_report_forbidden_for_student(client, db: AsyncSession):
    _, s1, _, exam = await _seed_report(db)
    r = await client.post(
        f"/api/statistics/exam/{exam.id}/report",
        json={"sections": ["scores"]},
        headers=_auth_header(s1),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_announcement_teacher_post_student_poll(client, db: AsyncSession):
    """教师广播公告 → 学生轮询仅见自己名下公告；学生伪造公告被拒绝。"""
    teacher, s1, s2, exam = await _seed_report(db)
    r = await client.post(
        f"/api/exams/{exam.id}/announcements",
        json={"message": "剩余 10 分钟，请检查答题卡"},
        headers=_auth_header(teacher),
    )
    assert r.status_code == 201
    assert r.json()["data"]["count"] == 2

    mine = await client.get(
        f"/api/exams/{exam.id}/announcements", headers=_auth_header(s1)
    )
    assert mine.status_code == 200
    items = mine.json()["data"]
    assert len(items) == 1
    assert items[0]["event_type"] == "announcement"
    assert items[0]["detail"]["message"] == "剩余 10 分钟，请检查答题卡"

    other = await client.get(
        f"/api/exams/{exam.id}/announcements", headers=_auth_header(s2)
    )
    assert other.status_code == 200
    assert len(other.json()["data"]) == 1

    # 学生经学生上报通道伪造 announcement 类型应被拒绝（422）
    forged = await client.post(
        f"/api/exams/{exam.id}/events",
        json={"event_type": "announcement"},
        headers=_auth_header(s1),
    )
    assert forged.status_code == 422

    # 学生无权广播公告
    denied = await client.post(
        f"/api/exams/{exam.id}/announcements",
        json={"message": "伪造"},
        headers=_auth_header(s1),
    )
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_announcement_empty_exam_returns_zero_count_with_note(client, db: AsyncSession):
    """空考试（无考生记录）下发公告：仍 201，但 count==0 且 message 注明无人接收。"""
    from datetime import datetime, timedelta

    teacher = User(username="rep_empty_t", password_hash="x", role="teacher", name="T")
    db.add(teacher)
    await db.flush()
    course = Course(name="空考试科目", teacher_id=teacher.id)
    db.add(course)
    await db.flush()
    await assign_subject_to_teacher(db, teacher.id, course.id)
    exam = Exam(
        course_id=course.id,
        title="无人考试",
        start_time=datetime.now() - timedelta(minutes=10),
        end_time=datetime.now() + timedelta(minutes=60),
        duration=60,
        total_score=100,
        pass_score=60,
        status="ongoing",
    )
    db.add(exam)
    await db.commit()
    await db.refresh(exam)

    r = await client.post(
        f"/api/exams/{exam.id}/announcements",
        json={"message": "有人吗"},
        headers=_auth_header(teacher),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["data"]["count"] == 0
    assert "无考生记录" in body["message"]


@pytest.mark.asyncio
async def test_report_students_not_truncated(db: AsyncSession, monkeypatch):
    """报告学生明细不被单页截断：桩掉分页（每页 2 条、共 5 条），断言分页拉全。"""
    import app.services.report_service as report_service

    async def fake_page(db, exam_id, page=1, page_size=10, class_id=None, keyword=None):
        all_rows = [{"rank": i + 1, "score": 60 + i} for i in range(5)]
        start = (page - 1) * 2
        return {"total": 5, "items": all_rows[start : start + 2]}

    monkeypatch.setattr(report_service, "get_exam_student_scores", fake_page)

    out = await report_service._fetch_all_student_scores(db, 999)
    assert out["total"] == 5
    assert [r["rank"] for r in out["items"]] == [1, 2, 3, 4, 5]
