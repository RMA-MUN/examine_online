"""答题记录与阅卷相关的请求/响应 Pydantic 模型。"""

from pydantic import BaseModel
from typing import Any, Optional
from datetime import datetime

class AnswerBase(BaseModel):
    """答题记录基础模型。"""
    question_id: int
    student_answer: Optional[str] = None

class AnswerCreate(AnswerBase):
    """创建答题记录请求体（继承 AnswerBase）。"""
    pass

class AnswerUpdate(BaseModel):
    """更新答题记录请求体（用于教师批改），所有字段可选。"""
    student_answer: Optional[str] = None
    score: Optional[int] = None
    is_correct: Optional[bool] = None  # 是否正确

class AnswerResponse(AnswerBase):
    """答题记录详情响应（继承 AnswerBase，含得分与阅卷信息）。"""
    id: int
    record_id: int  # 所属考试记录 ID
    score: int
    is_correct: Optional[bool] = None  # 是否正确
    graded_at: Optional[datetime] = None  # 阅卷时间
    grader_id: Optional[int] = None  # 阅卷人（教师）ID
    created_at: datetime

    class Config:
        from_attributes = True

class GradeRequest(BaseModel):
    """人工改分请求体。"""
    score: int
    is_correct: Optional[bool] = None
    override_reason: Optional[str] = None  # 改分原因

class AiGradingResponse(BaseModel):
    """AI 阅卷结果响应。"""
    answer_id: int
    question_id: int
    record_id: int
    grading_status: str  # 阅卷状态：pending=待评分, ai=AI 评分中/完成, teacher=教师评分, failed=AI 评分失败
    grading_source: str  # 得分来源：pending=待评分, ai=AI 评分, teacher=教师评分, failed=AI 评分失败
    ai_score: Optional[int] = None  # AI 原始得分
    ai_feedback: Optional[dict[str, Any]] = None  # AI 评分依据
    ai_model: Optional[str] = None  # AI 模型名
    ai_graded_at: Optional[datetime] = None  # AI 评分时间
    last_error: Optional[str] = None  # AI 评分失败时的错误信息
