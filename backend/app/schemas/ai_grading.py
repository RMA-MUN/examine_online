"""AI 阅卷相关的 Pydantic 模型。"""

from typing import Annotated

from pydantic import BaseModel, Field, field_validator


class CriterionResult(BaseModel):
    """单个评分要点的 AI 评分结果。"""
    criterion_id: str
    score: Annotated[int, Field(ge=0)]
    reason: Annotated[str, Field(min_length=1, max_length=300)]  # 评分理由


class AiGradingResult(BaseModel):
    """AI 阅卷整体评分结果。"""
    score: Annotated[int, Field(ge=0)]
    reasoning: Annotated[str, Field(min_length=1, max_length=500)]  # 整体评分依据
    criterion_results: list[CriterionResult]  # 各评分要点的得分明细
    confidence: Annotated[float, Field(ge=0, le=1)]

    @field_validator("criterion_results")
    @classmethod
    def require_at_least_one_result(cls, value: list[CriterionResult]):
        if not value:
            raise ValueError("至少需要一个评分要点结果")
        return value


class AiGradingInput(BaseModel):
    """AI 阅卷请求输入。"""
    question_content: str
    question_score: int
    reference_answer: str | None = None  # 参考答案
    analysis: str | None = None  # 题目解析
    rubric: list[dict] | None = None  # 评分要点列表（仅简答题）
    student_answer: str | None = None
