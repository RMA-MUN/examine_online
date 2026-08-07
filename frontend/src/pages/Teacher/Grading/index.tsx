import React, { useState, useEffect } from 'react';
import { App, Table, Button, Select, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useSearchParams } from 'react-router-dom';
import { getExams } from '../../../api/exams';
import { getExamRecords } from '../../../api/grading';
import type { Exam } from '../../../types/exam';
import type { ExamRecord, RecordStatus } from '../../../types/record';
import PageHeader from '../../../components/PageHeader';
import PageCard from '../../../components/PageCard';
import StatusTag from '../../../components/StatusTag';
import GradingDrawer from './GradingDrawer';

const Grading = () => {
  const { message } = App.useApp();
  const [searchParams] = useSearchParams();
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [records, setRecords] = useState<ExamRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [drawerRecord, setDrawerRecord] = useState<ExamRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    getExams({ page_size: 100 })
      .then((res) => setExams(res.data.items || []))
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
      if (drawerOpen && drawerRecord) {
        const updated = items.find((r) => r.id === drawerRecord.id);
        if (updated) setDrawerRecord(updated);
      }
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

  const handleOpenDrawer = (record: ExamRecord) => {
    setDrawerRecord(record);
    setDrawerOpen(true);
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
          <Button type="link" onClick={() => handleOpenDrawer(record)}>
            阅卷
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="阅卷管理" subtitle="逐题批改学生答卷" />
      <PageCard>
        <Space style={{ marginBottom: 16 }}>
          <span>选择考试：</span>
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
      </PageCard>
      <GradingDrawer
        record={drawerRecord}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onChanged={() => fetchRecords(examId as number, page, pageSize)}
      />
    </div>
  );
};

export default Grading;
