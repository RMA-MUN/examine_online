/** 考试监控与防作弊演示数据：照抄参考 `frontend_design/proctoring.html` 内联数据（12 学生 / 7 告警 / 3 已处置）。 */

export type WallStatus = 'ok' | 'alert' | 'off';
export type RiskLevel = '高风险' | '中风险' | '正常';
export type TimelineKind = 'danger' | 'warn' | 'ok';

export interface TimelineEvent {
  t: string;
  k: TimelineKind;
  n: string;
  m: string;
}

export interface MockStudent {
  id: string;
  name: string;
  cls: string;
  status: WallStatus;
  flag?: string;
  progress: number;
  risk: RiskLevel;
  face: string;
  cam: string;
  mic: string;
  switches: number;
  net: string;
  events: TimelineEvent[];
}

export type AlertKind = 'danger' | 'warn' | 'info';

export interface MockAlert {
  k: AlertKind;
  n: string;
  m: string;
}

export interface MockHandled {
  t: string;
  m: string;
  c: string;
}

export const MOCK_STUDENTS: MockStudent[] = [
  { id: '2024010118', name: '王磊', cls: '计科 2401', status: 'alert', flag: '连续切屏 3 次', progress: 41, risk: '高风险',
    face: '核验通过（15:00:22）', cam: '在线', mic: '在线', switches: 3, net: '正常',
    events: [
      { t: '15:18:02', k: 'danger', n: '切屏告警', m: '离开考试页面 27 秒（第 3 次）' },
      { t: '15:14:39', k: 'warn', n: '切屏告警', m: '离开考试页面 12 秒（第 2 次）' },
      { t: '15:08:15', k: 'warn', n: '切屏告警', m: '离开考试页面 9 秒（第 1 次）' },
      { t: '15:00:22', k: 'ok', n: '人脸核验通过', m: '与报名照片匹配度 97.4%' },
    ] },
  { id: '2024010207', name: '李思远', cls: '计科 2402', status: 'alert', flag: '检测到第二张人脸', progress: 55, risk: '高风险',
    face: '核验通过（15:00:41）', cam: '在线', mic: '在线', switches: 1, net: '正常',
    events: [
      { t: '15:16:47', k: 'danger', n: '第二张人脸', m: '画面中检测到 2 张人脸，持续 4 秒' },
      { t: '15:09:03', k: 'warn', n: '切屏告警', m: '离开考试页面 6 秒（第 1 次）' },
      { t: '15:00:41', k: 'ok', n: '人脸核验通过', m: '与报名照片匹配度 96.1%' },
    ] },
  { id: '2024010133', name: '张昊', cls: '计科 2401', status: 'off', flag: '网络中断', progress: 33, risk: '中风险',
    face: '核验通过（15:00:18）', cam: '离线', mic: '离线', switches: 0, net: '已断线 74 秒',
    events: [
      { t: '15:19:12', k: 'warn', n: '网络中断', m: '心跳丢失 74 秒，计时已自动暂停' },
      { t: '15:00:18', k: 'ok', n: '人脸核验通过', m: '与报名照片匹配度 98.2%' },
    ] },
  { id: '2024010221', name: '赵依然', cls: '计科 2402', status: 'alert', flag: '切屏 2 次', progress: 62, risk: '中风险',
    face: '核验通过（15:00:35）', cam: '在线', mic: '在线', switches: 2, net: '正常',
    events: [
      { t: '15:17:26', k: 'warn', n: '切屏告警', m: '离开考试页面 14 秒（第 2 次）' },
      { t: '15:05:58', k: 'warn', n: '切屏告警', m: '离开考试页面 8 秒（第 1 次）' },
      { t: '15:00:35', k: 'ok', n: '人脸核验通过', m: '与报名照片匹配度 95.8%' },
    ] },
  { id: '2024010142', name: '孙宁', cls: '计科 2401', status: 'ok', progress: 78, risk: '正常', face: '核验通过（15:00:12）', cam: '在线', mic: '在线', switches: 0, net: '正常', events: [{ t: '15:00:12', k: 'ok', n: '人脸核验通过', m: '与报名照片匹配度 97.9%' }] },
  { id: '2024010155', name: '陈可', cls: '计科 2401', status: 'ok', progress: 84, risk: '正常', face: '核验通过（15:00:09）', cam: '在线', mic: '在线', switches: 0, net: '正常', events: [{ t: '15:00:09', k: 'ok', n: '人脸核验通过', m: '与报名照片匹配度 98.7%' }] },
  { id: '2024010203', name: '周子航', cls: '计科 2402', status: 'ok', progress: 66, risk: '正常', face: '核验通过（15:00:27）', cam: '在线', mic: '在线', switches: 0, net: '正常', events: [{ t: '15:00:27', k: 'ok', n: '人脸核验通过', m: '与报名照片匹配度 96.4%' }] },
  { id: '2024010216', name: '吴雨桐', cls: '计科 2402', status: 'ok', progress: 91, risk: '正常', face: '核验通过（15:00:31）', cam: '在线', mic: '在线', switches: 1, net: '正常', events: [
    { t: '15:12:44', k: 'warn', n: '切屏告警', m: '离开考试页面 5 秒（第 1 次）' },
    { t: '15:00:31', k: 'ok', n: '人脸核验通过', m: '与报名照片匹配度 97.1%' },
  ] },
  { id: '2024010129', name: '郑海', cls: '计科 2401', status: 'ok', progress: 57, risk: '正常', face: '核验通过（15:00:16）', cam: '在线', mic: '在线', switches: 0, net: '正常', events: [{ t: '15:00:16', k: 'ok', n: '人脸核验通过', m: '与报名照片匹配度 95.3%' }] },
  { id: '2024010238', name: '林沁', cls: '计科 2402', status: 'off', flag: '已交卷', progress: 100, risk: '正常', face: '核验通过（15:00:39）', cam: '离线', mic: '离线', switches: 0, net: '—', events: [
    { t: '15:11:08', k: 'ok', n: '已交卷', m: '第 4 位交卷考生，用时 11 分 08 秒' },
    { t: '15:00:39', k: 'ok', n: '人脸核验通过', m: '与报名照片匹配度 99.0%' },
  ] },
  { id: '2024010164', name: '黄哲', cls: '计科 2401', status: 'ok', progress: 72, risk: '正常', face: '核验通过（15:00:21）', cam: '在线', mic: '在线', switches: 0, net: '正常', events: [{ t: '15:00:21', k: 'ok', n: '人脸核验通过', m: '与报名照片匹配度 96.8%' }] },
  { id: '2024010247', name: '徐安', cls: '计科 2402', status: 'alert', flag: '切屏 1 次', progress: 48, risk: '中风险', face: '核验通过（15:00:44）', cam: '在线', mic: '在线', switches: 1, net: '正常', events: [
    { t: '15:13:50', k: 'warn', n: '切屏告警', m: '离开考试页面 11 秒（第 1 次）' },
    { t: '15:00:44', k: 'ok', n: '人脸核验通过', m: '与报名照片匹配度 94.9%' },
  ] },
];

