"""课程相关的请求/响应 Pydantic 模型。"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class CourseBase(BaseModel):
    """课程基础模型，包含课程的公共字段。"""
    name: str
    description: Optional[str] = None

class CourseCreate(CourseBase):
    """创建课程请求体（继承 CourseBase）。"""
    pass

class CourseUpdate(BaseModel):
    """更新课程请求体，所有字段可选。"""
    name: Optional[str] = None
    description: Optional[str] = None

class CourseResponse(CourseBase):
    """课程详情响应（继承 CourseBase，含 id、创建教师等系统字段）。"""
    id: int
    teacher_id: int  # 创建该课程的教师 ID
    created_at: datetime

    class Config:
        from_attributes = True
