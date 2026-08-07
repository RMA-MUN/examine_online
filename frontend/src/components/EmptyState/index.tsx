import React from 'react';
import './index.css';

interface EmptyStateProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

const EmptyState = ({ title, description, action }: EmptyStateProps) => (
  <div className="empty-state">
    <div className="empty-state-illustration" aria-hidden="true">
      <span className="empty-state-ring empty-state-ring-1" />
      <span className="empty-state-ring empty-state-ring-2" />
      <svg viewBox="0 0 48 48" width="44" height="44">
        <circle
          cx="24"
          cy="24"
          r="19"
          stroke="var(--color-border)"
          strokeWidth="3"
          fill="none"
          strokeDasharray="6 5"
        />
        <path
          d="M16 25 L21.5 30.5 L32.5 18.5"
          stroke="var(--color-primary)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
    <p className="empty-state-title">{title}</p>
    {description && <p className="empty-state-description">{description}</p>}
    {action && <div className="empty-state-action">{action}</div>}
  </div>
);

export default EmptyState;
