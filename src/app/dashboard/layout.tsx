'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { InlineIcon } from '@/lib/icon';

const navItems = [
  { href: '/dashboard', label: '仪表盘', icon: 'layout-dashboard' },
  { href: '/dashboard/keys', label: 'Key 管理', icon: 'key' },
  { href: '/dashboard/channels', label: '渠道管理', icon: 'plug' },
  { href: '/dashboard/models', label: '模型广场', icon: 'bot' },
  { href: '/dashboard/logs', label: '调用日志', icon: 'list' },
  { href: '/dashboard/backup', label: '备份恢复', icon: 'hard-drive' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) router.replace('/login');
    else setAuthed(true);
    setLoading(false);
  }, [router]);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    router.replace('/login');
  };

  if (loading) return (<div className="min-h-screen flex items-center justify-center bg-gray-50"><InlineIcon name="loaderCircle" className="w-6 h-6 animate-spin text-indigo-600" /></div>);
  if (!authed) return null;

  const sidebarContent = (
    <div className="w-56 h-full bg-white border-r border-gray-100 flex flex-col shrink-0">
      <div className="h-14 sm:h-16 flex items-center justify-between gap-2.5 px-4 sm:px-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs">M</div>
          <span className="font-semibold text-gray-900 text-sm">Mortal API</span>
        </div>
        {mobileOpen && (
          <button onClick={() => setMobileOpen(false)} className="lg:hidden p-1 text-gray-400 hover:text-gray-600">
            <InlineIcon name="x" className="w-5 h-5" />
          </button>
        )}
      </div>
      <nav className="flex-1 p-2 sm:p-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}>
              <InlineIcon name={item.icon} className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-2 sm:p-3 border-t border-gray-100">
        <button onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors">
          <InlineIcon name="logOut" className="w-4 h-4" /> 退出登录
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-100 flex items-center justify-between px-4 z-40">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs">M</div>
          <span className="font-semibold text-gray-900 text-sm">Mortal API</span>
        </div>
        <button onClick={() => setMobileOpen(true)} className="p-1.5 text-gray-500 hover:text-gray-700"><InlineIcon name="menu" className="w-5 h-5" /></button>
      </div>
      {/* Mobile sidebar backdrop */}
      {mobileOpen && <div className="lg:hidden fixed inset-0 z-40 bg-black/30" onClick={() => setMobileOpen(false)} />}
      {/* Sidebar */}
      <aside className={`${mobileOpen ? 'fixed left-0 top-0 bottom-0 z-50 flex' : 'hidden'} lg:relative lg:flex lg:w-56 flex-col shrink-0`}>
        {sidebarContent}
      </aside>
      {/* Main */}
      <main className="flex-1 overflow-auto pt-14 lg:pt-0">
        <div className="max-w-7xl mx-auto p-4 sm:p-6">{children}</div>
      </main>
    </div>
  );
}
