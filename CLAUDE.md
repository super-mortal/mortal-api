# Mortal API

AI 大模型 API 中转站，兼容 OpenAI API 格式，支持多模型路由。

## 快速开始

```bash
npm install
cp .env.example .env
# 编辑 .env 设置 ADMIN_PASSWORD 和 JWT_SECRET
npm run dev
npm run build
npm start
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ADMIN_PASSWORD` | 管理后台密码 | `admin123` |
| `JWT_SECRET` | JWT 签名密钥（用于加密 API Key） | - |
| `DATABASE_PATH` | SQLite 数据库路径 | `data/relay.db` |

> **注意**: API Key 不再通过环境变量配置，改为在管理后台 → 渠道管理中**加密存入数据库**。

## 技术架构

- **框架**: Next.js 16 (App Router) + TypeScript
- **数据库**: SQLite（通过 `better-sqlite3`，零配置，文件存储在 `data/relay.db`）
- **图标**: Lucide Icons（本地 `public/icons/*.svg` 加载，**禁止使用 CDN**）
  - 使用 `<Icon name="check" className="w-4 h-4" />` 或 `<InlineIcon name="check" />` 组件
  - 所有图标必须从 https://lucide.dev/icons 选取
  - 新图标需要运行 `node scripts/download-lucide-icons.js` 下载到本地
- **图表**: Recharts（折线/柱状/饼/面积图）
- **样式**: Tailwind CSS v4，浅色主题

## 上游供应商

上游供应商（渠道）的信息**写入 SQLite 数据库** `channels` 表。初始化时自动播种 5 个默认渠道：
- DeepSeek V4 Pro / Flash
- 智谱 GLM-5 / GLM-5.2
- 通义千问 Qwen-Plus

渠道的 API Key 通过管理后台 → 渠道管理中**加密存入数据库**的 `api_key` 字段。

## Token 统计策略

采用分层统计方案（遵循行业最佳实践）：

1. **首选**: 使用上游提供商返回的 `usage.prompt_tokens` / `usage.completion_tokens`（最精确）
2. **回退**: 使用 `estimateTokens()` 函数估算：
   - 中文汉字 ≈ 1 token/字
   - 英文单词 ≈ 1 token/2.5 字符
   - 数字 ≈ 0.4 token/个
3. **流式场景**: 合并所有 SSE chunk 计算总 output text，再用 estimateTokens 估算

## 目录结构

