# 管理员重置后强制改密 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理员在后台重置 Key 访问密码后,使用者首次访问 `/u/<name>` 进入 ChangePasswordView,在该页面输入旧密码(默认值)+ 新密码 + 确认新密码,提交后立即改密成功并进入统计页。

**Architecture:** 在 `relay_keys` 表加 `must_reset_password INTEGER DEFAULT 0` 列(沿用 v6/v7 风格的迁移)。`src/lib/key-access.ts` 扩展 `setAccessPassword` 支持"首次设密"和"改密"两种路径(由 SQL 守卫 `WHERE (access_password_enc IS NULL OR must_reset_password = 1)` 原子判断)。复用现有 `/api/u/[name]/setup` 端点(扩展 body),不新增端点。新增 `ChangePasswordForm` 客户端组件,`page.tsx` 由三态扩展为四态分发。

**Tech Stack:** Next.js 16 App Router, TypeScript, SQLite (better-sqlite3), Tailwind v4。

## Global Constraints

- **表名**: 真实表 `relay_keys`,列加 `must_reset_password INTEGER NOT NULL DEFAULT 0`
- **迁移模式**: 在 `src/lib/db.ts` 的 `initSchema()` 末尾追加 `v7_must_reset_password` 段(用 `_migrations` 表幂等跟踪)
- **加密**: 复用 `src/lib/crypto.ts` 的 `encryptApiKey` / `decryptApiKey`
- **密码正则**: `/^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{12,}$/`(沿用)
- **Cookie**: 名称 `mps`,`httpOnly`,`sameSite: 'lax'`,`path: '/'`,`maxAge: 30*24*3600`(沿用 Task 11 修复后的设置)
- **限流**: 复用 setup 桶(`${ip}:setup`),10/分/IP
- **默认密码**: `@123456789123Pk`
- **图标**: 仅用本地 Lucide。`shield-check` 和 `lock` 已在 Task 8 修复时下载到 `public/icons/`,直接复用
- **Chinese UI**: 沿用现有 dashboard 风格(indigo-500 + 浅灰边)
- **frequent commits**: 每个任务结束都 `git commit`
- **TDD**: 不引入单元测试框架;验证靠 `npx tsc --noEmit` + `npm run build` + 端到端手测清单(沿用项目惯例)
- **YAGNI**: 不做主动改密(仅"被重置后强制改")、不做改密历史、不做邮件通知
- **branch discipline**: 所有 commit 必须在 `main`,不允许创建 `feat/...` 分支

---

## 文件结构

### 修改

```
src/lib/db.ts                  # 追加 v7_must_reset_password 迁移段
src/lib/types.ts               # RelayKey 加 must_reset_password 字段
src/lib/key-access.ts          # 扩展 getRelayKeyPasswordStatus → getKeyAccessState;改 setAccessPassword/resetAccessPasswordToDefault 的 SQL
src/app/api/u/[name]/setup/route.ts   # 扩展 body + 分支
src/app/u/[name]/page.tsx      # 三态 → 四态分发,引入 ChangePasswordForm
src/app/u/[name]/setup-form.tsx       # 复用 — 不变
```

### 新增

```
src/app/u/[name]/change-password-form.tsx  # 客户端组件
```

---

## Task 1: 数据库迁移 v7 — `must_reset_password` 列

**Files:**
- Modify: `src/lib/db.ts` — 在 `initSchema()` 末尾、`return db;` 之前追加一段
- Modify: `src/lib/types.ts` — `RelayKey` 接口加 `must_reset_password` 字段

**Step 1: 修改 `src/lib/types.ts`**

在 `RelayKey` 接口里 `access_password_set_at` 后面加:

```ts
export interface RelayKey {
  id: string;
  key: string;
  name: string;
  spend_limit: number;
  total_spent: number;
  is_active: number;
  is_pinned: number;
  expires_at: string | null;
  allowed_models: string;
  allowed_channels: string;
  created_at: string;
  updated_at: string;
  access_password_enc: string | null;
  access_password_set_at: string | null;
  must_reset_password: number;       // NEW: 1 = 需改密, 0 = 正常
}
```

**Step 2: 修改 `src/lib/db.ts`**

在 `initSchema()` 函数体里,**最后一个迁移段之后**,追加:

