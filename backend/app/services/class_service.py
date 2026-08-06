"""班级管理服务：班级的增删改查、学生查询，以及删除班级时清理学生关联。"""

from typing import List, Optional, Tuple

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.class_ import SchoolClass
from app.models.user import User


async def get_classes(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    keyword: Optional[str] = None,
) -> Tuple[List[SchoolClass], int]:
    """分页查询班级列表，支持按班级名称关键字模糊搜索。

    :return: 元组 (当前页班级列表, 总记录数)
    """
    query = select(SchoolClass)
    if keyword:
        query = query.where(SchoolClass.name.contains(keyword))
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()
    result = await db.execute(query.offset((page - 1) * page_size).limit(page_size))
    return list(result.scalars().all()), total


async def get_all_classes(db: AsyncSession) -> List[SchoolClass]:
    """获取全部班级，按 ID 升序返回（供下拉选择等场景使用）。"""
    result = await db.execute(select(SchoolClass).order_by(SchoolClass.id))
    return list(result.scalars().all())


async def create_class(
    db: AsyncSession,
    name: str,
    grade: Optional[str] = None,
    description: Optional[str] = None,
) -> SchoolClass:
    """创建班级。"""
    class_ = SchoolClass(name=name, grade=grade, description=description)
    db.add(class_)
    await db.commit()
    await db.refresh(class_)
    return class_


async def update_class(
    db: AsyncSession,
    class_id: int,
    name: Optional[str] = None,
    grade: Optional[str] = None,
    description: Optional[str] = None,
) -> Optional[SchoolClass]:
    """更新班级信息，只更新传入的非 None 字段。

    :return: 更新后的班级对象；班级不存在时返回 None
    """
    class_ = await db.get(SchoolClass, class_id)
    if not class_:
        return None
    if name is not None:
        class_.name = name
    if grade is not None:
        class_.grade = grade
    if description is not None:
        class_.description = description
    await db.commit()
    await db.refresh(class_)
    return class_


async def delete_class(db: AsyncSession, class_id: int) -> bool:
    """删除班级。

    :return: 删除成功返回 True，班级不存在返回 False
    """
    class_ = await db.get(SchoolClass, class_id)
    if not class_:
        return False
    # 清空该班级下学生的 class_id，避免外键残留
    from sqlalchemy import update as sa_update

    await db.execute(sa_update(User).where(User.class_id == class_id).values(class_id=None))
    await db.delete(class_)
    await db.commit()
    return True


async def get_class_students(db: AsyncSession, class_id: int) -> List[User]:
    """获取某班级的学生列表（仅角色为学生的用户）。"""
    result = await db.execute(
        select(User).where(User.class_id == class_id, User.role == "student")
    )
    return list(result.scalars().all())


async def get_available_students(db: AsyncSession) -> List[User]:
    """获取未分配班级的学生（供批量加入班级时选择）。"""
    result = await db.execute(
        select(User).where(User.role == "student", User.class_id.is_(None)).order_by(User.id)
    )
    return list(result.scalars().all())


async def add_students_to_class(db: AsyncSession, class_id: int, student_ids: List[int]) -> int:
    """将学生批量加入班级（仅 role=student 且存在的用户生效）。

    :return: 实际生效条数
    """
    updated = 0
    for student_id in student_ids:
        student = await db.get(User, student_id)
        if student and student.role == "student":
            student.class_id = class_id
            updated += 1
    await db.commit()
    return updated


async def remove_students_from_class(db: AsyncSession, class_id: int, student_ids: List[int]) -> int:
    """将学生从班级移除（仅清空当前属于该班级的学生，其他班级不受影响）。

    :return: 实际生效条数
    """
    updated = 0
    for student_id in student_ids:
        student = await db.get(User, student_id)
        if student and student.class_id == class_id:
            student.class_id = None
            updated += 1
    await db.commit()
    return updated
