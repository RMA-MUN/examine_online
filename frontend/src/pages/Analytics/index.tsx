import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Modal, Select } from 'antd';
import { getExams } from '../../api/exams';
import {
  buildExamReport,
  exportScores,
  getExamAnalytics,
  getExamStudentScores,
} from '../../api/statistics';
import type { QuestionStat, StudentScoreItem } from '../../api/statistics';
import EmptyState from '../../components/EmptyState';
import { downloadDashboardFile } from '../../utils/dashboardExport';
import './index.css';

function qualityOf(p: number): { t: string; c: string } {
  if (p < 0.45) return { t: '偏难', c: 'pill-warn' };
  if (p > 0.85) return { t: '偏易', c: 'pill-info' };
  return { t: '合适', c: 'pill-ok' };
}

const REPORT_ITEMS = [
  '班级成绩单（含排名与分数段）',
  '试题质量分析（难度、区分度）',
  '知识点掌握度分析',
];

// 后端实测形状（backend/app/services/analytics_service.py）：
// knowledge: [{"name", "rate"}]（get_knowledge_stats）；
// classes: [{"class_id", "name", "avg", "pass_rate", "count"}]（get_class_compare）；
// bins: [{"label", "count"}]（get_score_bins）；
// discrimination: [{"question_id", "p", "d"}]（get_discrimination，join 键为 question_id）。
interface KnowledgeStat {
  name: string;
  rate: number;
}

interface ClassStat {
  class_id: number | null;
  name: string;
  avg: number;
  pass_rate: number;
  count: number;
}

interface BinStat {
  label: string;
  count: number;
}

interface DiscriminationStat {
  question_id: number;
  p: number;
  d: number;
}

