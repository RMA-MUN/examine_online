"""在线考试系统后端压测脚本（Locust）。

场景（可用 --only-user 或 --tags 单独运行）：
- login      大规模登录：67 个 demo 账号池轮转，反复登录（bcrypt 校验为 CPU 密集操作）
- dashboard  仪表盘并发：学生:教师:管理员 = 7:2:1 权重，循环访问 /api/statistics/dashboard
- student    学生页面并发：考试列表 + 我的记录
- exam-take  考试作答链路：拿试卷 -> 保存答案(Redis) -> 交卷（每账号单轮，耗尽即止）
- grading    教师阅卷页并发：考试列表 -> 阅卷列表 -> 答卷详情

运行示例：
  uv run locust -f backend/loadtest/locustfile.py --host http://localhost:8000
  uv run locust -f backend/loadtest/locustfile.py --host http://localhost:8000 \
      --headless --users 300 --spawn-rate 50 --run-time 3m --only-user LoginUser --csv=report

前置条件：后端(8000)与 Redis 运行中、init.sql 已灌入（含大型演示数据）；
作答链路压测会消耗 ongoing 考试记录（共 60 条），压测后需重跑 seed 恢复。
"""

import random

from locust import HttpUser, between, tag, task
from locust.user.users import StopUser

PASSWORD = "Password123!"

STUDENT_ACCOUNTS = [f"demo_student_{i:02d}" for i in range(1, 61)]
TEACHER_ACCOUNTS = [f"demo_teacher_{i:02d}" for i in range(1, 7)]
ADMIN_ACCOUNTS = ["demo_admin"]
ALL_ACCOUNTS = STUDENT_ACCOUNTS + TEACHER_ACCOUNTS + ADMIN_ACCOUNTS

# dashboard 场景的角色权重（管理员接口聚合多表，权重调低避免单一账号成为瓶颈）
ROLE_POOL = (
    [("student", random.choice(STUDENT_ACCOUNTS)) for _ in range(7)]
    + [("teacher", random.choice(TEACHER_ACCOUNTS)) for _ in range(2)]
    + [("admin", "demo_admin")]
)


def login(client, username: str, password: str) -> str | None:
    """登录并返回 access_token；失败时标记请求为失败并返回 None。"""
    with client.post(
        "/api/auth/login",
        json={"username": username, "password": password},
        catch_response=True,
        name="POST /api/auth/login",
    ) as resp:
        if resp.status_code != 200:
            resp.failure(f"登录失败: HTTP {resp.status_code}")
            return None
        token = (resp.json().get("data") or {}).get("access_token")
        if not token:
            resp.failure("登录响应缺少 access_token")
            return None
    return token


def build_answer(question: dict):
    """按题目类型生成合法随机答案，与前端作答格式保持一致。"""
    qtype = question.get("type")
    options = question.get("options") or []
    if qtype == "single":
        return random.choice("ABCD"[: max(len(options), 1)])
    if qtype == "multiple":
        letters = "ABCD"[: max(len(options), 1)]
        return "".join(random.sample(letters, random.randint(1, len(letters))))
    if qtype == "judge":
        return random.choice(["正确", "错误"])
    if qtype == "blank":
        return random.choice(["答案一", "答案二", "NULL", "0", ""])
    return "压测生成的简答作答内容，用于模拟大规模交卷场景。"


@tag("login")
class LoginUser(HttpUser):
    """大规模登录：账号池轮转反复登录，制造 bcrypt 验密压力。"""

    wait_time = between(0.2, 0.5)

    def on_start(self):
        self._index = random.randint(0, len(ALL_ACCOUNTS) - 1)

    @task
    def login_once(self):
        username = ALL_ACCOUNTS[self._index % len(ALL_ACCOUNTS)]
        self._index += 1
        login(self.client, username, PASSWORD)