```ts
  // Migration: must_reset_password column for admin-reset flow
  const mrMigrated = db.prepare("SELECT name FROM _migrations WHERE name = 'v7_must_reset_password'").get();
  if (!mrMigrated) {
    const cols = db.prepare("PRAGMA table_info('relay_keys')").all() as { name: string }[];
    if (!cols.find(c => c.name === 'must_reset_password')) {
      db.exec("ALTER TABLE relay_keys ADD COLUMN must_reset_password INTEGER NOT NULL DEFAULT 0");
    }
    db.prepare("INSERT INTO _migrations (name) VALUES ('v7_must_reset_password')").run();
  }
```

**Step 3: 验证**

```bash
npm run dev
# 在另一个 shell:
node -e "const db = require('better-sqlite3')('data/relay.db'); console.log(db.prepare(\"PRAGMA table_info('relay_keys')\").all().map(c => c.name)); console.log(db.prepare(\"SELECT * FROM _migrations WHERE name='v7_must_reset_password'\").all());"
```

期望输出包含 `must_reset_password` 和 `{ name: 'v7_must_reset_password', applied_at: ... }`。

**Step 4: Commit**

```bash
git add src/lib/db.ts src/lib/types.ts
git commit -m "feat(db): v7_must_reset_password column"
```

---

## Task 2: `key-access.ts` — 扩展 getKeyAccessState / setAccessPassword / resetAccessPasswordToDefault

**Files:**
- Modify: `src/lib/key-access.ts`

**Decisions locked in by the planner:**
- 不新增文件,全部在本文件内扩展
- `getRelayKeyPasswordStatus` 保留并委托给 `getKeyAccessState`(避免破坏现有调用方),但 page.tsx 在 Task 4 切换到 `getKeyAccessState`
- `setAccessPassword` 的 `SetResult` union 扩展一个新 reason:`PASSWORD_ALREADY_SET_AND_NOT_RESET`
- `setAccessPassword` 的 SQL 同时支持两种入口(首次设密 + 改密),靠 `WHERE` 守卫
- `resetAccessPasswordToDefault` 增加 `must_reset_password = 1`
- 新增 `changeAccessPassword(name, currentPwd, newPwd)` 函数:验证旧密码 + 调用 `setAccessPassword` 复用 SQL 守卫(语义与"setAccessPassword + 已提供 currentPassword"等价的,但走纯函数路径更清晰)

实际上 **不需要** 新增 `changeAccessPassword`: setup 端点的"改密分支"已经在 setup 端点内独立判断,只调 `setAccessPassword`。`setAccessPassword` 自身已经由 SQL 守卫保证两种入口的互斥。所以这个 task 只需扩展 `SetResult` + SQL + reset 函数。

**Step 1: 替换 `getRelayKeyPasswordStatus` 函数体**

替换 `key-access.ts` 第 31-43 行(`getRelayKeyPasswordStatus`):

```ts
export interface KeyAccessState {
  exists: boolean;
  isActive: boolean;
  hasPassword: boolean;
  mustReset: boolean;
}

export function getKeyAccessState(name: string): KeyAccessState | null {
  const k = getRelayKeyByName(name);
  if (!k) return null;
  return {
    exists: true,
    isActive: k.is_active === 1,
    hasPassword: !!k.access_password_enc,
    mustReset: k.must_reset_password === 1,
  };
}

/** @deprecated use getKeyAccessState */
export function getRelayKeyPasswordStatus(name: string): KeyAccessState | null {
  return getKeyAccessState(name);
}
```

**Step 2: 更新 `getRelayKeyByName` 返回类型**

替换第 19-29 行:

```ts
export function getRelayKeyByName(name: string) {
  return getDb().prepare('SELECT id, name, is_active, access_password_enc, access_password_set_at, must_reset_password FROM relay_keys WHERE name = ?').get(name) as
    | {
        id: string;
        name: string;
        is_active: number;
        access_password_enc: string | null;
        access_password_set_at: string | null;
        must_reset_password: number;
      }
    | undefined;
}
```

**Step 3: 扩展 `SetResult` 类型 + `setAccessPassword` 实现**

替换第 45-62 行(`SetResult` + `setAccessPassword`):

