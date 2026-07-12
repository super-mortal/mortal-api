'use client';

import React from 'react';

/**
 * Lucide Icon component — loads SVGs from /public/icons/ (offline/local).
 * Usage: <Icon name="check" className="w-4 h-4 text-green-500" />
 *
 * The SVG files are downloaded via scripts/download-lucide-icons.js
 * All icons: https://lucide.dev/icons
 */
interface IconProps {
  name: string;
  className?: string;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, className = 'w-4 h-4', size }: IconProps) {
  const cn = size ? `${className}` : className;
  return (
    <svg className={cn} width={size || 24} height={size || 24} strokeWidth={1.5} aria-hidden="true">
      <use href={`/icons/${name}.svg#svg-icon`} />
    </svg>
  );
}

// Direct SVG paths as components for key used icons (avoids flash of missing on first load)
export const icons = {
  dashboard: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  key: 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
  plug: 'M12 22v-5m0-5v-5M9 2v4m6-4v4M4 11h16M3 7h18M5 15h14',
  logOut: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14l5-5-5-5m5 5H9',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18M6 6l12 12',
  trash2: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6',
  plus: 'M12 5v14M5 12h14',
  pencil: 'M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z',
  copy: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2m-4 8h8c1.1 0 2 .9 2 2v8c0 1.1-.9 2-2 2h-8c-1.1 0-2-.9-2-2v-8c0-1.1.9-2 2-2z',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 0l11 11',
  calendar: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  calendarDays: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
  chevronDown: 'M6 9l6 6 6-6',
  chevronLeft: 'M15 18l-6-6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
  arrowRight: 'M5 12h14M12 5l7 7-7 7',
  arrowLeft: 'M19 12H5m7-7l-7 7 7 7',
  checkCheck: 'M2 12l5 5 10-10m4 5l-4 4-2-2',
  sparkles: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456z',
  zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  circleCheck: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3',
  circleX: 'M22 12A10 10 0 1 1 12 2a10 10 0 0 1 10 10zm-7-5l-6 6m0-6l6 6',
  triangleAlert: 'M12 9v4m0 4h.01M10.29 3.86l-8.1 14a2 2 0 0 0 1.73 3h16.16a2 2 0 0 0 1.73-3l-8.1-14a2 2 0 0 0-3.48 0z',
  loaderCircle: 'M21 12a9 9 0 1 1-6.219-8.56',
  clock: 'M12 6v6l4 2m8-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0z',
  trendingUp: 'M22 7l-8.5 8.5-5-5L2 17',
  server: 'M22 21H2M2 3h20M2 9h20M2 15h20M6 3v6m12-6v6M6 15v6m12-6v6',
  database: 'M12 2C8.13 2 2 4.69 2 7c0 2.31 6.13 5 10 5s10-2.69 10-5c0-2.31-6.13-5-10-5zM2 17c0 2.31 6.13 5 10 5s10-2.69 10-5M2 12c0 2.31 6.13 5 10 5s10-2.69 10-5',
  circle: 'M12 12m-10 0a10 10 0 1 0 20 0a10 10 0 1 0 -20 0',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  menu: 'M4 6h16M4 12h16M4 18h16',
  home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  bot: 'M12 8V4m0-4v.01M12 12v-.01M12 16v-.01M9 8h6M8 12h8M7 16h10M3 4h18M3 20h18M4 8h16M4 16h16',
  globe: 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10zm0 0a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
  settings: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  info: 'M12 16v-4m0-4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z',
  ellipsisVertical: 'M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0m0-6a1 1 0 1 0 2 0a1 1 0 1 0 -2 0m0 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
  gauge: 'M12 12l4-4M12 2a10 10 0 1 0 10 10',
  'list': 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  'chart-line': 'M22 22H2M4 18l4-4 3 3 9-9',
  'chart-pie': 'M21.21 15.89A10 10 0 1 1 8 2.83M22 12A10 10 0 0 0 12 2v10z',
  'chart-area': 'M22 22H2M3 17l5-7 4 4 7-9 5 5',
  'hard-drive': 'M22 12H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11zM6 16h.01M10 16h.01',
  cpu: 'M9 3v2m6-2v2M5 8H3m18 0h-2M5 12H3m18 0h-2M5 16H3m18 0h-2M9 19v2m6-2v2M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm2 5h6v4H9v-4z',
  toggleLeft: 'M2 12a6 6 0 1 1 12 0 6 6 0 0 1-12 0zm0 0h12',
  toggleRight: 'M2 12a6 6 0 1 1 12 0 6 6 0 0 1-12 0zm12 0',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m7-10v10m0 0l-4-4m4 4l4-4',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m7-10v10m0 0l-4-4m4 4l4-4',
  externalLink: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6m-4 10L21 3m0 0h-6m6 0v6',
  github: 'M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4',
  'arrow-up-right': 'M7 17L17 7m0 0H9m8 0v8',
  'square-pen': 'M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z',
  ban: 'M3 3l18 18M9 3h6v2H9zM5 7v10l3 3h8l3-3V7M7 7h10v8l-2 2H9l-2-2V7z',
  'funnel-x': 'M3 3h18L13 12v9l-2-2v-7L3 3zm15 11l4 4m0-4l-4 4',
  'layout-dashboard': 'M3 3h7v9H3V3zm0 13h7v5H3v-5zm11-13h7v5h-7V3zm0 9h7v9h-7v-9z',
};

/**
 * Inline SVG Icon component — embeds path directly (no external file load).
 * Use this when you need zero-load or the icon name isn't downloaded.
 */
export function InlineIcon({ name, className = 'w-4 h-4', size }: IconProps) {
  const path = (icons as any)[name];
  if (!path) return <Icon name={name} className={className} size={size} />;
  return (
    <svg
      className={className}
      width={size || 24}
      height={size || 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}
