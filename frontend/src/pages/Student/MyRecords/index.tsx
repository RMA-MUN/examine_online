import React, { useState, useEffect, useCallback } from 'react';
import { App, Table, Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { getMyRecords } from '../../../api/exams';
import type { ExamRecord, RecordStatus } from '../../../types/record';
import EmptyState from '../../../components/EmptyState';
import PageHeader from '../../../components/PageHeader';
import PageCard from '../../../components/PageCard';
import StatusTag from '../../../components/StatusTag';
import ResultDrawer from './ResultDrawer';

const MyRecords = () => {
  const { message } = App.useApp();
  const [records, setRecords] = useState<ExamRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [resultRecord, setResultRecord] = useState<ExamRecord | null>(null);
  const [resultOpen, setResultOpen] = useState(false);

  const openResult = (record: ExamRecord) => {
    setResultRecord(record);
    setResultOpen(true);
  };

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMyRecords();
      setRecords(res.data);
    } catch (error) {
      message.error('获取考试记录失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const columns: ColumnsType<ExamRecord> = [
    { title: '考试名称', dataIndex: 'exam_title', key: 'exam_title' },
    { title: '得分', dataIndex: 'score', key: 'score' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: RecordStatus) => <StatusTag status={status} />,
    },
    {
      title: '开始时间',
      dataIndex: 'start_time',
      key: 'start_time',
      render: (v?: string) => (v ? new Date(v).toLocaleString() : '-'),
    },
    {
      title: '提交时间',
      dataIndex: 'submit_time',
      key: 'submit_time',
      render: (v?: string) => (v ? new Date(v).toLocaleString() : '-'),
    },
    { title: '切屏次数', dataIndex: 'switch_count', key: 'switch_count' },
    {
      title: '操作',
      key: 'action',
      render: (_, record: ExamRecord) => (
        <Button
          type="link"
          disabled={record.status === 'ongoing'}
          onClick={() => openResult(record)}
        >
          查看详情
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="我的记录" subtitle="你参与过的考试与成绩" />
      <PageCard>
        <Table
          columns={columns}
          dataSource={records}
          loading={loading}
          rowKey="id"
          locale={{
            emptyText: (
              <EmptyState
                title="还没有考试记录"
                description="参加考试后，成绩会显示在这里"
              />
            ),
          }}
        />
        <ResultDrawer
          record={resultRecord}
          open={resultOpen}
          onClose={() => setResultOpen(false)}
        />
      </PageCard>
    </div>
  );
};

export default MyRecords;
