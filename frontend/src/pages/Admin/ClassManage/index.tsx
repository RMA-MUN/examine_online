import React, { useState, useEffect, useCallback } from 'react';
import { App, Table, Button, Modal, Form, Input, Space, Popconfirm } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined, TeamOutlined } from '@ant-design/icons';
import { getClasses, createClass, updateClass, deleteClass } from '../../../api/classes';
import type { Class } from '../../../types/class';
import PageHeader from '../../../components/PageHeader';
import PageCard from '../../../components/PageCard';
import EmptyState from '../../../components/EmptyState';
import ClassStudentsDrawer from '../../../components/ClassStudentsDrawer';

interface ClassFormValues {
  name: string;
  grade?: string;
  description?: string;
}

const ClassManage = () => {
  const { message } = App.useApp();
  const [classes, setClasses] = useState<Class[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Class | null>(null);
  const [studentsDrawer, setStudentsDrawer] = useState<Class | null>(null);
  const [form] = Form.useForm<ClassFormValues>();

  const fetchClasses = useCallback(async (p = page, ps = pageSize) => {
    setLoading(true);
    try {
      const res = await getClasses({ page: p, page_size: ps });
      setClasses(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (error) {
      message.error('获取班级列表失败');
    } finally {
      setLoading(false);
    }
  }, [message, page, pageSize]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: Class) => {
    setEditing(record);
    form.setFieldsValue({
      name: record.name,
      grade: record.grade ?? undefined,
      description: record.description ?? undefined,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteClass(id);
      message.success('删除成功');
      fetchClasses();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await updateClass(editing.id, values);
        message.success('更新成功');
      } else {
        await createClass(values);
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchClasses();
    } catch (error) {
      message.error('操作失败');
    }
  };

  const columns: ColumnsType<Class> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: '班级名称', dataIndex: 'name', key: 'name' },
    { title: '年级', dataIndex: 'grade', key: 'grade', width: 120 },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: '操作', key: 'action', width: 240, fixed: 'right' as const,
      render: (_, record) => (
        <Space>
          <Button type="link" icon={<TeamOutlined />} onClick={() => setStudentsDrawer(record)}>学生</Button>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm title="确认删除该班级？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="班级管理"
        subtitle="管理学生班级，创建考试时可按班级分配"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>添加班级</Button>}
      />
      <PageCard>
        {classes.length === 0 && !loading ? (
          <EmptyState title="暂无班级" description="点击右上角按钮创建班级" />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={classes}
            loading={loading}
            pagination={{
              current: page, pageSize, total,
              showSizeChanger: true,
              showTotal: (t: number) => `共 ${t} 个班级`,
              onChange: (p, ps) => { setPage(p); setPageSize(ps); },
            }}
          />
        )}
      </PageCard>
      <Modal
        title={editing ? '编辑班级' : '添加班级'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="班级名称" rules={[{ required: true, message: '请输入班级名称' }]}>
            <Input placeholder="如：计算机2024级1班" />
          </Form.Item>
          <Form.Item name="grade" label="年级">
            <Input placeholder="如：2024级" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="可选" />
          </Form.Item>
        </Form>
      </Modal>
      <ClassStudentsDrawer
        open={!!studentsDrawer}
        onClose={() => setStudentsDrawer(null)}
        classId={studentsDrawer?.id ?? 0}
        className={studentsDrawer?.name}
        onChanged={() => fetchClasses()}
      />
    </div>
  );
};

export default ClassManage;
