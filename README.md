# Mortal API

> AI 大模型 API 中转站 — 兼容 OpenAI API 格式，支持多模型路由、Key 管理、渠道管理、调用统计

**GitHub**: [https://github.com/super-mortal/mortal-api](https://github.com/super-mortal/mortal-api)

---

## 技术栈

| 技术 | 用途 |
|------|------|
| **Next.js 16** (App Router) | 全栈框架 |
| **TypeScript** | 类型安全 |
| **Tailwind CSS v4** | 样式 |
| **SQLite** (better-sqlite3) | 数据库（零配置） |
| **Recharts** | 统计图表 |
| **Lucide Icons** | 图标（本地加载，无 CDN） |
| **JWT** (jsonwebtoken) | 认证 |
| **AES-256-GCM** (Node.js crypto) | API Key 加密存储 |

## 功能特性

- **OpenAI 兼容** — 完全兼容 OpenAI Chat Completions API，支持流式/非流式
- **多模型路由** — 支持 `auto` 自动路由、指定模型、模型别名映射
- **渠道管理** — 管理上游 API 提供商（DeepSeek、智谱 GLM、通义千问、NVIDIA 等）
- **Key 管理** — 创建多个 API Key，设置额度、过期时间、渠道/模型权限
- **调用日志** — 查看 API 调用记录，按时间/状态/Key/模型筛选
- **数据统计** — 仪表盘展示调用趋势、Token 消耗、模型分布
- **模型广场** — 查看所有可用模型及别名映射
- **备份恢复** — 一键导出/导入全部数据
- **加密存储** — 上游 API Key 使用 AES-256-GCM 加密存入数据库

## 快速开始

### 环境要求

- Node.js 18+
- npm 9+

### 安装

```bash
git clone https://github.com/super-mortal/mortal-api.git
cd mortal-api

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，修改以下配置
```

### 配置

编辑 `.env` 文件：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ADMIN_PASSWORD` | 管理后台登录密码 | `admin123` |
| `JWT_SECRET` | JWT 签名密钥（必须修改！用于加密 API Key） | — |
| `DATABASE_PATH` | SQLite 数据库路径 | `data/relay.db` |

> **⚠️ 安全提醒**：上线前务必修改 `ADMIN_PASSWORD` 和 `JWT_SECRET`！
>
> `JWT_SECRET` 一旦设定并创建了渠道后请勿修改，否则已加密的 API Key 将无法解密。

### 启动

```bash
# 开发模式
npm run dev

# 生产构建并启动
npm run build
npm start
```

访问 [http://localhost:3000](http://localhost:3000)

---

## 全新服务器部署指南

### 1. 安装依赖

```bash
# Ubuntu / Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

# 验证
node -v
npm -v
```

### 2. 克隆项目

```bash
git clone https://github.com/super-mortal/mortal-api.git
cd mortal-api
npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
nano .env
```

确保修改以下字段：

```
ADMIN_PASSWORD=你的强密码
JWT_SECRET=你的随机密钥字符串（至少32位）
```

### 4. 构建并启动

```bash
# 构建
npm run build

# 使用 PM2 守护进程（推荐）
npm install -g pm2
pm2 start npm --name mortal-api -- start
pm2 save
pm2 startup

# 或直接后台启动
nohup npm start > app.log 2>&1 &
```

### 5. 配置反向代理（Nginx）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400s;
    }
}
```

> 流式响应（SSE）需要较长的 `proxy_read_timeout`

启用 HTTPS（推荐使用 Let's Encrypt）：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 6. 防火墙

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable
```

---

## API 使用

### 基础 URL

```
https://你的域名/v1
```

### 使用者查看页面

Key 使用者可访问自己的使用统计页：

```
GET https://你的域名/u/<key-name>
```

- 首次访问：设置访问密码（≥12 位，含大小写字母与特殊字符）。默认密码为 `@123456789123Pk`，可在管理后台 → Key 管理 → 重置访问密码
- 之后：用密码登录，查看总调用数 / Token / 费用 / 趋势图 / 近期明细（50 条）
- 忘记密码：联系管理员在管理后台 → Key 管理 → 重置访问密码

### 聊天补全

```bash
curl https://你的域名/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-mortal-xxx" \
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": true
  }'
