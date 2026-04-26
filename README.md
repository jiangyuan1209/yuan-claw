# my-agent

一个基于 **Node.js + TypeScript** 的本地 CLI Agent，支持模型调用、工具执行、网页搜索、HTTP 抓取与网页正文提取。

## Features

- 🤖 本地命令行智能体
- 🧠 基于大模型的任务执行与推理
- 🔧 可扩展的工具调用机制
- 🌐 支持 Brave Search 网页搜索
- 📄 支持 HTTP 页面抓取与正文提取
- 💬 支持多轮会话处理
- 🔌 支持代理配置
- 🛠️ 基于 TypeScript，便于二次开发

---

## Tech Stack

- Node.js
- TypeScript
- OpenAI-compatible API client
- dotenv
- jsdom
- @mozilla/readability
- zod

---

## Requirements

- Node.js >= 20
- npm >= 9

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/your-name/my-agent.git
cd my-agent
```

### 2. Install dependencies

```bash
npm install
```

---

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run check
```

### Script description

- `npm run dev`：开发模式运行源码
- `npm run build`：编译到 `dist/`
- `npm run start`：运行编译后的 CLI
- `npm run check`：执行 TypeScript 类型检查

---

## Quick Start

### 开发模式运行

```bash
node --env-file=.env --import=tsx src/cli/main.ts "帮我搜索 OpenAI 最新消息"
```

或者：

```bash
npm run dev -- "帮我搜索 OpenAI 最新消息"
```

### 编译后运行

```bash
npm run build
node --env-file=.env dist/cli/main.js "帮我搜索 OpenAI 最新消息"
```

---

## CLI Usage

项目在 `package.json` 中定义了可执行命令：

```json
"bin": {
  "my-agent": "./dist/cli/main.js"
}
```

构建并安装后，可以直接使用：

```bash
my-agent "帮我搜索 OpenAI 最新消息"
```

---

## Environment Variables

请在项目根目录创建 `.env` 文件。

### 推荐配置

```env
# ===== Model Provider (recommended) =====
MODEL_API_KEY=
MODEL_BASE_URL=
MODEL_NAME=

# ===== Web Search =====
BRAVE_SEARCH_API_KEY=

# ===== Optional Proxy =====
HTTP_PROXY=
HTTPS_PROXY=
```

---

## Model Configuration

项目使用 **OpenAI-compatible API**，模型配置按以下优先级读取：

### API Key
1. `MODEL_API_KEY`
2. `OPENAI_API_KEY`

### Base URL
1. `MODEL_BASE_URL`
2. `OPENAI_BASE_URL`

### Model Name
1. `MODEL_NAME`
2. `OPENAI_MODEL`
3. 默认值：`gpt-4o-mini`

### 示例

```env
MODEL_API_KEY=your_api_key
MODEL_BASE_URL=https://api.openai.com/v1
MODEL_NAME=gpt-4o-mini
```

如果你使用兼容 OpenAI API 的第三方服务，也可以这样配置：

```env
MODEL_API_KEY=your_api_key
MODEL_BASE_URL=https://your-provider.example.com/v1
MODEL_NAME=your-model-name
```

---

## OpenAI-style Compatible Variables

如果你更习惯 OpenAI 风格变量名，也可以使用：

```env
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

项目会自动兼容这些变量名。

---

## Web Search Configuration

如果希望启用网页搜索工具，请配置：

```env
BRAVE_SEARCH_API_KEY=your_brave_search_api_key
```

未配置时，`web_search` 工具会被禁用。

---

## Proxy Configuration

如果你的网络环境需要代理访问外部服务，可以配置：

```env
HTTP_PROXY=http://127.0.0.1:33210
HTTPS_PROXY=http://127.0.0.1:33210
```

项目启动时会自动读取以下任意变量：

- `HTTP_PROXY`
- `HTTPS_PROXY`
- `http_proxy`
- `https_proxy`

---

## Recommended `.env.example`

建议在仓库中提供 `.env.example`：

```env
# ===== Model Provider =====
MODEL_API_KEY=
MODEL_BASE_URL=
MODEL_NAME=

# ===== OpenAI-style fallback variables (optional) =====
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=

# ===== Brave Search =====
BRAVE_SEARCH_API_KEY=

# ===== Proxy =====
HTTP_PROXY=
HTTPS_PROXY=
```

---

## Example Usage

### 1. 普通问答

```bash
npm run dev -- "帮我总结这个项目的功能"
```

### 2. 搜索最新消息

```bash
npm run dev -- "帮我搜索 OpenAI 最新消息"
```

### 3. 编译后运行

```bash
npm run build
npm run start -- "帮我搜索 AI 新闻"
```

---

## How It Works

项目大致执行流程如下：

1. 从 CLI 接收用户输入
2. 加载环境变量
3. 初始化代理设置
4. 创建工具注册表
5. 创建 OpenAI-compatible 模型客户端
6. 进入 agent loop
7. 按需调用工具，例如：
    - `web_search`
    - `http_fetch`
    - 网页正文提取
8. 输出最终结果

---

## Search Notes

当配置了 `BRAVE_SEARCH_API_KEY` 时，项目可以启用 `web_search` 工具。  
如果未配置，项目可能退化为通过 HTTP 抓取网页内容来回答问题。

请注意：

- 某些网站可能返回 `403 Forbidden`
- 某些站点会启用 Cloudflare challenge
- 对于“最新消息”类问题，优先使用搜索 API 通常更稳定

---

## Troubleshooting

### `Missing MODEL_API_KEY / OPENAI_API_KEY in environment variables.`

说明模型 API Key 未配置。

请在 `.env` 中至少配置其一：

```env
MODEL_API_KEY=your_api_key
```

或：

```env
OPENAI_API_KEY=your_api_key
```

---

### `web_search disabled: set BRAVE_SEARCH_API_KEY`

说明没有配置 Brave Search API Key。

请添加：

```env
BRAVE_SEARCH_API_KEY=your_key
```

---

### 无法访问外部服务 / 请求超时

请检查是否需要代理：

```env
HTTP_PROXY=http://127.0.0.1:33210
HTTPS_PROXY=http://127.0.0.1:33210
```

---

### 某些网页返回 403 / Forbidden

这通常是目标站点的反爬策略导致的，不一定是程序错误。  
建议优先使用搜索 API 或可信数据源。

---

### `npm run start` 无法运行

请先执行：

```bash
npm run build
```

因为 `start` 依赖编译输出文件：

```txt
dist/cli/main.js
```

---

## Development

### Type check

```bash
npm run check
```

### Run in dev mode

```bash
npm run dev -- "你好"
```

---

## Suggested Project Files

建议在仓库中包含以下文件：

- `README.md`
- `.env.example`
- `.gitignore`
- `LICENSE`

---

## Roadmap

- [ ] 增强搜索结果验证能力
- [ ] 优化网页正文提取效果
- [ ] 增加更多内置工具
- [ ] 支持更多模型服务商
- [ ] 完善自动化测试
- [ ] 增加 Docker 部署支持

---

## License

MIT
```

---

# 你还应该补两个文件

## 1) `.env.example`

```env
# ===== Model Provider =====
MODEL_API_KEY=
MODEL_BASE_URL=
MODEL_NAME=

# ===== OpenAI-style fallback variables (optional) =====
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=

# ===== Brave Search =====
BRAVE_SEARCH_API_KEY=

# ===== Proxy =====
HTTP_PROXY=
HTTPS_PROXY=
```

---

## 2) `.gitignore`

```gitignore
node_modules
dist
.env
```