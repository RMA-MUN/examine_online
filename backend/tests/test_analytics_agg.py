"""Task 4: P1 聚合 — 知识点/班级/分数段/D值（纯 SELECT 只读聚合，不新建表）。"""

import pytest
import pytest_asyncio
from datetime import datetime
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.answer import Answer
from app.models.class_ import SchoolClass
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


async def _seed_agg(db: AsyncSession):
    """4 学生 × 2 班级 × 3 题（含无 tags 题），分数拉开以便断言聚合值。"""
    teacher = await _make_user(db, "teacher", "t_agg")
    course = Course(name="数据结构", teacher_id=teacher.id)
    db.add(course)
    await db.commit()
    await db.refresh(course)
    await assign_subject_to_teacher(db, teacher.id, course.id)
    c1 = SchoolClass(name="计科 2401")
    c2 = SchoolClass(name="计科 2402")
    db.add_all([c1, c2])
    await db.commit()
    await db.refresh(c1)
    await db.refresh(c2)
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
    q1 = Question(exam_id=exam.id, type="single", content="单选1", score=10, sort_order=1, tags=["线性表"])
    q2 = Question(exam_id=exam.id, type="single", content="单选2", score=10, sort_order=2, tags=["排序"])
    q3 = Question(exam_id=exam.id, type="essay", content="简答1", score=10, sort_order=3, tags=None)
    db.add_all([q1, q2, q3])
    await db.commit()
    await db.refresh(q1)
    await db.refresh(q2)
    await db.refresh(q3)
    s1 = await _make_user(db, "student", "s_agg1", class_id=c1.id)
    s2 = await _make_user(db, "student", "s_agg2", class_id=c1.id)
    s3 = await _make_user(db, "student", "s_agg3", class_id=c2.id)
    s4 = await _make_user(db, "student", "s_agg4", class_id=c2.id)
    r1 = ExamRecord(student_id=s1.id, exam_id=exam.id, start_time=datetime(2026, 8, 10, 10, 0, 0),
                    submit_time=datetime(2026, 8, 10, 11, 0, 0), score=85, status="graded")
    r2 = ExamRecord(student_id=s2.id, exam_id=exam.id, start_time=datetime(2026, 8, 10, 10, 0, 0),
                    submit_time=datetime(2026, 8, 10, 11, 1, 0), score=75, status="graded")
    r3 = ExamRecord(student_id=s3.id, exam_id=exam.id, start_time=datetime(2026, 8, 10, 10, 0, 0),
                    submit_time=datetime(2026, 8, 10, 11, 2, 0), score=55, status="graded")
    r4 = ExamRecord(student_id=s4.id, exam_id=exam.id, start_time=datetime(2026, 8, 10, 10, 0, 0),
                    submit_time=datetime(2026, 8, 10, 11, 3, 0), score=45, status="graded")
    db.add_all([r1, r2, r3, r4])
    await db.commit()
    for r in (r1, r2, r3, r4):
        await db.refresh(r)
    # q1: 10/8/4/0 -> got=22 full=40 rate=55.0；高低分组(27%*4=1) D=(10-0)/10=1.0
    # q2: 全满分 -> rate=100.0, D=0.0
    # q3: 均 5 分 -> rate=50.0（tags 缺失归入"综合"）
    db.add_all([
        Answer(record_id=r1.id, question_id=q1.id, student_answer="A", score=10, is_correct=True, grading_source="teacher"),
        Answer(record_id=r2.id, question_id=q1.id, student_answer="A", score=8, is_correct=False, grading_source="teacher"),
        Answer(record_id=r3.id, question_id=q1.id, student_answer="B", score=4, is_correct=False, grading_source="teacher"),
        Answer(record_id=r4.id, question_id=q1.id, student_answer="B", score=0, is_correct=False, grading_source="teacher"),
        Answer(record_id=r1.id, question_id=q2.id, student_answer="A", score=10, is_correct=True, grading_source="teacher"),
        Answer(record_id=r2.id, question_id=q2.id, student_answer="A", score=10, is_correct=True, grading_source="teacher"),
        Answer(record_id=r3.id, question_id=q2.id, student_answer="A", score=10, is_correct=True, grading_source="teacher"),
        Answer(record_id=r4.id, question_id=q2.id, student_answer="A", score=10, is_correct=True, grading_source="teacher"),
        Answer(record_id=r1.id, question_id=q3.id, student_answer="要点", score=5, grading_source="teacher"),
        Answer(record_id=r2.id, question_id=q3.id, student_answer="要点", score=5, grading_source="teacher"),
        Answer(record_id=r3.id, question_id=q3.id, student_answer="略", score=5, grading_source="teacher"),
        Answer(record_id=r4.id, question_id=q3.id, student_answer="略", score=5, grading_source="teacher"),
    ])
    await db.commit()
    return exam, teacher


