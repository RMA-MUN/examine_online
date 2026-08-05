"""考试管理服务：考试的增删改查、发布、班级/学生分配，以及学生考试资格判定。"""

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
    """分页查询考试列表，可按课程和状态过滤。

    :return: 元组 (当前页考试列表, 总记录数)
    """
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
    """分页查询某教师有管理权限的考试（通过其被分配的课程间接确定）。

    :return: 元组 (当前页考试列表, 总记录数)
    """
    # 先查出教师被分配的全部课程 ID，再筛选这些课程下的考试
    assigned = select(TeacherSubject.subject_id).where(TeacherSubject.teacher_id == teacher_id)
    query = select(Exam).where(Exam.course_id.in_(assigned))
    if status:
        query = query.where(Exam.status == status)
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()
    result = await db.execute(query.offset((page - 1) * page_size).limit(page_size))
    return result.scalars().all(), total


async def _attach_assignment_echo(db: AsyncSession, exam: Exam):
    """给考试对象附加分配信息（关联班级、学生 include/exclude 覆盖），供接口回显。"""
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
    """按 ID 查询考试详情（附带班级与学生覆盖分配信息），不存在时返回 None。"""
    result = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if exam:
        await _attach_assignment_echo(db, exam)
    return exam


def _pop_assignment_keys(exam_data: dict) -> Tuple[list, list]:
    """从考试数据中取出分配字段（班级 ID 列表、学生覆盖列表），其余字段留给 Exam 构造。"""
    class_ids = list(exam_data.pop("class_ids", []) or [])
    overrides = exam_data.pop("student_overrides", []) or []
    return class_ids, overrides


async def create_exam(db: AsyncSession, exam_data: dict):
    """创建考试，同时写入班级分配和学生覆盖记录。"""
    class_ids, overrides = _pop_assignment_keys(exam_data)
    exam = Exam(**exam_data)
    db.add(exam)
    # flush 先拿到 exam.id，供后续分配记录引用外键
    await db.flush()
    await _write_class_assignments(db, exam.id, class_ids)
    await _write_student_overrides(db, exam.id, overrides)
    await db.commit()
    await db.refresh(exam)
    return await _attach_assignment_echo(db, exam)


async def update_exam(db: AsyncSession, exam_id: int, exam_data: dict):
    """更新考试信息及其分配关系。

    :return: 更新后的考试对象；考试不存在时返回 None
    """
    exam = await get_exam(db, exam_id)
    if not exam:
        return None
    class_ids = exam_data.pop("class_ids", None)
    overrides = exam_data.pop("student_overrides", None)
    for key, value in exam_data.items():
        if value is not None:
            setattr(exam, key, value)
    # 传入分配字段时整体替换（先删后建），字段缺省时保持原分配不变
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
    """写入考试关联的班级记录，dict.fromkeys 去除重复班级 ID。"""
    for class_id in dict.fromkeys(class_ids):
        db.add(ExamClass(exam_id=exam_id, class_id=class_id))


async def _write_student_overrides(db: AsyncSession, exam_id: int, overrides: list):
    """写入学生覆盖记录（include 显式添加 / exclude 显式排除），兼容 dict 与对象两种入参。"""
    for override in overrides:
        if isinstance(override, dict):
            student_id = override["student_id"]
            action = override["action"]
        else:
            student_id = override.student_id
            action = override.action
        db.add(ExamStudent(exam_id=exam_id, student_id=student_id, action=action))


async def publish_exam(db: AsyncSession, exam_id: int):
    """发布考试，状态由 draft 流转为 published。

    :return: 发布后的考试对象；考试不存在时返回 None
    """
    exam = await get_exam(db, exam_id)
    if not exam:
        return None
    exam.status = "published"
    await db.commit()
    await db.refresh(exam)
    return exam


async def delete_exam(db: AsyncSession, exam_id: int):
    """删除考试。

    :return: 删除成功返回 True，考试不存在返回 False
    """
    exam = await get_exam(db, exam_id)
    if not exam:
        return False
    await db.delete(exam)
    await db.commit()
    return True


async def is_student_eligible(db: AsyncSession, exam_id: int, student_id: int) -> bool:
    """优先级：1.显式排除 -> 2.班级分配 -> 3.显式添加 -> 4.无分配向后兼容"""
    # 1. 被显式排除的学生一律无资格
    excluded = await db.execute(
        select(ExamStudent).where(
            ExamStudent.exam_id == exam_id,
            ExamStudent.student_id == student_id,
            ExamStudent.action == "exclude",
        )
    )
    if excluded.scalar_one_or_none():
        return False

    # 2. 学生所在班级被分配则视为有资格
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

    # 3. 被显式添加的学生有资格
    included = await db.execute(
        select(ExamStudent).where(
            ExamStudent.exam_id == exam_id,
            ExamStudent.student_id == student_id,
            ExamStudent.action == "include",
        )
    )
    if included.scalar_one_or_none():
        return True

    # 4. 考试未做任何班级分配时，视为所有学生均可参加（向后兼容旧数据）
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
    """分页查询学生有资格参加的考试列表，并附带每场考试的学生记录状态。

    :return: 元组 (当前页考试列表, 总记录数)
    """
    query = select(Exam)
    if status:
        query = query.where(Exam.status == status)
    all_exams = list((await db.execute(query)).scalars().all())
    # 资格判定逻辑在 Python 侧逐场执行，再做内存分页
    eligible = []
    for exam in all_exams:
        if await is_student_eligible(db, exam.id, student_id):
            eligible.append(exam)
    total = len(eligible)
    start = (page - 1) * page_size
    page_exams = eligible[start:start + page_size]
    if page_exams:
        # 批量查询当前页考试的记录状态，回填到 student_record_status 供前端展示
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
