# 后端压测（Locust）设计

日期：2026-08-05
状态：已评审

## 背景

为在线考试系统后端设计压测，主要场景：大规模登录、大规模同时访问页面。规模：登录峰值 300 并发、页面访问 200 并发、持续 3-5 分钟（中等规模，本地开发机可承受）。

## 工具与依赖

- **Locust**（`uv add --dev locust`，Python 原生，支持 Web UI / headless / CSV 报表）
- 测试数据：现有 `seed_large_demo_data.sql` 的 demo 账号（60 学生 + 6 教师 + 1 管理员，密码 `Password123!`）与 10 场考试

## 场景设计（`backend/loadtest/locustfile.py`）

| 场景 (tag) | User 类 | 行为 |
|---|---|---|
| `login` | LoginUser | 67 个 demo 账号池轮转，反复登录（bcrypt 校验是 CPU 密集操作，制造登录压力）；登录接口无频率限制，账号可安全复用 |
| `dashboard` | DashboardUser | 学生:教师:管理员 = 7:2:1 权重取号，on_start 登录后循环 GET `/api/statistics/dashboard` |
| `student` | StudentPageUser | 登录后循环 GET `/api/exams`（分页）+ `/api/records` |
| `exam-take` | ExamTakingUser | 登录 → GET `/api/exams` 找到 `student_record_status == "ongoing"` 的考试 → GET `/api/exams/{id}/paper` → POST `/api/exams/{id}/save`（Redis 暂存）→ POST `/api/exams/{id}/submit` → `StopUser` 单轮 |
| `grading` | TeacherGradingUser | 登录 → 考试列表 → 按教师课程过滤 → GET `/api/exams/{id}/records` → GET `/api/records/{id}/answers` |

### 关键约束（来自后端行为）

- **交卷唯一性**：`submit_exam` 将记录从 ongoing 转为 submitted，且 (student, exam) 唯一 → 作答链路每账号单轮执行（`StopUser`），种子数据中 ongoing 记录共 60 条（ex5 36 条 + ex6 24 条）→ **作答场景用户数上限 60，压测后需重跑 `seed_large_demo_data.sql` 恢复数据**
- **Redis 依赖**：`get_paper` / `save_answers` / `submit_exam` 使用 Redis 缓存与暂存 → 压测前需确认本地 Redis 运行中
- **教师权限**：阅卷接口校验教师管理权 → 按 seed 的教师-课程映射（teacher 名下考试标题列表）过滤，避免 403 噪音
- **作答答案构造**：按 paper 返回的题目类型生成合法答案（单选/判断随机字母、多选随机子集、填空随机文本、简答随机文本）

## 运行方式

交互模式（Web UI 在 http://localhost:8089 配置并发/速率）：

```
uv run locust -f backend/loadtest/locustfile.py --host http://localhost:8000
```

Headless 单场景（示例：登录场景 300 并发 3 分钟）：

```
uv run locust -f backend/loadtest/locustfile.py --host http://localhost:8000 --headless --users 300 --spawn-rate 50 --run-time 3m --only-user LoginUser --csv=report
```

## 前置条件

1. 后端运行中（localhost:8000）
2. Redis 运行中
3. seed 数据已灌入
4. 作答链路场景压测后重跑 seed 恢复 ongoing 记录

## 验收标准

1. 各场景可单独运行（`--only-user`），无 403/500 噪音（业务性失败在脚本中明确标记）
2. 登录场景达到 300 并发峰值；页面场景 200 并发稳定运行
3. 产出 CSV 报表与 Web UI 实时指标
