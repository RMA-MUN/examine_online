"""前后端功能对齐测试：标记持久化、多选回显、终评完整性校验、参数默认值、未分班筛选。"""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch

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
from app.services.exam_student_service import get_paper, save_answers
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


async def _seed_exam(db: AsyncSession, with_essay: bool = False):
    """建 教师/课程/考试/学生/进行中记录，返回 (exam, student, teacher, record)。"""
    from app.services.teacher_subject_service import assign_subject_to_teacher

    teacher = User(username="fp_t", password_hash="x", role="teacher", name="T")
    db.add(teacher)
    await db.flush()
    course = Course(name="功能对齐课程", teacher_id=teacher.id)
    db.add(course)
    await db.flush()
    await assign_subject_to_teacher(db, teacher.id, course.id)
    exam = Exam(
        course_id=course.id, title="对齐考试",
        start_time=datetime.now() - timedelta(minutes=10),
        end_time=datetime.now() + timedelta(minutes=60),
        duration=60, total_score=100, pass_score=60, status="ongoing",
    )
    db.add(exam)
    await db.flush()
    student = User(username="fp_s", password_hash="x", role="student", name="S")
    db.add(student)
    await db.flush()
    record = ExamRecord(
        student_id=student.id, exam_id=exam.id,
        start_time=datetime.now() - timedelta(minutes=5), status="ongoing",
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return exam, student, teacher, record


@pytest.mark.asyncio
async def test_save_persists_marks_and_paper_returns_them(db: AsyncSession):
    """save 携带 marked 写入记录列；get_paper（缓存丢失重建路径）返回标记列表。"""
    exam, student, _, record = await _seed_exam(db)

    redis_mock = AsyncMock()
    redis_mock.get = AsyncMock(return_value=None)
    with patch("app.services.exam_student_service.redis_client", new=redis_mock):
        ok, err = await save_answers(db, exam.id, student.id, {"1": "A"}, marked=[101, 102])
        assert ok is True and err is None

    await db.refresh(record)
    assert record.marked_question_ids == [101, 102]

    paper, perr = await get_paper(db, exam.id, student.id)
    assert perr is None
    assert paper["marked_question_ids"] == [101, 102]


@pytest.mark.asyncio
async def test_save_without_marked_clears_marks(db: AsyncSession):
    """不带 marked 的旧格式保存把标记清空（列表语义而非覆盖丢失）。"""
    exam, student, _, record = await _seed_exam(db)
    record.marked_question_ids = [7]
    await db.commit()

    redis_mock = AsyncMock()
    redis_mock.get = AsyncMock(return_value=None)
    with patch("app.services.exam_student_service.redis_client", new=redis_mock):
        ok, err = await save_answers(db, exam.id, student.id, {"1": "A"})
        assert ok is True and err is None

    await db.refresh(record)
    assert record.marked_question_ids == []


@pytest.mark.asyncio
async def test_paper_splits_multiple_answer_to_array(db: AsyncSession):
    """多选题入库为 "AB" 字符串，paper 回显拆回数组；单选保持字符串。"""
    exam, student, _, record = await _seed_exam(db)
    multi = Question(
        exam_id=exam.id, type="multiple", content="选出偶数",
        options='["A","B"]', answer="AB", score=5,
    )
    single = Question(
        exam_id=exam.id, type="single", content="1+1=?",
        options='["A","B"]', answer="A", score=5,
    )
    db.add_all([multi, single])
    await db.flush()
    db.add(Answer(record_id=record.id, question_id=multi.id, student_answer="AB"))
    db.add(Answer(record_id=record.id, question_id=single.id, student_answer="A"))
    await db.commit()

    redis_mock = AsyncMock()
    redis_mock.get = AsyncMock(return_value=None)
    with patch("app.services.exam_student_service.redis_client", new=redis_mock):
        paper, err = await get_paper(db, exam.id, student.id)

    assert err is None
    assert paper["saved_answers"][multi.id] == ["A", "B"]
    assert paper["saved_answers"][single.id] == "A"


@pytest.mark.asyncio
async def test_finalize_rejects_ungraded_essay(client, db: AsyncSession):
    """存在 grading_source=pending 的简答题时终评被拒（400 + 明细），批改后放行。"""
    exam, student, teacher, record = await _seed_exam(db)
    essay = Question(
        exam_id=exam.id, type="essay", content="论述题", options=None, answer="略", score=20,
    )
    db.add(essay)
    await db.flush()
    record.status = "submitted"
    db.add(Answer(record_id=record.id, question_id=essay.id, student_answer="作答",
                  score=0, grading_source="pending"))
    await db.commit()

    resp = await client.put(f"/api/records/{record.id}/finalize", headers=_auth_header(teacher))
    assert resp.status_code == 400
    assert "主观题未完成批改" in resp.json()["detail"]

    # 教师批改后（grading_source=teacher）终评放行
    answer = (
        await db.execute(Answer.__table__.select().where(Answer.record_id == record.id))
    ).first()
    await db.execute(
        Answer.__table__.update().where(Answer.id == answer.id).values(grading_source="teacher", score=18)
    )
    await db.commit()
    resp = await client.put(f"/api/records/{record.id}/finalize", headers=_auth_header(teacher))
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "graded"


@pytest.mark.asyncio
async def test_admin_params_defaults_endpoint(client, db: AsyncSession):
    """GET /api/admin/params/defaults 返回 11 个 key 的出厂默认值，且与参数白名单一致。"""
    from app.services.system_param_service import ALLOWED_PARAM_KEYS

    admin = User(username="fp_adm", password_hash="x", role="admin", name="A")
    db.add(admin)
    await db.commit()

    resp = await client.get("/api/admin/params/defaults", headers=_auth_header(admin))
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert set(data.keys()) == set(ALLOWED_PARAM_KEYS)
    assert data["default.duration"] == "120"
    assert data["switch.show_answer"] == "false"

    # 非 admin 拒绝
    student = User(username="fp_s2", password_hash="x", role="student", name="S2")
    db.add(student)
    await db.commit()
    resp = await client.get("/api/admin/params/defaults", headers=_auth_header(student))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_student_scores_unassigned_class_filter(db: AsyncSession):
    """class_id=-1 只返回未分班（class_id 为 NULL）的学生。"""
    from app.services.analytics_service import get_exam_student_scores

    exam, _, _, _ = await _seed_exam(db)
    assigned = User(username="fp_s3", password_hash="x", role="student", name="S3", class_id=None)
    db.add(assigned)
    await db.flush()
    db.add(ExamRecord(student_id=assigned.id, exam_id=exam.id,
                      start_time=datetime.now(), status="submitted", score=80))
    # 未分班学生：fp_s（_seed_exam 创建）+ fp_s3 均无 class_id
    await db.commit()

    all_rows = await get_exam_student_scores(db, exam.id)
    assert all_rows["total"] == 2

    unassigned = await get_exam_student_scores(db, exam.id, class_id=-1)
    assert unassigned["total"] == 2

    # 再造一个分班学生，-1 过滤后应被排除
    from app.models.class_ import SchoolClass
    klass = SchoolClass(name="一班")
    db.add(klass)
    await db.flush()
    grouped = User(username="fp_s4", password_hash="x", role="student", name="S4", class_id=klass.id)
    db.add(grouped)
    await db.flush()
    db.add(ExamRecord(student_id=grouped.id, exam_id=exam.id,
                      start_time=datetime.now(), status="submitted", score=90))
    await db.commit()

    unassigned = await get_exam_student_scores(db, exam.id, class_id=-1)
    assert unassigned["total"] == 2
    names = {item["student"]["username"] for item in unassigned["items"]}
    assert names == {"fp_s", "fp_s3"}
