# Key 公开使用统计页实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Key 使用者提供公开使用统计页 `/u/<key-name>`,首次访问自助设置访问密码,之后用密码登录查看自己的用量。管理员可在后台一键重置该 Key 的访问密码为默认值。

**Architecture:** 新增 Next.js 路由 `/u/[name]`(server component),三态渲染(SetupView / LoginView / StatsView)。在 `relay_keys` 表加两列,在 `db.ts` 的 `initSchema()` 里追加一段 v6 迁移建 `key_access_sessions` 表。新增 `src/lib/key-access.ts` 提供加密、验证、限流、session 管理。新增 `src/lib/key-stats.ts` 提供按 key 过滤的查询。前端用 SSR 直接拉数据,客户端组件用 fetch POST 提交密码/退出。

**Tech Stack:** Next.js 16 App Router,TypeScript,SQLite (better-sqlite3),Tailwind v4,Recharts,Lucide Icons(本地)。

## Global Constraints

- **真实表名**: 项目里表叫 `relay_keys`,**不是** `keys`(spec 里写错了,plan 用 `relay_keys`)
- **迁移模式**: 在 `src/lib/db.ts` 的 `initSchema()` 末尾追加 `v6_key_access` 段(用 `_migrations` 表幂等跟踪),不要新增独立脚本
- **加密 API**: 复用 `src/lib/crypto.ts` 的 `encryptApiKey` / `decryptApiKey`
- **图标**: 仅使用本地 Lucide,新增图标需 `node scripts/download-lucide-icons.js`(已存在: `key`, `lock`, `log-out`, `eye`, `eye-off`, `shield-check`, `trending-up`)
- **Cookie**: 名称 `mps`,`HttpOnly`,`Path=/u/<name>`,`Max-Age=2592000`,`SameSite=Lax`
- **默认密码**: `@123456789123Pk`
- **限流阈值**: 10 次/分钟/IP,setup 与 login 共享桶
- **密码正则**: `/^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{12,}$/`
- **中文 UI**: 复用现有 dashboard 风格(indigo-500 + 浅灰边)
- **YAGNI**: 不实现修改密码、不做 2FA、不做渠道级明细、不做国际化
- **频繁提交**: 每个任务结束都 `git commit`
- **TypeScript**: `RelayKey` 接口新增 `access_password_enc: string | null; access_password_set_at: string | null;`

---

## 文件结构

### 新增

```
src/lib/key-access.ts          # 核心:加密、验证、session CRUD、限流
src/lib/key-stats.ts           # 按 relay_key_id 聚合的查询(汇总/趋势/明细)
src/app/u/[name]/page.tsx      # server component:三态分发
src/app/u/[name]/setup-form.tsx     # client:密码+确认+强度提示
src/app/u/[name]/login-form.tsx     # client:登录表单
src/app/u/[name]/stats-view.tsx     # client:汇总卡片+趋势图+明细表
src/app/u/[name]/logout-button.tsx  # client:退出按钮
src/app/api/u/[name]/setup/route.ts # POST 首次设密
src/app/api/u/[name]/login/route.ts # POST 登录
src/app/api/u/[name]/logout/route.ts# POST 退出
tests/key-access.test.ts       # 单元测试(可选 node:test)
```

### 修改

```
src/lib/db.ts                  # 追加 v6_key_access 迁移段
src/lib/types.ts               # RelayKey 加两个字段
src/lib/keys.ts                # 加 resetAccessPassword / getAccessStatus
src/app/admin/keys/route.ts    # PATCH 处理 ?action=reset_access_password
src/app/dashboard/keys/page.tsx# Key 操作区加「重置访问密码」按钮
```

---

## Task 1: 数据库迁移 — `relay_keys` 加列 + 新建 `key_access_sessions`

**Files:**
- Modify: `src/lib/db.ts` — 在 `initSchema()` 末尾、`return db;` 之前追加一段
- Modify: `src/lib/types.ts` — `RelayKey` 接口加两个字段

**Step 1: 修改 `src/lib/types.ts`**

