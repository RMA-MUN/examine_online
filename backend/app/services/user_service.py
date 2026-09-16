"""用户管理服务：用户的增删改查与分页列表，处理用户名唯一性约束。"""

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from app.models.user import User
from app.utils.security import hash_password_async

async def get_users(db: AsyncSession, page: int = 1, page_size: int = 10, role: str = None, class_id: int = None):
    """分页查询用户列表，可按角色、班级过滤；class_id=-1 表示未分配班级。

    :return: 元组 (当前页用户列表, 总记录数)
    """
    query = select(User)
    if role:
        query = query.where(User.role == role)
    if class_id is not None and class_id != 0:
        if class_id == -1:
            query = query.where(User.class_id.is_(None))
        else:
            query = query.where(User.class_id == class_id)

    # 获取总数
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar()

    # 固定按 id 升序，保证分页顺序稳定（MySQL 无排序时顺序不确定）
    query = query.order_by(User.id)

    # 分页
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    users = result.scalars().all()

    return users, total

async def get_user(db: AsyncSession, user_id: int):
    """按 ID 查询用户，不存在时返回 None。"""
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()

async def create_user(db: AsyncSession, user_data: dict):
    """创建用户，密码以哈希形式入库。

    :raises HTTPException: 用户名已存在时返回 400
    """
    # 只有学生才分配班级，其他角色一律不关联班级
    user = User(
        username=user_data["username"],
        password_hash=await hash_password_async(user_data["password"]),
        role=user_data["role"],
        name=user_data["name"],
        email=user_data.get("email"),
        phone=user_data.get("phone"),
        class_id=user_data.get("class_id") if user_data.get("role") == "student" else None
    )
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:
        # 数据库唯一约束冲突说明用户名已被占用，回滚并提示
        await db.rollback()
        raise HTTPException(status_code=400, detail="用户名已存在")
    await db.refresh(user)
    return user

async def update_user(db: AsyncSession, user_id: int, user_data: dict):
    """更新用户信息，只更新传入的非空字段。

    :return: 更新后的用户对象；用户不存在时返回 None
    """
    user = await get_user(db, user_id)
    if not user:
        return None

    for key, value in user_data.items():
        if key == "class_id":
            # class_id 特殊处理：允许显式置空（取消学生班级关联）
            setattr(user, key, value)
        elif value is not None:
            # 其余字段值为 None 表示不修改
            setattr(user, key, value)

    await db.commit()
    await db.refresh(user)
    return user

async def delete_user(db: AsyncSession, user_id: int):
    """删除用户。

    :return: 删除成功返回 True，用户不存在返回 False
    """
    user = await get_user(db, user_id)
    if not user:
        return False

    await db.delete(user)
    await db.commit()
    return True


async def reset_password(db: AsyncSession, user_id: int, new_password: str):
    """管理员重置他人密码（不校验原密码）。

    :return: 元组 (是否成功, 错误信息)
    """
    if len(new_password) < 6:
        return False, "新密码长度不能少于6位"
    user = await get_user(db, user_id)
    if not user:
        return False, "用户不存在"
    user.password_hash = await hash_password_async(new_password)
    await db.commit()
    return True, None


VALID_IMPORT_ROLES = ("student", "teacher", "admin")


async def batch_import_users(db: AsyncSession, rows: list[dict]):
    """批量导入用户：逐行校验，坏行跳过并收集错误，好行入库。

    :return: 元组 (成功数, 错误列表 [{row, error}])
    """
    errors = []
    seen = set()
    ok = 0
    for i, r in enumerate(rows, start=2):
        username = str(r.get("username") or "").strip()
        password = str(r.get("password") or "")
        name = str(r.get("name") or "").strip()
        role = str(r.get("role") or "").strip()
        if not username or not password or not name:
            errors.append({"row": i, "error": "用户名/密码/姓名不能为空"})
            continue
        if role not in VALID_IMPORT_ROLES:
            errors.append({"row": i, "error": "角色仅支持 student/teacher/admin"})
            continue
        if len(password) < 6:
            errors.append({"row": i, "error": "密码长度不能少于6位"})
            continue
        if username in seen:
            errors.append({"row": i, "error": "文件中用户名重复"})
            continue
        seen.add(username)
        try:
            await create_user(db, {
                "username": username, "password": password, "name": name, "role": role,
                "email": r.get("email"), "phone": r.get("phone"),
                "class_id": r.get("class_id"),
            })
            ok += 1
        except Exception as e:
            errors.append({"row": i, "error": getattr(e, "detail", "导入失败")})
    return ok, errors