@pytest.mark.asyncio
async def test_knowledge_stats_shape(db: AsyncSession):
    from app.services.analytics_service import get_knowledge_stats
    exam, _ = await _seed_agg(db)
    out = await get_knowledge_stats(db, exam.id)
    assert isinstance(out, list) and len(out) == 3
    by_name = {row["name"]: row["rate"] for row in out}
    assert by_name["线性表"] == 55.0
    assert by_name["排序"] == 100.0
    assert by_name["综合"] == 50.0


@pytest.mark.asyncio
async def test_class_compare_shape(db: AsyncSession):
    from app.services.analytics_service import get_class_compare
    exam, _ = await _seed_agg(db)
    out = await get_class_compare(db, exam.id)
    assert isinstance(out, list) and len(out) == 2
    by_name = {row["name"]: row for row in out}
    assert by_name["计科 2401"]["avg"] == 80.0
    assert by_name["计科 2401"]["pass_rate"] == 100.0
    assert by_name["计科 2401"]["count"] == 2
    assert by_name["计科 2402"]["avg"] == 50.0
    assert by_name["计科 2402"]["pass_rate"] == 0.0
    assert by_name["计科 2402"]["count"] == 2


@pytest.mark.asyncio
async def test_score_bins_shape(db: AsyncSession):
    from app.services.analytics_service import get_score_bins
    exam, _ = await _seed_agg(db)
    out = await get_score_bins(db, exam.id)
    assert isinstance(out, list) and len(out) == 7
    by_label = {row["label"]: row["count"] for row in out}
    assert by_label["80–89"] == 1
    assert by_label["70–79"] == 1
    assert by_label["50–59"] == 1
    assert by_label["40–49"] == 1
    assert by_label["90–100"] == 0
    assert sum(by_label.values()) == 4


@pytest.mark.asyncio
async def test_discrimination_shape(db: AsyncSession):
    from app.services.analytics_service import get_discrimination
    exam, _ = await _seed_agg(db)
    out = await get_discrimination(db, exam.id)
    assert isinstance(out, list) and len(out) == 3
    for row in out:
        assert set(["question_id", "p", "d"]) <= set(row.keys())
        assert -1.0 <= row["d"] <= 1.0
        assert 0.0 <= row["p"] <= 1.0
    by_q = {row["question_id"]: row for row in out}
    # q1 按 sort_order=1：D=(10-0)/10=1.0, P=22/40=0.55
    assert by_q[1]["d"] == 1.0
    assert by_q[1]["p"] == 0.55


@pytest.mark.asyncio
async def test_question_stats_backward_compat(client, db: AsyncSession):
    """原 question-stats 字段名不变，仅新增 knowledge/D 等字段。"""
    exam, teacher = await _seed_agg(db)
    resp = await client.get(f"/api/statistics/exam/{exam.id}/questions", headers=_auth_header(teacher))
    assert resp.status_code == 200
    items = resp.json()["data"]
    assert isinstance(items, list) and len(items) == 3
    for item in items:
        assert set(["question_id", "type", "avg_score", "correct_rate", "distribution"]) <= set(item.keys())
        assert "d" in item and "knowledge" in item


@pytest.mark.asyncio
async def test_question_stats_include_aggregates(client, db: AsyncSession):
    """?include=knowledge,classes,bins 展开聚合，items 保持原形状。"""
    exam, teacher = await _seed_agg(db)
    resp = await client.get(
        f"/api/statistics/exam/{exam.id}/questions",
        params={"include": "knowledge,classes,bins"},
        headers=_auth_header(teacher),
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert isinstance(data, dict)
    assert len(data["items"]) == 3
    assert len(data["knowledge"]) == 3
    assert len(data["classes"]) == 2
    assert len(data["bins"]) == 7
    assert sum(b["count"] for b in data["bins"]) == 4