在 `RelayKey` 接口里(原 `total_spent` 那行附近)新增:

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
  access_password_enc: string | null;     // NEW
  access_password_set_at: string | null;  // NEW
}
```

**Step 2: 修改 `src/lib/db.ts`**

在 `initSchema()` 函数体里,**最后一个迁移段之后**,追加:

```ts
  // Migration: key public stats page — access_password + sessions
  const keyAccessMigrated = db.prepare("SELECT name FROM _migrations WHERE name = 'v6_key_access'").get();
  if (!keyAccessMigrated) {
    const relayKeyCols = db.prepare("PRAGMA table_info('relay_keys')").all() as { name: string }[];
    if (!relayKeyCols.find(c => c.name === 'access_password_enc')) {
      db.exec("ALTER TABLE relay_keys ADD COLUMN access_password_enc TEXT");
    }
    if (!relayKeyCols.find(c => c.name === 'access_password_set_at')) {
      db.exec("ALTER TABLE relay_keys ADD COLUMN access_password_set_at TEXT");
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS key_access_sessions (
        id TEXT PRIMARY KEY,
        relay_key_id TEXT NOT NULL,
        ip TEXT NOT NULL,
        user_agent TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
        expires_at TEXT NOT NULL,
        FOREIGN KEY (relay_key_id) REFERENCES relay_keys(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_kas_relay_key ON key_access_sessions(relay_key_id);
      CREATE INDEX IF NOT EXISTS idx_kas_expires ON key_access_sessions(expires_at);
    `);
    db.prepare("INSERT INTO _migrations (name) VALUES ('v6_key_access')").run();
  }
```

**Step 3: 验证**

```bash
npm run dev
# 启动后,查看 data/relay.db:
node -e "const db = require('better-sqlite3')('data/relay.db'); console.log(db.prepare(\"PRAGMA table_info('relay_keys')\").all().map(c => c.name)); console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name='key_access_sessions'\").all()); console.log(db.prepare(\"SELECT * FROM _migrations WHERE name='v6_key_access'\").all());"
```

期望输出包含 `access_password_enc`、`access_password_set_at`、`{ name: 'key_access_sessions' }`、`{ name: 'v6_key_access', applied_at: ... }`。

**Step 4: Commit**

```bash
git add src/lib/db.ts src/lib/types.ts
git commit -m "feat(db): v6_key_access — access password columns + sessions table"
```

---

## Task 2: `key-access.ts` 核心模块

**Files:**
- Create: `src/lib/key-access.ts`

**Interfaces (后续任务依赖):**
- `isPasswordStrong(pwd: string): boolean` — 满足 ≥12 + 小写 + 大写 + 特殊字符
- `setAccessPassword(name: string, pwd: string): { ok: true; relayKeyId: string } | { ok: false; reason: 'NOT_FOUND' | 'ALREADY_SET' | 'WEAK_PASSWORD' }`
- `verifyAccessPassword(name: string, pwd: string): boolean` — 同时返回该 key
- `resetAccessPasswordToDefault(keyId: string): boolean`
- `createSession(relayKeyId: string, ip: string, userAgent: string): { id: string; expiresAt: string }`
- `getSessionById(id: string): { relay_key_id: string; expires_at: string } | null`
- `deleteSession(id: string): void`
- `deleteSessionsForKey(keyId: string): void`
- `checkRateLimit(ip: string): boolean` — true = 允许,false = 限流
- `DEFAULT_ACCESS_PASSWORD = '@123456789123Pk'`
- `SESSION_DAYS = 30`
- `RATE_LIMIT_MAX = 10`, `RATE_LIMIT_WINDOW_MS = 60_000`

**Step 1: 创建文件**

```ts
// ============================================================
// Key public access — password + session + rate limit
// ============================================================
import { nanoid } from 'nanoid';
import { getDb } from './db';
import { encryptApiKey, decryptApiKey } from './crypto';

export const DEFAULT_ACCESS_PASSWORD = '@123456789123Pk';
export const SESSION_DAYS = 30;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

const PWD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{12,}$/;

export function isPasswordStrong(pwd: string): boolean {
  return typeof pwd === 'string' && PWD_RE.test(pwd);
}

export function getRelayKeyByName(name: string) {
  return getDb().prepare('SELECT * FROM relay_keys WHERE name = ?').get(name) as
    | {
        id: string;
        name: string;
        is_active: number;
        access_password_enc: string | null;
        access_password_set_at: string | null;
      }
    | undefined;
}

export function getRelayKeyPasswordStatus(name: string): {
  exists: boolean;
  isActive: boolean;
  hasPassword: boolean;
} | null {
  const k = getRelayKeyByName(name);
  if (!k) return null;
  return {
    exists: true,
    isActive: k.is_active === 1,
    hasPassword: !!k.access_password_enc,
  };
}

export type SetResult =
  | { ok: true; relayKeyId: string }
  | { ok: false; reason: 'NOT_FOUND' | 'ALREADY_SET' | 'WEAK_PASSWORD' };

export function setAccessPassword(name: string, pwd: string): SetResult {
  if (!isPasswordStrong(pwd)) return { ok: false, reason: 'WEAK_PASSWORD' };
  const k = getRelayKeyByName(name);
  if (!k) return { ok: false, reason: 'NOT_FOUND' };
  if (k.access_password_enc) return { ok: false, reason: 'ALREADY_SET' };
  const enc = encryptApiKey(pwd);
  getDb().prepare(`
    UPDATE relay_keys
    SET access_password_enc = ?, access_password_set_at = datetime('now', '+8 hours')
    WHERE id = ?
  `).run(enc, k.id);
  return { ok: true, relayKeyId: k.id };
}

export function verifyAccessPassword(name: string, pwd: string): boolean {
  const k = getRelayKeyByName(name);
  if (!k || !k.access_password_enc) return false;
  try {
    return decryptApiKey(k.access_password_enc) === pwd;
  } catch {
    return false;
  }
}

export function resetAccessPasswordToDefault(keyId: string): boolean {
  const enc = encryptApiKey(DEFAULT_ACCESS_PASSWORD);
  const r = getDb().prepare(`
    UPDATE relay_keys
    SET access_password_enc = ?, access_password_set_at = datetime('now', '+8 hours')
    WHERE id = ?
  `).run(enc, keyId);
  deleteSessionsForKey(keyId);
  return r.changes > 0;
}

export function createSession(relayKeyId: string, ip: string, userAgent: string) {
  const id = nanoid(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000)
    .toISOString()
    .replace('T', ' ')
    .replace(/\..+$/, '');
  getDb().prepare(`
    INSERT INTO key_access_sessions (id, relay_key_id, ip, user_agent, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, relayKeyId, ip.slice(0, 64), (userAgent || '').slice(0, 256), expiresAt);
  return { id, expiresAt };
}

export function getSessionById(id: string) {
  return getDb()
    .prepare('SELECT relay_key_id, expires_at FROM key_access_sessions WHERE id = ?')
    .get(id) as { relay_key_id: string; expires_at: string } | undefined;
}

export function deleteSession(id: string) {
  getDb().prepare('DELETE FROM key_access_sessions WHERE id = ?').run(id);
}

export function deleteSessionsForKey(keyId: string) {
  getDb().prepare('DELETE FROM key_access_sessions WHERE relay_key_id = ?').run(keyId);
}

// ---------- 内存限流 ----------
const rateBuckets = new Map<string, { count: number; windowStart: number }>();

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const b = rateBuckets.get(ip);
  if (!b || now - b.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (b.count >= RATE_LIMIT_MAX) return false;
  b.count++;
  return true;
}

// 周期清理,避免内存泄漏
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS * 5;
  for (const [k, v] of rateBuckets) {
    if (v.windowStart < cutoff) rateBuckets.delete(k);
  }
}, RATE_LIMIT_WINDOW_MS).unref?.();
```

**Step 2: 类型检查**

```bash
npx tsc --noEmit
```

期望:无错误(只显示已有错误,不是新文件的错误)。

**Step 3: Commit**

```bash
git add src/lib/key-access.ts
git commit -m "feat(key-access): password set/verify/reset + session + rate limit"
```

---

## Task 3: API 路由 — setup / login / logout

**Files:**
- Create: `src/app/api/u/[name]/setup/route.ts`
- Create: `src/app/api/u/[name]/login/route.ts`
- Create: `src/app/api/u/[name]/logout/route.ts`

**Step 1: setup 路由**

`src/app/api/u/[name]/setup/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import {
  checkRateLimit,
  createSession,
  setAccessPassword,
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
  const { password, confirm } = body || {};
  if (typeof password !== 'string' || password !== confirm) {
    return NextResponse.json({ error: '两次密码输入不一致' }, { status: 400 });
  }
  const r = setAccessPassword(name, password);
  if (!r.ok) {
    const map: Record<string, { status: number; msg: string }> = {
      NOT_FOUND: { status: 404, msg: 'Key 不存在' },
      ALREADY_SET: { status: 409, msg: '该 Key 已设置访问密码,请使用登录页' },
      WEAK_PASSWORD: {
        status: 400,
        msg: '密码必须 ≥12 位,含大小写字母与特殊字符',
      },
    };
    const { status, msg } = map[r.reason];
    return NextResponse.json({ error: msg }, { status });
  }
  const ua = request.headers.get('user-agent') || '';
  const session = createSession(r.relayKeyId, ip, ua);
  const res = NextResponse.json({ success: true });
  res.cookies.set('mps', session.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: `/u/${name}`,
    maxAge: 30 * 24 * 3600,
  });
  return res;
}
```

**Step 2: login 路由**

`src/app/api/u/[name]/login/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import {
  checkRateLimit,
  createSession,
  getRelayKeyPasswordStatus,
  verifyAccessPassword,
} from '@/lib/key-access';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  if (!checkRateLimit(`${ip}:login`)) {
    return NextResponse.json({ error: '请求过于频繁,请稍后再试' }, { status: 429 });
  }
  const { name } = await params;
  const status = getRelayKeyPasswordStatus(name);
  if (!status) return NextResponse.json({ error: 'Key 不存在' }, { status: 404 });
  if (!status.hasPassword) {
    return NextResponse.json({ error: '尚未设置访问密码' }, { status: 409 });
  }
  const body = await request.json().catch(() => ({}));
  if (typeof body?.password !== 'string') {
    return NextResponse.json({ error: '缺少密码' }, { status: 400 });
  }
  if (!verifyAccessPassword(name, body.password)) {
    return NextResponse.json({ error: '密码错误' }, { status: 401 });
  }
  // 重新查 key id 用于建 session
  const keyId = (await import('@/lib/key-access')).getRelayKeyByName(name)!.id;
  const ua = request.headers.get('user-agent') || '';
  const session = createSession(keyId, ip, ua);
  const res = NextResponse.json({ success: true });
  res.cookies.set('mps', session.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: `/u/${name}`,
    maxAge: 30 * 24 * 3600,
  });
  return res;
}
```

**Step 3: logout 路由**

`src/app/api/u/[name]/logout/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { deleteSession } from '@/lib/key-access';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const cookie = request.cookies.get('mps');
  if (cookie?.value) deleteSession(cookie.value);
  const res = NextResponse.json({ success: true });
  res.cookies.set('mps', '', { path: `/u/${name}`, maxAge: 0 });
  return res;
}
```

**Step 4: 类型检查**

```bash
npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add src/app/api/u/
git commit -m "feat(api): /u/[name]/setup|login|logout routes"
```

---

## Task 4: 管理员 PATCH 扩展 — reset_access_password

**Files:**
- Modify: `src/lib/keys.ts` — 新增 `resetAccessPasswordToDefault` 包装(其实直接调 key-access 的即可,但为统一 keys.ts 出口,加一个)
- Modify: `src/app/admin/keys/route.ts` — PATCH 处理器识别 `body.action === 'reset_access_password'`

**Step 1: 修改 `src/lib/keys.ts`**

在文件末尾追加:

```ts
export function resetAccessPasswordToDefaultById(id: string): boolean {
  return (require('@/lib/key-access') as typeof import('@/lib/key-access'))
    .resetAccessPasswordToDefault(id);
}
```

**Step 2: 修改 `src/app/admin/keys/route.ts`**

把整个文件替换为:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-middleware';
import {
  listRelayKeys,
  createRelayKey,
  updateRelayKey,
  deleteRelayKey,
  refreshRelayKey,
  getRelayKeyById,
  resetAccessPasswordToDefaultById,
} from '@/lib/keys';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;
  const { searchParams } = new URL(request.url);

  if (searchParams.get('scope') === 'full') {
    const keys = listRelayKeys();
    const db = getDb();
    const channels = db.prepare('SELECT id, name FROM channels ORDER BY name').all();
    const aliases = db.prepare(`
      SELECT DISTINCT cm.model_id, ma.alias_name FROM model_aliases ma
      JOIN channel_models cm ON cm.id = ma.channel_model_id
      WHERE ma.is_active = 1
    `).all() as { model_id: string; alias_name: string }[];
    const aliasMap: Record<string, string> = {};
    for (const a of aliases) {
      if (!aliasMap[a.model_id]) aliasMap[a.model_id] = a.alias_name;
    }
    return NextResponse.json({ keys, channels, aliasMap });
  }

  const keys = listRelayKeys();
  return NextResponse.json({ keys });
}

export async function POST(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;
  try {
    const body = await request.json();
    const key = createRelayKey(
      body.name || 'New Key',
      body.spend_limit ?? 0,
      body.expires_at || null,
      body.allowed_models || '',
      body.allowed_channels || '',
      body.is_pinned ? 1 : 0
    );
    return NextResponse.json({ key }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;
  try {
    const body = await request.json();

    // 分支: 重置访问密码
    if (body.action === 'reset_access_password') {
      if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      const ok = resetAccessPasswordToDefaultById(body.id);
      return NextResponse.json({ success: ok });
    }

    const updated = updateRelayKey(body.id, {
      name: body.name,
      spend_limit: body.spend_limit,
      is_active: body.is_active,
      is_pinned: body.is_pinned,
      expires_at: body.expires_at,
      allowed_models: body.allowed_models,
      allowed_channels: body.allowed_channels,
    });

    let newKeyValue: string | null = null;
    if (body.refresh_key) {
      newKeyValue = refreshRelayKey(body.id);
    }

    const key = body.refresh_key ? getRelayKeyById(body.id) : undefined;
    return NextResponse.json({ success: updated, new_key: newKeyValue, key });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const deleted = deleteRelayKey(id);
    return NextResponse.json({ success: deleted });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
```

