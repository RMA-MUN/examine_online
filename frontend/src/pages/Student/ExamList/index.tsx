import React, { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import { App, Button, Pagination } from 'antd';
import { ClockCircleOutlined, CalendarOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getExams, startExam } from '../../../api/exams';
import type { Exam } from '../../../types/exam';
import PageHeader from '../../../components/PageHeader';
import StatusTag from '../../../components/StatusTag';
import EmptyState from '../../../components/EmptyState';
import SkeletonGrid from '../../../components/SkeletonGrid';
import { getExamDisplayStatus, getExamCardColor } from './utils';
import './index.css';

const ExamList = () => {
  const { message } = App.useApp();
  const [exams, setExams] = useState<Exam[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleStart = async (record: Exam) => {
    try {
      const res = await startExam(record.id);
      if (res.code !== 200) {
        message.error(res.message || '开始考试失败');
        return;
      }
      navigate(`/exams/${record.id}/take`, { state: { duration: record.duration } });
    } catch (error) {
      message.error('开始考试失败');
    }
  };

  const fetchExams = useCallback(async (p: number, ps: number) => {
    setLoading(true);
    try {
      const res = await getExams({ status: 'published', page: p, page_size: ps });
      const items = res.data.items || [];
      setExams(items);
      setTotal(res.data.total || 0);
      if (items.length === 0 && p > 1) setPage(p - 1);
    } catch (error) {
      message.error('获取考试列表失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchExams(page, pageSize);
  }, [page, pageSize, fetchExams]);

  return (
    <div className="exam-list-page">
      <PageHeader title="考试列表" subtitle="选择一门考试开始作答" />
      {loading ? (
        <SkeletonGrid count={6} columns={3} />
      ) : exams.length === 0 ? (
        <div className="exam-list-empty-card">
          <EmptyState
            title="暂无考试"
            description="考试发布后会显示在这里"
          />
        </div>
      ) : (
        <>
          <div className="exam-card-grid">
            {exams.map((exam) => {
              const displayStatus = getExamDisplayStatus(exam);
              const [from, to] = getExamCardColor(exam.title);
              const canStart = displayStatus !== 'finished';
              const statusLabel =
                displayStatus === 'not_taken' ? '未参加'
                : displayStatus === 'ongoing' ? '进行中'
                : '已完成';
              const buttonText =
                displayStatus === 'not_taken' ? '开始考试'
                : displayStatus === 'ongoing' ? '继续考试'
                : '已提交';
              return (
                <div
                  key={exam.id}
                  className="exam-card"
                  style={{ cursor: canStart ? 'pointer' : 'default' }}
                  onClick={() => canStart && handleStart(exam)}
                >
                  <div className="exam-card-cover" style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}>
                    <span className="exam-card-initial">{exam.title.slice(0, 1)}</span>
                    <span className="exam-card-status">
                      <StatusTag status={displayStatus === 'not_taken' ? 'not_started' : displayStatus} label={statusLabel} />
                    </span>
                  </div>
                  <div className="exam-card-body">
                    <h3 className="exam-card-title">{exam.title}</h3>
                    <p className="exam-card-meta">
                      <CalendarOutlined /> {dayjs(exam.start_time).format('YYYY-MM-DD HH:mm')} - {dayjs(exam.end_time).format('YYYY-MM-DD HH:mm')}
                    </p>
                    <p className="exam-card-meta">
                      <ClockCircleOutlined /> {exam.duration} 分钟 · 总分 {exam.total_score} · 及格 {exam.pass_score}
                    </p>
                    <div className="exam-card-footer">
                      <Button
                        type="primary"
                        disabled={!canStart}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStart(exam);
                        }}
                      >
                        {buttonText}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="exam-list-pagination">
            <Pagination
              current={page}
              pageSize={pageSize}
              total={total}
              showSizeChanger
              showTotal={(t: number) => `共 ${t} 场考试`}
              onChange={(p: number, ps: number) => {
                setPage(p);
                setPageSize(ps);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default ExamList;