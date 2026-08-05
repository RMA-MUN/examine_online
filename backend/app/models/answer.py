"""答题记录模型模块：记录考生每道题的作答与阅卷结果。"""

from sqlalchemy import Column, Integer, Text, Boolean, JSON, String, Enum, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class Answer(Base):
    """答题记录：考生对某道题的作答内容、得分以及 AI/教师阅卷信息。"""

    __tablename__ = "answers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    record_id = Column(Integer, ForeignKey("exam_records.id", ondelete="CASCADE"), nullable=False, index=True)  # 考试记录ID，引用考试记录表（exam_records.id）
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    student_answer = Column(Text, comment="学生答案")
    score = Column(Integer, default=0, comment="得分")
    is_correct = Column(Boolean, comment="是否正确")
    graded_at = Column(DateTime, comment="阅卷时间")
    grader_id = Column(Integer, ForeignKey("users.id"), comment="阅卷老师ID")
    ai_score = Column(Integer, comment="AI 原始得分")
    ai_feedback = Column(JSON, comment="AI 评分依据")
    ai_model = Column(String(128), comment="AI 模型名")
    ai_graded_at = Column(DateTime, comment="AI 评分时间")
    grading_source = Column(
        Enum("pending", "ai", "teacher", "failed"),
        nullable=False,
        default="pending",
        comment="当前得分来源",
    )
    override_reason = Column(Text, comment="教师改分原因")
    created_at = Column(DateTime, server_default=func.now())

    record = relationship("ExamRecord", backref="answers")
    question = relationship("Question", backref="answers")
    grader = relationship("User", backref="graded_answers")

    __table_args__ = (
        UniqueConstraint("record_id", "question_id", name="uk_record_question"),
    )
