# 明鉴风前端全样重构设计

日期: 2026-09-15
状态: 待用户评审
参考: `C:\personal_project\graduate_project\frontend_design\`（index / student-exam / teacher-grading / proctoring / question-bank / analytics / admin + assets/app.css）
路线: A（保留 Ant Design 6 换肤，全页对齐参考，Antd 逻辑复用最多）

## 1. 目标与非目标

- 目标：把现有前端布局按 7 个参考页全样重构。Shell（浅色分组侧边栏 + 毛玻璃顶栏 + 内容区）与 7 模块页面视觉对齐参考；品牌切到“明鉴”；亮色优先、暗色用深绿衍生并可切换；无后端的新模块前后端一起补齐（最小增量）。
- 非目标：不抛掉 Antd（不做去 Antd 全自研）；不改变现有考试核心流程（开始/作答/自动保存/交卷/AI 评分）；不一次性上 WebSocket 实时推送（监控先轮询）。

## 2. 已确认决策

| 项 | 决策 |
|---|---|
| 范围 | 全页对齐参考设计（7 页全做） |
| 技术 | 保留 Antd 换肤（ConfigProvider + CSS 变量），复杂表单/表格/弹窗仍用 Antd |
| 品牌配色 | 全跟参考：明鉴 + 绿主色 + 浅色侧边栏 + mono 数字字体 |
| 新模块 | 前后端一起补（监控事件流、独立题库、分析报表聚合） |
| 导航 | 统一侧边栏 + 按角色过滤，无权路由照常拦截 |
| 主题 | 双色可切换，亮色优先，暗色深绿衍生 |

## 3. 现状基线

- 前端：React 19 + Antd 6 + Tailwind 3 + Zustand + Router 7 + ECharts。`src/components/Layout/index.tsx` 深色 Sider 220→72 + Header 64 + Content 独立滚动；`src/App.tsx` ConfigProvider 藏青蓝 `#3D5A80` 双主题；`src/store/theme.ts` localStorage→系统偏好→亮色；Dashboard 按角色三叉；Teacher/Student/Admin 页面见实施计划。
- 参考壳：236px 浅色分组 Sider（考试运行/教学管理/系统，active 为 fg-soft + 左侧 2px accent 竖条）+ 毛玻璃 Topbar（crumb + 280px 搜索 + seg + pill）+ Content max-width 1600 padding 22 gap 16 + Footer v2.4.0。`app.css` oklch 令牌：accent 绿 `58% 0.16 145`，radius 8/12，mono 数字，44px 最小触达。
- 后端缺口：只有 `exam_records.switch_count` 无事件流；`questions.exam_id NOT NULL` 无独立题库；统计只有汇总无逐题 P/D（难度/区分度）。`sql/init.sql` 幂等范式：`CREATE TABLE IF NOT EXISTS` + `information_schema` 守卫补列 + seed 按 `demo_%/seed_%` 清理重插，`db_init.py` 启动自动执行。

## 4. 架构

- 新增 `frontend/src/components/MingjianLayout/`（Sider / Topbar / Content / Footer）替换 `components/Layout` 的挂载点，路由结构不变（`App.tsx` 私有路由 + Outlet + PageTransition 保留）。
- 新增 `frontend/src/store/navigation.ts`：统一导航树 `{key,label,group,icon,roles}` + `filterByRole(role)`。分组：总览控制台 | 考试运行（学生考试/教师阅卷/监控）| 教学管理（题库/成绩分析）| 系统（系统管理）。
- 新增 `frontend/src/theme/mingjian.ts`：绿令牌 + `chartTheme` 明暗两套；`src/index.css` 引入 oklch 派生变量并保留现有变量名做兼容别名。
- 路由映射：`/dashboard`→总览控制台、`/exams/take`→学生考试端、`/grading`→教师阅卷端；新增 `/proctoring`、`/question-bank`、`/analytics`；`/users|/classes|/teacher-subjects` 收敛进系统管理 Tabs；`/exams`（管理）能力收敛进题库/总览的新建考试入口，但路由保留做兼容。
- 后端三个最小增量（详见 §7），前端在接口未就绪前用 `mocks/` + 现有字段拼（switch_count→告警，成绩分布→直方图）。

## 5. 组件映射（Antd 保留，只换肤）

| 参考 | 现有 | 落法 |
|---|---|---|
| `.panel` | PageCard | 保留 div 壳，对齐 surface/border/radius-lg，head 52px |
| `.kpi` | StatCard | 图标徽 + label + mono 29px 数值 + foot |
| `.pill` | StatusTag/Tag | ok/warn/danger/info/neutral 五态，mono 10.5px + dot |
| `.ds-table/.matrix` | Table | 表头 mono 大写 + 行 hover fg-soft，首列左对齐 |
| `.bar/.bar-thick/.hbar/.hist` | Progress/自绘 div | 进度绿 72-78%，hist peak 高亮 |
| `.seg` | Segmented | 总览范围/阅卷模式/监控过滤 |
| `.tabs` | Tabs | 系统管理 users/roles/params/integrations/logs |
| `.feed/.tl` | List/Timeline | 关注流/告警流/操作日志/行为时间线 |
| `.mod-grid/.mod` | Card 网格 | 总览 6 模组，hover 时 go 箭头右移 |
| `.exam-bar+.q-card+.sheet` | ExamTaking + QuestionRenderer | 顶栏计时 + 单题卡 + 答题卡 5 列格 |
| `.queue-item+.pt+.score-box` | Grading + GradingDrawer | 队列 + 评分点勾选 + 分数输入 |
| `.wall+.tile` | Card 网格 + Badge | 监控墙深色 tile + LIVE/ALERT/OFF |
| `.rail+.q-row+.basket-row+.stepper` | Menu/List + Table | 题库筛选轨 + 题目行 + 配额篮 |
| `.modal/.drawer/.toast` | Modal/Drawer/message | 520px modal / 430px 右抽屉 |

