"""AI 评分任务队列服务测试：并发领取、锁续期、完成/失败的状态与归属校验、幂等入队。"""

import asyncio
from datetime import datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.models.ai_grading_task import AiGradingTask
from app.models.answer import Answer
from app.schemas.ai_grading import AiGradingResult
from app.services.ai_grading_service import (
    complete_ai_grading_task,
    enqueue_ai_grading_task,
    fail_ai_grading_task,
    renew_ai_grading_lock,
)


def _make_result(score: int = 3) -> AiGradingResult:
    return AiGradingResult(
        score=score,
        reasoning="答案正确",
        criterion_results=[{"criterion_id": "default", "score": score, "reason": "符合要求"}],
        confidence=0.9,
    )


async def _create_answer(db, grading_source: str = "pending") -> Answer:
    answer = Answer(
        record_id=1,
        question_id=1,
        student_answer="学生答案",
        score=0,
        grading_source=grading_source,
    )
    db.add(answer)
    await db.flush()
    return answer


async def _create_task(
    db,
    answer_id: int,
    status: str = "pending",
    locked_by: str | None = None,
    attempt_count: int = 0,
    locked_at: datetime | None = None,
) -> AiGradingTask:
    task = AiGradingTask(
        answer_id=answer_id,
        status=status,
        locked_by=locked_by,
        attempt_count=attempt_count,
    )
    if locked_at:
        task.locked_at = locked_at
    db.add(task)
    await db.flush()
    return task


@pytest.mark.asyncio
async def test_complete_skips_task_already_completed_by_other_worker(db):
    answer = await _create_answer(db)
    task = await _create_task(db, answer.id, status="completed")

    result = await complete_ai_grading_task(db, task.id, _make_result(), "test-model", worker_id="w1")

    assert result is False
    await db.refresh(answer)
    assert answer.ai_score is None
    assert answer.grading_source == "pending"


@pytest.mark.asyncio
async def test_complete_skips_task_claimed_by_other_worker(db):
    answer = await _create_answer(db)
    task = await _create_task(db, answer.id, status="processing", locked_by="w2")

    result = await complete_ai_grading_task(db, task.id, _make_result(), "test-model", worker_id="w1")

    assert result is False
    await db.refresh(answer)
    assert answer.ai_score is None


@pytest.mark.asyncio
async def test_complete_writes_result_for_owned_processing_task(db):
    answer = await _create_answer(db)
    task = await _create_task(db, answer.id, status="processing", locked_by="w1")

    result = await complete_ai_grading_task(db, task.id, _make_result(), "test-model", worker_id="w1")

    assert result is True
    await db.refresh(answer)
    assert answer.ai_score == 3
    assert answer.grading_source == "ai"
    await db.refresh(task)
    assert task.status == "completed"


@pytest.mark.asyncio
async def test_fail_does_not_requeue_completed_task(db):
    answer = await _create_answer(db)
    task = await _create_task(db, answer.id, status="completed", locked_by="w1")

    await fail_ai_grading_task(db, task.id, ValueError("AI 超时"), worker_id="w1")

    await db.refresh(task)
    assert task.status == "completed"
    assert task.last_error is None


@pytest.mark.asyncio
async def test_fail_skips_when_locked_by_other_worker(db):
    answer = await _create_answer(db)
    task = await _create_task(db, answer.id, status="processing", locked_by="w2", attempt_count=1)

    await fail_ai_grading_task(db, task.id, ValueError("AI 超时"), worker_id="w1")

    await db.refresh(task)
    assert task.status == "processing"
    assert task.locked_by == "w2"
    assert task.attempt_count == 1
    assert task.last_error is None


@pytest.mark.asyncio
async def test_fail_requeues_owned_task_with_exponential_backoff(db):
    answer = await _create_answer(db)
    task = await _create_task(db, answer.id, status="processing", locked_by="w1", attempt_count=1)
    now = datetime(2026, 1, 1, 12, 0, 0)

    await fail_ai_grading_task(db, task.id, ValueError("AI 超时"), worker_id="w1", now=now)

    await db.refresh(task)
    assert task.status == "pending"
    assert task.available_at == now + timedelta(seconds=2)
    assert task.locked_by is None


