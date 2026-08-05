"""课程管理接口：负责课程的查询、创建、修改与删除；课程查询对所有登录用户开放，增删改仅教师/管理员可操作。"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.course import CourseCreate, CourseUpdate, CourseResponse
from app.services.course_service import get_courses, get_course, create_course, update_course, delete_course
from app.utils.deps import get_current_user, require_role
from app.utils.response import success_response, paginated_response
from app.models.user import User

router = APIRouter(prefix="/api/courses", tags=["课程管理"])

@router.get("")
async def list_courses(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """分页获取课程列表，所有已登录用户均可调用；教师仅返回自己创建的课程。"""
    courses, total = await get_courses(
        db, current_user.id if current_user.role == "teacher" else None, page, page_size
    )
    courses_data = [CourseResponse.model_validate(c).model_dump() for c in courses]
    return paginated_response(courses_data, total, page, page_size)

@router.post("")
async def create_new_course(
    course_data: CourseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """创建新课程，仅教师/管理员可调用。"""
    course = await create_course(db, course_data.model_dump(), current_user.id)
    return success_response(data=CourseResponse.model_validate(course).model_dump())

@router.get("/{course_id}")
async def get_course_detail(
    course_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取指定课程的详细信息，所有已登录用户均可调用。"""
    course = await get_course(db, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="课程不存在")
    return success_response(data=CourseResponse.model_validate(course).model_dump())

@router.put("/{course_id}")
async def update_course_info(
    course_id: int,
    course_data: CourseUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """修改指定课程的信息，仅教师/管理员可调用。"""
    course = await update_course(db, course_id, course_data.model_dump(exclude_unset=True))
    if not course:
        raise HTTPException(status_code=404, detail="课程不存在")
    return success_response(data=CourseResponse.model_validate(course).model_dump())

@router.delete("/{course_id}")
async def delete_course_info(
    course_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """删除指定课程，仅教师/管理员可调用。"""
    success = await delete_course(db, course_id)
    if not success:
        raise HTTPException(status_code=404, detail="课程不存在")
    return success_response(message="删除成功")
