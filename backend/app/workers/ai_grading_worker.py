import asyncio
import logging
import socket
from uuid import uuid4

from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.logging_config import setup_logging
from app.models.answer import Answer
from app.models.question import Question
from app.schemas.ai_grading import AiGradingInput
from app.schemas.question import RubricItem
from app.services.ai_grading_agent import grade_essay
from app.services.ai_grading_service import (
    claim_next_ai_grading_task,
    complete_ai_grading_task,
    fail_ai_grading_task,
    validate_grading_result,
)

logger = logging.getLogger("app.worker.ai_grading")

"""AI 评分后台 worker：常驻协程轮询数据库中的待评分任务，调用 AI 模型评分并回写结果。"""


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
                    result = await grade_essay(grading_input)
                    logger.info(
                        "AI 模型返回结果 answer_id=%s score=%s confidence=%s reasoning=%s",
                        answer_id,
                        result.score,
                        result.confidence,
                        (result.reasoning or "")[:80],
                    )
                    validate_grading_result(result, rubric or None, question.score)
                    # 校验通过后把评分结果写入答案，完成本次评分任务
                    await complete_ai_grading_task(db, task_id, result, settings.AI_MODEL or "unknown")
                    logger.info(
                        "AI 评分任务完成 answer_id=%s score=%s 已写入答案",
                        answer_id,
                        result.score,
                    )
                except Exception as exc:
                    # 单任务失败兜底：回滚事务并记录失败原因，不影响 worker 继续处理其他任务
                    await db.rollback()
                    await fail_ai_grading_task(db, task_id, exc)
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
