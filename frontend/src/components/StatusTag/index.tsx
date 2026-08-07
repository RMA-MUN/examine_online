import React from 'react';
import './index.css';

export type StatusType =
  | 'not_started'
  | 'ongoing'
  | 'finished'
  | 'pending_grading'
  | 'passed'
  | 'failed'
  // 考试记录状态（我的记录 / 阅卷列表）
  | 'submitted'
  | 'graded'
  // 考试发布状态（考试管理）
  | 'draft'
  | 'published';

/**
 * 状态标签。
 *
 * 圆点颜色由 CSS 的 currentColor 继承，而不是内联样式——
 * 内联色值优先级最高，暗色模式的覆盖规则会够不着它。
 */
const STATUS_MAP: Record<StatusType, { label: string; className: string }> = {
  not_started: { label: '未开始', className: 'status-tag-blue' },
  ongoing: { label: '进行中', className: 'status-tag-green' },
  finished: { label: '已结束', className: 'status-tag-gray' },
  pending_grading: { label: '待批改', className: 'status-tag-orange' },
  passed: { label: '已通过', className: 'status-tag-green' },
  failed: { label: '未通过', className: 'status-tag-red' },
  submitted: { label: '待阅卷', className: 'status-tag-orange' },
  graded: { label: '已阅卷', className: 'status-tag-green' },
  draft: { label: '草稿', className: 'status-tag-gray' },
  published: { label: '已发布', className: 'status-tag-blue' },
};

interface StatusTagProps {
  status: StatusType;
  label?: string;
}

const StatusTag = ({ status, label }: StatusTagProps) => {
  const meta = STATUS_MAP[status];
  // 后端可能返回未知状态码，此时降级为灰底原样展示，不整体崩溃
  if (!meta) {
    return (
      <span className="status-tag status-tag-gray">
        <span className="status-tag-dot" />
        {label || status}
      </span>
    );
  }
  return (
    <span className={`status-tag ${meta.className}`}>
      <span className="status-tag-dot" />
      {label || meta.label}
    </span>
  );
};

export default StatusTag;
