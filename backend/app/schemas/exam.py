from pydantic import BaseModel
from typing import Optional, List, Literal
from datetime import datetime


class StudentOverride(BaseModel):
    student_id: int
    action: Literal["include", "exclude"]  # "include"=额外添加, "exclude"=排除


class ExamBase(BaseModel):
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    duration: int
    total_score: int = 100
    pass_score: int = 60
    random_order: bool = True
    max_switch: int = 3


class ExamCreate(ExamBase):
    course_id: int
    class_ids: List[int] = []
    student_overrides: List[StudentOverride] = []


class ExamUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration: Optional[int] = None
    total_score: Optional[int] = None
    pass_score: Optional[int] = None
    random_order: Optional[bool] = None
    max_switch: Optional[int] = None
    status: Optional[str] = None
    class_ids: Optional[List[int]] = None
    student_overrides: Optional[List[StudentOverride]] = None


class ExamResponse(ExamBase):
    id: int
    course_id: int
    status: str
    created_at: datetime
    assigned_class_ids: List[int] = []
    student_overrides: List[StudentOverride] = []
    student_record_status: Optional[str] = None

    model_config = {"from_attributes": True}
