"""班级相关的请求/响应 Pydantic 模型。"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ClassCreate(BaseModel):
    """创建班级请求体。"""
    name: str
    grade: Optional[str] = None
    description: Optional[str] = None


class ClassUpdate(BaseModel):
    """更新班级请求体，所有字段可选。"""
    name: Optional[str] = None
    grade: Optional[str] = None
    description: Optional[str] = None


class ClassResponse(BaseModel):
    """班级详情响应。"""
    id: int
    name: str
    grade: Optional[str] = None
    description: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
