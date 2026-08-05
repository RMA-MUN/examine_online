"""教师-科目（课程）分配服务：分配关系即教师管理课程/考试的权限来源。"""

from typing import List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.exam import Exam
from app.models.teacher_subject import TeacherSubject
from app.models.user import User


async def get_teacher_subjects(db: AsyncSession, teacher_id: int) -> List[Course]:
    """获取某教师负责管理的全部课程列表。"""
    result = await db.execute(
        select(Course)
        .join(TeacherSubject, TeacherSubject.subject_id == Course.id)
        .where(TeacherSubject.teacher_id == teacher_id)
        .order_by(Course.id)
    )
    return list(result.scalars().all())


async def assign_subject_to_teacher(
    db: AsyncSession, teacher_id: int, subject_id: int
) -> bool:
    """将课程分配（授权）给教师。

    :return: 分配成功返回 True；教师不存在/非教师角色/课程不存在/已重复分配均返回 False
    """
    teacher = await db.get(User, teacher_id)
    if not teacher or teacher.role != "teacher":
        return False
    subject = await db.get(Course, subject_id)
    if not subject:
        return False
    # 已存在分配关系时视为重复分配，直接拒绝
    existing = await db.execute(
        select(TeacherSubject).where(
            TeacherSubject.teacher_id == teacher_id,
            TeacherSubject.subject_id == subject_id,
        )
    )
    if existing.scalar_one_or_none():
        return False
    db.add(TeacherSubject(teacher_id=teacher_id, subject_id=subject_id))
    await db.commit()
    return True


async def remove_subject_from_teacher(
    db: AsyncSession, teacher_id: int, subject_id: int
) -> bool:
    """撤销教师对某课程的管理权限。

    :return: 撤销成功返回 True；分配关系不存在时返回 False
    """
    result = await db.execute(
        select(TeacherSubject).where(
            TeacherSubject.teacher_id == teacher_id,
            TeacherSubject.subject_id == subject_id,
        )
    )
    teacher_subject = result.scalar_one_or_none()
    if not teacher_subject:
        return False
    await db.delete(teacher_subject)
    await db.commit()
    return True


async def can_teacher_manage_exam(db: AsyncSession, teacher_id: int, exam_id: int) -> bool:
    """判断教师是否有权管理某场考试（依据考试所属课程的管理权限）。"""
    exam = await db.get(Exam, exam_id)
    if not exam:
        return False
    return await can_teacher_manage_subject(db, teacher_id, exam.course_id)


async def can_teacher_manage_subject(db: AsyncSession, teacher_id: int, course_id: int) -> bool:
    """判断教师是否有权管理某课程：存在分配记录即视为有权。"""
    result = await db.execute(
        select(TeacherSubject).where(
            TeacherSubject.teacher_id == teacher_id,
            TeacherSubject.subject_id == course_id,
        )
    )
    return result.scalar_one_or_none() is not None
