import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Drawer, Input, Modal, Select, Space } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import axios from '../../api/axios';
import { getExams } from '../../api/exams';
import { getExamRecords } from '../../api/grading';
import type { ApiResponse, Paginated } from '../../types/api';
import type { Exam } from '../../types/exam';
import type { ExamRecord } from '../../types/record';
import EmptyState from '../../components/EmptyState';
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
  announcement: '全屏公告',
};

// 切屏 / 人脸丢失属于高权重风险信号，其余事件只进告警 feed，不计入风险推导
const RISK_EVENT_TYPES = new Set(['switch', 'face_lost']);

type RiskLevel = '高风险' | '中风险' | '正常';

interface WallStudent {
  recordId: number;
  studentId: number;
  name: string;
  status: ExamRecord['status'];
  risk: RiskLevel;
  riskCount: number;
  eventCount: number;
  switchCount: number;
}

const deriveRisk = (riskCount: number): RiskLevel =>
  riskCount >= 3 ? '高风险' : riskCount >= 1 ? '中风险' : '正常';

type WallFilter = 'all' | 'high' | 'mid' | 'ok';

const FILTER_RISK: Record<Exclude<WallFilter, 'all'>, RiskLevel> = {
  high: '高风险',
  mid: '中风险',
  ok: '正常',
};

const RISK_PILL_CLASS: Record<RiskLevel, string> = {
  高风险: 'pill-danger',
  中风险: 'pill-warn',
  正常: 'pill-ok',
};

const RECORD_STATUS_LABEL: Record<ExamRecord['status'], string> = {
  ongoing: '作答中',
  submitted: '已交卷',
  graded: '已交卷',
};

