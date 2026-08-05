from pydantic_settings import BaseSettings, SettingsConfigDict

"""配置模块：集中管理应用的全部环境配置（数据库、Redis、JWT、AI 服务等）。"""

class Settings(BaseSettings):
    """应用配置类：从环境变量 / .env 文件读取配置项。"""
    DATABASE_URL: str
    REDIS_URL: str
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 120
    UPLOAD_DIR: str = "./uploads"
    AI_BASE_URL: str | None = None
    AI_API_KEY: str | None = None
    AI_MODEL: str | None = None
    AI_TIMEOUT_SECONDS: int = 60
    AI_MAX_RETRIES: int = 2
    AI_WORKER_POLL_SECONDS: float = 1.0

    # 从 .env 文件读取配置，并忽略未声明的多余环境变量
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
