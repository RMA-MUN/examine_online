"""课程模型模块：定义课程及其授课教师。"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class Course(Base):
    """课程：教师创建的课程，考试挂载在课程之下。"""

    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=False)  # 授课教师ID，引用用户表（users.id）
    created_at = Column(DateTime, server_default=func.now())

    teacher = relationship("User", backref="courses")
