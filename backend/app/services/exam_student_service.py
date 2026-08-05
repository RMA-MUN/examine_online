"""学生考试服务：开始考试、获取试卷、自动保存答案、交卷与客观题自动批改。"""

import json
import random
import re
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select
from app.models.exam import Exam
from app.models.question import Question
from app.models.exam_record import ExamRecord
from app.models.answer import Answer
from app.redis_client import redis_client
from app.services.ai_grading_service import enqueue_ai_grading_task

# 判断题答案的各种合法写法统一归一化为"对"/"错"
_JUDGE_ANSWER_MAP = {
    "TRUE": "对", "FALSE": "错",
    "正确": "对", "错误": "错",
    "T": "对", "F": "错",
    "YES": "对", "NO": "错",
    "Y": "对", "N": "错",
    "1": "对", "0": "错",
}


def _normalize_answer(q_type: str, value) -> str:
    """归一化答案：统一大小写；多选题按字母排序使选项顺序不影响判定；判断题映射为对/错。"""
    if value is None:
        return ""
    v = str(value).strip().upper()
    if q_type == "multiple":
        # 多选题去分隔符后排序，避免 "AB" 与 "BA" 被判定为不同答案
        v = re.sub(r"[,，\s]+", "", v)
        v = "".join(sorted(v))
    if q_type == "judge":
        v = _JUDGE_ANSWER_MAP.get(v, v)
    return v

