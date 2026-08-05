"""考试管理接口：负责考试的查询、创建、修改、发布与删除；教师操作需具备相应学科的分配权限。"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from app.database import get_db
from app.schemas.exam import ExamCreate, ExamUpdate, ExamResponse
from app.services.exam_service import get_exams, get_exam, create_exam, update_exam, publish_exam, delete_exam, get_teacher_exams
from app.services.teacher_subject_service import can_teacher_manage_exam, can_teacher_manage_subject
from app.utils.deps import get_current_user, require_role
from app.utils.response import success_response, paginated_response
from app.models.user import User

router = APIRouter(prefix="/api/exams", tags=["考试管理"])

@router.get("")
async def list_exams(
    course_id: Optional[int] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """分页获取考试列表，所有已登录用户均可调用；按角色返回不同数据范围。"""
    if current_user.role == "student":
        # 学生仅能看到自己可参加的考试（如所在班级、已发布状态）
        from app.services.exam_service import get_student_eligible_exams
        exams, total = await get_student_eligible_exams(
            db, current_user.id, page, page_size, status
        )
        exams_data = [ExamResponse.model_validate(e).model_dump() for e in exams]
        return paginated_response(exams_data, total, page, page_size)
    if current_user.role == "teacher":
        # 教师仅能看到自己创建（或具备学科权限）的考试
        exams, total = await get_teacher_exams(
            db, current_user.id, status, page, page_size
        )
        exams_data = [ExamResponse.model_validate(e).model_dump() for e in exams]
        return paginated_response(exams_data, total, page, page_size)
    # 管理员可查看全部考试
    exams, total = await get_exams(db, course_id, status, page, page_size)
    exams_data = [ExamResponse.model_validate(e).model_dump() for e in exams]
    return paginated_response(exams_data, total, page, page_size)

@router.post("")
async def create_new_exam(
    exam_data: ExamCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """创建新考试，仅教师/管理员可调用；教师需拥有该课程所属学科的分配权限。"""
    if current_user.role == "teacher" and not await can_teacher_manage_subject(
        db, current_user.id, exam_data.course_id
    ):
        raise HTTPException(status_code=403, detail="你未被分配该学科")
    exam = await create_exam(db, exam_data.model_dump())
    return success_response(data=ExamResponse.model_validate(exam).model_dump())

@router.get("/{exam_id}")
async def get_exam_detail(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取指定考试的详细信息，所有已登录用户均可调用。"""
    exam = await get_exam(db, exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="考试不存在")
    return success_response(data=ExamResponse.model_validate(exam).model_dump())

@router.put("/{exam_id}")
async def update_exam_info(
    exam_id: int,
    exam_data: ExamUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """修改指定考试的信息，仅教师/管理员可调用；教师需具备该考试的管理权限。"""
    if current_user.role == "teacher" and not await can_teacher_manage_exam(
        db, current_user.id, exam_id
    ):
        raise HTTPException(status_code=403, detail="无权管理该考试")
    exam = await update_exam(db, exam_id, exam_data.model_dump(exclude_unset=True))
    if not exam:
        raise HTTPException(status_code=404, detail="考试不存在")
    return success_response(data=ExamResponse.model_validate(exam).model_dump())

@router.put("/{exam_id}/publish")
async def publish_exam_action(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """发布指定考试，仅教师/管理员可调用；教师需具备该考试的管理权限。"""
    if current_user.role == "teacher" and not await can_teacher_manage_exam(
        db, current_user.id, exam_id
    ):
        raise HTTPException(status_code=403, detail="无权管理该考试")
    exam = await publish_exam(db, exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="考试不存在")
    return success_response(data=ExamResponse.model_validate(exam).model_dump())

@router.delete("/{exam_id}")
async def delete_exam_info(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """删除指定考试，仅教师/管理员可调用；教师需具备该考试的管理权限。"""
    if current_user.role == "teacher" and not await can_teacher_manage_exam(
        db, current_user.id, exam_id
    ):
        raise HTTPException(status_code=403, detail="无权管理该考试")
    success = await delete_exam(db, exam_id)
    if not success:
        raise HTTPException(status_code=404, detail="考试不存在")
    return success_response(message="删除成功")
