import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Form, Input, Modal, Pagination, Select } from 'antd';
import { Link } from 'react-router-dom';
import axios from '../../api/axios';
import { getUsers, importUsersFile, resetUserPassword } from '../../api/users';
import { getClasses } from '../../api/classes';
import type { ApiResponse, Paginated } from '../../types/api';
import type { User, UserRole } from '../../types/user';
import type { Class } from '../../types/class';
import './index.css';

type TabKey = 'users' | 'roles' | 'params' | 'integrations' | 'logs';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'users', label: '用户管理' },
  { key: 'roles', label: '角色与权限' },
  { key: 'params', label: '考试参数' },
  { key: 'integrations', label: '集成与安全' },
  { key: 'logs', label: '操作日志' },
];

/** 角色矩阵：23 项照抄参考 admin.html；后端仅 student/teacher/admin 三角色，teacher 取教师/阅卷教师并集，admin 取教务/系统管理员并集。 */
const PERM_GROUPS: Array<{ cat: string; items: string[] }> = [
  { cat: '考试', items: ['查看考试列表与安排', '进入并作答考试', '创建 / 编辑考试', '结束考试并强制交卷'] },
  { cat: '阅卷', items: ['查看阅卷队列', '提交主观题评分', '发起双评与仲裁', '批量调整分值'] },
  { cat: '题库', items: ['浏览与检索题库', '新建 / 编辑题目', '审核题目入库', '导出题库'] },
  { cat: '成绩', items: ['查看个人成绩', '查看班级成绩分析', '发布成绩', '导出成绩报表'] },
  { cat: '监考', items: ['查看监控墙', '下发警告 / 处置异常', '配置防作弊策略'] },
  { cat: '系统', items: ['查看操作日志', '管理用户与角色', '修改系统参数', '管理数据备份'] },
];

const PERM_DEFAULT: Record<string, [boolean, boolean, boolean]> = {
  '查看考试列表与安排': [true, true, true],
  '进入并作答考试': [true, false, true],
  '创建 / 编辑考试': [false, true, true],
  '结束考试并强制交卷': [false, false, true],
  '查看阅卷队列': [false, true, true],
  '提交主观题评分': [false, true, true],
  '发起双评与仲裁': [false, true, true],
  '批量调整分值': [false, true, true],
  '浏览与检索题库': [false, true, true],
  '新建 / 编辑题目': [false, true, true],
  '审核题目入库': [false, false, true],
  '导出题库': [false, true, true],
  '查看个人成绩': [true, false, true],
  '查看班级成绩分析': [false, true, true],
  '发布成绩': [false, false, true],
  '导出成绩报表': [false, true, true],
  '查看监控墙': [false, true, true],
  '下发警告 / 处置异常': [false, true, true],
  '配置防作弊策略': [false, false, true],
  '查看操作日志': [false, false, true],
  '管理用户与角色': [false, false, true],
  '修改系统参数': [false, false, true],
  '管理数据备份': [false, false, true],
};

/** 审计日志行（GET /api/admin/logs 分页 items）。 */
interface AdminLog {
  id: number;
  actor_id: number | null;
  action: string;
  target_type: string | null;
  target_id: number | null;
  ip: string | null;
  detail: unknown;
  created_at: string;
}

const LOG_TYPE_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'user.', label: '用户' },
  { value: 'exam.', label: '考试' },
  { value: 'grade.', label: '阅卷' },
  { value: 'system_', label: '系统' },
];

/** 系统参数 key（11 个，后端白名单）：文本 5 + 开关 6，与 switchLabels 一一对应。 */
const SWITCH_PARAM_KEYS = [
  'switch.show_objective_score',
  'switch.show_answer',
  'switch.auto_objective',
  'switch.ai_assist',
  'switch.double_review_audit',
  'switch.allow_appeal',
];

interface ResetPwdFormValues {
  new_password: string;
}

const ROLE_PILL: Record<string, string> = {
  student: 'pill-neutral',
  teacher: 'pill-ok',
  admin: 'pill-info',
};

