import React, { useState, useEffect, useCallback } from 'react';
import { App, Table, Button, Modal, Form, Input, Select, Space, Popconfirm } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { getUsers, createUser, updateUser, deleteUser } from '../../../api/users';
import { getClasses } from '../../../api/classes';
import type { User, UserRole } from '../../../types/user';
import type { Class } from '../../../types/class';
import EmptyState from '../../../components/EmptyState';
import PageHeader from '../../../components/PageHeader';
import PageCard from '../../../components/PageCard';

interface UserFormValues {
  username: string;
  password?: string;
  name: string;
  role: UserRole;
  email?: string;
  phone?: string;
  class_id?: number | null;
}

const UserManage = () => {
  const { message } = App.useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [roleFilter, setRoleFilter] = useState<UserRole | undefined>(undefined);
  const [classFilter, setClassFilter] = useState<number | undefined>(undefined);
  const [form] = Form.useForm<UserFormValues>();

  const fetchUsers = useCallback(async (p: number = 1, ps: number = 10) => {
    setLoading(true);
    try {
      const res = await getUsers({
        page: p,
        page_size: ps,
        role: roleFilter,
        class_id: classFilter,
      });
      setUsers(res.data.items || []);
      setTotal(res.data.total || 0);
      setPage(p);
      setPageSize(ps);
    } catch (error) {
      message.error('获取用户列表失败');
    } finally {
      setLoading(false);
    }
  }, [message, roleFilter, classFilter]);

  useEffect(() => {
    fetchUsers(page, pageSize);
  }, [fetchUsers, page, pageSize]);

  useEffect(() => {
    getClasses({ page: 1, page_size: 100 })
      .then((res) => setClasses(res.data.items || []))
      .catch(() => {});
  }, []);

  const handleRoleFilterChange = (value: UserRole | undefined) => {
    setRoleFilter(value);
    // 班级筛选仅对学生角色有意义，切换为其他角色时清空已选班级
    if (value !== 'student') {
      setClassFilter(undefined);
    }
    setPage(1);
  };

  const handleClassFilterChange = (value: number | undefined) => {
    setClassFilter(value);
    setPage(1);
  };

  const handleAdd = () => {
    setEditingUser(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: User) => {
    setEditingUser(record);
    form.setFieldsValue({
      username: record.username,
      name: record.name,
      role: record.role,
      email: record.email ?? undefined,
      phone: record.phone ?? undefined,
      class_id: record.class_id ?? undefined,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteUser(id);
      message.success('删除成功');
      fetchUsers();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const classId = values.role === 'student' ? (values.class_id ?? null) : null;
      if (editingUser) {
        await updateUser(editingUser.id, { name: values.name, email: values.email, phone: values.phone, role: values.role, class_id: classId });
        message.success('更新成功');
      } else {
        await createUser({ username: values.username, password: values.password || '', name: values.name, role: values.role, email: values.email, phone: values.phone, class_id: classId });
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchUsers();
    } catch (error) {
      message.error('操作失败');
    }
  };

  const columns: ColumnsType<User> = [
    { title: 'ID', dataIndex: 'id', key: 'id' },
    { title: '用户名', dataIndex: 'username', key: 'username' },
    { title: '姓名', dataIndex: 'name', key: 'name' },
    { title: '角色', dataIndex: 'role', key: 'role' },
    {
      title: '班级',
      key: 'class',
      render: (_, record) =>
        record.class_id ? classes.find((c) => c.id === record.class_id)?.name ?? record.class_id : '-',
    },
    { title: '邮箱', dataIndex: 'email', key: 'email' },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
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
        title="用户管理"
        subtitle="管理学生、教师与管理员账号"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            添加用户
          </Button>
        }
      />
      <PageCard>
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            allowClear
            placeholder="按角色筛选"
            style={{ width: 140 }}
            value={roleFilter}
            onChange={handleRoleFilterChange}
            options={[
              { value: 'student', label: '学生' },
              { value: 'teacher', label: '教师' },
              { value: 'admin', label: '管理员' },
            ]}
          />
          <Select
            allowClear
            placeholder="按班级筛选"
            style={{ width: 180 }}
            value={classFilter}
            onChange={handleClassFilterChange}
            disabled={roleFilter !== 'student'}
            options={[
              { value: -1, label: '未分配班级' },
              ...classes.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </Space>
        <Table
          columns={columns}
          dataSource={users}
          loading={loading}
          rowKey="id"
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (p: number, ps: number) => { setPage(p); setPageSize(ps); },
          }}
          locale={{
            emptyText: (
              <EmptyState
                title="暂无数据"
                description="数据加载后会显示在这里"
                action={
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                    添加用户
                  </Button>
                }
              />
            ),
          }}
        />
      </PageCard>

      <Modal
        title={editingUser ? '编辑用户' : '添加用户'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
            <Input disabled={!!editingUser} />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: !editingUser }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="name" label="姓名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="student">学生</Select.Option>
              <Select.Option value="teacher">老师</Select.Option>
              <Select.Option value="admin">管理员</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.role !== cur.role}>
            {({ getFieldValue }) =>
              getFieldValue('role') === 'student' ? (
                <Form.Item name="class_id" label="所属班级">
                  <Select
                    allowClear
                    placeholder="请选择班级"
                    options={classes.map((c) => ({ value: c.id, label: c.name }))}
                  />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item name="email" label="邮箱">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="电话">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserManage;
