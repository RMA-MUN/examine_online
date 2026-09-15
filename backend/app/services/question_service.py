"""题目管理服务：考试的题目增删改查，选项以 JSON 字符串形式入库。"""

import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.question import Question

async def get_questions(db: AsyncSession, exam_id: int, page: int = 1, page_size: int = 10):
    """分页查询某考试的题目，按题目序号 sort_order 排序。

    :return: 元组 (当前页题目列表, 总记录数)
    """
    query = select(Question).where(Question.exam_id == exam_id).order_by(Question.sort_order)
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()
    result = await db.execute(query.offset((page - 1) * page_size).limit(page_size))
    return result.scalars().all(), total

async def get_question(db: AsyncSession, question_id: int):
    """按 ID 查询题目，不存在时返回 None。"""
    result = await db.execute(select(Question).where(Question.id == question_id))
    return result.scalar_one_or_none()

async def list_bank_questions(
    db: AsyncSession,
    course_id: int | None = None,
    q_type: str | None = None,
    difficulty: str | None = None,
    keyword: str | None = None,
    allowed_course_ids: list | None = None,
    page: int = 1,
    page_size: int = 10,
):
    """分页查询题库题（is_bank=True），支持学科/题型/难度/关键字过滤。

    :param allowed_course_ids: 非管理员教师可见的课程 ID 白名单（None 表示不过滤）；course_id 为空的公共题始终可见。
    """
    query = select(Question).where(Question.is_bank == True)  # noqa: E712
    if course_id is not None:
        query = query.where(Question.course_id == course_id)
    elif allowed_course_ids is not None:
        query = query.where(
            (Question.course_id.is_(None)) | (Question.course_id.in_(allowed_course_ids))
        )
    if q_type:
        query = query.where(Question.type == q_type)
    if difficulty:
        query = query.where(Question.difficulty == difficulty)
    if keyword:
        query = query.where(Question.content.contains(keyword))
    query = query.order_by(Question.id.desc())
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()
    result = await db.execute(query.offset((page - 1) * page_size).limit(page_size))
    return result.scalars().all(), total

async def copy_bank_questions_to_exam(db: AsyncSession, exam_id: int, bank_ids: list, target_course_id: int | None = None):
    """从题库复制题目到指定考试：保留 options/answer/analysis/rubric/tags/difficulty，新 exam_id，source_question_id 回指。"""
    if not bank_ids:
        return [], None
    result = await db.execute(select(Question).where(Question.id.in_(bank_ids)))
    bank_questions = {q.id: q for q in result.scalars().all()}
    missing = [bid for bid in bank_ids if bid not in bank_questions]
    if missing:
        return None, missing
    non_bank = [bid for bid, q in bank_questions.items() if not q.is_bank]
    if non_bank:
        return None, non_bank
    # 新题序号续接目标考试现有最大值
    max_order = (await db.execute(select(func.max(Question.sort_order)).where(Question.exam_id == exam_id))).scalar_one()
    base_order = (max_order or 0)
    created = []
    for idx, bid in enumerate(bank_ids):
        src = bank_questions[bid]
        options = src.options
        if isinstance(options, list):
            options = json.dumps(options, ensure_ascii=False)
        q = Question(
            exam_id=exam_id,
            type=src.type,
            content=src.content,
            options=options,
            answer=src.answer,
            score=src.score,
            sort_order=base_order + idx + 1,
            analysis=src.analysis,
            grading_rubric=src.grading_rubric,
            course_id=src.course_id if src.course_id is not None else target_course_id,
            is_bank=False,
            tags=src.tags,
            difficulty=src.difficulty,
            source_question_id=src.id,
        )
        db.add(q)
        created.append(q)
    await db.commit()
    for q in created:
        await db.refresh(q)
    return created, None

async def create_question(db: AsyncSession, exam_id: int | None, question_data: dict):
    """创建题目，选项列表序列化为 JSON 字符串后存储。"""
    options = question_data.get("options")
    if options and isinstance(options, list):
        # ensure_ascii=False 保证中文选项以原文入库
        options = json.dumps(options, ensure_ascii=False)

    grading_rubric = question_data.get("grading_rubric")
    if grading_rubric and isinstance(grading_rubric, list):
        # Pydantic RubricItem 列表转纯 dict 后方可存入 JSON 列
        normalized = []
        for item in grading_rubric:
            normalized.append(item.model_dump() if hasattr(item, "model_dump") else item)
        grading_rubric = normalized

    question = Question(
        exam_id=exam_id,
        type=question_data["type"],
        content=question_data["content"],
        options=options,
        answer=question_data.get("answer"),
        score=question_data.get("score", 1),
        sort_order=question_data.get("sort_order", 0),
        analysis=question_data.get("analysis"),
        grading_rubric=grading_rubric,
        course_id=question_data.get("course_id"),
        is_bank=bool(question_data.get("is_bank", False)),
        tags=question_data.get("tags"),
        difficulty=question_data.get("difficulty"),
        source_question_id=question_data.get("source_question_id"),
    )
    db.add(question)
    await db.commit()
    await db.refresh(question)
    return question

async def batch_create_questions(db: AsyncSession, exam_id: int, questions_data: list):
    """批量创建题目，逐个创建并返回全部题目对象。"""
    questions = []
    for q_data in questions_data:
        question = await create_question(db, exam_id, q_data)
        questions.append(question)
    return questions

async def update_question(db: AsyncSession, question_id: int, question_data: dict):
    """更新题目信息，值为 None 的字段不修改。

    :return: 更新后的题目对象；题目不存在时返回 None
    """
    question = await get_question(db, question_id)
    if not question:
        return None
    
    # 选项字段为列表时需先序列化为 JSON 再入库
    if "options" in question_data:
        options = question_data["options"]
        if isinstance(options, list):
            question_data["options"] = json.dumps(options, ensure_ascii=False)
    
    for key, value in question_data.items():
        if value is not None:
            setattr(question, key, value)
    
    await db.commit()
    await db.refresh(question)
    return question

async def delete_question(db: AsyncSession, question_id: int):
    """删除题目。

    :return: 删除成功返回 True，题目不存在返回 False
    """
    question = await get_question(db, question_id)
    if not question:
        return False
    await db.delete(question)
    await db.commit()
    return True