interface AnalyticsData {
  items: QuestionStat[];
  knowledge: KnowledgeStat[];
  classes: ClassStat[];
  bins: BinStat[];
  discrimination: DiscriminationStat[];
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function normalizeAnalytics(data: unknown): AnalyticsData {
  // include-object 形态为主；兼容不带 include 的纯数组形态（仅 items）。
  if (Array.isArray(data)) {
    return {
      items: data as QuestionStat[],
      knowledge: [],
      classes: [],
      bins: [],
      discrimination: [],
    };
  }
  const obj = (data ?? {}) as Partial<Record<keyof AnalyticsData, unknown>>;
  return {
    items: asArray<QuestionStat>(obj.items),
    knowledge: asArray<KnowledgeStat>(obj.knowledge),
    classes: asArray<ClassStat>(obj.classes),
    bins: asArray<BinStat>(obj.bins),
    discrimination: asArray<DiscriminationStat>(obj.discrimination),
  };
}

// 未分班（class_id 为 null）的下拉 value：后端 class_id 过滤无法表达 NULL，
// 选中时等同于全部（见班级 filter 说明）。
const UNASSIGNED_VALUE = '__unassigned__';

const Analytics = () => {
  const { message } = App.useApp();
  // 考试下拉只用真实 getExams 结果；为空时整页 EmptyState（暂无考试）。
  const [examList, setExamList] = useState<Array<{ id: number; title: string }>>([]);
  const [examTotal, setExamTotal] = useState<number | null>(null);
  const [examId, setExamId] = useState<number | null>(null);
  const [examsLoading, setExamsLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [scores, setScores] = useState<{ total: number; items: StudentScoreItem[] } | null>(null);
  const [classFilter, setClassFilter] = useState<string>('all');
  const [reportOpen, setReportOpen] = useState(false);
  const [checked, setChecked] = useState<boolean[]>([true, true, true]);
  const [exporting, setExporting] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);

  useEffect(() => {
    setExamsLoading(true);
    getExams({ page: 1, page_size: 100 })
      .then((res) => {
        const items = res?.data?.items ?? [];
        setExamTotal(typeof res?.data?.total === 'number' ? res.data.total : items.length);
        if (items.length > 0) {
          setExamList(items.map((e) => ({ id: e.id, title: e.title })));
          setExamId((prev) => prev ?? items[0].id);
        } else {
          setExamList([]);
          setExamId(null);
        }
      })
      .catch(() => {
        message.error('加载考试列表失败');
        setExamList([]);
        setExamId(null);
        setExamTotal(null);
      })
      .finally(() => {
        setExamsLoading(false);
      });
  }, [message]);

  // 真聚合：GET /api/statistics/exam/{id}/questions?include=knowledge,classes,bins,discrimination
  useEffect(() => {
    if (examId == null) {
      setAnalytics(null);
      return;
    }
    setAnalyticsLoading(true);
    getExamAnalytics(examId)
      .then((res) => {
        setAnalytics(normalizeAnalytics((res as { data?: unknown })?.data));
      })
      .catch(() => {
        message.error('加载分析数据失败');
        setAnalytics(null);
      })
      .finally(() => {
        setAnalyticsLoading(false);
      });
  }, [examId, message]);

  // 学生成绩分页支持 class_id（backend/app/services/analytics_service.py get_exam_student_scores）。
  // 班级 filter 只作用于本节（KPI 参考人数）；bins/knowledge/items/classes 仍是全考试口径，
  // 后端暂无按班级切分的聚合接口。
  useEffect(() => {
    if (examId == null) {
      setScores(null);
      return;
    }
    const classIdNum = Number(classFilter);
    const params: { page: number; page_size: number; class_id?: number } = {
      page: 1,
      page_size: 100,
    };
    if (classFilter !== 'all' && classFilter !== UNASSIGNED_VALUE && Number.isFinite(classIdNum)) {
      params.class_id = classIdNum;
    }
    getExamStudentScores(examId, params)
      .then((res) => {
        const data = (res as { data?: { total?: number; items?: StudentScoreItem[] } })?.data;
        setScores({ total: data?.total ?? 0, items: data?.items ?? [] });
      })
      .catch(() => {
        message.error('加载学生成绩失败');
        setScores({ total: 0, items: [] });
      });
  }, [examId, classFilter, message]);

  const items = analytics?.items ?? [];
  const knowledge = analytics?.knowledge ?? [];
  const classes = analytics?.classes ?? [];
  const bins = analytics?.bins ?? [];
  const discrimination = analytics?.discrimination ?? [];

  const total = scores?.total ?? 0;
  // 后端无全卷平均分接口：题目均分 = 各题 avg_score 等权均值，如实标注。
  const topicMean = useMemo(() => {
    if (items.length === 0) return null;
    const sum = items.reduce((acc, q) => acc + (Number(q.avg_score) || 0), 0);
    return (sum / items.length).toFixed(1);
  }, [items]);

  const binsTotal = useMemo(() => bins.reduce((acc, b) => acc + (Number(b.count) || 0), 0), [bins]);
  const maxBin = useMemo(
    () => bins.reduce((m, b) => Math.max(m, Number(b.count) || 0), 0),
    [bins],
  );

  const binRows = useMemo(() => {
    let cum = 0;
    return bins
      .slice()
      .reverse()
      .map((b) => {
        const n = Number(b.count) || 0;
        cum += n;
        return {
          ...b,
          n,
          pct: binsTotal > 0 ? ((n / binsTotal) * 100).toFixed(1) : '0.0',
          cumPct: binsTotal > 0 ? ((cum / binsTotal) * 100).toFixed(1) : '0.0',
        };
      });
  }, [bins, binsTotal]);

  const discMap = useMemo(() => {
    const m = new Map<number, DiscriminationStat>();
    for (const d of discrimination) {
      if (d && typeof d.question_id === 'number') m.set(d.question_id, d);
    }
    return m;
  }, [discrimination]);

  const sortedKnow = useMemo(
    () => knowledge.slice().sort((a, b) => (Number(b.rate) || 0) - (Number(a.rate) || 0)),
    [knowledge],
  );

  const classOptions = useMemo(
    () => [
      { value: 'all', label: '全部班级' },
      ...classes.map((c) => ({
        value: c.class_id != null ? String(c.class_id) : UNASSIGNED_VALUE,
        label: c.name,
      })),
    ],
    [classes],
  );

  const selectedTitle = examList.find((e) => e.id === examId)?.title ?? '';

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await exportScores();
      downloadDashboardFile(response, '成绩单.xlsx');
    } catch {
      message.error('导出成绩单失败');
    } finally {
      setExporting(false);
    }
  };

  const handleReportOk = async () => {
    if (examId == null) {
      message.warning('请先选择考试');
      return;
    }
    const sections: string[] = [];
    if (checked[0]) sections.push('scores');
    if (checked[1]) sections.push('quality');
    if (checked[2]) sections.push('knowledge');
    if (sections.length === 0) {
      message.warning('请至少勾选一项报告内容');
      return;
    }
    setReportBusy(true);
    try {
      const response = await buildExamReport(examId, sections);
      downloadDashboardFile(response, `考试${examId}分析报告.xlsx`);
      setReportOpen(false);
      message.success('报告已生成');
    } catch {
      message.error('生成报告失败');
    } finally {
      setReportBusy(false);
    }
  };

  if (!examsLoading && examList.length === 0) {
    return (
      <div className="mj-analytics">
        <section className="page-head">
          <div>
            <h1 className="title-lg">成绩分析与报表</h1>
          </div>
        </section>
        <EmptyState title="暂无考试" description="发布考试后会显示分析数据" />
      </div>
    );
  }

  return (
    <div className="mj-analytics">
      <section className="page-head">
        <div>
          <h1 className="title-lg">成绩分析与报表</h1>
          <p className="page-sub">
            {selectedTitle}
            {scores != null && <span className="meta">（共 {total} 人参考）</span>}
            {examTotal != null && examTotal > 100 && <span className="meta">仅显示前 100，共 {examTotal} 场考试</span>}
          </p>
        </div>
        <div className="toolbar">
          <Select
            aria-label="选择考试"
            style={{ width: 250 }}
            value={examId ?? undefined}
            onChange={(v) => {
              setExamId(v);
              setClassFilter('all');
            }}
            options={examList.map((e) => ({ value: e.id, label: e.title }))}
          />
          <Select
            aria-label="选择班级"
            style={{ width: 150 }}
            value={classFilter}
            onChange={setClassFilter}
            options={classOptions}
          />
          <Button loading={exporting} onClick={handleExport}>
            导出成绩单
          </Button>
          <Button type="primary" onClick={() => setReportOpen(true)}>
            生成分析报告
          </Button>
        </div>
      </section>

      <section className="kpi-grid" aria-label="成绩指标">
        <div className="kpi">
          <div className="label">参考人数</div>
          <div className="kpi-num">{total}</div>
          <div className="kpi-foot">学生成绩分页总数</div>
        </div>
        <div className="kpi">
          <div className="label">题目数</div>
          <div className="kpi-num">{items.length}</div>
          <div className="kpi-foot">逐题统计覆盖题数</div>
        </div>
        <div className="kpi">
          <div className="label">题目均分</div>
          <div className="kpi-num">{topicMean ?? '—'}</div>
          <div className="kpi-foot">各题平均分等权均值</div>
        </div>
      </section>

      <section className="cols" aria-label="分数分布">
        <div className="panel">
          <div className="panel-head">
            <span className="title-sm">分数段分布</span>
            <span className="meta">共 {binsTotal} 人</span>
          </div>
          <div className="panel-body">
            {bins.length === 0 ? (
              <EmptyState
                title={analyticsLoading ? '加载中...' : '暂无分数段数据'}
                description="有学生成绩后会显示分布"
              />
            ) : (
              <>
                <div className="hist" role="img" aria-label="分数段分布柱状图">
                  {bins.map((b) => {
                    const n = Number(b.count) || 0;
                    return (
                      <div className="col" key={b.label}>
                        <span className="val">{n}</span>
                        <span
                          className={`fill${n === maxBin ? ' peak' : ''}`}
                          style={{ height: `${maxBin > 0 ? Math.max(3, (n / maxBin) * 100) : 3}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="axis-row">
                  {bins.map((b) => (
                    <span className="meta" key={b.label}>
                      {b.label}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <span className="title-sm">分数段明细</span>
            <span className="meta">人数 / 占比</span>
          </div>
          <div className="panel-body flush">
            {bins.length === 0 ? (
              <EmptyState
                title={analyticsLoading ? '加载中...' : '暂无分数段数据'}
                description="有学生成绩后会显示明细"
              />
            ) : (
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>分数段</th>
                    <th className="cell-num">人数</th>
                    <th className="cell-num">占比</th>
                    <th className="cell-num">累计</th>
                  </tr>
                </thead>
                <tbody>
                  {binRows.map((b) => (
                    <tr key={b.label}>
                      <td className="num">{b.label}</td>
                      <td className="cell-num">{b.n}</td>
                      <td className="cell-num">{b.pct}%</td>
                      <td className="cell-num muted">{b.cumPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      <section className="cols" aria-label="题目质量">
        <div className="panel">
          <div className="panel-head">
            <span className="title-sm">题目质量分析</span>
            <span className="meta">难度系数 P · 区分度 D</span>
          </div>
          <div className="panel-body flush">
            {items.length === 0 ? (
              <EmptyState
                title={analyticsLoading ? '加载中...' : '暂无题目统计'}
                description="批改完成后会显示逐题质量"
              />
            ) : (
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>题号</th>
                    <th>题型</th>
                    <th style={{ width: 150 }}>难度系数</th>
                    <th className="cell-num">P</th>
                    <th className="cell-num">D</th>
                    <th className="cell-num">平均得分</th>
                    <th>质量</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((q) => {
                    const p = Number(q.correct_rate) || 0;
                    const d = discMap.get(q.question_id)?.d;
                    const note = qualityOf(p);
                    return (
                      <tr key={q.question_id}>
                        <td className="num">第 {q.question_id} 题</td>
                        <td>{q.type}</td>
                        <td>
                          <div className="hbar-track">
                            <i
                              className={p < 0.45 ? 'low' : p > 0.85 ? '' : 'high'}
                              style={{ width: `${(p * 100).toFixed(0)}%` }}
                            />
                          </div>
                        </td>
                        <td className="cell-num">{p.toFixed(2)}</td>
                        <td className="cell-num">{typeof d === 'number' ? d.toFixed(2) : '—'}</td>
                        <td className="cell-num">{Number(q.avg_score).toFixed(1)}</td>
                        <td>
                          <span className={`pill ${note.c}`}>{note.t}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <span className="title-sm">知识点掌握度</span>
            <span className="meta">按得分率排序</span>
          </div>
          <div className="panel-body stack-sm" style={{ gap: 12 }}>
            {sortedKnow.length === 0 ? (
              <EmptyState
                title={analyticsLoading ? '加载中...' : '暂无知识点数据'}
                description="答卷关联知识点后会显示掌握度"
              />
            ) : (
              sortedKnow.map((k) => {
                const v = Number(k.rate) || 0;
                return (
                  <div key={k.name}>
                    <div className="between" style={{ marginBottom: 6 }}>
                      <span style={{ fontSize: 13 }}>{k.name}</span>
                      <span className="num" style={{ fontSize: 12 }}>
                        {v}%
                      </span>
                    </div>
                    <div className="hbar-track">
                      <i className={v < 65 ? 'low' : 'high'} style={{ width: `${v}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      <section className="cols" aria-label="班级对比">
        <div className="panel">
          <div className="panel-head">
            <span className="title-sm">班级对比</span>
            <span className="meta">平均分 · 及格率</span>
          </div>
          <div className="panel-body stack-sm" style={{ gap: 14 }}>
            {classes.length === 0 ? (
              <EmptyState
                title={analyticsLoading ? '加载中...' : '暂无班级数据'}
                description="学生分班后会显示班级对比"
              />
            ) : (
              classes.map((c) => {
                const avg = Number(c.avg) || 0;
                const pass = Number(c.pass_rate) || 0;
                return (
                  <div key={c.class_id ?? c.name}>
                    <div className="between" style={{ marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                      <span className="meta">
                        {c.count} 人 · 及格率 {pass.toFixed(1)}%
                      </span>
                    </div>
                    <div className="hbar">
                      <div className="hbar-track">
                        <i
                          className="high"
                          style={{ width: `${Math.min(100, Math.max(0, avg))}%` }}
                        />
                      </div>
                      <span className="hbar-val">{avg.toFixed(1)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      <Modal
        title="生成分析报告"
        open={reportOpen}
        onCancel={() => setReportOpen(false)}
        onOk={() => void handleReportOk()}
        okText="开始生成"
        cancelText="取消"
        confirmLoading={reportBusy}
        destroyOnClose
      >
        <p className="mj-modal-sub">将按当前筛选条件生成报告，处理时间约 30 秒。</p>
        {REPORT_ITEMS.map((label, idx) => (
          <label className="check" key={label} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={checked[idx]}
              onChange={(e) =>
                setChecked((prev) => prev.map((v, i) => (i === idx ? e.target.checked : v)))
              }
            />
            {label}
          </label>
        ))}
      </Modal>
    </div>
  );
};

export default Analytics;
