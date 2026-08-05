# 学生考试完成状态与结果详情 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 学生考试列表显示完成状态（未参加/进行中/已完成），修复进入考试失败链，并新增只读的考试结果详情查看。

**Architecture:** 后端在 `get_student_eligible_exams` 返回每个考试的学生记录状态；`get_paper` 增加数据库重建回退；新增学生专属只读结果接口（校验记录归属）。前端卡片按完成状态渲染，MyRecords 增加只读详情抽屉。

**Tech Stack:** FastAPI / SQLAlchemy async / pytest-asyncio / httpx ASGITransport / React + antd / react-scripts test

## Global Constraints

- 后端运行测试命令：`backend/.venv/Scripts/python.exe -m pytest tests/<file> -q`（workdir=`backend`）
- 前端运行测试命令：`npx react-scripts test --watchAll=false`（workdir=`frontend`，需 `$env:CI="true"`）
- 前端类型检查不可用（node_modules/@types/node 与本机 TS 版本不兼容，属既有环境问题），用 ESLint 检查改动文件：`npx eslint src/<file>`
- 业务错误通过 HTTP 200 + `code != 200` 返回（`error_response`），前端必须检查 `res.code === 200`
- 数据库状态枚举：`ExamRecord.status ∈ ('ongoing', 'submitted', 'graded')`
- AI 批改字段：`Answer.ai_score / ai_feedback / ai_model / ai_graded_at / grading_source / override_reason`，任务表 `AiGradingTask.last_error`
- 所有改动在分支 `feat/2026-08-05` 上进行，每个任务结束单独 commit
- 设计文档：`docs/superpowers/specs/2026-08-05-student-exam-status-and-result-design.md`

---

### Task 1: 后端 — 学生考试列表携带完成状态

**Files:**
- Modify: `backend/app/services/exam_service.py:175-189`（`get_student_eligible_exams`）
- Modify: `backend/app/schemas/exam.py:44-52`（`ExamResponse`）
- Test: `backend/tests/test_student_exam_status.py`（新建）

**Interfaces:**
- Consumes: `ExamRecord`（`backend/app/models/exam_record.py`，字段 `student_id/exam_id/status`）
- Produces: `Exam.student_record_status`（动态属性：`'ongoing' | 'submitted' | 'graded' | None`）；`ExamResponse.student_record_status: Optional[str] = None`，供前端 Task 4 使用

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_student_exam_status.py`：

```python
from datetime import datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exam import Exam
from app.models.exam_record import ExamRecord
from app.models.user import User
from app.schemas.exam import ExamResponse
from app.services.exam_service import create_exam, get_student_eligible_exams


async def _make_student(db: AsyncSession, username="s1") -> User:
    student = User(username=username, password_hash="x", role="student", name="学生")
    db.add(student)
    await db.commit()
    await db.refresh(student)
    return student


async def _make_exam(db: AsyncSession, title="考试", **kw) -> Exam:
    data = {
        "title": title, "course_id": 1,
        "start_time": datetime(2026, 8, 10, 10, 0, 0),
        "end_time": datetime(2026, 8, 10, 12, 0, 0), "duration": 120,
        "total_score": 100, "pass_score": 60,
    }
    data.update(kw)
    return await create_exam(db, data)


@pytest.mark.asyncio
async def test_student_exam_list_status_none_without_record(db: AsyncSession):
    student = await _make_student(db)
    exam = await _make_exam(db, status="published")
    exams, total = await get_student_eligible_exams(db, student.id)
    assert total == 1
    assert getattr(exams[0], "student_record_status", None) is None


@pytest.mark.asyncio
async def test_student_exam_list_status_ongoing(db: AsyncSession):
    student = await _make_student(db)
    exam = await _make_exam(db, status="published")
    db.add(ExamRecord(student_id=student.id, exam_id=exam.id,
                      start_time=datetime.now(), status="ongoing"))
    await db.commit()
    exams, _ = await get_student_eligible_exams(db, student.id)
    assert exams[0].student_record_status == "ongoing"


@pytest.mark.asyncio
async def test_student_exam_list_status_submitted(db: AsyncSession):
    student = await _make_student(db)
    exam = await _make_exam(db, status="published")
    db.add(ExamRecord(student_id=student.id, exam_id=exam.id,
                      start_time=datetime.now(), status="submitted"))
    await db.commit()
    exams, _ = await get_student_eligible_exams(db, student.id)
    assert exams[0].student_record_status == "submitted"


