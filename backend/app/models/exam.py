"""考试模型模块：定义考试及其配置。"""

from sqlalchemy import Column, Integer, String, Text, Boolean, Enum, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class Exam(Base):
    """考试：教师发布的考试，配置考试时间、时长、总分、题目排序与切屏限制等。"""

    __tablename__ = "exams"

    id = Column(Integer, primary_key=True, autoincrement=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    duration = Column(Integer, nullable=False, comment="考试时长（分钟）")
    total_score = Column(Integer, nullable=False, default=100)
    pass_score = Column(Integer, nullable=False, default=60)
    random_order = Column(Boolean, default=True, comment="题目是否随机排序")
    max_switch = Column(Integer, default=3, comment="最大切屏次数")
    status = Column(Enum("draft", "published", "ongoing", "finished"), default="draft", index=True)  # 考试状态：draft=草稿, published=已发布, ongoing=进行中, finished=已结束
    created_at = Column(DateTime, server_default=func.now())

    course = relationship("Course", backref="exams")
