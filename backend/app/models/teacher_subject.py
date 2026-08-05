"""教师-科目关联模型模块：定义教师与所授科目（课程）的关系。"""

from sqlalchemy import Column, Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class TeacherSubject(Base):
    """教师-科目关联表：记录教师负责讲授的科目（课程），同一教师可关联多个科目。"""

    __tablename__ = "teacher_subjects"

    id = Column(Integer, primary_key=True, autoincrement=True)
    teacher_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)  # 教师ID，引用用户表（users.id）
    subject_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)  # 科目ID，引用课程表（courses.id）
    created_at = Column(DateTime, server_default=func.now())

    teacher = relationship("User", backref="teacher_subjects")
    subject = relationship("Course", backref="teacher_subjects")

    __table_args__ = (
        UniqueConstraint("teacher_id", "subject_id", name="uk_teacher_subject"),
    )
