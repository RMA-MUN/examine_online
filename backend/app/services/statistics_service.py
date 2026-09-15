"""统计服务：考试成绩统计、成绩导出与按角色聚合的仪表盘数据。"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime
from app.models.exam_record import ExamRecord
from app.models.question import Question
from app.models.exam import Exam
from app.models.course import Course
from app.models.user import User
from app.models.answer import Answer
from app.models.class_ import SchoolClass

async def get_exam_statistics(db: AsyncSession, exam_id: int):
    """统计某场考试的整体成绩：人数、平均分、最高/最低分、及格率与分数分布。

    :return: 统计字典；无作答记录时返回 None
    """
    result = await db.execute(
        select(ExamRecord).where(ExamRecord.exam_id == exam_id)
    )
    records = result.scalars().all()
    
    if not records:
        return None
    
    # 计算统计数据
    scores = [r.score for r in records]
    total_students = len(records)
    # 防止除零：无记录时平均分取 0（此处 records 非空，仍保留兜底）
    avg_score = sum(scores) / total_students if total_students > 0 else 0
    
    # 及格线以 Exam.pass_score 为准（唯一行为变更：删 Σ*0.6 推导）
    exam_result = await db.execute(select(Exam.pass_score).where(Exam.id == exam_id))
    pass_score = exam_result.scalar_one_or_none()
    if pass_score is None:
        pass_score = 60
    
    # 及格判定使用 >=，恰好等于及格线也算及格
    pass_count = sum(1 for s in scores if s >= pass_score)
    pass_rate = (pass_count / total_students * 100) if total_students > 0 else 0
    
    # 分数分布
    distribution = {
        "0-59": 0,
        "60-69": 0,
        "70-79": 0,
        "80-89": 0,
        "90-100": 0
    }
    
    # 按分数区间累加，区间边界为左闭右开（[60,70) 等）
    for s in scores:
        if s < 60:
            distribution["0-59"] += 1
        elif s < 70:
            distribution["60-69"] += 1
        elif s < 80:
            distribution["70-79"] += 1
        elif s < 90:
            distribution["80-89"] += 1
        else:
            distribution["90-100"] += 1
    
    return {
        "total_students": total_students,
        "avg_score": round(avg_score, 2),
        "max_score": max(scores),
        "min_score": min(scores),
        "pass_rate": round(pass_rate, 2),
        "distribution": distribution
    }

async def export_exam_scores(db: AsyncSession, exam_id: int):
    """导出某场考试的全部成绩记录（学生 ID、分数、状态与时间）。"""
    result = await db.execute(
        select(ExamRecord).where(ExamRecord.exam_id == exam_id)
    )
    records = result.scalars().all()
    
    export_data = []
    for r in records:
        export_data.append({
            "student_id": r.student_id,
            "score": r.score,
            "status": r.status,
            "start_time": r.start_time.isoformat() if r.start_time else None,
            "submit_time": r.submit_time.isoformat() if r.submit_time else None
        })
    
    return export_data

async def _get_overview_extension(db: AsyncSession, course_ids: list[int] | None = None) -> dict:
    """总览扩展 8 字段：纯聚合现有表（范围 seg 后端分页本次不做，前端仍读 mock 三档）。

    - online：在考记录数（status=ongoing）；teacher 按名下课程过滤
    - peak：今日开考数与 online 取大（无历史峰值表，用当日量近似）
    - pending：待批改题目数（Answer.grading_source=pending）
    - eta：pending/300 小时（约 300 份/小时吞吐）
    - alerts：切屏超限记录数（switch_count > Exam.max_switch）
    - running_exams：进行中/已发布考试（id/title/status/online/total，最多 5 场）
    - grading_progress：按考试 done/total/percent（done=graded 记录数）
    - feed：最近 4 条动态（level/title/meta）
    """
    now = datetime.now()
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    scoped = course_ids is not None

    if not scoped:
        online = (await db.execute(
            select(func.count()).select_from(ExamRecord).where(ExamRecord.status == "ongoing")
        )).scalar_one()
        today_started = (await db.execute(
            select(func.count()).select_from(ExamRecord).where(ExamRecord.start_time >= start_of_day)
        )).scalar_one()
        pending = (await db.execute(
            select(func.count()).select_from(Answer).where(Answer.grading_source == "pending")
        )).scalar_one()
        alerts = (await db.execute(
            select(func.count()).select_from(ExamRecord)
            .join(Exam, Exam.id == ExamRecord.exam_id)
            .where(ExamRecord.switch_count > Exam.max_switch)
        )).scalar_one()
    else:
        if not course_ids:
            online = 0
            today_started = 0
            pending = 0
            alerts = 0
        else:
            online = (await db.execute(
                select(func.count()).select_from(ExamRecord)
                .join(Exam, Exam.id == ExamRecord.exam_id)
                .where(ExamRecord.status == "ongoing", Exam.course_id.in_(course_ids))
            )).scalar_one()
            today_started = (await db.execute(
                select(func.count()).select_from(ExamRecord)
                .join(Exam, Exam.id == ExamRecord.exam_id)
                .where(ExamRecord.start_time >= start_of_day, Exam.course_id.in_(course_ids))
            )).scalar_one()
            pending = (await db.execute(
                select(func.count()).select_from(Answer)
                .join(ExamRecord, ExamRecord.id == Answer.record_id)
                .join(Exam, Exam.id == ExamRecord.exam_id)
                .where(Answer.grading_source == "pending", Exam.course_id.in_(course_ids))
            )).scalar_one()
            alerts = (await db.execute(
                select(func.count()).select_from(ExamRecord)
                .join(Exam, Exam.id == ExamRecord.exam_id)
                .where(ExamRecord.switch_count > Exam.max_switch, Exam.course_id.in_(course_ids))
            )).scalar_one()
    peak = max(int(online or 0), int(today_started or 0))
    pending = int(pending or 0)
    eta = round(pending / 300, 1) if pending else 0.0

    exam_query = select(Exam).where(Exam.status.in_(["published", "ongoing"])).order_by(Exam.start_time.desc()).limit(5)
    if scoped:
        exam_query = select(Exam).where(
            Exam.status.in_(["published", "ongoing"]),
            Exam.course_id.in_(course_ids) if course_ids else False,
        ).order_by(Exam.start_time.desc()).limit(5)
    running_list = (await db.execute(exam_query)).scalars().all()
    running_ids = [e.id for e in running_list]
    per_exam_records: dict[int, list] = {eid: [] for eid in running_ids}
    if running_ids:
        rec_rows = (await db.execute(
            select(ExamRecord).where(ExamRecord.exam_id.in_(running_ids))
        )).scalars().all()
        for r in rec_rows:
            per_exam_records.setdefault(r.exam_id, []).append(r)
    running_exams = [
        {
            "id": e.id,
            "title": e.title,
            "status": e.status,
            "online": sum(1 for r in per_exam_records.get(e.id, []) if r.status == "ongoing"),
            "total": len(per_exam_records.get(e.id, [])),
        }
        for e in running_list
    ]
    grading_progress = []
    for e in running_list:
        recs = per_exam_records.get(e.id, [])
        total = len(recs)
        done = sum(1 for r in recs if r.status == "graded")
        percent = round(done / total * 100, 1) if total else 0.0
        grading_progress.append(
            {"exam_id": e.id, "exam_title": e.title, "done": done, "total": total, "percent": percent}
        )

    feed_query = (
        select(ExamRecord, Exam.title, User.name)
        .join(Exam, Exam.id == ExamRecord.exam_id)
        .join(User, User.id == ExamRecord.student_id)
        .order_by(ExamRecord.start_time.desc())
        .limit(4)
    )
    if scoped and course_ids:
        feed_query = (
            select(ExamRecord, Exam.title, User.name)
            .join(Exam, Exam.id == ExamRecord.exam_id)
            .join(User, User.id == ExamRecord.student_id)
            .where(Exam.course_id.in_(course_ids))
            .order_by(ExamRecord.start_time.desc())
            .limit(4)
        )
    feed_rows = (await db.execute(feed_query)).all()
    feed = []
    for record, exam_title, student_name in feed_rows:
        if (record.switch_count or 0) > 3:
            feed.append({"level": "danger", "title": f"考生 {student_name} 切屏 {record.switch_count} 次", "meta": f"{exam_title} · {record.start_time}"})
        elif record.status == "graded":
            feed.append({"level": "ok", "title": f"{exam_title} · {student_name} 已阅卷", "meta": f"得分 {record.score}"})
        elif record.status == "submitted":
            feed.append({"level": "info", "title": f"{exam_title} · {student_name} 已交卷", "meta": f"{record.submit_time or record.start_time}"})
        else:
            feed.append({"level": "warn", "title": f"{exam_title} · {student_name} 正在考试", "meta": f"切屏 {record.switch_count or 0} 次"})
    if scoped and not course_ids:
        feed = []

    return {
        "online": int(online or 0),
        "peak": peak,
        "pending": pending,
        "eta": eta,
        "alerts": int(alerts or 0),
        "running_exams": running_exams,
        "grading_progress": grading_progress,
        "feed": feed,
    }


async def get_dashboard_data(db: AsyncSession, user: User) -> dict:
    """按用户角色返回仪表盘统计数据：学生/教师/管理员各一套指标。"""
    now = datetime.now()

    if user.role == "student":
        # 可参加的考试：状态为已发布/进行中且未到截止时间
        exam_result = await db.execute(
            select(Exam)
            .where(Exam.status.in_(["published", "ongoing"]), Exam.end_time > now)
            .order_by(Exam.start_time.asc())
        )
        available = exam_result.scalars().all()
        available_exams = len(available)

        record_result = await db.execute(
            select(ExamRecord).where(ExamRecord.student_id == user.id)
        )
        records = record_result.scalars().all()
        my_exam_count = len(records)

        # 平均分只统计已有成绩（已提交/已批改）的记录
        graded = [r for r in records if r.status in ("submitted", "graded") and r.score is not None]
        avg_score = round(sum(r.score for r in graded) / len(graded), 2) if graded else 0

        # 及格率按每场考试自己的及格线（Exam.pass_score）判定
        pass_result = await db.execute(
            select(ExamRecord, Exam.pass_score)
            .join(Exam, Exam.id == ExamRecord.exam_id)
            .where(ExamRecord.student_id == user.id, ExamRecord.status.in_(["submitted", "graded"]))
        )
        pass_rows = pass_result.all()
        passed = sum(1 for r, p in pass_rows if r.score is not None and r.score >= p)
        pass_rate = round(passed / len(pass_rows) * 100, 2) if pass_rows else 0

        # 即将开始的考试（未到开始时间），最多展示 2 场
        upcoming = [
            {
                "id": e.id,
                "title": e.title,
                "start_time": e.start_time,
                "duration": e.duration,
            }
            for e in available
            if e.start_time > now
        ][:2]

        recent_result = await db.execute(
            select(ExamRecord)
            .where(
                ExamRecord.student_id == user.id,
                ExamRecord.status.in_(["submitted", "graded"]),
            )
            .order_by(ExamRecord.start_time.desc())
        )
        recent_records = recent_result.scalars().all()[:5]

        # 最近成绩逐条补充考试标题与及格线
        recent = []
        for r in recent_records:
            p_result = await db.execute(
                select(Exam.pass_score).where(Exam.id == r.exam_id)
            )
            p = p_result.scalar_one_or_none() or 0
            t_result = await db.execute(select(Exam.title).where(Exam.id == r.exam_id))
            recent.append({
                "id": r.id,
                "exam_id": r.exam_id,
                "exam_title": t_result.scalar_one_or_none() or "",
                "score": r.score,
                "pass_score": p,
                "status": r.status,
                "submit_time": r.submit_time,
            })

        ext = await _get_overview_extension(db)
        return {
            "role": user.role,
            "stats": {
                "available_exams": available_exams,
                "my_exam_count": my_exam_count,
                "avg_score": avg_score,
                "pass_rate": pass_rate,
            },
            "upcoming_exams": upcoming,
            "recent_records": recent,
            **ext,
        }

    if user.role == "teacher":
        # 教师数据只统计其名下课程，课程经 TeacherSubject 授权归属
        course_result = await db.execute(
            select(Course).where(Course.teacher_id == user.id)
        )
        courses = course_result.scalars().all()
        course_ids = [c.id for c in courses]
        course_count = len(courses)

        exam_query = select(Exam).where(Exam.course_id.in_(course_ids))
        exam_result = await db.execute(exam_query)
        exams = exam_result.scalars().all()
        exam_ids = [e.id for e in exams]
        published_exams = sum(1 for e in exams if e.status in ("published", "ongoing"))

        total_records = 0
        pending_by_exam = {}
        if exam_ids:
            rec_result = await db.execute(
                select(ExamRecord).where(ExamRecord.exam_id.in_(exam_ids))
            )
            records = rec_result.scalars().all()
            total_records = len(records)
            record_ids = [r.id for r in records]
            if record_ids:
                # 待批改 = 答案评分来源仍为 pending 的题目
                ans_result = await db.execute(
                    select(Answer).where(
                        Answer.record_id.in_(record_ids),
                        Answer.grading_source == "pending",
                    )
                )
                answers = ans_result.scalars().all()
                # 按考试维度聚合待批改数量
                record_map = {r.id: r for r in records}
                for a in answers:
                    exam_of_record = record_map[a.record_id]
                    pending_by_exam.setdefault(exam_of_record.exam_id, 0)
                    pending_by_exam[exam_of_record.exam_id] += 1

        # 只列出有待批改的考试，最多 5 场
        pending_grading = []
        for e in exams:
            count = pending_by_exam.get(e.id, 0)
            if count > 0:
                pending_grading.append({
                    "exam_id": e.id,
                    "exam_title": e.title,
                    "pending_count": count,
                })
        pending_grading_count = sum(pending_by_exam.values())
        pending_grading = pending_grading[:5]

        # 按开始时间取最近的 5 场考试
        recent_exams = [
            {
                "id": e.id,
                "title": e.title,
                "status": e.status,
                "start_time": e.start_time,
            }
            for e in sorted(exams, key=lambda x: x.start_time, reverse=True)[:5]
        ]

        ext = await _get_overview_extension(db, course_ids)
        return {
            "role": user.role,
            "stats": {
                "published_exams": published_exams,
                "pending_grading_count": pending_grading_count,
                "course_count": course_count,
                "total_records": total_records,
            },
            "pending_grading": pending_grading,
            "recent_exams": recent_exams,
            **ext,
        }

    # admin
    user_result = await db.execute(select(User))
    all_users = user_result.scalars().all()
    exam_count = (
        await db.execute(select(func.count()).select_from(Exam))
    ).scalar_one()

    # 按角色统计用户数
    role_counts = {"student": 0, "teacher": 0, "admin": 0}
    for u in all_users:
        if u.role in role_counts:
            role_counts[u.role] += 1

    # 最近注册的 5 个用户
    recent_users = [
        {
            "id": u.id,
            "username": u.username,
            "name": u.name,
            "role": u.role,
            "created_at": u.created_at,
        }
        for u in sorted(all_users, key=lambda x: x.created_at, reverse=True)[:5]
    ]

    # 新增：考试状态分布（草稿/已发布/进行中/已结束）
    status_rows = (
        await db.execute(
            select(Exam.status, func.count()).group_by(Exam.status)
        )
    ).all()
    exam_status_distribution = [
        {"status": s, "count": c} for s, c in status_rows
    ]

    # 新增：各课程考试数量
    course_rows = (
        await db.execute(
            select(Course.name, func.count())
            .join(Exam, Exam.course_id == Course.id)
            .group_by(Course.id, Course.name)
        )
    ).all()
    exams_per_course = [
        {"course_name": name, "count": count} for name, count in course_rows
    ]

    # 新增：各考试平均分（仅统计已提交/已批改并且有成绩的记录）
    avg_rows = (
        await db.execute(
            select(Exam.id, Exam.title, func.avg(ExamRecord.score))
            .join(ExamRecord, ExamRecord.exam_id == Exam.id)
            .where(
                ExamRecord.status.in_(["submitted", "graded"]),
                ExamRecord.score.isnot(None),
            )
            .group_by(Exam.id, Exam.title)
        )
    ).all()
    exam_avg_scores = [
        {"exam_id": eid, "exam_title": title, "avg_score": round(float(avg or 0), 2)}
        for eid, title, avg in avg_rows
    ]

    # 新增：各考试及格率与全系统成绩分布（共用一次成绩查询）
    pass_rows = (
        await db.execute(
            select(Exam.id, Exam.title, Exam.pass_score, ExamRecord.score)
            .join(ExamRecord, ExamRecord.exam_id == Exam.id)
            .where(ExamRecord.status.in_(["submitted", "graded"]))
        )
    ).all()
    exam_pass_stats: dict[int, dict] = {}
    all_scores: list[int] = []
    for eid, title, pass_score, score in pass_rows:
        if score is None:
            continue
        stat = exam_pass_stats.setdefault(
            eid, {"title": title, "pass_score": pass_score, "scores": []}
        )
        stat["scores"].append(score)
        all_scores.append(score)
    exam_pass_rates = [
        {
            "exam_id": eid,
            "exam_title": stat["title"],
            "pass_rate": round(
                sum(1 for s in stat["scores"] if s >= stat["pass_score"])
                / len(stat["scores"]) * 100,
                2,
            ),
        }
        for eid, stat in exam_pass_stats.items()
    ]
    distribution = {"0-59": 0, "60-69": 0, "70-79": 0, "80-89": 0, "90-100": 0}
    for s in all_scores:
        if s < 60:
            distribution["0-59"] += 1
        elif s < 70:
            distribution["60-69"] += 1
        elif s < 80:
            distribution["70-79"] += 1
        elif s < 90:
            distribution["80-89"] += 1
        else:
            distribution["90-100"] += 1
    score_distribution = [
        {"label": k, "count": v} for k, v in distribution.items()
    ]

    # 新增：各考试参与人数
    participation_rows = (
        await db.execute(
            select(Exam.id, Exam.title, func.count(ExamRecord.id))
            .join(ExamRecord, ExamRecord.exam_id == Exam.id)
            .group_by(Exam.id, Exam.title)
        )
    ).all()
    exam_participation = [
        {"exam_id": eid, "exam_title": title, "count": count}
        for eid, title, count in participation_rows
    ]

    # 新增：各考试待批改题目数
    pending_rows = (
        await db.execute(
            select(Exam.id, Exam.title, func.count(Answer.id))
            .join(ExamRecord, ExamRecord.exam_id == Exam.id)
            .join(Answer, Answer.record_id == ExamRecord.id)
            .where(Answer.grading_source == "pending")
            .group_by(Exam.id, Exam.title)
        )
    ).all()
    pending_grading_by_exam = [
        {"exam_id": eid, "exam_title": title, "pending_count": count}
        for eid, title, count in pending_rows
    ]

    # 新增：各考试切屏总次数
    switch_rows = (
        await db.execute(
            select(Exam.id, Exam.title, func.coalesce(func.sum(ExamRecord.switch_count), 0))
            .join(ExamRecord, ExamRecord.exam_id == Exam.id)
            .group_by(Exam.id, Exam.title)
        )
    ).all()
    switch_counts_by_exam = [
        {"exam_id": eid, "exam_title": title, "switch_count": int(total)}
        for eid, title, total in switch_rows
    ]

    # 新增：各班级学生人数（无班级归入"未分配班级"）
    class_rows = (
        await db.execute(
            select(func.coalesce(SchoolClass.name, "未分配班级"), func.count(User.id))
            .join(SchoolClass, SchoolClass.id == User.class_id, isouter=True)
            .where(User.role == "student")
            .group_by(SchoolClass.id, SchoolClass.name)
        )
    ).all()
    class_student_distribution = [
        {"class_name": name, "count": count} for name, count in class_rows
    ]

    ext = await _get_overview_extension(db)
    return {
        "role": user.role,
        "stats": {
            "student_count": role_counts["student"],
            "teacher_count": role_counts["teacher"],
            "admin_count": role_counts["admin"],
            "exam_count": exam_count,
        },
        "role_distribution": [
            {"role": k, "count": v} for k, v in role_counts.items()
        ],
        "recent_users": recent_users,
        "exam_status_distribution": exam_status_distribution,
        "exams_per_course": exams_per_course,
        "exam_avg_scores": exam_avg_scores,
        "exam_pass_rates": exam_pass_rates,
        "score_distribution": score_distribution,
        "exam_participation": exam_participation,
        "pending_grading_by_exam": pending_grading_by_exam,
        "switch_counts_by_exam": switch_counts_by_exam,
        "class_student_distribution": class_student_distribution,
        **ext,
    }
