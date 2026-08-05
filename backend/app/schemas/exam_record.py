"""考试记录（学生参与考试的过程记录）相关的 Pydantic 模型。"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ExamRecordBase(BaseModel):
    """考试记录基础模型。"""
    exam_id: int

class ExamRecordResponse(ExamRecordBase):
    """考试记录详情响应（继承 ExamRecordBase，含学生答题过程信息）。"""
    id: int
    student_id: int
    start_time: datetime
    submit_time: Optional[datetime] = None
    score: int
    status: str  # 记录状态：ongoing=进行中, submitted=已提交, graded=已阅卷
    switch_count: int  # 切屏次数（防作弊检测）
    created_at: datetime

    class Config:
        from_attributes = True
