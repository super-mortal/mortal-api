# 管理员重置后强制改密设计

**日期**: 2026-07-24
**状态**: Draft(待评审)
**目标**: 管理员重置 Key 访问密码后,使用者首次访问 `/u/<name>` 时,登录页直接允许"输入当前密码 + 新密码 + 确认新密码"三行二合一流,提交后立即改密成功并进入统计页。

## 背景与目标

现有 `/api/u/[name]/setup` 只支持**首次设密**(即 `access_password_enc IS NULL`)。当管理员在管理后台点击"重置访问密码"时,使用者的旧密码失效,但没有自助改密路径 —— 只能永远使用默认值 `@123456789123Pk`,直到联系管理员再次重置。

本次新增**"管理员重置后强制改密"**流:
- 触发条件:`relay_keys.must_reset_password === 1`
- 单页表单,三行:旧密码(管理员重置后的默认值)/ 新密码 / 确认新密码
- 提交后服务器原子地:验证旧密码 + 写入新密码 + 清零 `must_reset_password` + 发 session cookie
- 直接进入统计页

### 安全关键

**必须严格判断 `must_reset_password = 1`**,否则任何人可以绕过重置去爆破别人密码。原子性由 SQL 层守卫保证(`WHERE (access_password_enc IS NULL OR must_reset_password = 1)`)。

## 术语

| 术语 | 含义 |
|---|---|
| **首次设密** | Key 从未被设置访问密码(`access_password_enc IS NULL`) |
| **管理员重置** | 管理员在 dashboard 点"重置访问密码",写入默认值 + `must_reset_password = 1` + 清空所有 sessions |
| **改密流** | 使用者在 ChangePasswordView 提交旧密码 + 新密码,服务器验证后原子地替换密码 + `must_reset_password = 0` |
| **正常使用中** | `access_password_enc 非 NULL && must_reset_password = 0` —— 不允许通过 setup 端点改密 |

## 用户故事

1. 作为使用者,我之前设过密码,某天发现登不进。联系管理员,管理员告诉我"已重置"。我打开 `/u/<name>`,看到 ChangePasswordView。我输入默认值 `@123456789123Pk` + 新密码 + 确认新密码,提交,直接进统计页。
2. 改密后我退出,再次访问,看到的是普通 LoginView(`must_reset_password` 已被清零),不再是 ChangePasswordView。
3. 我**永远不会**在 ChangePasswordView 上看到"密码已被重置"的文字提示(用户已选不显示);我也不会被允许在正常使用中通过该入口改密(返回 409)。

## 功能设计

### 1. URL 与路由

| 路径 | 用途 | 变化 |
|---|---|---|
| `/u/[name]/page.tsx` | 主页面 server component | 改为四态分发 |
| `/u/[name]/change-password-form.tsx` | 客户端组件 | 新增 |
| `/api/u/[name]/setup` | 首次设密 / 改密 | 扩展 body 字段 |
| `/api/u/[name]/login`、`logout` | 不变 | — |

### 2. 页面视图(四态)

```
GET /u/<name>
  ├─ cookie mps 有效且 key.name 匹配 → StatsView (现有)
  └─ cookie 无/失效
        ├─ Key 不存在 → 404
        ├─ hasPassword = false (access_password_enc IS NULL)
        │       → SetupView(现有)
        └─ hasPassword = true
                ├─ mustReset = true (must_reset_password = 1)
                │       → ChangePasswordView(新增)
                └─ mustReset = false
                        → LoginView(现有)
```

### 3. SetupForm / LoginForm / LogoutButton / StatsView

均不变。StatsView 顶部禁用横幅(Key 已禁用)对 ChangePasswordView / LoginView 同样适用:本次将"已禁用"判断提取到 `getKeyAccessState` 返回中,页面层根据 `isActive` 决定是否显示横幅(可选;为最小改动,本次**仅**在 ChangePasswordView 顶部也展示该横幅)。

### 4. ChangePasswordForm(新组件)

#### 4.1 UI

- 标题:"设置新密码"
- 副标题:Key 名(灰小字)
- 三行输入:
  - 当前密码(password 框,placeholder `@123456789123Pk`)
  - 新密码(password 框,带强度指示器 — 复用 SetupForm 的 `RE` + `checks()` 逻辑,显示 length / lower / upper / special 四项)
  - 确认新密码(password 框)
