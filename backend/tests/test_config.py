from app.config import Settings


def test_ai_settings_use_safe_defaults():
    settings = Settings(
        _env_file=None,
        DATABASE_URL="sqlite+aiosqlite://",
        REDIS_URL="redis://x",
        JWT_SECRET_KEY="x",
    )

    assert settings.AI_BASE_URL is None
    assert settings.AI_MODEL is None
    assert settings.AI_TIMEOUT_SECONDS == 60
    assert settings.AI_MAX_RETRIES == 2


def test_database_pool_settings_use_safe_defaults():
    settings = Settings(
        _env_file=None,
        DATABASE_URL="sqlite+aiosqlite://",
        REDIS_URL="redis://x",
        JWT_SECRET_KEY="x",
    )

    assert settings.DB_POOL_SIZE == 20
    assert settings.DB_MAX_OVERFLOW == 20
    assert settings.DB_POOL_RECYCLE == 1800
