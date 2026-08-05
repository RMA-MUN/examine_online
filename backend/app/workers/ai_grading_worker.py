import asyncio
import logging
import socket
from contextlib import asynccontextmanager
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session
from app.logging_config import setup_logging
from app.models.answer import Answer
from app.models.question import Question
from app.schemas.ai_grading import AiGradingInput, AiGradingResult
from app.schemas.question import RubricItem
from app.services.ai_grading_agent import grade_essay
from app.services.ai_grading_service import (
    claim_next_ai_grading_task,
    complete_ai_grading_task,
    fail_ai_grading_task,
    renew_ai_grading_lock,
    validate_grading_result,
)

logger = logging.getLogger("app.worker.ai_grading")

"""AI 评分后台 worker：常驻协程轮询数据库中的待评分任务，调用 AI 模型评分并回写结果。"""


@asynccontextmanager
async def ai_grading_workers(concurrency: int = 1):
    """启动指定数量的 AI 评分 worker 协程，退出时统一取消并等待结束。

    每个协程独立领取任务（数据库 SKIP LOCKED 仲裁），并发数受数据库
    连接池与 AI 服务限流约束，默认由配置 AI_WORKER_CONCURRENCY 控制。
    """
    tasks = [asyncio.create_task(run_worker()) for _ in range(max(concurrency, 1))]
    logger.info("AI 评分 worker 已启动 %s 个并发协程", len(tasks))
    try:
        yield tasks
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        logger.info("AI 评分 worker 已全部停止")


async def grade_essay_with_lock_renewal(
    db: AsyncSession,
    task_id: int,
    worker_id: str,
    grading_input: AiGradingInput,
    renew_interval: float = 30.0,
) -> AiGradingResult:
    """调用 AI 评分，并在调用期间周期性续期任务锁。

    防止长耗时 AI 调用（超过锁回收窗口）被其他 worker 回收导致重复评分；
    续期失败说明任务已被回收或完成，此时取消本次 AI 调用并报错。
    """
    ai_call = asyncio.create_task(grade_essay(grading_input))
    try:
        while True:
            done, _ = await asyncio.wait({ai_call}, timeout=renew_interval)
            if done:
                return ai_call.result()
            if not await renew_ai_grading_lock(db, task_id, worker_id):
                ai_call.cancel()
                await asyncio.gather(ai_call, return_exceptions=True)
                raise RuntimeError("AI 评分任务锁已失效，可能已被其他 worker 回收")
    finally:
        if not ai_call.done():
            ai_call.cancel()


async def run_worker() -> None:
    """worker 主循环：循环领取 AI 评分任务，评分成功则写入成绩，失败则记录失败原因；无任务时休眠等待。"""
    # 生成唯一 worker 标识，多实例部署时用于区分任务归属
    worker_id = f"{socket.gethostname()}-{uuid4().hex[:8]}"
    logger.info("AI 评分 worker 启动，worker_id=%s", worker_id)
    while True:
        try:
            async with async_session() as db:
                # 在事务内领取任务，避免多个 worker 并发拿到同一任务重复评分
                async with db.begin():
                    task = await claim_next_ai_grading_task(db, worker_id)
                    if task:
                        task_id = task.id
                        answer_id = task.answer_id
                    else:
                        task_id = None
                # 暂无待处理任务时休眠一段时间后继续轮询
                if not task_id:
                    await asyncio.sleep(settings.AI_WORKER_POLL_SECONDS)
                    continue

                try:
                    # 加载任务关联的答案与题目；题目缺失或类型不是简答/填空则视为无效任务
                    answer = await db.scalar(select(Answer).where(Answer.id == answer_id))
                    question = await db.scalar(select(Question).where(Question.id == answer.question_id)) if answer else None
                    if not answer or not question or question.type not in ("essay", "blank"):
                        raise ValueError("任务未关联有效简答题或填空题")
                    logger.info(
                        "领取 AI 评分任务 answer_id=%s question_id=%s type=%s 题目满分=%s",
                        answer_id,
                        question.id,
                        question.type,
                        question.score,
                    )
                    rubric = [RubricItem.model_validate(item) for item in question.grading_rubric or []]
                    grading_input = AiGradingInput(
                        question_content=question.content,
                        question_score=question.score,
                        reference_answer=question.answer,
                        analysis=question.analysis,
                        rubric=question.grading_rubric,
                        student_answer=answer.student_answer,
                    )
                    logger.info(
                        "开始调用 AI 模型 answer_id=%s model=%s base_url=%s",
                        answer_id,
                        settings.AI_MODEL,
                        settings.AI_BASE_URL,
                    )
                    result = await grade_essay_with_lock_renewal(db, task_id, worker_id, grading_input)
                    logger.info(
                        "AI 模型返回结果 answer_id=%s score=%s confidence=%s reasoning=%s",
                        answer_id,
                        result.score,
                        result.confidence,
                        (result.reasoning or "")[:80],
                    )
                    validate_grading_result(result, rubric or None, question.score)
                    # 校验通过后把评分结果写入答案，完成本次评分任务；锁已失效时放弃写入
                    if not await complete_ai_grading_task(db, task_id, result, settings.AI_MODEL or "unknown", worker_id):
                        logger.warning("AI 评分任务已被回收或完成，放弃写入 answer_id=%s", answer_id)
                    else:
                        logger.info(
                            "AI 评分任务完成 answer_id=%s score=%s 已写入答案",
                            answer_id,
                            result.score,
                        )
                except Exception as exc:
                    # 单任务失败兜底：回滚事务并记录失败原因，不影响 worker 继续处理其他任务
                    await db.rollback()
                    await fail_ai_grading_task(db, task_id, exc, worker_id)
                    logger.exception("AI 评分失败 answer_id=%s", answer_id)
        except Exception as exc:
            # 循环级兜底：即使出现未预期异常也保证 worker 存活，稍后重试
            logger.exception("AI 评分 worker 循环异常，稍后重试")
            await asyncio.sleep(settings.AI_WORKER_POLL_SECONDS)


if __name__ == "__main__":
    setup_logging()
    try:
        asyncio.run(run_worker())
    except KeyboardInterrupt:
        pass
