"""教师-学科关联相关的 Pydantic 模型。"""

from pydantic import BaseModel


class TeacherSubjectCreate(BaseModel):
    """为教师绑定学科的请求体。"""
    subject_id: int
