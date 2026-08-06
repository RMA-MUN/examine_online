"""成绩明细导出服务：按班级×科目×考试汇总成绩、学生总分与题目得分明细。"""

from collections import defaultdict
from io import BytesIO

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from openpyxl import Workbook

from app.models.exam_record import ExamRecord
from app.models.exam import Exam
from app.models.course import Course
from app.models.user import User
from app.models.class_ import SchoolClass
from app.models.answer import Answer
from app.models.question import Question
from app.models.teacher_subject import TeacherSubject

CLASS_SUMMARY_COLUMNS = [
    "class_name",
    "course_name",
    "exam_title",
    "student_count",
    "avg_score",
    "pass_rate",
    "max_score",
    "min_score",
]
STUDENT_SCORE_COLUMNS = [
    "student_name",
    "class_name",
    "course_name",
    "exam_title",
    "score",
    "pass_score",
    "status",
]
QUESTION_DETAIL_COLUMNS = [
    "student_name",
    "class_name",
    "course_name",
    "exam_title",
    "question_no",
    "question_type",
    "score",
    "full_score",
]

# 导出文件表头的中英文映射，英文列名展示为中文
_CHINESE_HEADERS = {
    "class_name": "班级",
    "course_name": "科目",
    "exam_title": "考试",
    "student_count": "参考人数",
    "avg_score": "平均分",
    "pass_rate": "及格率",
    "max_score": "最高分",
    "min_score": "最低分",
    "student_name": "学生姓名",
    "score": "总分",
    "pass_score": "及格线",
    "status": "状态",
    "question_no": "题号",
    "question_type": "题型",
    "full_score": "满分",
}

_QUESTION_TYPE_TEXT = {
    "single": "单选",
    "multiple": "多选",
    "judge": "判断",
    "blank": "填空",
    "essay": "简答",
}

_STATUS_TEXT = {"submitted": "待阅卷", "graded": "已阅卷"}

_NO_CLASS = "未分配班级"


class ScoreExportError(ValueError):
    """成绩导出请求无法安全渲染时抛出的异常。"""


async def _assigned_course_ids(db: AsyncSession, teacher_id: int) -> list[int]:
    result = await db.execute(
        select(TeacherSubject.subject_id).where(TeacherSubject.teacher_id == teacher_id)
    )
    return list(result.scalars().all())


