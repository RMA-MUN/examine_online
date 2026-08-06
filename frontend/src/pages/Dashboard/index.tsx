import React, { useEffect, useState } from 'react';
import { App, Row, Col, Card, Statistic, Button, Modal, Select, Space } from 'antd';
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
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { exportScores, getDashboard, getScoreExportOptions } from '../../api/statistics';
import type { DashboardData } from '../../types/dashboard';
import type { ScoreExportOptions } from '../../types/scoreExport';
import dayjs from 'dayjs';
import useAuthStore from '../../store/auth';
import StatusTag from '../../components/StatusTag';
import EmptyState from '../../components/EmptyState';
import PageCard from '../../components/PageCard';
import SkeletonGrid from '../../components/SkeletonGrid';
import EChart from '../../components/EChart';
import { downloadDashboardFile } from '../../utils/dashboardExport';
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

const Dashboard = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const [scoreOptions, setScoreOptions] = useState<ScoreExportOptions | null>(null);
  const [scoreClassId, setScoreClassId] = useState<number | undefined>();
  const [scoreCourseId, setScoreCourseId] = useState<number | undefined>();
  const [scoreExporting, setScoreExporting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await getDashboard();
        setData(res.data);
      } catch (error) {
        message.error('获取仪表盘数据失败');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <SkeletonGrid count={4} columns={2} />;
  }

  if (!data) {
    return (
      <EmptyState
        title="暂无数据"
        description="仪表盘数据加载失败或暂不可用"
        action={
          <Button
            type="primary"
            onClick={() => window.location.reload()}
          >
            重新加载
          </Button>
        }
      />
    );
  }

  const isStudent = data.role === 'student';
  const isTeacher = data.role === 'teacher';

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

  return (
    <div className="dashboard">
      <div className="dashboard-toolbar">
        <Button
          icon={<FileExcelOutlined />}
          loading={scoreExporting}
          onClick={openScoreExport}
          hidden={isStudent}
        >
          成绩明细导出
        </Button>
      </div>
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
      <div className="dashboard-banner">
        <h1 className="dashboard-banner-title">
          你好,{user?.name || user?.username}
        </h1>
        <p className="dashboard-banner-subtitle">
          {isStudent
            ? `当前有 ${data.stats.available_exams} 场考试可参加，合理安排时间`
            : isTeacher
            ? `有 ${data.stats.pending_grading_count} 道题目待批改,尽快处理`
            : '欢迎使用π考在线考试系统管理端'}
        </p>
      </div>

      {isStudent && (
        <>
          <Row gutter={[16, 16]} className="dashboard-stats">
            <Col xs={12} md={6}>
              <Card className="stat-card">
                <Statistic title="可参加考试" value={data.stats.available_exams} prefix={<FileTextOutlined />} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card className="stat-card">
                <Statistic title="我的考试次数" value={data.stats.my_exam_count} prefix={<HistoryOutlined />} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card className="stat-card">
                <Statistic title="平均分" value={data.stats.avg_score} prefix={<CheckCircleOutlined />} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card className="stat-card">
                <Statistic title="通过率" value={data.stats.pass_rate} suffix="%" prefix={<PercentageOutlined />} />
              </Card>
            </Col>
          </Row>

          <div className="dashboard-charts">
            <PageCard className="dashboard-section dashboard-chart-card">
              <h3 className="dashboard-section-title">最近成绩与及格线</h3>
              {data.recent_records.length === 0 ? (
                <EmptyState title="还没有考试记录" description="参加考试后成绩会显示在这里" />
              ) : (
                <EChart
                  className="dashboard-chart"
                  option={buildStudentScoreOption(data)}
                  ariaLabel="最近成绩与及格线图表"
                />
              )}
            </PageCard>
            <PageCard className="dashboard-section dashboard-chart-card">
              <h3 className="dashboard-section-title">考试通过率</h3>
              {data.stats.my_exam_count === 0 ? (
                <EmptyState title="暂无通过率数据" description="参加考试后会显示通过率" />
              ) : (
                <EChart
                  className="dashboard-chart"
                  option={buildStudentPassRateOption(data)}
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

      {isTeacher && (
        <>
          <Row gutter={[16, 16]} className="dashboard-stats">
            <Col xs={12} md={6}>
              <Card className="stat-card">
                <Statistic title="已发布考试" value={data.stats.published_exams} prefix={<AuditOutlined />} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card className="stat-card">
                <Statistic title="待批改题目" value={data.stats.pending_grading_count} prefix={<CheckCircleOutlined />} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card className="stat-card">
                <Statistic title="我的课程" value={data.stats.course_count} prefix={<BookOutlined />} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card className="stat-card">
                <Statistic title="累计作答" value={data.stats.total_records} prefix={<HistoryOutlined />} />
              </Card>
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
                  option={buildTeacherPendingOption(data)}
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
                  option={buildTeacherRecentExamOption(data)}
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

      {data.role === 'admin' && (
        <>
          <Row gutter={[16, 16]} className="dashboard-stats">
            <Col xs={12} md={6}>
              <Card className="stat-card">
                <Statistic title="学生" value={data.stats.student_count} prefix={<UserOutlined />} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card className="stat-card">
                <Statistic title="教师" value={data.stats.teacher_count} prefix={<TeamOutlined />} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card className="stat-card">
                <Statistic title="管理员" value={data.stats.admin_count} prefix={<AuditOutlined />} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card className="stat-card">
                <Statistic title="考试总数" value={data.stats.exam_count} prefix={<FileTextOutlined />} />
              </Card>
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
                  option={buildAdminRoleOption(data)}
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
                  option={buildAdminExamStatusOption(data)}
                  ariaLabel="考试状态分布图表"
                />
              )}
            </PageCard>
            <PageCard className="dashboard-section dashboard-chart-card">
              <h3 className="dashboard-section-title">各课程考试数量</h3>
              {data.exams_per_course.length === 0 ? (
                <EmptyState title="暂无课程数据" />
              ) : (
                <EChart
                  className="dashboard-chart"
                  option={buildAdminCourseExamOption(data)}
                  ariaLabel="各课程考试数量图表"
                />
              )}
            </PageCard>
            <PageCard className="dashboard-section dashboard-chart-card">
              <h3 className="dashboard-section-title">各考试平均分</h3>
              {data.exam_avg_scores.length === 0 ? (
                <EmptyState title="暂无成绩数据" />
              ) : (
                <EChart
                  className="dashboard-chart"
                  option={buildAdminExamAvgOption(data)}
                  ariaLabel="各考试平均分图表"
                />
              )}
            </PageCard>
            <PageCard className="dashboard-section dashboard-chart-card">
              <h3 className="dashboard-section-title">各考试及格率</h3>
              {data.exam_pass_rates.length === 0 ? (
                <EmptyState title="暂无成绩数据" />
              ) : (
                <EChart
                  className="dashboard-chart"
                  option={buildAdminExamPassRateOption(data)}
                  ariaLabel="各考试及格率图表"
                />
              )}
            </PageCard>
            <PageCard className="dashboard-section dashboard-chart-card">
              <h3 className="dashboard-section-title">成绩分布</h3>
              {data.score_distribution.every((item) => item.count === 0) ? (
                <EmptyState title="暂无成绩数据" />
              ) : (
                <EChart
                  className="dashboard-chart"
                  option={buildAdminScoreDistOption(data)}
                  ariaLabel="成绩分布图表"
                />
              )}
            </PageCard>
            <PageCard className="dashboard-section dashboard-chart-card">
              <h3 className="dashboard-section-title">各考试参与人数</h3>
              {data.exam_participation.length === 0 ? (
                <EmptyState title="暂无参与数据" />
              ) : (
                <EChart
                  className="dashboard-chart"
                  option={buildAdminExamParticipationOption(data)}
                  ariaLabel="各考试参与人数图表"
                />
              )}
            </PageCard>
            <PageCard className="dashboard-section dashboard-chart-card">
              <h3 className="dashboard-section-title">各考试待批改量</h3>
              {data.pending_grading_by_exam.length === 0 ? (
                <EmptyState title="暂无待批改数据" />
              ) : (
                <EChart
                  className="dashboard-chart"
                  option={buildAdminPendingOption(data)}
                  ariaLabel="各考试待批改量图表"
                />
              )}
            </PageCard>
            <PageCard className="dashboard-section dashboard-chart-card">
              <h3 className="dashboard-section-title">各考试切屏次数</h3>
              {data.switch_counts_by_exam.length === 0 ? (
                <EmptyState title="暂无切屏数据" />
              ) : (
                <EChart
                  className="dashboard-chart"
                  option={buildAdminSwitchOption(data)}
                  ariaLabel="各考试切屏次数图表"
                />
              )}
            </PageCard>
            <PageCard className="dashboard-section dashboard-chart-card">
              <h3 className="dashboard-section-title">班级学生分布</h3>
              {data.class_student_distribution.length === 0 ? (
                <EmptyState title="暂无班级数据" />
              ) : (
                <EChart
                  className="dashboard-chart"
                  option={buildAdminClassDistOption(data)}
                  ariaLabel="班级学生分布图表"
                />
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
