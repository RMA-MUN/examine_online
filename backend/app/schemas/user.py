"""用户相关的请求/响应 Pydantic 模型。"""

from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class UserBase(BaseModel):
    """用户基础模型，包含用户的公共字段。"""
    username: str
    role: str  # 用户角色：student=学生, teacher=教师, admin=管理员
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    class_id: Optional[int] = None  # 所在班级 ID

class UserCreate(UserBase):
    """创建用户请求体（继承 UserBase，额外包含登录密码）。"""
    password: str

class UserUpdate(BaseModel):
    """更新用户请求体，所有字段可选。"""
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None  # 账号是否启用
    class_id: Optional[int] = None
    role: Optional[str] = None

class UserResponse(UserBase):
    """用户详情响应（继承 UserBase，含 id 等系统字段）。"""
    id: int
    is_active: bool  # 账号是否启用
    created_at: datetime

    class Config:
        from_attributes = True

class LoginRequest(BaseModel):
    """登录请求体。"""
    username: str
    password: str

class TokenResponse(BaseModel):
    """登录成功后的令牌响应。"""
    access_token: str
    token_type: str = "bearer"

class ProfileUpdate(BaseModel):
    """个人资料更新请求体。"""
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None

class ChangePasswordRequest(BaseModel):
    """修改密码请求体。"""
    old_password: str
    new_password: str
