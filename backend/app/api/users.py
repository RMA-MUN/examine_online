"""用户管理接口：负责用户列表查询、创建、详情查询、修改与删除，仅管理员可调用。"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File as FastAPIFile
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from app.database import get_db
from app.schemas.user import ResetPasswordRequest, UserCreate, UserUpdate, UserResponse
from app.services.user_service import batch_import_users, create_user, delete_user, get_user, get_users, reset_password, update_user
from app.services.audit_service import log_action
from app.utils.deps import require_role
from app.utils.response import success_response, paginated_response
from app.models.user import User

router = APIRouter(prefix="/api/users", tags=["用户管理"])

@router.get("")
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    role: Optional[str] = None,
    class_id: Optional[int] = Query(None, ge=-1),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """分页获取用户列表，支持按角色、班级筛选，仅管理员可调用。"""
    users, total = await get_users(db, page, page_size, role, class_id)
    users_data = [UserResponse.model_validate(u).model_dump() for u in users]
    return paginated_response(users_data, total, page, page_size)

@router.post("")
async def create_new_user(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """创建新用户（学生/教师/管理员账号），仅管理员可调用。"""
    user = await create_user(db, user_data.model_dump())
    return success_response(data=UserResponse.model_validate(user).model_dump())

@router.get("/{user_id}")
async def get_user_detail(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """获取指定用户的详细信息，仅管理员可调用。"""
    user = await get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return success_response(data=UserResponse.model_validate(user).model_dump())

@router.put("/{user_id}")
async def update_user_info(
    user_id: int,
    user_data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """修改指定用户的信息，仅管理员可调用。"""
    user = await update_user(db, user_id, user_data.model_dump(exclude_unset=True))
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return success_response(data=UserResponse.model_validate(user).model_dump())

@router.delete("/{user_id}")
async def delete_user_account(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """删除指定用户的账号，仅管理员可调用。"""
    success = await delete_user(db, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="用户不存在")
    return success_response(message="删除成功")

@router.post("/import-file")
async def import_users_from_file(
    file: UploadFile = FastAPIFile(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """通过 xlsx 批量导入用户（列：username/password/name/role/email/phone/class_id），仅管理员可调用。"""
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="仅支持 .xlsx 格式")
    file.file.seek(0, 2)
    if file.file.tell() > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="文件大小不能超过 10MB")
    file.file.seek(0)
    content = await file.read()
    import io
    from openpyxl import load_workbook
    wb = load_workbook(filename=io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.active
    header = [str(c.value or "").strip() for c in next(ws.rows)]
    rows = [dict(zip(header, [c.value for c in r])) for r in ws.rows]
    ok, errors = await batch_import_users(db, rows)
    await log_action(db, actor_id=current_user.id, action="user.import",
                     detail={"imported": ok, "failed": len(errors)})
    return success_response(data={"imported_count": ok, "errors": errors})

@router.post("/{user_id}/reset-password")
async def reset_user_password(
    user_id: int,
    body: ResetPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """重置指定用户密码（不校验原密码），仅管理员可调用。"""
    success, error = await reset_password(db, user_id, body.new_password)
    if not success:
        raise HTTPException(status_code=400 if error != "用户不存在" else 404, detail=error)
    await log_action(db, actor_id=current_user.id, action="user.reset_password",
                     target_type="user", target_id=user_id,
                     ip=request.client.host if request.client else None)
    return success_response(message="密码已重置")
