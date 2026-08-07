import React from 'react';
import './index.css';

export type StatTone = 'brand' | 'success' | 'warning' | 'danger';

interface StatCardProps {
  label: string;
  value: number | string;
  /** 单位后缀，如 % —— 以更小字号跟随数字 */
  suffix?: string;
  icon: React.ReactNode;
  tone?: StatTone;
}

/**
 * 统计卡片。
 *
 * 图标装进带淡色底的徽章、与数字分离，替代此前 antd Statistic 的
 * prefix 写法（图标与数字同字号挤在一行，显得局促）。
 * 数值用比例数字而非等宽数字——等宽在大字号下会显得松散。
 */
const StatCard = ({ label, value, suffix, icon, tone = 'brand' }: StatCardProps) => (
  <div className={`stat-card stat-card-${tone}`}>
    <span className="stat-card-badge" aria-hidden="true">
      {icon}
    </span>
    <div className="stat-card-body">
      <p className="stat-card-label">{label}</p>
      <p className="stat-card-value">
        {value}
        {suffix && <span className="stat-card-suffix">{suffix}</span>}
      </p>
    </div>
  </div>
);

export default StatCard;