```
src/
├── app/
│   ├── v1/chat/completions/route.ts     # OpenAI 兼容代理接口
│   ├── v1/models/route.ts               # 模型列表 (OpenAI 兼容)
│   ├── admin/
│   │   ├── login/route.ts               # 管理员登录
│   │   ├── keys/route.ts                # Key CRUD
│   │   ├── channels/route.ts            # 渠道 CRUD + 健康检测
│   │   ├── logs/route.ts                # 调用日志 (支持按日期批量删除)
│   │   ├── stats/route.ts               # 统计数据
│   │   ├── pricing/route.ts             # 模型定价 CRUD
│   │   ├── billing/route.ts             # 账单导出 (Excel)
│   │   └── backup/route.ts              # 备份恢复
│   ├── api/u/[name]/
│   │   ├── setup/route.ts               # 首次设密 / 管理员重置后改密
│   │   ├── login/route.ts               # 访问密码登录 (创建 session)
│   │   └── logout/route.ts              # 登出 (删除 session)
│   ├── u/[name]/
│   │   ├── page.tsx                     # 公开统计页 (四态分发)
│   │   ├── setup-form.tsx               # 首次设置密码表单
│   │   ├── login-form.tsx               # 密码登录表单
│   │   ├── change-password-form.tsx     # 管理员重置后改密表单
│   │   ├── stats-view.tsx               # 用量统计视图
│   │   ├── trend-chart.tsx              # 调用趋势 Recharts 图表
│   │   └── logout-button.tsx            # 登出按钮
│   ├── login/page.tsx                   # 登录页（移动端适配）
│   ├── dashboard/
│   │   ├── layout.tsx                   # 后台布局（移动端抽屉导航）
│   │   ├── page.tsx                     # 仪表盘（6 图块 + 5 图表）
│   │   ├── keys/page.tsx                # Key 管理（Modal 弹窗 + 拖拽排序）
│   │   ├── channels/page.tsx            # 渠道 CRUD（Modal 弹窗 + 健康状态）
│   │   ├── models/page.tsx              # 模型广场（模型列表 + 别名映射 + 定价）
│   │   ├── logs/page.tsx                # 调用日志（日期筛选 + 批量删除）
│   │   ├── billing/page.tsx             # 账单导出（Excel 下载）
│   │   └── backup/page.tsx              # 备份恢复（一键导出 / 导入）
│   ├── page.tsx                         # 首页（移动端适配）
│   ├── globals.css                      # 全局样式
│   ├── layout.tsx                       # 根布局
│   └── favicon.ico
├── lib/
│   ├── db.ts                            # SQLite 数据库初始化 + 所有迁移
│   ├── types.ts                         # TypeScript 类型定义
│   ├── icon.tsx                         # Lucide 图标组件（本地 SVG 加载）
│   ├── modal.tsx                        # 统一弹窗组件
│   ├── ui.tsx                           # UI 基础组件（Button, Spinner, Badge）
│   ├── switch.tsx                       # 开关组件
│   ├── popover.tsx                      # 弹出层组件
│   ├── confirm-dialog.tsx               # 确认对话框
│   ├── combobox.tsx                     # 组合框组件
│   ├── date-picker.tsx                  # 日期选择器
│   ├── date-range-picker.tsx            # 日期范围选择器
│   ├── select-filter.tsx                # 下拉筛选组件
│   ├── health-badge.tsx                 # 渠道健康状态徽标
│   ├── date.ts                          # 北京时间格式化工具
│   ├── fetch-with-auth.ts               # 认证请求工具（自动携带 token）
│   ├── keys.ts                          # Key 管理逻辑
│   ├── channels.ts                      # 渠道管理逻辑
│   ├── proxy.ts                         # 上游代理转发
│   ├── logs.ts                          # 调用日志（支持日期范围删除）
│   ├── token-counter.ts                 # Token 统计（中文/英文混合）
│   ├── auth.ts                          # 认证工具
│   ├── admin-middleware.ts              # 管理后台中间件
│   ├── crypto.ts                        # AES-256-GCM 加密工具
│   ├── model-pricing.ts                 # 模型定价 CRUD + 费用计算
│   ├── health-monitor.ts                # 渠道定时健康检测（1h 间隔）
│   ├── billing.ts                       # 账单导出（ExcelJS 生成）
│   ├── key-access.ts                    # 访问密码 + session + 限流
│   └── key-stats.ts                     # 用量统计聚合查询
├── middleware.ts                        # 路径兼容中间件
├── instrumentation.ts                   # 服务启动时注册健康检测
├── scripts/
│   └── download-lucide-icons.js         # Lucide 图标下载脚本
public/
└── icons/                               # Lucide SVG 图标（本地加载）
```

## API 文档

### 接入说明

- **Base URL**: `https://your.domain.com/v1`
- **支持的端点**:
  | 端点 | 说明 |
  |------|------|
  | `POST /v1/chat/completions` | 聊天补全（流式+非流式） |
  | `GET /v1/models` | 列出可用模型 |
- **认证**: `Authorization: Bearer sk-mortal-xxx`

> **路径兼容**: 中间件会自动处理各种客户端误配置——`/api/v1/...`、`/v1/v1/...`、裸 `/chat/completions` 都会被正确补齐。

### 代理接口 `POST /v1/chat/completions`

完全兼容 OpenAI Chat Completions API 格式。

请求头: `Authorization: Bearer sk-mortal-xxx`

支持参数:
- `model`: 模型名称 (`deepseek-v4-pro`, `glm-5`, `qwen-plus`, 或 `auto`)
- `messages`: 对话消息
- `stream`: 是否流式输出 (SSE)
- 其他 OpenAI 标准参数

### 管理接口

