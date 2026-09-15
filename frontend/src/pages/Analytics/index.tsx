import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Modal, Select } from 'antd';
import { getExams } from '../../api/exams';
import { buildExamReport, exportScores, getExamQuestionStats, getExamStudentScores } from '../../api/statistics';
import { downloadDashboardFile } from '../../utils/dashboardExport';
import { ANALYTICS_EXAMS, MOCK_ANALYTICS, type AnalyticsExamKey } from '../../mocks/analytics';
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
  '考生个人成绩证明（PDF）',
];

const Analytics = () => {
  const { message } = App.useApp();
  // 真实考试下拉（GET /api/exams）优先；失败回退 examKey mock
  const [examList, setExamList] = useState<Array<{ id: number; title: string }>>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [liveNote, setLiveNote] = useState<string | null>(null);
  const [examKey, setExamKey] = useState<AnalyticsExamKey>(() => {
    try {
      const saved = window.localStorage.getItem('mingjian.analytics.exam');
      return saved === 'eng' ? 'eng' : 'dsa';
    } catch {
      return 'dsa';
    }
  });
  const [classFilter, setClassFilter] = useState<string>('all');
  const [reportOpen, setReportOpen] = useState(false);
  const [checked, setChecked] = useState<boolean[]>([true, true, true, false]);
  const [exporting, setExporting] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);

  // TODO(Task4): 图表仍渲染 MOCK_ANALYTICS 演示数据；examId 对齐 + questions/students 连通性已验证，
  // 全量图形切真实聚合（知识点/班级/分数段/D值）待 Task 4 落地。
  const data = MOCK_ANALYTICS[examKey];
  const maxBin = useMemo(() => Math.max(...data.bins.map((b) => b.n)), [data]);

  useEffect(() => {
    getExams({ page: 1, page_size: 100 })
      .then((res) => {
        const items = res?.data?.items ?? [];
        if (items.length > 0) {
          setExamList(items.map((e) => ({ id: e.id, title: e.title })));
          setExamId((prev) => prev ?? items[0].id);
        }
      })
      .catch(() => {
        // 后端不可用时静默回退到 mock 考试下拉
      });
  }, []);

  useEffect(() => {
    if (examId == null) return;
    (async () => {
      try {
        const [qStats, sScores] = await Promise.all([
          getExamQuestionStats(examId),
          getExamStudentScores(examId, { page: 1, page_size: 1 }),
        ]);
        const qn = Array.isArray((qStats as unknown as { data: unknown[] })?.data)
          ? ((qStats as unknown as { data: unknown[] }).data.length)
          : 0;
        const total = (sScores as unknown as { data?: { total?: number } })?.data?.total ?? 0;
        setLiveNote(`连通性已验证：${qn} 题 · ${total} 人（图表仍为演示数据，待 Task4 对接）`);
      } catch {
        // 统计接口失败时回退 mock 展示
        setLiveNote(null);
      }
    })();
  }, [examId]);

  const binRows = useMemo(() => {
    let cum = 0;
    return data.bins
      .slice()
      .reverse()
      .map((b) => {
        cum += b.n;
        return {
          ...b,
          pct: ((b.n / data.total) * 100).toFixed(1),
          cumPct: ((cum / data.total) * 100).toFixed(1),
        };
      });
  }, [data]);

  const classOptions = useMemo(
    () => [{ value: 'all', label: '全部班级' }, ...data.classes.map((c) => ({ value: c.n, label: c.n }))],
    [data],
  );

  const handleExamChange = (v: AnalyticsExamKey) => {
    setExamKey(v);
    setClassFilter('all');
    try {
      window.localStorage.setItem('mingjian.analytics.exam', v);
    } catch {
      /* localStorage 不可用时仅本次生效 */
    }
  };

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
      // 后端不可用（mock 考试下拉）时保持本地演示行为
      setReportOpen(false);
      message.success('已开始生成报告（演示）');
      return;
    }
    const sections: string[] = [];
    if (checked[0]) sections.push('scores');
    if (checked[1]) sections.push('quality');
    if (checked[2]) sections.push('knowledge');
    if (sections.length === 0) {
      message.warning('请至少勾选一项报告内容（PDF 证明暂不支持导出）');
      return;
    }
    setReportBusy(true);
    try {
      const response = await buildExamReport(examId, sections);
      downloadDashboardFile(response, `考试${examId}分析报告.xlsx`);
      if (checked[3]) message.info('考生个人成绩证明（PDF）暂不支持，本次仅导出 xlsx 部分');
      setReportOpen(false);
      message.success('报告已生成');
    } catch {
      message.error('生成报告失败');
    } finally {
      setReportBusy(false);
    }
  };

  return (
    <div className="mj-analytics">
      <section className="page-head">
        <div>
          <h1 className="title-lg">成绩分析与报表</h1>
          <p className="page-sub">
            {data.meta}
            {liveNote != null && <span className="meta">（{liveNote}）</span>}
          </p>
        </div>
        <div className="toolbar">
          {examList.length > 0 ? (
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
          ) : (
            <Select
              aria-label="选择考试"
              style={{ width: 250 }}
              value={examKey}
              onChange={handleExamChange}
              options={ANALYTICS_EXAMS}
            />
          )}
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
          <div className="label">平均分</div>
          <div className="kpi-num">{data.kpi.avg}</div>
          <div className="kpi-foot">
            满分 <span className="num">{data.kpi.full}</span> 分
          </div>
        </div>
        <div className="kpi">
          <div className="label">及格率</div>
          <div className="kpi-num">
            {data.kpi.pass}
            <span style={{ fontSize: 15, fontWeight: 500 }}>%</span>
          </div>
          <div className="kpi-foot">
            <span className="pill pill-ok">
              <i className="pill-dot" />
              高于目标 6.7 个百分点
            </span>
          </div>
        </div>
        <div className="kpi">
          <div className="label">最高分 / 最低分</div>
          <div className="kpi-num" style={{ fontSize: 24 }}>
            {data.kpi.max}
            <span className="muted" style={{ fontSize: 16 }}>
              {' / '}
            </span>
            {data.kpi.min}
          </div>
          <div className="kpi-foot">
            极差 <span className="num">{data.kpi.range}</span> 分
          </div>
        </div>
        <div className="kpi">
          <div className="label">标准差</div>
          <div className="kpi-num">{data.kpi.sd}</div>
          <div className="kpi-foot">分数离散度中等</div>
        </div>
      </section>

      <section className="cols" aria-label="分数分布">
        <div className="panel">
          <div className="panel-head">
            <span className="title-sm">分数段分布</span>
            <span className="meta">共 {data.total} 人</span>
          </div>
          <div className="panel-body">
            <div className="hist" role="img" aria-label="分数段分布柱状图">
              {data.bins.map((b) => (
                <div className="col" key={b.l}>
                  <span className="val">{b.n}</span>
                  <span
                    className={`fill${b.n === maxBin ? ' peak' : ''}`}
                    style={{ height: `${Math.max(3, (b.n / maxBin) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="axis-row">
              {data.bins.map((b) => (
                <span className="meta" key={b.l}>
                  {b.l}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <span className="title-sm">分数段明细</span>
            <span className="meta">人数 / 占比</span>
          </div>
          <div className="panel-body flush">
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
                  <tr key={b.l}>
                    <td className="num">{b.l}</td>
                    <td className="cell-num">{b.n}</td>
                    <td className="cell-num">{b.pct}%</td>
                    <td className="cell-num muted">{b.cumPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                {data.questions.map((q) => {
                  const note = qualityOf(q.p);
                  return (
                    <tr key={q.no}>
                      <td className="num">第 {q.no} 题</td>
                      <td>{q.type}</td>
                      <td>
                        <div className="hbar-track">
                          <i
                            className={q.p < 0.45 ? 'low' : q.p > 0.85 ? '' : 'high'}
                            style={{ width: `${(q.p * 100).toFixed(0)}%` }}
                          />
                        </div>
                      </td>
                      <td className="cell-num">{q.p.toFixed(2)}</td>
                      <td className="cell-num">{q.d.toFixed(2)}</td>
                      <td className="cell-num">
                        {q.avg} / {q.full}
                      </td>
                      <td>
                        <span className={`pill ${note.c}`}>{note.t}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <span className="title-sm">知识点掌握度</span>
            <span className="meta">按得分率排序</span>
          </div>
          <div className="panel-body stack-sm" style={{ gap: 12 }}>
            {data.know.map((k) => (
              <div key={k.n}>
                <div className="between" style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 13 }}>{k.n}</span>
                  <span className="num" style={{ fontSize: 12 }}>
                    {k.v}%
                  </span>
                </div>
                <div className="hbar-track">
                  <i className={k.v < 65 ? 'low' : 'high'} style={{ width: `${k.v}%` }} />
                </div>
              </div>
            ))}
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
            {data.classes.map((c) => (
              <div key={c.n}>
                <div className="between" style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{c.n}</span>
                  <span className="meta">
                    {c.n2} 人 · 及格率 {c.pass.toFixed(1)}%
                  </span>
                </div>
                <div className="hbar">
                  <div className="hbar-track">
                    <i className="high" style={{ width: `${c.avg}%` }} />
                  </div>
                  <span className="hbar-val">{c.avg.toFixed(1)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <span className="title-sm">成绩发布</span>
          </div>
          <div className="panel-body stack-sm">
            <div className="between">
              <span style={{ fontSize: 13 }}>成绩单推送</span>
              <span className="pill pill-ok">
                <i className="pill-dot" />
                已开启
              </span>
            </div>
            <div className="between">
              <span style={{ fontSize: 13 }}>学生端可见</span>
              <span className="pill pill-neutral">阅卷全部完成后</span>
            </div>
            <div className="between">
              <span style={{ fontSize: 13 }}>申诉窗口</span>
              <span className="num meta">成绩发布后 5 个工作日</span>
            </div>
            <div className="between">
              <span style={{ fontSize: 13 }}>教务系统同步</span>
              <span className="pill pill-info">
                <i className="pill-dot" />
                待同步
              </span>
            </div>
            <div className="between">
              <span style={{ fontSize: 13 }}>已生成报表</span>
              <span className="num meta">班级成绩单 / 试题分析 / 试卷原卷</span>
            </div>
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
