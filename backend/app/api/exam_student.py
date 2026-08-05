"""学生考试接口：负责学生查看考试记录、开始考试、获取试卷、保存/提交答案及切屏防作弊记录。"""

from fastapi import APIRouter, Depends, HTTPException, Body
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.exam_student_service import start_exam, get_paper, save_answers, submit_exam, get_my_records
from app.services.anti_cheat_service import record_switch, get_switch_status
from app.utils.deps import get_current_user, require_role
from app.utils.response import success_response, error_response
from app.models.user import User

router = APIRouter(tags=["学生考试"])

@router.get("/api/records")
async def list_my_records(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["student"]))
):
    """获取当前学生的考试记录列表，仅学生可调用。"""
    records = await get_my_records(db, current_user.id)
    return success_response(data=records)

@router.post("/api/exams/{exam_id}/start")
async def start_exam_action(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["student"]))
):
    """开始考试：创建考试记录并启动计时，仅学生可调用。"""
    record, error = await start_exam(db, exam_id, current_user.id)
    if error:
        return error_response(message=error)
    return success_response(data={"record_id": record.id})

@router.get("/api/exams/{exam_id}/paper")
async def get_paper_action(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["student"]))
):
    """获取当前学生的考试试卷内容（含题目），仅学生可调用。"""
    paper, error = await get_paper(db, exam_id, current_user.id)
    if error:
        return error_response(message=error)
    return success_response(data=paper)

@router.post("/api/exams/{exam_id}/save")
async def save_answers_action(
    exam_id: int,
    answers: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["student"]))
):
    """暂存当前学生的答题内容（草稿保存），仅学生可调用。"""
    success, error = await save_answers(db, exam_id, current_user.id, answers)
    if not success:
        return error_response(message=error)
    return success_response(message="保存成功")

@router.post("/api/exams/{exam_id}/submit")
async def submit_exam_action(
    exam_id: int,
    payload: Optional[dict] = Body(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["student"]))
):
    """提交考试：结束考试并返回得分，仅学生可调用。"""
    submitted_answers = payload.get("answers") if payload else None
    record, error = await submit_exam(db, exam_id, current_user.id, submitted_answers)
    if error:
        return error_response(message=error)
    return success_response(data={"score": record.score})

@router.post("/api/exams/{exam_id}/switch")
async def record_switch_action(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["student"]))
):
    """记录一次切屏行为（防作弊检测），仅学生可调用。"""
    data, error = await record_switch(db, exam_id, current_user.id)
    if error:
        return error_response(message=error)
    return success_response(data=data)

@router.get("/api/exams/{exam_id}/switch-status")
async def get_switch_status_action(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["student"]))
):
    """获取当前学生的切屏次数状态（防作弊检测），仅学生可调用。"""
    data = await get_switch_status(db, exam_id, current_user.id)
    if not data:
        return error_response(message="考试不存在")
    return success_response(data=data)
