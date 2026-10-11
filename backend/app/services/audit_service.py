"""审计日志服务：记录关键操作与分页查询，写入失败不阻塞主流程。"""

import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.audit_log import AuditLog

logger = logging.getLogger("app.services.audit")


async def log_action(
    db: AsyncSession,
    *,
    actor_id: int | None,
    action: str,
    target_type: str | None = None,
    target_id: int | None = None,
    ip: str | None = None,
    detail: dict | None = None,
) -> None:
    """记录一条审计日志；任何异常只记 warning，不向上传播。"""
    try:
        db.add(AuditLog(
            actor_id=actor_id, action=action, target_type=target_type,
            target_id=target_id, ip=ip, detail=detail,
        ))
        await db.commit()
    except Exception:
        await db.rollback()
        logger.warning("审计日志写入失败 action=%s", action)


async def list_logs(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 10,
    action_prefix: str | None = None,
    since=None,
    until=None,
) -> tuple[list[dict], int]:
    """分页查询审计日志，按 id 倒序；action_prefix 为 action 前缀匹配。"""
    query = select(AuditLog)
    if action_prefix:
        escaped = action_prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.where(AuditLog.action.like(f"{escaped}%", escape="\\"))
    if since is not None:
        query = query.where(AuditLog.created_at >= since)
    if until is not None:
        query = query.where(AuditLog.created_at <= until)
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    result = await db.execute(
        query.order_by(AuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    items = [
        {
            "id": l.id, "actor_id": l.actor_id, "action": l.action,
            "target_type": l.target_type, "target_id": l.target_id,
            "ip": l.ip, "detail": l.detail, "created_at": l.created_at,
        }
        for l in result.scalars().all()
    ]
    return items, total
