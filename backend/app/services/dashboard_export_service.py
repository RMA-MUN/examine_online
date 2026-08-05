"""仪表盘导出服务：按角色组装导出数据集，并将数据渲染为 CSV / XLSX 文件。"""

import csv
from datetime import datetime
from io import BytesIO, StringIO
from typing import Literal

from openpyxl import Workbook
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.answer import Answer
from app.models.course import Course
from app.models.exam import Exam
from app.models.exam_record import ExamRecord
from app.models.user import User


# 各角色可导出的数据集白名单
STUDENT_DATASETS = frozenset({"summary", "recent_records", "upcoming_exams"})
TEACHER_DATASETS = frozenset({"summary", "pending_grading", "recent_exams"})
ADMIN_DATASETS = frozenset({"summary", "role_distribution", "recent_users"})

_DATASETS_BY_ROLE = {
    "student": STUDENT_DATASETS,
    "teacher": TEACHER_DATASETS,
    "admin": ADMIN_DATASETS,
}

# 导出文件表头的中英文映射，默认英文列名展示为中文
_CHINESE_HEADERS = {
    "metric": "指标",
    "value": "数值",
    "student_id": "学生 ID",
    "exam_id": "考试 ID",
    "exam_title": "考试名称",
    "score": "得分",
    "pass_score": "及格分数",
    "status": "状态",
    "submit_time": "提交时间",
    "start_time": "开始时间",
    "duration": "时长（分钟）",
    "course_id": "课程 ID",
    "title": "名称",
    "pending_count": "待批改数量",
    "role": "角色",
    "count": "数量",
    "user_id": "用户 ID",
    "username": "用户名",
    "name": "姓名",
    "created_at": "创建时间",
}

# 每个数据集应导出的列，空数据集时作为表头兜底
_DATASET_COLUMNS = {
    "summary": ["metric", "value"],
    "recent_records": [
        "student_id",
        "exam_id",
        "exam_title",
        "score",
        "pass_score",
        "status",
        "submit_time",
    ],
    "upcoming_exams": ["exam_id", "title", "start_time", "duration"],
    "pending_grading": ["exam_title", "pending_count"],
    "recent_exams": ["course_id", "exam_id", "title", "status", "start_time"],
    "role_distribution": ["role", "count"],
    "recent_users": ["user_id", "username", "name", "role", "created_at"],
}


class DashboardExportError(ValueError):
    """导出请求无法安全渲染时抛出的异常。"""


def allowed_datasets_for_role(role: str) -> frozenset[str]:
    """返回某角色允许导出的数据集集合。"""
    return _DATASETS_BY_ROLE.get(role, frozenset())


def _serialise_value(value: object) -> object:
    """导出前将 datetime 序列化为 ISO 字符串。"""
    return value.isoformat() if isinstance(value, datetime) else value


async def get_dashboard_export_datasets(
    db: AsyncSession, user: User
) -> dict[str, list[dict[str, object]]]:
    """按用户角色获取仪表盘各数据集的导出数据。

    :raises DashboardExportError: 不支持的角色
    """
    if user.role == "student":
        return await _student_datasets(db, user)
    if user.role == "teacher":
        return await _teacher_datasets(db, user)
    if user.role == "admin":
        return await _admin_datasets(db)
    raise DashboardExportError("Unsupported dashboard role")


