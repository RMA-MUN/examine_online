"""题目模型模块：定义考试中的试题。"""

from sqlalchemy import Column, Integer, Text, JSON, Enum, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from app.database import Base

class Question(Base):
    """题目：考试中的一道试题，支持单选/多选/判断/填空/简答五种题型。"""

    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=True, index=True)
    type = Column(Enum("single", "multiple", "judge", "blank", "essay"), nullable=False, index=True)  # 题型：single=单选, multiple=多选, judge=判断, blank=填空, essay=简答
    content = Column(Text, nullable=False, comment="题目内容")
    options = Column(Text, comment="选项JSON数组")
    answer = Column(Text, comment="正确答案")
    score = Column(Integer, nullable=False, default=1)
    sort_order = Column(Integer, default=0)
    analysis = Column(Text, comment="题目解析")
    grading_rubric = Column(JSON, comment="简答题评分要点")
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="SET NULL"), nullable=True, index=True, comment="题库所属学科/课程")
    is_bank = Column(Boolean, nullable=False, default=False, server_default="0", comment="是否为题库题（exam_id为空）")
    tags = Column(JSON, nullable=True, comment="知识点标签JSON数组")
    difficulty = Column(Enum("easy", "medium", "hard"), nullable=True, index=True, comment="难度：easy=易, medium=中, hard=难")
    source_question_id = Column(Integer, nullable=True, index=True, comment="从题库复制时回指的题库题ID")
    created_at = Column(DateTime, server_default=func.now())
