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

async def create_question(db: AsyncSession, exam_id: int, question_data: dict):
    """创建题目，选项列表序列化为 JSON 字符串后存储。"""
    options = question_data.get("options")
    if options and isinstance(options, list):
        # ensure_ascii=False 保证中文选项以原文入库
        options = json.dumps(options, ensure_ascii=False)
    
    question = Question(
        exam_id=exam_id,
        type=question_data["type"],
        content=question_data["content"],
        options=options,
        answer=question_data.get("answer"),
        score=question_data.get("score", 1),
        sort_order=question_data.get("sort_order", 0),
        analysis=question_data.get("analysis"),
        grading_rubric=question_data.get("grading_rubric"),
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
