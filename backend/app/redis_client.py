import redis.asyncio as redis
from app.config import settings

"""Redis 客户端模块：创建全局异步 Redis 连接，并以 FastAPI 依赖形式提供给业务使用。"""

# decode_responses=True 表示自动解码为字符串，protocol=2 保持与 Redis 服务端兼容
redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True, protocol=2)

async def get_redis():
    """FastAPI 依赖：返回全局共享的异步 Redis 客户端。"""
    return redis_client
