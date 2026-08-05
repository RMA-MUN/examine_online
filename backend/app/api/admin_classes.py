from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.class_ import ClassCreate, ClassResponse, ClassUpdate
from app.services.class_service import (
    create_class, delete_class, get_classes, get_class_students, update_class,
)
from app.utils.deps import require_role
from app.utils.response import error_response, success_response

router = APIRouter(tags=["班级管理"])


@router.get("/api/classes")
async def list_classes_for_teacher(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    keyword: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin", "teacher"])),
):
    classes, total = await get_classes(db, page, page_size, keyword)
    return success_response(data={
        "items": [ClassResponse.model_validate(c).model_dump() for c in classes],
        "total": total, "page": page, "page_size": page_size,
    })


@router.get("/api/admin/classes")
async def list_classes(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    keyword: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin"])),
):
    classes, total = await get_classes(db, page, page_size, keyword)
    return success_response(data={
        "items": [ClassResponse.model_validate(c).model_dump() for c in classes],
        "total": total, "page": page, "page_size": page_size,
    })


@router.post("/api/admin/classes")
async def create_class_action(
    data: ClassCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin"])),
):
    class_ = await create_class(db, data.name, data.grade, data.description)
    return success_response(data=ClassResponse.model_validate(class_).model_dump())


@router.put("/api/admin/classes/{class_id}")
async def update_class_action(
    class_id: int,
    data: ClassUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin"])),
):
    class_ = await update_class(db, class_id, data.name, data.grade, data.description)
    if not class_:
        return error_response(message="班级不存在")
    return success_response(data=ClassResponse.model_validate(class_).model_dump())


@router.delete("/api/admin/classes/{class_id}")
async def delete_class_action(
    class_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin"])),
):
    if not await delete_class(db, class_id):
        return error_response(message="班级不存在")
    return success_response(message="删除成功")


@router.get("/api/admin/classes/{class_id}/students")
async def list_class_students(
    class_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin"])),
):
    students = await get_class_students(db, class_id)
    return success_response(data=[
        {"id": s.id, "username": s.username, "name": s.name} for s in students
    ])
