```md
# yuan-claw

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

### 方式一：通过 npm 全局安装（推荐）

```bash
npm install -g @jiangyuan1209/yuan-claw
```

安装完成后可直接使用：

```bash
yuan-claw
```

卸载命令：

```bash
npm uninstall -g @jiangyuan1209/yuan-claw
```

如需安装指定版本：

```bash
npm install -g @jiangyuan1209/yuan-claw@0.1.2
```

升级到最新版：

```bash
npm install -g @jiangyuan1209/yuan-claw@latest
```

---

### 方式二：从源码安装

```bash
git clone https://github.com/your-name/yuan-claw.git
cd yuan-claw
npm install
npm run build
```

源码模式下运行：

```bash
npm run dev
```

或：

```bash
npm run start
```

---

## Quick Start

### 1. 首次运行初始化配置

安装完成后，先执行一次：

```bash
yuan-claw
```

程序会在你的用户目录下自动初始化配置文件：

```bash
~/.yuan-claw/settings.json
```

在 macOS / Linux 上通常类似：

```bash
/Users/你的用户名/.yuan-claw/settings.json
```

如果你使用的是 Windows，则通常位于用户目录下对应的 `.yuan-claw` 文件夹中。

> 注意：第一次运行通常只是创建配置文件。  
> 你需要手动填写配置后，再次执行 `yuan-claw` 才会真正生效。

---

### 2. 编辑 `~/.yuan-claw/settings.json`

示例：

```json
{
  "MODEL_API_KEY": "your_api_key",
  "MODEL_BASE_URL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "MODEL_NAME": "qwen3-max-2026-01-23",
  "BRAVE_SEARCH_API_KEY": "your_brave_search_api_key",
  "HTTP_PROXY": "http://127.0.0.1:33210",
  "HTTPS_PROXY": "http://127.0.0.1:33210"
}
```

最小可用配置通常只需要：

```json
{
  "MODEL_API_KEY": "your_api_key",
  "MODEL_BASE_URL": "https://api.openai.com/v1",
  "MODEL_NAME": "gpt-4o-mini"
}
```

如果你希望启用网页搜索，还可以配置：

```json
{
  "BRAVE_SEARCH_API_KEY": "your_brave_search_api_key"
}
```

如需使用代理，可以配置：

```json
{
  "HTTP_PROXY": "http://127.0.0.1:33210",
  "HTTPS_PROXY": "http://127.0.0.1:33210"
}
```

保存后，重新执行：

```bash
yuan-claw
```

---

### 3. 开始使用

#### 交互式 REPL

```bash
yuan-claw
```

#### 单次命令

```bash
yuan-claw "帮我搜索 OpenAI 最新消息"
```

---

## Configuration

项目优先从用户目录中的配置文件读取配置：

```bash
~/.yuan-claw/settings.json
```

### 支持的配置项

- `MODEL_API_KEY`
- `MODEL_BASE_URL`
- `MODEL_NAME`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `BRAVE_SEARCH_API_KEY`
- `HTTP_PROXY`
- `HTTPS_PROXY`
- `http_proxy`
- `https_proxy`

### 推荐配置示例

#### OpenAI-compatible 通用配置

```json
{
  "MODEL_API_KEY": "your_api_key",
  "MODEL_BASE_URL": "https://api.openai.com/v1",
  "MODEL_NAME": "gpt-4o-mini"
}
```

#### DashScope 示例

```json
{
  "MODEL_API_KEY": "your_dashscope_api_key",
  "MODEL_BASE_URL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "MODEL_NAME": "qwen3-max-2026-01-23",
  "BRAVE_SEARCH_API_KEY": "your_brave_search_api_key",
  "HTTP_PROXY": "http://127.0.0.1:33210",
  "HTTPS_PROXY": "http://127.0.0.1:33210"
}
```

---

## Environment Variables（兼容方式）

除了 `~/.yuan-claw/settings.json` 外，开发者也可以在项目根目录通过 `.env` 配置：

```env
MODEL_API_KEY=
MODEL_BASE_URL=
MODEL_NAME=

