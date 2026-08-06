# 在线考试系统 Online Exam System

一个基于 **FastAPI + React** 的前后端分离在线考试系统，支持**学生 / 教师 / 管理员**三种角色，覆盖考试发布、在线答题、**AI 智能评分**、防作弊、成绩统计与导出等完整考试流程。

## 项目演示

| 登录页 | 数据仪表盘 |
|---|---|
| ![登录页](docs/screenshots/login.png) | ![数据仪表盘](docs/screenshots/dashboard.png) |

![AI 智能评分](docs/screenshots/ai-grading.png)

**AI 智能评分**：逐评分要点打分，展示评分理由与置信度，教师可一键采纳或人工复核。

## 亮点：AI 智能评分系统

系统内置一套完整的 **AI 主观题自动评分引擎**，基于 [Pydantic-AI](https://github.com/pydantic/pydantic-ai)构建。学生交卷后，后台 Worker 异步调用大语言模型自动批改简答题，无需教师逐份手动批改。

### 核心能力

- **评分要点（Rubric）驱动**：教师创建简答题时可配置评分要点（例如「封装的定义与作用 6 分」），AI 按要点逐项打分并给出每条理由；未配置时 AI 结合参考答案与题目解析整体评分
- **结构化评分结果**(Pydantic-AI的特点)：AI 返回总分、分项得分、逐项理由与置信度，经三层校验后入库；非法输出自动触发模型修复重试（最多 2 次），绝不让异常结果落库
- **异步任务队列**：数据库持久化任务表 + 独立 Worker 消费，多 Worker 并发领取（`SKIP LOCKED` 原子仲裁、长任务锁续期、指数退避重试），进程重启后未完成任务自动恢复，AI 服务不可用完全不影响学生交卷
- **教师覆盖优先**：AI 分数自动生效；教师改分后标记为「教师复核」，之后完成的 AI 任务**永不覆盖**教师分数，所有人工改分须填写修改原因
- **防 Prompt 注入**：学生答案在系统提示中明确标记为「不可信内容」，模型被要求忽略其中任何试图改变评分规则的指令
- **模型无关，即插即用**：仅通过 `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` 三个环境变量即可切换 OpenAI、DeepSeek、通义千问或任何 OpenAI 兼容服务，无需改动业务代码

### 交互流程

```text
学生交卷
  ├─ 客观题：系统立即自动判分
  └─ 主观题：创建 AI 评分任务 → 交卷请求立即返回
                        │
                        ▼
      后台 Worker 领取任务 → 调用 AI 评分 Agent
                        │
                        ▼
      三层校验（结构化契约 → 字段约束 → 题目业务校验）
                        │
                        ▼
      写入 AI 分数 / 理由 / 置信度 → 更新考试总分
                        │
                        ▼
      教师阅卷：查看评分依据 → 采纳或改分（记录原因）
```

### 技术要点

- `pydantic-ai` Agent 以 `output_type=AiGradingResult` 强制结构化输出，字段级约束（`score ≥ 0`、`confidence ∈ [0,1]`）由 Pydantic 保证
- 评分结果与题库中的 rubric、题目满分**交叉验证**（分项和 = 总分、单项不超限、rubric 全覆盖），校验失败自动重试而非直接判 0 分
- 模型密钥仅存于后端 `.env`，日志不记录 API Key 与完整学生答案，失败信息只保存脱敏摘要

## 功能特性

### 学生端
- 考试列表与开始考试（限定时段、考试时长）
- 在线答题：单选 / 多选 / 判断 / 填空 / 简答五种题型
- 自动保存答案（每 30s）、倒计时自动交卷
- 切屏检测：记录切换次数，超限触发警示并影响成绩
- 成绩记录：查看分数、AI 评分理由与分项明细

### 教师端
- 课程管理
- 考试管理：创建 / 编辑 / 发布考试，题目管理（五种题型、动态选项、简答题评分要点）
- 阅卷管理：客观题一键自动判分、主观题 AI 自动评分 + 人工复核、终评
- 数据统计：考试数据看板（ECharts 可视化）、成绩导出（Excel）

### 管理员端
- 用户管理（学生 / 教师 / 管理员账号的增删改查）
- 班级管理、教师授课科目分配
- 全局数据仪表盘与导出

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 · Ant Design 6 · Tailwind CSS 3 · Zustand · React Router 7 · ECharts |
| 后端 | FastAPI · SQLAlchemy 2.0（异步）· Pydantic v2 · PydanticAI |
| 数据库 | MySQL（asyncmy 驱动） |
| 缓存 | Redis |
| 认证 | JWT（python-jose）+ bcrypt 密码加密 |
| 测试 | 前端 Vitest · 后端 pytest · 压测 Locust |
| 构建 | Vite 8 · uv |

## 项目结构

```
examine_online/
├── backend/                # FastAPI 后端
│   ├── app/
│   │   ├── api/            # 路由层（auth / users / courses / exams / questions / grading / statistics）
│   │   ├── models/         # SQLAlchemy 数据模型（含 ai_grading_task）
│   │   ├── schemas/        # Pydantic 校验模型（含 AiGradingResult 契约）
│   │   ├── services/       # 业务逻辑层（含 ai_grading_agent / ai_grading_service）
│   │   ├── workers/        # 后台任务（ai_grading_worker 常驻协程）
│   │   ├── utils/          # 通用工具（JWT、权限、响应封装）
│   │   ├── config.py       # 环境配置
│   │   ├── database.py     # 数据库连接
│   │   ├── db_init.py      # 启动时自动执行 init.sql（建库/建表/演示数据）
│   │   └── main.py         # 应用入口（随生命周期启动 AI 评分 Worker）
│   ├── loadtest/           # Locust 压测脚本
│   ├── sql/                # init.sql 一键初始化脚本（建库+建表+演示数据）
│   ├── tests/              # 后端测试
│   ├── pyproject.toml      # uv 依赖管理
│   └── .env.example        # 环境变量模板
├── frontend/               # React 前端（Vite）
│   └── src/
│       ├── api/            # 接口封装（axios）
│       ├── components/     # 共享组件（Layout / StatusTag / QuestionRenderer 等）
│       ├── pages/          # 页面（Admin / Teacher / Student / Login / Profile / Dashboard）
│       ├── store/          # Zustand 状态管理
│       └── App.tsx         # 路由与全局主题
├── docs/screenshots/       # 项目演示截图
└── .github/workflows/      # CI 工作流
```

## 快速开始

### 环境要求
- Python >= 3.12（推荐使用 [uv](https://docs.astral.sh/uv/) 管理依赖）
- Node.js >= 18
- MySQL 8.x、Redis

### 1. 后端启动

```bash
cd backend

# 安装依赖（uv）
uv sync

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 MySQL / Redis 连接信息，并按需配置 AI 评分模型

# 启动服务（自动建库建表 + 初始化演示数据，监听 http://localhost:8000）
uv run uvicorn app.main:app --reload --port 8000
```

启动时后端会自动执行 [backend/sql/init.sql](backend/sql/init.sql)：

- **自动建库**：按 `.env` 中 `DATABASE_URL` 配置的库名创建（不存在时），无需手工建库；
- **自动建表**：11 张表全部 `CREATE TABLE IF NOT EXISTS`，老库缺失的列 / 索引 / 外键也会自动补齐；
- **自动写入演示数据**：仅当数据库为全新（无任何用户）时写入演示账号、课程、考试、答题记录等，重复启动不会重置已有数据。

接口文档（Swagger UI）：http://localhost:8000/docs

> AI 评分 Worker 会随服务自动启动，无需单独运行进程。

### 2. 前端启动

```bash
cd frontend

# 安装依赖
npm install

# 开发模式（监听 http://localhost:3000，API 指向 http://localhost:8000）
npm start

# 生产构建
npm run build
```

### 3. 初始化账号

无需手动建号：首次启动后，系统已内置演示账号（密码均为 `Password123!`）：

| 账号 | 角色 | 说明 |
|---|---|---|
| `demo_admin` | 管理员 | 系统管理员，可管理用户 / 班级 / 科目 |
| `demo_teacher_01` ~ `06` | 教师 | 王建国、李慧敏、张伟、刘洋、陈静、赵鹏 |
| `demo_student_01` ~ `60` | 学生 | 60 名学生，分属 5 个班级 |
| `seed_computer_admin` | 管理员 | 计算机专业演示数据管理员 |
| `seed_computer_teacher` | 教师 | 张老师（计算机网络 / Python / Java 课程） |
| `seed_computer_student_01` ~ `03` | 学生 | 李明、王芳、赵磊 |

### 数据库初始化脚本（可选）

应用启动时已自动执行初始化；如需手工初始化或重置演示数据，可执行：

```bash
mysql -u root -p < backend/sql/init.sql
```

[init.sql](backend/sql/init.sql) 包含**创建数据库 → 创建全部数据表 → 初始化演示数据**三步，全程幂等可重复执行：

- 建库 / 建表均使用 `IF NOT EXISTS`；
- 老库缺失的列 / 索引 / 外键通过 `information_schema` 检查后自动补齐；
- 演示数据按「先清理本种子数据、再重新插入」的方式重置，多次执行结果一致。

## 环境变量说明

见 [backend/.env.example](backend/.env.example)：

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | MySQL 连接串，如 `mysql+asyncmy://user:pass@localhost:3306/exam_system` |
| `REDIS_URL` | Redis 连接串，如 `redis://localhost:6379/0` |
| `JWT_SECRET_KEY` | JWT 签名密钥，生产环境务必替换为强随机值 |
| `JWT_ALGORITHM` | JWT 算法，默认 `HS256` |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | Token 有效期（分钟） |
| `UPLOAD_DIR` | 上传文件目录 |
| `AI_BASE_URL` | AI 模型接口地址（OpenAI 兼容），如 `https://api.deepseek.com/v1` |
| `AI_API_KEY` | AI 模型 API Key，仅存于后端，不下发浏览器 |
| `AI_MODEL` | 模型名，如 `deepseek-chat` / `gpt-4o-mini` |
| `AI_TIMEOUT_SECONDS` | 单次 AI 调用超时（秒），默认 60 |
| `AI_MAX_RETRIES` | PydanticAI 输出修复重试次数，默认 2 |
| `AI_WORKER_POLL_SECONDS` | Worker 空闲轮询间隔（秒），默认 1.0 |
| `AI_WORKER_CONCURRENCY` | Worker 并发协程数，默认 4 |

## 角色与权限

| 角色 | 权限 |
|---|---|
| `student` | 考试列表、在线答题、成绩记录 |
| `teacher` | 课程 / 考试 / 题目管理、阅卷（AI + 人工）、数据看板、成绩导出 |
| `admin` | 用户 / 班级 / 科目管理、全局数据仪表盘 |

## 测试

```bash
# 后端（pytest）
cd backend && uv run pytest

# 前端（Vitest）
cd frontend && npm test

# 压测（Locust，见 backend/loadtest/）
cd backend/loadtest && uv run locust -f locustfile.py
```

## CI/CD

项目内置 GitHub Actions 工作流（`.github/workflows/ci.yml`），Push / PR 时自动执行：
- 后端：安装依赖、编译检查
- 前端：安装依赖、生产构建

## 许可证

本项目为 [RMA-MUN](https://github.com/RMA-MUN) 本科毕业设计项目，仅供学习交流使用。
