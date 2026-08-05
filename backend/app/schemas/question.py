"""题目相关的请求/响应 Pydantic 模型。"""

from pydantic import BaseModel, field_validator, model_validator
from typing import Optional, List
from datetime import datetime
import json

class RubricItem(BaseModel):
    """评分要点条目（用于简答题的人工/AI 评分）。"""
    criterion_id: str
    criterion: str
    points: int  # 该要点的分值

    @field_validator("criterion_id", "criterion")
    @classmethod
    def require_non_empty_text(cls, value: str):
        if not value.strip():
            raise ValueError("评分要点不能为空")
        return value.strip()

    @field_validator("points")
    @classmethod
    def require_non_negative_points(cls, value: int):
        if value < 0:
            raise ValueError("评分要点分值不能为负数")
        return value


class QuestionBase(BaseModel):
    """题目基础模型，包含题目的公共字段。"""
    type: str  # 题型：single=单选题, multiple=多选题, judge=判断题, blank=填空题, essay=简答题
    content: str
    options: Optional[List[str]] = None  # 选项列表（仅选择题有）
    answer: Optional[str] = None
    score: int = 1
    sort_order: int = 0  # 题目在试卷中的排序序号
    analysis: Optional[str] = None
    grading_rubric: Optional[List[RubricItem]] = None  # 评分要点列表（仅简答题可配置）

    @model_validator(mode="after")
    def validate_grading_rubric(self):
        if self.grading_rubric is None:
            return self
        if self.type != "essay":
            raise ValueError("评分要点仅简答题可配置")
        criterion_ids = [item.criterion_id for item in self.grading_rubric]
        if len(criterion_ids) != len(set(criterion_ids)):
            raise ValueError("评分要点 ID 不能重复")
        if sum(item.points for item in self.grading_rubric) != self.score:
            raise ValueError("评分要点总分必须等于题目分值")
        return self

class QuestionCreate(QuestionBase):
    """创建题目请求体（继承 QuestionBase）。"""
    pass

class QuestionUpdate(BaseModel):
    """更新题目请求体，所有字段可选。"""
    type: Optional[str] = None
    content: Optional[str] = None
    options: Optional[List[str]] = None
    answer: Optional[str] = None
    score: Optional[int] = None
    sort_order: Optional[int] = None
    analysis: Optional[str] = None
    grading_rubric: Optional[List[RubricItem]] = None

class QuestionResponse(QuestionBase):
    """题目详情响应（继承 QuestionBase，含 id、所属考试等系统字段）。"""
    id: int
    exam_id: int  # 所属考试 ID
    created_at: datetime

    @field_validator("options", mode="before")
    @classmethod
    def parse_options(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (ValueError, TypeError):
                return None
        return v

    @field_validator("grading_rubric", mode="before")
    @classmethod
    def parse_grading_rubric(cls, value):
        if isinstance(value, str):
            try:
                return json.loads(value)
            except (ValueError, TypeError):
                return None
        return value

    class Config:
        from_attributes = True

class QuestionImport(BaseModel):
    """批量导入题目请求体。"""
    questions: List[QuestionCreate]