@pytest.mark.asyncio
async def test_exam_response_serializes_record_status(db: AsyncSession):
    student = await _make_student(db)
    exam = await _make_exam(db, status="published")
    db.add(ExamRecord(student_id=student.id, exam_id=exam.id,
                      start_time=datetime.now(), status="graded"))
    await db.commit()
    exams, _ = await get_student_eligible_exams(db, student.id)
    resp = ExamResponse.model_validate(exams[0])
    assert resp.student_record_status == "graded"
```

- [ ] **Step 2: 运行测试确认失败**

Run: `backend/.venv/Scripts/python.exe -m pytest tests/test_student_exam_status.py -q`（workdir=`backend`）
Expected: FAIL（`AttributeError: 'Exam' object has no attribute 'student_record_status'` 或 `student_record_status` 字段不存在）

- [ ] **Step 3: 实现**

修改 `backend/app/services/exam_service.py` 的 `get_student_eligible_exams`（175-189 行），在返回前附加记录状态：

```python
async def get_student_eligible_exams(
    db: AsyncSession, student_id: int, page: int = 1, page_size: int = 10,
    status: Optional[str] = None,
) -> Tuple[List[Exam], int]:
    query = select(Exam)
    if status:
        query = query.where(Exam.status == status)
    all_exams = list((await db.execute(query)).scalars().all())
    eligible = []
    for exam in all_exams:
        if await is_student_eligible(db, exam.id, student_id):
            eligible.append(exam)
    total = len(eligible)
    start = (page - 1) * page_size
    page_exams = eligible[start:start + page_size]
    if page_exams:
        record_result = await db.execute(
            select(ExamRecord.student_id, ExamRecord.exam_id, ExamRecord.status)
            .where(
                ExamRecord.student_id == student_id,
                ExamRecord.exam_id.in_([e.id for e in page_exams]),
            )
        )
        status_map = {exam_id: status for _, exam_id, status in record_result.all()}
        for exam in page_exams:
            exam.student_record_status = status_map.get(exam.id)
    return page_exams, total
```

在文件头部 import 处补上 `ExamRecord`（`from app.models.exam_record import ExamRecord` 已存在于第 8 行，无需新增）。

修改 `backend/app/schemas/exam.py` 的 `ExamResponse`：

```python
class ExamResponse(ExamBase):
    id: int
    course_id: int
    status: str
    created_at: datetime
    assigned_class_ids: List[int] = []
    student_overrides: List[StudentOverride] = []
    student_record_status: Optional[str] = None

    model_config = {"from_attributes": True}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `backend/.venv/Scripts/python.exe -m pytest tests/test_student_exam_status.py -q`（workdir=`backend`）
Expected: 4 passed

- [ ] **Step 5: 回归 + 提交**

Run: `backend/.venv/Scripts/python.exe -m pytest tests -q`（workdir=`backend`）
Expected: 全部通过（原 63 + 新 4）

```bash
git add backend/app/services/exam_service.py backend/app/schemas/exam.py backend/tests/test_student_exam_status.py
git commit -m "feat: 学生考试列表返回完成状态 student_record_status"
```

---

### Task 2: 后端 — get_paper 缓存丢失时从数据库重建

**Files:**
- Modify: `backend/app/services/exam_student_service.py:114-155`（`get_paper`）
- Test: `backend/tests/test_student_exam_status.py`（追加）

**Interfaces:**
- Consumes: `Exam`、`ExamRecord`、`Question`（均已 import）；`redis_client`（模块级）
- Produces: 无新对外签名；`get_paper` 在缓存丢失且记录为 ongoing 时返回重建的试卷并写回 Redis

- [ ] **Step 1: 写失败测试（追加到 `backend/tests/test_student_exam_status.py`）**

```python
from unittest.mock import AsyncMock, patch

from app.models.question import Question
from app.services.exam_student_service import get_paper


@pytest.mark.asyncio
async def test_get_paper_rebuilds_from_db_when_cache_missing(db: AsyncSession):
    student = await _make_student(db)
    exam = await _make_exam(db, status="published")
    q1 = Question(exam_id=exam.id, type="single", content="1+1=?",
                  answer="2", score=5, options='["1","2","3","4"]', sort_order=1)
    q2 = Question(exam_id=exam.id, type="single", content="2+2=?",
                  answer="4", score=5, options='["2","4","6","8"]', sort_order=2)
    db.add_all([q1, q2])
    record = ExamRecord(student_id=student.id, exam_id=exam.id,
                        start_time=datetime.now(), status="ongoing")
    db.add(record)
    await db.commit()
    await db.refresh(record)

    with patch("app.services.exam_student_service.redis_client") as mock_redis:
        mock_redis.get = AsyncMock(return_value=None)
        mock_redis.set = AsyncMock()
        paper, error = await get_paper(db, exam.id, student.id)

    assert error is None
    assert paper["record_id"] == record.id
    assert [q["id"] for q in paper["questions"]] == [q1.id, q2.id]
    mock_redis.set.assert_awaited_once()
    set_args = mock_redis.set.await_args.args
    assert set_args[0] == f"exam:paper:{exam.id}:{student.id}"


@pytest.mark.asyncio
async def test_get_paper_rejects_submitted_record_when_cache_missing(db: AsyncSession):
    student = await _make_student(db)
    exam = await _make_exam(db, status="published")
    db.add(ExamRecord(student_id=student.id, exam_id=exam.id,
                      start_time=datetime.now(), status="submitted"))
    await db.commit()

    with patch("app.services.exam_student_service.redis_client") as mock_redis:
        mock_redis.get = AsyncMock(return_value=None)
        paper, error = await get_paper(db, exam.id, student.id)

    assert paper is None
    assert error is not None
```

