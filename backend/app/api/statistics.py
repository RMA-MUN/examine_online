"""统计报表接口：负责考试统计分析、成绩导出、仪表盘数据查询及仪表盘数据文件导出。"""

from io import BytesIO
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.statistics_service import get_exam_statistics, export_exam_scores, get_dashboard_data
from app.services.analytics_service import (
    get_class_compare as fetch_class_compare,
    get_discrimination as fetch_discrimination,
    get_exam_question_stats as fetch_question_stats,
    get_exam_student_scores as fetch_student_scores,
    get_knowledge_stats as fetch_knowledge_stats,
    get_score_bins as fetch_score_bins,
)
from app.services.teacher_subject_service import can_teacher_manage_exam
from app.services.dashboard_export_service import (
    DashboardExportError,
    allowed_datasets_for_role,
    get_dashboard_export_datasets,
    render_dashboard_export,
)
from app.services.score_export_service import (
    ScoreExportError,
    build_score_export_data,
    get_score_export_options,
    render_score_export,
)
from app.services.report_service import collect_report_data, render_report_xlsx
from app.utils.deps import get_current_user, require_role
from app.utils.response import success_response
from app.models.user import User

router = APIRouter(tags=["统计报表"])

async def _ensure_teacher_can_manage_exam(db: AsyncSession, current_user: User, exam_id: int):
    """校验教师是否具备管理指定考试的权限，不具备则抛出 403；管理员不受限。"""
    if current_user.role == "teacher" and not await can_teacher_manage_exam(
        db, current_user.id, exam_id
    ):
        raise HTTPException(status_code=403, detail="无权管理该考试")

