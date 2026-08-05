"""阅卷管理接口：负责教师查看考试记录与答卷、手动评分、AI评分重试、成绩定稿及学生查看成绩。"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.answer import GradeRequest
from app.services.grading_service import get_exam_records, get_record_answers, grade_answer, finalize_record, get_exam_id_by_record, get_exam_id_by_answer
from app.services.ai_grading_service import retry_ai_grading_task
from app.services.teacher_subject_service import can_teacher_manage_exam
from app.utils.deps import get_current_user, require_role
from app.utils.response import success_response, paginated_response
from app.models.exam_record import ExamRecord
from app.models.user import User

router = APIRouter(tags=["阅卷管理"])

async def _ensure_teacher_can_manage_exam(db: AsyncSession, current_user: User, exam_id: int):
    """校验教师是否具备管理指定考试的权限，不具备则抛出 403；管理员不受限。"""
    if current_user.role == "teacher" and not await can_teacher_manage_exam(
        db, current_user.id, exam_id
    ):
        raise HTTPException(status_code=403, detail="无权管理该考试")

@router.get("/api/exams/{exam_id}/records")
async def list_exam_records(
    exam_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """分页获取某场考试的学生考试记录列表，仅教师/管理员可调用；教师需有该考试管理权。"""
    await _ensure_teacher_can_manage_exam(db, current_user, exam_id)
    records, total = await get_exam_records(db, exam_id, page, page_size)
    return paginated_response(records, total, page, page_size)

@router.get("/api/records/{record_id}/answers")
async def list_record_answers(
    record_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """获取某条考试记录下所有题目的答卷详情，仅教师/管理员可调用。"""
    exam_id = await get_exam_id_by_record(db, record_id)
    if exam_id is None:
        raise HTTPException(status_code=404, detail="记录不存在")
    await _ensure_teacher_can_manage_exam(db, current_user, exam_id)
    answers = await get_record_answers(db, record_id)
    return success_response(data=answers)

@router.put("/api/answers/{answer_id}/grade")
async def grade_single_answer(
    answer_id: int,
    grade_data: GradeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """手动评分单道题目（可覆盖AI评分结果），仅教师/管理员可调用。"""
    exam_id = await get_exam_id_by_answer(db, answer_id)
    if exam_id is None:
        raise HTTPException(status_code=404, detail="答案不存在")
    await _ensure_teacher_can_manage_exam(db, current_user, exam_id)
    answer = await grade_answer(
        db,
        answer_id,
        current_user.id,
        grade_data.score,
        grade_data.is_correct,
        grade_data.override_reason,
    )
    if not answer:
        raise HTTPException(status_code=404, detail="答案不存在")
    return success_response(data={"id": answer.id, "score": answer.score})

@router.post("/api/answers/{answer_id}/ai-grading/retry")
async def retry_ai_grading(
    answer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"])),
):
    """对失败的 AI 评分任务发起重试，仅教师/管理员可调用。"""
    exam_id = await get_exam_id_by_answer(db, answer_id)
    if exam_id is None:
        raise HTTPException(status_code=404, detail="答案不存在")
    await _ensure_teacher_can_manage_exam(db, current_user, exam_id)
    task = await retry_ai_grading_task(db, answer_id)
    if not task:
        # 仅失败的 AI 评分任务允许重试，否则返回 409 冲突
        raise HTTPException(status_code=409, detail="仅失败的 AI 评分任务可重试")
    return success_response(data={"answer_id": answer_id, "status": task.status})

@router.put("/api/records/{record_id}/finalize")
async def finalize_record_action(
    record_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """定稿考试记录（结束阅卷、锁定成绩），仅教师/管理员可调用。"""
    exam_id = await get_exam_id_by_record(db, record_id)
    if exam_id is None:
        raise HTTPException(status_code=404, detail="记录不存在")
    await _ensure_teacher_can_manage_exam(db, current_user, exam_id)
    record = await finalize_record(db, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    return success_response(data={"id": record.id, "status": record.status})

@router.get("/api/records/{record_id}/result")
async def get_my_result(
    record_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["student"]))
):
    """学生查看自己的考试结果详情，仅学生可调用。"""
    record = await db.get(ExamRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    # 越权校验：只能查看本人的考试记录
    if record.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权查看该记录")
    # 状态校验：仅已提交或已阅卷定稿的记录可查看成绩
    if record.status not in ("submitted", "graded"):
        raise HTTPException(status_code=403, detail="考试尚未提交")
    answers = await get_record_answers(db, record_id)
    for answer in answers:
        # 对外隐藏 AI 评分内部错误信息，仅保留评分结果
        answer["ai_grading"].pop("last_error", None)
    return success_response(data=answers)
