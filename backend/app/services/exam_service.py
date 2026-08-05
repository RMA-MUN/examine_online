from typing import List, Optional, Tuple

from sqlalchemy import delete, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exam import Exam
from app.models.exam_class import ExamClass
from app.models.exam_record import ExamRecord
from app.models.exam_student import ExamStudent
from app.models.teacher_subject import TeacherSubject
from app.models.user import User


async def get_exams(db: AsyncSession, course_id: int = None, status: str = None,
                    page: int = 1, page_size: int = 10):
    query = select(Exam)
    if course_id:
        query = query.where(Exam.course_id == course_id)
    if status:
        query = query.where(Exam.status == status)
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()
    result = await db.execute(query.offset((page - 1) * page_size).limit(page_size))
    return result.scalars().all(), total


async def get_teacher_exams(db: AsyncSession, teacher_id: int, status: str = None,
                            page: int = 1, page_size: int = 10):
    assigned = select(TeacherSubject.subject_id).where(TeacherSubject.teacher_id == teacher_id)
    query = select(Exam).where(Exam.course_id.in_(assigned))
    if status:
        query = query.where(Exam.status == status)
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()
    result = await db.execute(query.offset((page - 1) * page_size).limit(page_size))
    return result.scalars().all(), total


async def _attach_assignment_echo(db: AsyncSession, exam: Exam):
    class_result = await db.execute(
        select(ExamClass.class_id).where(ExamClass.exam_id == exam.id)
    )
    exam.assigned_class_ids = list(class_result.scalars().all())
    override_result = await db.execute(
        select(ExamStudent).where(ExamStudent.exam_id == exam.id)
    )
    exam.student_overrides = [
        {"student_id": row.student_id, "action": row.action}
        for row in override_result.scalars().all()
    ]
    return exam


async def get_exam(db: AsyncSession, exam_id: int):
    result = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if exam:
        await _attach_assignment_echo(db, exam)
    return exam


def _pop_assignment_keys(exam_data: dict) -> Tuple[list, list]:
    class_ids = list(exam_data.pop("class_ids", []) or [])
    overrides = exam_data.pop("student_overrides", []) or []
    return class_ids, overrides


async def create_exam(db: AsyncSession, exam_data: dict):
    class_ids, overrides = _pop_assignment_keys(exam_data)
    exam = Exam(**exam_data)
    db.add(exam)
    await db.flush()
    await _write_class_assignments(db, exam.id, class_ids)
    await _write_student_overrides(db, exam.id, overrides)
    await db.commit()
    await db.refresh(exam)
    return await _attach_assignment_echo(db, exam)


async def update_exam(db: AsyncSession, exam_id: int, exam_data: dict):
    exam = await get_exam(db, exam_id)
    if not exam:
        return None
    class_ids = exam_data.pop("class_ids", None)
    overrides = exam_data.pop("student_overrides", None)
    for key, value in exam_data.items():
        if value is not None:
            setattr(exam, key, value)
    if class_ids is not None:
        await db.execute(delete(ExamClass).where(ExamClass.exam_id == exam_id))
        await _write_class_assignments(db, exam_id, class_ids)
    if overrides is not None:
        await db.execute(delete(ExamStudent).where(ExamStudent.exam_id == exam_id))
        await _write_student_overrides(db, exam_id, overrides)
    await db.commit()
    await db.refresh(exam)
    return await _attach_assignment_echo(db, exam)


async def _write_class_assignments(db: AsyncSession, exam_id: int, class_ids: List[int]):
    for class_id in dict.fromkeys(class_ids):
        db.add(ExamClass(exam_id=exam_id, class_id=class_id))


async def _write_student_overrides(db: AsyncSession, exam_id: int, overrides: list):
    for override in overrides:
        if isinstance(override, dict):
            student_id = override["student_id"]
            action = override["action"]
        else:
            student_id = override.student_id
            action = override.action
        db.add(ExamStudent(exam_id=exam_id, student_id=student_id, action=action))


async def publish_exam(db: AsyncSession, exam_id: int):
    exam = await get_exam(db, exam_id)
    if not exam:
        return None
    exam.status = "published"
    await db.commit()
    await db.refresh(exam)
    return exam


async def delete_exam(db: AsyncSession, exam_id: int):
    exam = await get_exam(db, exam_id)
    if not exam:
        return False
    await db.delete(exam)
    await db.commit()
    return True


async def is_student_eligible(db: AsyncSession, exam_id: int, student_id: int) -> bool:
    """优先级：1.显式排除 -> 2.班级分配 -> 3.显式添加 -> 4.无分配向后兼容"""
    excluded = await db.execute(
        select(ExamStudent).where(
            ExamStudent.exam_id == exam_id,
            ExamStudent.student_id == student_id,
            ExamStudent.action == "exclude",
        )
    )
    if excluded.scalar_one_or_none():
        return False

    student = await db.get(User, student_id)
    if student and student.class_id:
        in_class = await db.execute(
            select(ExamClass).where(
                ExamClass.exam_id == exam_id,
                ExamClass.class_id == student.class_id,
            )
        )
        if in_class.scalar_one_or_none():
            return True

    included = await db.execute(
        select(ExamStudent).where(
            ExamStudent.exam_id == exam_id,
            ExamStudent.student_id == student_id,
            ExamStudent.action == "include",
        )
    )
    if included.scalar_one_or_none():
        return True

    has_assignment = await db.execute(
        select(ExamClass).where(ExamClass.exam_id == exam_id).limit(1)
    )
    if not has_assignment.scalar_one_or_none():
        return True
    return False


async def get_student_eligible_exams(
    db: AsyncSession, student_id: int, page: int = 1, page_size: int = 10,
    status: Optional[str] = None,
) -> Tuple[List[Exam], int]:
    query = select(Exam)
    if status:
        query = query.where(Exam.status == status)
    all_exams = list((await db.execute(query)).scalars().all())
    eligible = []
    for exam in all_exams:
        if await is_student_eligible(db, exam.id, student_id):
            eligible.append(exam)
    total = len(eligible)
    start = (page - 1) * page_size
    page_exams = eligible[start:start + page_size]
    if page_exams:
        record_result = await db.execute(
            select(ExamRecord.student_id, ExamRecord.exam_id, ExamRecord.status)
            .where(
                ExamRecord.student_id == student_id,
                ExamRecord.exam_id.in_([e.id for e in page_exams]),
            )
        )
        status_map = {exam_id: status for _, exam_id, status in record_result.all()}
        for exam in page_exams:
            exam.student_record_status = status_map.get(exam.id)
    return page_exams, total