**Step 3: 类型检查**

```bash
npx tsc --noEmit
```

**Step 4: 手动验证(reset 流程)**

```bash
npm run dev
# 在另一个 shell:
ADMIN_TOKEN="<your token>"
KEY_ID="<some relay key id>"
curl -X PATCH http://localhost:3000/admin/keys \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"action\":\"reset_access_password\",\"id\":\"$KEY_ID\"}"
```

期望:`{"success":true}`。然后查数据库:

```bash
node -e "const db = require('better-sqlite3')('data/relay.db'); console.log(db.prepare('SELECT id, name, access_password_enc FROM relay_keys WHERE id = ?').get('$KEY_ID'));"
```

期望:`access_password_enc` 是新密文(不等于 NULL)。

**Step 5: Commit**

```bash
git add src/lib/keys.ts src/app/admin/keys/route.ts
git commit -m "feat(admin): PATCH reset_access_password action"
```

---

## Task 5: Dashboard Key 页加「重置访问密码」按钮

**Files:**
- Modify: `src/app/dashboard/keys/page.tsx` — 添加 `resetAccessPwdConfirm` 状态、handler、按钮、ConfirmDialog

**Step 1: 添加状态(在第 54 行附近)**

找到 `refreshConfirm` 状态后追加:

```tsx
const [resetAccessPwdConfirm, setResetAccessPwdConfirm] = useState<{ id: string; name: string } | null>(null);
const [resetAccessPwdResult, setResetAccessPwdResult] = useState<{ name: string; ok: boolean } | null>(null);
```

