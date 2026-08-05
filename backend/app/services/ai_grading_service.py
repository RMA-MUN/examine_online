"""AI 评分任务队列服务：任务入队、并发领取、结果落库、失败重试与结果校验。"""

from datetime import datetime, timedelta

from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_grading_task import AiGradingTask
from app.models.answer import Answer
from app.schemas.ai_grading import AiGradingResult
from app.schemas.question import RubricItem


def validate_grading_result(
    result: AiGradingResult,
    rubric: list[RubricItem] | None,
    question_score: int,
) -> None:
    """校验 AI 评分结果：要点不重复、与 rubric 一致、分项与总分都不超限。

    :raises ValueError: 校验不通过时抛出，带中文错误说明
    """
    criterion_results = result.criterion_results
    result_ids = [item.criterion_id for item in criterion_results]

    if len(result_ids) != len(set(result_ids)):
        raise ValueError("评分要点不能重复")

    if rubric:
        # 有 rubric 的题目：AI 返回的要点必须与题目 rubric 完全一致
        rubric_by_id = {item.criterion_id: item for item in rubric}
        if set(result_ids) != set(rubric_by_id):
            raise ValueError("评分要点与题目 rubric 不一致")
        for item in criterion_results:
            if item.score > rubric_by_id[item.criterion_id].points:
                raise ValueError("分项得分超过评分要点满分")
    else:
        # 无 rubric 的题目：只允许返回默认评分要点
        if len(criterion_results) != 1 or result_ids != ["default"]:
            raise ValueError("无 rubric 题目必须返回默认评分要点")
        if criterion_results[0].score > question_score:
            raise ValueError("分项得分超过题目满分")

    item_total = sum(item.score for item in criterion_results)
    # 总分必须等于分项之和且不超过题目满分，防止 AI 捏造分数
    if result.score != item_total or result.score > question_score:
        raise ValueError("总分与分项得分不一致")


async def enqueue_ai_grading_task(db: AsyncSession, answer_id: int) -> AiGradingTask:
    """将答案加入 AI 评分队列；已有任务时直接返回，保证幂等。"""
    existing = await db.scalar(select(AiGradingTask).where(AiGradingTask.answer_id == answer_id))
    if existing:
        return existing
    task = AiGradingTask(answer_id=answer_id, status="pending")
    db.add(task)
    await db.flush()
    return task


async def claim_next_ai_grading_task(
    db: AsyncSession,
    worker_id: str,
    now: datetime | None = None,
) -> AiGradingTask | None:
    """领取下一个待处理的评分任务。

    :return: 领取到的任务；无任务可领时返回 None
    """
    now = now or datetime.now()
    # 领取待处理任务，或回收崩溃 worker 遗留、处理超时的任务
    # 锁超时回收窗口为 5 分钟：locked_at 早于该时间点的 processing 任务视为失联
    reclaim_before = now - timedelta(minutes=5)
    task = await db.scalar(
        select(AiGradingTask)
        .where(
            or_(
                and_(AiGradingTask.status == "pending", AiGradingTask.available_at <= now),
                and_(AiGradingTask.status == "processing", AiGradingTask.locked_at < reclaim_before),
            )
        )
        .order_by(AiGradingTask.available_at, AiGradingTask.id)
        .with_for_update(skip_locked=True)
        .limit(1)
    )
    if not task:
        return None
    # 加锁后标记为处理中并记录领取人，防止多 worker 重复处理同一任务
    task.status = "processing"
    task.attempt_count += 1
    task.locked_at = now
    task.locked_by = worker_id
    await db.flush()
    return task


async def complete_ai_grading_task(
    db: AsyncSession,
    task_id: int,
    result: AiGradingResult,
    model_name: str,
) -> None:
    """AI 评分成功：写入评分结果，并在无人工干预时同步学生分数与总分。"""
    task = await db.scalar(select(AiGradingTask).where(AiGradingTask.id == task_id).with_for_update())
    if not task:
        raise ValueError("AI 评分任务不存在")
    answer = await db.scalar(select(Answer).where(Answer.id == task.answer_id).with_for_update())
    if not answer:
        raise ValueError("AI 评分答案不存在")

    now = datetime.now()
    answer.ai_score = result.score
    answer.ai_feedback = result.model_dump()
    answer.ai_model = model_name
    answer.ai_graded_at = now
    # 仅当答案仍处于待批改/纯 AI 状态时采用 AI 分数；教师已人工批改过的答案不被覆盖
    if answer.grading_source in {"pending", "ai"}:
        answer.score = result.score
        answer.grading_source = "ai"
        from app.services.grading_service import recalculate_total_score

        # commit=False：总分更新与任务完成状态在同一事务内一并提交
        await recalculate_total_score(db, answer.record_id, commit=False)

    task.status = "completed"
    task.completed_at = now
    task.last_error = None
    task.locked_at = None
    task.locked_by = None
    await db.commit()


async def fail_ai_grading_task(
    db: AsyncSession,
    task_id: int,
    error: Exception | str,
    now: datetime | None = None,
) -> None:
    """AI 评分失败：按指数退避安排重试，超过最大次数后标记失败。"""
    task = await db.scalar(select(AiGradingTask).where(AiGradingTask.id == task_id).with_for_update())
    if not task:
        return
    now = now or datetime.now()
    message = str(error).replace("\n", " ")[:500]
    task.last_error = message
    task.locked_at = None
    task.locked_by = None
    if task.attempt_count >= task.max_attempts:
        # 重试次数耗尽：任务定档为 failed，待批改答案标记为评分失败供人工介入
        task.status = "failed"
        answer = await db.get(Answer, task.answer_id)
        if answer and answer.grading_source == "pending":
            answer.grading_source = "failed"
    else:
        # 指数退避：第 n 次失败后延迟 2^n 秒再重试
        task.status = "pending"
        task.available_at = now + timedelta(seconds=2 ** task.attempt_count)
    await db.commit()


async def retry_ai_grading_task(db: AsyncSession, answer_id: int) -> AiGradingTask | None:
    """手动重试已失败的评分任务，将其重新置为待处理。

    :return: 重试成功返回任务对象；无失败任务时返回 None
    """
    task = await db.scalar(select(AiGradingTask).where(AiGradingTask.answer_id == answer_id).with_for_update())
    if not task or task.status != "failed":
        return None
    task.status = "pending"
    task.available_at = datetime.now()
    task.locked_at = None
    task.locked_by = None
    task.last_error = None
    answer = await db.get(Answer, answer_id)
    if answer and answer.grading_source == "failed":
        answer.grading_source = "pending"
    await db.commit()
    return task
