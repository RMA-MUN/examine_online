"""监控事件模型模块：记录考试期间上报的防作弊行为事件。"""

from sqlalchemy import Column, Integer, String, JSON, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base

class MonitorEvent(Base):
    """监控事件：学生考试期间的一次可疑/状态行为（切屏/失焦/退出全屏/粘贴/人脸丢失）。"""

    __tablename__ = "monitor_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    exam_id = Column(Integer, ForeignKey("exams.id"), nullable=False, index=True)
    record_id = Column(Integer, ForeignKey("exam_records.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    event_type = Column(String(32), nullable=False, index=True)  # 事件类型：switch=切屏, blur=失焦, fullscreen_exit=退出全屏, paste=粘贴, face_lost=人脸丢失
    detail = Column(JSON, comment="事件附加信息")
    created_at = Column(DateTime, server_default=func.now())
