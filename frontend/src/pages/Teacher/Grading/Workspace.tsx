import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Collapse, Input, InputNumber, Space, Spin, Switch, Tag } from 'antd';
import { gradeAnswer, finalizeRecord, retryAiGrading } from '../../../api/grading';
import { shouldShowAiGrading } from '../../../utils/aiGrading';
import { getQuestionTypeMeta } from '../../../constants/questionTypes';
import type { ExamRecord } from '../../../types/record';
import type { Answer, GradeRequest } from '../../../types/answer';
import type { QuestionType } from '../../../types/question';

export type GradingMode = 'by-question' | 'by-student';

interface WorkspaceProps {
  record: ExamRecord | null;
  answers: Answer[];
  loading: boolean;
  selectedIdx: number;
  onSelectIdx: (idx: number) => void;
  onChanged?: () => void;
  onNext?: () => void;
}

export interface ScorePoint {
  id: string;
  label: string;
  score: number;
}

/** 按满分拆出评分点（合计恒等于满分，供 .pt 勾选联动总分）。 */
export const buildPoints = (full: number): ScorePoint[] => {
  if (!full || full <= 0) return [];
  if (full < 5) return [{ id: 'p1', label: '答案正确', score: full }];
  if (full < 10) {
    const first = Math.ceil(full * 0.6);
    return [
      { id: 'p1', label: '关键内容正确', score: first },
      { id: 'p2', label: '表述规范', score: full - first },
    ];
  }
  const p1 = Math.round(full * 0.2);
  const p2 = Math.round(full * 0.33);
  const p3 = Math.round(full * 0.33);
  const p4 = full - p1 - p2 - p3;
  const points: ScorePoint[] = [
    { id: 'p1', label: '关键概念正确', score: p1 },
    { id: 'p2', label: '推导过程完整', score: p2 },
    { id: 'p3', label: '结论正确', score: p3 },
  ];
  if (p4 > 0) points.push({ id: 'p4', label: '表述规范', score: p4 });
  else points[2] = { ...points[2], score: points[2].score + p4 };
  return points;
};

const COMMENT_TEMPLATES = [
  '思路正确，细节可再补充。',
  '过程完整，书写规范。',
  '答案有误，请复习相关知识点。',
];

const clampScore = (value: number | null, full: number) => {
  const v = value ?? 0;
  return Math.max(0, Math.min(full, Math.round(v)));
};