- 错误提示块(红色 rose-50)
- 提交按钮:disabled 条件 = `!allOk || busy || pwd !== confirm || !currentPassword`
- **不**显示"密码已被管理员重置"提示(用户已选)

#### 4.2 提交

```ts
fetch(`/api/u/${encodeURIComponent(keyName)}/setup`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    currentPassword,    // 必填
    password,           // 新密码
    confirm,            // 确认
  }),
});
```

- 200 → `router.refresh()` → 服务器重新评估页面状态,渲染 StatsView
- 4xx → 显示 `data.error` 红框

### 5. `/api/u/[name]/setup` 扩展

#### 5.1 Body

```jsonc
{
  "password": "Abc...12!@",       // 新密码(必填)
  "confirm": "Abc...12!@",        // 确认(必填)
  "currentPassword": "..."        // 可选:若提供,触发"改密"路径;否则"首次设密"路径
}
```

#### 5.2 服务端流程

```
1. IP 限流(checkRateLimit `${ip}:setup`)→ 429

2. 校验密码一致 + 强度
   - pwd !== confirm            → 400 "两次密码输入不一致"
   - !isPasswordStrong(pwd)     → 400 "密码必须 ≥12 位,含大小写字母与特殊字符"

3. 查 key (must_reset_password, access_password_enc)
   - 不存在                      → 404 "Key 不存在"

4. 分支:
   A. hasPassword = false (首次设密)
      - 必须 currentPassword 缺失/未提供,否则 400 "首次设密不需要 currentPassword"
      - 写新密文 + must_reset_password = 0
   B. hasPassword = true
      - 必须 currentPassword 提供,否则 400 "请输入当前密码"
      - 解密对比 currentPassword
        - 不匹配                  → 401 "当前密码错误,请输入管理员重置后的默认值"
      - newPassword === currentPassword → 400 "新密码不能与当前密码相同"
      - SQL 原子写:
          UPDATE relay_keys
          SET access_password_enc = ?,
              access_password_set_at = datetime('now', '+8 hours'),
              must_reset_password = 0
          WHERE id = ?
            AND must_reset_password = 1
        - changes === 0            → 409 "密码已是您自己设置,无需改密。请联系管理员重置"

5. createSession + Set-Cookie mps
6. 返回 200 { success: true }
```

#### 5.3 错误码(新增 / 修改)

| HTTP | reason | msg |
|---|---|---|
| 400 | (新增) | 新密码不能与当前密码相同 |
| 400 | (新增) | 请输入当前密码 |
| 400 | (新增) | 首次设密不需要 currentPassword |
| 401 | (新增) | 当前密码错误,请输入管理员重置后的默认值 |
| 409 | (新增) `PASSWORD_ALREADY_SET_AND_NOT_RESET` | 密码已是您自己设置,无需改密。如需修改请联系管理员 |

其他错误(404 / 429 / 400 弱密码 / 400 不一致)保持现有。

## 数据模型

### v7 迁移:`relay_keys` 加列

```sql
ALTER TABLE relay_keys ADD COLUMN must_reset_password INTEGER NOT NULL DEFAULT 0;
```

加在 `src/lib/db.ts` 的 `initSchema()` 末尾,沿用 v6 风格:

```ts
const mrMigrated = db.prepare("SELECT name FROM _migrations WHERE name = 'v7_must_reset_password'").get();
if (!mrMigrated) {
  const cols = db.prepare("PRAGMA table_info('relay_keys')").all() as { name: string }[];
  if (!cols.find(c => c.name === 'must_reset_password')) {
    db.exec("ALTER TABLE relay_keys ADD COLUMN must_reset_password INTEGER NOT NULL DEFAULT 0");
  }
  db.prepare("INSERT INTO _migrations (name) VALUES ('v7_must_reset_password')").run();
}
```

### `RelayKey` 接口扩展

```ts
export interface RelayKey {
  // ...existing
  must_reset_password: number;  // NEW: 1 = 需改密, 0 = 正常
}
```

## 模块与文件

### 修改

```
src/lib/db.ts                  # 追加 v7_must_reset_password 迁移
src/lib/types.ts               # RelayKey 加 must_reset_password
src/lib/key-access.ts          # 扩展 getKeyAccessState / setAccessPassword / resetAccessPasswordToDefault
src/app/api/u/[name]/setup/route.ts   # 扩展 body + 分支
src/app/u/[name]/page.tsx      # 四态分发
src/app/u/[name]/change-password-form.tsx  # 新组件
```

