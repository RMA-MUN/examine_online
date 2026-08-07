import React, { useState, useEffect } from 'react';
import { App, Drawer, Descriptions, Tag, Spin, Collapse } from 'antd';
import { getMyRecordAnswers } from '../../../api/grading';
import { shouldShowAiGrading } from '../../../utils/aiGrading';
import { getQuestionTypeMeta } from '../../../constants/questionTypes';
import PageCard from '../../../components/PageCard';
import StatusTag from '../../../components/StatusTag';
import type { ExamRecord } from '../../../types/record';
import type { Answer } from '../../../types/answer';

interface ResultDrawerProps {
  record: ExamRecord | null;
  open: boolean;
  onClose: () => void;
}

const ResultDrawer = ({ record, open, onClose }: ResultDrawerProps) => {
  const { message } = App.useApp();
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !record) return;
    const fetchAnswers = async () => {
      setLoading(true);
      try {
        const res = await getMyRecordAnswers(record.id);
        setAnswers(res.data || []);
      } catch (error) {
        message.error('获取答题详情失败');
      } finally {
        setLoading(false);
      }
    };
    fetchAnswers();
  }, [open, record, message]);

  const totalEarned = answers.reduce((sum, a) => sum + (a.score ?? 0), 0);
  const totalFull = answers.reduce((sum, a) => sum + (a.question?.score || 0), 0);

  return (
    <Drawer
      title={record ? `${record.exam_title || '考试'} · 答题结果` : ''}
      width={720}
      open={open}
      onClose={onClose}
      destroyOnHidden
    >
      <Spin spinning={loading}>
        {record && (
          <>
            <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="状态">
                <StatusTag status={record.status} />
              </Descriptions.Item>
              <Descriptions.Item label="得分">{totalEarned} / {totalFull}</Descriptions.Item>
              <Descriptions.Item label="提交时间" span={2}>
                {record.submit_time ? new Date(record.submit_time).toLocaleString() : '-'}
              </Descriptions.Item>
            </Descriptions>

            {answers.map((a, index) => (
              <PageCard key={a.id} className="answer-card">
                <Tag color={getQuestionTypeMeta(a.question?.type).color}>
                  {getQuestionTypeMeta(a.question?.type).text}
                </Tag>
                <strong>第 {index + 1} 题</strong>
                <span>（{a.question?.score}分）</span>
                <p style={{ margin: '8px 0' }}>{a.question?.content}</p>
                {Array.isArray(a.question?.options) && (a.question?.options?.length ?? 0) > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {a.question?.options?.map((opt, i) => (
                      <div key={i}>{String.fromCharCode(65 + i)}. {opt}</div>
                    ))}
                  </div>
                )}
                <p style={{ marginBottom: 4 }}>
                  <strong>正确答案：</strong>{a.question?.answer || '（无）'}
                </p>
                <p style={{ marginBottom: 4 }}>
                  <strong>我的答案：</strong>{a.student_answer || '（未作答）'}
                </p>
                <p style={{ marginBottom: 0 }}>
                  <strong>得分：</strong>{a.score ?? 0} / {a.question?.score}
                  {a.is_correct === true && <Tag color="success" style={{ marginLeft: 8 }}>正确</Tag>}
                  {a.is_correct === false && <Tag color="error" style={{ marginLeft: 8 }}>错误</Tag>}
                </p>
                {shouldShowAiGrading(a) && (
                  <Collapse
                    size="small"
                    style={{ marginTop: 12 }}
                    items={[{
                      key: 'ai-grading',
                      label: `AI 评分依据（${a.ai_grading.grading_source === 'teacher' ? '教师已复核' : a.ai_grading.grading_status}）`,
                      children: (
                        <div>
                          <div>AI 得分：{a.ai_grading.ai_score ?? '-'} / {a.question.score}</div>
                          <div>置信度：{a.ai_grading.ai_feedback?.confidence ?? '-'}</div>
                          <div>{a.ai_grading.ai_feedback?.reasoning || '评分中'}</div>
                          {a.ai_grading.ai_feedback?.criterion_results?.map((item) => (
                            <div key={item.criterion_id}>{item.criterion_id}: {item.score} 分，{item.reason}</div>
                          ))}
                        </div>
                      ),
                    }]}
                  />
                )}
              </PageCard>
            ))}
            {answers.length === 0 && <div>该记录暂无答案</div>}
          </>
        )}
      </Spin>
    </Drawer>
  );
};

export default ResultDrawer;
