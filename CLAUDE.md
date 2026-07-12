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

渠道的 API Key 通过**环境变量**配置（而非直接写入数据库）：
- `DEEPSEEK_API_KEY` → DeepSeek 渠道
- `ZHIPU_API_KEY` → 智谱 GLM 渠道
- `QWEN_API_KEY` → 通义千问渠道

数据库中的 `api_key_env` 字段指定该渠道使用哪个环境变量。每次请求时通过 `process.env[api_key_env]` 动态读取。

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
│   ├── api/
│   │   ├── v1/chat/completions/route.ts   # OpenAI 兼容代理接口
│   │   └── admin/
│   │       ├── login/route.ts              # 管理员登录
│   │       ├── keys/route.ts               # Key CRUD
│   │       ├── logs/route.ts               # 调用日志 (支持按日期批量删除)
│   │       ├── channels/route.ts           # 渠道 CRUD + 健康检测
│   │       └── stats/route.ts             # 统计数据
│   ├── login/page.tsx                      # 登录页（移动端适配）
│   ├── dashboard/
│   │   ├── layout.tsx                      # 后台布局（移动端抽屉导航）
│   │   ├── page.tsx                        # 仪表盘（6图块+5图表）
│   │   ├── keys/page.tsx                   # Key 管理（Modal 弹窗）
│   │   ├── channels/page.tsx               # 渠道 CRUD（Modal 弹窗+表单）
│   │   └── logs/page.tsx                   # 调用日志（日期筛选+批量删除）
│   └── page.tsx                            # 首页（移动端适配）
├── lib/
│   ├── db.ts                               # SQLite 数据库
│   ├── types.ts                            # TypeScript 类型
│   ├── icon.tsx                            # Lucide 图标组件（本地 SVG 加载）
│   ├── modal.tsx                           # 统一弹窗组件
│   ├── keys.ts                             # Key 管理逻辑
│   ├── channels.ts                         # 渠道管理逻辑
│   ├── proxy.ts                            # 上游代理转发
│   ├── logs.ts                             # 调用日志 (支持日期范围删除)
│   ├── token-counter.ts                    # Token 统计（中文/英文混合）
│   ├── auth.ts                             # 认证工具
│   └── admin-middleware.ts                 # 管理后台中间件
public/
└── icons/                                  # Lucide SVG 图标（本地加载）
```

## API 文档

### 代理接口 `POST /api/v1/chat/completions`

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
| `POST` | `/api/admin/login` | 管理员登录 |
| `GET` | `/api/admin/keys` | 获取所有 Key |
| `POST` | `/api/admin/keys` | 创建 Key |
| `PATCH` | `/api/admin/keys` | 更新 Key |
| `DELETE` | `/api/admin/keys?id=xxx` | 删除 Key |
| `GET` | `/api/admin/channels` | 获取所有渠道 |
| `POST` | `/api/admin/channels` | 创建渠道 |
| `PATCH` | `/api/admin/channels` | 更新渠道 |
| `PUT` | `/api/admin/channels` | 健康检测 |
| `DELETE` | `/api/admin/channels?id=xxx` | 删除渠道 |
| `GET` | `/api/admin/logs` | 查询日志 (支持分页/状态/日期) |
| `DELETE` | `/api/admin/logs?id=xxx` | 删除单条日志 |
| `DELETE` | `/api/admin/logs?start_date=&end_date=` | 按日期范围批量删除日志 |
| `GET` | `/api/admin/stats` | 统计数据 (支持日/7天/30天) |

## 支持的模型

| 模型 | 提供商 | 路由名 |
|------|--------|--------|
| DeepSeek V4 Pro | DeepSeek | `deepseek-v4-pro` |
| DeepSeek V4 Flash | DeepSeek | `deepseek-v4-flash` |
| GLM-5 | 智谱AI | `glm-5` |
| GLM-5.2 | 智谱AI | `glm-5.2` |
| Qwen-Plus | 阿里云 | `qwen-plus` |

## 设计规范

### 图标使用规则

1. **所有图标必须使用 Lucide Icons**（https://lucide.dev/icons）
2. **禁止使用 CDN 加载**，必须下载到 `public/icons/` 本地目录
3. 使用 `<InlineIcon name="icon-name" className="..." />` 组件
4. 添加新图标需在 `scripts/download-lucide-icons.js` 的 `neededIcons` 数组中添加，然后运行 `node scripts/download-lucide-icons.js`

### 主题

- 浅色主题，白底灰字
- 主色: indigo-500 (#6366f1)
- 字体: Inter (UI), JetBrains Mono (代码)
- 圆角: lg/2xl
- 阴影: 轻微柔和 shadow-sm/border 为主
