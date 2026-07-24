'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineIcon } from '@/lib/icon';

export default function LogoutButton({ keyName }: { keyName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const logout = async () => {
    setBusy(true);
    try {
      await fetch(`/api/u/${encodeURIComponent(keyName)}/logout`, { method: 'POST' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={logout}
      disabled={busy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
    >
      <InlineIcon name="log-out" className="w-4 h-4" />
      退出
    </button>
  );
}