所有管理接口需要 `Authorization: Bearer <admin_token>` 头。

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/admin/login` | 管理员登录 |
| `GET` | `/admin/keys` | 获取所有 Key |
| `POST` | `/admin/keys` | 创建 Key |
| `PATCH` | `/admin/keys` | 更新 Key |
| `DELETE` | `/admin/keys?id=xxx` | 删除 Key |
| `GET` | `/admin/channels` | 获取所有渠道 |
| `POST` | `/admin/channels` | 创建渠道 |
| `PATCH` | `/admin/channels` | 更新渠道 |
| `PUT` | `/admin/channels` | 健康检测 |
| `DELETE` | `/admin/channels?id=xxx` | 删除渠道 |
| `GET` | `/admin/logs` | 查询日志（支持分页/状态/日期） |
| `DELETE` | `/admin/logs?id=xxx` | 删除单条日志 |
| `DELETE` | `/admin/logs?start_date=&end_date=` | 按日期范围批量删除日志 |
| `GET` | `/admin/stats` | 统计数据（支持日/7天/30天） |
| `GET` | `/admin/pricing` | 获取所有模型定价 |
| `POST` | `/admin/pricing` | 更新模型定价 |
| `POST` | `/admin/billing` | 导出账单（Excel 格式，支持按 Key/日期范围/汇总方式） |
| `GET` | `/admin/backup` | 导出 JSON 备份 |
| `POST` | `/admin/backup` | 导入 JSON 备份 |

### 公开统计接口（使用者自查）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/u/<name>` | 公开统计页（四态分发） |
| `POST` | `/api/u/<name>/setup` | 首次设密 / 管理员重置后改密 |
| `POST` | `/api/u/<name>/login` | 密码登录（创建 session cookie） |
| `POST` | `/api/u/<name>/logout` | 登出（删除 session） |

## 支持的模型

| 模型 | 提供商 | 路由名 |
|------|--------|--------|
| DeepSeek V4 Pro | DeepSeek | `deepseek-v4-pro` |
| DeepSeek V4 Flash | DeepSeek | `deepseek-v4-flash` |
| GLM-5 | 智谱AI | `glm-5` |
| GLM-5.2 | 智谱AI | `glm-5.2` |
| Qwen-Plus | 阿里云 | `qwen-plus` |

（渠道模型列表可在管理后台 → 模型广场实时拉取和更新。）

## 设计规范

### 图标使用规则

1. **所有图标必须使用 Lucide Icons**（https://lucide.dev/icons）
2. **禁止使用 CDN 加载**，必须下载到 `public/icons/` 本地目录
3. 使用 `<InlineIcon name="icon-name" className="..." />` 组件
4. 添加新图标需在 `scripts/download-lucide-icons.js` 的 `neededIcons` 数组中添加，然后运行 `node scripts/download-lucide-icons.js`

### 数据库迁移

迁移记录在 `_migrations` 表中，SQL 迁移块追加在 `src/lib/db.ts` 的 `initSchema()` 函数末尾。当前迁移列表:

| 迁移名 | 说明 |
|--------|------|
| `v1_init` | 初始表结构 |
| `v2_timezone_beijing` | 时间字段改为北京时间 |
| `v2_fix_last_health_check` | 修复 last_health_check 列 |
| `v3_add_is_pinned` | relay_keys 增加 is_pinned |
| `v4_channel_cooldown` | channels 增加冷却机制 |
| `v5_model_pricing` | model_pricing 表 |
| `v6_pricing_public_name` | pricing model_id 改为 public_name |
| `v7_allowed_models_public_name` | 权限字段使用 public_name |
| `v8_latency_ms` | call_logs 增加延迟列 |
| `v6_key_access` | 访问密码 + session 表（命名跳跃因分支合并） |
| `v7_must_reset_password` | relay_keys 增加强制改密标记 |

### 主题

- 浅色主题，白底灰字
- 主色: indigo-500 (#6366f1)
- 字体: Inter (UI), JetBrains Mono (代码)
- 圆角: lg/2xl
- 阴影: 轻微柔和 shadow-sm/border 为主