```ts
export type SetResult =
  | { ok: true; relayKeyId: string }
  | {
      ok: false;
      reason:
        | 'NOT_FOUND'
        | 'ALREADY_SET'
        | 'WEAK_PASSWORD'
        | 'PASSWORD_ALREADY_SET_AND_NOT_RESET';
    };

export function setAccessPassword(name: string, pwd: string): SetResult {
  if (!isPasswordStrong(pwd)) return { ok: false, reason: 'WEAK_PASSWORD' };
  const k = getRelayKeyByName(name);
  if (!k) return { ok: false, reason: 'NOT_FOUND' };
  const enc = encryptApiKey(pwd);
  // 原子写:首次设密 (NULL) 或 改密 (must_reset=1) 都接受;否则拒绝
  const r = getDb().prepare(`
    UPDATE relay_keys
    SET access_password_enc = ?,
        access_password_set_at = datetime('now', '+8 hours'),
        must_reset_password = 0
    WHERE id = ?
      AND (access_password_enc IS NULL OR must_reset_password = 1)
  `).run(enc, k.id);
  if (r.changes === 0) {
    return { ok: false, reason: 'PASSWORD_ALREADY_SET_AND_NOT_RESET' };
  }
  return { ok: true, relayKeyId: k.id };
}
```

**Step 4: 修改 `resetAccessPasswordToDefault`**

替换第 74-83 行:

```ts
export function resetAccessPasswordToDefault(keyId: string): boolean {
  const enc = encryptApiKey(DEFAULT_ACCESS_PASSWORD);
  const r = getDb().prepare(`
    UPDATE relay_keys
    SET access_password_enc = ?,
        access_password_set_at = datetime('now', '+8 hours'),
        must_reset_password = 1
    WHERE id = ?
  `).run(enc, keyId);
  deleteSessionsForKey(keyId);
  return r.changes > 0;
}
```

**Step 5: 类型检查**

```bash
npx tsc --noEmit
```

期望:无错误。

**Step 6: Commit**

```bash
git add src/lib/key-access.ts
git commit -m "feat(key-access): add must_reset_password flow + atomic setAccessPassword"
```

---

## Task 3: `/api/u/[name]/setup` 扩展 — 支持改密分支

**Files:**
- Modify: `src/app/api/u/[name]/setup/route.ts` — 完整替换

**Step 1: 替换整个文件**

```ts
import { NextRequest, NextResponse } from 'next/server';
import {
  checkRateLimit,
  createSession,
  setAccessPassword,
  getRelayKeyByName,
  verifyAccessPassword,
  isPasswordStrong,
} from '@/lib/key-access';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  if (!checkRateLimit(`${ip}:setup`)) {
    return NextResponse.json({ error: '请求过于频繁,请稍后再试' }, { status: 429 });
  }
  const { name } = await params;
  const body = await request.json().catch(() => ({}));
  const { password, confirm, currentPassword } = body || {};

  // 1. 基础校验
  if (typeof password !== 'string' || password !== confirm) {
    return NextResponse.json({ error: '两次密码输入不一致' }, { status: 400 });
  }
  if (!isPasswordStrong(password)) {
    return NextResponse.json(
      { error: '密码必须 ≥12 位,含大小写字母与特殊字符' },
      { status: 400 }
    );
  }

  // 2. 查 key(一次查询)
  const k = getRelayKeyByName(name);
  if (!k) return NextResponse.json({ error: 'Key 不存在' }, { status: 404 });

  const isFirstSetup = !k.access_password_enc;
  const providedCurrent = typeof currentPassword === 'string' && currentPassword.length > 0;

  // 3. 首次设密 vs 改密路径分流
  if (isFirstSetup) {
    if (providedCurrent) {
      return NextResponse.json(
        { error: '首次设密不需要 currentPassword' },
        { status: 400 }
      );
    }
  } else {
    // 已有密码 — 改密路径
    if (!providedCurrent) {
      return NextResponse.json({ error: '请输入当前密码' }, { status: 400 });
    }
    if (!verifyAccessPassword(name, currentPassword)) {
      return NextResponse.json(
        { error: '当前密码错误,请输入管理员重置后的默认值' },
        { status: 401 }
      );
    }
    if (currentPassword === password) {
      return NextResponse.json(
        { error: '新密码不能与当前密码相同' },
        { status: 400 }
      );
    }
  }

  // 4. 原子写(setAccessPassword 内部 SQL 守卫)
  const r = setAccessPassword(name, password);
  if (!r.ok) {
    const map: Record<string, { status: number; msg: string }> = {
      NOT_FOUND: { status: 404, msg: 'Key 不存在' },
      ALREADY_SET: { status: 409, msg: '该 Key 已设置访问密码,请使用登录页' },
      WEAK_PASSWORD: {
        status: 400,
        msg: '密码必须 ≥12 位,含大小写字母与特殊字符',
      },
      PASSWORD_ALREADY_SET_AND_NOT_RESET: {
        status: 409,
        msg: '密码已是您自己设置,无需改密。如需修改请联系管理员',
      },
    };
    const { status, msg } = map[r.reason];
    return NextResponse.json({ error: msg }, { status });
  }

  // 5. 建 session + 发 cookie
  const ua = request.headers.get('user-agent') || '';
  const session = createSession(r.relayKeyId, ip, ua);
  const res = NextResponse.json({ success: true });
  res.cookies.set('mps', session.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 3600,
  });
  return res;
}
```

