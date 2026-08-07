import React, { useState, useEffect } from 'react';
import { App, Table, Button, Space, Popconfirm, Dropdown } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined, SendOutlined, DownloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getExams, deleteExam, publishExam } from '../../../api/exams';
import { downloadTemplateFile } from '../../../utils/templateDownload';
import type { Exam, ExamStatus } from '../../../types/exam';
import EmptyState from '../../../components/EmptyState';
import PageHeader from '../../../components/PageHeader';
import PageCard from '../../../components/PageCard';
import StatusTag from '../../../components/StatusTag';
import './index.css';

const ExamManage = () => {
  const { message } = App.useApp();
  const [exams, setExams] = useState<Exam[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const fetchExams = async (p: number, ps: number) => {
    setLoading(true);
    try {
      const res = await getExams({ page: p, page_size: ps });
      const items = res.data.items || [];
      setExams(items);
      setTotal(res.data.total || 0);
      if (items.length === 0 && page > 1) setPage(page - 1);
    } catch (error) {
      message.error('获取考试列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExams(page, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  const handleDelete = async (id: number) => {
    try {
      await deleteExam(id);
      message.success('删除成功');
      fetchExams(page, pageSize);
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handlePublish = async (id: number) => {
    try {
      await publishExam(id);
      message.success('发布成功');
      fetchExams(page, pageSize);
    } catch (error) {
      message.error('发布失败');
    }
  };

  const handleDownload = async (format: 'excel' | 'word') => {
    try {
      await downloadTemplateFile(format);
      message.success('模板下载成功');
    } catch (error) {
      message.error('模板下载失败');
    }
  };

  const templateMenuItems = [
    { key: 'excel', label: 'Excel 模板 (.xlsx)', onClick: () => handleDownload('excel') },
    { key: 'word', label: 'Word 模板 (.docx)', onClick: () => handleDownload('word') },
  ];

  const columns: ColumnsType<Exam> = [
    { title: 'ID', dataIndex: 'id', key: 'id' },
    { title: '考试标题', dataIndex: 'title', key: 'title' },
    { title: '时长(分钟)', dataIndex: 'duration', key: 'duration' },
    { title: '总分', dataIndex: 'total_score', key: 'total_score' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: ExamStatus) => <StatusTag status={status} />,
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button type="link" icon={<SendOutlined />} onClick={() => navigate(`/grading?examId=${record.id}`)}>
            阅卷
          </Button>
          <Button type="link" icon={<EditOutlined />} onClick={() => navigate(`/exams/${record.id}/edit`)}>
            编辑
          </Button>
          {record.status === 'draft' && (
            <Button type="link" icon={<SendOutlined />} onClick={() => handlePublish(record.id)}>
              发布
            </Button>
          )}
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="考试管理"
        subtitle="创建、发布并维护考试"
        extra={
          <Space>
            <Dropdown menu={{ items: templateMenuItems }}>
              <Button icon={<DownloadOutlined />}>下载模板</Button>
            </Dropdown>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/exams/new')}>
              创建考试
            </Button>
          </Space>
        }
      />
      <p className="exam-manage-hint">
        模板说明：按模板填写题目后，可在考试编辑页『导入题目』中上传，支持 .xlsx / .docx 批量导入五种题型。
      </p>
      <PageCard>
        <Table
          columns={columns}
          dataSource={exams}
          loading={loading}
          rowKey="id"
          locale={{
            emptyText: (
              <EmptyState
                title="暂无数据"
                description="数据加载后会显示在这里"
                action={
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/exams/new')}>
                    创建考试
                  </Button>
                }
              />
            ),
          }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (p: number, ps: number) => { setPage(p); setPageSize(ps); },
          }}
        />
      </PageCard>
    </div>
  );
};

export default ExamManage;
