import React, { useEffect, useState } from 'react';
import { App, Table, Button, Select, Space, Modal } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useSearchParams } from 'react-router-dom';
import { getExams } from '../../../api/exams';
import { getExamRecords, getRecordAnswers } from '../../../api/grading';
import { getGradingStats } from '../../../api/statistics';
import type { GradingStats } from '../../../api/statistics';
import type { Exam } from '../../../types/exam';
import type { ExamRecord, RecordStatus } from '../../../types/record';
import type { Answer } from '../../../types/answer';
import StatusTag from '../../../components/StatusTag';
import Workspace, { type GradingMode } from './Workspace';
import './index.css';

const statusText: Record<RecordStatus, string> = {
  submitted: '待阅',
  graded: '已阅',
  ongoing: '作答中',
};

const Grading = () => {
  const { message } = App.useApp();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<GradingMode>('by-question');
  const [rulesOpen, setRulesOpen] = useState(false);
  const [exams, setExams] = useState<Exam[]>([]);
  const [examsTotal, setExamsTotal] = useState<number | null>(null);
  const [examId, setExamId] = useState<number | null>(null);
  const [records, setRecords] = useState<ExamRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [answersLoading, setAnswersLoading] = useState(false);
  const [selectedQuestionIdx, setSelectedQuestionIdx] = useState(0);
  const [gradingStats, setGradingStats] = useState<GradingStats | null>(null);

  useEffect(() => {
    getExams({ page_size: 100 })
      .then((res) => {
        const items = res.data.items || [];
        setExams(items);
        setExamsTotal(typeof res.data.total === 'number' ? res.data.total : items.length);
      })
      .catch(() => message.error('获取考试列表失败'));
  }, [message]);

  useEffect(() => {
    const urlExamId = searchParams.get('examId');
    if (urlExamId) setExamId(Number(urlExamId));
  }, [searchParams]);

  const fetchRecords = async (exam: number, p: number, ps: number) => {
    setRecordsLoading(true);
    try {
      const res = await getExamRecords(exam, { page: p, page_size: ps });
      const items = res.data.items || [];
      setRecords(items);
      setTotal(res.data.total || 0);
      setSelectedRecordId((prev) => {
        if (prev != null && items.some((r) => r.id === prev)) return prev;
        return items[0]?.id ?? null;
      });
    } catch (error) {
      message.error('获取考试记录失败');
    } finally {
      setRecordsLoading(false);
    }
  };

  useEffect(() => {
    if (examId) fetchRecords(examId, page, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, page, pageSize]);

  useEffect(() => {
    if (!examId) {
      setGradingStats(null);
      return;
    }
    let cancelled = false;
    getGradingStats(examId)
      .then((res) => {
        if (!cancelled) setGradingStats(res.data);
      })
      .catch(() => {
        if (!cancelled) setGradingStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [examId]);

  const selectedRecord: ExamRecord | null =
    records.find((r) => r.id === selectedRecordId) ?? records[0] ?? null;

  useEffect(() => {
    if (!selectedRecord) {
      setAnswers([]);
      setSelectedQuestionIdx(0);
      return;
    }
    let cancelled = false;
    setAnswersLoading(true);
    getRecordAnswers(selectedRecord.id)
      .then((res) => {
        if (cancelled) return;
        setAnswers(res.data || []);
        setSelectedQuestionIdx(0);
      })
      .catch(() => {
        if (!cancelled) setAnswers([]);
      })
      .finally(() => {
        if (!cancelled) setAnswersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRecord?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNext = () => {
    if (selectedQuestionIdx < answers.length - 1) {
      setSelectedQuestionIdx(selectedQuestionIdx + 1);
      return;
    }
    const idx = records.findIndex((r) => r.id === selectedRecord?.id);
    const next = records[idx + 1];
    if (next) setSelectedRecordId(next.id);
  };

  const columns: ColumnsType<ExamRecord> = [
    { title: '学生姓名', dataIndex: ['student', 'name'], key: 'student_name' },
    { title: '用户名', dataIndex: ['student', 'username'], key: 'username' },
    { title: '邮箱', dataIndex: ['student', 'email'], key: 'email' },
    { title: '得分', dataIndex: 'score', key: 'score', width: 80 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: RecordStatus) => <StatusTag status={s} />,
    },
    { title: '切屏次数', dataIndex: 'switch_count', key: 'switch_count', width: 100 },
    {
      title: '提交时间',
      dataIndex: 'submit_time',
      key: 'submit_time',
      render: (v?: string) => (v ? new Date(v).toLocaleString() : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Space>
          <Button type="link" onClick={() => setSelectedRecordId(record.id)}>
            阅卷
          </Button>
        </Space>
      ),
    },
  ];

  const selectedExam = exams.find((e) => e.id === examId) ?? null;
  const examTitle = selectedExam?.title ?? '未选择考试';
  const pending = records.filter((r) => r.status !== 'graded').length;
  const done = records.filter((r) => r.status === 'graded').length;
  const progressPct = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  const headTitle = mode === 'by-question'
    ? `《${examTitle}》· 第 ${selectedQuestionIdx + 1} 题`
    : `《${examTitle}》· ${selectedRecord?.student?.name ?? '—'}`;
  const currentAnswer = answers[selectedQuestionIdx];

  return (
    <div className="mj-grading">
      <div className="topbar">
        <span className="crumb">考试运行 / <b>教师阅卷端</b></span>
        <div className="grow" />
        <div className="seg" role="tablist" aria-label="阅卷模式">
          <button
            type="button"
            role="tab"
            data-mode="by-question"
            className={mode === 'by-question' ? 'on' : ''}
            onClick={() => setMode('by-question')}
          >
            按题阅卷
          </button>
          <button
            type="button"
            role="tab"
            data-mode="by-student"
            className={mode === 'by-student' ? 'on' : ''}
            onClick={() => setMode('by-student')}
          >
            按人阅卷
          </button>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRulesOpen(true)}>
          阅卷规则
        </button>
      </div>

      <section className="page-head">
        <div>
          <h1 className="title-lg">{headTitle}</h1>
          <p className="page-sub">
            {currentAnswer
              ? `${currentAnswer.question?.content?.slice(0, 24) ?? ''} · 满分 ${currentAnswer.question?.score ?? 0} 分 · AI预评仅供参考`
              : '简答题 · AI预评仅供参考'}
          </p>
        </div>
        <div className="toolbar">
          <span className="pill pill-info"><i className="pill-dot" />批次：{examTitle} · {total} 份</span>
        </div>
      </section>

      <section className="kpi-grid" aria-label="阅卷指标">
        <div className="kpi">
          <div className="label">待阅份数</div>
          <div className="kpi-num">{pending}</div>
        </div>
        <div className="kpi">
          <div className="label">已阅份数</div>
          <div className="kpi-num">{done}</div>
          <div className="kpi-foot">今日进度 <span className="num">{progressPct.toFixed(1)}%</span></div>
        </div>
        <div className="kpi">
          <div className="label">平均用时</div>
          <div className="kpi-num">
            {gradingStats?.avg_seconds_per_record != null
              ? <>{Math.round(gradingStats.avg_seconds_per_record)}<span style={{ fontSize: 15, fontWeight: 500 }}>秒 / 份</span></>
              : '—'}
          </div>
        </div>
        <div className="kpi">
          <div className="label">双评一致性</div>
          <div className="kpi-num">
            {gradingStats?.consistency_rate != null
              ? <>{(gradingStats.consistency_rate * 100).toFixed(1)}<span style={{ fontSize: 15, fontWeight: 500 }}>%</span></>
              : '—'}
          </div>
        </div>
      </section>

      <section className="cols-3" data-od-id="grading-workspace">
        <div className="panel rail" data-od-id="queue">
          <div className="panel-head">
            <span className="title-sm">阅卷队列</span>
            <span className="pill pill-neutral">
              {mode === 'by-question' ? `${answers.length} 题` : `${pending} 待阅`}
            </span>
          </div>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
            <div className="between" style={{ marginBottom: 6 }}>
              <span className="meta">批次进度</span>
              <span className="num meta">{done} / {total}</span>
            </div>
            <div className="bar-thick"><i style={{ width: `${progressPct}%` }} /></div>
          </div>
          <div className="panel-body flush">
            {mode === 'by-student'
              ? records.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`queue-item${r.id === selectedRecord?.id ? ' on' : ''}`}
                  onClick={() => setSelectedRecordId(r.id)}
                >
                  <span className="avatar" style={{ width: 26, height: 26, fontSize: 10 }}>
                    {(r.student?.name ?? '?').slice(0, 1)}
                  </span>
                  <span>
                    <span className="queue-name">{r.student?.name ?? `学生 ${r.student_id}`}</span>
                    <span className="queue-meta">{r.student?.username ?? ''} · {statusText[r.status]}</span>
                  </span>
                  <span className={`pill ${r.status === 'graded' ? 'pill-ok' : 'pill-warn'}`}>
                    <i className="pill-dot" />{r.id === selectedRecord?.id ? '当前' : statusText[r.status]}
                  </span>
                </button>
              ))
              : answers.map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  className={`queue-item${i === selectedQuestionIdx ? ' on' : ''}`}
                  onClick={() => setSelectedQuestionIdx(i)}
                >
                  <span className="avatar" style={{ width: 26, height: 26, fontSize: 10 }}>
                    {i + 1}
                  </span>
                  <span>
                    <span className="queue-name">第 {i + 1} 题 · {a.question?.score ?? 0} 分</span>
                    <span className="queue-meta">{(a.question?.content ?? '').slice(0, 18) || '（无题干）'}</span>
                  </span>
                  <span className="pill pill-neutral"><i className="pill-dot" />{i === selectedQuestionIdx ? '当前' : '待阅'}</span>
                </button>
              ))}
            {mode === 'by-student' && records.length === 0 && (
              <div style={{ padding: 16 }}><span className="meta">{examId ? '该考试暂无记录' : '请先选择考试'}</span></div>
            )}
            {mode === 'by-question' && answers.length === 0 && (
              <div style={{ padding: 16 }}><span className="meta">{selectedRecord ? '该记录暂无题目' : '请先选择考试与记录'}</span></div>
            )}
          </div>
        </div>

        <Workspace
          record={selectedRecord}
          answers={answers}
          loading={answersLoading}
          selectedIdx={Math.min(selectedQuestionIdx, Math.max(0, answers.length - 1))}
          onSelectIdx={setSelectedQuestionIdx}
          onChanged={() => {
            if (examId) fetchRecords(examId, page, pageSize);
          }}
          onNext={handleNext}
        />
      </section>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <span className="title-sm">考试与记录（队列数据源）</span>
        </div>
        <div className="panel-body">
          <Space style={{ marginBottom: 16 }}>
            <span>选择考试：</span>
            {examsTotal != null && examsTotal > 100 && <span className="meta">仅显示前 100，共 {examsTotal} 场考试</span>}
            <Select
              style={{ width: 280 }}
              placeholder="请选择考试"
              value={examId}
              onChange={(v: number) => {
                setExamId(v);
                setPage(1);
              }}
              options={exams.map((e) => ({ label: `${e.title}（ID: ${e.id}）`, value: e.id }))}
              showSearch
              optionFilterProp="label"
            />
          </Space>
          <Table
            columns={columns}
            dataSource={records}
            loading={recordsLoading}
            rowKey="id"
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showTotal: (t: number) => `共 ${t} 条`,
              onChange: (p: number, ps: number) => { setPage(p); setPageSize(ps); },
            }}
            locale={{ emptyText: examId ? '该考试暂无记录' : '请先选择考试' }}
          />
        </div>
      </div>

      <Modal
        title="阅卷规则"
        open={rulesOpen}
        onCancel={() => setRulesOpen(false)}
        footer={[
          <Button key="ok" type="primary" onClick={() => setRulesOpen(false)}>
            知道了
          </Button>,
        ]}
      >
        <ol style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li>客观题（单选 / 多选 / 判断）支持一键自动判分。</li>
          <li>主观题 AI 预评仅供参考，修改 AI 评分须填写修改原因。</li>
          <li>AI 预评仅供参考，教师复核为准。</li>
          <li>终评后记录锁定，如需修改请联系考务管理员。</li>
        </ol>
      </Modal>
    </div>
  );
};

export default Grading;