### 新增(只 1 个)

```
src/app/u/[name]/change-password-form.tsx
```

### 不变

```
src/lib/key-stats.ts
src/app/api/u/[name]/login/route.ts
src/app/api/u/[name]/logout/route.ts
src/app/u/[name]/setup-form.tsx (SetupForm,不变)
src/app/u/[name]/login-form.tsx (LoginForm,不变)
src/app/u/[name]/logout-button.tsx
src/app/u/[name]/stats-view.tsx
src/app/u/[name]/trend-chart.tsx
src/middleware.ts
src/app/admin/keys/route.ts (admin reset 行为自动通过 resetAccessPasswordToDefault 升级,无需改)
src/app/dashboard/keys/page.tsx
```

## 错误处理

| 场景 | HTTP | error 字段 |
|---|---|---|
| `/u/<不存在>` | 404 | — (Next.js notFound) |
| `/u/<已重命名>` | 404 | — |
| 限流 | 429 | "请求过于频繁,请稍后再试" |
| 密码不合规 | 400 | "密码必须 ≥12 位,含大小写字母与特殊字符" |
| 两次密码不一致 | 400 | "两次输入不一致" |
| 首次设密却提供 currentPassword | 400 | "首次设密不需要 currentPassword" |
| 改密缺 currentPassword | 400 | "请输入当前密码" |
| 改密 currentPassword 不匹配 | 401 | "当前密码错误,请输入管理员重置后的默认值" |
| 新旧密码一致 | 400 | "新密码不能与当前密码相同" |
| 改密但 `must_reset = 0` | 409 | "密码已是您自己设置,无需改密。如需修改请联系管理员" |
| Key 不存在 | 404 | "Key 不存在" |
| 服务端异常 | 500 | (不暴露细节) |

## 安全考量

- **原子性**: SQL UPDATE 在 `WHERE must_reset_password = 1` 条件下写;`changes === 0` 即拒绝。并发改密:只有一个成功。
- **不被绕过**: `must_reset = 0` 时,setup 端点即便收到 `currentPassword` 也拒绝;攻击者无法借此爆破。
- **改密即清 session**: `resetAccessPasswordToDefault` 已经清空所有 sessions。改密成功后,只有当前提交者拿到的新 session 有效(其他设备/标签页的旧 session 已失效)。
- **加密**: 复用 `encryptApiKey` / `decryptApiKey`,与 `access_password_enc` 同方案。
- **限流**: 复用 setup 桶(10/分/IP),不新增桶。
- **密码强度**: 与首次设密一致(≥12 + 大小写 + 特殊字符)。

## 不在本次范围(YAGNI)

- 使用者**主动**改密(只有"密码已被重置"才能改)
- 改密历史记录
- 邮件/通知
- 双因素认证
- 跨设备 session 同步

## 风险

| 风险 | 缓解 |
|---|---|
| 使用者错过改密要求(浏览器记住旧密码) | 强制 ChangePasswordView 才能进入统计页;没有跳过路径 |
| 管理员误操作频繁重置 | 与现有一样;UI 已要求确认对话框 |
| `must_reset_password` 列对已有数据无意义(默认 0) | 默认值正确,无迁移风险 |
| 并发改密 | SQL 守卫 + `changes === 0` 拒绝 |
| 时区漂移 | 不依赖 JS 时间,SQL `datetime('now', '+8 hours')` |

## 验收标准

- [ ] `relay_keys.must_reset_password` 列已加,默认 0
- [ ] 管理员后台重置密码后,该 Key 的 `must_reset_password = 1`
- [ ] 使用者访问 `/u/<name>` 看到 ChangePasswordView
- [ ] 三行输入完整,旧密码输入错 → 401,新密码强度不够 → 400,确认不一致 → 400
- [ ] 提交合规输入 → 立即进入 StatsView;新 session cookie 已发
- [ ] 改密成功后,`must_reset_password = 0`(可在 DB 直接验证)
- [ ] 退出后再访问,看到的是 LoginView(不是 ChangePasswordView)
- [ ] 正常使用中调用 setup 带 `currentPassword` → 409
- [ ] 旧密码与新密码相同 → 400
- [ ] `npx tsc --noEmit` 无错
- [ ] `npm run build` 通过