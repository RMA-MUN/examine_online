"""题目模型模块：定义考试中的试题。"""

from sqlalchemy import Column, Integer, Text, JSON, Enum, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base

class Question(Base):
    """题目：考试中的一道试题，支持单选/多选/判断/填空/简答五种题型。"""

    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(Enum("single", "multiple", "judge", "blank", "essay"), nullable=False, index=True)  # 题型：single=单选, multiple=多选, judge=判断, blank=填空, essay=简答
    content = Column(Text, nullable=False, comment="题目内容")
    options = Column(Text, comment="选项JSON数组")
    answer = Column(Text, comment="正确答案")
    score = Column(Integer, nullable=False, default=1)
    sort_order = Column(Integer, default=0)
    analysis = Column(Text, comment="题目解析")
    grading_rubric = Column(JSON, comment="简答题评分要点")
    created_at = Column(DateTime, server_default=func.now())