const Workspace = ({ record, answers, loading, selectedIdx, onSelectIdx, onChanged, onNext }: WorkspaceProps) => {
  const { message } = App.useApp();
  const [scores, setScores] = useState<Record<number, number>>({});
  const [correctness, setCorrectness] = useState<Record<number, boolean>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [overrideReasons, setOverrideReasons] = useState<Record<number, string>>({});
  const [checkedPoints, setCheckedPoints] = useState<Record<number, string[]>>({});
  const [comments, setComments] = useState<Record<number, string>>({});

  // 判分输入初始化语义与 GradingDrawer 一致：score 回填、客观题回填正确性
  useEffect(() => {
    const s: Record<number, number> = {};
    const c: Record<number, boolean> = {};
    answers.forEach((a) => {
      s[a.id] = a.score ?? 0;
      c[a.id] = a.is_correct === true;
    });
    setScores(s);
    setCorrectness(c);
  }, [answers]);

  const current: Answer | undefined = answers[selectedIdx];
  const full = current?.question?.score ?? 0;
  const points = useMemo(() => buildPoints(full), [full]);
  const isObjective = current
    ? ['single', 'multiple', 'judge'].includes(current.question?.type ?? '')
    : false;

  const handleSave = async (answer: Answer): Promise<boolean> => {
    setSavingId(answer.id);
    try {
      const objective = ['single', 'multiple', 'judge'].includes(answer.question?.type ?? '');
      const payload: GradeRequest = { score: scores[answer.id] ?? 0 };
      const aiScore = answer.ai_grading?.ai_score;
      if ((answer.question?.type === 'essay' || answer.question?.type === 'blank') && aiScore != null && payload.score !== aiScore) {
        const reason = overrideReasons[answer.id]?.trim();
        if (!reason) {
          message.error('请填写修改原因');
          return false;
        }
        payload.override_reason = reason;
      }
      if (objective) payload.is_correct = correctness[answer.id];
      await gradeAnswer(answer.id, payload);
      message.success('已保存');
      onChanged?.();
      return true;
    } catch (error) {
      message.error('保存失败');
      return false;
    } finally {
      setSavingId(null);
    }
  };

  const handleRetryAiGrading = async (answerId: number) => {
    setSavingId(answerId);
    try {
      await retryAiGrading(answerId);
      message.success('已重新提交 AI 评分');
      onChanged?.();
    } catch {
      message.error('重新 AI 评分失败');
    } finally {
      setSavingId(null);
    }
  };

  const handleAutoGrade = async () => {
    if (!record) return;
    const objective = answers.filter((a) =>
      ['single', 'multiple', 'judge'].includes(a.question?.type ?? '')
    );
    if (objective.length === 0) {
      message.info('没有客观题');
      return;
    }
    const nextScores: Record<number, number> = { ...scores };
    const nextCorrect: Record<number, boolean> = { ...correctness };
    const judgeMap: Record<string, string> = {
      TRUE: '对', FALSE: '错', 正确: '对', 错误: '错',
      T: '对', F: '错', YES: '对', NO: '错', Y: '对', N: '错', 1: '对', 0: '错',
    };
    const normalize = (type: QuestionType, value?: string | null): string => {
      let v = (value == null ? '' : String(value)).trim().toUpperCase();
      if (type === 'multiple') v = v.replace(/[,，\s]+/g, '').split('').sort().join('');
      if (type === 'judge') v = judgeMap[v] || v;
      return v;
    };
    objective.forEach((a) => {
      const type = a.question?.type ?? 'blank';
      const stu = normalize(type, a.student_answer);
      const ans = normalize(type, a.question?.answer);
      const ok = !!stu && stu === ans;
      nextScores[a.id] = ok ? (a.question?.score ?? 0) : 0;
      nextCorrect[a.id] = ok;
    });
    setScores(nextScores);
    setCorrectness(nextCorrect);
    for (const a of objective) {
      try {
        await gradeAnswer(a.id, { score: nextScores[a.id], is_correct: nextCorrect[a.id] });
      } catch (e) {
        // 单题失败不中断，继续其余题目
      }
    }
    message.success(`已自动判分 ${objective.length} 道客观题`);
    onChanged?.();
  };

  const handleFinalize = async () => {
    if (!record) return;
    try {
      await finalizeRecord(record.id);
      message.success('终评成功');
      onChanged?.();
    } catch (error) {
      message.error('终评失败');
    }
  };

  const togglePoint = (answerId: number, pointId: string) => {
    const prev = checkedPoints[answerId] ?? [];
    const next = prev.includes(pointId) ? prev.filter((id) => id !== pointId) : [...prev, pointId];
    setCheckedPoints((p) => ({ ...p, [answerId]: next }));
    const sum = points.filter((pt) => next.includes(pt.id)).reduce((a, x) => a + x.score, 0);
    setScores((p) => ({ ...p, [answerId]: clampScore(sum, full) }));
  };

  const giveFull = () => {
    if (!current) return;
    setCheckedPoints((p) => ({ ...p, [current.id]: points.map((pt) => pt.id) }));
    setScores((p) => ({ ...p, [current.id]: full }));
  };

  const aiScore = current?.ai_grading?.ai_score;
  const confidence = current?.ai_grading?.ai_feedback?.confidence;
  const myScore = current ? (scores[current.id] ?? 0) : 0;
  const diffPct = current && full > 0 && aiScore != null
    ? (Math.abs(myScore - aiScore) / full) * 100
    : null;
  const overThreshold = diffPct != null && diffPct > 10;

  if (!record) {
    return (
      <>
        <div className="stack">
          <div className="panel">
            <div className="panel-body">
              <span className="meta">请先选择考试并挑选阅卷记录</span>
            </div>
          </div>
        </div>
        <div className="stack rail" />
      </>
    );
  }

  return (
    <>
      <div className="stack" data-od-id="paper">
        <div className="panel">
          <div className="panel-head">
            <div>
              <span className="title-sm">
                {record.student?.name || `学生 ${record.student_id}`} · {record.student?.username ?? record.student_id}
              </span>
              <div className="meta">
                交卷 {record.submit_time ? new Date(record.submit_time).toLocaleString() : '-'} · 切屏 {record.switch_count} 次
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <Button
                className="btn btn-secondary btn-sm"
                disabled={selectedIdx <= 0}
                onClick={() => onSelectIdx(selectedIdx - 1)}
              >
                上一份
              </Button>
              <Button
                className="btn btn-secondary btn-sm"
                disabled={selectedIdx >= answers.length - 1}
                onClick={() => onSelectIdx(selectedIdx + 1)}
              >
                下一份
              </Button>
            </div>
          </div>
          <div className="panel-body stack">
            <Spin spinning={loading}>
              {current ? (
                <>
                  <div>
                    <div className="label" style={{ marginBottom: 7 }}>题目</div>
                    <p className="answer-box">
                      <Tag color={getQuestionTypeMeta(current.question?.type).color}>
                        {getQuestionTypeMeta(current.question?.type).text}
                      </Tag>{' '}
                      {current.question?.content}
                      <span className="meta" style={{ marginLeft: 8 }}>（{full} 分）</span>
                    </p>
                  </div>
                  <div>
                    <div className="label" style={{ marginBottom: 7 }}>参考答案</div>
                    <p className="answer-box ref">{current.question?.answer || '（无）'}</p>
                  </div>
                  <div>
                    <div className="label" style={{ marginBottom: 7 }}>考生作答</div>
                    <p className="answer-box">{current.student_answer || '（未作答）'}</p>
                  </div>
                  <div>
                    <div className="label" style={{ marginBottom: 7 }}>机器预判</div>
                    <div className="row-wrap">
                      {aiScore != null && (
                        <span className="pill pill-info"><i className="pill-dot" />AI 预判 {aiScore} 分</span>
                      )}
                      {confidence != null && (
                        <span className="pill pill-neutral">置信度 {confidence}</span>
                      )}
                      {isObjective && (
                        <span className="pill pill-neutral">客观题可自动判分</span>
                      )}
                      {aiScore == null && !isObjective && (
                        <span className="pill pill-neutral">暂无机器预判</span>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <span className="meta">{loading ? '加载中…' : '该记录暂无答案'}</span>
              )}
            </Spin>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="title-sm">双评对比</span>
            {diffPct == null ? (
              <span className="pill pill-neutral">待评分</span>
            ) : (
              <span className={`pill ${overThreshold ? 'pill-warn' : 'pill-ok'}`}>
                <i className="pill-dot" />{overThreshold ? '差异超阈值' : '差异在阈值内'}
              </span>
            )}
          </div>
          <div className="panel-body">
            <div className="cols-2" style={{ gap: 12 }}>
              <div>
                <div className="label">一评 · 本次评分</div>
                <div className="kpi-num" style={{ fontSize: 22, marginTop: 6 }}>{current ? myScore : '—'}</div>
              </div>
              <div>
                <div className="label">二评 · AI 预评</div>
                <div className="kpi-num" style={{ fontSize: 22, marginTop: 6 }}>{aiScore ?? '—'}</div>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="between" style={{ marginBottom: 6 }}>
                <span className="meta">评分差异</span>
                <span className="num meta">{diffPct == null ? '待评分' : `${diffPct.toFixed(1)}%`}</span>
              </div>
              <div className="bar-thick"><i style={{ width: `${diffPct == null ? 0 : Math.min(100, diffPct * 5)}%` }} /></div>
            </div>
          </div>
        </div>
      </div>

      <div className="stack rail" data-od-id="scoring">
        <div className="panel">
          <div className="panel-head">
            <span className="title-sm">评分</span>
            <span className="pill pill-neutral">满分 {full}</span>
          </div>
          <div className="panel-body stack-sm">
            {current ? (
              <>
                <div className="score-box">
                  <InputNumber
                    className="score-input"
                    aria-label="本题得分"
                    min={0}
                    max={full}
                    value={scores[current.id] ?? 0}
                    onChange={(v: number | null) => setScores((p) => ({ ...p, [current.id]: clampScore(v, full) }))}
                  />
                  <span className="muted">/ {full} 分</span>
                  <div className="grow" />
                  <button type="button" className="btn btn-secondary btn-sm" onClick={giveFull}>
                    给满分
                  </button>
                </div>
                <div className="stack-sm" style={{ gap: 6, marginTop: 4 }}>
                  {points.map((pt) => {
                    const on = (checkedPoints[current.id] ?? []).includes(pt.id);
                    return (
                      <button
                        key={pt.id}
                        type="button"
                        className={`pt${on ? ' on' : ''}`}
                        onClick={() => togglePoint(current.id, pt.id)}
                      >
                        <span className="pt-mark">✓</span>
                        <span>{pt.label}</span>
                        <span className="pt-score">{pt.score} 分</span>
                      </button>
                    );
                  })}
                </div>
                <Space align="center" style={{ marginTop: 12 }} wrap>
                  {isObjective && (
                    <>
                      <span>正确</span>
                      <Switch
                        checked={!!correctness[current.id]}
                        onChange={(v: boolean) => setCorrectness((p) => ({ ...p, [current.id]: v }))}
                      />
                    </>
                  )}
                  <Button size="small" onClick={handleAutoGrade}>
                    自动判分客观题
                  </Button>
                  <Button
                    type="primary"
                    size="small"
                    loading={savingId === current.id}
                    onClick={() => handleSave(current)}
                  >
                    保存
                  </Button>
                </Space>
                {shouldShowAiGrading(current) && (
                  <Collapse
                    size="small"
                    style={{ marginTop: 12 }}
                    items={[{
                      key: 'ai-grading',
                      label: `AI 评分依据（${current.ai_grading.grading_source === 'teacher' ? '教师已复核' : current.ai_grading.grading_status}）`,
                      children: current.ai_grading.grading_status === 'failed' ? (
                        <Space direction="vertical">
                          <span>{current.ai_grading.last_error || 'AI 评分失败'}</span>
                          <Button loading={savingId === current.id} onClick={() => handleRetryAiGrading(current.id)}>重新 AI 评分</Button>
                        </Space>
                      ) : (
                        <Space direction="vertical" style={{ width: '100%' }}>
                          <span>AI 得分：{current.ai_grading.ai_score ?? '-'} / {current.question.score}</span>
                          <span>置信度：{current.ai_grading.ai_feedback?.confidence ?? '-'}</span>
                          <span>{current.ai_grading.ai_feedback?.reasoning || '评分中'}</span>
                          {current.ai_grading.ai_feedback?.criterion_results?.map((item) => (
                            <div key={item.criterion_id}>{item.criterion_id}: {item.score} 分，{item.reason}</div>
                          ))}
                        </Space>
                      ),
                    }]}
                  />
                )}
                {(current.question?.type === 'essay' || current.question?.type === 'blank') && aiScore != null && scores[current.id] !== aiScore && (
                  <Input.TextArea
                    aria-label="修改原因"
                    value={overrideReasons[current.id]}
                    onChange={(event) => setOverrideReasons((previous) => ({ ...previous, [current.id]: event.target.value }))}
                    placeholder="修改原因"
                    rows={2}
                    style={{ marginTop: 8 }}
                  />
                )}
              </>
            ) : (
              <span className="meta">暂无可评分题目</span>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><span className="title-sm">评语</span></div>
          <div className="panel-body stack-sm">
            <div className="row-wrap">
              {COMMENT_TEMPLATES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="chip"
                  onClick={() => {
                    if (!current) return;
                    setComments((p) => ({ ...p, [current.id]: p[current.id] ? `${p[current.id].replace(/\s*$/, '')} ${t}` : t }));
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="field">
              <label htmlFor="mj-grading-comment">评语内容（学生可见）</label>
              <textarea
                className="textarea"
                id="mj-grading-comment"
                rows={4}
                placeholder="填写针对本题的批改说明"
                value={current ? (comments[current.id] ?? '') : ''}
                onChange={(e) => {
                  if (!current) return;
                  setComments((p) => ({ ...p, [current.id]: e.target.value }));
                }}
              />
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-body stack-sm">
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={!current}
              onClick={async () => {
                if (!current) return;
                const ok = await handleSave(current);
                if (ok) onNext?.();
              }}
            >
              提交并下一篇
            </button>
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn btn-secondary grow"
                disabled={!current}
                onClick={() => {
                  message.info('已标记仲裁，等待复核');
                  onNext?.();
                }}
              >
                标记仲裁
              </button>
              <button
                type="button"
                className="btn btn-secondary grow"
                disabled={!current}
                onClick={() => onNext?.()}
              >
                跳过
              </button>
            </div>
            <button type="button" className="btn btn-secondary btn-block" disabled={!current} onClick={handleFinalize}>
              终评
            </button>
            <p className="meta" style={{ textAlign: 'center' }}>快捷键：Enter 提交并下一篇 · 1–9 勾选评分点</p>
          </div>
        </div>
      </div>
    </>
  );
};

export default Workspace;
