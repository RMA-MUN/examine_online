"""成绩分析聚合服务：只读 SELECT，不新增表、不改现有表。"""

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.answer import Answer
from app.models.exam import Exam
from app.models.exam_record import ExamRecord
from app.models.question import Question
from app.models.user import User


async def get_exam_question_stats(db: AsyncSession, exam_id: int) -> list[dict]:
    """逐题统计：平均分、正确率与得分分布（纯聚合 Answer/Question）。"""
    q_result = await db.execute(select(Question).where(Question.exam_id == exam_id))
    questions = q_result.scalars().all()
    out: list[dict] = []
    for q in questions:
        a_result = await db.execute(select(Answer).where(Answer.question_id == q.id))
        answers = a_result.scalars().all()
        scores = [a.score if a.score is not None else 0 for a in answers]
        avg_score = round(sum(scores) / len(scores), 2) if scores else 0
        judged = [a for a in answers if a.is_correct is not None]
        if judged:
            correct_rate = round(sum(1 for a in judged if a.is_correct) / len(judged), 4)
        elif q.score:
            correct_rate = round(avg_score / q.score, 4) if scores else 0
        else:
            correct_rate = 0
        full = sum(1 for s in scores if q.score and s >= q.score)
        zero = sum(1 for s in scores if s == 0)
        partial = len(scores) - full - zero
        out.append(
            {
                "question_id": q.id,
                "type": q.type,
                "avg_score": avg_score,
                "correct_rate": correct_rate,
                "distribution": {"full": full, "partial": partial, "zero": zero, "total": len(scores)},
            }
        )
    return out


async def get_exam_student_scores(
    db: AsyncSession,
    exam_id: int,
    page: int = 1,
    page_size: int = 10,
    class_id: int | None = None,
    keyword: str | None = None,
) -> dict:
    """学生成绩分页：按分数降序排名（纯聚合 ExamRecord/User）。"""
    query = (
        select(ExamRecord, User)
        .join(User, User.id == ExamRecord.student_id)
        .where(ExamRecord.exam_id == exam_id)
    )
    if class_id is not None:
        query = query.where(User.class_id == class_id)
    if keyword:
        like = f"%{keyword}%"
        query = query.where(or_(User.name.ilike(like), User.username.ilike(like)))
    result = await db.execute(query)
    rows = result.all()
    # 分数降序（None 视作 -1 沉底），提交早者优先，保证排名稳定
    rows = sorted(
        rows,
        key=lambda r: (-(r[0].score if r[0].score is not None else -1), r[0].submit_time or r[0].start_time),
    )
    total = len(rows)
    items: list[dict] = []
    for idx, (record, student) in enumerate(rows, start=1):
        items.append(
            {
                "student": {
                    "id": student.id,
                    "name": student.name,
                    "username": student.username,
                    "class_id": student.class_id,
                },
                "score": record.score,
                "switch_count": record.switch_count,
                "status": record.status,
                "rank": idx,
            }
        )
    start = (page - 1) * page_size
    return {"total": total, "items": items[start : start + page_size]}
