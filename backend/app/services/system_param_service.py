"""系统参数服务：KV 读写，白名单校验 key。"""

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.system_param import SystemParam

ALLOWED_PARAM_KEYS = frozenset({
    "default.duration", "default.pass_score", "default.save_interval",
    "default.grace_seconds", "default.max_switch",
    "switch.show_objective_score", "switch.show_answer", "switch.auto_objective",
    "switch.ai_assist", "switch.double_review_audit", "switch.allow_appeal",
})


async def get_all_params(db: AsyncSession) -> dict[str, str]:
    """返回全部参数的 {key: value} 映射。"""
    result = await db.execute(select(SystemParam))
    return {p.key: p.value for p in result.scalars().all()}


async def upsert_params(db: AsyncSession, items: dict[str, str], updated_by: int) -> dict[str, str]:
    """批量更新参数；未知 key 直接 400。"""
    for k in items:
        if k not in ALLOWED_PARAM_KEYS:
            raise HTTPException(status_code=400, detail=f"未知参数: {k}")
    for k, v in items.items():
        param = await db.get(SystemParam, k)
        if param is None:
            db.add(SystemParam(key=k, value=str(v), updated_by=updated_by))
        else:
            param.value = str(v)
            param.updated_by = updated_by
    await db.commit()
    return await get_all_params(db)
