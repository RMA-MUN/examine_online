"""用户管理接口：负责用户列表查询、创建、详情查询、修改与删除，仅管理员可调用。"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from app.database import get_db
from app.schemas.user import UserCreate, UserUpdate, UserResponse
from app.services.user_service import get_users, get_user, create_user, update_user, delete_user
from app.utils.deps import require_role
from app.utils.response import success_response, paginated_response
from app.models.user import User

router = APIRouter(prefix="/api/users", tags=["用户管理"])

@router.get("")
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    role: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """分页获取用户列表，支持按角色筛选，仅管理员可调用。"""
    users, total = await get_users(db, page, page_size, role)
    users_data = [UserResponse.model_validate(u).model_dump() for u in users]
    return paginated_response(users_data, total, page, page_size)

@router.post("")
async def create_new_user(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """创建新用户（学生/教师/管理员账号），仅管理员可调用。"""
    user = await create_user(db, user_data.model_dump())
    return success_response(data=UserResponse.model_validate(user).model_dump())

@router.get("/{user_id}")
async def get_user_detail(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """获取指定用户的详细信息，仅管理员可调用。"""
    user = await get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return success_response(data=UserResponse.model_validate(user).model_dump())

@router.put("/{user_id}")
async def update_user_info(
    user_id: int,
    user_data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """修改指定用户的信息，仅管理员可调用。"""
    user = await update_user(db, user_id, user_data.model_dump(exclude_unset=True))
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return success_response(data=UserResponse.model_validate(user).model_dump())

@router.delete("/{user_id}")
async def delete_user_account(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """删除指定用户的账号，仅管理员可调用。"""
    success = await delete_user(db, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="用户不存在")
    return success_response(message="删除成功")
