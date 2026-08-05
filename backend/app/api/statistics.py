"""统计报表接口：负责考试统计分析、成绩导出、仪表盘数据查询及仪表盘数据文件导出。"""

from io import BytesIO
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.statistics_service import get_exam_statistics, export_exam_scores, get_dashboard_data
from app.services.dashboard_export_service import (
    DashboardExportError,
    allowed_datasets_for_role,
    get_dashboard_export_datasets,
    render_dashboard_export,
)
from app.utils.deps import get_current_user, require_role
from app.utils.response import success_response
from app.models.user import User

router = APIRouter(tags=["统计报表"])

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
