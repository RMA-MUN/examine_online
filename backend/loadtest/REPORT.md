# 后端压测报告

日期：2026-08-05
工具：Locust 2.46.3（`backend/loadtest/locustfile.py`）
目标环境：本地开发机（Windows，单 uvicorn worker，MySQL + Redis 本机运行）

## 1. 测试场景

| 场景 | User 类 | 说明 |
|---|---|---|
| 大规模登录 | LoginUser | 67 个 demo 账号池轮转反复登录（bcrypt 验密为 CPU 密集操作） |
| 仪表盘并发 | DashboardUser | 学生:教师:管理员 = 7:2:1 权重访问 `/api/statistics/dashboard` |
| 学生页面并发 | StudentPageUser | 考试列表 + 我的记录 |
| 考试作答链路 | ExamTakingUser | 拿试卷 → 保存答案(Redis) → 交卷，每账号单轮 |
| 教师阅卷页并发 | TeacherGradingUser | 考试列表 → 阅卷列表 → 答卷详情 |

数据基础：`init.sql` 中的大型演示数据（60 学生 + 6 教师 + 1 管理员 + 10 场考试）。

## 2. 压测发现并修复的问题

### 2.1 Redis 写保护（环境问题）

- 现象：`GET /api/exams/{id}/paper`、`save`、`submit` 全部 HTTP 500
- 根因：本地 Redis 的 `dir` 指向不可写的 msys2 绝对路径（`/Program Files/...`），RDB 快照失败触发 `stop-writes-on-bgsave-error`，**拒绝所有写命令**（MISCONF）
- 处置：`CONFIG SET stop-writes-on-bgsave-error no` 解锁写入（运行时配置，Redis 重启后还原；永久修复需改 `redis.conf` 的 `dir` 为可写路径）

### 2.2 `submit_exam` 缺幂等性（代码 bug）

- 现象：已有答案行的记录交卷报 500
- 根因：交卷直接 INSERT 答案行，撞 `answers.uk_record_question` 唯一键（进行中占位答案 / 上次提交中途失败残留均会触发）
- 修复：`exam_student_service.py` 交卷前先删除该记录旧答案；新增测试 `test_exam_student_service.py` 验证重提交正确替换旧答案

### 2.3 bcrypt 同步调用阻塞事件循环（性能瓶颈，主因）

- 现象：300 并发登录 **51.7% 失败、中位响应 32 秒**，并拖垮所有页面接口
- 根因：`pwd_context.verify` 为同步 bcrypt（单次约 250ms），在 async 接口中直接调用会**阻塞整个事件循环**，并发请求全部串行排队
- 修复：`security.py` 新增 `hash_password_async` / `verify_password_async`（`asyncio.to_thread` 线程池执行），登录、改密码、创建用户全部切换；新增测试 `test_security.py`

### 2.4 数据库连接池过小

- 修复：`config.py` 新增 `DB_POOL_SIZE=20`、`DB_MAX_OVERFLOW=20`、`DB_POOL_RECYCLE=1800`（共 40 连接上限），`database.py` 应用并开启 `pool_pre_ping`

## 3. 压测结果

### 3.1 登录场景（300 并发，2 分钟，修复前后对比）

| 指标 | 修复前 | 修复后 |
|---|---|---|
| 请求数 | 1268 | **8504（6.7 倍）** |
| 失败率 | 51.7%（499×500 + 156×连接错误） | **0.00%** |
| 中位响应 | 32 秒 | **3.8 秒** |
| 最大响应 | 37 秒 | 10 秒 |
| 吞吐 | — | **70.9 req/s**（单 worker 下 bcrypt CPU 上限） |

### 3.2 页面场景（200 并发混合）

| 接口 | 处理请求数 | 中位 | 90% | 99% | 最大 |
|---|---|---|---|---|---|
| `POST /api/auth/login` | 4589 | 490ms | 1.4s | 4.1s | 5.6s |
| `GET /api/statistics/dashboard` | 2200 | 540ms | 1.2s | 4.1s | 4.1s |
| `GET /api/exams` | 2466 | 770ms | 1.4s | 4.1s | 4.1s |
| `GET /api/records` | 632 | 400ms | 1.1s | 4.1s | 4.1s |
| `GET /api/exams/{id}/records` | 1164 | 420ms | 850ms | 1.5s | 3.3s |
| `GET /api/records/{id}/answers` | 892 | 430ms | 860ms | 1.7s | 4.1s |
| `GET /api/exams/{id}/paper` | 43 | 220ms | 1.5s | 1.9s | 1.9s |
| `POST /api/exams/{id}/save` | 41 | 150ms | 1.5s | 2.5s | 2.5s |
| `POST /api/exams/{id}/submit` | 41 | 820ms | 1.9s | 2.8s | 2.8s |

## 4. 结论

- 线程池化 bcrypt 后，登录吞吐 70.9 req/s、0 失败，事件循环不再阻塞，各接口并发能力整体上一个量级
- 当前单 worker 的吞吐上限由 bcrypt CPU 成本决定；页面接口在并发下延迟主要来自排队
- 剩余优化空间：多 worker 部署（吞吐近似线性扩展）、登录接口可加频率限制防御（压测显示无限制）、Redis `dir` 永久修复

## 5. 复现方式

前置条件：后端（8000）+ Redis 运行中，`init.sql` 已灌入（作答链路压测后需重跑恢复 ongoing 记录）。

```bash
# 交互模式（Web UI http://localhost:8089）
uv run locust -f backend/loadtest/locustfile.py --host http://localhost:8000

# headless 单场景（示例：登录 300 并发 3 分钟）
uv run locust -f backend/loadtest/locustfile.py --host http://localhost:8000 \
    --headless --users 300 --spawn-rate 50 --run-time 3m LoginUser --csv=report
```
