"""用户模型模块：定义系统中的用户账号（学生/教师/管理员）。"""

from sqlalchemy import Column, Integer, String, Boolean, Enum, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class User(Base):
    """用户：系统用户账号，区分学生、教师、管理员三种角色。"""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum("student", "teacher", "admin"), nullable=False, index=True)  # 角色：student=学生, teacher=教师, admin=管理员
    name = Column(String(100), nullable=False)
    email = Column(String(100))
    phone = Column(String(20))
    is_active = Column(Boolean, default=True)  # 账号是否启用（禁用后无法登录）
    class_id = Column(Integer, ForeignKey("classes.id", ondelete="SET NULL"), nullable=True, index=True)
    school_class = relationship("SchoolClass", back_populates="students")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
