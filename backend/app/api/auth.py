"""认证管理接口：负责用户登录、登出、获取/修改个人信息及修改密码。"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.redis_client import redis_client
from app.schemas.user import LoginRequest, TokenResponse, UserResponse, ProfileUpdate, ChangePasswordRequest
from app.services.auth_service import authenticate_user, create_token, logout_user, change_password
from app.services.user_service import update_user
from app.utils.deps import get_current_user, security
from app.utils.response import success_response, error_response
from app.models.user import User

logger = logging.getLogger("app.api.auth")

# 登录限流：同一 IP 连续失败达到阈值后锁定一段时间，防暴力破解
LOGIN_MAX_FAILURES = 5
LOGIN_LOCK_SECONDS = 600
LOGIN_FAILURE_TTL_SECONDS = 600

router = APIRouter(prefix="/api/auth", tags=["认证"])

@router.post("/login")
async def login(
    request: LoginRequest,
    request_info: Request,
    db: AsyncSession = Depends(get_db),
):
    """用户登录接口，所有角色（学生/教师/管理员）均可调用；校验用户名密码并返回访问令牌。"""
    client_ip = request_info.client.host if request_info.client else "unknown"

    # IP 已被锁定：直接拒绝（无论密码是否正确），Redis 异常时降级放行
    try:
        locked = await redis_client.get(f"login:lock:{client_ip}")
    except Exception:
        logger.warning("登录限流检查失败（Redis 不可用），放行")
        locked = None
    if locked:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="尝试次数过多，请 10 分钟后重试",
        )

    user = await authenticate_user(db, request.username, request.password)
    if not user:
        # 记录失败次数，达到阈值后锁定该 IP 10 分钟
        try:
            failures = await redis_client.incr(f"login:fail:{client_ip}")
            if failures == 1:
                await redis_client.expire(f"login:fail:{client_ip}", LOGIN_FAILURE_TTL_SECONDS)
            if failures >= LOGIN_MAX_FAILURES:
                await redis_client.set(f"login:lock:{client_ip}", "1", ex=LOGIN_LOCK_SECONDS)
        except Exception:
            logger.warning("登录失败计数写入失败（Redis 不可用），跳过限流")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
        )

    # 登录成功：清除该 IP 的失败计数
    try:
        await redis_client.delete(f"login:fail:{client_ip}")
    except Exception:
        pass

    token = await create_token(user)
    return success_response(
        data=TokenResponse(access_token=token).model_dump(),
        message="登录成功",
    )

@router.post("/logout")
async def logout(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    current_user: User = Depends(get_current_user),
):
    """登出接口：将当前 token 加入黑名单，使其立即失效。"""
    await logout_user(credentials.credentials)
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