async def build_score_export_data(
    db: AsyncSession,
    user: User,
    class_id: int | None = None,
    course_id: int | None = None,
) -> dict[str, list[dict]]:
    """构建成绩导出数据集（班级成绩汇总/学生成绩/题目得分明细）。
    :raises ScoreExportError: 教师请求越权科目
    """
    assigned = None
    if user.role == "teacher":
        assigned = await _assigned_course_ids(db, user.id)
        if course_id is not None and course_id not in assigned:
            raise ScoreExportError("无权导出该科目的数据")

    query = (
        select(ExamRecord, User, Course, Exam, SchoolClass)
        .join(User, User.id == ExamRecord.student_id)
        .join(Exam, Exam.id == ExamRecord.exam_id)
        .join(Course, Course.id == Exam.course_id)
        .join(SchoolClass, SchoolClass.id == User.class_id, isouter=True)
        .where(
            ExamRecord.status.in_(["submitted", "graded"]),
            ExamRecord.score.isnot(None),
        )
    )
    if assigned is not None:
        query = query.where(Exam.course_id.in_(assigned))
    if course_id is not None:
        query = query.where(Exam.course_id == course_id)
    if class_id is not None:
        query = query.where(User.class_id == class_id)

    rows = (await db.execute(query)).all()

    class_name_of = lambda school_class: (  # noqa: E731
        school_class.name if school_class is not None else _NO_CLASS
    )

    grouped: dict[tuple, list[int]] = {}
    student_scores = []
    record_by_id = {}
    exam_ids: set[int] = set()
    for record, student, course, exam, school_class in rows:
        exam_ids.add(exam.id)
        class_name = class_name_of(school_class)
        record_by_id[record.id] = (
            student,
            class_name,
            course.name,
            exam.title,
            exam.pass_score,
        )
        student_scores.append(
            {
                "student_name": student.name,
                "class_name": class_name,
                "course_name": course.name,
                "exam_title": exam.title,
                "score": record.score,
                "pass_score": exam.pass_score,
                "status": _STATUS_TEXT.get(record.status, record.status),
            }
        )
        key = (class_name, course.name, exam.id, exam.title, exam.pass_score)
        grouped.setdefault(key, []).append(record.score)

    class_summary = []
    for (class_name, course_name, exam_id, exam_title, pass_score), scores in grouped.items():
        passed = sum(1 for score in scores if score >= pass_score)
        class_summary.append(
            {
                "class_name": class_name,
                "course_name": course_name,
                "exam_title": exam_title,
                "student_count": len(scores),
                "avg_score": round(sum(scores) / len(scores), 2),
                "pass_rate": round(passed / len(scores) * 100, 2),
                "max_score": max(scores),
                "min_score": min(scores),
            }
        )

    question_details = []
    if record_by_id:
        answer_rows = (
            await db.execute(
                select(Answer, Question)
                .join(Question, Question.id == Answer.question_id)
                .where(Answer.record_id.in_(record_by_id.keys()))
            )
        ).all()
        if answer_rows:
            questions = (
                await db.execute(select(Question).where(Question.exam_id.in_(exam_ids)))
            ).scalars().all()
            questions_by_exam: dict[int, list] = defaultdict(list)
            for question in questions:
                questions_by_exam[question.exam_id].append(question)
            question_no: dict[int, int] = {}
            for exam_questions in questions_by_exam.values():
                for idx, question in enumerate(
                    sorted(exam_questions, key=lambda q: (q.sort_order, q.id)), start=1
                ):
                    question_no[question.id] = idx
            for answer, question in sorted(
                answer_rows, key=lambda pair: (pair[1].sort_order, pair[1].id)
            ):
                student, class_name, course_name, exam_title, _ = record_by_id[
                    answer.record_id
                ]
                question_details.append(
                    {
                        "student_name": student.name,
                        "class_name": class_name,
                        "course_name": course_name,
                        "exam_title": exam_title,
                        "question_no": question_no[question.id],
                        "question_type": _QUESTION_TYPE_TEXT.get(
                            question.type, question.type
                        ),
                        "score": answer.score,
                        "full_score": question.score,
                    }
                )

    return {
        "class_summary": class_summary,
        "student_scores": student_scores,
        "question_details": question_details,
    }


async def get_score_export_options(db: AsyncSession, user: User) -> dict:
    """返回当前用户可导出的班级与科目选项（教师仅授权科目，管理员全部）。"""
    classes = (await db.execute(select(SchoolClass))).scalars().all()
    if user.role == "teacher":
        assigned = await _assigned_course_ids(db, user.id)
        courses = (
            (await db.execute(select(Course).where(Course.id.in_(assigned))))
            .scalars()
            .all()
        )
    else:
        courses = (await db.execute(select(Course))).scalars().all()
    return {
        "classes": [{"id": cls.id, "name": cls.name} for cls in classes],
        "courses": [{"id": course.id, "name": course.name} for course in courses],
    }


def render_score_export(datasets: dict[str, list[dict]]) -> tuple[bytes, str, str]:
    """将成绩导出数据集渲染为三 Sheet 的 xlsx 文件。
    :return: 元组 (文件字节内容, MIME 类型, 文件名)
    """
    workbook = Workbook()
    workbook.remove(workbook.active)
    question_headers = {**_CHINESE_HEADERS, "score": "得分"}
    sheet_specs = [
        ("class_summary", "班级成绩汇总", CLASS_SUMMARY_COLUMNS, _CHINESE_HEADERS),
        ("student_scores", "学生成绩", STUDENT_SCORE_COLUMNS, _CHINESE_HEADERS),
        ("question_details", "题目得分明细", QUESTION_DETAIL_COLUMNS, question_headers),
    ]
    for name, sheet_title, columns, headers in sheet_specs:
        sheet = workbook.create_sheet(sheet_title)
        sheet.append([headers[column] for column in columns])
        sheet.freeze_panes = "A2"
        for row in datasets[name]:
            sheet.append([row.get(column) for column in columns])
    output = BytesIO()
    workbook.save(output)
    return (
        output.getvalue(),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "score-export.xlsx",
    )
