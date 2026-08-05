"""仪表盘统计服务测试：管理员视角的9个图表数据集聚合。"""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services.statistics_service import get_dashboard_data


class ScalarResult:
    def __init__(self, values):
        self.values = values

    def scalars(self):
        return self

    def all(self):
        return self.values

    def scalar_one_or_none(self):
        return self.values

    def scalar_one(self):
        return self.values


class RowResult:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class FakeSession:
    def __init__(self, responses):
        self.execute = AsyncMock(side_effect=responses)


def make_admin_user():
    return SimpleNamespace(id=1, role="admin")


def make_users():
    return ScalarResult([
        SimpleNamespace(id=1, role="student", name="张三", username="student1", created_at="2026-01-01"),
        SimpleNamespace(id=2, role="teacher", name="李四", username="teacher2", created_at="2026-01-02"),
        SimpleNamespace(id=3, role="student", name="王五", username="student3", created_at="2026-01-03"),
    ])


def build_responses():
    """按 get_dashboard_data admin 分支的查询顺序依次返回结果。"""
    return [
        make_users(),                              # 1. 全部用户
        ScalarResult(3),                           # 2. 考试总数
        RowResult([("published", 2), ("finished", 1)]),   # 3. 考试状态分布
        RowResult([("计算机网络", 2)]),             # 4. 各课程考试数量
        RowResult([(1, "期中考试", 75.5)]),         # 5. 各考试平均分
        RowResult([                               # 6. 各考试及格率、成绩分布共用查询
            (1, "期中考试", 60, 80),
            (1, "期中考试", 60, 55),
        ]),
        RowResult([(1, "期中考试", 2)]),           # 7. 各考试参与人数
        RowResult([(1, "期中考试", 1)]),           # 8. 各考试待批改量
        RowResult([(1, "期中考试", 3)]),           # 9. 各考试切屏次数
        RowResult([("计科2401班", 2), ("未分配班级", 1)]),  # 10. 班级学生分布
    ]


@pytest.mark.asyncio
async def test_admin_dashboard_aggregates_all_chart_datasets():
    db = FakeSession(build_responses())
    data = await get_dashboard_data(db, make_admin_user())

    assert data["exam_status_distribution"] == [
        {"status": "published", "count": 2},
        {"status": "finished", "count": 1},
    ]
    assert data["exams_per_course"] == [{"course_name": "计算机网络", "count": 2}]
    assert data["exam_avg_scores"] == [{"exam_id": 1, "exam_title": "期中考试", "avg_score": 75.5}]
    # 80 >= 60 及格；55 < 60 不及格 => 及格率 50.0
    assert data["exam_pass_rates"] == [{"exam_id": 1, "exam_title": "期中考试", "pass_rate": 50.0}]
    # 80 落入 80-89；55 落入 0-59
    assert data["score_distribution"] == [
        {"label": "0-59", "count": 1},
        {"label": "60-69", "count": 0},
        {"label": "70-79", "count": 0},
        {"label": "80-89", "count": 1},
        {"label": "90-100", "count": 0},
    ]
    assert data["exam_participation"] == [{"exam_id": 1, "exam_title": "期中考试", "count": 2}]
    assert data["pending_grading_by_exam"] == [
        {"exam_id": 1, "exam_title": "期中考试", "pending_count": 1},
    ]
    assert data["switch_counts_by_exam"] == [
        {"exam_id": 1, "exam_title": "期中考试", "switch_count": 3},
    ]
    assert data["class_student_distribution"] == [
        {"class_name": "计科2401班", "count": 2},
        {"class_name": "未分配班级", "count": 1},
    ]


@pytest.mark.asyncio
async def test_admin_dashboard_handles_empty_exam_data():
    responses = build_responses()
    responses[2] = RowResult([])      # 无考试状态
    responses[3] = RowResult([])      # 无课程考试
    responses[4] = RowResult([])      # 无平均分
    responses[5] = RowResult([])      # 无成绩记录
    responses[6] = RowResult([])      # 无参与人数
    responses[7] = RowResult([])      # 无待批改
    responses[8] = RowResult([])      # 无切屏
    db = FakeSession(responses)
    data = await get_dashboard_data(db, make_admin_user())

    assert data["exam_status_distribution"] == []
    assert data["exam_avg_scores"] == []
    assert data["exam_pass_rates"] == []
    assert data["score_distribution"] == [
        {"label": "0-59", "count": 0},
        {"label": "60-69", "count": 0},
        {"label": "70-79", "count": 0},
        {"label": "80-89", "count": 0},
        {"label": "90-100", "count": 0},
    ]
    assert data["exam_participation"] == []
    assert data["pending_grading_by_exam"] == []
    assert data["switch_counts_by_exam"] == []
