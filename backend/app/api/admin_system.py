"""系统管理接口：审计日志查询与系统参数读写，仅管理员可调用。"""

from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.user import User
from app.services.audit_service import list_logs
from app.services.system_param_service import get_all_params, upsert_params
from app.services.audit_service import log_action
from app.utils.deps import require_role
from app.utils.response import success_response, paginated_response

router = APIRouter(tags=["系统管理"])


@router.get("/api/admin/logs")
async def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    type: str | None = Query(default=None, description="action 前缀过滤"),
    since: datetime | None = Query(default=None),
    until: datetime | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin"])),
):
    """分页查询审计日志，按时间倒序，仅管理员可调用。"""
    items, total = await list_logs(db, page, page_size, type, since, until)
    return paginated_response(items, total, page, page_size)


@router.get("/api/admin/params")
async def read_params(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin"])),
):
    """读取全部系统参数，仅管理员可调用。"""
    return success_response(data=await get_all_params(db))


@router.put("/api/admin/params")
async def write_params(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """批量更新系统参数（未知 key 直接 400），仅管理员可调用。"""
    data = await upsert_params(db, body.get("items", {}), current_user.id)
    await log_action(db, actor_id=current_user.id, action="system_param.update")
    return success_response(data=data)
