import React, { useEffect, useState, useMemo, useRef } from 'react';
import { App, Row, Col, Button, Modal, Select, Space, Segmented, Form, Input, InputNumber, Checkbox } from 'antd';
import {
  FileTextOutlined,
  CheckCircleOutlined,
  HistoryOutlined,
  PercentageOutlined,
  BookOutlined,
  TeamOutlined,
  AuditOutlined,
  UserOutlined,
  FileExcelOutlined,
  EyeOutlined,
  BarChartOutlined,
  SettingOutlined,
  PlusOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { exportScores, getDashboard, getScoreExportOptions } from '../../api/statistics';
import type { DashboardData } from '../../types/dashboard';
import type { ScoreExportOptions } from '../../types/scoreExport';
import dayjs from 'dayjs';
import useAuthStore from '../../store/auth';
import useThemeStore from '../../store/theme';
import { getChartTheme } from '../../theme/chartTheme';
import StatusTag from '../../components/StatusTag';
import EmptyState from '../../components/EmptyState';
import PageCard from '../../components/PageCard';
import StatCard from '../../components/StatCard';
import SkeletonGrid from '../../components/SkeletonGrid';
import EChart from '../../components/EChart';
import { downloadDashboardFile } from '../../utils/dashboardExport';
import {
  MOCK_OVERVIEW,
  OVERVIEW_RANGE,
  type ExamStatus,
  type OverviewRangeKey,
} from '../../mocks/overview';
import {
  buildAdminRoleOption,
  buildStudentPassRateOption,
  buildStudentScoreOption,
  buildTeacherPendingOption,
  buildTeacherRecentExamOption,
  buildAdminExamStatusOption,
  buildAdminCourseExamOption,
  buildAdminExamAvgOption,
  buildAdminExamPassRateOption,
  buildAdminScoreDistOption,
  buildAdminExamParticipationOption,
  buildAdminPendingOption,
  buildAdminSwitchOption,
  buildAdminClassDistOption,
} from './chartOptions';
import './index.css';

/**
 * 测量图表卡片实际宽度，让柱状图 x 轴标签按容器宽度自适应换行。
 * 首帧 width=0 时照常渲染，构建器回退默认行宽，避免闪烁。
 */
const ChartBox = ({ children }: { children: (width: number) => React.ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ width: '100%' }}>
      {children(width)}
    </div>
  );
};