async def _student_datasets(
    db: AsyncSession, user: User
) -> dict[str, list[dict[str, object]]]:
    """组装学生视角的导出数据集：概要、最近成绩、即将开始的考试。"""
    now = datetime.now()
    # 可参加的考试：已发布/进行中且未过截止时间
    available = (
        await db.execute(
            select(Exam)
            .where(Exam.status.in_(["published", "ongoing"]), Exam.end_time > now)
            .order_by(Exam.start_time.asc())
        )
    ).scalars().all()
    records = (
        await db.execute(select(ExamRecord).where(ExamRecord.student_id == user.id))
    ).scalars().all()
    records = [record for record in records if record.student_id == user.id]
    pass_rows = (
        await db.execute(
            select(ExamRecord, Exam.pass_score)
            .join(Exam, Exam.id == ExamRecord.exam_id)
            .where(
                ExamRecord.student_id == user.id,
                ExamRecord.status.in_(["submitted", "graded"]),
            )
        )
    ).all()
    pass_rows = [row for row in pass_rows if row[0].student_id == user.id]
    # 平均分只统计已有成绩的记录
    graded = [
        record
        for record in records
        if record.status in ("submitted", "graded") and record.score is not None
    ]
    # 及格判定按各考试自己的及格线，取 >= 即算及格
    passed = sum(
        1
        for record, pass_score in pass_rows
        if record.score is not None and record.score >= pass_score
    )
    recent_records = (
        await db.execute(
            select(ExamRecord)
            .where(
                ExamRecord.student_id == user.id,
                ExamRecord.status.in_(["submitted", "graded"]),
            )
            .order_by(ExamRecord.start_time.desc())
        )
    ).scalars().all()
    recent_records = [
        record
        for record in recent_records
        if record.student_id == user.id and record.status in ("submitted", "graded")
    ][:5]

    recent_rows = []
    for record in recent_records:
        pass_score = (
            await db.execute(select(Exam.pass_score).where(Exam.id == record.exam_id))
        ).scalar_one_or_none() or 0
        exam_title = (
            await db.execute(select(Exam.title).where(Exam.id == record.exam_id))
        ).scalar_one_or_none() or ""
        recent_rows.append(
            {
                "student_id": record.student_id,
                "exam_id": record.exam_id,
                "exam_title": exam_title,
                "score": record.score,
                "pass_score": pass_score,
                "status": record.status,
                "submit_time": _serialise_value(record.submit_time),
            }
        )

    return {
        "summary": [
            {"metric": "available_exams", "value": len(available)},
            {"metric": "my_exam_count", "value": len(records)},
            {
                "metric": "avg_score",
                "value": round(sum(record.score for record in graded) / len(graded), 2)
                if graded
                else 0,
            },
            {
                "metric": "pass_rate",
                "value": round(passed / len(pass_rows) * 100, 2) if pass_rows else 0,
            },
        ],
        "recent_records": recent_rows,
        "upcoming_exams": [
            {
                "exam_id": exam.id,
                "title": exam.title,
                "start_time": _serialise_value(exam.start_time),
                "duration": exam.duration,
            }
            for exam in available
            if exam.start_time > now
        ][:2],
    }


async def _teacher_datasets(
    db: AsyncSession, user: User
) -> dict[str, list[dict[str, object]]]:
    """组装教师视角的导出数据集：概要、待批改分布、最近考试。"""
    courses = (
        await db.execute(select(Course).where(Course.teacher_id == user.id))
    ).scalars().all()
    courses = [course for course in courses if course.teacher_id == user.id]
    course_ids = [course.id for course in courses]
    exams = (
        await db.execute(select(Exam).where(Exam.course_id.in_(course_ids)))
    ).scalars().all()
    exams = [exam for exam in exams if exam.course_id in course_ids]
    exam_ids = [exam.id for exam in exams]
    records = []
    answers = []
    if exam_ids:
        records = (
            await db.execute(select(ExamRecord).where(ExamRecord.exam_id.in_(exam_ids)))
        ).scalars().all()
        records = [record for record in records if record.exam_id in exam_ids]
        record_ids = [record.id for record in records]
        if record_ids:
            # 待批改答案 = 评分来源仍为 pending 的答案
            answers = (
                await db.execute(
                    select(Answer).where(
                        Answer.record_id.in_(record_ids), Answer.grading_source == "pending"
                    )
                )
            ).scalars().all()
            answers = [answer for answer in answers if answer.record_id in record_ids]

    # 按考试维度聚合待批改答案数
    record_exam_ids = {record.id: record.exam_id for record in records}
    pending_by_exam: dict[int, int] = {}
    for answer in answers:
        exam_id = record_exam_ids.get(answer.record_id)
        if exam_id is not None:
            pending_by_exam[exam_id] = pending_by_exam.get(exam_id, 0) + 1

    return {
        "summary": [
            {
                "metric": "published_exams",
                "value": sum(exam.status in ("published", "ongoing") for exam in exams),
            },
            {"metric": "pending_grading_count", "value": sum(pending_by_exam.values())},
            {"metric": "course_count", "value": len(courses)},
            {"metric": "total_records", "value": len(records)},
        ],
        "pending_grading": [
            {"exam_title": exam.title, "pending_count": pending_by_exam[exam.id]}
            for exam in exams
            if pending_by_exam.get(exam.id, 0) > 0
        ][:5],
        "recent_exams": [
            {
                "course_id": exam.course_id,
                "exam_id": exam.id,
                "title": exam.title,
                "status": exam.status,
                "start_time": _serialise_value(exam.start_time),
            }
            for exam in sorted(exams, key=lambda exam: exam.start_time, reverse=True)[:5]
        ],
    }