注意：文件头部需要 `from unittest.mock import AsyncMock, patch` 与 `from app.models.question import Question`。

- [ ] **Step 2: 运行测试确认失败**

Run: `backend/.venv/Scripts/python.exe -m pytest tests/test_student_exam_status.py -q`（workdir=`backend`）
Expected: 2 FAIL（现有逻辑返回 `None, "考试未开始或已结束"`）

- [ ] **Step 3: 实现**

修改 `backend/app/services/exam_student_service.py::get_paper`（114-118 行），在 `cached` 为空时重建：

```python
async def get_paper(db: AsyncSession, exam_id: int, student_id: int):
    # 从Redis获取缓存的试卷
    cached = await redis_client.get(f"exam:paper:{exam_id}:{student_id}")
    if not cached:
        # 缓存丢失（如 Redis 重启）：校验记录后从数据库重建试卷
        result = await db.execute(
            select(ExamRecord).where(
                ExamRecord.student_id == student_id,
                ExamRecord.exam_id == exam_id,
            )
        )
        record = result.scalar_one_or_none()
        exam = await db.get(Exam, exam_id)
        if not record or record.status != "ongoing" or not exam:
            return None, "考试未开始或已结束"
        result = await db.execute(
            select(Question).where(Question.exam_id == exam_id).order_by(Question.id)
        )
        questions = result.scalars().all()
        paper_data = {
            "exam_id": exam_id,
            "record_id": record.id,
            "questions": [{"id": q.id, "order": i} for i, q in enumerate(questions)],
        }
        await redis_client.set(
            f"exam:paper:{exam_id}:{student_id}",
            json.dumps(paper_data),
            ex=exam.duration * 60,
        )
        cached = json.dumps(paper_data)
```

其余逻辑不变。

- [ ] **Step 4: 运行测试确认通过**

Run: `backend/.venv/Scripts/python.exe -m pytest tests/test_student_exam_status.py -q`（workdir=`backend`）
Expected: 6 passed

- [ ] **Step 5: 回归 + 提交**

Run: `backend/.venv/Scripts/python.exe -m pytest tests -q`（workdir=`backend`）
Expected: 全部通过

```bash
git add backend/app/services/exam_student_service.py backend/tests/test_student_exam_status.py
git commit -m "fix: get_paper 缓存丢失时从数据库重建试卷"
```

---

### Task 3: 后端 — 学生只读结果详情接口

**Files:**
- Modify: `backend/app/api/grading.py:1-42`（import 与新增路由）
- Test: `backend/tests/test_student_result_api.py`（新建）

**Interfaces:**
- Consumes: `get_record_answers(db, record_id)`（`backend/app/services/grading_service.py:63`，返回含 `ai_grading` 字典的列表）、`ExamRecord`
- Produces: `GET /api/records/{record_id}/result`（student 角色），返回结构与 `get_record_answers` 一致但剔除 `ai_grading.last_error`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_student_result_api.py`：

```python
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.exam_record import ExamRecord
from app.models.question import Question
from app.models.user import User
from app.services.exam_service import create_exam
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


async def _make_submitted_record(db: AsyncSession, student: User, owner: User) -> ExamRecord:
    from datetime import datetime
    exam = await create_exam(db, {
        "title": "考试", "course_id": 1,
        "start_time": datetime(2026, 8, 10, 10, 0, 0),
        "end_time": datetime(2026, 8, 10, 12, 0, 0), "duration": 120,
        "status": "published",
    })
    db.add(Question(exam_id=exam.id, type="essay", content="简述",
                    answer="要点", score=10, sort_order=1))
    record = ExamRecord(student_id=student.id, exam_id=exam.id,
                        start_time=datetime.now(), status="submitted",
                        score=7)
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


