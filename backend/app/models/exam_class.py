"""考试-班级关联模型模块：定义考试面向的班级。"""

from sqlalchemy import Column, Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class ExamClass(Base):
    """考试-班级关联表：指定某场考试面向哪些班级发布，班级内学生自动获得考试资格。"""

    __tablename__ = "exam_classes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True)
    class_id = Column(Integer, ForeignKey("classes.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())

    exam = relationship("Exam", backref="exam_classes")
    class_ = relationship("SchoolClass", backref="exam_classes")

    __table_args__ = (
        UniqueConstraint("exam_id", "class_id", name="uk_exam_class"),
    )