**Step 2: 类型检查**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/app/api/u/[name]/setup/route.ts
git commit -m "feat(api): setup endpoint supports admin-reset change-password flow"
```

---

## Task 4: `/u/[name]` 四态分发

**Files:**
- Modify: `src/app/u/[name]/page.tsx` — 完整替换

**Step 1: 替换整个文件**

```tsx
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import {
  getKeyAccessState,
  getSessionById,
} from '@/lib/key-access';
import {
  getKeySummary,
  getKeyDailyTrend,
  getKeyRecentLogs,
} from '@/lib/key-stats';
import { getRelayKeyById } from '@/lib/keys';
import SetupForm from './setup-form';
import LoginForm from './login-form';
import ChangePasswordForm from './change-password-form';
import StatsView from './stats-view';

export default async function KeyPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { name } = await params;
  const { days: daysStr } = await searchParams;
  const days = daysStr === '7' ? 7 : 30;

  const state = getKeyAccessState(name);
  if (!state) notFound();

  const cookieStore = await cookies();
  const sessionId = cookieStore.get('mps')?.value;

  if (sessionId) {
    const sess = getSessionById(sessionId);
    if (sess && new Date(sess.expires_at.replace(' ', 'T') + 'Z').getTime() > Date.now()) {
      const key = getRelayKeyById(sess.relay_key_id);
      if (key && key.name === name) {
        const summary = getKeySummary(key.id);
        const trend = getKeyDailyTrend(key.id, days);
        const recent = getKeyRecentLogs(key.id, 50);
        return (
          <StatsView
            keyName={name}
            isActive={key.is_active === 1}
            summary={summary}
            trend={trend}
            days={days}
            recent={recent}
          />
        );
      }
    }
  }

  if (!state.hasPassword) return <SetupForm keyName={name} />;
  if (state.mustReset) return <ChangePasswordForm keyName={name} />;
  return <LoginForm keyName={name} />;
}
```

**Step 2: 创建临时 stub(避免 tsc 报错)**

由于 `change-password-form.tsx` 还不存在,创建临时 stub:

```tsx
// src/app/u/[name]/change-password-form.tsx(临时 stub,Task 5 覆盖)
export default function ChangePasswordForm({ keyName }: { keyName: string }) {
  return <div className="p-8">ChangePasswordForm for {keyName} (stub)</div>;
}
```

**Step 3: 类型检查**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/app/u/[name]/page.tsx src/app/u/[name]/change-password-form.tsx
git commit -m "feat(u-page): tri-state → quad-state dispatcher with ChangePasswordForm"
```

---

## Task 5: `ChangePasswordForm` 客户端组件(覆盖 stub)

**Files:**
- Create: `src/app/u/[name]/change-password-form.tsx`(覆盖 Task 4 的 stub,同路径)

**Step 1: 覆盖文件**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineIcon } from '@/lib/icon';

const RE = {
  length: /.{12,}/,
  lower: /[a-z]/,
  upper: /[A-Z]/,
  special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
};

