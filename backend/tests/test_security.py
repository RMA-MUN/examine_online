"""安全工具测试：异步密码哈希/校验在真实 bcrypt 上往返正确。"""

import pytest

from app.utils.security import hash_password_async, verify_password_async


@pytest.mark.asyncio
async def test_password_hash_and_verify_roundtrip():
    hashed = await hash_password_async("Password123!")
    assert hashed != "Password123!"
    assert await verify_password_async("Password123!", hashed) is True
    assert await verify_password_async("wrong-password", hashed) is False