async def start_exam(db: AsyncSession, exam_id: int, student_id: int):
    """学生开始考试：校验资格/考试状态/时间，创建考试记录并缓存试卷。

    :return: 元组 (考试记录或 None, 错误信息或 None)
    """
    from app.services.exam_service import is_student_eligible
    if not await is_student_eligible(db, exam_id, student_id):
        return None, "你没有参加该考试的资格"
    # 检查考试是否存在
    exam = await db.get(Exam, exam_id)
    if not exam or exam.status != "published":
        return None, "考试不存在或未发布"

    now = datetime.now()
    if now < exam.start_time:
        return None, "考试尚未开始"

    # 检查是否已参加过
    result = await db.execute(
        select(ExamRecord).where(
            ExamRecord.student_id == student_id,
            ExamRecord.exam_id == exam_id
        )
    )
    existing_record = result.scalar_one_or_none()
    # 考试已过截止时间时：已有进行中记录的考生仍可继续，其余一律拒绝
    if now > exam.end_time and not (existing_record and existing_record.status == "ongoing"):
        return None, "考试已结束"

    if existing_record and existing_record.status == "ongoing":
        return existing_record, None
    
    if existing_record:
        return None, "已参加过该考试"
    
    # 创建考试记录
    record = ExamRecord(
        student_id=student_id,
        exam_id=exam_id,
        start_time=datetime.now(),
        status="ongoing"
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    
    # 获取题目并随机排序
    result = await db.execute(
        select(Question).where(Question.exam_id == exam_id)
    )
    questions = result.scalars().all()
    
    # 考试开启随机顺序时，为每个考生打乱题目顺序
    if exam.random_order:
        random.shuffle(questions)
    
    # 缓存试卷到Redis
    paper_data = {
        "exam_id": exam_id,
        "record_id": record.id,
        "questions": [{"id": q.id, "order": i} for i, q in enumerate(questions)]
    }
    # 缓存有效期与考试时长一致，防止乱序泄露给其他请求
    await redis_client.set(
        f"exam:paper:{exam_id}:{student_id}",
        json.dumps(paper_data),
        ex=exam.duration * 60
    )
    
    return record, None

async def get_my_records(db: AsyncSession, student_id: int):
    """查询学生的考试记录列表（含考试标题），按开始时间倒序。"""
    result = await db.execute(
        select(ExamRecord, Exam)
        .join(Exam, Exam.id == ExamRecord.exam_id)
        .where(ExamRecord.student_id == student_id)
        .order_by(ExamRecord.start_time.desc())
    )
    rows = result.all()
    return [
        {
            "id": r.id,
            "exam_id": r.exam_id,
            "exam_title": exam.title,
            "score": r.score,
            "status": r.status,
            "switch_count": r.switch_count,
            "start_time": r.start_time,
            "submit_time": r.submit_time
        }
        for r, exam in rows
    ]

async def get_paper(db: AsyncSession, exam_id: int, student_id: int):
    """获取试卷：优先取 Redis 缓存，缓存丢失时从数据库重建。

    :return: 元组 (试卷数据或 None, 错误信息或 None)
    """
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
        # 重建时无法还原随机顺序，按题目 ID 顺序生成
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

    paper_data = json.loads(cached)
    record_id = paper_data["record_id"]
    
    # 获取题目详情
    question_ids = [q["id"] for q in paper_data["questions"]]
    result = await db.execute(
        select(Question).where(Question.id.in_(question_ids))
    )
    questions = result.scalars().all()
    questions_map = {q.id: q for q in questions}
    
    # 按缓存顺序排列
    ordered_questions = []
    for q_ref in paper_data["questions"]:
        q = questions_map[q_ref["id"]]
        options = json.loads(q.options) if q.options else None
        ordered_questions.append({
            "id": q.id,
            "type": q.type,
            "content": q.content,
            "options": options,
            "score": q.score
        })
    
    # 获取已保存的答案
    result = await db.execute(
        select(Answer).where(Answer.record_id == record_id)
    )
    answers = result.scalars().all()
    saved_answers = {a.question_id: a.student_answer for a in answers}
    
    return {
        "record_id": record_id,
        "questions": ordered_questions,
        "saved_answers": saved_answers
    }, None

async def save_answers(db: AsyncSession, exam_id: int, student_id: int, answers: dict):
    """自动保存作答：写入 Redis 暂存，供断线重连/交卷时恢复。

    :return: 元组 (是否成功, 错误信息或 None)
    """
    # 获取考试记录
    result = await db.execute(
        select(ExamRecord).where(
            ExamRecord.student_id == student_id,
            ExamRecord.exam_id == exam_id,
            ExamRecord.status == "ongoing"
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        return False, "考试未进行中"
    
    # 保存答案到Redis（自动保存）
    await redis_client.set(
        f"exam:autosave:{exam_id}:{student_id}",
        json.dumps(answers),
        ex=3600
    )
    
    return True, None

async def submit_exam(db: AsyncSession, exam_id: int, student_id: int, submitted_answers: dict = None):
    """交卷：持久化答案并对客观题自动批改，主观题送入 AI 评分队列。

    :return: 元组 (考试记录或 None, 错误信息或 None)
    """
    # 获取考试记录
    result = await db.execute(
        select(ExamRecord).where(
            ExamRecord.student_id == student_id,
            ExamRecord.exam_id == exam_id,
            ExamRecord.status == "ongoing"
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        return None, "考试未进行中"

    # 优先使用交卷请求携带的答案，避免依赖30秒自动保存的时机
    if submitted_answers:
        answers = submitted_answers
    else:
        cached_answers = await redis_client.get(f"exam:autosave:{exam_id}:{student_id}")
        answers = json.loads(cached_answers) if cached_answers else {}
    
    # 获取题目
    result = await db.execute(
        select(Question).where(Question.exam_id == exam_id)
    )
    questions = result.scalars().all()
    questions_map = {q.id: q for q in questions}

    # 幂等处理：清除该记录已有的答案行（如进行中占位答案、或上次提交中途失败残留），
    # 避免与唯一键 uk_record_question 冲突导致重复交卷 500
    await db.execute(delete(Answer).where(Answer.record_id == record.id))
    
    total_score = 0
    
    # 批改客观题
    for q in questions:
        student_answer = answers.get(str(q.id))
        # 多选题答案可能是列表，拼接为字符串以便入库和批改
        if isinstance(student_answer, list):
            student_answer = "".join(student_answer)
        
        answer = Answer(
            record_id=record.id,
            question_id=q.id,
            student_answer=student_answer
        )
        
        if q.type in ["single", "multiple", "judge", "blank"]:
            # 自动批改（对多选/判断题做容错归一化）
            stu = _normalize_answer(q.type, student_answer)
            ans = _normalize_answer(q.type, q.answer)
            if stu and ans:
                is_correct = stu == ans
                answer.is_correct = is_correct
                answer.score = q.score if is_correct else 0
                total_score += answer.score
        
        db.add(answer)
        await db.flush()
        if q.type == "essay":
            # 简答题异步交给 AI 评分，批改完成后再重算总分
            answer.grading_source = "pending"
            await enqueue_ai_grading_task(db, answer.id)
        elif q.type == "blank" and answer.is_correct is False:
            # 填空题判错时送 AI 复核（容错大小写、空格等差异）
            await enqueue_ai_grading_task(db, answer.id)
    
    # 更新考试记录：总分此时只含客观题得分，主观题得分由后续批改叠加
    record.submit_time = datetime.now()
    record.score = total_score
    record.status = "submitted"
    
    await db.commit()
    await db.refresh(record)
    
    # 清理Redis缓存
    await redis_client.delete(f"exam:paper:{exam_id}:{student_id}")
    await redis_client.delete(f"exam:autosave:{exam_id}:{student_id}")
    await redis_client.delete(f"exam:countdown:{exam_id}:{student_id}")
    await redis_client.delete(f"exam:switch:{exam_id}:{student_id}")
    
    return record, None