function checks(pwd: string) {
  return {
    length: RE.length.test(pwd),
    lower: RE.lower.test(pwd),
    upper: RE.upper.test(pwd),
    special: RE.special.test(pwd),
  };
}

export default function ChangePasswordForm({ keyName }: { keyName: string }) {
  const router = useRouter();
  const [currentPassword, setCurrent] = useState('');
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const c = checks(pwd);
  const allOk = c.length && c.lower && c.upper && c.special;

  const submit = async () => {
    if (!currentPassword) return setErr('请输入当前密码');
    if (!allOk) return setErr('密码必须 ≥12 位,含大小写字母与特殊字符');
    if (pwd !== confirm) return setErr('两次输入不一致');
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/u/${encodeURIComponent(keyName)}/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, password: pwd, confirm }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setErr(data.error || `请求失败 (${r.status})`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <InlineIcon name="shield-check" className="w-5 h-5 text-indigo-500" />
          <h1 className="text-lg font-semibold text-gray-900">设置新密码</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Key <span className="font-mono text-gray-700">{keyName}</span>
        </p>

        <label className="block text-sm font-medium text-gray-700 mb-1">当前密码</label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          placeholder="@123456789123Pk"
        />

        <label className="block text-sm font-medium text-gray-700 mt-4 mb-1">新密码</label>
        <input
          type="password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          placeholder="至少 12 位,含大小写字母与特殊字符"
        />
        <ul className="mt-2 grid grid-cols-2 gap-1 text-xs">
          {[
            ['length', '≥ 12 位'],
            ['lower', '含小写字母'],
            ['upper', '含大写字母'],
            ['special', '含特殊字符'],
          ].map(([k, label]) => (
            <li
              key={k}
              className={c[k as keyof typeof c] ? 'text-emerald-600' : 'text-gray-400'}
            >
              <InlineIcon
                name={c[k as keyof typeof c] ? 'check' : 'x'}
                className="w-3 h-3 inline mr-1"
              />
              {label}
            </li>
          ))}
        </ul>

        <label className="block text-sm font-medium text-gray-700 mt-4 mb-1">确认新密码</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />

        {err && (
          <div className="mt-3 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {err}
          </div>
        )}
        <button
          onClick={submit}
          disabled={!allOk || busy || pwd !== confirm || !currentPassword}
          className="mt-5 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          <InlineIcon name="lock" className="w-4 h-4" />
          {busy ? '提交中…' : '提交并进入'}
        </button>
      </div>
    </div>
  );
}
```

**Step 2: 类型检查**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/app/u/[name]/change-password-form.tsx
git commit -m "feat(u-page): ChangePasswordForm client component"
```

---

## Task 6: Build 验证 + 端到端手测清单

**Files:**
- Verify: `npm run build` 必须通过
- Verify: 无任何源代码改动预期

**Step 1: Build**

```bash
npm run build 2>&1 | tail -30
```

期望:`Compiled successfully` + 路由表含 `/u/[name]` 与 `/api/u/[name]/{setup,login,logout}`。

**Step 2: tsc 检查**

```bash
npx tsc --noEmit
```

期望:无错误(零输出)。

**Step 3: 端到端手测清单(13 步)**

启动 `npm run dev`,跑下列步骤,**任何一步失败 → 停下来修复**,不要 commit:

```bash
npm run dev
```

