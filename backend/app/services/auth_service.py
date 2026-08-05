"""用户认证服务：登录校验、令牌签发、登出黑名单与修改密码。"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import User
from app.utils.security import verify_password, create_access_token, hash_password
from app.redis_client import redis_client

async def authenticate_user(db: AsyncSession, username: str, password: str):
    """校验用户名和密码。

    :return: 校验通过返回用户对象，失败返回 None
    """
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(password, user.password_hash):
        return None
    return user

async def create_token(user: User) -> str:
    """为用户签发 JWT 访问令牌，令牌中包含用户 ID 与角色信息。"""
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role}
    )
    return access_token

async def logout_user(token: str):
    """登出：将令牌加入 Redis 黑名单，使其在剩余有效期内失效。"""
    # 黑名单有效期 7200 秒，与令牌自身有效期保持一致
    await redis_client.set(f"blacklist:token:{token}", "1", ex=7200)

async def change_password(db: AsyncSession, user: User, old_password: str, new_password: str):
    """修改用户密码。

    :return: 元组 (是否成功, 错误信息)；成功时错误信息为 None
    """
    if not verify_password(old_password, user.password_hash):
        return False, "原密码错误"
    if len(new_password) < 6:
        return False, "新密码长度不能少于6位"
    user.password_hash = hash_password(new_password)
    await db.commit()
    await db.refresh(user)
    return True, None
