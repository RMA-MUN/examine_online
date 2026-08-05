from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

"""数据库模块：提供异步 SQLAlchemy 引擎、会话工厂以及供 FastAPI 依赖注入的数据库会话。"""

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_recycle=settings.DB_POOL_RECYCLE,
    pool_pre_ping=True,
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

class Base(DeclarativeBase):
    """所有 ORM 模型的声明式基类。"""

async def get_db():
    """FastAPI 依赖：提供数据库会话，使用完毕后自动关闭连接。"""
    async with async_session() as session:
        try:
            yield session
        finally:
            # 确保会话在请求结束后关闭，避免连接泄漏
            await session.close()