export const MOCK_ALERTS: MockAlert[] = [
  { k: 'danger', n: '第二张人脸', m: '李思远 · 计科 2402 · 15:16:47' },
  { k: 'danger', n: '连续切屏 3 次', m: '王磊 · 计科 2401 · 15:18:02' },
  { k: 'warn', n: '网络中断', m: '张昊 · 计科 2401 · 15:19:12' },
  { k: 'warn', n: '切屏告警', m: '赵依然 · 计科 2402 · 15:17:26' },
  { k: 'warn', n: '切屏告警', m: '徐安 · 计科 2402 · 15:13:50' },
  { k: 'warn', n: '切屏告警', m: '吴雨桐 · 计科 2402 · 15:12:44' },
  { k: 'info', n: '联网状态恢复', m: '陈可 · 计科 2401 · 15:07:02' },
];

export const MOCK_HANDLED: MockHandled[] = [
  { t: '已发送警告', m: '王磊 · 15:18:40 · 周凯', c: 'pill-warn' },
  { t: '人工复核正常', m: '吴雨桐 · 15:13:12 · 周凯', c: 'pill-ok' },
  { t: '延长计时 90 秒', m: '张昊 · 15:10:33 · 系统自动', c: 'pill-info' },
];

/** 参考页头的副考试信息与 KPI（静态演示值，后端事件流只覆盖告警 feed）。 */
export const MOCK_EXAM_INFO = {
  title: '《数据结构与算法》期中考试',
  clazz: '计科 2401–2402',
  remain: 68,
  total: 120,
  online: 118,
  submitted: 6,
  progress: 72,
  highRisk: 2,
  midRisk: 5,
  offline: 2,
  warned: 3,
};
