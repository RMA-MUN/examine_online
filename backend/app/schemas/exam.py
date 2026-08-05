"""考试相关的请求/响应 Pydantic 模型。"""

from pydantic import BaseModel
from typing import Optional, List, Literal
from datetime import datetime


class StudentOverride(BaseModel):
    """考生单独调整项：对班级名单之外的学生进行额外添加或排除。"""
    student_id: int
    action: Literal["include", "exclude"]  # "include"=额外添加, "exclude"=排除


class ExamBase(BaseModel):
    """考试基础模型，包含考试的公共字段。"""
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    duration: int  # 考试时长（分钟）
    total_score: int = 100
    pass_score: int = 60  # 及格分数线
    random_order: bool = True  # 题目是否随机排序
    max_switch: int = 3  # 最大切屏次数（防作弊检测）


class ExamCreate(ExamBase):
    """创建考试请求体（继承 ExamBase，含课程与考生范围）。"""
    course_id: int
    class_ids: List[int] = []  # 参与考试的班级 ID 列表
    student_overrides: List[StudentOverride] = []  # 考生名单单独调整项


class ExamUpdate(BaseModel):
    """更新考试请求体，所有字段可选。"""
    title: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration: Optional[int] = None
    total_score: Optional[int] = None
    pass_score: Optional[int] = None
    random_order: Optional[bool] = None
    max_switch: Optional[int] = None
    status: Optional[str] = None  # 考试状态：draft=草稿, published=已发布, ongoing=进行中, finished=已结束
    class_ids: Optional[List[int]] = None
    student_overrides: Optional[List[StudentOverride]] = None


class ExamResponse(ExamBase):
    """考试详情响应（继承 ExamBase，含 id、状态等系统字段）。"""
    id: int
    course_id: int
    status: str  # 考试状态：draft=草稿, published=已发布, ongoing=进行中, finished=已结束
    created_at: datetime
    assigned_class_ids: List[int] = []  # 实际分配的班级 ID 列表
    student_overrides: List[StudentOverride] = []
    student_record_status: Optional[str] = None  # 当前学生的考试记录状态：ongoing/submitted/graded

    model_config = {"from_attributes": True}