ECharts 配色跟绿，网格虚线对齐参考；`QuestionRenderer` 五题型交互不变；`shouldShowAiGrading` 规则不变。mono 字体栈：`'JetBrains Mono','IBM Plex Mono',ui-monospace,Menlo,monospace`，数字加 `font-variant-numeric: tabular-nums`。

## 6. 数据流

- 总览：`GET /dashboard` 扩展字段（online/peak/pending/eta/alerts/进行中考试/阅卷进度/关注流）；范围 seg（今日/本周/本学期）先前端聚合切换，后端分页参数后续补。
- 学生考试：`start/paper/save(30s)/submit/recordSwitch/switch-status` 原样复用；切屏阈值沿用 `Exam.max_switch`（banner warn/danger）。
- 教师阅卷：`records/answers/grade/retryAi/finalize` 原样复用；按题/按人 seg 只切展示维度。
- 监控：新增 `GET /api/exams/{id}/events?record_id?&page` + `GET /api/records/{rid}/events`，前端轮询 5s（后期换 WS）；tile 点击开 Drawer 看时间线。
- 题库：新增 `GET/POST /api/bank/questions` + `POST /api/exams/{id}/questions/from-bank`；筛选（科目/题型/难度/知识点）+ 排序（使用次数/难度/正确率）+ 配额篮。
- 分析：新增 `GET /api/statistics/exam/{id}/questions`（avg/correct_rate/distribution/P/D）+ `GET .../students?page&class_id&keyword`；报表导出复用现有 xlsx 通道。
- 权限：菜单隐藏 + 路由拦截（前端 PrivateRoute + 后端 `require_role` + 教师 `can_teacher_manage_exam/subject` + 学生本人记录校验）。

## 7. 后端增量（最小加法）

1. 监考事件：新表 `monitor_events(exam_id,record_id,student_id,event_type,detail JSON,created_at,idx)`；`record_switch` 内同步写事件 + `switch_count`；`POST /api/exams/{id}/events[student]` + 两个 GET `[teacher,admin]`。
2. 题库：`questions` 加可空列 `course_id FK, is_bank, tags JSON, difficulty, source_question_id` + `exam_id` 改可空（information_schema 守卫）；`GET/POST /api/bank/questions` + `POST .../from-bank`（复制行保留 source）。
3. 分析：零 schema 新 `analytics_service`（见 §6）；顺手修 `get_exam_statistics` 用 `Exam.pass_score` 而非 `Σ*0.6`。
4. 总览扩展：`get_dashboard_data` 追加 online/peak/pending/eta/alerts/进行中考试/阅卷进度/关注流（无新表，纯聚合现有表；范围 seg 先前端切，后端分页参数后续补）。
5. 迁移走 `init.sql` 既有幂等套路；`Base.metadata.create_all` 自动建表。

## 8. 主题与响应式

- 亮色优先：accent `#2E7D4F`（参考绿落 hex），surface 白，sider 白；暗色衍生：accent `#5FB87E`，surface `#1A2620` 系，border `#2E4238` 系，文本对比≥6:1；`store/theme.ts` 切换逻辑不变。
- 断点沿用参考：1180（3→2 列/单列）、980（侧栏转顶栏）、620（单列）；触达 ≥44px（btn-sm 32 例外）；`prefers-reduced-motion` 降级。

## 9. 错误与空态

- 无权菜单隐藏 + 路由拦截跳 dashboard；接口失败用现有 EmptyState + 重试；加载用 SkeletonGrid；表单校验失败抖动保留；Redis switch key 交卷删除导致历史丢失问题由 events 表解决（count 仍保留）。

## 10. 测试

- 前端 Vitest：导航过滤、pill/状态映射、Layout 快照；现有 Dashboard/Login/Layout/GradingDrawer 单测必须全绿。
- 后端 pytest：events 写入/查询权限、bank 复制、analysis 聚合。
- 门禁：`npm run build`、`tsc --noEmit`、`npm test`、pytest；明暗截图对比；1640/1180/980/620 走查；`π考`残留 grep。

## 11. 分阶段（P1→P9，与实施计划一一对应）

P1 令牌 + P2 壳导航 → P3 总览 → P4 考试端 → P5 阅卷端 → P6 监控+events → P7 题库+字段 → P8 分析管理+聚合 → P9 全量回归。每步可独立交付验证，失败回滚到该 Phase 起点。