@tag("dashboard")
class DashboardUser(HttpUser):
    """仪表盘并发：三种角色按 7:2:1 权重访问。"""

    wait_time = between(0.5, 2)

    def on_start(self):
        _, username = random.choice(ROLE_POOL)
        token = login(self.client, username, PASSWORD)
        if not token:
            raise StopUser()
        self.client.headers["Authorization"] = f"Bearer {token}"

    @task
    def get_dashboard(self):
        self.client.get("/api/statistics/dashboard", name="GET /api/statistics/dashboard")


@tag("student")
class StudentPageUser(HttpUser):
    """学生页面并发：考试列表 + 我的记录。"""

    wait_time = between(0.5, 2)

    def on_start(self):
        token = login(self.client, random.choice(STUDENT_ACCOUNTS), PASSWORD)
        if not token:
            raise StopUser()
        self.client.headers["Authorization"] = f"Bearer {token}"

    @task(2)
    def exam_list(self):
        self.client.get("/api/exams", params={"page": 1, "page_size": 10}, name="GET /api/exams")

    @task
    def my_records(self):
        self.client.get("/api/records", name="GET /api/records")


@tag("exam-take")
class ExamTakingUser(HttpUser):
    """考试作答链路：拿试卷 -> 保存 -> 交卷。

    交卷后记录变为 submitted（student, exam 唯一），因此每账号只执行一轮后停止；
    种子数据中 ongoing 记录共 60 条，本场景用户数请勿超过 60。
    """

    wait_time = between(0.1, 0.3)

    def on_start(self):
        token = login(self.client, random.choice(STUDENT_ACCOUNTS), PASSWORD)
        if not token:
            raise StopUser()
        self.client.headers["Authorization"] = f"Bearer {token}"

    @task
    def take_exam_once(self):
        with self.client.get(
            "/api/exams", params={"page": 1, "page_size": 100}, catch_response=True,
            name="GET /api/exams (找进行中的考试)",
        ) as resp:
            items = (resp.json().get("data") or {}).get("items") or []
            ongoing = [
                e for e in items if e.get("student_record_status") == "ongoing"
            ]
            if not ongoing:
                resp.failure("没有进行中的考试可作答（需重跑 seed 恢复数据）")
                raise StopUser()
        exam = random.choice(ongoing)
        exam_id = exam["id"]

        with self.client.get(
            f"/api/exams/{exam_id}/paper", catch_response=True, name="GET /api/exams/{id}/paper"
        ) as resp:
            paper = resp.json().get("data") or {}
            questions = paper.get("questions") or []
            if not questions:
                resp.failure(f"试卷为空: HTTP {resp.status_code}")
                raise StopUser()

        answers = {str(q["id"]): build_answer(q) for q in questions}
        self.client.post(
            f"/api/exams/{exam_id}/save",
            json=answers,
            name="POST /api/exams/{id}/save",
        )
        self.client.post(
            f"/api/exams/{exam_id}/submit",
            json={"answers": answers},
            name="POST /api/exams/{id}/submit",
        )
        raise StopUser()


@tag("grading")
class TeacherGradingUser(HttpUser):
    """教师阅卷页并发：考试列表 -> 阅卷列表 -> 答卷详情。

    教师考试列表接口已按教师权限过滤，列表内考试均可安全访问。
    """

    wait_time = between(1, 3)

    def on_start(self):
        token = login(self.client, random.choice(TEACHER_ACCOUNTS), PASSWORD)
        if not token:
            raise StopUser()
        self.client.headers["Authorization"] = f"Bearer {token}"

    @task
    def grading_flow(self):
        with self.client.get(
            "/api/exams", params={"page": 1, "page_size": 100}, catch_response=True,
            name="GET /api/exams",
        ) as resp:
            items = (resp.json().get("data") or {}).get("items") or []
            if not items:
                resp.failure("考试列表为空")
                return
        exam = random.choice(items)

        with self.client.get(
            f"/api/exams/{exam['id']}/records",
            params={"page": 1, "page_size": 10},
            catch_response=True,
            name="GET /api/exams/{id}/records",
        ) as resp:
            records = (resp.json().get("data") or {}).get("items") or []
            if records:
                self.client.get(
                    f"/api/records/{records[0]['id']}/answers",
                    name="GET /api/records/{id}/answers",
                )