const ROLE_LABEL: Record<string, string> = {
  student: '学生',
  teacher: '教师',
  admin: '管理员',
};

function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      className="sw"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
    />
  );
}

const Admin = () => {
  const { message } = App.useApp();
  const [tab, setTab] = useState<TabKey>('users');

  // users Tab：复用 UserManage 数据逻辑（getUsers/getClasses），换 .ds-table 皮肤
  const [users, setUsers] = useState<User[]>([]);
  const [usersTotal, setUsersTotal] = useState<number | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [classesTotal, setClassesTotal] = useState<number | null>(null);
  const [kw, setKw] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');

  // users Tab：批量导入（隐藏 file input，经 importUsersFile 落盘）
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // users Tab：行内重置密码 Modal
  const [pwdUser, setPwdUser] = useState<User | null>(null);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdForm] = Form.useForm<ResetPwdFormValues>();

  const refreshUsers = () => {
    getUsers({ page: 1, page_size: 100 })
      .then((res) => {
        setUsers(res.data.items || []);
        setUsersTotal(typeof res.data.total === 'number' ? res.data.total : (res.data.items || []).length);
      })
      .catch(() => message.error('获取用户列表失败'));
  };

  // params Tab：GET/PUT /api/admin/params（11 个 key，开关值为 "true"/"false" 字符串）
  const [dur, setDur] = useState('120');
  const [pass, setPass] = useState('60');
  const [save, setSave] = useState('15');
  const [grace, setGrace] = useState('60');
  const [maxSwitch, setMaxSwitch] = useState('3');
  const [switches, setSwitches] = useState<boolean[]>([true, false, true, true, true, true]);
  const switchLabels = [
    '交卷后立即显示客观题得分',
    '交卷后显示参考答案',
    '客观题自动判分',
    '主观题机器预判（辅助）',
    '成绩发布需二次审核',
    '允许学生成绩申诉',
  ];
  const toggleSwitch = (i: number) =>
    setSwitches((prev) => prev.map((v, idx) => (idx === i ? !v : v)));

  const applyParams = (map: Record<string, string>) => {
    if (map['default.duration'] != null) setDur(map['default.duration']);
    if (map['default.pass_score'] != null) setPass(map['default.pass_score']);
    if (map['default.save_interval'] != null) setSave(map['default.save_interval']);
    if (map['default.grace_seconds'] != null) setGrace(map['default.grace_seconds']);
    if (map['default.max_switch'] != null) setMaxSwitch(map['default.max_switch']);
    setSwitches(SWITCH_PARAM_KEYS.map((k) => map[k] === 'true'));
  };

  const loadParams = () => {
    axios
      .get('/api/admin/params')
      .then((res: unknown) => {
        const map = (res as ApiResponse<Record<string, string>>)?.data ?? {};
        applyParams(map);
      })
      .catch(() => message.error('获取系统参数失败'));
  };

  const handleSaveParams = async () => {
    const items: Record<string, string> = {
      'default.duration': dur,
      'default.pass_score': pass,
      'default.save_interval': save,
      'default.grace_seconds': grace,
      'default.max_switch': maxSwitch,
    };
    SWITCH_PARAM_KEYS.forEach((k, i) => {
      items[k] = switches[i] ? 'true' : 'false';
    });
    try {
      await axios.put('/api/admin/params', { items });
      message.success('参数已保存');
    } catch {
      message.error('保存参数失败');
    }
  };

  // logs Tab：GET /api/admin/logs 分页（page/page_size），type 为 action 前缀过滤
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [logPage, setLogPage] = useState(1);
  const [logPageSize, setLogPageSize] = useState(10);
  const [logTotal, setLogTotal] = useState(0);
  const [logType, setLogType] = useState('');

  useEffect(() => {
    refreshUsers();
    getClasses({ page: 1, page_size: 100 })
      .then((res) => {
        setClasses(res.data.items || []);
        setClassesTotal(typeof res.data.total === 'number' ? res.data.total : (res.data.items || []).length);
      })
      .catch(() => {});
    loadParams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const params: Record<string, unknown> = { page: logPage, page_size: logPageSize };
    if (logType) params.type = logType;
    axios
      .get('/api/admin/logs', { params })
      .then((res: unknown) => {
        const d = (res as ApiResponse<Paginated<AdminLog>>)?.data;
        setLogs(d?.items ?? []);
        setLogTotal(d?.total ?? 0);
      })
      .catch(() => message.error('获取操作日志失败'));
  }, [logPage, logPageSize, logType, message]);

  const filteredUsers = useMemo(() => {
    const k = kw.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (stateFilter !== 'all') {
        const st = u.is_active ? '正常' : '停用';
        if (st !== stateFilter) return false;
      }
      if (k && `${u.name}${u.username}`.toLowerCase().indexOf(k) < 0) return false;
      return true;
    });
  }, [users, kw, roleFilter, stateFilter]);

  const classNameOf = (u: User) =>
    u.class_id ? classes.find((c) => c.id === u.class_id)?.name ?? String(u.class_id) : '—';

  // roles Tab：只读矩阵（后端仅 student/teacher/admin 三角色，无权限矩阵接口）
  const [perms] = useState(PERM_DEFAULT);

  const handleImportFile = async (file: File) => {
    setImporting(true);
    try {
      const res = (await importUsersFile(file)) as unknown as {
        code?: number;
        data?: { errors?: Array<{ row?: number; error?: string }>; imported_count?: number };
      };
      // 后端解析失败回 code 400（HTTP 400 通常走 catch；此处防 HTTP 200 夹带 code 400 的误报）
      if (res?.code !== 200 && res?.code !== 201) {
        const errs = res?.data?.errors;
        const rows = Array.isArray(errs) ? errs.map((e) => `第${e.row}行${e.error ?? ''}`).join('；') : '';
        message.error(rows ? `用户导入失败：${rows}` : '用户导入失败');
        return;
      }
      const n = res?.data?.imported_count ?? 0;
      const errs = res?.data?.errors;
      const rows = Array.isArray(errs) ? errs.map((e) => `第${e.row}行${e.error ?? ''}`).join('；') : '';
      if (rows) {
        message.error(`成功 ${n}，失败 ${Array.isArray(errs) ? errs.length : 0}：${rows}`);
      } else {
        message.success(`用户导入成功，共 ${n} 个`);
      }
      refreshUsers();
    } catch (err: unknown) {
      // HTTP 400 夹带 errors（如行级解析失败）：复用“第X行”格式透出
      const errs = (err as { response?: { data?: { data?: { errors?: Array<{ row?: number; error?: string }> } } } })
        ?.response?.data?.data?.errors;
      const rows = Array.isArray(errs) ? errs.map((e) => `第${e.row}行${e.error ?? ''}`).join('；') : '';
      message.error(rows ? `用户导入失败：${rows}` : '用户导入失败');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleResetPassword = async () => {
    try {
      const values = await pwdForm.validateFields();
      if (!pwdUser) return;
      setPwdSaving(true);
      try {
        await resetUserPassword(pwdUser.id, values.new_password);
        message.success('密码已重置');
        setPwdUser(null);
        pwdForm.resetFields();
      } catch {
        message.error('重置密码失败');
      } finally {
        setPwdSaving(false);
      }
    } catch {
      /* 表单校验未通过，不做处理 */
    }
  };

  return (
    <div className="mj-admin">
      <section className="page-head">
        <div>
          <h1 className="title-lg">系统管理</h1>
          <p className="page-sub">用户与角色、考试参数、集成与安全、操作日志</p>
        </div>
      </section>

      <section className="panel">
        <div className="tabs" role="tablist" aria-label="系统管理页签">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={tab === t.key ? 'on' : ''}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'users' && (
          <div className="panel-body">
            <div className="toolbar" style={{ marginBottom: 14 }}>
              <Input.Search
                placeholder="搜索姓名 / 工号"
                aria-label="搜索用户"
                style={{ width: 280 }}
                value={kw}
                onChange={(e) => setKw(e.target.value)}
              />
              <Select
                aria-label="角色筛选"
                style={{ width: 150 }}
                value={roleFilter}
                onChange={setRoleFilter}
                options={[
                  { value: 'all', label: '全部角色' },
                  { value: 'student', label: '学生' },
                  { value: 'teacher', label: '教师' },
                  { value: 'admin', label: '管理员' },
                ]}
              />
              <Select
                aria-label="状态筛选"
                style={{ width: 130 }}
                value={stateFilter}
                onChange={setStateFilter}
                options={[
                  { value: 'all', label: '全部状态' },
                  { value: '正常', label: '正常' },
                  { value: '停用', label: '停用' },
                ]}
              />
              <div className="grow" />
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx"
                hidden
                aria-label="选择用户导入文件"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImportFile(f);
                }}
              />
              <Button loading={importing} onClick={() => fileRef.current?.click()}>
                批量导入
              </Button>
              <Button type="primary">
                <Link to="/users">新建用户</Link>
              </Button>
            </div>
            <table className="ds-table">
              <thead>
                <tr>
                  <th>用户</th>
                  <th>用户名</th>
                  <th>角色</th>
                  <th>班级</th>
                  <th>状态</th>
                  <th style={{ width: 150 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span className="cell-strong">{u.name}</span>
                    </td>
                    <td className="num">{u.username}</td>
                    <td>
                      <span className={`pill ${ROLE_PILL[u.role] ?? 'pill-neutral'}`}>
                        {ROLE_LABEL[u.role] ?? (u.role as string)}
                      </span>
                    </td>
                    <td>{classNameOf(u)}</td>
                    <td>
                      <span className={`pill ${u.is_active ? 'pill-ok' : 'pill-warn'}`}>
                        <i className="pill-dot" />
                        {u.is_active ? '正常' : '停用'}
                      </span>
                    </td>
                    <td>
                      <Button type="link" size="small">
                        <Link to="/users">编辑</Link>
                      </Button>
                      <Button
                        type="link"
                        size="small"
                        onClick={() => {
                          setPwdUser(u);
                          pwdForm.resetFields();
                        }}
                      >
                        重置密码
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="meta" style={{ marginTop: 12 }}>
              共 {filteredUsers.length} 位用户，其中停用 {filteredUsers.filter((u) => !u.is_active).length} 位。
              {usersTotal != null && usersTotal > 100 && <span>仅显示前 100，共 {usersTotal} 条。</span>}
              {classesTotal != null && classesTotal > 100 && <span>班级仅显示前 100，共 {classesTotal} 条。</span>}
              完整管理前往 <Link className="link" to="/users">用户管理</Link> ·{' '}
              <Link className="link" to="/classes">班级管理</Link> ·{' '}
              <Link className="link" to="/teacher-subjects">教师学科分配</Link>
            </p>
            <Modal
              title={pwdUser ? `重置密码（${pwdUser.name}）` : '重置密码'}
              open={pwdUser != null}
              confirmLoading={pwdSaving}
              okText="确定"
              cancelText="取消"
              onOk={() => void handleResetPassword()}
              onCancel={() => {
                setPwdUser(null);
                pwdForm.resetFields();
              }}
            >
              <Form form={pwdForm} layout="vertical" preserve={false}>
                <Form.Item
                  name="new_password"
                  label="新密码"
                  rules={[
                    { required: true, message: '请输入新密码' },
                    { min: 6, message: '密码至少6位' },
                  ]}
                >
                  <Input.Password placeholder="至少6位" maxLength={64} />
                </Form.Item>
              </Form>
            </Modal>
          </div>
        )}

        {tab === 'roles' && (
          <div className="panel-body">
            <div className="between" style={{ marginBottom: 14 }}>
              <p className="page-sub" style={{ margin: 0 }}>
                后端仅 student / teacher / admin 三角色，该矩阵为只读说明文档，不可编辑。
              </p>
            </div>
            <table className="matrix">
              <thead>
                <tr>
                  <th style={{ width: 220 }}>权限</th>
                  <th>学生</th>
                  <th>教师</th>
                  <th>管理员</th>
                </tr>
              </thead>
              <tbody>
                {PERM_GROUPS.map((g) => (
                  <React.Fragment key={g.cat}>
                    <tr>
                      <td className="cat" colSpan={4}>
                        {g.cat}
                      </td>
                    </tr>
                    {g.items.map((it) => (
                      <tr key={it}>
                        <td>{it}</td>
                        {(['student', 'teacher', 'admin'] as UserRole[]).map((_, i) => (
                          <td key={i}>
                            <input
                              className="perm"
                              type="checkbox"
                              checked={perms[it]?.[i] ?? false}
                              disabled
                              aria-label={`${it} ${ROLE_LABEL[['student', 'teacher', 'admin'][i]]}`}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'params' && (
          <div className="panel-body">
            <div className="cols-2">
              <div className="stack">
                <div className="title-sm" style={{ marginBottom: 12 }}>
                  考试与阅卷默认参数
                </div>
                <div className="stack-sm" style={{ gap: 14 }}>
                  <div className="cols-2" style={{ gap: 12 }}>
                    <label className="field">
                      默认考试时长（分钟）
                      <input className="input num" value={dur} onChange={(e) => setDur(e.target.value)} />
                    </label>
                    <label className="field">
                      默认及格线（分）
                      <input className="input num" value={pass} onChange={(e) => setPass(e.target.value)} />
                    </label>
                  </div>
                  <div className="cols-2" style={{ gap: 12 }}>
                    <label className="field">
                      自动保存间隔（秒）
                      <input className="input num" value={save} onChange={(e) => setSave(e.target.value)} />
                    </label>
                    <label className="field">
                      断线宽限时间（秒）
                      <input className="input num" value={grace} onChange={(e) => setGrace(e.target.value)} />
                    </label>
                  </div>
                  <label className="field">
                    最大允许切屏次数（超出自动标记异常）
                    <input className="input num" value={maxSwitch} onChange={(e) => setMaxSwitch(e.target.value)} />
                  </label>
                </div>
              </div>
              <div className="stack">
                <div className="title-sm" style={{ marginBottom: 12 }}>
                  默认行为开关
                </div>
                <div className="stack-sm" style={{ gap: 4 }}>
                  {switchLabels.map((label, i) => (
                    <div className="between" style={{ minHeight: 44 }} key={label}>
                      <span style={{ fontSize: 13 }}>{label}</span>
                      <Switch checked={switches[i]} onChange={() => toggleSwitch(i)} label={label} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18, gap: 8 }}>
              <Button onClick={loadParams}>恢复默认</Button>
              <Button type="primary" onClick={() => void handleSaveParams()}>
                保存参数
              </Button>
            </div>
          </div>
        )}

        {tab === 'integrations' && (
          <div className="panel-body">
            <p className="page-sub" style={{ margin: 0 }}>
              身份与备份为部署运维项，见部署文档。
            </p>
          </div>
        )}

        {tab === 'logs' && (
          <div className="panel-body">
            <div className="toolbar" style={{ marginBottom: 14 }}>
              <Select
                aria-label="日志类型"
                style={{ width: 170 }}
                value={logType}
                onChange={(v) => {
                  setLogType(v);
                  setLogPage(1);
                }}
                options={LOG_TYPE_OPTIONS}
              />
            </div>
            {logs.length === 0 ? (
              <p className="meta">暂无操作日志。</p>
            ) : (
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>操作</th>
                    <th>操作人</th>
                    <th>IP</th>
                    <th>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <span className="cell-strong">{l.action}</span>
                      </td>
                      <td className="num">{l.actor_id ?? '—'}</td>
                      <td className="num">{l.ip ?? '—'}</td>
                      <td className="num">{l.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <Pagination
                current={logPage}
                pageSize={logPageSize}
                total={logTotal}
                showSizeChanger
                showTotal={(t: number) => `共 ${t} 条`}
                onChange={(p: number, ps: number) => {
                  setLogPage(p);
                  setLogPageSize(ps);
                }}
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default Admin;