**Step 2: 添加 handler(在 `handleRefreshKey` 之后)**

```tsx
const handleResetAccessPwd = async (id: string) => {
  setResetAccessPwdConfirm(null);
  const key = keys.find(k => k.id === id);
  const name = key?.name || 'Key';
  try {
    const res = await apiFetch('/admin/keys', {
      method: 'PATCH',
      body: JSON.stringify({ action: 'reset_access_password', id }),
    });
    const data = await res.json();
    setResetAccessPwdResult({ name, ok: !!data.success });
    setTimeout(() => setResetAccessPwdResult(null), 5000);
  } catch (err) {
    console.error('Reset access password failed:', err);
    setResetAccessPwdResult({ name, ok: false });
    setTimeout(() => setResetAccessPwdResult(null), 5000);
  }
};
```

**Step 3: 在 Key 操作按钮区加按钮(找到 refresh 按钮,大约第 580 行,InlineIcon refresh-cw 那里)**

复制现有 refresh 按钮的结构,在它后面追加:

```tsx
<button onClick={() => setResetAccessPwdConfirm({ id: k.id, name: k.name })}
  className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
  title="重置访问密码">
  <InlineIcon name="key" className="w-3.5 h-3.5" />
</button>
```

**Step 4: 在底部 `refreshConfirm` 的 ConfirmDialog 之后追加**

