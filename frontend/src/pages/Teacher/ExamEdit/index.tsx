import React, { useState, useEffect } from 'react';
import {
  App, Table, Button, Tag, Space, Popconfirm, Form, Input, Select,
  InputNumber, Modal, DatePicker, Switch, Card, Divider, Row, Col,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeftOutlined, PlusOutlined, DeleteOutlined, MinusCircleOutlined, SaveOutlined, UploadOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  getExam, createExam, updateExam, getExamQuestions, createQuestion, deleteQuestion,
} from '../../../api/exams';
import { getCourses } from '../../../api/courses';
import { getClasses } from '../../../api/classes';
import PageHeader from '../../../components/PageHeader';
import ImportModal from '../../../components/ImportModal';
import { QUESTION_TYPE_META, QUESTION_TYPES, getQuestionTypeMeta } from '../../../constants/questionTypes';
import type { ExamFormValues } from '../../../types/exam';
import type { ExamInput } from '../../../types/exam';
import type { Course } from '../../../types/course';
import type { Class } from '../../../types/class';
import type { Question, QuestionType, QuestionFormValues, QuestionInput } from '../../../types/question';

const { TextArea } = Input;

const optionLetters = (index: number) => String.fromCharCode(65 + index);

const ExamEdit = () => {
  const { message } = App.useApp();
  const { examId } = useParams();
  const isNew = examId === undefined || examId === 'new';
  const navigate = useNavigate();
  const [examForm] = Form.useForm<ExamFormValues>();
  const [questionForm] = Form.useForm<QuestionFormValues>();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [questionTotal, setQuestionTotal] = useState(0);
  const [questionPage, setQuestionPage] = useState(1);
  const [questionPageSize, setQuestionPageSize] = useState(10);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const questionType = Form.useWatch<QuestionType>('type', questionForm);

  const fetchData = async () => {
    if (isNew) {
      try {
        const [coursesRes, classesRes] = await Promise.all([
          getCourses({ page: 1, page_size: 100 }),
          getClasses({ page: 1, page_size: 100 }),
        ]);
        setCourses(coursesRes.data.items || []);
        setClasses(classesRes.data.items || []);
      } catch (error) {
        message.error('加载课程或班级列表失败');
      }
      return;
    }
    setLoading(true);
    try {
      const [examRes, questionsRes, classesRes] = await Promise.all([
        getExam(Number(examId)),
        getExamQuestions(Number(examId), { page: questionPage, page_size: questionPageSize }),
        getClasses({ page: 1, page_size: 100 }),
      ]);
      const examData = examRes.data;
      setQuestions(questionsRes.data.items || []);
      setQuestionTotal(questionsRes.data.total || 0);
      setClasses(classesRes.data.items || []);
      examForm.setFieldsValue({
        title: examData.title,
        description: examData.description ?? undefined,
        duration: examData.duration,
        total_score: examData.total_score,
        pass_score: examData.pass_score,
        start_time: dayjs(examData.start_time),
        end_time: dayjs(examData.end_time),
        random_order: examData.random_order,
        max_switch: examData.max_switch,
        class_ids: examData.assigned_class_ids ?? [],
        // 编辑时仅回填 exclude 覆盖；编辑保存只会提交 exclude 列表，
        // 通过 API 直接创建的 include 覆盖（额外添加的学生）在此会被丢弃
        exclude_student_ids: (examData.student_overrides ?? [])
          .filter((o) => o.action === 'exclude')
          .map((o) => String(o.student_id)),
      });
    } catch (error) {
      message.error('加载考试详情失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, questionPage, questionPageSize]);

  const handleImportSuccess = () => {
    fetchData();
  };

  const handleSaveExam = async () => {
    try {
      const values = await examForm.validateFields();
      setSaving(true);
      const payload: ExamInput = {
        title: values.title,
        description: values.description,
        duration: values.duration,
        total_score: values.total_score,
        pass_score: values.pass_score,
        start_time: values.start_time.format('YYYY-MM-DD HH:mm:ss'),
        end_time: values.end_time.format('YYYY-MM-DD HH:mm:ss'),
        random_order: values.random_order,
        max_switch: values.max_switch,
        class_ids: (values.class_ids as number[]) || [],
        student_overrides: ((values.exclude_student_ids as string[]) || [])
          .map((v: string) => ({ student_id: Number(v), action: 'exclude' as const }))
          .filter((o) => !Number.isNaN(o.student_id)),
      };
      if (isNew) {
        const created = await createExam({ ...payload, course_id: values.course_id as number });
        message.success('考试创建成功，可继续添加题目');
        navigate(`/exams/${created.data.id}/edit`, { replace: true });
        return;
      }
      await updateExam(Number(examId), payload);
      message.success('考试信息保存成功');
      fetchData();
    } catch (error) {
      message.error('保存考试信息失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuestion = async (id: number) => {
    try {
      await deleteQuestion(id);
      message.success('删除成功');
      fetchData();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const openAddModal = () => {
    questionForm.resetFields();
    questionForm.setFieldsValue({ type: 'single', score: 5, options: ['', '', '', ''] });
    setModalVisible(true);
  };

  const handleAddQuestion = async () => {
    try {
      const values = await questionForm.validateFields();
      setSubmitting(true);
      const payload: QuestionInput = {
        type: values.type,
        content: values.content,
        answer: values.answer,
        score: values.score,
        sort_order: questionTotal + 1,
        options: ['single', 'multiple'].includes(values.type) ? (values.options || []) : null,
      };
      await createQuestion(Number(examId), payload);
      message.success('添加题目成功');
      setModalVisible(false);
      fetchData();
    } catch (error) {
      message.error('添加题目失败');
    } finally {
      setSubmitting(false);
    }
  };

  const questionColumns: ColumnsType<Question> = [
    {
      title: '题号',
      key: 'index',
      width: 60,
      render: (_, __, index) => (questionPage - 1) * questionPageSize + index + 1,
    },
    {
      title: '题型',
      dataIndex: 'type',
      key: 'type',
      width: 90,
      render: (type: QuestionType) => {
        const meta = getQuestionTypeMeta(type);
        return <Tag color={meta.color}>{meta.text}</Tag>;
      },
    },
    { title: '题目内容', dataIndex: 'content', key: 'content', ellipsis: true },
    {
      title: '分值',
      dataIndex: 'score',
      key: 'score',
      width: 70,
    },
    {
      title: '操作',
      key: 'action',
      width: 90,
      render: (_, record) => (
        <Space>
          <Popconfirm title="确认删除该题目？" onConfirm={() => handleDeleteQuestion(record.id)}>
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
        title={isNew ? '新建考试' : '编辑考试'}
        subtitle={isNew ? '填写考试基本信息' : '配置考试信息并管理题目'}
        extra={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/exams')}>
              返回列表
            </Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSaveExam}>
              {isNew ? '创建考试' : '保存考试信息'}
            </Button>
          </Space>
        }
      />

      <Card loading={loading} title="考试基本信息" style={{ marginBottom: 16 }}>
        <Form form={examForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="title" label="考试标题" rules={[{ required: true, message: '请输入考试标题' }]}>
                <Input placeholder="请输入考试标题" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="description" label="考试说明">
                <Input placeholder="请输入考试说明" />
              </Form.Item>
            </Col>
            {isNew && (
              <Col span={12}>
                <Form.Item name="course_id" label="所属课程" rules={[{ required: true, message: '请选择所属课程' }]}>
                  <Select placeholder="请选择课程">
                    {courses.map((c) => (
                      <Select.Option key={c.id} value={c.id}>
                        {c.name}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            )}
            <Col span={6}>
              <Form.Item name="duration" label="考试时长(分钟)" rules={[{ required: true, message: '请输入考试时长' }]}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="total_score" label="总分" rules={[{ required: true, message: '请输入总分' }]}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="pass_score" label="及格分" rules={[{ required: true, message: '请输入及格分' }]}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="max_switch" label="最大切屏次数">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="start_time" label="开始时间" rules={[{ required: true, message: '请选择开始时间' }]}>
                <DatePicker showTime style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="end_time" label="结束时间" rules={[{ required: true, message: '请选择结束时间' }]}>
                <DatePicker showTime style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="random_order" label="题目随机排序" valuePropName="checked" initialValue>
                <Switch />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="class_ids" label="参加班级" tooltip="选择班级后，该班级所有学生自动参加；未选择任何班级时，所有学生均可参加（兼容旧考试）">
                <Select
                  mode="multiple"
                  allowClear
                  placeholder="请选择参加考试的班级（可多选）"
                  options={classes.map((c) => ({ value: c.id, label: c.name }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="exclude_student_ids" label="排除学生" tooltip="从已选班级中排除个别学生（输入学生ID，多个用逗号分隔）">
                <Select
                  mode="tags"
                  allowClear
                  placeholder="输入学生ID，多个用逗号分隔"
                  tokenSeparators={[',']}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      {!isNew && (
        <Card
          loading={loading}
          title={`题目管理（${questionTotal}）`}
          extra={
            <Space>
              <Button icon={<UploadOutlined />} onClick={() => setImportModalVisible(true)}>
                导入题目
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
                添加题目
              </Button>
            </Space>
          }
        >
          <Table
            columns={questionColumns}
            dataSource={questions}
            rowKey="id"
            pagination={{
              current: questionPage,
              pageSize: questionPageSize,
              total: questionTotal,
              showSizeChanger: true,
              showTotal: (t: number) => `共 ${t} 条`,
              onChange: (p: number, ps: number) => { setQuestionPage(p); setQuestionPageSize(ps); },
            }}
          />
        </Card>
      )}

      <Modal
        title="添加题目"
        open={modalVisible}
        onOk={handleAddQuestion}
        onCancel={() => setModalVisible(false)}
        confirmLoading={submitting}
        width={640}
      >
        <Divider style={{ marginTop: 8 }} />
        <Form form={questionForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="type" label="题型" rules={[{ required: true }]}>
                <Select>
                  {QUESTION_TYPES.map((value) => (
                    <Select.Option key={value} value={value}>
                      {QUESTION_TYPE_META[value].text}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="score" label="分值" rules={[{ required: true, message: '请输入分值' }]}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="content" label="题目内容" rules={[{ required: true, message: '请输入题目内容' }]}>
            <TextArea rows={3} placeholder="请输入题目内容" />
          </Form.Item>

          {questionType && ['single', 'multiple'].includes(questionType) && (
            <Form.Item label="选项" required>
              <Form.List name="options">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field, index) => (
                      <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                        <span style={{ width: 20, textAlign: 'right' }}>{optionLetters(index)}.</span>
                        <Form.Item
                          {...field}
                          name={field.name}
                          rules={[{ required: true, message: '请输入选项内容' }]}
                          noStyle
                        >
                          <Input placeholder="选项内容" style={{ width: 420 }} />
                        </Form.Item>
                        {fields.length > 2 && (
                          <MinusCircleOutlined onClick={() => remove(field.name)} />
                        )}
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add('')} block icon={<PlusOutlined />}>
                      添加选项
                    </Button>
                  </>
                )}
              </Form.List>
            </Form.Item>
          )}

          {questionType === 'judge' ? (
            <Form.Item name="answer" label="正确答案" rules={[{ required: true, message: '请选择正确答案' }]}>
              <Select>
                <Select.Option value="true">正确</Select.Option>
                <Select.Option value="false">错误</Select.Option>
              </Select>
            </Form.Item>
          ) : (
            <Form.Item name="answer" label="参考答案" rules={[{ required: true, message: '请输入参考答案' }]}>
              <TextArea rows={2} placeholder="客观题填选项（如 A 或 A,B），主观题填参考答案" />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <ImportModal
        open={importModalVisible}
        examId={Number(examId)}
        onClose={() => setImportModalVisible(false)}
        onSuccess={handleImportSuccess}
      />
    </div>
  );
};

export default ExamEdit;
