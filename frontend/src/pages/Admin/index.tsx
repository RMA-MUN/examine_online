import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Input, Select } from 'antd';
import { Link } from 'react-router-dom';
import { getUsers } from '../../api/users';
import { getClasses } from '../../api/classes';
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

/** 操作日志演示数据：照抄参考 admin.html LOGS（7 条）。 */
// TODO(backend): 操作日志暂无后端端点，当前为本地 mock，待审计日志接口落地后替换
const MOCK_LOGS = [
  { k: 'warn', ic: '!', t: '权限变更：教务管理员新增“配置防作弊策略”', m: '陈静 · 14:52:07 · IP 10.20.3.41' },
  { k: 'info', ic: 'i', t: '考试操作：结束《计算机网络》随堂测', m: '赵鹏 · 13:10:22 · 118 人正常交卷' },
  { k: 'ok', ic: '✓', t: '成绩发布：《大学英语（三）》期末机考', m: '陈静 · 11:38:55 · 410 人已发布' },
  { k: 'danger', ic: '!', t: '登录异常：连续 5 次密码错误，账号已锁定 30 分钟', m: 'sys · 09:14:03 · IP 118.24.61.7' },
  { k: 'info', ic: 'i', t: '系统参数：自动保存间隔由 30 秒调整为 15 秒', m: '系统运维 · 08:05:41' },
  { k: 'ok', ic: '✓', t: '数据备份：全量备份成功（42.7 GB）', m: '系统自动 · 06:00:00' },
  { k: 'info', ic: 'i', t: '用户导入：新增学生账号 62 个', m: '陈静 · 昨天 17:20:11' },
];

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
  const [classes, setClasses] = useState<Class[]>([]);
  const [kw, setKw] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');

  useEffect(() => {
    getUsers({ page: 1, page_size: 100 })
      .then((res) => setUsers(res.data.items || []))
      .catch(() => message.error('获取用户列表失败'));
    getClasses({ page: 1, page_size: 100 })
      .then((res) => setClasses(res.data.items || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // roles Tab：本地勾选（后端无权限矩阵接口）
  // TODO(backend): 权限矩阵保存暂无后端端点，当前仅本地 state，待角色权限接口落地后替换
  const [perms, setPerms] = useState(PERM_DEFAULT);
  const togglePerm = (item: string, idx: number) => {
    setPerms((prev) => {
      const cur = prev[item] ?? [false, false, false];
      const next = [cur[0], cur[1], cur[2]] as [boolean, boolean, boolean];
      next[idx] = !next[idx];
      return { ...prev, [item]: next };
    });
  };

  // params Tab：本地 state（无考试参数接口）
  // TODO(backend): 考试默认参数暂无后端端点，当前为本地 state，待系统参数接口落地后替换
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

  return (
    <div className="mj-admin">
      <section className="page-head">
        <div>
          <h1 className="title-lg">系统管理</h1>
          <p className="page-sub">用户与角色、考试参数、集成与安全、操作日志</p>
        </div>
        <div className="toolbar">
          <span className="meta">最近配置变更：14:52 · 陈静</span>
          <Button onClick={() => message.info('配置导出为演示按钮')}>导出配置</Button>
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
              <Button onClick={() => message.info('批量导入为演示按钮')}>批量导入</Button>
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
                      <Button type="link" size="small" onClick={() => message.info('重置密码为演示按钮')}>
                        重置密码
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="meta" style={{ marginTop: 12 }}>
              共 {filteredUsers.length} 位用户，其中停用 {filteredUsers.filter((u) => !u.is_active).length} 位。
              完整管理前往 <Link className="link" to="/users">用户管理</Link> ·{' '}
              <Link className="link" to="/classes">班级管理</Link> ·{' '}
              <Link className="link" to="/teacher-subjects">教师学科分配</Link>
            </p>
          </div>
        )}

        {tab === 'roles' && (
          <div className="panel-body">
            <div className="between" style={{ marginBottom: 14 }}>
              <p className="page-sub" style={{ margin: 0 }}>
                勾选表示该角色拥有对应权限。后端仅 student / teacher / admin 三角色（阅卷教师、教务管理员已合并展示）。
              </p>
              <Button
                type="primary"
                size="small"
                onClick={() => message.info('权限已保存（本地演示，后端接口待落地）')}
              >
                保存权限
              </Button>
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
                              onChange={() => togglePerm(it, i)}
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
              <Button
                onClick={() => {
                  setDur('120');
                  setPass('60');
                  setSave('15');
                  setGrace('60');
                  setMaxSwitch('3');
                }}
              >
                恢复默认
              </Button>
              <Button type="primary" onClick={() => message.info('参数已保存（本地演示，后端接口待落地）')}>
                保存参数
              </Button>
            </div>
          </div>
        )}

        {tab === 'integrations' && (
          <div className="panel-body">
            <div className="cols-2">
              <div className="stack">
                <div className="panel inner">
                  <div className="panel-head">
                    <span className="title-sm">身份与接入</span>
                    <span className="pill pill-ok">
                      <i className="pill-dot" />
                      已连接
                    </span>
                  </div>
                  <div className="panel-body stack-sm" style={{ gap: 12 }}>
                    <div className="between">
                      <span style={{ fontSize: 13 }}>统一身份认证（CAS / OAuth2）</span>
                      <span className="meta">cas.univ.edu.cn</span>
                    </div>
                    <div className="between">
                      <span style={{ fontSize: 13 }}>教务系统学生名册同步</span>
                      <span className="meta">每日 02:00 · 上次成功 02:00</span>
                    </div>
                    <div className="between">
                      <span style={{ fontSize: 13 }}>LDAP 通讯录</span>
                      <span className="meta">ldap://dir.univ.edu.cn</span>
                    </div>
                    <div className="between">
                      <span style={{ fontSize: 13 }}>短信通知网关</span>
                      <span className="pill pill-info">已配置</span>
                    </div>
                  </div>
                </div>
                <div className="panel inner">
                  <div className="panel-head">
                    <span className="title-sm">数据与备份</span>
                  </div>
                  <div className="panel-body stack-sm" style={{ gap: 12 }}>
                    <div className="between">
                      <span style={{ fontSize: 13 }}>数据库自动备份</span>
                      <span className="meta">每 6 小时 · 保留 30 天</span>
                    </div>
                    <div className="between">
                      <span style={{ fontSize: 13 }}>最近备份</span>
                      <span className="meta">2026-09-15 12:00 · 成功</span>
                    </div>
                    <div className="between">
                      <span style={{ fontSize: 13 }}>作答数据留存期</span>
                      <span className="meta">考试结束后 3 年</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="stack">
                <div className="title-sm" style={{ marginBottom: 12 }}>
                  访问与安全策略
                </div>
                <div className="banner banner-info">
                  <span>
                    当前安全策略评级：<b>符合《教育考试数据安全规范》二级要求</b>。上次合规检查 2026-08-28。
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'logs' && (
          <div className="panel-body">
            <div className="toolbar" style={{ marginBottom: 14 }}>
              <Select
                aria-label="日志类型"
                style={{ width: 170 }}
                defaultValue="全部类型"
                options={[{ value: '全部类型', label: '全部类型' }]}
              />
              <Select
                aria-label="时间范围"
                style={{ width: 150 }}
                defaultValue="最近 24 小时"
                options={[{ value: '最近 24 小时', label: '最近 24 小时' }]}
              />
              <div className="grow" />
              <Button onClick={() => message.info('日志导出为演示按钮')}>导出日志</Button>
            </div>
            <div className="feed">
              {MOCK_LOGS.map((l) => (
                <div className="feed-item" key={l.t}>
                  <span className={`feed-ico ico-${l.k}`}>{l.ic}</span>
                  <div>
                    <div className="feed-t">{l.t}</div>
                    <div className="feed-m">{l.m}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default Admin;
