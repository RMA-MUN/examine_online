"""AI 阅卷任务模型模块：调度 AI 对答题记录进行评分。"""

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


class AiGradingTask(Base):
    """AI 阅卷任务：调度 AI 对某条答题记录进行评分，包含重试次数与领取锁定机制。"""

    __tablename__ = "ai_grading_tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    answer_id = Column(Integer, ForeignKey("answers.id", ondelete="CASCADE"), nullable=False, unique=True)
    status = Column(Enum("pending", "processing", "completed", "failed"), nullable=False, default="pending", index=True)  # 任务状态：pending=待处理, processing=处理中, completed=已完成, failed=失败
    attempt_count = Column(Integer, nullable=False, default=0)  # 已尝试评分次数
    max_attempts = Column(Integer, nullable=False, default=3)  # 最大重试次数
    available_at = Column(DateTime, nullable=False, server_default=func.now())  # 任务最早可被领取执行的时间
    locked_at = Column(DateTime)  # 任务被领取（锁定）的时间
    locked_by = Column(String(128))  # 锁定任务的执行进程标识
    completed_at = Column(DateTime)  # 任务完成时间
    last_error = Column(Text)  # 最近一次失败的错误信息
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