```

### 模型列表

```bash
curl https://你的域名/v1/models \
  -H "Authorization: Bearer sk-mortal-xxx"
```

### 支持的模型参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `model` | string | 模型名（`auto` 自动路由，或指定模型/别名） |
| `messages` | array | 对话消息 |
| `stream` | boolean | 是否流式输出 |
| `temperature` | number | 采样温度 |
| `top_p` | number | 核采样 |
| `max_tokens` | number | 最大输出 Token |
| `stop` | string[] | 停止词 |
| `tools` | array | 工具调用 |
| `response_format` | object | 响应格式 |

---

## 目录结构

```
mortal-api/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── v1/
│   │   │   │   ├── chat/completions/   # OpenAI 兼容代理接口
│   │   │   │   └── models/             # 模型列表接口
│   │   │   └── admin/                  # 管理后台接口
│   │   │       ├── login/              # 管理员登录
│   │   │       ├── keys/               # Key CRUD
│   │   │       ├── channels/           # 渠道 CRUD
│   │   │       ├── logs/               # 调用日志
│   │   │       ├── stats/              # 统计数据
│   │   │       └── backup/             # 备份恢复
│   │   ├── dashboard/                  # 管理后台页面
│   │   │   ├── keys/                   # Key 管理
│   │   │   ├── channels/               # 渠道管理
│   │   │   ├── models/                 # 模型广场
│   │   │   ├── logs/                   # 调用日志
│   │   │   └── backup/                 # 备份恢复
│   │   ├── login/                      # 登录页面
│   │   └── page.tsx                    # 首页
│   └── lib/
│       ├── db.ts                       # SQLite 数据库初始化
│       ├── keys.ts                     # Key 管理逻辑
│       ├── channels.ts                 # 渠道/模型/别名逻辑
│       ├── proxy.ts                    # 上游代理转发
│       ├── logs.ts                     # 调用日志
│       ├── token-counter.ts            # Token 统计
│       ├── crypto.ts                   # AES-256-GCM 加密
│       ├── auth.ts                     # JWT 认证
│       ├── icon.tsx                    # Lucide 图标组件
│       ├── modal.tsx                   # 统一弹窗组件
│       ├── combobox.tsx                # 组合框组件
│       └── fetch-with-auth.ts          # 认证请求工具
├── public/icons/                       # Lucide SVG 图标
├── data/                               # SQLite 数据库文件（不提交）
├── .env                                # 环境配置（不提交）
├── .env.example                        # 环境配置模板
├── .gitignore
└── package.json
```

---

## 架构说明

### 模型路由

请求流程：用户指定模型名 → 检查模型别名 → 解析到原始模型 ID → 找到对应渠道 → 转发上游

1. **别名映射**：用户调用 `my-model` → 映射到渠道 A 的 `deepseek-v4-pro`
2. **直连模型**：用户调用 `deepseek-v4-pro` → 直接路由到渠道 A
3. **自动路由**：`model: "auto"` → 随机选择一个可用渠道

### 数据存储

- **SQLite** 零配置数据库，文件存储在 `data/relay.db`
- 上游 API Key 使用 `AES-256-GCM` 加密存储，加密密钥由 `JWT_SECRET` 派生
- 数据库文件不提交到 Git

### Token 统计

- 首选：使用上游返回的 `usage.prompt_tokens` / `usage.completion_tokens`
- 回退：本地估算（中文≈1 token/字，英文≈1 token/2.5字符）

## 上游供应商配置

在管理后台 → 渠道管理中配置：

1. **DeepSeek** — `https://api.deepseek.com`
2. **智谱 GLM** — `https://open.bigmodel.cn/api/paas/v4`
3. **通义千问** — `https://dashscope.aliyuncs.com/compatible-mode/v1`
4. **NVIDIA** — `https://integrate.api.nvidia.com`

创建渠道后，在展开区域可拉取上游模型列表并添加到渠道中。

---

## 许可证

MIT — 详见 [LICENSE](LICENSE) 文件
