'use client';

export function toBeijing(beijingDate: string): string {
  const d = new Date(beijingDate.replace(' ', 'T') + '+08:00');
  return d.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function toBeijingFull(beijingDate: string): string {
  const d = new Date(beijingDate.replace(' ', 'T') + '+08:00');
  return d.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}
