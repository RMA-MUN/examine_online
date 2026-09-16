import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { App, Button, Modal } from 'antd';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { getExam, getPaper, saveAnswers, submitExam, recordSwitch, getSwitchStatus, reportEvent, getAnnouncements } from '../../../api/exams';
import QuestionRenderer from '../../../components/QuestionRenderer';
import EmptyState from '../../../components/EmptyState';
import useAuthStore from '../../../store/auth';
import type { Exam } from '../../../types/exam';
import type { Paper } from '../../../types/record';
import type { AnswerValue } from '../../../types/answer';
import type { QuestionType } from '../../../types/question';
import { countAnswered, isQuestionAnswered } from './utils';
import './index.css';

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const formatClock = (d: Date) => {
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const AUTO_ADVANCE_TYPES: QuestionType[] = ['single', 'multiple', 'judge'];

const TYPE_TEXT: Record<QuestionType, string> = {
  single: '单选题',
  multiple: '多选题',
  judge: '判断题',
  blank: '填空题',
  essay: '简答题',
};

const TYPE_ORDER: QuestionType[] = ['single', 'multiple', 'judge', 'blank', 'essay'];

const ExamTaking = () => {
  const { message } = App.useApp();
  const { examId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const [paper, setPaper] = useState<Paper | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(false);
  const [marked, setMarked] = useState<number[]>([]);
  const [switchCount, setSwitchCount] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [online, setOnline] = useState(
    () => (typeof navigator !== 'undefined' ? navigator.onLine : true)
  );
  // 全屏公告：轮询 GET /api/exams/{id}/announcements，未见过的公告全屏 Modal 展示
  // 已见 id 用 ref 去重（updater 保持纯函数，避免 StrictMode 双调重复弹公告）
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(null);
  const seenNoticeIds = useRef<Set<number>>(new Set());
  const [timeLeft, setTimeLeft] = useState(() => {
    const duration = (location.state as { duration?: number } | null)?.duration;
    return duration ? duration * 60 : 0;
  });

  // 切屏计数 hydration：挂载时以后端 switch-status 为准，失败回退 0；上报路径不变
  useEffect(() => {
    let cancelled = false;
    getSwitchStatus(Number(examId))
      .then((res) => {
        const count = (res.data as { switch_count?: number } | null | undefined)?.switch_count;
        if (!cancelled && typeof count === 'number') setSwitchCount(count);
      })
      .catch(() => {
        /* 后端不可用时保持初始 0，仅展示用 */
      });
    return () => {
      cancelled = true;
    };
  }, [examId]);

  // 切屏检测(原逻辑)：上报补全——recordSwitch 计数 + events 明细双写，任一失败都不阻塞作答
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden) {
        setSwitchCount((c) => c + 1);
        try {
          await recordSwitch(Number(examId));
        } catch {
          /* 后端不可用时忽略，仅展示用 */
        }
        try {
          await reportEvent(Number(examId), 'switch');
        } catch {
          /* 明细上报失败不阻塞作答 */
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [examId]);

  // 网络状态仅用于顶栏展示，不影响作答流程
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // 全屏公告轮询（10s）：仅展示未见过的新公告，失败静默（不阻塞作答）
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await getAnnouncements(Number(examId));
        if (cancelled) return;
        const items = res?.data ?? [];
        const fresh = items.find(
          (a) => a.event_type === 'announcement' && !seenNoticeIds.current.has(a.id)
        );
        if (fresh) {
          seenNoticeIds.current.add(fresh.id);
          const text =
            typeof fresh.detail?.message === 'string' ? fresh.detail.message : '请注意考试安排';
          setNotice({ id: fresh.id, message: text });
        }
      } catch {
        /* 公告不可用时静默，作答不受影响 */
      }
    };
    poll();
    const timer = window.setInterval(poll, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [examId]);

  const handleSubmit = useCallback(async () => {
    const total = paper?.questions.length ?? 0;
    const answered = countAnswered(answers, paper?.questions.map((q) => q.id) ?? []);
    const unanswered = total - answered;
    Modal.confirm({
      title: '确认交卷？',
      content: `已答 ${answered} / 共 ${total} 题${unanswered > 0 ? `,还有 ${unanswered} 题未作答` : ''}${marked.length > 0 ? `,已标记 ${marked.length} 题` : ''},交卷后将无法修改答案`,
      okButtonProps: unanswered > 0 ? { danger: true } : undefined,
      onOk: async () => {
        setLoading(true);
        try {
          const res = await submitExam(Number(examId), answers);
          message.success(`交卷成功，得分：${res.data.score}`);
          navigate('/my-records');
        } catch (error) {
          message.error('交卷失败');
        } finally {
          setLoading(false);
        }
      },
    });
  }, [examId, answers, navigate, message, paper, marked]);

  // 倒计时(原逻辑)
  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft, handleSubmit]);

  // 自动保存(原逻辑,30s)
  useEffect(() => {
    const timer = setInterval(async () => {
      if (Object.keys(answers).length > 0) {
        await saveAnswers(Number(examId), answers);
        setLastSavedAt(new Date());
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [answers, examId]);

  useEffect(() => {
    const fetchPaper = async () => {
      try {
        const res = await getPaper(Number(examId));
        if (!res.data) {
          setLoadError(res.message || '获取试卷失败');
          return;
        }
        setPaper(res.data);
        setAnswers(res.data.saved_answers || {});
        setLoadError(null);
      } catch (error) {
        setLoadError('获取试卷失败');
      }
    };
    fetchPaper();
  }, [examId, message]);

  // 考试元信息仅用于顶栏/须知展示，失败则回退默认文案，不阻塞作答
  useEffect(() => {
    const fetchExam = async () => {
      try {
        const res = await getExam(Number(examId));
        if (res.code === 200 && res.data) {
          setExam(res.data);
        }
      } catch (error) {
        setExam(null);
      }
    };
    fetchExam();
  }, [examId]);

  const handleAnswerChange = (questionId: number, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const toggleMark = (questionId: number) => {
    setMarked((prev) =>
      prev.includes(questionId) ? prev.filter((id) => id !== questionId) : [...prev, questionId]
    );
  };

  const questionIds = useMemo(() => paper?.questions.map((q) => q.id) ?? [], [paper]);
  const answeredCount = countAnswered(answers, questionIds);
  const total = questionIds.length;
  const currentQuestion = paper?.questions[current];
  const warn = timeLeft <= 600;
  const maxSwitch = exam?.max_switch ?? null;
  const switchDanger = maxSwitch !== null && switchCount >= maxSwitch;
  const isMarked = currentQuestion ? marked.includes(currentQuestion.id) : false;

  const typeSummary = useMemo(
    () =>
      TYPE_ORDER.map((t) => ({
        type: t,
        items: paper?.questions.filter((q) => q.type === t) ?? [],
      }))
        .filter((g) => g.items.length > 0)
        .map((g) => ({
          type: g.type,
          count: g.items.length,
          score: g.items.reduce((s, q) => s + q.score, 0),
        })),
    [paper]
  );

  if (!paper) {
    if (loadError) {
      return (
        <EmptyState
          title="无法进入考试"
          description={loadError}
          action={
            <Button type="primary" onClick={() => navigate(-1)}>
              返回
            </Button>
          }
        />
      );
    }
    return null;
  }

  const autoAdvance = (q: { id: number; type: QuestionType }, value: AnswerValue) => {
    handleAnswerChange(q.id, value);
    if (AUTO_ADVANCE_TYPES.includes(q.type) && isQuestionAnswered(value) && current < total - 1) {
      setCurrent((c) => c + 1);
    }
  };

  const displayName = user?.name || user?.username || '考生';

  return (
    <div className="exam-body mj-exam">
      <header className="exam-bar">
        <div className="exam-bar-in">
          <button type="button" className="side-link" onClick={() => navigate(-1)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span>返回</span>
          </button>
          <div className="brand-mark">明</div>
          <div>
            <div className="exam-name">{exam?.title ?? '考试进行中'}</div>
            <div className="meta">
              {exam ? `${total} 题 · 满分 ${exam.total_score}` : `共 ${total} 题`}
            </div>
          </div>
          <div className="grow" />
          <div className="row">
            <span className={`pill ${online ? 'pill-ok' : 'pill-warn'}`} id="net-pill">
              <i className="pill-dot" />
              {online ? '网络正常' : '网络断开'}
            </span>
          </div>
          <div className={`timer${warn ? ' warn' : ''}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="17" height="17">
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l2.5 2M9 2h6" />
            </svg>
            <span className="timer-num">{formatTime(timeLeft)}</span>
            <span className="meta">剩余</span>
          </div>
          <div className="who">
            <div className="avatar">{displayName.slice(0, 1)}</div>
            <div className="who-txt">
              <div className="who-name">{displayName}</div>
              <div className="who-role">{user?.username ?? '考生'}</div>
            </div>
          </div>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? '交卷中…' : '交卷'}
          </button>
        </div>
      </header>

      <main className="exam-main">
        <div className="stack">
          {switchCount >= 1 && (
            <div className={`banner ${switchDanger ? 'banner-danger' : 'banner-warn'}`} role="alert">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="17" height="17">
                <path d="M12 9v4M12 17h.01" />
                <path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              </svg>
              <span>
                检测到切屏 <b className="num">{switchCount}</b> 次，
                {switchDanger ? '已达到异常阈值，巡考老师将收到提醒。' : '该行为已记录至考试异常报告。'}
              </span>
            </div>
          )}

          <div className="q-card">
            <div className="q-head">
              <span className="q-no">
                第 {current + 1} 题 / 共 {total} 题
              </span>
              {currentQuestion && (
                <span className="pill pill-neutral">{TYPE_TEXT[currentQuestion.type]}</span>
              )}
              {currentQuestion && (
                <span className="pill pill-neutral">{currentQuestion.score} 分</span>
              )}
              {isMarked && (
                <span className="pill pill-warn">
                  <i className="pill-dot" />
                  已标记
                </span>
              )}
            </div>
            {currentQuestion && (
              <QuestionRenderer
                key={currentQuestion.id}
                question={currentQuestion}
                value={answers[currentQuestion.id]}
                index={current}
                onChange={(value: AnswerValue) => autoAdvance(currentQuestion, value)}
              />
            )}
          </div>

          <div className="between">
            <div className="row">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={current === 0}
                onClick={() => setCurrent((c) => c - 1)}
              >
                上一题
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={current === total - 1}
                onClick={() => setCurrent((c) => c + 1)}
              >
                下一题
              </button>
            </div>
            <div className="row">
              <span className="meta" id="save-state">
                {lastSavedAt ? `已自动保存 ${formatClock(lastSavedAt)}` : '作答将每 30 秒自动保存'}
              </span>
              <button type="button" className="btn btn-secondary" onClick={() => currentQuestion && toggleMark(currentQuestion.id)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="15" height="15">
                  <path d="M6 3v18l6-4.5L18 21V3z" />
                </svg>
                <span id="mark-label">{isMarked ? '取消标记' : '标记本题'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="stack exam-side">
          <div className="panel">
            <div className="panel-head">
              <span className="title-sm">答题卡</span>
              <span className="pill pill-neutral" id="progress-pill">
                已答 {answeredCount} / {total}
              </span>
            </div>
            <div className="panel-body stack">
              <div className="sheet">
                {paper.questions.map((q, i) => {
                  const answered = isQuestionAnswered(answers[q.id]);
                  const flagged = marked.includes(q.id);
                  const active = i === current;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      className={[
                        answered ? 'done' : '',
                        flagged ? 'flag' : '',
                        active ? 'cur' : '',
                      ].join(' ')}
                      onClick={() => setCurrent(i)}
                      aria-label={`第 ${i + 1} 题`}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
              <div className="legend">
                <span>
                  <i className="done" />
                  已答
                </span>
                <span>
                  <i />
                  未答
                </span>
                <span>
                  <i className="flag" />
                  已标记
                </span>
                <span>
                  <i className="cur" />
                  当前题
                </span>
              </div>
              <hr className="rule" />
              <div className="stack-sm">
                {typeSummary.map((g) => (
                  <div className="between" key={g.type}>
                    <span className="meta">
                      {TYPE_TEXT[g.type]} {g.count} 题
                    </span>
                    <span className="num meta">{g.score} 分</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <span className="title-sm">考试须知</span>
            </div>
            <div className="panel-body stack-sm exam-notice">
              <p>
                · 考试过程中请勿切换窗口
                {maxSwitch !== null ? `，切屏超过 ${maxSwitch} 次系统将标记为异常。` : '，切屏行为将被记录。'}
              </p>
              <p>· 答案每 30 秒自动保存，如遇断网可重新登录继续作答。</p>
              <p>· 交卷后不可修改，请确认答题卡无遗漏。</p>
            </div>
          </div>
        </div>
      </main>

      <Modal
        title="监考公告"
        open={notice != null}
        onOk={() => setNotice(null)}
        onCancel={() => setNotice(null)}
        okText="我已知晓"
        cancelButtonProps={{ style: { display: 'none' } }}
        centered
        width="min(640px, 90vw)"
        maskClosable={false}
      >
        <p style={{ fontSize: 16, lineHeight: 1.8 }}>{notice?.message}</p>
      </Modal>
    </div>
  );
};

export default ExamTaking;
