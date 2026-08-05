"""课程管理服务：课程的增删改查与分页列表，课程归属于创建它的教师。"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.course import Course

async def get_courses(db: AsyncSession, teacher_id: int = None, page: int = 1, page_size: int = 10):
    """分页查询课程列表，可按教师 ID 过滤。

    :return: 元组 (当前页课程列表, 总记录数)
    """
    query = select(Course)
    if teacher_id:
        query = query.where(Course.teacher_id == teacher_id)
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()
    result = await db.execute(query.offset((page - 1) * page_size).limit(page_size))
    return result.scalars().all(), total

async def get_course(db: AsyncSession, course_id: int):
    """按 ID 查询课程，不存在时返回 None。"""
    result = await db.execute(select(Course).where(Course.id == course_id))
    return result.scalar_one_or_none()

async def create_course(db: AsyncSession, course_data: dict, teacher_id: int):
    """创建课程，归属到当前教师名下。"""
    course = Course(
        name=course_data["name"],
        description=course_data.get("description"),
        teacher_id=teacher_id
    )
    db.add(course)
    await db.commit()
    await db.refresh(course)
    return course

async def update_course(db: AsyncSession, course_id: int, course_data: dict):
    """更新课程信息，值为 None 的字段不修改。

    :return: 更新后的课程对象；课程不存在时返回 None
    """
    course = await get_course(db, course_id)
    if not course:
        return None
    for key, value in course_data.items():
        if value is not None:
            setattr(course, key, value)
    await db.commit()
    await db.refresh(course)
    return course

async def delete_course(db: AsyncSession, course_id: int):
    """删除课程。

    :return: 删除成功返回 True，课程不存在返回 False
    """
    course = await get_course(db, course_id)
    if not course:
        return False
    await db.delete(course)
    await db.commit()
    return True
