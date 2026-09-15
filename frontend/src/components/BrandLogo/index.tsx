import React from 'react';
import './index.css';

interface BrandLogoProps {
  size?: number;
  showName?: boolean;
}

const BrandLogo = ({ size = 32, showName = false }: BrandLogoProps) => (
  <span className="brand-logo" style={{ fontSize: size }}>
    <svg
      className="brand-logo-mark"
      viewBox="0 0 48 48"
      width={size}
      height={size}
      role="img"
      aria-label="明鉴"
    >
      <defs>
        <linearGradient id="brand-logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2E7D4F" />
          <stop offset="100%" stopColor="#1E5A37" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="48" height="48" rx="13" fill="url(#brand-logo-bg)" />
      <g stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" fill="none">
        {/* 天平横杆:左端下垂,右端弯成对钩 */}
        <path d="M12 16 L36 16" />
        <path d="M12 16 L10.5 28" />
        <path d="M30.5 16 C33 23 34.5 26 36.5 30 C37.8 32.6 39.5 33.4 40.5 32.8" />
        {/* 托盘 */}
        <path d="M5 31.5 C8 35 14 35 16.5 31.5" />
        <path d="M9.5 28 L9.5 32.5" />
      </g>
      {/* 对钩顶点 */}
      <path
        d="M40.5 32.8 L43.5 28.8"
        stroke="#A8D4A0"
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
    {showName && <span className="brand-logo-name">明鉴</span>}
  </span>
);

export default BrandLogo;
