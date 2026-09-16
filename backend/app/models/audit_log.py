"""审计日志模型模块：记录关键管理操作的审计留痕。"""

from sqlalchemy import Column, Integer, String, JSON, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base


class AuditLog(Base):
    """审计日志：谁在何时做了什么（删考试、终评、重置密码、改参数等）。"""

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(String(64), nullable=False, index=True)
    target_type = Column(String(32), nullable=True)
    target_id = Column(Integer, nullable=True)
    ip = Column(String(64), nullable=True)
    detail = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)
