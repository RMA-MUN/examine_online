import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { App, Button, Space, Modal } from 'antd';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { getPaper, saveAnswers, submitExam, recordSwitch } from '../../../api/exams';
import QuestionRenderer from '../../../components/QuestionRenderer';
import PageCard from '../../../components/PageCard';
import EmptyState from '../../../components/EmptyState';
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

const AUTO_ADVANCE_TYPES: QuestionType[] = ['single', 'multiple', 'judge'];

const ExamTaking = () => {
  const { message } = App.useApp();
  const { examId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [paper, setPaper] = useState<Paper | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(() => {
    const duration = (location.state as { duration?: number } | null)?.duration;
    return duration ? duration * 60 : 0;
  });

  // 切屏检测(原逻辑)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden) {
        await recordSwitch(Number(examId));
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [examId]);

  const handleSubmit = useCallback(async () => {
    const total = paper?.questions.length ?? 0;
    const answered = countAnswered(answers, paper?.questions.map((q) => q.id) ?? []);
    const unanswered = total - answered;
    Modal.confirm({
      title: '确认交卷？',
      content: `已答 ${answered} / 共 ${total} 题${unanswered > 0 ? `,还有 ${unanswered} 题未作答` : ''},交卷后将无法修改答案`,
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
  }, [examId, answers, navigate, message, paper]);

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

  const handleAnswerChange = (questionId: number, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const questionIds = useMemo(() => paper?.questions.map((q) => q.id) ?? [], [paper]);
  const answeredCount = countAnswered(answers, questionIds);
  const total = questionIds.length;
  const currentQuestion = paper?.questions[current];
  const progress = total > 0 ? Math.round((answeredCount / total) * 100) : 0;
  const warn = timeLeft <= 300;

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

  return (
    <div className="exam-taking">
      <div className="exam-taking-topbar">
        <div className="exam-taking-info">
          <span className="exam-taking-title">考试进行中</span>
          <span className="exam-taking-progress-text">
            第 {current + 1} / {total} 题 · 已答 {answeredCount}
          </span>
        </div>
        <Space>
          <span className={`exam-taking-timer${warn ? ' exam-taking-timer-warn' : ''}`}>
            {formatTime(timeLeft)}
          </span>
          <Button type="primary" danger onClick={handleSubmit} loading={loading}>
            交卷
          </Button>
        </Space>
      </div>
      <div className="exam-taking-progress-bar">
        <span className="exam-taking-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="exam-taking-body">
        <aside className="exam-taking-nav">
          <div className="exam-taking-nav-grid">
            {paper.questions.map((q, i) => {
              const answered = isQuestionAnswered(answers[q.id]);
              const active = i === current;
              return (
                <button
                  key={q.id}
                  type="button"
                  className={[
                    'exam-taking-nav-item',
                    answered ? 'is-answered' : '',
                    active ? 'is-active' : '',
                  ].join(' ')}
                  onClick={() => setCurrent(i)}
                  aria-label={`第 ${i + 1} 题`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <p className="exam-taking-nav-summary">
            已答 {answeredCount} / 共 {total} 题
          </p>
        </aside>

        <main className="exam-taking-main">
          <PageCard>
            {currentQuestion && (
              <QuestionRenderer
                key={currentQuestion.id}
                question={currentQuestion}
                value={answers[currentQuestion.id]}
                index={current}
                onChange={(value: AnswerValue) => autoAdvance(currentQuestion, value)}
              />
            )}
          </PageCard>
          <div className="exam-taking-actions">
            <Button disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>
              上一题
            </Button>
            <Button
              disabled={current === total - 1}
              onClick={() => setCurrent((c) => c + 1)}
            >
              下一题
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ExamTaking;
