# Key 公开使用统计页设计

**日期**: 2026-07-24
**状态**: Draft(待评审)
**目标用户**: Key 使用者本人

## 背景与目标

现有管理后台(`/dashboard`)只对管理员开放。Key 使用者(拿到 `sk-mortal-xxx` 的终端用户)无法直接查看自己的使用情况,只能询问管理员。

本次新增**面向 Key 使用者的公开使用统计页**:
- 访问路径:`https://<site>/u/<key-name>`
- 首次访问需自助设置访问密码
- 之后用密码登录,查看自己的使用量

不属于本次范围:
- 不暴露上游渠道、IP、完整日志
- 不替换管理后台
- 不修改代理转发逻辑

## 术语

| 术语 | 含义 |
|------|------|
| **Key** | 管理后台创建的 API Key(行:`keys` 表) |
| **使用者** | 拿到 `sk-mortal-xxx` 的终端用户 |
| **访问密码** | 使用者为自己页面设置的二次密码,与 API Key 本身无关 |
| **会话** | HttpOnly Cookie 标识的登录状态,服务端可主动撤销 |

## 用户故事

1. 作为使用者,我把 `/u/my-app` 发给客户;客户首次打开看到"设置访问密码"页,设一个 12 位以上含大小写与特殊字符的密码,即可进入统计页。
2. 作为使用者,我之后每次打开链接都直接进入统计页(Cookie 30 天有效)。
3. 作为使用者,我点页面右上角"退出"可以立即清除会话。
4. 作为使用者,我忘记密码,联系管理员;管理员在 Key 操作区点"重置访问密码",我的旧密码失效,下次访问看到的是"设置新密码"页(因为重置后 `access_password_enc` 保留但 sessions 全部清除 + 密码被覆写为管理员默认密码 — 等等,这与首次设密的路径会冲突,见下文决策)。

> 决策: 管理员点击「重置访问密码」时,**直接覆盖** `access_password_enc` 为默认密码 `@123456789123Pk` 的密文,并 DELETE 该 key 全部 sessions。
> 下次使用者访问,看到的不是"设密页",而是"登录页",密码已预先填好提示默认值是 `@123456789123Pk`(由 UI 提示使用者"已为您重置为默认密码,请登录后立即修改")。

## 功能设计

### 1. URL 与路由

| 路径 | 用途 |
|------|------|
| `/u/[name]/page.tsx` | 主页面(server component,根据 session 渲染设密/登录/统计三种视图之一) |
| `/api/u/[name]/setup` | 首次设密(POST) |
| `/api/u/[name]/login` | 已有密码,登录(POST) |
| `/api/u/[name]/logout` | 退出(POST) |
| `/admin/keys?action=reset_access_password&id=<keyId>` | 管理员重置(走现有 admin PATCH) |

Cookie 名:`mps`,HttpOnly,`Path=/u/<name>`,`Max-Age=2592000`(30 天),`SameSite=Lax`。

### 2. 页面视图(三态)

```
GET /u/<name>
  ├─ 查 cookie mps
  │   ├─ 无 / 失效 → 查 keys.access_password_enc
  │   │   ├─ NULL → 渲染 <SetupView /> (设密页)
  │   │   └─ 非 NULL → 渲染 <LoginView /> (登录页)
  │   └─ 有效 → 渲染 <StatsView /> (统计页)
  └─ 任何阶段 name 查不到 → Next.js notFound() → 404
```

#### SetupView(设密页)
- 标题:"设置访问密码"(展示 Key 名 `<name>`)
- 表单:
  - 密码框(类型 password)
  - 确认密码框
  - 实时强度提示(长度进度 + ✓/✗ 大小写、特殊字符、数字)
  - 提交按钮(强度未达标时禁用)
- 提交 → 调 `/api/u/[name]/setup`,200 后客户端 router refresh 渲染统计页

#### LoginView(登录页)
- 标题:"登录查看使用情况"
- 单一密码框 + 错误提示
- 提交 → 调 `/api/u/[name]/login`
- 如果该 Key 是被管理员重置过(密码已设为默认),提示:"密码已被管理员重置为 `@123456789123Pk`,请使用该密码登录"

#### StatsView(统计页)
- 顶部 bar:Key 名 + 退出按钮
- 区块 1:汇总卡片(4 个)
  - 总调用次数
  - 总 prompt_tokens
  - 总 completion_tokens
  - 总费用(单位:元)
  - 副标题:首次调用时间 / 最近调用时间
- 区块 2:趋势图(近 30 天)
  - 切换按钮:7 天 / 30 天
  - 三条线:调用数 / 总 token / 费用
- 区块 3:近期明细表(最近 50 条)
  - 列:时间、模型、prompt_tokens、completion_tokens、费用、状态(成功/失败)
  - 不显示 IP、渠道、Key 明文

### 3. 密码规则

正则表达式:
```
/^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{12,}$/
```

满足:**长度 ≥ 12 + 含小写 + 含大写 + 含特殊字符**(数字自然落在大多数 12 位密码中,不强制)

### 4. 限流

内存 LRU(`Map<ip_key, {count, windowStart}>`),10 次/分钟:
- key = `ip + ':' + endpoint`(setup 与 login 共享桶)
- 命中 → 429 `{ "error": "请求过于频繁,请稍后再试" }`
- 部署多实例时不跨节点限流(接受 best-effort)

### 5. 加密

复用 `src/lib/crypto.ts` 现有 AES 加密(用 `JWT_SECRET` 作为密钥派生):
```ts
const enc = encrypt(password)  // 复用现有函数
// 存: keys.access_password_enc = enc
// 校验: decrypt(enc) === submittedPassword
```