@pytest.mark.asyncio
async def test_student_can_view_own_result(client, db: AsyncSession):
    student = await _make_user(db, "student", "s1")
    record = await _make_submitted_record(db, student, student)
    resp = await client.get(f"/api/records/{record.id}/result", headers=_auth_header(student))
    assert resp.status_code == 200
    assert resp.json()["code"] == 200


@pytest.mark.asyncio
async def test_student_cannot_view_others_result(client, db: AsyncSession):
    student_a = await _make_user(db, "student", "sa")
    student_b = await _make_user(db, "student", "sb")
    record = await _make_submitted_record(db, student_a, student_a)
    resp = await client.get(f"/api/records/{record.id}/result", headers=_auth_header(student_b))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_student_cannot_view_ongoing_result(client, db: AsyncSession):
    from datetime import datetime
    student = await _make_user(db, "student", "s1")
    exam = await create_exam(db, {
        "title": "考试", "course_id": 1,
        "start_time": datetime(2026, 8, 10, 10, 0, 0),
        "end_time": datetime(2026, 8, 10, 12, 0, 0), "duration": 120,
        "status": "published",
    })
    record = ExamRecord(student_id=student.id, exam_id=exam.id,
                        start_time=datetime.now(), status="ongoing")
    db.add(record)
    await db.commit()
    await db.refresh(record)
    resp = await client.get(f"/api/records/{record.id}/result", headers=_auth_header(student))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_teacher_cannot_access_student_result(client, db: AsyncSession):
    student = await _make_user(db, "student", "s1")
    teacher = await _make_user(db, "teacher", "t1")
    record = await _make_submitted_record(db, student, student)
    resp = await client.get(f"/api/records/{record.id}/result", headers=_auth_header(teacher))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_result_omits_last_error(client, db: AsyncSession):
    student = await _make_user(db, "student", "s1")
    record = await _make_submitted_record(db, student, student)
    resp = await client.get(f"/api/records/{record.id}/result", headers=_auth_header(student))
    body = resp.json()
    for answer in body["data"]:
        assert "last_error" not in answer["ai_grading"]