const Dashboard = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const mode = useThemeStore((state) => state.mode);
  // 主题切换时重建图表配置，让 ECharts 的坐标轴/网格/配色跟着走
  const chartTheme = useMemo(() => getChartTheme(mode), [mode]);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const [scoreOptions, setScoreOptions] = useState<ScoreExportOptions | null>(null);
  const [scoreClassId, setScoreClassId] = useState<number | undefined>();
  const [scoreCourseId, setScoreCourseId] = useState<number | undefined>();
  const [scoreExporting, setScoreExporting] = useState(false);
  // 总览控制台：范围三档先切 mock（照抄参考 RANGE），接口成功再用真实数覆盖
  const [range, setRange] = useState<OverviewRangeKey>(() => {
    try {
      const saved = window.localStorage.getItem('mingjian.dashboard.range');
      return saved === 'week' || saved === 'term' ? saved : 'today';
    } catch {
      return 'today';
    }
  });
  const [newExamOpen, setNewExamOpen] = useState(false);
  const [dailyExporting, setDailyExporting] = useState(false);
  const [examForm] = Form.useForm();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await getDashboard();
        setData(res.data);
      } catch (error) {
        // 演示不断：接口失败用 mock 撑起总览，只给错误提示
        message.error('获取仪表盘数据失败，已展示演示数据');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRangeChange = (value: OverviewRangeKey) => {
    setRange(value);
    try {
      window.localStorage.setItem('mingjian.dashboard.range', value);
    } catch {
      /* localStorage 不可用时仅本次生效 */
    }
  };

  // 接口成功时用真实数覆盖对应 KPI，取不到的档位继续读 mock
  // TODO(Task8): online/peak/eta/alerts 待 get_dashboard_data 扩展字段覆盖
  const kpi = useMemo(() => {
    const base = { ...OVERVIEW_RANGE[range] };
    if (data?.role === 'teacher') {
      base.running = String(data.stats.published_exams);
      base.pending = data.stats.pending_grading_count.toLocaleString('en-US');
    } else if (data?.role === 'student') {
      base.running = String(data.stats.available_exams);
    } else if (data?.role === 'admin') {
      base.running = String(data.stats.exam_count);
    }
    return base;
  }, [range, data]);

  if (loading) {
    return <SkeletonGrid count={4} columns={2} />;
  }

  const isStudent = data?.role === 'student';
  const isTeacher = data?.role === 'teacher';

  const openScoreExport = async () => {
    setScoreModalOpen(true);
    if (scoreOptions) return;
    try {
      const res = await getScoreExportOptions();
      setScoreOptions(res.data);
    } catch (error) {
      message.error('获取导出选项失败');
    }
  };

  const handleExportScores = async () => {
    setScoreExporting(true);
    try {
      const response = await exportScores(scoreClassId, scoreCourseId);
      downloadDashboardFile(response, '成绩明细.xlsx');
    } catch (error) {
      message.error('导出成绩明细失败');
    } finally {
      setScoreExporting(false);
    }
  };

  // TODO(Task8): 换真正日报接口（当前复用成绩导出接口先占位，语义不一致）
  const handleDailyExport = async () => {
    setDailyExporting(true);
    try {
      const response = await exportScores();
      downloadDashboardFile(response, '考试运行日报.xlsx');
    } catch (error) {
      message.error('导出日报失败');
    } finally {
      setDailyExporting(false);
    }
  };

  const handleCreateExam = async () => {
    try {
      const values = await examForm.validateFields();
      setNewExamOpen(false);
      examForm.resetFields();
      // 表单值随路由透传，复用现有 ExamEdit（/exams/new）继续组卷
      navigate('/exams/new', { state: values });
    } catch {
      /* 校验失败时 inline 提示即可，不关窗 */
    }
  };

  const examStatusPill: Record<ExamStatus, string> = {
    running: 'pill-ok',
    pending: 'pill-info',
    finished: 'pill-neutral',
  };

  const modules = [
    {
      key: 'student-exam',
      no: '模块 01',
      title: '学生考试端',
      desc: '在线作答与答题卡导航，含倒计时、题目标记、自动保存与切屏记录。',
      foot: '118 人在线 · 1 场进行中',
      icon: <FileTextOutlined />,
      route: '/exams',
    },
    {
      key: 'teacher-grading',
      no: '模块 02',
      title: '教师阅卷端',
      desc: '按题或按人流转，评分点逐项勾选、评语模板、双评与仲裁复核。',
      foot: '待阅 1,246 份 · 12 人在线',
      icon: <AuditOutlined />,
      route: '/grading',
    },
    {
      key: 'proctoring',
      no: '模块 03',
      title: '考试监控与防作弊',
      desc: '实时监控墙、异常行为告警分级、行为时间线与处置动作留痕。',
      foot: '2 条待处理告警',
      icon: <EyeOutlined />,
      route: '/proctoring',
    },
    {
      key: 'question-bank',
      no: '模块 04',
      title: '题库与组卷',
      desc: '按章节、知识点、难度与题型检索，配额组卷并生成试卷原卷。',
      foot: '题目 12,480 道 · 试卷模板 24 套',
      icon: <BookOutlined />,
      route: '/question-bank',
    },
    {
      key: 'analytics',
      no: '模块 05',
      title: '成绩分析与报表',
      desc: '分数分布、题目难度与区分度、知识点掌握度，支持导出成绩单。',
      foot: '本周 6 场考试',
      icon: <BarChartOutlined />,
      route: '/analytics',
    },
    {
      key: 'admin',
      no: '模块 06',
      title: '系统管理',
      desc: '用户与组织、角色权限矩阵、考试参数与操作审计日志。',
      foot: '账号 3,214 个 · 5 个角色',
      icon: <SettingOutlined />,
      route: '/admin',
    },
  ];

  return (
    <div className="dashboard mj-overview">
      <section className="page-head">
        <div>
          <h1 className="title-lg">考试运行总览</h1>
          <p className="page-sub">教务处 · 第 3 教学周{user?.name || user?.username ? ` · 你好，${user?.name || user?.username}` : ''}</p>
        </div>
        <div className="toolbar">
          <Segmented
            aria-label="统计范围"
            value={range}
            onChange={(value) => handleRangeChange(value as OverviewRangeKey)}
            options={[
              { label: '今日', value: 'today' },
              { label: '本周', value: 'week' },
              { label: '本学期', value: 'term' },
            ]}
          />
          {!isStudent && (
            <Button
              icon={<FileExcelOutlined />}
              loading={scoreExporting}
              onClick={openScoreExport}
            >
              成绩明细导出
            </Button>
          )}
          <Button
            icon={<DownloadOutlined />}
            loading={dailyExporting}
            onClick={handleDailyExport}
          >
            导出日报
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setNewExamOpen(true)}
          >
            新建考试
          </Button>
        </div>
      </section>

      <section className="kpi-grid" aria-label="关键指标">
        <div className="kpi" data-testid="kpi-running">
          <div className="label">进行中考试</div>
          <div className="kpi-num">{kpi.running}</div>
          <div className="kpi-foot"><span className="pill pill-ok"><i className="pill-dot" />正常</span> 2 场待开始</div>
        </div>
        <div className="kpi" data-testid="kpi-online">
          <div className="label">在线考生</div>
          <div className="kpi-num">{kpi.online}</div>
          <div className="kpi-foot">今日峰值 <span className="num">{kpi.peak}</span></div>
        </div>
        <div className="kpi" data-testid="kpi-pending">
          <div className="label">待阅卷份数</div>
          <div className="kpi-num">{kpi.pending}</div>
          <div className="kpi-foot">预计 <span className="num">{kpi.eta}</span> 小时完成</div>
        </div>
        <div className="kpi" data-testid="kpi-alerts">
          <div className="label">防作弊告警</div>
          <div className="kpi-num">{kpi.alerts}</div>
          <div className="kpi-foot"><span className="pill pill-warn"><i className="pill-dot" />待处理 {kpi.alerts}</span> 已处置 5</div>
        </div>
      </section>

      <section className="cols" aria-label="实时运行">
        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <span className="title-sm">进行中的考试</span>
              <Link className="link" to="/proctoring">进入监控台</Link>
            </div>
            <div className="panel-body flush">
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>考试</th><th>班级</th><th>时段</th><th style={{ width: 150 }}>进度</th><th className="cell-num">在线 / 应考</th><th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_OVERVIEW.exams.map((exam) => (
                    <tr key={exam.title}>
                      <td><div className="cell-strong">{exam.title}</div><div className="meta">{exam.meta}</div></td>
                      <td>{exam.clazz}</td>
                      <td className="num">{exam.time}</td>
                      <td>
                        <div className="row" style={{ gap: 8 }}>
                          <div className="bar grow"><i style={{ width: `${exam.progress}%` }} /></div>
                          <span className="num meta">{exam.progress}%</span>
                        </div>
                      </td>
                      <td className="cell-num">{exam.online} / {exam.total}</td>
                      <td><span className={`pill ${examStatusPill[exam.status]}`}><i className="pill-dot" />{exam.statusText}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <span className="title-sm">阅卷进度</span>
              <Link className="link" to="/grading">进入阅卷工作台</Link>
            </div>
            <div className="panel-body stack-sm">
              {MOCK_OVERVIEW.grading.map((item) => (
                <div key={item.title}>
                  <div className="between" style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 13 }}>{item.title}</span>
                    <span className="num meta">{item.done.toLocaleString('en-US')} / {item.total.toLocaleString('en-US')}</span>
                  </div>
                  <div className="bar-thick"><i style={{ width: `${item.percent}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel" style={{ maxHeight: '100%' }}>
          <div className="panel-head">
            <span className="title-sm">需要关注</span>
            <span className="pill pill-warn"><i className="pill-dot" />2 条待处理</span>
          </div>
          <div className="panel-body flush">
            <div className="feed">
              {MOCK_OVERVIEW.feed.map((item) => (
                <div className="feed-item" key={item.title}>
                  <div className={`feed-ico ico-${item.level}`}>{item.icon}</div>
                  <div>
                    <div className="feed-t">{item.title}</div>
                    <div className="feed-m">{item.meta}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section aria-label="功能模块">
        <div className="between" style={{ marginBottom: 12 }}>
          <h2 className="title-sm">功能模块</h2>
          <span className="meta">6 个模块 · 桌面网页端</span>
        </div>
        <div className="mod-grid">
          {modules.map((mod) => (
            <div
              key={mod.key}
              className="mod"
              data-testid={`module-${mod.key}`}
              role="link"
              tabIndex={0}
              onClick={() => navigate(mod.route)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(mod.route);
                }
              }}
            >
              <div className="mod-top">
                <div className="mod-ico">{mod.icon}</div>
                <span className="meta">{mod.no}</span>
              </div>
              <div>
                <h3 className="title-md">{mod.title}</h3>
                <p style={{ marginTop: 6 }}>{mod.desc}</p>
              </div>
              <div className="mod-foot">
                <span className="meta">{mod.foot}</span>
                <span className="mod-go">进入 →</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Modal
        title="新建考试"
        open={newExamOpen}
        onCancel={() => setNewExamOpen(false)}
        onOk={handleCreateExam}
        okText="创建并组卷"
        cancelText="取消"
        destroyOnClose
      >
        <p className="mj-modal-sub">填写基础信息后进入组卷，考试发布前可再次修改。</p>
        <Form
          form={examForm}
          layout="vertical"
          preserve={false}
          initialValues={{
            subject: '数据结构与算法',
            mode: '闭卷机考',
            duration: 120,
            total: 100,
            camera: true,
            double: false,
          }}
        >
          <Form.Item
            label="考试名称"
            name="name"
            rules={[{ required: true, message: '请输入考试名称' }]}
          >
            <Input placeholder="例：《数据结构与算法》期末考试" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="科目" name="subject">
                <Select
                  options={[
                    { value: '数据结构与算法', label: '数据结构与算法' },
                    { value: '大学英语（三）', label: '大学英语（三）' },
                    { value: '线性代数', label: '线性代数' },
                    { value: '计算机网络', label: '计算机网络' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="考试方式" name="mode">
                <Select
                  options={[
                    { value: '闭卷机考', label: '闭卷机考' },
                    { value: '开卷机考', label: '开卷机考' },
                    { value: '随堂测验', label: '随堂测验' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="考试时长（分钟）" name="duration">
                <InputNumber min={10} step={5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="试卷总分" name="total">
                <InputNumber min={10} step={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="camera" valuePropName="checked" style={{ marginBottom: 8 }}>
            <Checkbox>启用摄像头监考与切屏记录</Checkbox>
          </Form.Item>
          <Form.Item name="double" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Checkbox>启用主观题双评（差异超 10% 触发仲裁）</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="成绩明细导出"
        open={scoreModalOpen}
        onCancel={() => setScoreModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setScoreModalOpen(false)}>
            取消
          </Button>,
          <Button
            key="export"
            type="primary"
            loading={scoreExporting}
            onClick={handleExportScores}
          >
            导出
          </Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select
            style={{ width: '100%' }}
            placeholder="请选择班级"
            allowClear
            value={scoreClassId}
            onChange={setScoreClassId}
            options={scoreOptions?.classes.map((item) => ({ value: item.id, label: item.name }))}
          />
          <Select
            style={{ width: '100%' }}
            placeholder="请选择科目"
            allowClear
            value={scoreCourseId}
            onChange={setScoreCourseId}
            options={scoreOptions?.courses.map((item) => ({ value: item.id, label: item.name }))}
          />
          <span>不选班级/科目则导出全部数据</span>
        </Space>
      </Modal>

      {data && isStudent && (
        <>
          <Row gutter={[16, 16]} className="dashboard-stats">
            <Col xs={12} md={6}>
              <StatCard
                label="可参加考试"
                value={data.stats.available_exams}
                icon={<FileTextOutlined />}
              />
            </Col>
            <Col xs={12} md={6}>
              <StatCard
                label="我的考试次数"
                value={data.stats.my_exam_count}
                icon={<HistoryOutlined />}
              />
            </Col>
            <Col xs={12} md={6}>
              <StatCard
                label="平均分"
                value={data.stats.avg_score}
                icon={<CheckCircleOutlined />}
                tone="success"
              />
            </Col>
            <Col xs={12} md={6}>
              <StatCard
                label="通过率"
                value={data.stats.pass_rate}
                suffix="%"
                icon={<PercentageOutlined />}
                tone="success"
              />
            </Col>
          </Row>

          <div className="dashboard-charts">
            <PageCard className="dashboard-section dashboard-chart-card">
              <h3 className="dashboard-section-title">最近成绩与及格线</h3>
              {data.recent_records.length === 0 ? (
                <EmptyState title="还没有考试记录" description="参加考试后成绩会显示在这里" />
              ) : (
                <ChartBox>
                  {(width) => (
                    <EChart
                      className="dashboard-chart"
                      option={buildStudentScoreOption(data, chartTheme, width)}
                      ariaLabel="最近成绩与及格线图表"
                    />
                  )}
                </ChartBox>
              )}
            </PageCard>
            <PageCard className="dashboard-section dashboard-chart-card">
              <h3 className="dashboard-section-title">考试通过率</h3>
              {data.stats.my_exam_count === 0 ? (
                <EmptyState title="暂无通过率数据" description="参加考试后会显示通过率" />
              ) : (
                <EChart
                  className="dashboard-chart"
                  option={buildStudentPassRateOption(data, chartTheme)}
                  ariaLabel="考试通过率图表"
                />
              )}
            </PageCard>
          </div>

          <PageCard className="dashboard-section">
            <h3 className="dashboard-section-title">即将开始的考试</h3>
            {data.upcoming_exams.length === 0 ? (
              <EmptyState title="近期暂无考试" description="有新考试发布后会显示在这里" />
            ) : (
              <div className="dashboard-list">
                {data.upcoming_exams.map((e) => (
                  <div key={e.id} className="dashboard-list-item">
                    <div>
                      <p className="dashboard-list-title">{e.title}</p>
                      <p className="dashboard-list-meta">
                        {dayjs(e.start_time).toLocaleString()} · {e.duration} 分钟
                      </p>
                    </div>
                    <Button type="primary" onClick={() => navigate('/exams')}>
                      去参加
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </PageCard>

          <PageCard className="dashboard-section">
            <h3 className="dashboard-section-title">最近成绩</h3>
            {data.recent_records.length === 0 ? (
              <EmptyState title="还没有考试记录" description="参加考试后成绩会显示在这里" />
            ) : (
              <div className="dashboard-list">
                {data.recent_records.map((r) => (
                  <div key={r.id} className="dashboard-list-item">
                    <div>
                      <p className="dashboard-list-title">{r.exam_title}</p>
                      <p className="dashboard-list-meta">
                        得分 {r.score} / 及格 {r.pass_score} · {r.submit_time ? dayjs(r.submit_time).toLocaleString() : ''}
                      </p>
                    </div>
                    <StatusTag status={r.score >= r.pass_score ? 'passed' : 'failed'} />
                  </div>
                ))}
              </div>
            )}
          </PageCard>
        </>
      )}

      {data && isTeacher && (
        <>
          <Row gutter={[16, 16]} className="dashboard-stats">
            <Col xs={12} md={6}>
              <StatCard
                label="已发布考试"
                value={data.stats.published_exams}
                icon={<AuditOutlined />}
              />
            </Col>
            <Col xs={12} md={6}>
              <StatCard
                label="待批改题目"
                value={data.stats.pending_grading_count}
                icon={<CheckCircleOutlined />}
                tone="warning"
              />
            </Col>
            <Col xs={12} md={6}>
              <StatCard
                label="我的课程"
                value={data.stats.course_count}
                icon={<BookOutlined />}
              />
            </Col>
            <Col xs={12} md={6}>
              <StatCard
                label="累计作答"
                value={data.stats.total_records}
                icon={<HistoryOutlined />}
              />
            </Col>
          </Row>

          <div className="dashboard-charts">
            <PageCard className="dashboard-section dashboard-chart-card">
              <h3 className="dashboard-section-title">待批改题目数量</h3>
              {data.pending_grading.length === 0 ? (
                <EmptyState title="没有待批改题目" description="所有主观题都已批改完成" />
              ) : (
                <EChart
                  className="dashboard-chart"
                  option={buildTeacherPendingOption(data, chartTheme)}
                  ariaLabel="待批改题目数量图表"
                />
              )}
            </PageCard>
            <PageCard className="dashboard-section dashboard-chart-card">
              <h3 className="dashboard-section-title">最近考试时间线</h3>
              {data.recent_exams.length === 0 ? (
                <EmptyState title="还没有考试" />
              ) : (
                <EChart
                  className="dashboard-chart"
                  option={buildTeacherRecentExamOption(data, chartTheme)}
                  ariaLabel="最近考试时间线图表"
                />
              )}
            </PageCard>
          </div>

          <Row gutter={[16, 16]}>
            <Col xs={24} md={14}>
              <PageCard className="dashboard-section">
                <h3 className="dashboard-section-title">待批改提醒</h3>
                {data.pending_grading.length === 0 ? (
                  <EmptyState title="没有待批改题目" description="所有主观题都已批改完成" />
                ) : (
                  <div className="dashboard-list">
                    {data.pending_grading.map((p) => (
                      <div key={p.exam_id} className="dashboard-list-item">
                        <div>
                          <p className="dashboard-list-title">{p.exam_title}</p>
                          <p className="dashboard-list-meta">{p.pending_count} 道题目待批改</p>
                        </div>
                        <Button onClick={() => navigate('/grading')}>去阅卷</Button>
                      </div>
                    ))}
                  </div>
                )}
              </PageCard>
            </Col>
            <Col xs={24} md={10}>
              <PageCard className="dashboard-section">
                <h3 className="dashboard-section-title">最近考试</h3>
                {data.recent_exams.length === 0 ? (
                  <EmptyState title="还没有考试" />
                ) : (
                  <div className="dashboard-list">
                    {data.recent_exams.map((e) => (
                      <div key={e.id} className="dashboard-list-item">
                        <div>
                          <p className="dashboard-list-title">{e.title}</p>
                          <p className="dashboard-list-meta">
                            {dayjs(e.start_time).toLocaleString()}
                          </p>
                        </div>
                        <Button onClick={() => navigate('/exams')}>管理</Button>
                      </div>
                    ))}
                  </div>
                )}
              </PageCard>
            </Col>
          </Row>
        </>
      )}

      {data?.role === 'admin' && (
        <>
          <Row gutter={[16, 16]} className="dashboard-stats">
            <Col xs={12} md={6}>
              <StatCard
                label="学生"
                value={data.stats.student_count}
                icon={<UserOutlined />}
              />
            </Col>
            <Col xs={12} md={6}>
              <StatCard
                label="教师"
                value={data.stats.teacher_count}
                icon={<TeamOutlined />}
              />
            </Col>
            <Col xs={12} md={6}>
              <StatCard
                label="管理员"
                value={data.stats.admin_count}
                icon={<AuditOutlined />}
              />
            </Col>
            <Col xs={12} md={6}>
              <StatCard
                label="考试总数"
                value={data.stats.exam_count}
                icon={<FileTextOutlined />}
              />
            </Col>
          </Row>

          <div className="dashboard-charts dashboard-charts-three">
            <PageCard className="dashboard-section dashboard-chart-card">
              <h3 className="dashboard-section-title">用户角色分布</h3>
              {data.role_distribution.length === 0 ? (
                <EmptyState title="暂无角色分布数据" />
              ) : (
                <EChart
                  className="dashboard-chart"
                  option={buildAdminRoleOption(data, chartTheme)}
                  ariaLabel="用户角色分布图表"
                />
              )}
            </PageCard>
            <PageCard className="dashboard-section dashboard-chart-card">
              <h3 className="dashboard-section-title">考试状态分布</h3>
              {data.exam_status_distribution.length === 0 ? (
                <EmptyState title="暂无考试数据" />
              ) : (
                <EChart
                  className="dashboard-chart"
                  option={buildAdminExamStatusOption(data, chartTheme)}
                  ariaLabel="考试状态分布图表"
                />
              )}
            </PageCard>
            <PageCard className="dashboard-section dashboard-chart-card">
              <h3 className="dashboard-section-title">各课程考试数量</h3>
              {data.exams_per_course.length === 0 ? (
                <EmptyState title="暂无课程数据" />
              ) : (
                <ChartBox>
                  {(width) => (
                    <EChart
                      className="dashboard-chart"
                      option={buildAdminCourseExamOption(data, chartTheme, width)}
                      ariaLabel="各课程考试数量图表"
                    />
                  )}
                </ChartBox>
              )}
            </PageCard>
            <PageCard className="dashboard-section dashboard-chart-card">
              <h3 className="dashboard-section-title">各考试平均分</h3>
              {data.exam_avg_scores.length === 0 ? (
                <EmptyState title="暂无成绩数据" />
              ) : (
                <ChartBox>
                  {(width) => (
                    <EChart
                      className="dashboard-chart"
                      option={buildAdminExamAvgOption(data, chartTheme, width)}
                      ariaLabel="各考试平均分图表"
                    />
                  )}
                </ChartBox>
              )}
            </PageCard>
            <PageCard className="dashboard-section dashboard-chart-card">
              <h3 className="dashboard-section-title">各考试及格率</h3>
              {data.exam_pass_rates.length === 0 ? (
                <EmptyState title="暂无成绩数据" />
              ) : (
                <ChartBox>
                  {(width) => (
                    <EChart
                      className="dashboard-chart"
                      option={buildAdminExamPassRateOption(data, chartTheme, width)}
                      ariaLabel="各考试及格率图表"
                    />
                  )}
                </ChartBox>
              )}
            </PageCard>
            <PageCard className="dashboard-section dashboard-chart-card">
              <h3 className="dashboard-section-title">成绩分布</h3>
              {data.score_distribution.every((item) => item.count === 0) ? (
                <EmptyState title="暂无成绩数据" />
              ) : (
                <ChartBox>
                  {(width) => (
                    <EChart
                      className="dashboard-chart"
                      option={buildAdminScoreDistOption(data, chartTheme, width)}
                      ariaLabel="成绩分布图表"
                    />
                  )}
                </ChartBox>
              )}
            </PageCard>
            <PageCard className="dashboard-section dashboard-chart-card">
              <h3 className="dashboard-section-title">各考试参与人数</h3>
              {data.exam_participation.length === 0 ? (
                <EmptyState title="暂无参与数据" />
              ) : (
                <ChartBox>
                  {(width) => (
                    <EChart
                      className="dashboard-chart"
                      option={buildAdminExamParticipationOption(data, chartTheme, width)}
                      ariaLabel="各考试参与人数图表"
                    />
                  )}
                </ChartBox>
              )}
            </PageCard>
            <PageCard className="dashboard-section dashboard-chart-card">
              <h3 className="dashboard-section-title">各考试待批改量</h3>
              {data.pending_grading_by_exam.length === 0 ? (
                <EmptyState title="暂无待批改数据" />
              ) : (
                <ChartBox>
                  {(width) => (
                    <EChart
                      className="dashboard-chart"
                      option={buildAdminPendingOption(data, chartTheme, width)}
                      ariaLabel="各考试待批改量图表"
                    />
                  )}
                </ChartBox>
              )}
            </PageCard>
            <PageCard className="dashboard-section dashboard-chart-card">
              <h3 className="dashboard-section-title">各考试切屏次数</h3>
              {data.switch_counts_by_exam.length === 0 ? (
                <EmptyState title="暂无切屏数据" />
              ) : (
                <ChartBox>
                  {(width) => (
                    <EChart
                      className="dashboard-chart"
                      option={buildAdminSwitchOption(data, chartTheme, width)}
                      ariaLabel="各考试切屏次数图表"
                    />
                  )}
                </ChartBox>
              )}
            </PageCard>
            <PageCard className="dashboard-section dashboard-chart-card">
              <h3 className="dashboard-section-title">班级学生分布</h3>
              {data.class_student_distribution.length === 0 ? (
                <EmptyState title="暂无班级数据" />
              ) : (
                <ChartBox>
                  {(width) => (
                    <EChart
                      className="dashboard-chart"
                      option={buildAdminClassDistOption(data, chartTheme, width)}
                      ariaLabel="班级学生分布图表"
                    />
                  )}
                </ChartBox>
              )}
            </PageCard>
          </div>

          <Row gutter={[16, 16]}>
            <Col xs={24}>
              <PageCard className="dashboard-section">
                <h3 className="dashboard-section-title">最近注册用户</h3>
                {data.recent_users.length === 0 ? (
                  <EmptyState title="暂无用户" />
                ) : (
                  <div className="dashboard-list">
                    {data.recent_users.map((u) => (
                      <div key={u.id} className="dashboard-list-item">
                        <div>
                          <p className="dashboard-list-title">{u.name}</p>
                          <p className="dashboard-list-meta">
                            {u.username} · {dayjs(u.created_at).toLocaleString()}
                          </p>
                        </div>
                        <Button onClick={() => navigate('/users')}>管理</Button>
                      </div>
                    ))}
                  </div>
                )}
              </PageCard>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
};

export default Dashboard;