const Proctoring = () => {
  const { message } = App.useApp();
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  // 实时事件流：GET /api/exams/{id}/events（分页），5 秒轮询
  const [events, setEvents] = useState<MonitorEventItem[]>([]);
  const [eventsTotal, setEventsTotal] = useState<number | null>(null);
  // 考生记录：GET /api/exams/{id}/records（分页，含 student 嵌入），提供名单与交卷状态
  const [records, setRecords] = useState<ExamRecord[]>([]);
  const [recordsTotal, setRecordsTotal] = useState<number | null>(null);
  const [filter, setFilter] = useState<WallFilter>('all');
  const [selected, setSelected] = useState<WallStudent | null>(null);
  // Drawer 时间线：GET /api/records/{id}/events（数组）
  const [recordEvents, setRecordEvents] = useState<MonitorEventItem[] | null>(null);
  // 处置动作：PATCH /api/exams/{id}/events/{eventId}/handle
  const [warnedIds, setWarnedIds] = useState<string[]>([]);
  const [normalIds, setNormalIds] = useState<string[]>([]);
  // 全屏公告：POST /api/exams/{id}/announcements
  const [announceOpen, setAnnounceOpen] = useState(false);
  const [announceText, setAnnounceText] = useState('');
  const [announceSending, setAnnounceSending] = useState(false);

  useEffect(() => {
    getExams({ page_size: 100 })
      .then((res) => {
        const items = res.data.items || [];
        setExams(items);
        setExamId(items[0]?.id ?? null);
      })
      .catch(() => message.error('获取考试列表失败'));
  }, [message]);

  const fetchEvents = useCallback(async (id: number) => {
    try {
      const res = (await axios.get(`/api/exams/${id}/events`, {
        params: { page: 1, page_size: 100 },
      })) as unknown as ApiResponse<Paginated<MonitorEventItem>>;
      const items = res?.data?.items ?? [];
      setEvents(items);
      setEventsTotal(typeof res?.data?.total === 'number' ? res.data.total : items.length);
    } catch {
      setEvents([]);
      setEventsTotal(null);
    }
  }, []);

  const fetchRecords = useCallback(async (id: number) => {
    try {
      const res = await getExamRecords(id, { page: 1, page_size: 100 });
      const items = res?.data?.items ?? [];
      setRecords(items);
      setRecordsTotal(typeof res?.data?.total === 'number' ? res.data.total : items.length);
    } catch {
      setRecords([]);
      setRecordsTotal(null);
    }
  }, []);

  useEffect(() => {
    if (examId == null) return;
    fetchEvents(examId);
    fetchRecords(examId);
    const timer = window.setInterval(() => fetchEvents(examId), 5000);
    return () => window.clearInterval(timer);
  }, [examId, fetchEvents, fetchRecords]);

  const eventsByRecord = useMemo(() => {
    const map = new Map<number, MonitorEventItem[]>();
    for (const e of events) {
      const list = map.get(e.record_id) ?? [];
      list.push(e);
      map.set(e.record_id, list);
    }
    return map;
  }, [events]);

  // 监控墙：记录 × 事件聚合，风险由切屏/人脸丢失事件数推导（≥3 高风险，1–2 中风险）
  const wall = useMemo<WallStudent[]>(
    () =>
      records.map((r) => {
        const evs = eventsByRecord.get(r.id) ?? [];
        const riskCount = evs.filter((e) => RISK_EVENT_TYPES.has(e.event_type)).length;
        return {
          recordId: r.id,
          studentId: r.student_id,
          name: r.student?.name || r.student?.username || `考生 #${r.student_id}`,
          status: r.status,
          risk: deriveRisk(riskCount),
          riskCount,
          eventCount: evs.length,
          switchCount: r.switch_count ?? evs.filter((e) => e.event_type === 'switch').length,
        };
      }),
    [records, eventsByRecord],
  );

  const visible = useMemo(
    () => (filter === 'all' ? wall : wall.filter((s) => s.risk === FILTER_RISK[filter])),
    [filter, wall],
  );

  const feed = useMemo(
    () =>
      events.map((e) => ({
        id: e.id,
        k: e.event_type === 'face_lost' || e.event_type === 'switch' ? 'danger' : 'warn',
        n: EVENT_LABEL[e.event_type] ?? e.event_type,
        m: `记录 #${e.record_id} · ${e.created_at}${e.handled_action === 'warn' ? ' · 已警告' : e.handled_action === 'normal' ? ' · 已标正常' : ''}`,
      })),
    [events],
  );

  // 处置记录：事件流中 handled_action 非空的事件
  const handled = useMemo(() => events.filter((e) => e.handled_action != null), [events]);

  const submittedCount = useMemo(
    () => records.filter((r) => r.status === 'submitted' || r.status === 'graded').length,
    [records],
  );
  const highRiskCount = useMemo(() => wall.filter((s) => s.risk === '高风险').length, [wall]);
  const midRiskCount = useMemo(() => wall.filter((s) => s.risk === '中风险').length, [wall]);

  const examTitle = exams.find((e) => e.id === examId)?.title ?? '请选择考试';

  const openDrawer = (s: WallStudent) => setSelected(s);

  useEffect(() => {
    if (selected == null) {
      setRecordEvents(null);
      return;
    }
    const recordId = selected.recordId;
    let cancelled = false;
    (async () => {
      try {
        const res = (await axios.get(`/api/records/${recordId}/events`)) as unknown as ApiResponse<
          MonitorEventItem[]
        >;
        if (!cancelled) setRecordEvents(res?.data ?? []);
      } catch {
        if (!cancelled) setRecordEvents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const drawerTimeline = useMemo(() => {
    if (recordEvents == null || recordEvents.length === 0) return [];
    return recordEvents.map((e) => ({
      id: e.id,
      k: (e.event_type === 'face_lost' || e.event_type === 'switch' ? 'danger' : 'warn') as
        | 'danger'
        | 'warn'
        | 'ok',
      n: EVENT_LABEL[e.event_type] ?? e.event_type,
      t: e.created_at,
      m: `记录 #${e.record_id}${e.handled_action === 'warn' ? ' · 已警告' : e.handled_action === 'normal' ? ' · 已标正常' : ''}`,
    }));
  }, [recordEvents]);

  // Drawer 当前记录下首条未处置事件：全处置时返 null，不再回退首条，避免重复 PATCH 已处置事件
  const pendingEvent = useMemo(
    () => recordEvents?.find((e) => e.handled_action == null) ?? null,
    [recordEvents],
  );

  const handleEventAction = async (s: WallStudent, action: 'warn' | 'normal') => {
    const key = String(s.recordId);
    const markLocal = () => {
      if (action === 'warn') {
        setWarnedIds((prev) => (prev.includes(key) ? prev : [...prev, key]));
      } else {
        setNormalIds((prev) => (prev.includes(key) ? prev : [...prev, key]));
      }
    };
    if (examId != null && pendingEvent != null) {
      try {
        await axios.patch(`/api/exams/${examId}/events/${pendingEvent.id}/handle`, { action });
        // 乐观置 handled_action，避免全处置后仍命中旧首条重复 PATCH
        setRecordEvents((prev) =>
          prev ? prev.map((e) => (e.id === pendingEvent.id ? { ...e, handled_action: action } : e)) : prev,
        );
        markLocal();
        message.success(action === 'warn' ? `已向 ${s.name} 发送警告` : `已将 ${s.name} 标记为正常`);
        fetchEvents(examId);
        // 重拉该记录事件流，与后端处置状态对齐
        try {
          const res = (await axios.get(`/api/records/${pendingEvent.record_id}/events`)) as unknown as ApiResponse<
            MonitorEventItem[]
          >;
          if (res?.data) setRecordEvents(res.data);
        } catch {
          // 保持乐观值
        }
        return;
      } catch {
        message.error('处置事件失败');
        return;
      }
    }
    if (pendingEvent == null && recordEvents != null) {
      message.info('暂无待处置事件');
      return;
    }
    message.warning('事件流加载中，请稍后重试');
  };

  const handleWarn = (s: WallStudent) => {
    void handleEventAction(s, 'warn');
  };

  const handleForceSubmit = async (s: WallStudent) => {
    try {
      await axios.post(`/api/records/${s.recordId}/force-submit`);
      message.success(`已对 ${s.name} 下发强制交卷`);
    } catch {
      message.error('强制交卷失败');
    }
  };

  const handleMarkNormal = (s: WallStudent) => {
    void handleEventAction(s, 'normal');
  };

  const handleCloseExam = async () => {
    if (examId == null) {
      message.warning('请先选择考试');
      return;
    }
    try {
      await axios.put(`/api/exams/${examId}/close`);
      message.success('已结束本场考试');
    } catch {
      message.error('结束考试失败');
    }
  };

  const handleAnnounce = async () => {
    const text = announceText.trim();
    if (examId == null) {
      message.warning('请先选择考试');
      return;
    }
    if (!text) {
      message.warning('请填写公告内容');
      return;
    }
    setAnnounceSending(true);
    try {
      const res = (await axios.post(`/api/exams/${examId}/announcements`, {
        message: text,
      })) as unknown as ApiResponse<{ exam_id: number; count: number }>;
      // 空考试 count==0 时后端 201 附注：透出 warning，避免教师误以为下发成功
      const count = res?.data?.count ?? 1;
      if (count === 0) {
        message.warning(res?.message || '考试暂无考生记录，公告未下发给任何人');
      } else {
        message.success(`公告已下发（${count} 人），考生端将全屏展示`);
      }
      setAnnounceOpen(false);
      setAnnounceText('');
    } catch {
      message.error('下发公告失败');
    } finally {
      setAnnounceSending(false);
    }
  };

  const selectedKey = selected ? String(selected.recordId) : null;

  return (
    <div className="mj-proctoring">
      <section className="page-head">
        <div>
          <h1 className="title-lg">考试监控与防作弊</h1>
          <p className="page-sub">{examTitle}</p>
        </div>
        <div className="toolbar">
          <Button onClick={() => setAnnounceOpen(true)}>下发全屏公告</Button>
          <Button danger onClick={() => void handleCloseExam()}>
            结束本场考试
          </Button>
        </div>
      </section>

      {highRiskCount > 0 && (
        <section className="banner banner-warn">
          <span>
            <b>{highRiskCount} 名考生</b> 触发高风险告警（切屏 / 人脸丢失事件≥3 次），建议立即人工复核。
          </span>
        </section>
      )}

      <section className="kpi-grid" aria-label="监控指标">
        <div className="kpi">
          <div className="label">考生记录</div>
          <div className="kpi-num">{records.length}</div>
          <div className="kpi-foot">
            已交卷 <span className="num">{submittedCount}</span> 人 · 作答中{' '}
            <span className="num">{records.length - submittedCount}</span> 人
          </div>
        </div>
        <div className="kpi">
          <div className="label">监控事件</div>
          <div className="kpi-num danger">{events.length}</div>
          <div className="kpi-foot">
            <span className="pill pill-danger">
              <i className="pill-dot" />
              高风险 {highRiskCount}
            </span>
            <span className="pill pill-warn">中风险 {midRiskCount}</span>
          </div>
        </div>
        <div className="kpi">
          <div className="label">已交卷</div>
          <div className="kpi-num">{submittedCount}</div>
          <div className="kpi-foot">含已评分记录</div>
        </div>
        <div className="kpi">
          <div className="label">已处置事件</div>
          <div className="kpi-num">{handled.length}</div>
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
            <div className="label">图例</div>
            <div className="stack-sm legend-list">
              <div className="row">
                <span className="pill pill-danger">
                  <i className="pill-dot" />
                  高风险
                </span>
                <span className="legend-text">切屏 / 人脸丢失事件≥3</span>
              </div>
              <div className="row">
                <span className="pill pill-warn">
                  <i className="pill-dot" />
                  中风险
                </span>
                <span className="legend-text">切屏 / 人脸丢失事件 1–2</span>
              </div>
              <div className="row">
                <span className="pill pill-ok">
                  <i className="pill-dot" />
                  正常
                </span>
                <span className="legend-text">无切屏 / 人脸丢失事件</span>
              </div>
            </div>
          </div>
        </aside>

        <div className="panel">
          <div className="panel-head">
            <div className="row">
              <span className="title-sm">实时监控墙</span>
              <span className="meta">
                {visible.length} / {records.length} 路
              </span>
            </div>
            <div className="row">
              <div className="seg">
                <button type="button" className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
                  全部
                </button>
                <button
                  type="button"
                  className={filter === 'high' ? 'on' : ''}
                  onClick={() => setFilter('high')}
                >
                  高风险
                </button>
                <button type="button" className={filter === 'mid' ? 'on' : ''} onClick={() => setFilter('mid')}>
                  中风险
                </button>
                <button type="button" className={filter === 'ok' ? 'on' : ''} onClick={() => setFilter('ok')}>
                  正常
                </button>
              </div>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => {
                  if (examId == null) return;
                  fetchEvents(examId);
                  fetchRecords(examId);
                }}
              >
                刷新
              </Button>
            </div>
          </div>
          <div className="panel-body">
            {recordsTotal != null && recordsTotal > 100 && <p className="meta">仅显示前 100，共 {recordsTotal} 条</p>}
            {visible.length > 0 ? (
              <div className="wall">
                {visible.map((s) => (
                  <button
                    key={s.recordId}
                    type="button"
                    className={`tile${selected?.recordId === s.recordId ? ' on' : ''}`}
                    onClick={() => openDrawer(s)}
                  >
                    {s.risk !== '正常' && (
                      <span className="tile-flag">
                        {s.risk} · {s.riskCount} 次
                      </span>
                    )}
                    <div className="tile-top">
                      <span className="tile-mono">{s.name.slice(0, 1)}</span>
                      <span className={`pill ${RISK_PILL_CLASS[s.risk]}`}>{s.risk}</span>
                    </div>
                    <div className="tile-bot">
                      <div className="tile-name">{s.name}</div>
                      <div className="tile-id">
                        记录 #{s.recordId} · 事件 {s.eventCount} · {RECORD_STATUS_LABEL[s.status]}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                title={examId == null ? '请先选择考试' : '暂无考生记录'}
                description={examId == null ? undefined : '本场考试暂无考生记录'}
              />
            )}
            <p className="meta wall-note">
              暂无视频流，列表为事件聚合。风险由切屏 / 人脸丢失事件数推导（≥3 高风险，1–2 中风险）。
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
            {eventsTotal != null && eventsTotal > 100 && <p className="meta">仅显示前 100，共 {eventsTotal} 条</p>}
            {feed.length > 0 ? (
              <div className="feed">
                {feed.map((a) => (
                  <div className="feed-item" key={a.id}>
                    <span className={`feed-ico ico-${a.k}`}>{a.k === 'info' ? 'i' : '!'}</span>
                    <div>
                      <div className="feed-t">{a.n}</div>
                      <div className="feed-m">{a.m}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="panel-body">
                <EmptyState title="暂无异常事件" description="本场考试暂无监控事件上报" />
              </div>
            )}
          </div>
          <div className="panel handled-panel">
            <div className="panel-head">
              <span className="title-sm">处置记录</span>
              <span className="meta">今日</span>
            </div>
            <div className="panel-body stack-sm">
              {handled.length > 0 ? (
                handled.map((h) => (
                  <div className="between" key={h.id}>
                    <div>
                      <div className="handled-title">
                        {h.handled_action === 'warn' ? '已发送警告' : '已标记正常'}
                      </div>
                      <div className="meta handled-meta">
                        记录 #{h.record_id} · {h.created_at}
                      </div>
                    </div>
                    <span className="pill pill-info">留档</span>
                  </div>
                ))
              ) : (
                <EmptyState title="暂无处置记录" />
              )}
            </div>
          </div>
        </aside>
      </section>

      <Modal
        title="下发全屏公告"
        open={announceOpen}
        onCancel={() => setAnnounceOpen(false)}
        onOk={() => void handleAnnounce()}
        okText="立即下发"
        cancelText="取消"
        confirmLoading={announceSending}
        destroyOnClose
      >
        <p className="mj-modal-sub">公告将推送给本场全部考生，考生端全屏展示，需手动确认。</p>
        <Input.TextArea
          rows={3}
          maxLength={500}
          showCount
          placeholder="例如：剩余 10 分钟，请检查答题卡后交卷"
          value={announceText}
          onChange={(e) => setAnnounceText(e.target.value)}
        />
      </Modal>

      <Drawer
        title={selected ? `${selected.name} · 记录 #${selected.recordId}` : '考生详情'}
        open={selected != null}
        onClose={() => setSelected(null)}
        width={480}
      >
        {selected && (
          <div className="drawer-stack">
            <p className="meta">
              考生 #{selected.studentId} · 风险等级 {selected.risk}（由切屏 / 人脸丢失事件数推导）
              {selectedKey != null && warnedIds.includes(selectedKey) && ' · 已警告'}
              {selectedKey != null && normalIds.includes(selectedKey) && ' · 已标记正常'}
            </p>
            <div className="answer-grid">
              <div className="answer-box">
                <div className="label">切屏次数</div>
                <div className="answer-val">{selected.switchCount} 次</div>
              </div>
              <div className="answer-box">
                <div className="label">风险事件</div>
                <div className="answer-val">{selected.riskCount} 次</div>
              </div>
              <div className="answer-box">
                <div className="label">监控事件</div>
                <div className="answer-val">{selected.eventCount} 条</div>
              </div>
              <div className="answer-box">
                <div className="label">作答状态</div>
                <div className="answer-val">{RECORD_STATUS_LABEL[selected.status]}</div>
              </div>
            </div>
            <div>
              <div className="label drawer-label">行为时间线</div>
              {recordEvents == null ? (
                <p className="meta">事件流加载中…</p>
              ) : drawerTimeline.length > 0 ? (
                <div className="tl">
                  {drawerTimeline.map((ev) => (
                    <div className={`tl-item ${ev.k}`} key={ev.id}>
                      <div className="tl-t">{ev.n}</div>
                      <div className="tl-m">
                        {ev.t} · {ev.m}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="暂无事件" description="该记录暂无监控事件" />
              )}
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