BRAVE_SEARCH_API_KEY=

HTTP_PROXY=
HTTPS_PROXY=
```

也支持 OpenAI 风格变量名：

```env
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=
```

> 普通 CLI 用户更推荐使用：
>
> ```bash
> ~/.yuan-claw/settings.json
> ```
>
> `.env` 更适合源码开发或本地调试。

---

## REPL Usage

不传入 prompt 时，程序会进入 REPL 模式。你可以连续输入多轮指令，例如：

```txt
yuan-claw[ask]> 帮我总结这个项目
yuan-claw[ask]> 再简短一点
yuan-claw[ask]> 输出成要点列表
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
yuan-claw[always]>
```

如需恢复逐次确认，可执行：

```txt
/reset
```

---

## CLI Usage

全局安装后可直接运行：

```bash
yuan-claw
```

单次命令模式：

```bash
yuan-claw "帮我搜索 AI 新闻"
```

如果你是源码模式开发，则可以使用：

```bash
npm run dev
```

或：

```bash
npm run dev -- "帮我总结这个项目的功能"
```

编译后运行：

```bash
npm run build
npm run start
```

---

## Web Search

如果你希望启用网页搜索工具，请配置：

```json
{
  "BRAVE_SEARCH_API_KEY": "your_brave_search_api_key"
}
```

未配置时，`web_search` 工具会被禁用。

---

## Proxy

如需通过代理访问模型服务或外部网站，可以配置：

```json
{
  "HTTP_PROXY": "http://127.0.0.1:33210",
  "HTTPS_PROXY": "http://127.0.0.1:33210"
}
```

程序会自动读取以下配置项：

- `HTTP_PROXY`
- `HTTPS_PROXY`
- `http_proxy`
- `https_proxy`

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

## Examples

### 普通问答

```bash
yuan-claw "帮我总结这个项目的功能"
```

### 搜索最新消息

```bash
yuan-claw "帮我搜索 OpenAI 最新消息"
```

### 进入 REPL

```bash
yuan-claw
```

### 源码开发模式

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

### 第一次运行后为什么没有立即生效？

因为第一次执行：

```bash
yuan-claw
```

通常只是为了初始化配置文件：

```bash
~/.yuan-claw/settings.json
```

你需要手动填写配置项并保存，然后再次执行：

```bash
yuan-claw
```

---

### `Missing MODEL_API_KEY / OPENAI_API_KEY in environment variables.`

说明模型 API Key 尚未正确配置。请至少在以下任一位置填写：

- `~/.yuan-claw/settings.json`
- 系统环境变量
- 项目根目录 `.env`

例如：

```json
{
  "MODEL_API_KEY": "your_api_key"
}
```

---

### `web_search disabled: set BRAVE_SEARCH_API_KEY`

说明未配置 Brave Search API Key。请添加：

```json
{
  "BRAVE_SEARCH_API_KEY": "your_brave_search_api_key"
}
```

---

### 无法访问外部服务 / 请求超时

请检查是否需要代理，例如：

```json
{
  "HTTP_PROXY": "http://127.0.0.1:33210",
  "HTTPS_PROXY": "http://127.0.0.1:33210"
}
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

### 全局命令 `yuan-claw` 不存在

如果你是通过 npm 全局安装，请确认已成功安装：

```bash
npm install -g @jiangyuan1209/yuan-claw
```

如仍有问题，可尝试重新安装：

```bash
npm uninstall -g @jiangyuan1209/yuan-claw
npm install -g @jiangyuan1209/yuan-claw@latest
```

---

## Development

```bash
npm install
npm run check
npm run dev
```

如果你使用源码开发方式，也可以在项目根目录创建 `.env` 文件辅助调试。

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