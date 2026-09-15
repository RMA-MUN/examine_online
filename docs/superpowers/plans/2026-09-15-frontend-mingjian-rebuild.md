# 明鉴风前端全样重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按已批准 spec（`docs/superpowers/specs/2026-09-15-frontend-mingjian-rebuild-design.md`）把前端全样重构成明鉴风：浅色分组侧边栏 + 毛玻璃顶栏 + 7 模块页面，亮色优先、暗色深绿衍生可切换，后端补监控事件/题库字段/分析聚合。

**Architecture:** 保留 Antd 6，只换肤：`index.css` 引入 oklch 派生变量 + `App.tsx` ConfigProvider 换绿令牌；新建 `MingjianLayout` + `store/navigation.ts` 统一导航；页面逐个重做但复用现有 hooks/api/权限；后端三个最小加法（新表/加列/纯聚合），前端先 mock 兜底。

**Tech Stack:** React 19 · Ant Design 6 · Tailwind CSS 3 · Zustand · React Router 7 · ECharts 6 · Vitest · FastAPI + SQLAlchemy 2.0 异步 · pytest

## Global Constraints

- 不抛掉 Antd：复杂表单/表格/弹窗仍用 Antd，只换肤。
- 不改变考试核心流程：开始/作答/30s 自动保存/交卷/AI 评分逻辑原样复用。
- 监控先轮询（5s），不上 WebSocket。
- 亮色优先；暗色 accent `#5FB87E`，surface `#1A2620` 系，border `#2E4238` 系，文本对比≥6:1。
- mono 字体栈：`'JetBrains Mono','IBM Plex Mono',ui-monospace,Menlo,monospace`，数字加 `font-variant-numeric: tabular-nums`。
- 触达目标 ≥44px（`btn-sm` 32px 例外）；`prefers-reduced-motion` 降级保留。
- 后端迁移走 `backend/sql/init.sql` 幂等套路（`CREATE TABLE IF NOT EXISTS` + `information_schema` 守卫补列）。
- 每任务结束门禁：`cd frontend && npm run build` 通过、`tsc --noEmit` 通过、相关 Vitest/pytest 通过后才可 commit。

---

## File Structure

新文件（创建）：
- `frontend/src/theme/mingjian.ts` — 明鉴绿令牌（light/dark）+ ECharts 覆盖色，唯一真相源。
- `frontend/src/store/navigation.ts` — 统一导航树 + `filterByRole`。
- `frontend/src/components/MingjianLayout/index.tsx` + `index.css` — Sider/Topbar/Content/Footer。
- `frontend/src/mocks/overview.ts`、`frontend/src/mocks/proctoring.ts`、`frontend/src/mocks/bank.ts`、`frontend/src/mocks/analytics.ts` — 后端未就绪前的兜底数据。
- `frontend/src/pages/Proctoring/index.tsx` + `index.css`、`frontend/src/pages/QuestionBank/index.tsx` + `index.css`、`frontend/src/pages/Analytics/index.tsx` + `index.css` — 三个新页面。
- `frontend/src/components/MingjianLayout/index.test.tsx`、`frontend/src/store/navigation.test.ts` — 新单测。
- `backend/app/models/monitor_event.py` — 监考事件模型。
- `backend/app/services/analytics_service.py` — 分析聚合。
- `backend/tests/test_monitor_events.py`、`backend/tests/test_question_bank.py`、`backend/tests/test_analytics.py` — 新后端单测。

修改文件：
- `frontend/src/index.css` — oklch 变量 + Antd 覆盖对齐 `.ds-table/.panel/.pill`。
- `frontend/src/App.tsx` — 绿 ConfigProvider + 新路由（`/proctoring /question-bank /analytics`）+ `MingjianLayout` 挂载。
- `frontend/src/theme/chartTheme.ts` — ECharts 色跟绿（只改色值，不改结构）。
- `frontend/src/pages/Dashboard/*` — 总览控制台重做。
- `frontend/src/pages/Student/ExamTaking/*` — 考试端 exam-bar/sheet。
- `frontend/src/pages/Teacher/Grading/*` — 阅卷端 seg/队列/评分点。
- `frontend/src/pages/Admin/*` — 收敛进系统管理 Tabs。
- `frontend/src/components/StatCard/*`、`StatusTag/*`、`PageCard/*` — 对齐 `.kpi/.pill/.panel`。
- `backend/app/api/exam_student.py` — `record_switch` 内同步写事件。
- `backend/app/api/statistics.py` + `backend/app/services/statistics_service.py` — dashboard 扩展字段 + 修 `pass_score` + 新 analysis 端点。
- `backend/app/models/question.py` — 加可空列。
- `backend/app/api/questions.py` — bank 端点 + from-bank 复制。
- `backend/sql/init.sql` + `backend/app/db_init.py`（如需）— 新表 + 补列守卫。

