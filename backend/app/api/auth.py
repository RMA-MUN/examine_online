"""认证管理接口：负责用户登录、登出、获取/修改个人信息及修改密码。"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.user import LoginRequest, TokenResponse, UserResponse, ProfileUpdate, ChangePasswordRequest
from app.services.auth_service import authenticate_user, create_token, logout_user, change_password
from app.services.user_service import update_user
from app.utils.deps import get_current_user
from app.utils.response import success_response, error_response
from app.models.user import User

router = APIRouter(prefix="/api/auth", tags=["认证"])

@router.post("/login")
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    """用户登录接口，所有角色（学生/教师/管理员）均可调用；校验用户名密码并返回访问令牌。"""
    user = await authenticate_user(db, request.username, request.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误"
        )
    token = await create_token(user)
    return success_response(
        data=TokenResponse(access_token=token).model_dump(),
        message="登录成功"
    )

@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)):
    """登出接口，已登录用户均可调用。"""
    # 实际项目中需要将token加入黑名单
    return success_response(message="登出成功")

@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """获取当前登录用户的基本信息，已登录用户均可调用。"""
    user_data = UserResponse.model_validate(current_user).model_dump()
    return success_response(data=user_data)

@router.put("/me")
async def update_my_profile(
    profile_data: ProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """修改当前登录用户的个人信息，已登录用户均可调用。"""
    data = profile_data.model_dump(exclude_unset=True)
    user = await update_user(db, current_user.id, data)
    return success_response(data=UserResponse.model_validate(user).model_dump())

@router.post("/change-password")
async def change_my_password(
    req: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """修改当前登录用户的密码，已登录用户均可调用。"""
    success, error = await change_password(db, current_user, req.old_password, req.new_password)
    if not success:
        raise HTTPException(status_code=400, detail=error)
    return success_response(message="密码修改成功")
