from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.utils.security import decode_access_token
from app.models.user import User

"""认证依赖模块：解析请求中的 Bearer Token 获取当前用户，并提供角色权限校验依赖。"""

security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """校验请求携带的 JWT，从数据库加载并返回当前登录用户。

    令牌无效、缺失用户标识、用户不存在或被禁用时，抛出对应的 HTTP 异常。
    """
    token = credentials.credentials
    payload = decode_access_token(token)
    # JWT 解码失败（过期、签名错误、格式非法等）一律视为未授权
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的Token"
        )
    
    # token 中缺少 sub 用户标识声明，视为无效 token
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的Token"
        )
    
    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    
    # 用户已被删除或数据库中不存在对应记录
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在"
        )
    
    # 账号被禁用（如封号）后拒绝访问
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户已被禁用"
        )
    
    return user

def require_role(roles: list):
    """返回一个角色校验依赖：仅允许 roles 列表中的角色访问，否则返回 403。"""
    async def role_checker(current_user: User = Depends(get_current_user)):
        # 当前用户角色不在允许列表内则拒绝访问
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="权限不足"
            )
        return current_user
    return role_checker