```tsx
<ConfirmDialog
  open={!!resetAccessPwdConfirm}
  onCancel={() => setResetAccessPwdConfirm(null)}
  onConfirm={() => handleResetAccessPwd(resetAccessPwdConfirm!.id)}
  title="重置访问密码"
  message={`将 Key「${resetAccessPwdConfirm?.name}」的访问密码重置为默认值 @123456789123Pk,并立即撤销该 Key 所有已登录会话,确定继续?`}
/>

{resetAccessPwdResult && (
  <div className={`${resetAccessPwdResult.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'} border rounded-xl px-4 py-3 flex items-start gap-3 animate-in fade-in`}>
    <InlineIcon name={resetAccessPwdResult.ok ? 'check' : 'x'} className="w-4 h-4 mt-0.5 shrink-0" />
    <p className="text-xs">
      Key「{resetAccessPwdResult.name}」访问密码{resetAccessPwdResult.ok ? '已重置为默认值 @123456789123Pk' : '重置失败'}
    </p>
  </div>
)}
```

**Step 5: 类型检查**

```bash
npx tsc --noEmit
```

**Step 6: Commit**

```bash
git add src/app/dashboard/keys/page.tsx
git commit -m "feat(dashboard): reset access password button on key row"
```

---

## Task 6: `key-stats.ts` — 按 key 聚合的查询

**Files:**
- Create: `src/lib/key-stats.ts`

**Interfaces:**
- `getKeySummary(relayKeyId: string): { totalCalls, promptTokens, completionTokens, totalCost, firstCallAt, lastCallAt }`
- `getKeyDailyTrend(relayKeyId: string, days: number): { date: string; calls: number; tokens: number; cost: number }[]`
- `getKeyRecentLogs(relayKeyId: string, limit: number): RecentLog[]`

**Step 1: 创建文件**

```ts
// ============================================================
// 按 relay_key_id 聚合的使用统计(供公开页面使用)
// ============================================================
import { getDb } from './db';

export interface KeySummary {
  totalCalls: number;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  firstCallAt: string | null;
  lastCallAt: string | null;
}

export function getKeySummary(relayKeyId: string): KeySummary {
  const row = getDb().prepare(`
    SELECT
      COUNT(*) AS totalCalls,
      COALESCE(SUM(prompt_tokens), 0) AS promptTokens,
      COALESCE(SUM(completion_tokens), 0) AS completionTokens,
      COALESCE(SUM(COALESCE(cost, 0)), 0) AS totalCost,
      MIN(created_at) AS firstCallAt,
      MAX(created_at) AS lastCallAt
    FROM call_logs
    WHERE relay_key_id = ?
  `).get(relayKeyId) as KeySummary;
  return row;
}

export interface DailyBucket {
  date: string;   // YYYY-MM-DD
  calls: number;
  tokens: number;
  cost: number;
}

export function getKeyDailyTrend(relayKeyId: string, days: number): DailyBucket[] {
  // 北京时区(+8)按日聚合
  const rows = getDb().prepare(`
    SELECT
      date(created_at, '+8 hours') AS date,
      COUNT(*) AS calls,
      COALESCE(SUM(total_tokens), 0) AS tokens,
      COALESCE(SUM(COALESCE(cost, 0)), 0) AS cost
    FROM call_logs
    WHERE relay_key_id = ?
      AND created_at >= datetime('now', '+8 hours', ?)
    GROUP BY date
    ORDER BY date ASC
  `).all(relayKeyId, `-${days} days`) as DailyBucket[];

  // 补齐缺失日期(0 值)
  const map = new Map(rows.map(r => [r.date, r]));
  const out: DailyBucket[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const ds = d.toISOString().slice(0, 10);
    out.push(map.get(ds) || { date: ds, calls: 0, tokens: 0, cost: 0 });
  }
  return out;
}

export interface RecentLog {
  id: string;
  created_at: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
  status: string;
}

