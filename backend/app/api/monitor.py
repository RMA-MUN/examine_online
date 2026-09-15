"""监控事件接口：学生上报防作弊事件，教师/管理员按考试或记录查询事件。"""

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.exam_record import ExamRecord
from app.models.monitor_event import MonitorEvent
from app.models.user import User
from app.services.teacher_subject_service import can_teacher_manage_exam
from app.utils.deps import require_role
from app.utils.response import paginated_response, success_response

router = APIRouter(tags=["考试监控"])


class EventCreate(BaseModel):
    """上报监控事件请求体：事件类型必填，附加信息可选。"""

    event_type: Literal["switch", "blur", "fullscreen_exit", "paste", "face_lost"]
    detail: Optional[dict] = None


def _event_to_dict(event: MonitorEvent) -> dict:
    """监控事件 ORM 对象转字典，用于接口返回。"""
    return {
        "id": event.id,
        "exam_id": event.exam_id,
        "record_id": event.record_id,
        "student_id": event.student_id,
        "event_type": event.event_type,
        "detail": event.detail,
        "created_at": event.created_at,
    }


async def _ensure_teacher_can_manage_exam(db: AsyncSession, current_user: User, exam_id: int):
    """校验教师是否具备管理指定考试的权限，不具备则抛出 403；管理员不受限。"""
    if current_user.role == "teacher" and not await can_teacher_manage_exam(
        db, current_user.id, exam_id
    ):
        raise HTTPException(status_code=403, detail="无权管理该考试")


@router.post("/api/exams/{exam_id}/events", status_code=201)
async def create_exam_event(
    exam_id: int,
    payload: EventCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["student"])),
):
    """上报一次监控事件（防作弊行为），仅学生可调用且只能写入自己的考试记录。"""
    result = await db.execute(
        select(ExamRecord).where(
            ExamRecord.student_id == current_user.id,
            ExamRecord.exam_id == exam_id,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    event = MonitorEvent(
        exam_id=exam_id,
        record_id=record.id,
        student_id=current_user.id,
        event_type=payload.event_type,
        detail=payload.detail,
    )
    db.add(event)
    # 切屏事件同步累加记录的切屏次数，保持与 record_switch 一致的计数口径
    if payload.event_type == "switch":
        record.switch_count = (record.switch_count or 0) + 1
    await db.commit()
    await db.refresh(event)
    return {"code": 201, "message": "success", "data": _event_to_dict(event)}


@router.get("/api/exams/{exam_id}/events")
async def list_exam_events(
    exam_id: int,
    record_id: Optional[int] = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"])),
):
    """分页查询某场考试的监控事件，仅教师/管理员可调用；教师需有该考试管理权。"""
    await _ensure_teacher_can_manage_exam(db, current_user, exam_id)
    query = select(MonitorEvent).where(MonitorEvent.exam_id == exam_id)
    if record_id is not None:
        query = query.where(MonitorEvent.record_id == record_id)
    query = query.order_by(MonitorEvent.id.desc())
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()
    result = await db.execute(query.offset((page - 1) * page_size).limit(page_size))
    items = [_event_to_dict(e) for e in result.scalars().all()]
    return paginated_response(items, total, page, page_size)


@router.get("/api/records/{record_id}/events")
async def list_record_events(
    record_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"])),
):
    """查询某条考试记录的全部监控事件（按发生顺序），仅教师/管理员可调用。"""
    record = await db.get(ExamRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    await _ensure_teacher_can_manage_exam(db, current_user, record.exam_id)
    result = await db.execute(
        select(MonitorEvent)
        .where(MonitorEvent.record_id == record_id)
        .order_by(MonitorEvent.id)
    )
    return success_response(data=[_event_to_dict(e) for e in result.scalars().all()])
