"""AI 评分 worker 并发协程管理测试：启动数量与退出时的统一取消。"""

import asyncio

import pytest

from app.workers import ai_grading_worker as worker_mod


@pytest.mark.asyncio
async def test_ai_grading_workers_starts_expected_count(monkeypatch):
    started = []

    async def fake_worker():
        started.append(1)
        try:
            await asyncio.sleep(3600)
        except asyncio.CancelledError:
            raise

    monkeypatch.setattr(worker_mod, "run_worker", fake_worker)

    async with worker_mod.ai_grading_workers(3):
        await asyncio.sleep(0)
        assert len(started) == 3

    assert len(started) == 3


@pytest.mark.asyncio
async def test_ai_grading_workers_cancels_all_on_exit(monkeypatch):
    cancelled = []

    async def fake_worker():
        try:
            await asyncio.sleep(3600)
        except asyncio.CancelledError:
            cancelled.append(1)
            raise

    monkeypatch.setattr(worker_mod, "run_worker", fake_worker)

    async with worker_mod.ai_grading_workers(3):
        await asyncio.sleep(0)

    assert len(cancelled) == 3


@pytest.mark.asyncio
async def test_ai_grading_workers_never_raises_on_exit(monkeypatch):
    """退出时即使存在已取消/已完成的任务，上下文管理器也不抛异常。"""

    async def fake_worker():
        await asyncio.sleep(3600)

    monkeypatch.setattr(worker_mod, "run_worker", fake_worker)

    async with worker_mod.ai_grading_workers(2):
        await asyncio.sleep(0)