export function getKeyRecentLogs(relayKeyId: string, limit = 50): RecentLog[] {
  return getDb().prepare(`
    SELECT id, created_at, model, prompt_tokens, completion_tokens,
           total_tokens, COALESCE(cost, 0) AS cost, status
    FROM call_logs
    WHERE relay_key_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(relayKeyId, limit) as RecentLog[];
}
```

**Step 2: 类型检查**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/lib/key-stats.ts
git commit -m "feat(key-stats): per-key summary, daily trend, recent logs"
```

---

## Task 7: `/u/[name]` 主页面 — server component 三态分发

**Files:**
- Create: `src/app/u/[name]/page.tsx`

**Step 1: 创建文件**

```tsx
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import {
  getRelayKeyPasswordStatus,
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

  const status = getRelayKeyPasswordStatus(name);
  if (!status) notFound();

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

  if (!status.hasPassword) return <SetupForm keyName={name} />;
  return <LoginForm keyName={name} />;
}
```

**Step 2: Commit(只放占位 client 组件的临时 stub,避免 tsc 报错 — 后续任务会替换)**

```bash
mkdir -p src/app/u/_stubs
cat > src/app/u/_stubs/setup-form.tsx <<'EOF'
export default function SetupForm() { return <div>SetupForm</div>; }
EOF
cat > src/app/u/_stubs/login-form.tsx <<'EOF'
export default function LoginForm() { return <div>LoginForm</div>; }
EOF
cat > src/app/u/_stubs/stats-view.tsx <<'EOF'
export default function StatsView() { return <div>StatsView</div>; }
EOF
```

> 临时 stub 仅用于 Task 7 通过 tsc。Task 8/9/10 会用真组件替换这 3 个 stub,**完成后删除 `_stubs` 目录**。

**Step 3: 类型检查**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/app/u/
git commit -m "feat(u-page): server component tri-state dispatcher"
```

---

## Task 8: SetupForm 客户端组件

**Files:**
- Create: `src/app/u/[name]/setup-form.tsx`(替换 `_stubs/setup-form.tsx`)

**Step 1: 创建真组件**

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
  digit: /\d/,
};

function checks(pwd: string) {
  return {
    length: RE.length.test(pwd),
    lower: RE.lower.test(pwd),
    upper: RE.upper.test(pwd),
    special: RE.special.test(pwd),
    digit: RE.digit.test(pwd),
  };
}

export default function SetupForm({ keyName }: { keyName: string }) {
  const router = useRouter();
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const c = checks(pwd);
  const allOk = c.length && c.lower && c.upper && c.special;

  const submit = async () => {
    if (!allOk) return setErr('密码必须 ≥12 位,含大小写字母与特殊字符');
    if (pwd !== confirm) return setErr('两次输入不一致');
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/u/${encodeURIComponent(keyName)}/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd, confirm }),
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
          <h1 className="text-lg font-semibold text-gray-900">设置访问密码</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Key <span className="font-mono text-gray-700">{keyName}</span> 首次访问,请设置访问密码(仅用于查看使用情况,与 API Key 无关)
        </p>
        <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
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
            <li key={k} className={c[k as keyof typeof c] ? 'text-emerald-600' : 'text-gray-400'}>
              <InlineIcon name={c[k as keyof typeof c] ? 'check' : 'x'} className="w-3 h-3 inline mr-1" />
              {label}
            </li>
          ))}
        </ul>
        <label className="block text-sm font-medium text-gray-700 mt-4 mb-1">确认密码</label>
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
          disabled={!allOk || busy || pwd !== confirm}
          className="mt-5 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          <InlineIcon name="lock" className="w-4 h-4" />
          {busy ? '设置中…' : '设置并查看'}
        </button>
      </div>
    </div>
  );
}
```

**Step 2: 删除 stub**

```bash
rm src/app/u/_stubs/setup-form.tsx
```

**Step 3: 类型检查**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/app/u/
git commit -m "feat(u-page): SetupForm with password strength indicator"
```

---

## Task 9: LoginForm + LogoutButton 客户端组件

**Files:**
- Create: `src/app/u/[name]/login-form.tsx`(替换 stub)
- Create: `src/app/u/[name]/logout-button.tsx`

**Step 1: LoginForm**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineIcon } from '@/lib/icon';

export default function LoginForm({ keyName }: { keyName: string }) {
  const router = useRouter();
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/u/${encodeURIComponent(keyName)}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
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
          <InlineIcon name="lock" className="w-5 h-5 text-indigo-500" />
          <h1 className="text-lg font-semibold text-gray-900">登录查看使用情况</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Key <span className="font-mono text-gray-700">{keyName}</span>
        </p>
        <label className="block text-sm font-medium text-gray-700 mb-1">访问密码</label>
        <input
          type="password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          placeholder="若忘记请联系管理员重置"
        />
        {err && (
          <div className="mt-3 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {err}
          </div>
        )}
        <button
          onClick={submit}
          disabled={busy || !pwd}
          className="mt-5 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:bg-gray-300 transition-colors"
        >
          {busy ? '登录中…' : '登录'}
        </button>
        <p className="mt-4 text-xs text-gray-400">
          如管理员重置过密码,默认值: <code className="font-mono">@123456789123Pk</code>
        </p>
      </div>
    </div>
  );
}
```

**Step 2: LogoutButton**

```tsx
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
```

**Step 3: 删除 stub**

```bash
rm src/app/u/_stubs/login-form.tsx
```

**Step 4: 类型检查**

```bash
npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add src/app/u/
git commit -m "feat(u-page): LoginForm + LogoutButton"
```

---

## Task 10: StatsView 客户端组件

**Files:**
- Create: `src/app/u/[name]/stats-view.tsx`(替换 stub)
- Create: `src/app/u/[name]/trend-chart.tsx`(趋势图 Recharts wrapper)
- 完成后:删除 `src/app/u/_stubs/` 目录

**Step 1: TrendChart**

```tsx
'use client';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { DailyBucket } from '@/lib/key-stats';

