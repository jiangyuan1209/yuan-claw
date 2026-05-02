# yuan-agent

一个基于 **Node.js + TypeScript** 的本地 CLI Agent。  
它可以在命令行中使用大模型完成任务，并按需调用网页搜索、HTTP 抓取、网页正文提取以及本地工具。

## Features

- 🤖 本地命令行智能体
- 🧠 基于大模型的任务执行与推理
- 🔧 可扩展的工具调用机制
- 🌐 支持 Brave Search 网页搜索
- 📄 支持 HTTP 抓取与网页正文提取
- 💬 支持多轮会话
- 🖥️ 支持交互式 REPL
- ✅ 支持工具执行前确认（approval）
- ⌨️ 支持 `↑ / ↓ / Enter` 选择确认项
- 🔁 支持会话级“总是允许”模式
- 🔌 支持代理配置
- 🛠️ 基于 TypeScript，便于二次开发

---

## Requirements

- Node.js >= 20
- npm >= 9

---

## Installation

```bash
git clone https://github.com/your-name/yuan-agent.git
cd yuan-agent
npm install
```

---

## Quick Start

### 1. 配置环境变量

在项目根目录创建 `.env` 文件：

```env
MODEL_API_KEY=
MODEL_BASE_URL=
MODEL_NAME=

BRAVE_SEARCH_API_KEY=

HTTP_PROXY=
HTTPS_PROXY=
```

最小可用配置通常只需要：

```env
MODEL_API_KEY=your_api_key
MODEL_BASE_URL=https://api.openai.com/v1
MODEL_NAME=gpt-4o-mini
```

---

### 2. 开发模式运行

#### 单次命令

```bash
npm run dev -- "帮我搜索 OpenAI 最新消息"
```

#### 交互式 REPL

```bash
npm run dev
```

启动后你会看到：

```txt
Welcome to yuan-agent!
Type /help for commands, /exit to quit.
Approval mode is shown in the prompt: [ask] or [always].

yuan-agent[ask]>
```

---

### 3. 编译后运行

```bash
npm run build
npm run start
```

单次命令模式：

```bash
npm run start -- "帮我总结这个项目的功能"
```

---

## REPL Usage

不传入 prompt 时，程序会进入 REPL 模式。你可以连续输入多轮指令，例如：

```txt
yuan-agent[ask]> 帮我总结这个项目
yuan-agent[ask]> 再简短一点
yuan-agent[ask]> 输出成要点列表
```

支持的内置命令：

```txt
/help    显示帮助
/exit    退出
/quit    退出
/clear   清空当前会话历史，并重置 approval 模式
/save    保存当前会话
/reset   将 approval 模式重置为 ask
/status  查看当前会话状态
```

---

## Approval / 工具执行确认

某些工具调用在执行前需要你的确认，例如执行本地命令时：

```txt
我需要执行 `pwd` 命令来显示当前工作目录。是否允许执行？
```

此时可以使用：

- `↑ / ↓`：切换选项
- `Enter`：确认
- `Ctrl+C`：拒绝

可选项包括：

- **不允许**
- **允许**
- **总是允许**

如果选择 **总是允许**，当前会话后续的相关工具调用将自动通过，提示符也会变为：

```txt
yuan-agent[always]>
```

如需恢复逐次确认，可执行：

```txt
/reset
```

---

## Scripts

```json
{
  "scripts": {
    "dev": "tsx src/cli/main.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/cli/main.js",
    "check": "tsc --noEmit"
  }
}
```

### 脚本说明

- `npm run dev`：开发模式运行源码
- `npm run build`：编译到 `dist/`
- `npm run start`：运行编译后的 CLI
- `npm run check`：执行 TypeScript 类型检查

说明：

- `npm run dev` / `npm run start`
    - 不传参数：进入 REPL
    - 传入参数：执行单次命令

---

## CLI Usage

项目在 `package.json` 中定义了可执行命令：

```json
"bin": {
  "yuan-agent": "./dist/cli/main.js"
}
```

构建并安装后，可以直接使用：

```bash
yuan-agent
```

或：

```bash
yuan-agent "帮我搜索 AI 新闻"
```

---

## Environment Variables

项目使用 **OpenAI-compatible API**，按以下优先级读取配置：

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

### OpenAI 风格兼容变量

如果你更习惯 OpenAI 风格变量名，也可以使用：

```env
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=
```

---

## Web Search

如果你希望启用网页搜索工具，请配置：

```env
BRAVE_SEARCH_API_KEY=your_brave_search_api_key
```

未配置时，`web_search` 工具会被禁用。

---

## Proxy

如需通过代理访问模型服务或外部网站，可以配置：

```env
HTTP_PROXY=http://127.0.0.1:33210
HTTPS_PROXY=http://127.0.0.1:33210
```

程序会自动读取以下变量：

- `HTTP_PROXY`
- `HTTPS_PROXY`
- `http_proxy`
- `https_proxy`

---

## Recommended `.env.example`

建议在仓库中提供如下 `.env.example`：

```env
# =========================
# 模型服务配置（推荐）
# =========================

MODEL_API_KEY=
MODEL_BASE_URL=
MODEL_NAME=

# =========================
# OpenAI 风格兼容变量（可选）
# =========================

OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=

# =========================
# 网页搜索配置
# =========================

BRAVE_SEARCH_API_KEY=

# =========================
# 代理配置（可选）
# =========================

HTTP_PROXY=
HTTPS_PROXY=
```

---

## Examples

### 普通问答

```bash
npm run dev -- "帮我总结这个项目的功能"
```

### 搜索最新消息

```bash
npm run dev -- "帮我搜索 OpenAI 最新消息"
```

### 进入 REPL

```bash
npm run dev
```

### 编译后运行

```bash
npm run build
npm run start -- "帮我搜索 AI 新闻"
```

---

## Troubleshooting

### `Missing MODEL_API_KEY / OPENAI_API_KEY in environment variables.`

说明模型 API Key 未配置。请至少设置其一：

```env
MODEL_API_KEY=your_api_key
```

或：

```env
OPENAI_API_KEY=your_api_key
```

---

### `web_search disabled: set BRAVE_SEARCH_API_KEY`

说明未配置 Brave Search API Key。请添加：

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

```bash
npm run check
npm run dev
```

---

## Roadmap

- [ ] 优化 approval 菜单显示体验
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


## `.gitignore`

```gitignore
node_modules
dist
.env
```