| # | 步骤 | 期望 |
|---|------|------|
| 1 | 创建测试 Key `test-key` | 管理后台 Key 列表出现 |
| 2 | 浏览器访问 `/u/test-key` | SetupView |
| 3 | 输入合规密码 → 提交 | 进 StatsView(`must_reset_password = 0`) |
| 4 | 点"退出" | 回 LoginView(不是 ChangePasswordView,验证 `must_reset=0` 时是 LoginView) |
| 5 | 用正确密码登录 | StatsView |
| 6 | 管理员后台 → test-key → 重置访问密码 | 成功;DB 中 `must_reset_password = 1`,旧 session 清空 |
| 7 | 浏览器访问 `/u/test-key` | **ChangePasswordView**(三行表单) |
| 8 | 旧密码留空 → 提交 | 红色错误"请输入当前密码" |
| 9 | 旧密码错(非默认值)→ 提交 | 红色错误"当前密码错误,请输入管理员重置后的默认值" |
| 10 | 旧密码 = `@123456789123Pk`,新密码 `abc`(弱)→ 提交 | 红色错误"密码必须 ≥12 位…" |
| 11 | 旧密码 = `@123456789123Pk`,新密码 `Abcdef1234567`(无特殊字符)→ 提交 | 提交按钮仍 disabled |
| 12 | 旧密码 = `@123456789123Pk`,新密码 = 同一个 → 提交 | 红色错误"新密码不能与当前密码相同" |
| 13 | 旧密码 = `@123456789123Pk`,新密码 = `NewPass!@#$Abc`,确认一致 → 提交 | 进 StatsView;DB 中 `must_reset_password = 0` |
| 14 | 退出后再访问 `/u/test-key` | LoginView(不再 ChangePasswordView) |
| 15 | **回归**:使用者在 step 13 后调用 setup 带任意 currentPassword | 409 "密码已是您自己设置…" |
| 16 | **回归**:重命名 test-key → `/u/test-key` 旧 URL 404 | 404 |

任一失败 → 修复源码 → 重跑完整清单。

**Step 4: Commit(若有修复)**

```bash
git add -A
git commit -m "fix(u-page): E2E test fixes for change-password flow"
```

---

## Task 7: 文档 — README + spec 更新

**Files:**
- Modify: `README.md` — 在「使用者查看页面」小节追加改密流程说明
- Modify: `docs/superpowers/specs/2026-07-24-force-change-password-after-admin-reset-design.md` — 追加"实现状态"小节(可选;若 spec 已经标注 Draft 可不改)

**Step 1: README 追加**

找到 `### 使用者查看页面` 段落,替换为:

```markdown
### 使用者查看页面

Key 使用者可访问自己的使用统计页:

```
GET https://your.domain.com/u/<key-name>
```

- **首次访问**: 设置访问密码(≥12 位,含大小写字母与特殊字符)
- **之后**: 用密码登录,查看总调用数 / Token / 费用 / 趋势图 / 近期明细(50 条)
- **管理员重置后**: 登录页变为"设置新密码"页(输入当前默认值 + 新密码 + 确认新密码),提交后直接进入统计页;改密后才回到普通登录流
- **忘记密码**: 联系管理员在管理后台 → Key 管理 → 重置访问密码
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document change-password-after-reset flow"
```

---

## Self-Review

1. **Spec 覆盖**:
   - v7 迁移 + `must_reset_password` 列 → Task 1
   - `getKeyAccessState` 接口 + `setAccessPassword` 扩展 + `resetAccessPasswordToDefault` 改 SQL → Task 2
   - setup 端点 4 种新错误码 + body 扩展 + 分流逻辑 → Task 3
   - 四态分发 → Task 4
   - ChangePasswordForm 客户端组件(三行 + 强度) → Task 5
   - Build + E2E 手测清单 → Task 6
   - README 更新 → Task 7
   - YAGNI(不做主动改密、不做改密历史): 全 plan 都未引入
   - 安全性(原子性、SQL 守卫): Task 2 SQL + Task 3 分流逻辑

2. **占位符扫描**: 无 TBD/TODO。代码块完整可执行。

3. **类型一致性**:
   - `KeyAccessState` 字段 `exists/isActive/hasPassword/mustReset` — Task 2 定义,Task 4 page.tsx 使用一致
   - `RelayKey.must_reset_password` — Task 1 types.ts 加,Task 2 SELECT 返回类型加,Task 2 reset SQL 写入
   - `SetResult` reason union 加 `PASSWORD_ALREADY_SET_AND_NOT_RESET` — Task 2 定义,Task 3 map 用
   - setup 端点错误消息 — Task 3 map 字符串与 spec 第 5.3 节错误码表逐条对应
   - Cookie `mps` 路径 `/` — 沿用 Task 11 修复后的设置

   潜在问题:`setAccessPassword` 在 Task 2 改 SQL 后,Task 3 setup 端点对首次设密场景调用它时也会触发相同的 WHERE 守卫,但首次设密 = `access_password_enc IS NULL`,守卫条件 `(NULL OR must_reset=1)` = true,允许写入。逻辑正确。