async def _admin_datasets(db: AsyncSession) -> dict[str, list[dict[str, object]]]:
    """组装管理员视角的导出数据集：概要、角色分布、最近注册用户。"""
    users = (await db.execute(select(User))).scalars().all()
    exam_count = (await db.execute(select(func.count()).select_from(Exam))).scalar_one()
    role_counts = {"student": 0, "teacher": 0, "admin": 0}
    for user in users:
        if user.role in role_counts:
            role_counts[user.role] += 1

    return {
        "summary": [
            {"metric": "student_count", "value": role_counts["student"]},
            {"metric": "teacher_count", "value": role_counts["teacher"]},
            {"metric": "admin_count", "value": role_counts["admin"]},
            {"metric": "exam_count", "value": exam_count},
        ],
        "role_distribution": [
            {"role": role, "count": count} for role, count in role_counts.items()
        ],
        "recent_users": [
            {
                "user_id": user.id,
                "username": user.username,
                "name": user.name,
                "role": user.role,
                "created_at": _serialise_value(user.created_at),
            }
            for user in sorted(users, key=lambda user: user.created_at, reverse=True)[:5]
        ],
    }


def _headers(name: str, rows: list[dict[str, object]]) -> list[str]:
    """确定导出列名：有数据时取首行键，无数据时用预设列兜底。"""
    return list(rows[0]) if rows else _DATASET_COLUMNS.get(name, [])


def render_dashboard_export(
    datasets: dict[str, list[dict[str, object]]],
    file_format: Literal["csv", "xlsx"],
    dataset: str | None = None,
) -> tuple[bytes, str, str]:
    """将数据集渲染为指定格式的文件。

    :return: 元组 (文件字节内容, MIME 类型, 文件名)
    :raises DashboardExportError: 未知数据集或未知格式
    """
    if file_format == "csv":
        if dataset is None or dataset not in datasets:
            raise DashboardExportError("Unknown dataset for CSV export")
        rows = datasets[dataset]
        headers = _headers(dataset, rows)
        output = StringIO(newline="")
        writer = csv.DictWriter(
            output,
            fieldnames=headers,
            extrasaction="ignore",
        )
        if headers:
            writer.writerow({header: _CHINESE_HEADERS.get(header, header) for header in headers})
            writer.writerows(rows)
        # utf-8-sig 带 BOM，保证 Excel 直接打开 CSV 时中文不乱码
        return output.getvalue().encode("utf-8-sig"), "text/csv; charset=utf-8", f"{dataset}.csv"

    if file_format == "xlsx":
        workbook = Workbook()
        workbook.remove(workbook.active)
        # 每个数据集写入一个工作表，表头转中文并冻结首行
        for name, rows in datasets.items():
            sheet = workbook.create_sheet(name)
            headers = _headers(name, rows)
            if headers:
                sheet.append([_CHINESE_HEADERS.get(header, header) for header in headers])
                sheet.freeze_panes = "A2"
                for row in rows:
                    sheet.append([row.get(header) for header in headers])
        output = BytesIO()
        workbook.save(output)
        return (
            output.getvalue(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "dashboard-export.xlsx",
        )

    raise DashboardExportError("Unsupported export format")