```

- [ ] **Step 2: 运行测试确认失败**

Run: `backend/.venv/Scripts/python.exe -m pytest tests/test_student_result_api.py -q`（workdir=`backend`）
Expected: FAIL（404，路由不存在）

- [ ] **Step 3: 实现**

修改 `backend/app/api/grading.py`：import 处补 `ExamRecord` 模型：

```python
from app.models.exam_record import ExamRecord
```

在文件末尾新增路由：

```python
@router.get("/api/records/{record_id}/result")
async def get_my_result(
    record_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["student"]))
):
    record = await db.get(ExamRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    if record.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权查看该记录")
    if record.status not in ("submitted", "graded"):
        raise HTTPException(status_code=403, detail="考试尚未提交")
    answers = await get_record_answers(db, record_id)
    for answer in answers:
        answer["ai_grading"].pop("last_error", None)
    return success_response(data=answers)
```

- [ ] **Step 4: 运行测试确认通过**

Run: `backend/.venv/Scripts/python.exe -m pytest tests/test_student_result_api.py -q`（workdir=`backend`）
Expected: 5 passed

- [ ] **Step 5: 回归 + 提交**

Run: `backend/.venv/Scripts/python.exe -m pytest tests -q`（workdir=`backend`）
Expected: 全部通过

```bash
git add backend/app/api/grading.py backend/tests/test_student_result_api.py
git commit -m "feat: 学生只读考试结果详情接口（含归属与状态校验）"
```

---

### Task 4: 前端 — 考试卡片完成状态 + 进入考试失败链修复

**Files:**
- Modify: `frontend/src/types/exam.ts:10-26`（`Exam` 接口）
- Modify: `frontend/src/pages/Student/ExamList/utils.ts`（重写 `getExamDisplayStatus`）
- Modify: `frontend/src/pages/Student/ExamList/utils.test.ts`（重写状态测试）
- Modify: `frontend/src/pages/Student/ExamList/index.tsx`（标签/按钮/handleStart）
- Modify: `frontend/src/pages/Student/ExamTaking/index.tsx:94-106`（fetchPaper 防御）

**Interfaces:**
- Consumes: `Exam.student_record_status`（Task 1 后端返回）、`StatusTag`（`frontend/src/components/StatusTag/index.tsx`，`StatusType` 含 `not_started/ongoing/finished`，`label` 可覆盖）
- Produces: `ExamDisplayStatus = 'not_taken' | 'ongoing' | 'finished'`；`getExamDisplayStatus(exam) => ExamDisplayStatus`（不再接收时间参数）

- [ ] **Step 1: 写失败测试（更新 `frontend/src/pages/Student/ExamList/utils.test.ts`）**

整文件替换为：

```typescript
import { getExamDisplayStatus, getExamCardColor, EXAM_CARD_COLORS } from './utils';
import type { Exam } from '../../../types/exam';

const makeExam = (overrides: Partial<Exam>): Exam => ({
  id: 1,
  course_id: 1,
  title: '测试考试',
  start_time: '2026-08-10 09:00:00',
  end_time: '2026-08-10 11:00:00',
  duration: 120,
  total_score: 100,
  pass_score: 60,
  random_order: true,
  max_switch: 3,
  status: 'published',
  created_at: '2026-08-01 09:00:00',
  student_record_status: null,
  ...overrides,
});

describe('getExamDisplayStatus', () => {
  it('无记录为未参加', () => {
    expect(getExamDisplayStatus(makeExam({}))).toBe('not_taken');
  });

  it('ongoing 为进行中', () => {
    expect(getExamDisplayStatus(makeExam({ student_record_status: 'ongoing' }))).toBe('ongoing');
  });

  it('submitted 为已完成', () => {
    expect(getExamDisplayStatus(makeExam({ student_record_status: 'submitted' }))).toBe('finished');
  });

  it('graded 为已完成', () => {
    expect(getExamDisplayStatus(makeExam({ student_record_status: 'graded' }))).toBe('finished');
  });
});

describe('getExamCardColor', () => {
  it('相同标题颜色稳定', () => {
    expect(getExamCardColor('期中考试')).toBe(getExamCardColor('期中考试'));
  });

  it('不同标题可得到不同颜色', () => {
    expect(EXAM_CARD_COLORS).toContain(getExamCardColor('期中考试'));
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run（workdir=`frontend`，先设 `$env:CI="true"`）: `npx react-scripts test --watchAll=false --testPathPattern="ExamList/utils"` 
Expected: FAIL（类型错误：`student_record_status` 不在 `Exam` 类型；`getExamDisplayStatus` 签名不匹配）

- [ ] **Step 3: 实现**

`frontend/src/types/exam.ts` 的 `Exam` 接口末尾追加：

```typescript
  student_record_status?: 'ongoing' | 'submitted' | 'graded' | null;
```

`frontend/src/pages/Student/ExamList/utils.ts` 重写（删除 dayjs 导入）：

```typescript
import type { Exam } from '../../../types/exam';

export const EXAM_CARD_COLORS: [string, string][] = [
  ['#3D5A80', '#4A6B94'],
  ['#4E8D8C', '#5FA8A7'],
  ['#7A6F9B', '#9488B4'],
  ['#A05B6D', '#B87A89'],
  ['#8C6D5B', '#A6897A'],
  ['#5B7C99', '#7195B2'],
];

export type ExamDisplayStatus = 'not_taken' | 'ongoing' | 'finished';

export const getExamDisplayStatus = (
  exam: Pick<Exam, 'student_record_status'>,
): ExamDisplayStatus => {
  if (exam.student_record_status === 'ongoing') return 'ongoing';
  if (
    exam.student_record_status === 'submitted' ||
    exam.student_record_status === 'graded'
  ) {
    return 'finished';
  }
  return 'not_taken';
};

export const getExamCardColor = (title: string): [string, string] => {
  let hash = 0;
  for (let i = 0; i < title.length; i += 1) {
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  }
  return EXAM_CARD_COLORS[hash % EXAM_CARD_COLORS.length];
};
```

`frontend/src/pages/Student/ExamList/index.tsx` 修改：

1. `handleStart` 增加 code 检查（24-31 行）：

```typescript
  const handleStart = async (record: Exam) => {
    try {
      const res = await startExam(record.id);
      if (res.code !== 200) {
        message.error(res.message || '开始考试失败');
        return;
      }
      navigate(`/exams/${record.id}/take`, { state: { duration: record.duration } });
    } catch (error) {
      message.error('开始考试失败');
    }
  };
```

2. 卡片渲染处（67-105 行）替换状态/按钮逻辑：

```tsx
            {exams.map((exam) => {
              const displayStatus = getExamDisplayStatus(exam);
              const [from, to] = getExamCardColor(exam.title);
              const canStart = displayStatus !== 'finished';
              const statusLabel =
                displayStatus === 'not_taken' ? '未参加'
                : displayStatus === 'ongoing' ? '进行中'
                : '已完成';
              const buttonText =
                displayStatus === 'not_taken' ? '开始考试'
                : displayStatus === 'ongoing' ? '继续考试'
                : '已提交';
              return (
                <div
                  key={exam.id}
                  className="exam-card"
                  style={{ cursor: canStart ? 'pointer' : 'default' }}
                  onClick={() => canStart && handleStart(exam)}
                >
                  <div className="exam-card-cover" style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}>
                    <span className="exam-card-initial">{exam.title.slice(0, 1)}</span>
                    <span className="exam-card-status">
                      <StatusTag status={displayStatus === 'not_taken' ? 'not_started' : displayStatus} label={statusLabel} />
                    </span>
                  </div>
                  <div className="exam-card-body">
                    <h3 className="exam-card-title">{exam.title}</h3>
                    <p className="exam-card-meta">
                      <CalendarOutlined /> {dayjs(exam.start_time).format('YYYY-MM-DD HH:mm')} - {dayjs(exam.end_time).format('YYYY-MM-DD HH:mm')}
                    </p>
                    <p className="exam-card-meta">
                      <ClockCircleOutlined /> {exam.duration} 分钟 · 总分 {exam.total_score} · 及格 {exam.pass_score}
                    </p>
                    <div className="exam-card-footer">
                      <Button
                        type="primary"
                        disabled={!canStart}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStart(exam);
                        }}
                      >
                        {buttonText}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
```

`frontend/src/pages/Student/ExamTaking/index.tsx` 的 fetchPaper（94-106 行）：

```typescript
  useEffect(() => {
    const fetchPaper = async () => {
      try {
        const res = await getPaper(Number(examId));
        if (!res.data) {
          message.error(res.message || '获取试卷失败');
          return;
        }
        setPaper(res.data);
        setAnswers(res.data.saved_answers || {});
      } catch (error) {
        message.error('获取试卷失败');
      }
    };
    fetchPaper();
  }, [examId, navigate, message]);
```

注意：`navigate` 可能不再被 fetchPaper 使用，检查文件内其他引用（`handleSubmit` 使用 `navigate('/my-records')`，保留 import）。

- [ ] **Step 4: 运行测试确认通过**

Run（workdir=`frontend`，`$env:CI="true"`）: `npx react-scripts test --watchAll=false --testPathPattern="ExamList/utils"`
Expected: PASS

- [ ] **Step 5: ESLint + 全量前端测试 + 提交**

```bash
npx eslint src/pages/Student/ExamList/index.tsx src/pages/Student/ExamList/utils.ts src/pages/Student/ExamTaking/index.tsx src/types/exam.ts
npx react-scripts test --watchAll=false
```

Expected: eslint 无错误，全部测试通过

```bash
git add frontend/src/types/exam.ts frontend/src/pages/Student/ExamList/utils.ts frontend/src/pages/Student/ExamList/utils.test.ts frontend/src/pages/Student/ExamList/index.tsx frontend/src/pages/Student/ExamTaking/index.tsx
git commit -m "feat: 考试列表显示完成状态并修复进入考试失败链"
```

---

### Task 5: 前端 — 学生考试结果详情抽屉

**Files:**
- Modify: `frontend/src/api/grading.ts`（新增 `getMyRecordAnswers`）
- Create: `frontend/src/pages/Student/MyRecords/ResultDrawer.tsx`
- Modify: `frontend/src/pages/Student/MyRecords/index.tsx`
- Test: `frontend/src/pages/Student/MyRecords/index.test.tsx`（新建）

**Interfaces:**
- Consumes: `Answer` 类型（`frontend/src/types/answer.ts`，含 `ai_grading`）、`GET /api/records/{record_id}/result`（Task 3）
- Produces: `getMyRecordAnswers(recordId: number): Promise<ApiResponse<Answer[]>>`；`ResultDrawer` 组件（props: `record: ExamRecord | null; open: boolean; onClose: () => void`）

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/pages/Student/MyRecords/index.test.tsx`：

```tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from 'antd';
import MyRecords from './index';
import * as examsApi from '../../../api/exams';
import * as gradingApi from '../../../api/grading';
import type { ExamRecord } from '../../../types/record';
import type { Answer } from '../../../types/answer';

const records: ExamRecord[] = [
  {
    id: 1,
    exam_id: 10,
    student_id: 1,
    score: 7,
    status: 'submitted',
    switch_count: 0,
    start_time: '2026-08-05 10:00:00',
    submit_time: '2026-08-05 11:00:00',
    exam_title: '期中考试',
  },
];

const answers: Answer[] = [
  {
    id: 1,
    record_id: 1,
    question_id: 1,
    student_answer: '要点A',
    score: 7,
    question: { type: 'essay', content: '简述', score: 10, answer: '要点A' },
    ai_grading: {
      answer_id: 1,
      question_id: 1,
      record_id: 1,
      grading_status: 'completed',
      grading_source: 'ai',
      ai_score: 7,
      ai_feedback: { reasoning: '答案完整', confidence: 0.9 },
    },
  },
];

jest.spyOn(examsApi, 'getMyRecords').mockResolvedValue({
  code: 200, message: 'success', data: records,
} as never);
jest.spyOn(gradingApi, 'getMyRecordAnswers').mockResolvedValue({
  code: 200, message: 'success', data: answers,
} as never);

test('我的记录展示完成状态并可查看结果详情', async () => {
  render(
    <App>
      <MyRecords />
    </App>
  );
  await screen.findByText('期中考试');
  const detailBtn = screen.getByRole('button', { name: /查看详情/ });
  fireEvent.click(detailBtn);
  await waitFor(() => {
    expect(screen.getByText('简述')).toBeInTheDocument();
  });
  expect(screen.getByText('要点A')).toBeInTheDocument();
  expect(screen.getByText(/答案完整/)).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run（workdir=`frontend`，`$env:CI="true"`）: `npx react-scripts test --watchAll=false --testPathPattern="MyRecords"`
Expected: FAIL（`getMyRecordAnswers` 不存在 / 无查看详情按钮）

- [ ] **Step 3: 实现**

`frontend/src/api/grading.ts` 追加：

```typescript
export const getMyRecordAnswers = (recordId: number): Promise<ApiResponse<Answer[]>> =>
  axios.get(`/api/records/${recordId}/result`) as Promise<ApiResponse<Answer[]>>;
```

创建 `frontend/src/pages/Student/MyRecords/ResultDrawer.tsx`（只读展示，参考 `GradingDrawer` 的展示结构但无任何编辑控件）：

```tsx
import React, { useState, useEffect } from 'react';
import { App, Drawer, Descriptions, Tag, Spin, Collapse } from 'antd';
import { getMyRecordAnswers } from '../../../api/grading';
import type { ExamRecord } from '../../../types/record';
import type { Answer } from '../../../types/answer';
import type { QuestionType } from '../../../types/question';

const typeMap: Record<QuestionType, { text: string; color: string }> = {
  single: { text: '单选题', color: 'blue' },
  multiple: { text: '多选题', color: 'geekblue' },
  judge: { text: '判断题', color: 'orange' },
  blank: { text: '填空题', color: 'purple' },
  essay: { text: '简答题', color: 'green' },
};

interface ResultDrawerProps {
  record: ExamRecord | null;
  open: boolean;
  onClose: () => void;
}

const ResultDrawer = ({ record, open, onClose }: ResultDrawerProps) => {
  const { message } = App.useApp();
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !record) return;
    const fetchAnswers = async () => {
      setLoading(true);
      try {
        const res = await getMyRecordAnswers(record.id);
        setAnswers(res.data || []);
      } catch (error) {
        message.error('获取答题详情失败');
      } finally {
        setLoading(false);
      }
    };
    fetchAnswers();
  }, [open, record, message]);

  const totalEarned = answers.reduce((sum, a) => sum + (a.score ?? 0), 0);
  const totalFull = answers.reduce((sum, a) => sum + (a.question?.score || 0), 0);

  return (
    <Drawer
      title={record ? `${record.exam_title || '考试'} · 答题结果` : ''}
      width={720}
      open={open}
      onClose={onClose}
    >
      <Spin spinning={loading}>
        {record && (
          <>
            <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="状态">
                <Tag color={record.status === 'graded' ? 'success' : 'warning'}>
                  {record.status === 'graded' ? '已阅卷' : '待阅卷'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="得分">{totalEarned} / {totalFull}</Descriptions.Item>
              <Descriptions.Item label="提交时间" span={2}>
                {record.submit_time ? new Date(record.submit_time).toLocaleString() : '-'}
              </Descriptions.Item>
            </Descriptions>

            {answers.map((a, index) => (
              <div key={a.id} style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: 16, marginBottom: 16, background: '#fff', boxShadow: 'var(--shadow-card)' }}>
                <Tag color={typeMap[a.question?.type ?? 'blank']?.color}>
                  {typeMap[a.question?.type ?? 'blank']?.text}
                </Tag>
                <strong>第 {index + 1} 题</strong>
                <span>（{a.question?.score}分）</span>
                <p style={{ margin: '8px 0' }}>{a.question?.content}</p>
                {Array.isArray(a.question?.options) && (a.question?.options?.length ?? 0) > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {a.question?.options?.map((opt, i) => (
                      <div key={i}>{String.fromCharCode(65 + i)}. {opt}</div>
                    ))}
                  </div>
                )}
                <p style={{ marginBottom: 4 }}>
                  <strong>正确答案：</strong>{a.question?.answer || '（无）'}
                </p>
                <p style={{ marginBottom: 4 }}>
                  <strong>我的答案：</strong>{a.student_answer || '（未作答）'}
                </p>
                <p style={{ marginBottom: 0 }}>
                  <strong>得分：</strong>{a.score ?? 0} / {a.question?.score}
                  {a.is_correct === true && <Tag color="success" style={{ marginLeft: 8 }}>正确</Tag>}
                  {a.is_correct === false && <Tag color="error" style={{ marginLeft: 8 }}>错误</Tag>}
                </p>
                {a.question?.type === 'essay' && a.ai_grading && (
                  <Collapse
                    size="small"
                    style={{ marginTop: 12 }}
                    items={[{
                      key: 'ai-grading',
                      label: `AI 评分依据（${a.ai_grading.grading_source === 'teacher' ? '教师已复核' : a.ai_grading.grading_status}）`,
                      children: (
                        <div>
                          <div>AI 得分：{a.ai_grading.ai_score ?? '-'} / {a.question.score}</div>
                          <div>置信度：{a.ai_grading.ai_feedback?.confidence ?? '-'}</div>
                          <div>{a.ai_grading.ai_feedback?.reasoning || '评分中'}</div>
                          {a.ai_grading.ai_feedback?.criterion_results?.map((item) => (
                            <div key={item.criterion_id}>{item.criterion_id}: {item.score} 分，{item.reason}</div>
                          ))}
                        </div>
                      ),
                    }]}
                  />
                )}
              </div>
            ))}
            {answers.length === 0 && <div>该记录暂无答案</div>}
          </>
        )}
      </Spin>
    </Drawer>
  );
};

export default ResultDrawer;
```

修改 `frontend/src/pages/Student/MyRecords/index.tsx`：

1. import 追加：

```typescript
import { Button } from 'antd';
import ResultDrawer from './ResultDrawer';
```

2. 组件内追加状态与抽屉渲染：

```typescript
  const [resultRecord, setResultRecord] = useState<ExamRecord | null>(null);
  const [resultOpen, setResultOpen] = useState(false);

  const openResult = (record: ExamRecord) => {
    setResultRecord(record);
    setResultOpen(true);
  };
```

3. columns 追加操作列（在切屏次数列之后）：

```typescript
    {
      title: '操作',
      key: 'action',
      render: (_, record: ExamRecord) => (
        <Button
          type="link"
          disabled={record.status === 'ongoing'}
          onClick={() => openResult(record)}
        >
          查看详情
        </Button>
      ),
    },
```

4. PageCard 内 Table 之后、PageCard 结束前渲染抽屉：

```tsx
        />
        <ResultDrawer
          record={resultRecord}
          open={resultOpen}
          onClose={() => setResultOpen(false)}
        />
      </PageCard>
```

- [ ] **Step 4: 运行测试确认通过**

Run（workdir=`frontend`，`$env:CI="true"`）: `npx react-scripts test --watchAll=false --testPathPattern="MyRecords"`
Expected: PASS

- [ ] **Step 5: ESLint + 全量前端测试 + 提交**

```bash
npx eslint src/api/grading.ts src/pages/Student/MyRecords/index.tsx src/pages/Student/MyRecords/ResultDrawer.tsx
npx react-scripts test --watchAll=false
```

Expected: eslint 无错误，全部测试通过

```bash
git add frontend/src/api/grading.ts frontend/src/pages/Student/MyRecords/index.tsx frontend/src/pages/Student/MyRecords/ResultDrawer.tsx frontend/src/pages/Student/MyRecords/index.test.tsx
git commit -m "feat: 学生端只读考试结果详情抽屉"
```

---

## 验收清单

- [ ] 学生考试列表卡片右上角显示：未参加 / 进行中 / 已完成
- [ ] 已提交/已批改的考试卡片按钮为"已提交"且禁用，点击不跳转
- [ ] 已提交考试进入时不再提示"获取试卷失败"（`handleStart` 检查 code）
- [ ] Redis 重启后，进行中的考试仍可进入继续作答（`get_paper` 重建）
- [ ] "我的记录"每行有"查看详情"（ongoing 禁用），抽屉展示每题得分/标准答案/AI 批改信息
- [ ] 学生只能查看自己的结果（越权 403），教师无法访问学生结果接口（403）
- [ ] 学生结果响应中不含 `last_error`
- [ ] 后端 `pytest tests -q` 全绿；前端 `react-scripts test --watchAll=false` 全绿
