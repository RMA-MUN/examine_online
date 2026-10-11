"""系统参数模型模块：考试默认参数 KV 存储。"""

from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base


class SystemParam(Base):
    """系统参数：key 主键，value 文本，前端 Admin params Tab 读写。"""

    __tablename__ = "system_params"

    key = Column(String(64), primary_key=True)
    value = Column(Text, nullable=False)
    updated_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