## 数据模型

### 现有 `keys` 表 — 新增字段

```sql
ALTER TABLE keys ADD COLUMN access_password_enc TEXT;
ALTER TABLE keys ADD COLUMN access_password_set_at TEXT;
```

### 新表 `key_access_sessions`

```sql
CREATE TABLE key_access_sessions (
  id TEXT PRIMARY KEY,            -- uuid
  key_id TEXT NOT NULL,
  ip TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,       -- 默认 now + 30 天
  FOREIGN KEY (key_id) REFERENCES keys(id) ON DELETE CASCADE
);
CREATE INDEX idx_kas_key_id ON key_access_sessions(key_id);
CREATE INDEX idx_kas_expires ON key_access_sessions(expires_at);
```

### 迁移

新增 `scripts/migrate-add-key-access.js`(启动时通过 `src/lib/db.ts` 检测并执行):
1. `PRAGMA table_info(keys)` 判断列是否存在,不存在则 `ALTER TABLE`
2. `CREATE TABLE IF NOT EXISTS key_access_sessions ...`

## 模块与文件

### 新增

```
src/app/u/[name]/page.tsx              # 主路由(server component)
src/app/u/[name]/setup-form.tsx        # 客户端组件
src/app/u/[name]/login-form.tsx        # 客户端组件
src/app/u/[name]/stats-view.tsx        # 客户端组件(图表 + 表)
src/app/api/u/[name]/setup/route.ts    # POST 首次设密
src/app/api/u/[name]/login/route.ts    # POST 登录
src/app/api/u/[name]/logout/route.ts   # POST 退出
src/lib/key-access.ts                  # 核心逻辑:加密、验证、限流、session 管理
scripts/migrate-add-key-access.js      # 一次性迁移
src/lib/key-stats.ts                   # 复用现有 stats 查询,加 key_id 过滤
```

### 修改

- `src/lib/keys.ts`:`PATCH` 处理器识别 `?action=reset_access_password` 分支
- `src/app/dashboard/keys/page.tsx`:Key 操作区增加「重置访问密码」按钮
- `src/middleware.ts`:确认 `/u/...` 不被错误改写

## 错误处理

| 场景 | 行为 |
|------|------|
| `/u/<不存在>` | 404 |
| `/u/<已重命名>` | 404 |
| Key 已禁用 | 仍可访问,顶部显示"该 Key 已被管理员禁用,数据为历史快照" |
| 密码错误 | 401 `{ "error": "密码错误" }` |
| 密码不合规 | 400 `{ "error": "密码必须 ≥12 位,含大小写字母与特殊字符" }` |
| 重复设密 | 409 `{ "error": "该 Key 已设置访问密码,请使用登录页" }` |
| 限流 | 429 `{ "error": "请求过于频繁,请稍后再试" }` |
| 会话过期 | 自动跳 LoginView,提示"会话已过期,请重新输入密码" |
| 管理员重置密码 | 该 Key 全部 sessions DELETE,旧 Cookie 失效 |
| Server error | 500 + 日志(不暴露细节) |

## 测试策略

### 单元

- `setAccessPassword(name, pwd)`:合法/非法密码、重复设密、不存在 Key
- `verifyAccessPassword(name, pwd)`:正确/错误密码
- `resetAccessPassword(keyId)`:重置后 `verifyAccessPassword` 用默认密码成功
- `rateLimit(ip)`:第 11 次 429

### 集成(手测 + 可选 playwright)

1. 启动 dev server,创建测试 Key
2. 浏览器访问 `/u/<test-name>` → 看到 SetupView
3. 输入弱密码 → 400 + 强度提示
4. 输入合规密码 → 看到 StatsView(空数据)
5. 触发一次 API 调用 → StatsView 出现 1 条明细
6. 退出 → 回到 LoginView
7. 重新登录 → 看到 StatsView
8. 限流:连续 11 次错误密码 → 第 11 次 429
9. 管理员重置密码 → 旧 Cookie 失效
10. 重命名 Key → 旧 URL 404

## 安全考量

- 密码不在 URL、日志、错误信息中出现
- Cookie 仅 `Path=/u/<name>`,不污染管理后台域
- 防固定密码撞库:限流(10 次/分钟/IP)
- 服务端 session 允许管理员重置后立即生效
- 不在客户端 localStorage 存任何敏感数据
- 管理员重置为统一默认密码 `@123456789123Pk`;首次登录后**建议** UI 提示使用者修改(本期不强制实现修改密码流程,YAGNI)

## 不在本次范围(YAGNI)

- 修改密码(只能重置)
- 双因素认证
- 跨设备同步会话
- 详细的渠道级信息
- 自定义时间范围筛选(只提供 7 / 30 天切换)
- 国际化(只做中文)

## 风险

| 风险 | 缓解 |
|------|------|
| 内存限流不跨实例 | 接受 best-effort;若多实例部署后可换 Redis |
| 默认密码强度不足 | 仅作为临时凭证,UI 强烈提示使用者登录后修改 |
| SSR 拉 stats 数据使页面较大 | 接受;数据量不大,30 天趋势 30 个数据点 |
| 公开页面被搜索引擎收录 | robots.txt 建议加 `Disallow: /u/`(运维动作,非本期代码) |

## 验收标准

- [ ] 首次访问路径:设密 → 统计
- [ ] 退出后访问路径:登录 → 统计
- [ ] 密码规则被严格执行
- [ ] 限流生效
- [ ] 管理员后台可重置,旧会话立即失效
- [ ] 重命名后旧 URL 404
- [ ] 统计页样式与现有 dashboard 视觉一致
- [ ] 不暴露 Key 明文、IP、渠道名