export default function TrendChart({ data }: { data: DailyBucket[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line yAxisId="left" type="monotone" dataKey="calls" name="调用次数" stroke="#6366f1" dot={false} />
          <Line yAxisId="right" type="monotone" dataKey="tokens" name="Token" stroke="#10b981" dot={false} />
          <Line yAxisId="right" type="monotone" dataKey="cost" name="费用 (¥)" stroke="#f59e0b" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**Step 2: StatsView**

```tsx
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeySummary, DailyBucket, RecentLog } from '@/lib/key-stats';
import { InlineIcon } from '@/lib/icon';
import LogoutButton from './logout-button';
import TrendChart from './trend-chart';

function fmt(n: number) {
  if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
  return n.toLocaleString('zh-CN');
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

export default function StatsView({
  keyName, isActive, summary, trend, days, recent,
}: {
  keyName: string;
  isActive: boolean;
  summary: KeySummary;
  trend: DailyBucket[];
  days: number;
  recent: RecentLog[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const setDays = (d: number) => {
    const p = new URLSearchParams(params);
    p.set('days', String(d));
    router.push(`/u/${encodeURIComponent(keyName)}?${p.toString()}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">Key 使用统计</div>
            <div className="text-base font-semibold text-gray-900 font-mono">{keyName}</div>
          </div>
          <LogoutButton keyName={keyName} />
        </div>
        {!isActive && (
          <div className="bg-amber-50 border-t border-amber-200 text-amber-800 text-xs px-4 py-2 text-center">
            <InlineIcon name="shield-check" className="w-3 h-3 inline mr-1" />
            该 Key 已被管理员禁用,以下为历史快照
          </div>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label="总调用次数" value={fmt(summary.totalCalls)} />
          <Tile label="Prompt Tokens" value={fmt(summary.promptTokens)} />
          <Tile label="Completion Tokens" value={fmt(summary.completionTokens)} />
          <Tile label="总费用 (¥)" value={summary.totalCost.toFixed(2)}
            sub={summary.lastCallAt ? `最近: ${summary.lastCallAt}` : '尚无调用'} />
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">调用趋势</h2>
            <div className="flex gap-1">
              {[7, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-2.5 py-1 rounded text-xs ${days === d ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {d} 天
                </button>
              ))}
            </div>
          </div>
          <TrendChart data={trend} />
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">近期调用明细(最近 50 条)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">时间</th>
                  <th className="px-4 py-2 text-left">模型</th>
                  <th className="px-4 py-2 text-right">Prompt</th>
                  <th className="px-4 py-2 text-right">Completion</th>
                  <th className="px-4 py-2 text-right">费用 (¥)</th>
                  <th className="px-4 py-2 text-left">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recent.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">暂无调用记录</td></tr>
                )}
                {recent.map((r) => (
                  <tr key={r.id} className="text-gray-700">
                    <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{r.created_at}</td>
                    <td className="px-4 py-2 font-mono text-xs">{r.model}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(r.prompt_tokens)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(r.completion_tokens)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{(r.cost || 0).toFixed(4)}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs ${
                        r.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}>
                        {r.status === 'success' ? '成功' : '失败'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
```

**Step 3: 删除所有 stub**

```bash
rm -rf src/app/u/_stubs
```

**Step 4: 类型检查**

```bash
npx tsc --noEmit
```

**Step 5: 启动 dev 验证**

```bash
npm run dev
# 浏览器访问 http://localhost:3000/admin/login 登录
# 创建/找一个名为 "test-key" 的 Key
# 浏览器访问 http://localhost:3000/u/test-key
```

期望:看到 SetupForm。设一个合规密码 → 跳转 StatsView(空数据)。手动通过 `/v1/chat/completions` 触发一次调用 → 刷新 StatsView 出现 1 条明细 + 总费用更新。

**Step 6: Commit**

```bash
git add src/app/u/
git commit -m "feat(u-page): StatsView with summary tiles, trend chart, recent logs table"
```

---

## Task 11: middleware 验证 + 端到端手测清单

**Files:**
- Verify (no edits expected): `src/middleware.ts`

**Step 1: 确认 middleware 不拦截 `/u/...`**

读 `src/middleware.ts`,确认 matcher 是:

```ts
matcher: ['/api/:path*', '/v1/v1/:path*', '/chat/completions', '/models']
```

期望:`/u/:path*` **不在** matcher 中 → middleware 不会重写 `/u/<name>` → 我们的页面正常工作。如果发现 `/u` 出现在 matcher,需移除。

**Step 2: 端到端手测清单**

启动 dev server,跑下列步骤,**每步都通过才能进入下一项**:

```bash
npm run dev
```

| # | 步骤 | 期望 |
|---|------|------|
| 1 | 创建测试 Key `test-key` | 管理后台 Key 列表出现 |
| 2 | 浏览器访问 `/u/test-key` | SetupForm |
| 3 | 输入 `abc` → 提交 | 红色错误"密码必须 ≥12 位…" |
| 4 | 输入 `Abcdef1234567`(无特殊字符) | 提交按钮仍 disabled |
| 5 | 输入 `Abcdef!@#$%` 两次一致 → 提交 | 跳到 StatsView(空数据) |
| 6 | 通过代理触发一次 `/v1/chat/completions` 调用,使用 test-key 的 API Key | StatsView 出现 1 条明细;总费用更新 |
| 7 | 浏览器 dev tools 看到 `mps` cookie( HttpOnly,Path=/u/test-key) | 是 |
| 8 | 点"退出" → 回到 LoginForm | 是 |
| 9 | 输入错误密码 11 次 | 第 11 次返回 429(查看 Network) |
| 10 | 用正确密码重新登录 | StatsView |
| 11 | 管理员后台 → test-key 行 → 重置访问密码 | 成功提示,旧 cookie 立即失效(下次访问回到 LoginForm,提示默认值) |
| 12 | 管理员重命名 test-key 为 test-key-renamed | `/u/test-key` 返回 404 |
| 13 | 访问 `/u/不存在的key` | 404 |

任何一步失败 → 在该步停下来修复,**不要** 提交。

**Step 3: 清理 + 最终 commit**

如果没有源码修改,跳过此步。如果手测过程修了代码:

```bash
git add -A
git commit -m "fix(u-page): end-to-end test fixes"
```

---

## Task 12: 文档 + 提交

**Files:**
- Modify: `README.md` — 在 API 文档块加 `/u/<key-name>` 说明
- Modify: `CLAUDE.md` — 在支持的端点表格里加 `/u/<key-name>`(可选,因为 CLAUDE.md 已包含架构说明,这里**不强制**改)

**Step 1: README 追加**

在 `### 接入说明` 段落后面加:

```markdown
### 使用者查看页面

Key 使用者可访问自己的使用统计页:

```
GET https://your.domain.com/u/<key-name>
```

- 首次访问: 设置访问密码(≥12 位,含大小写字母与特殊字符)
- 之后: 用密码登录,查看总调用数 / Token / 费用 / 趋势图 / 近期明细(50 条)
- 忘记密码: 联系管理员在管理后台 → Key 管理 → 重置访问密码
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document /u/<key-name> public stats page"
```

---

## 验收清单(交付前对照)

- [ ] 首次访问路径:设密 → 统计
- [ ] 退出后访问路径:登录 → 统计
- [ ] 密码规则被严格执行(12 位 + 大小写 + 特殊字符)
- [ ] 限流生效(同 IP 11 次/分钟 → 429)
- [ ] 管理员后台可重置,旧会话立即失效
- [ ] 重命名后旧 URL 404
- [ ] 统计页样式与现有 dashboard 视觉一致
- [ ] 不暴露 Key 明文、IP、渠道名
- [ ] `npx tsc --noEmit` 无错误
- [ ] `npm run build` 成功

---

## Self-Review

1. **Spec 覆盖**:
   - 三态分发 → Task 7 + 8 + 9 + 10
   - 设密页 + 强度提示 → Task 8
   - 登录页 + 默认密码提示 → Task 9
   - 统计页 + 汇总 + 趋势 + 明细 → Task 10
   - 密码规则 → Task 2 (`PWD_RE`)
   - 限流 → Task 2 (`checkRateLimit`)
   - 加密复用 → Task 2 (`encryptApiKey`)
   - 迁移(`access_password_enc` 列 + `key_access_sessions`)→ Task 1
   - 会话有效期 30 天 → Task 2 (`SESSION_DAYS`)
   - 重命名后 404 → Task 7 (`getRelayKeyById(sess.relay_key_id).name === name` 守卫,重命名后旧 cookie 还能进但 key.name 不匹配 → 回 LoginView / SetupView,实际场景中旧 URL 查不到 key → notFound)
   - 管理员重置为默认密码 → Task 4
   - Dashboard 重置按钮 → Task 5
   - 中间件不拦截 → Task 11 Step 1
   - 端到端测试 → Task 11
   - 文档 → Task 12

2. **占位符扫描**: 没有 TBD/TODO。代码块完整可执行。

3. **类型一致性**:
   - `RelayKey` 字段名: `access_password_enc`、`access_password_set_at` — 跨 Task 1/2/4/7 一致
   - session 表字段: `id`、`relay_key_id`、`ip`、`user_agent`、`created_at`、`expires_at` — 跨 Task 1/2/3 一致
   - Cookie 名 `mps` — 跨 Task 3/7 一致
   - 路径 `/u/[name]` — 跨所有路由一致
   - 密码正则 `PWD_RE` — Task 2 定义,Task 8 客户端版本做近似校验(展示用,不替代服务端校验)
   - 默认密码常量 `DEFAULT_ACCESS_PASSWORD` — Task 2 定义,Task 4(注释里)+ Task 5 + Task 9 UI 引用一致