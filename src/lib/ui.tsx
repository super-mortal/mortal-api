'use client';

import React from 'react';
import { InlineIcon } from './icon';

/** 居中加载 spinner（用于整页/区块加载态） */
export function Spinner({ className = 'w-6 h-6' }: { className?: string }) {
  return <InlineIcon name="loaderCircle" className={`${className} animate-spin text-indigo-600`} />;
}

/** 空状态：图标 + 文案 */
export function EmptyState({ icon, text, className = '', iconClassName = 'w-8 h-8 mb-2 text-gray-300' }: { icon: string; text: string; className?: string; iconClassName?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center text-gray-400 ${className}`}>
      <InlineIcon name={icon} className={iconClassName} />
      <p>{text}</p>
    </div>
  );
}

/** 状态徽章 pill */
export function StatusBadge({ variant, icon, label }: { variant: 'success' | 'fail'; icon: string; label: string }) {
  const cls = variant === 'success'
    ? 'bg-emerald-50/80 text-emerald-600 border-emerald-200/50'
    : 'bg-red-50/80 text-red-500 border-red-200/50';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${cls}`}>
      <InlineIcon name={icon} className="w-2.5 h-2.5 mr-0.5" />{label}
    </span>
  );
}

/** 表格加载/空行 */
export function TableEmpty({ colSpan, loading, text, icon }: { colSpan: number; loading?: boolean; text?: string; icon?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-16 text-center">
        {loading ? (
          <InlineIcon name="loaderCircle" className="w-5 h-5 animate-spin text-indigo-600 inline" />
        ) : (
          <>
            {icon && (
              <div className="text-gray-300 text-3xl mb-2">
                <InlineIcon name={icon} className="w-8 h-8 mx-auto" />
              </div>
            )}
            <p className="text-sm text-gray-400">{text || '暂无数据'}</p>
          </>
        )}
      </td>
    </tr>
  );
}
