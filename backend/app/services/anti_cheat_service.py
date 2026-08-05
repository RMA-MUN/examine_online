"""防作弊服务：记录并查询学生考试期间的切屏次数，超限时提示强制交卷。"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.redis_client import redis_client
from app.models.exam import Exam
from app.models.exam_record import ExamRecord

async def record_switch(db: AsyncSession, exam_id: int, student_id: int):
    """记录一次切屏行为并同步数据库计数。

    :return: 元组 (切屏信息字典或 None, 错误信息或 None)；切屏信息含当前次数/上限/是否应强制交卷
    """
    # 增加切屏次数
    count = await redis_client.incr(f"exam:switch:{exam_id}:{student_id}")

    # 获取考试信息
    exam = await db.get(Exam, exam_id)
    if not exam:
        return None, "考试不存在"

    # 设置过期时间（如果还没设置）
    # 计数键与考试时长同步过期，避免长期占用内存；ttl 为 -1 表示键无过期时间
    ttl = await redis_client.ttl(f"exam:switch:{exam_id}:{student_id}")
    if ttl == -1:
        await redis_client.expire(f"exam:switch:{exam_id}:{student_id}", exam.duration * 60)

    # 更新数据库中的切屏次数
    result = await db.execute(
        select(ExamRecord).where(
            ExamRecord.student_id == student_id,
            ExamRecord.exam_id == exam_id,
            ExamRecord.status == "ongoing"
        )
    )
    record = result.scalar_one_or_none()
    if record:
        record.switch_count = count
        await db.commit()

    # 检查是否超过最大次数
    # 达到上限即触发强制交卷，由前端收到标志后执行交卷
    should_force_submit = count >= exam.max_switch

    return {
        "switch_count": count,
        "max_switch": exam.max_switch,
        "should_force_submit": should_force_submit
    }, None

async def get_switch_status(db: AsyncSession, exam_id: int, student_id: int):
    """查询学生当前的切屏次数与上限。

    :return: 切屏信息字典；考试不存在时返回 None
    """
    count = await redis_client.get(f"exam:switch:{exam_id}:{student_id}")
    count = int(count) if count else 0

    exam = await db.get(Exam, exam_id)
    if not exam:
        return None

    return {
        "switch_count": count,
        "max_switch": exam.max_switch
    }