@router.get("/api/statistics/exam/{exam_id}/questions")
async def get_exam_question_stats(
    exam_id: int,
    include: str | None = Query(default=None, description="逗号分隔的聚合展开项：knowledge,classes,bins,discrimination"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """逐题统计（平均分/正确率/分布+D/知识点），仅教师/管理员可调用；教师需具备该考试的管理权限。

    向后兼容：不带 include 时 data 为原逐题数组（元素仅新增 knowledge/p/d 字段）；
    带 include 时 data 为 {"items": [...], "knowledge"?, "classes"?, "bins"?, "discrimination"?}。
    """
    await _ensure_teacher_can_manage_exam(db, current_user, exam_id)
    items = await fetch_question_stats(db, exam_id)
    if not include:
        return success_response(data=items)
    wanted = {part.strip().lower() for part in include.split(",") if part.strip()}
    data: dict = {"items": items}
    if "knowledge" in wanted:
        data["knowledge"] = await fetch_knowledge_stats(db, exam_id)
    if "classes" in wanted:
        data["classes"] = await fetch_class_compare(db, exam_id)
    if "bins" in wanted:
        data["bins"] = await fetch_score_bins(db, exam_id)
    if "discrimination" in wanted:
        data["discrimination"] = await fetch_discrimination(db, exam_id)
    return success_response(data=data)

@router.get("/api/statistics/exam/{exam_id}/knowledge")
async def get_exam_knowledge_stats(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """知识点掌握度（按 Question.tags 首项聚合得分率），仅教师/管理员可调用。"""
    await _ensure_teacher_can_manage_exam(db, current_user, exam_id)
    return success_response(data=await fetch_knowledge_stats(db, exam_id))

@router.get("/api/statistics/exam/{exam_id}/classes")
async def get_exam_class_compare(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """班级对比（平均分/及格率/人数），仅教师/管理员可调用。"""
    await _ensure_teacher_can_manage_exam(db, current_user, exam_id)
    return success_response(data=await fetch_class_compare(db, exam_id))

@router.get("/api/statistics/exam/{exam_id}/bins")
async def get_exam_score_bins(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """分数段分布（固定 7 段），仅教师/管理员可调用。"""
    await _ensure_teacher_can_manage_exam(db, current_user, exam_id)
    return success_response(data=await fetch_score_bins(db, exam_id))

@router.get("/api/statistics/exam/{exam_id}/discrimination")
async def get_exam_discrimination(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """逐题难度 P 与区分度 D，仅教师/管理员可调用。"""
    await _ensure_teacher_can_manage_exam(db, current_user, exam_id)
    return success_response(data=await fetch_discrimination(db, exam_id))

@router.get("/api/statistics/exam/{exam_id}/students")
async def get_exam_student_scores(
    exam_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    class_id: int | None = Query(default=None),
    keyword: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """学生成绩分页（含排名/切屏/状态），仅教师/管理员可调用；教师需具备该考试的管理权限。"""
    await _ensure_teacher_can_manage_exam(db, current_user, exam_id)
    data = await fetch_student_scores(db, exam_id, page, page_size, class_id, keyword)
    return success_response(data=data)

@router.get("/api/statistics/exam/{exam_id}")
async def get_exam_stats(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """获取指定考试的统计分析数据（如平均分、分数分布等），仅教师/管理员可调用。"""
    stats = await get_exam_statistics(db, exam_id)
    if not stats:
        return success_response(data={"message": "暂无数据"})
    return success_response(data=stats)

@router.get("/api/statistics/export/{exam_id}")
async def export_scores(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """导出指定考试的成绩数据，仅教师/管理员可调用。"""
    data = await export_exam_scores(db, exam_id)
    return success_response(data=data)

@router.get("/api/statistics/dashboard")
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取仪表盘统计数据，按当前用户角色返回对应可见的数据集，所有已登录用户均可调用。"""
    data = await get_dashboard_data(db, current_user)
    return success_response(data=data)


@router.get("/api/statistics/dashboard/export")
async def export_dashboard_file(
    file_format: str = Query(..., alias="format"),
    dataset: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """导出仪表盘统计数据为 CSV/XLSX 文件，所有已登录用户均可调用。"""
    if file_format not in {"csv", "xlsx"}:
        raise HTTPException(status_code=400, detail="Unsupported export format")

    selected_dataset = dataset or "summary"
    # CSV 导出需校验所选数据集对当前角色是否允许
    if file_format == "csv" and selected_dataset not in allowed_datasets_for_role(
        current_user.role
    ):
        raise HTTPException(status_code=400, detail="当前角色不支持该导出数据集")

    try:
        datasets = await get_dashboard_export_datasets(db, current_user)
        content, media_type, filename = render_dashboard_export(
            datasets,
            file_format,
            selected_dataset if file_format == "csv" else None,
        )
    except DashboardExportError as exc:
        # 数据生成或渲染失败时返回 400 及错误原因
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return StreamingResponse(
        BytesIO(content),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/api/statistics/scores/export")
async def export_scores_file(
    class_id: int | None = Query(default=None),
    course_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"])),
):
    """导出成绩明细 Excel（班级成绩汇总、学生成绩/题目得分明细），仅教师/管理员可调用。"""
    try:
        datasets = await build_score_export_data(db, current_user, class_id, course_id)
        content, media_type, filename = render_score_export(datasets)
    except ScoreExportError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return StreamingResponse(
        BytesIO(content),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/api/statistics/scores/export-options")
async def get_score_export_options_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"])),
):
    """返回当前用户可导出的班级与科目选项，仅教师/管理员可调用。"""
    options = await get_score_export_options(db, current_user)
    return success_response(data=options)


class ReportReq(BaseModel):
    """分析报告请求体：sections 缺省时返回全量（向后兼容）。"""

    sections: list[str] | None = None


@router.post("/api/statistics/exam/{exam_id}/report")
async def build_report(
    exam_id: int,
    payload: ReportReq,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"])),
):
    """按 sections 导出考试分析报告 xlsx（成绩/质量/知识点），仅教师/管理员可调用；教师需具备该考试的管理权限。"""
    await _ensure_teacher_can_manage_exam(db, current_user, exam_id)
    data, used = await collect_report_data(db, exam_id, payload.sections)
    content, media_type, filename = render_report_xlsx(data, used)
    return StreamingResponse(
        BytesIO(content),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
