import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import engine, Base
from app.db_init import init_database
from app.logging_config import setup_logging
from app.models import *  # noqa: F403
from app.api.auth import router as auth_router
from app.api.users import router as users_router
from app.api.courses import router as courses_router
from app.api.exams import router as exams_router
from app.api.questions import router as questions_router
from app.api.exam_student import router as exam_student_router
from app.api.grading import router as grading_router
from app.api.statistics import router as statistics_router
from app.api.admin_classes import router as admin_classes_router
from app.api.admin_teacher_subjects import router as admin_teacher_subjects_router
from app.workers.ai_grading_worker import ai_grading_workers

"""FastAPI 应用入口：创建应用实例、注册路由与中间件，并随服务生命周期启停 AI 评分 worker。"""

setup_logging()
logger = logging.getLogger("app")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理：启动时自动建库建表并写入演示数据（init.sql），随后启动 AI 评分 worker，关闭时取消 worker 任务。"""
    # 自动执行 backend/sql/init.sql：建库 -> 建表/老库迁移 -> 全新库时写入演示账号与数据
    await init_database()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # 后台并发协程持续轮询数据库中的待评分任务，任务领取由数据库 SKIP LOCKED 仲裁
    async with ai_grading_workers(settings.AI_WORKER_CONCURRENCY):
        logger.info("AI 评分 worker 已随服务启动")
        yield
    logger.info("AI 评分 worker 已随服务停止")

app = FastAPI(title="在线考试系统", version="1.0.0", lifespan=lifespan)

# 仅允许前端开发服务器跨域访问；使用凭证模式时来源必须显式列出，不能写成 "*"
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(courses_router)
app.include_router(exams_router)
app.include_router(questions_router)
app.include_router(exam_student_router)
app.include_router(grading_router)
app.include_router(statistics_router)
app.include_router(admin_classes_router)
app.include_router(admin_teacher_subjects_router)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    """HTTP 请求日志中间件：记录每个请求的方法、路径、状态码与耗时。"""
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    # 4xx/5xx 响应用 warning 级别记录，便于快速发现异常请求
    log = logger.warning if response.status_code >= 400 else logger.info
    log(
        "%s %s -> %s (%.1fms)",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """全局异常兜底处理器：记录完整堆栈并统一返回 500，避免向客户端暴露内部细节。"""
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "服务器内部错误"})

@app.get("/api/health")
async def health_check():
    """健康检查接口，用于探测服务是否存活。"""
    return {"status": "ok"}
