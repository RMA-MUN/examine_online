"""考试记录模型模块：记录考生参与考试的过程与结果。"""

from sqlalchemy import Column, Integer, String, Enum, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class ExamRecord(Base):
    """考试记录：记录考生某次考试的交卷与评分状态。"""

    __tablename__ = "exam_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id"), nullable=False, index=True)
    start_time = Column(DateTime, nullable=False)
    submit_time = Column(DateTime)
    score = Column(Integer, default=0)
    status = Column(Enum("ongoing", "submitted", "graded"), default="ongoing")  # 记录状态：ongoing=进行中, submitted=已交卷, graded=已评分
    switch_count = Column(Integer, default=0, comment="切屏次数")
    created_at = Column(DateTime, server_default=func.now())

    student = relationship("User", backref="exam_records")
    exam = relationship("Exam", backref="records")

    __table_args__ = (
        UniqueConstraint("student_id", "exam_id", name="uk_student_exam"),
    )