---

### Task 1: 令牌与主题（P1）

**Files:**
- Create: `frontend/src/theme/mingjian.ts`
- Modify: `frontend/src/index.css`, `frontend/src/App.tsx:62-108`, `frontend/src/theme/chartTheme.ts`
- Test: `frontend/src/theme/mingjian.test.ts`

**Interfaces:**
- Consumes: 现有 `ThemeMode`（`theme/chartTheme.ts`）、`applyThemeMode`（`store/theme.ts`，不动）。
- Produces: `MINGJIAN_LIGHT` / `MINGJIAN_DARK`（`{primary, siderBg, contentBg, border}` 全为 hex 字符串）、`getMingjianAntdTokens(mode)` 返回供 ConfigProvider `theme.token/Layout/Menu` 使用的对象；`App.tsx` 消费它。

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/theme/mingjian.test.ts
import { describe, expect, it } from 'vitest';
import { MINGJIAN_LIGHT, MINGJIAN_DARK, getMingjianAntdTokens } from './mingjian';

describe('mingjian tokens', () => {
  it('亮色主色为参考绿落 hex', () => {
    expect(MINGJIAN_LIGHT.primary).toBe('#2E7D4F');
    expect(MINGJIAN_LIGHT.siderBg).toBe('#FFFFFF');
  });
  it('暗色为深绿衍生', () => {
    expect(MINGJIAN_DARK.primary).toBe('#5FB87E');
  });
  it('产出 Antd tokens', () => {
    const t = getMingjianAntdTokens('light');
    expect(t.token.colorPrimary).toBe('#2E7D4F');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/theme/mingjian.test.ts`
Expected: FAIL with "Failed to resolve import ./mingjian"

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/theme/mingjian.ts
import type { ThemeMode } from './chartTheme';

export const MINGJIAN_LIGHT = {
  primary: '#2E7D4F',
  siderBg: '#FFFFFF',
  contentBg: '#F4F6F4',
  border: '#E2E8E2',
};

export const MINGJIAN_DARK = {
  primary: '#5FB87E',
  siderBg: '#141F19',
  contentBg: '#101915',
  border: '#2E4238',
};

export function getMingjianAntdTokens(mode: ThemeMode) {
  const t = mode === 'dark' ? MINGJIAN_DARK : MINGJIAN_LIGHT;
  return {
    token: { colorPrimary: t.primary, colorInfo: t.primary, borderRadius: 8 },
    layout: { siderBg: t.siderBg },
  };
}
```

- [ ] **Step 4: Wire index.css variables + App.tsx + chartTheme colors, run tests**

Run: `cd frontend && npx vitest run src/theme/mingjian.test.ts`
Expected: PASS. `index.css` 追加 `:root` 明鉴变量与 `[data-theme='dark']` 深绿变量；`App.tsx` 用 `getMingjianAntdTokens(mode)` 替换硬编码 `#3D5A80/#6B9ECF`；`chartTheme.ts` 分类色首色换绿系。

- [ ] **Step 5: Run gates and commit**

Run: `cd frontend && npm run build` + `npx tsc --noEmit` + `npx vitest run src/theme`
Expected: 全 PASS。

```bash
git add -f frontend/src/theme/mingjian.ts frontend/src/theme/mingjian.test.ts frontend/src/index.css frontend/src/App.tsx frontend/src/theme/chartTheme.ts
git commit -m "feat: 明鉴绿令牌与双主题（亮色优先，暗色深绿衍生）"
```

---

### Task 2: 统一壳与导航（P2）

**Files:**
- Create: `frontend/src/store/navigation.ts`, `frontend/src/components/MingjianLayout/index.tsx`, `frontend/src/components/MingjianLayout/index.css`
- Modify: `frontend/src/App.tsx`（路由 + 挂载点）
- Test: `frontend/src/store/navigation.test.ts`, `frontend/src/components/MingjianLayout/index.test.tsx`

**Interfaces:**
- Consumes: Task 1 的令牌（经 ConfigProvider 间接）、`store/auth.ts` 的 `user.role`。
- Produces: `NAV_ITEMS: NavItem[]`（`{key,label,group|null,path,icon,roles: Role[]}`）、`filterByRole(items, role): NavItem[]`；`MingjianLayout` 无 props（内部读 store + Outlet）。

- [ ] **Step 1: Write the failing navigation test**

```ts
// frontend/src/store/navigation.test.ts
import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, filterByRole } from './navigation';

describe('navigation', () => {
  it('学生看不到阅卷/监控/题库/管理', () => {
    const keys = filterByRole(NAV_ITEMS, 'student').map((i) => i.key);
    expect(keys).toContain('overview');
    expect(keys).toContain('student-exam');
    expect(keys).not.toContain('grading');
    expect(keys).not.toContain('proctoring');
    expect(keys).not.toContain('question-bank');
    expect(keys).not.toContain('admin');
  });
  it('admin 全见', () => {
    expect(filterByRole(NAV_ITEMS, 'admin').length).toBe(NAV_ITEMS.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/store/navigation.test.ts`
Expected: FAIL with "Failed to resolve import ./navigation"

- [ ] **Step 3: Implement navigation.ts**

```ts
// frontend/src/store/navigation.ts
export type Role = 'student' | 'teacher' | 'admin';
export interface NavItem {
  key: string; label: string; group: string | null;
  path: string; icon: string; roles: Role[];
}
export const NAV_ITEMS: NavItem[] = [
  { key: 'overview', label: '总览控制台', group: null, path: '/dashboard', icon: 'dashboard', roles: ['student', 'teacher', 'admin'] },
  { key: 'student-exam', label: '学生考试端', group: '考试运行', path: '/exams', icon: 'exam', roles: ['student', 'teacher', 'admin'] },
  { key: 'grading', label: '教师阅卷端', group: '考试运行', path: '/grading', icon: 'grading', roles: ['teacher', 'admin'] },
  { key: 'proctoring', label: '考试监控与防作弊', group: '考试运行', path: '/proctoring', icon: 'eye', roles: ['teacher', 'admin'] },
  { key: 'question-bank', label: '题库与组卷', group: '教学管理', path: '/question-bank', icon: 'bank', roles: ['teacher', 'admin'] },
  { key: 'analytics', label: '成绩分析与报表', group: '教学管理', path: '/analytics', icon: 'chart', roles: ['teacher', 'admin'] },
  { key: 'admin', label: '系统管理', group: '系统', path: '/admin', icon: 'setting', roles: ['admin'] },
];
export function filterByRole(items: NavItem[], role: Role): NavItem[] {
  return items.filter((i) => i.roles.includes(role));
}
```

- [ ] **Step 4: Build MingjianLayout + wire App.tsx routes, run tests**

`MingjianLayout/index.tsx`：`Sider width={236}` + 分组 Menu（`type:'group'`）+ active 项 `fg-soft + 2px accent 竖条`（CSS 类 `.mj-sider .ant-menu-item-selected::before`）；品牌区"明/明鉴/Exam & Grading"；`side-foot` 显示 `user.name`；`Header` 用 Breadcrumb + `Input.Search` + 主题 toggle + Avatar 下拉（复用现有 logout 逻辑）；`Content maxWidth:1600` + Footer"明鉴在线考试与阅卷系统 · 教务管理端 v2.4.0"。`App.tsx`：`AppLayout`→`MingjianLayout`，新增 `/proctoring /question-bank /analytics` 私有路由（`require_role` 语义：student 访问重定向 `/dashboard`）。Layout 单测断言品牌文本与分组渲染：

```tsx
// frontend/src/components/MingjianLayout/index.test.tsx（节选）
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
it('渲染品牌与分组', () => {
  render(<MemoryRouter><MingjianLayout /></MemoryRouter>);
  expect(screen.getByText('明鉴')).toBeInTheDocument();
  expect(screen.getByText('考试运行')).toBeInTheDocument();
});
```

Run: `cd frontend && npx vitest run src/store/navigation.test.ts src/components/MingjianLayout`
Expected: PASS（ memories Router 包裹；如现有单测有旧 Layout 快照，同步更新）。

- [ ] **Step 5: Run gates and commit**

Run: `cd frontend && npm run build` + `npx tsc --noEmit` + `npx vitest run`
Expected: 全 PASS。

```bash
git add -f frontend/src/store/navigation.ts frontend/src/store/navigation.test.ts frontend/src/components/MingjianLayout frontend/src/App.tsx
git commit -m "feat: 明鉴统一壳与分组导航（权限过滤）"
```

---

### Task 3: 总览控制台（P3）

**Files:**
- Modify: `frontend/src/pages/Dashboard/index.tsx`, `frontend/src/pages/Dashboard/index.css`
- Create: `frontend/src/mocks/overview.ts`
- Test: `frontend/src/pages/Dashboard/index.test.tsx`（追加）

**Interfaces:**
- Consumes: Task 2 导航/壳；`api/statistics.ts getDashboard`；`store/auth.ts user`；`EChart`。
- Produces: 无新导出（页面内聚）。后端 `get_dashboard_data` 扩展字段在本任务只读 mock，后端落地在 Task 8。

- [ ] **Step 1: Write the failing test**

```tsx
// 追加到 index.test.tsx
it('渲染4张KPI与6个功能模组', async () => {
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  expect(await screen.findByTestId('kpi-running')).toBeInTheDocument();
  expect(screen.getAllByTestId(/module-/).length).toBe(6);
});
```

`Dashboard` 根节点加 `data-testid`：kpi-running/online/pending/alerts，6 个 `.mod` 分别 `data-testid="module-student-exam"` 等。

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/Dashboard`
Expected: FAIL（找不到 testid）。

- [ ] **Step 3: Implement**

`mocks/overview.ts` 导出 `MOCK_OVERVIEW = {running:3, online:428, peak:512, pending:1246, eta:4.5, alerts:2, exams:[...4行], grading:[...4条], feed:[...4条]}`（照抄参考 index.html 数据）。`Dashboard/index.tsx`：顶部 `page-head`（标题"考试运行总览"+副"教务处 · 第 3 教学周"+toolbar：`Segmented 今日/本周/本学期` + 导出日报 + 新建考试主按钮）；`kpi-grid` 4 卡（`.kpi` + mono 数 + pill foot）；`.cols` 左列（进行中考试 `.ds-table` 含 `.bar` 进度 + 阅卷进度 `.bar-thick`×4）右列（需要关注 `.feed`×4）；`mod-grid` 6 `.mod` 跳对应路由；新建考试 Modal（名称/科目/方式/时长/总分 + 2 checkbox）；`getDashboard` 成功时用接口数据覆盖 mock，失败时 mock + 错误提示（演示不断）。`StatCard` 样式对齐 `.kpi`。

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run src/pages/Dashboard`
Expected: PASS。

- [ ] **Step 5: Gates + commit**

Run: `cd frontend && npm run build` + `npx tsc --noEmit`
Expected: PASS。

```bash
git add -f frontend/src/pages/Dashboard frontend/src/mocks/overview.ts frontend/src/components/StatCard
git commit -m "feat: 总览控制台（KPI+运行表+阅卷进度+关注流+模组）"
```

---

### Task 4: 学生考试端（P4）

**Files:**
- Modify: `frontend/src/pages/Student/ExamTaking/index.tsx`, `frontend/src/pages/Student/ExamTaking/index.css`
- Test: `frontend/src/pages/Student/ExamTaking/*.test.tsx`（如无则新建 `index.test.tsx`；以 `utils.ts` 纯函数测试打底）

**Interfaces:**
- Consumes: `api/exams.ts`（start/paper/save/submit/recordSwitch/switch-status）；`QuestionRenderer`（不动）；`Exam.max_switch`。
- Produces: 无新导出。计时/保存/切屏语义与旧版完全一致。

- [ ] **Step 1: Write the failing test**

```ts
// utils 已有则追加：标记题不计入未答
import { describe, expect, it } from 'vitest';
import { countAnswered } from './utils';
describe('exam sheet', () => {
  it(' Rode 已答计数与参考一致', () => {
    expect(countAnswered({ q1: 'A', q2: '' }, ['q1', 'q2'])).toBe(1);
  });
});
```

（以仓库实际 `utils.ts` 签名为准：先读文件再落字，先让测试跑红。）

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/Student/ExamTaking`
Expected: FAIL（新断言不满足或文件缺失）。

- [ ] **Step 3: Implement**

`.exam-bar` 独立顶栏（返回 + 品牌"明" + 考试名/meta + `net-pill/cam-pill` + `.timer` mono 19px + who + 交卷主按钮）；警告 banner（切屏≥1 warn，≥max_switch danger）；题目区 `.q-card`（q-no mono + pill 题型 + stem + `.opt`，选中态 fg-soft）；底部 prev/next + `save-state` + 标记；右侧 sticky 答题卡 panel（`progress-pill` + `.sheet` 5 列 + legend + 题型分 + 须知）；交卷 Modal（未答/已标记统计 + 确认）+ 交后结果态。计时/30s 保存/`visibilitychange` 切屏逻辑原样搬运，只换 class 名。

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run src/pages/Student/ExamTaking`
Expected: PASS。

- [ ] **Step 5: Gates + commit**

Run: `cd frontend && npm run build` + `npx tsc --noEmit`
Expected: PASS。

```bash
git add -f frontend/src/pages/Student/ExamTaking
git commit -m "feat: 学生考试端明鉴风（exam-bar+答题卡+切屏banner）"
```

---

### Task 5: 教师阅卷端（P5）

**Files:**
- Modify: `frontend/src/pages/Teacher/Grading/index.tsx`, `frontend/src/pages/Teacher/Grading/GradingDrawer.tsx`（或新建三栏布局文件 `Workspace.tsx`，由实现者定但必须收敛到这两个文件内）
- Test: `frontend/src/pages/Teacher/Grading/*.test.tsx`（AI 显示规则回归：复用 `utils/aiGrading.ts shouldShowAiGrading` 单测 + 新增模式切换测试）

**Interfaces:**
- Consumes: `api/grading.ts` 全套；`utils/aiGrading.ts shouldShowAiGrading`（不动）。
- Produces: 无新导出。`seg` 模式状态 `by-question | by-student` 为页面内部 state。

- [ ] **Step 1: Write the failing test**

```tsx
it('按题/按人seg切换', async () => {
  render(<MemoryRouter><Grading /></MemoryRouter>);
  fireEvent.click(await screen.findByText('按人阅卷'));
  expect(screen.getByText('按人阅卷')).toHaveClass('on');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/Teacher/Grading`
Expected: FAIL。

- [ ] **Step 3: Implement**

顶栏 `seg 按题阅卷/按人阅卷` + 演示 pill + 阅卷规则按钮；`page-head`（"《XXX》期中考试 · 第 N 题"+toolbar 批次 pill）；KPI（待阅/已阅/平均用时/一致率）；`.cols-3`：左 rail 队列（batch 进度 bar + `.queue-item`）；中 paper（题目 panel + 参考 `.ref` + 学生作答 + 机器预判 pills + 双评 panel）；右 rail 评分（`score-box` + `.score-input` clamp 0..满分 + `.pt` 评分点勾选联动总分 + 评语 chip + textarea + 提交下一篇/仲裁/跳过）。`GradingDrawer` 的判分/AI Collapse/override-reason 原样搬入右轨。

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run src/pages/Teacher/Grading src/utils/aiGrading*`
Expected: PASS。

- [ ] **Step 5: Gates + commit**

Run: `cd frontend && npm run build` + `npx tsc --noEmit`
Expected: PASS。

```bash
git add -f frontend/src/pages/Teacher/Grading
git commit -m "feat: 教师阅卷端明鉴风（双模式+队列+评分点）"
```

---

### Task 6: 监控防作弊 + 事件后端（P6）

**Files:**
- Create: `backend/app/models/monitor_event.py`, `frontend/src/pages/Proctoring/index.tsx`, `frontend/src/pages/Proctoring/index.css`, `frontend/src/mocks/proctoring.ts`, `backend/tests/test_monitor_events.py`
- Modify: `backend/app/models/__init__.py`, `backend/app/api/exam_student.py`, `backend/app/api/exams.py`（或新建 `backend/app/api/monitor.py` + `main.py` 注册二选一，推荐新建 `monitor.py`），`backend/sql/init.sql`, `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `ExamRecord.switch_count`、`Exam.max_switch`；鉴权 `get_current_user/require_role` + `can_teacher_manage_exam`。
- Produces（后端）: `POST /api/exams/{id}/events {event_type, detail?} → 201`（student）；`GET /api/exams/{id}/events?record_id?&page&page_size`（teacher/admin）；`GET /api/records/{rid}/events`（teacher/admin）。`MonitorEvent{exam_id,record_id,student_id,event_type,detail,created_at}`。
- Produces（前端）: `/proctoring` 页面，5s 轮询 events。

- [ ] **Step 1: Write the failing backend test**

```python
# backend/tests/test_monitor_events.py
def test_student_can_post_switch_event(client):
    r = client.post("/api/exams/1/events", json={"event_type": "switch"})
    assert r.status_code in (200, 201)
```

（以仓库既有 tests 的 client/fixture 范式为准：先读 `backend/tests/` 现有文件再落字，先跑红。）

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_monitor_events.py -v`
Expected: FAIL（路由/模型不存在）。

- [ ] **Step 3: Implement backend**

`models/monitor_event.py`（`exam_id,record_id,student_id,event_type ENUM(switch,blur,fullscreen_exit,paste,face_lost),detail JSON,created_at` + 索引）；`init.sql` 加 `CREATE TABLE IF NOT EXISTS monitor_events`；`record_switch` 内同步写事件 + `switch_count`；新 `api/monitor.py` 三端点 + `main.py` 注册；权限与现有 grading/exams 一致。

- [ ] **Step 4: Implement frontend page**

`.page-head` + toolbar（公告/策略 secondary + 结束考试 danger）+ `banner-warn`；KPI（在线/异常/离线/警告）；`.cols-3`：左 rail 范围+策略+图例；中 panel 监控墙（`seg 全部/正常/告警/离线` + 刷新 + `.wall>.tile` + 计数）；右 rail 告警 feed + 已处置；tile 点击开 Drawer（作答 + `.tl` 时间线 + `.hbar` + 警告/强制交卷/标记正常）。无后端时读 `mocks/proctoring.ts`（12 学生/7 告警/3 已处置，照抄参考）。

- [ ] **Step 5: Run tests**

Run: `cd backend && uv run pytest tests/test_monitor_events.py -v`
Run: `cd frontend && npx vitest run src/pages/Proctoring 2>/dev/null || echo "no frontend test yet"`
Expected: 后端 PASS；前端 build 不报错。

- [ ] **Step 6: Gates + commit**

Run: `cd backend && uv run pytest` + `cd frontend && npm run build` + `npx tsc --noEmit`
Expected: 全 PASS。

```bash
git add -f backend/app/models/monitor_event.py backend/app/api/monitor.py backend/app/api/exam_student.py backend/tests/test_monitor_events.py backend/sql/init.sql frontend/src/pages/Proctoring frontend/src/mocks/proctoring.ts frontend/src/App.tsx
git commit -m "feat: 监控防作弊（事件后端+监控墙前端）"
```

---

### Task 7: 题库与组卷 + 字段后端（P7）

**Files:**
- Create: `frontend/src/pages/QuestionBank/index.tsx`, `frontend/src/pages/QuestionBank/index.css`, `frontend/src/mocks/bank.ts`, `backend/tests/test_question_bank.py`
- Modify: `backend/app/models/question.py`, `backend/app/api/questions.py`, `backend/sql/init.sql`, `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `Question` 校验（含 Rubric）、`question_service` CRUD、`can_teacher_manage_exam`。
- Produces（后端）: `GET /api/bank/questions?course_id?&type?&difficulty?&keyword?&page&page_size`；`POST /api/bank/questions`（`exam_id=null,is_bank=true`）；`POST /api/exams/{id}/questions/from-bank {bank_ids: number[]}`（复制行，新 `exam_id`，`source_question_id` 回指）。`Question` 新增可空列 `course_id,is_bank,tags,difficulty,source_question_id`。
- Produces（前端）: `/question-bank` 左 rail 筛选 + 中题目流 + 右配额篮。

- [ ] **Step 1: Write the failing backend test**

```python
# backend/tests/test_question_bank.py
def test_copy_from_bank(client):
    r = client.post("/api/exams/1/questions/from-bank", json={"bank_ids": [1]})
    assert r.status_code in (200, 201)
```

（先读现有 tests 范式再落字，先跑红。）

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_question_bank.py -v`
Expected: FAIL。

- [ ] **Step 3: Implement backend**

模型加列（可空，`exam_id` 改可空，注意既有 `CASCADE` 与非空约束的迁移顺序：先加列 → 回填 → 再放开非空）；`init.sql` information_schema 守卫补列；bank 列表/新建/from-bank 复制（复用 create 校验）；同 `[teacher,admin]` + 学科守卫。

- [ ] **Step 4: Implement frontend page**

顶栏搜索 + 导入题库 + 新建题目；`page-head`（题量 + 查重 pill + 排序 select）；`.cols-3`：左 rail 筛选（科目/题型/难度/知识点 rail-opt + `sw` 只看已审核 + 清空）；中 panel 题目流（`seg` 题型 + 计数 + `.q-row`：难度 pill + meta + stem + 答案/正确率/使用/分值 + 加入配额）；右 rail 配额篮（`.basket-row+.stepper` + 总量/题型结构 + 生成试卷 disabled 联动 + 蓝图说明）；生成 Modal（名称/时长/分组 + 3check）。无后端时读 `mocks/bank.ts`（12 题多维 + 自动组卷 least-used 规则照抄参考 JS）。

- [ ] **Step 5: Run tests**

Run: `cd backend && uv run pytest tests/test_question_bank.py -v`
Run: `cd frontend && npm run build`
Expected: PASS。

- [ ] **Step 6: Gates + commit**

Run: `cd backend && uv run pytest` + `cd frontend && npm run build` + `npx tsc --noEmit`
Expected: 全 PASS。

```bash
git add -f backend/app/models/question.py backend/app/api/questions.py backend/tests/test_question_bank.py backend/sql/init.sql frontend/src/pages/QuestionBank frontend/src/mocks/bank.ts frontend/src/App.tsx
git commit -m "feat: 题库与组卷（bank后端+三栏前端）"
```

---

### Task 8: 成绩分析 + 系统管理 + 聚合后端（P8）

**Files:**
- Create: `backend/app/services/analytics_service.py`, `frontend/src/pages/Analytics/index.tsx`, `frontend/src/pages/Analytics/index.css`, `frontend/src/mocks/analytics.ts`, `backend/tests/test_analytics.py`
- Modify: `backend/app/api/statistics.py`, `backend/app/services/statistics_service.py`（dashboard 扩展 + `pass_score` 修复）, `frontend/src/pages/Admin/*`（收敛 Tabs）, `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `ExamRecord/Answer/Question` 只读聚合；`scores/export` 通道；`users/classes/teacher_subjects` 现有管理 API。
- Produces（后端）: `GET /api/statistics/exam/{id}/questions → [{question_id,type,avg_score,correct_rate,distribution}]`；`GET /api/statistics/exam/{id}/students?page&page_size&class_id?&keyword?`；dashboard 追加 `online/peak/pending/eta/alerts/running_exams/grading_progress/feed`（纯聚合，无新表）。
- Produces（前端）: `/analytics` + `/admin` Tabs（users/roles/params/integrations/logs）。

- [ ] **Step 1: Write the failing backend test**

```python
# backend/tests/test_analytics.py
def test_exam_questions_stats(client):
    r = client.get("/api/statistics/exam/1/questions")
    assert r.status_code == 200
    assert isinstance(r.json()["data"], list)
```

（先读现有 tests 范式再落字，先跑红。）

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_analytics.py -v`
Expected: FAIL。

- [ ] **Step 3: Implement backend**

`analytics_service.py` 纯 SELECT（逐题均分/正确率/分布/P/D；逐学生分页 + switch + 排名）；`statistics.py` 加两路由（`[teacher,admin]`）；`get_dashboard_data` 按角色追加扩展字段；修 `get_exam_statistics` 用 `Exam.pass_score`。

- [ ] **Step 4: Implement frontend pages**

Analytics：head（考试 select + 班级 select + 导出 + 生成报告）+ KPI（avg/pass/max/min/range/sd）+ 分布（`.hist` peak 高亮 + 分箱 `.ds-table` 逆序累计）+ 质量（逐题 `.ds-table` P/D + 质量 pill + 知识点 `.hbar`）+ 对比（班级 `.hbar` + 发布 between pills）+ 报告 Modal 4check；无后端读 `mocks/analytics.ts`。Admin：`Tabs` 四页复用现有 UserManage/ClassManage/TeacherSubjectManage 表单表格逻辑，只换 `.ds-table/.matrix/.feed/.sw` 皮肤；审计日志 feed 接后端日志接口（如无则 mock 7 条照抄参考）。

- [ ] **Step 5: Run tests**

Run: `cd backend && uv run pytest tests/test_analytics.py -v`
Run: `cd frontend && npx vitest run src/pages/Admin src/pages/Analytics 2>/dev/null || true`
Expected: 后端 PASS；前端 build 通过。

- [ ] **Step 6: Gates + commit**

Run: `cd backend && uv run pytest` + `cd frontend && npm run build` + `npx tsc --noEmit` + `npx vitest run`
Expected: 全 PASS。

```bash
git add -f backend/app/services/analytics_service.py backend/app/api/statistics.py backend/app/services/statistics_service.py backend/tests/test_analytics.py frontend/src/pages/Analytics frontend/src/pages/Admin frontend/src/mocks/analytics.ts frontend/src/App.tsx
git commit -m "feat: 成绩分析与系统管理（聚合后端+报表前端）"
```

---

### Task 9: 全量回归（P9）

**Files:**
- Modify: 残留修复（`π考`→`明鉴`、`#3D5A80` 残留、旧 Layout 删除与否）
- Test: 全量

**Interfaces:**
- Consumes: Task 1–8 全部。
- Produces: 可演示主干。

- [ ] **Step 1: 残留扫描**

Run: `cd frontend && grep -rn "π考" src || true`；`grep -rn "3D5A80" src || true`；`grep -rn "AppLayout" src || true`
Expected: 逐条确认（登录/标题允许保留过渡文案则记录理由，其余改掉；旧 `components/Layout` 无引用后删除）。

- [ ] **Step 2: 全量门禁**

Run: `cd frontend && npm run build`
Run: `cd frontend && npx tsc --noEmit`
Run: `cd frontend && npx vitest run`
Run: `cd backend && uv run pytest`
Expected: 四个全 PASS。

- [ ] **Step 3: 走查清单**

三角色登录：菜单过滤正确；`/dashboard /exams /grading /proctoring /question-bank /analytics /admin` 无白屏；亮/暗切换对比；1640/1180/980/620 宽度走查；交卷→AI→阅卷主流程一次。

- [ ] **Step 4: Commit**

```bash
git add -A frontend/src backend/app backend/tests backend/sql/init.sql
git commit -m "chore: 全量回归与明鉴残留清理"
```

---

## Self-Review

- **Spec 覆盖 §1–§11：** §4 架构→Task 2；§5 组件映射→Task 3–8 各页 + Task 1；§6 数据流→Task 3–8（含轮询 5s、30s 保存、seg 只切展示）；§7 后端 4 项（events/bank/analysis/dashboard 扩展）→Task 6/7/8；§8 主题响应式→Task 1 + Task 9 走查；§9 错误空态→各页 EmptyState/mock 降级 + Task 9；§10 测试→每任务门禁 + Task 9 全量；§11 分阶段→Task 1–9 一一对应。无遗漏。
- **占位符扫描：** 无 TBD/TODO/"视情况而定"；凡引现有文件行为处均要求先读再落字（client/fixture 范式、utils 签名），命令与断言均为实例可改量，无"适当处理"类空话。
- **类型一致性：** `Role/NavItem/filterByRole` 在 Task 2 一处定义、各页只消费 path；`MINGJIAN_LIGHT/DARK/getMingjianAntdTokens` Task 1 定义、Task 2 经 ConfigProvider 间接消费；后端三端点签名 Task 6–8 各自闭环；`pass_score` 修复归 Task 8。已对齐。