@pytest.mark.asyncio
async def test_renew_lock_refreshes_locked_at_for_owner(db):
    answer = await _create_answer(db)
    locked_at = datetime(2026, 1, 1, 12, 0, 0)
    task = await _create_task(db, answer.id, status="processing", locked_by="w1", locked_at=locked_at)
    now = datetime(2026, 1, 1, 12, 1, 0)

    renewed = await renew_ai_grading_lock(db, task.id, "w1", now=now)

    assert renewed is True
    await db.refresh(task)
    assert task.locked_at == now


@pytest.mark.asyncio
async def test_renew_lock_returns_false_when_task_completed(db):
    answer = await _create_answer(db)
    task = await _create_task(db, answer.id, status="completed", locked_by="w1")

    renewed = await renew_ai_grading_lock(db, task.id, "w1")

    assert renewed is False
    await db.refresh(task)
    assert task.status == "completed"


@pytest.mark.asyncio
async def test_renew_lock_returns_false_for_other_worker(db):
    answer = await _create_answer(db)
    locked_at = datetime(2026, 1, 1, 12, 0, 0)
    task = await _create_task(db, answer.id, status="processing", locked_by="w2", locked_at=locked_at)

    renewed = await renew_ai_grading_lock(db, task.id, "w1")

    assert renewed is False
    await db.refresh(task)
    assert task.locked_at == locked_at


@pytest.mark.asyncio
async def test_enqueue_returns_existing_task_without_duplicate(db):
    answer = await _create_answer(db)
    task = await _create_task(db, answer.id, status="pending")
    await db.commit()

    result = await enqueue_ai_grading_task(db, answer.id)

    assert result.id == task.id
    count = await db.scalar(
        select(func.count()).select_from(AiGradingTask).where(AiGradingTask.answer_id == answer.id)
    )
    assert count == 1


@pytest.mark.asyncio
async def test_enqueue_recovers_when_duplicate_lands_in_race_window(db, monkeypatch):
    answer = await _create_answer(db)
    existing = await _create_task(db, answer.id, status="pending")
    await db.commit()

    real_scalar = db.scalar
    blind_first = {"called": False}

    async def blind_first_scalar(stmt):
        if not blind_first["called"]:
            blind_first["called"] = True
            return None
        return await real_scalar(stmt)

    monkeypatch.setattr(db, "scalar", blind_first_scalar)

    result = await enqueue_ai_grading_task(db, answer.id)

    assert result.id == existing.id
    count = await db.scalar(
        select(func.count()).select_from(AiGradingTask).where(AiGradingTask.answer_id == answer.id)
    )
    assert count == 1


@pytest.mark.asyncio
async def test_enqueue_creates_pending_task(db):
    answer = await _create_answer(db)

    task = await enqueue_ai_grading_task(db, answer.id)

    assert task.status == "pending"
    assert task.answer_id == answer.id


@pytest.mark.asyncio
async def test_grading_call_renews_lock_while_ai_running(db, monkeypatch):
    from app.workers import ai_grading_worker as worker_mod

    renew_calls = []

    async def fake_renew(db_, task_id, worker_id, now=None):
        renew_calls.append(1)
        return True

    async def fake_grade(grading_input):
        await asyncio.sleep(0.3)
        return _make_result()

    monkeypatch.setattr(worker_mod, "grade_essay", fake_grade)
    monkeypatch.setattr(worker_mod, "renew_ai_grading_lock", fake_renew)

    result = await worker_mod.grade_essay_with_lock_renewal(db, 1, "w1", object(), renew_interval=0.05)

    assert result.score == 3
    assert len(renew_calls) >= 2


@pytest.mark.asyncio
async def test_grading_call_aborted_when_lock_lost(db, monkeypatch):
    from app.workers import ai_grading_worker as worker_mod

    cancelled = []

    async def fake_renew(db_, task_id, worker_id, now=None):
        return False

    async def fake_grade(grading_input):
        try:
            await asyncio.sleep(60)
        except asyncio.CancelledError:
            cancelled.append(1)
            raise

    monkeypatch.setattr(worker_mod, "grade_essay", fake_grade)
    monkeypatch.setattr(worker_mod, "renew_ai_grading_lock", fake_renew)

    with pytest.raises(RuntimeError, match="锁"):
        await worker_mod.grade_essay_with_lock_renewal(db, 1, "w1", object(), renew_interval=0.05)

    assert cancelled == [1]
