"""教师学科管理接口：负责学科（课程）列表查询、教师学科的分配与移除，仅管理员可调用。"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.course import Course
from app.models.user import User
from app.schemas.teacher_subject import TeacherSubjectCreate
from app.services.teacher_subject_service import (
    assign_subject_to_teacher, get_teacher_subjects, remove_subject_from_teacher,
)
from app.utils.deps import require_role
from app.utils.response import error_response, success_response

router = APIRouter(tags=["教师学科管理"])


@router.get("/api/admin/subjects")
async def list_subjects(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin"])),
):
    """获取全部学科（课程）列表，仅管理员可调用。"""
    result = await db.execute(select(Course).order_by(Course.id))
    subjects = result.scalars().all()
    return success_response(data=[
        {"id": s.id, "name": s.name, "description": s.description}
        for s in subjects
    ])


@router.get("/api/admin/teachers/{teacher_id}/subjects")
async def list_teacher_subjects(
    teacher_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin"])),
):
    """获取指定教师已分配的学科列表，仅管理员可调用。"""
    subjects = await get_teacher_subjects(db, teacher_id)
    return success_response(data=[
        {"id": s.id, "name": s.name, "description": s.description}
        for s in subjects
    ])


@router.post("/api/admin/teachers/{teacher_id}/subjects")
async def assign_subject_action(
    teacher_id: int,
    data: TeacherSubjectCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin"])),
):
    """为指定教师分配一个学科，仅管理员可调用。"""
    if not await assign_subject_to_teacher(db, teacher_id, data.subject_id):
        return error_response(message="分配失败：教师或学科不存在，或已分配")
    return success_response(message="分配成功")


@router.delete("/api/admin/teachers/{teacher_id}/subjects/{subject_id}")
async def remove_subject_action(
    teacher_id: int,
    subject_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin"])),
):
    """移除指定教师与某学科的分配关系，仅管理员可调用。"""
    if not await remove_subject_from_teacher(db, teacher_id, subject_id):
        return error_response(message="移除失败：关联不存在")
    return success_response(message="移除成功")
