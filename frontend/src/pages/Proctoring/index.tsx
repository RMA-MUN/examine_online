import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Drawer, Select, Space } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import axios from '../../api/axios';
import { getExams } from '../../api/exams';
import type { ApiResponse, Paginated } from '../../types/api';
import type { Exam } from '../../types/exam';
import {
  MOCK_ALERTS,
  MOCK_EXAM_INFO,
  MOCK_HANDLED,
  MOCK_STUDENTS,
  type MockStudent,
  type WallStatus,
} from '../../mocks/proctoring';
import './index.css';

interface MonitorEventItem {
  id: number;
  exam_id: number;
  record_id: number;
  student_id: number;
  event_type: string;
  detail: Record<string, unknown> | null;
  handled_action?: 'warn' | 'normal' | null;
  handled_by?: number | null;
  created_at: string;
}

const EVENT_LABEL: Record<string, string> = {
  switch: '切屏',
  blur: '失焦',
  fullscreen_exit: '退出全屏',
  paste: '粘贴',
  face_lost: '人脸丢失',
};

type WallFilter = 'all' | WallStatus;

const Proctoring = () => {
  const { message } = App.useApp();
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  // 实时事件流：轮询成功且非空时覆盖告警 feed，失败/空时回退 mock
  const [events, setEvents] = useState<MonitorEventItem[]>([]);
  const [filter, setFilter] = useState<WallFilter>('all');
  const [selected, setSelected] = useState<MockStudent | null>(null);
  // Drawer 时间线：优先调真接口 GET /api/records/{id}/events，失败/为空回退 mock
  const [recordEvents, setRecordEvents] = useState<MonitorEventItem[] | null>(null);
  // 处置动作：PATCH /api/exams/{id}/events/{eventId}/handle；失败回退本地 state
  const [warnedIds, setWarnedIds] = useState<string[]>([]);
  const [normalIds, setNormalIds] = useState<string[]>([]);

  useEffect(() => {
    getExams({ page_size: 100 })
      .then((res) => {
        const items = res.data.items || [];
        setExams(items);
        setExamId(items[0]?.id ?? null);
      })
      .catch(() => message.error('获取考试列表失败，已展示演示数据'));
  }, [message]);

  const fetchEvents = useCallback(async (id: number) => {
    try {
      const res = (await axios.get(`/api/exams/${id}/events`, {
        params: { page: 1, page_size: 100 },
      })) as unknown as ApiResponse<Paginated<MonitorEventItem>>;
      setEvents(res?.data?.items ?? []);
    } catch {
      setEvents([]);
    }
  }, []);

  useEffect(() => {
    if (examId == null) return;
    fetchEvents(examId);
    const timer = window.setInterval(() => fetchEvents(examId), 5000);
    return () => window.clearInterval(timer);
  }, [examId, fetchEvents]);

  const visible = useMemo(
    () => (filter === 'all' ? MOCK_STUDENTS : MOCK_STUDENTS.filter((s) => s.status === filter)),
    [filter],
  );

  const feed = useMemo(
    () =>
      events.length > 0
        ? events.map((e) => ({
            k: e.event_type === 'face_lost' || e.event_type === 'switch' ? 'danger' : 'warn',
            n: EVENT_LABEL[e.event_type] ?? e.event_type,
            m: `记录 #${e.record_id} · ${e.created_at}`,
          }))
        : MOCK_ALERTS,
    [events],
  );

  const usingMock = events.length === 0;
  const examTitle = exams.find((e) => e.id === examId)?.title ?? MOCK_EXAM_INFO.title;

  const openDrawer = (s: MockStudent) => setSelected(s);

  useEffect(() => {
    if (selected == null) {
      setRecordEvents(null);
      return;
    }
    const recordId = Number(selected.id);
    if (!Number.isFinite(recordId)) {
      setRecordEvents(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = (await axios.get(`/api/records/${recordId}/events`)) as unknown as ApiResponse<
          MonitorEventItem[]
        >;
        if (!cancelled) setRecordEvents(res?.data ?? []);
      } catch {
        if (!cancelled) setRecordEvents(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const drawerTimeline = useMemo(() => {
    if (recordEvents && recordEvents.length > 0) {
      return recordEvents.map((e) => ({
        k: (e.event_type === 'face_lost' || e.event_type === 'switch' ? 'danger' : 'warn') as
          | 'danger'
          | 'warn'
          | 'ok',
        n: EVENT_LABEL[e.event_type] ?? e.event_type,
        t: e.created_at,
        m: `记录 #${e.record_id}`,
      }));
    }
    return selected?.events ?? [];
  }, [recordEvents, selected]);

  // Drawer 当前记录下首条未处置事件：警告/标记正常优先落到该事件，无事件时回退本地演示
  const pendingEvent = useMemo(
    () =>
      recordEvents?.find((e) => e.handled_action == null) ??
      (recordEvents && recordEvents.length > 0 ? recordEvents[0] : null),
    [recordEvents],
  );

  const handleEventAction = async (s: MockStudent, action: 'warn' | 'normal') => {
    const markLocal = () => {
      if (action === 'warn') {
        setWarnedIds((prev) => (prev.includes(s.id) ? prev : [...prev, s.id]));
      } else {
        setNormalIds((prev) => (prev.includes(s.id) ? prev : [...prev, s.id]));
      }
    };
    if (examId != null && pendingEvent != null) {
      try {
        await axios.patch(`/api/exams/${examId}/events/${pendingEvent.id}/handle`, { action });
        markLocal();
        message.success(action === 'warn' ? `已向 ${s.name} 发送警告` : `已将 ${s.name} 标记为正常`);
        fetchEvents(examId);
        return;
      } catch {
        // 后端不可用时回退本地演示
      }
    }
    markLocal();
    message.info(
      action === 'warn' ? `已向 ${s.name} 发送警告（本地演示）` : `已将 ${s.name} 标记为正常（本地演示）`,
    );
  };

  const handleWarn = (s: MockStudent) => {
    void handleEventAction(s, 'warn');
  };

  const handleForceSubmit = async (s: MockStudent) => {
    const recordId = Number(s.id);
    if (Number.isFinite(recordId)) {
      try {
        await axios.post(`/api/records/${recordId}/force-submit`);
        message.success(`已对 ${s.name} 下发强制交卷`);
        return;
      } catch {
        // 后端不可用时回退本地演示
      }
    }
    message.info(`已对 ${s.name} 下发强制交卷（本地演示）`);
  };

  const handleMarkNormal = (s: MockStudent) => {
    void handleEventAction(s, 'normal');
  };

  const handleCloseExam = async () => {
    if (examId == null) {
      message.warning('演示环境不支持结束考试');
      return;
    }
    try {
      await axios.put(`/api/exams/${examId}/close`);
      message.success('已结束本场考试');
    } catch {
      message.warning('结束考试失败，当前为演示数据');
    }
  };

  return (
    <div className="mj-proctoring">
      <section className="page-head">
        <div>
          <h1 className="title-lg">考试监控与防作弊</h1>
          <p className="page-sub">
            {examTitle} · {MOCK_EXAM_INFO.clazz} · 剩余 <span className="num">{MOCK_EXAM_INFO.remain}</span> 分钟
          </p>
        </div>
        <div className="toolbar">
          <Button onClick={() => message.info('全屏公告下发为演示按钮')}>下发全屏公告</Button>
          <Button onClick={() => message.info('防作弊策略配置为演示按钮')}>防作弊策略</Button>
          <Button danger onClick={() => void handleCloseExam()}>
            结束本场考试
          </Button>
        </div>
      </section>

      <section className="banner banner-warn">
        <span>
          <b>{MOCK_EXAM_INFO.highRisk} 名考生</b> 触发高风险告警（连续切屏 / 检测到第二张人脸），建议立即人工复核。
        </span>
      </section>

      <section className="kpi-grid" aria-label="监控指标">
        <div className="kpi">
          <div className="label">在线考生</div>
          <div className="kpi-num">
            {MOCK_EXAM_INFO.online}
            <span className="muted">/{MOCK_EXAM_INFO.total}</span>
          </div>
          <div className="kpi-foot">
            交卷 <span className="num">{MOCK_EXAM_INFO.submitted}</span> 人 · 平均进度{' '}
            <span className="num">{MOCK_EXAM_INFO.progress}%</span>
          </div>
        </div>
        <div className="kpi">
          <div className="label">异常行为</div>
          <div className="kpi-num danger">{MOCK_ALERTS.length}</div>
          <div className="kpi-foot">
            <span className="pill pill-danger">
              <i className="pill-dot" />高风险 {MOCK_EXAM_INFO.highRisk}
            </span>
            <span className="pill pill-warn">中风险 {MOCK_EXAM_INFO.midRisk}</span>
          </div>
        </div>
        <div className="kpi">
          <div className="label">离线 / 断线</div>
          <div className="kpi-num">{MOCK_EXAM_INFO.offline}</div>
          <div className="kpi-foot">断线超过 60 秒将自动暂停计时</div>
        </div>
        <div className="kpi">
          <div className="label">已下发警告</div>
          <div className="kpi-num">{MOCK_EXAM_INFO.warned}</div>
          <div className="kpi-foot">处置记录已同步至教务留档</div>
        </div>
      </section>

      <section className="cols-3">
        <aside className="panel rail">
          <div className="rail-group">
            <div className="label">监控范围</div>
            <div className="rail-list">
              <Select
                style={{ width: '100%', marginTop: 10 }}
                placeholder="选择考试"
                value={examId ?? undefined}
                onChange={(v) => setExamId(v)}
                options={exams.map((e) => ({ value: e.id, label: e.title }))}
              />
            </div>
          </div>
          <div className="rail-group">
            <div className="label">防作弊策略</div>
            <div className="stack-sm policy-list">
              {['切屏检测与记录', '摄像头人脸核验', '第二张人脸检测', '多设备登录拦截', '题目与选项乱序'].map((name) => (
                <div className="between" key={name}>
                  <span className="policy-name">{name}</span>
                  <span className="pill pill-ok">已启用</span>
                </div>
              ))}
              <div className="between">
                <span className="policy-name">复制粘贴禁用</span>
                <span className="pill pill-neutral">未启用</span>
              </div>
            </div>
          </div>
          <div className="rail-group">
            <div className="label">图例</div>
            <div className="stack-sm legend-list">
              <div className="row">
                <span className="tile-live ok">
                  <i />
                </span>
                <span className="legend-text">正常作答</span>
              </div>
              <div className="row">
                <span className="tile-live alert">
                  <i />
                </span>
                <span className="legend-text">异常告警</span>
              </div>
              <div className="row">
                <span className="tile-live off">
                  <i />
                </span>
                <span className="legend-text">离线 / 已交卷</span>
              </div>
            </div>
          </div>
        </aside>

        <div className="panel">
          <div className="panel-head">
            <div className="row">
              <span className="title-sm">实时监控墙</span>
              <span className="meta">
                {visible.length} / {MOCK_EXAM_INFO.total} 路
              </span>
            </div>
            <div className="row">
              <div className="seg">
                <button type="button" className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
                  全部
                </button>
                <button type="button" className={filter === 'ok' ? 'on' : ''} onClick={() => setFilter('ok')}>
                  正常
                </button>
                <button type="button" className={filter === 'alert' ? 'on' : ''} onClick={() => setFilter('alert')}>
                  告警
                </button>
                <button type="button" className={filter === 'off' ? 'on' : ''} onClick={() => setFilter('off')}>
                  离线
                </button>
              </div>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => examId != null && fetchEvents(examId)}
              >
                刷新
              </Button>
            </div>
          </div>
          <div className="panel-body">
            <div className="wall">
              {visible.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`tile${selected?.id === s.id ? ' on' : ''}`}
                  onClick={() => openDrawer(s)}
                >
                  {s.status === 'alert' && <span className="tile-flag">{s.flag}</span>}
                  <div className="tile-top">
                    <span className="tile-mono">{s.name.slice(0, 1)}</span>
                    <span className={`tile-live ${s.status === 'ok' ? '' : s.status}`}>
                      <i />
                      {s.status === 'ok' ? 'LIVE' : s.status === 'alert' ? 'ALERT' : 'OFF'}
                    </span>
                  </div>
                  <div className="tile-bot">
                    <div className="tile-name">{s.name}</div>
                    <div className="tile-id">
                      {s.cls} · 进度 {s.progress}%
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <p className="meta wall-note">
              {usingMock ? '后端事件流不可用，当前为原型演示数据。' : `已连接实时事件流（${events.length} 条）。`}
              画面为原型占位示意，实际监考画面由考生端摄像头实时推流。
            </p>
          </div>
        </div>

        <aside className="rail">
          <div className="panel">
            <div className="panel-head">
              <span className="title-sm">实时告警</span>
              <span className="pill pill-danger">
                <i className="pill-dot" />
                {feed.length} 条
              </span>
            </div>
            <div className="feed">
              {feed.map((a, idx) => (
                <div className="feed-item" key={`${a.n}-${idx}`}>
                  <span className={`feed-ico ico-${a.k}`}>{a.k === 'info' ? 'i' : '!'}</span>
                  <div>
                    <div className="feed-t">{a.n}</div>
                    <div className="feed-m">{a.m}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="panel handled-panel">
            <div className="panel-head">
              <span className="title-sm">处置记录</span>
              <span className="meta">今日</span>
            </div>
            <div className="panel-body stack-sm">
              {MOCK_HANDLED.map((h) => (
                <div className="between" key={h.t}>
                  <div>
                    <div className="handled-title">{h.t}</div>
                    <div className="meta handled-meta">{h.m}</div>
                  </div>
                  <span className={`pill ${h.c}`}>留档</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <Drawer
        title={selected ? `${selected.name} · ${selected.cls}` : '考生详情'}
        open={selected != null}
        onClose={() => setSelected(null)}
        width={480}
      >
        {selected && (
          <div className="drawer-stack">
            <p className="meta">
              学号 {selected.id} · 风险等级 {selected.risk}
              {warnedIds.includes(selected.id) && ' · 已警告'}
              {normalIds.includes(selected.id) && ' · 已标记正常'}
            </p>
            <div className="answer-grid">
              <div className="answer-box">
                <div className="label">人脸核验</div>
                <div className="answer-val">{selected.face}</div>
              </div>
              <div className="answer-box">
                <div className="label">设备状态</div>
                <div className="answer-val">
                  摄像头 {selected.cam} · 麦克风 {selected.mic}
                </div>
              </div>
              <div className="answer-box">
                <div className="label">切屏次数</div>
                <div className="answer-val">{selected.switches} 次</div>
              </div>
              <div className="answer-box">
                <div className="label">网络</div>
                <div className="answer-val">{selected.net}</div>
              </div>
            </div>
            <div>
              <div className="label drawer-label">行为时间线{recordEvents && recordEvents.length > 0 ? '' : '（演示数据）'}</div>
              <div className="tl">
                {drawerTimeline.map((ev, idx) => (
                  <div className={`tl-item ${ev.k}`} key={`${ev.t}-${idx}`}>
                    <div className="tl-t">{ev.n}</div>
                    <div className="tl-m">
                      {ev.t} · {ev.m}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="label drawer-label">答题进度</div>
              <div className="hbar">
                <div className="hbar-track">
                  <i className="high" style={{ width: `${selected.progress}%` }} />
                </div>
                <span className="hbar-val">{selected.progress}%</span>
              </div>
            </div>
            <Space>
              <Button type="primary" danger onClick={() => handleWarn(selected)}>
                发送警告
              </Button>
              <Button danger onClick={() => handleForceSubmit(selected)}>
                强制交卷
              </Button>
              <Button onClick={() => handleMarkNormal(selected)}>标记为正常</Button>
            </Space>
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default Proctoring;
