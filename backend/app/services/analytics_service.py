"""成绩分析聚合服务：只读 SELECT，不新增表、不改现有表。"""

import json
import math

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.answer import Answer
from app.models.class_ import SchoolClass
from app.models.exam import Exam
from app.models.exam_record import ExamRecord
from app.models.question import Question
from app.models.user import User

# 分数段与前端 Analytics mock（bins ل）对齐：标签用 en-dash。
SCORE_BINS: list[tuple[str, int, int]] = [
    ("0–39", 0, 40),
    ("40–49", 40, 50),
    ("50–59", 50, 60),
    ("60–69", 60, 70),
    ("70–79", 70, 80),
    ("80–89", 80, 90),
    ("90–100", 90, 101),
]


def knowledge_key(tags) -> str:
    """取 Question.tags 首个标签为知识点名；缺失/非法时归入"综合"。"""
    if isinstance(tags, str):
        try:
            tags = json.loads(tags)
        except (ValueError, TypeError):
            return "综合"
    if isinstance(tags, list) and tags:
        first = tags[0]
        if isinstance(first, str) and first.strip():
            return first
    return "综合"


async def get_exam_question_stats(db: AsyncSession, exam_id: int) -> list[dict]:
    """逐题统计：平均分、正确率与得分分布（纯聚合 Answer/Question）。

    向后兼容：原有 question_id/type/avg_score/correct_rate/distribution 字段不变，
    仅新增 knowledge（知识点名，取 tags 首项）、p（难度系数=平均分/满分）、
    d（区分度，高低 27% 分组均值差/满分）。
    """
    q_result = await db.execute(select(Question).where(Question.exam_id == exam_id))
    questions = q_result.scalars().all()
    high_ids, low_ids = await _high_low_record_ids(db, exam_id)
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
        full_score = q.score or 0
        p = round(avg_score / full_score, 4) if full_score and scores else 0
        by_record = {a.record_id: (a.score if a.score is not None else 0) for a in answers}
        d = _discrimination_value(by_record, high_ids, low_ids, full_score)
        out.append(
            {
                "question_id": q.id,
                "type": q.type,
                "avg_score": avg_score,
                "correct_rate": correct_rate,
                "distribution": {"full": full, "partial": partial, "zero": zero, "total": len(scores)},
                "knowledge": knowledge_key(q.tags),
                "p": p,
                "d": d,
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


async def get_knowledge_stats(db: AsyncSession, exam_id: int) -> list[dict]:
    """按 Question.tags 首项聚合得分率：[{"name", "rate"}]，rate 为百分比（1 位小数）。"""
    q_rows = (await db.execute(select(Question).where(Question.exam_id == exam_id))).scalars().all()
    out: dict[str, dict] = {}
    for q in q_rows:
        key = knowledge_key(q.tags)
        ans = (await db.execute(select(Answer).where(Answer.question_id == q.id))).scalars().all()
        got = sum(a.score or 0 for a in ans)
        full = (q.score or 0) * len(ans)
        d = out.setdefault(key, {"name": key, "got": 0, "full": 0})
        d["got"] += got
        d["full"] += full
    return [{"name": k, "rate": round(v["got"] / v["full"] * 100, 1) if v["full"] else 0} for k, v in out.items()]


async def get_class_compare(db: AsyncSession, exam_id: int) -> list[dict]:
    """按 User.class_id 聚合班级对比：[{"class_id", "name", "avg", "pass_rate", "count"}]。

    及格线取 Exam.pass_score（缺失默认 60）；无班级学生归入"未分班"。
    """
    exam = await db.get(Exam, exam_id)
    pass_score = exam.pass_score if exam is not None and exam.pass_score is not None else 60
    result = await db.execute(
        select(ExamRecord, User)
        .join(User, User.id == ExamRecord.student_id)
        .where(ExamRecord.exam_id == exam_id)
    )
    groups: dict[int | None, list[int]] = {}
    for record, student in result.all():
        groups.setdefault(student.class_id, []).append(record.score or 0)
    names: dict[int, str] = {}
    class_ids = [cid for cid in groups if cid is not None]
    if class_ids:
        c_rows = (await db.execute(select(SchoolClass).where(SchoolClass.id.in_(class_ids)))).scalars().all()
        names = {c.id: c.name for c in c_rows}
    out: list[dict] = []
    for cid, scores in groups.items():
        n = len(scores)
        avg = round(sum(scores) / n, 1) if n else 0
        passed = sum(1 for s in scores if s >= pass_score)
        rate = round(passed / n * 100, 1) if n else 0
        out.append(
            {
                "class_id": cid,
                "name": names.get(cid, "未分班") if cid is not None else "未分班",
                "avg": avg,
                "pass_rate": rate,
                "count": n,
            }
        )
    out.sort(key=lambda r: (r["class_id"] is None, r["class_id"] or 0))
    return out


async def get_score_bins(db: AsyncSession, exam_id: int) -> list[dict]:
    """分数段分布（固定 7 段，与前端 Analytics mock 标签对齐）：[{"label", "count"}]。"""
    result = await db.execute(select(ExamRecord.score).where(ExamRecord.exam_id == exam_id))
    scores = [s if s is not None else 0 for s in result.scalars().all()]
    return [
        {"label": label, "count": sum(1 for s in scores if lo <= s < hi)}
        for label, lo, hi in SCORE_BINS
    ]


async def _high_low_record_ids(db: AsyncSession, exam_id: int) -> tuple[set[int], set[int]]:
    """按 ExamRecord.score 降序取高低 27% 分组记录 ID（N<2 时分组重叠，D 自然为 0）。"""
    result = await db.execute(select(ExamRecord).where(ExamRecord.exam_id == exam_id))
    records = sorted(
        result.scalars().all(),
        key=lambda r: (-(r.score if r.score is not None else -1), r.submit_time or r.start_time),
    )
    n = len(records)
    if n == 0:
        return set(), set()
    g = max(1, math.floor(n * 0.27))
    return {r.id for r in records[:g]}, {r.id for r in records[n - g :]}


def _discrimination_value(
    by_record: dict[int, int], high_ids: set[int], low_ids: set[int], full_score: int
) -> float:
    """区分度 D=(高分组均值-低分组均值)/满分；缺考题作答按 0 分计。"""
    if not full_score:
        return 0
    high = [by_record.get(rid, 0) for rid in high_ids]
    low = [by_record.get(rid, 0) for rid in low_ids]
    mean_high = sum(high) / len(high) if high else 0
    mean_low = sum(low) / len(low) if low else 0
    return round((mean_high - mean_low) / full_score, 2)


async def get_discrimination(db: AsyncSession, exam_id: int) -> list[dict]:
    """逐题区分度：[{"question_id", "p", "d"}]，p=难度系数（平均分/满分），D 见高低分组法。"""
    q_rows = (
        await db.execute(
            select(Question)
            .where(Question.exam_id == exam_id)
            .order_by(Question.sort_order, Question.id)
        )
    ).scalars().all()
    high_ids, low_ids = await _high_low_record_ids(db, exam_id)
    out: list[dict] = []
    for q in q_rows:
        ans = (await db.execute(select(Answer).where(Answer.question_id == q.id))).scalars().all()
        scores = [a.score if a.score is not None else 0 for a in ans]
        avg = round(sum(scores) / len(scores), 2) if scores else 0
        full_score = q.score or 0
        p = round(avg / full_score, 4) if full_score and scores else 0
        by_record = {a.record_id: (a.score if a.score is not None else 0) for a in ans}
        out.append(
            {"question_id": q.id, "p": p, "d": _discrimination_value(by_record, high_ids, low_ids, full_score)}
        )
    return out
