```md
# yuan-claw

一个基于 **Node.js + TypeScript** 的本地 CLI Agent。  
它可以在命令行中使用大模型完成任务，并按需调用网页搜索、HTTP 抓取、网页正文提取以及本地工具。

## Features

- 🤖 本地命令行智能体
- 🧠 基于大模型的任务执行与推理
- 🔧 可扩展的工具调用机制
- 🌐 支持 baidu Search 网页搜索
- 📄 支持 HTTP 抓取与网页正文提取
- 💬 支持多轮会话
- 🖥️ 支持交互式 REPL
- ✅ 支持工具执行前确认（approval）
- ⌨️ 支持 `↑ / ↓ / Enter` 选择确认项
- 🔁 支持会话级”总是允许”模式
- 📦 支持本地 Skill 插件扩展能力
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
  "BAIDU_API_KEY": "your_baidu_search_api_key",
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
  "BAIDU_API_KEY": "your_baidu_search_api_key"
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
- `BAIDU_API_KEY`
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
  "BAIDU_API_KEY": "your_baidu_search_api_key",
  "HTTP_PROXY": "http://127.0.0.1:33210",
  "HTTPS_PROXY": "http://127.0.0.1:33210"
}
```

---

## Environment Variables（已废弃）

项目已不再通过 `.env` 加载配置，所有配置均通过 `~/.yuan-claw/settings.json` 管理。

如果你仍习惯使用 `.env`，可以自行在项目中通过 `dotenv` 加载，但不再推荐。

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
  "BAIDU_API_KEY": "your_baidu_search_api_key"
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

## Skills / 本地插件扩展

yuan-claw 支持通过本地 Skill（技能）文件扩展 Agent 的能力。Skill 是存放在固定目录下的 Markdown 文件，Agent 会在运行时根据用户输入自动匹配并加载相关 Skill 的提示词，从而获得领域知识或操作指引。

### Skill 目录结构

所有 Skill 文件存放在：

```bash
~/.yuan-claw/skills/
```

每个 Skill 是一个子目录，其中必须包含一个 `SKILL.md` 文件：

```
~/.yuan-claw/skills/
├── pdf/
│   └── SKILL.md
├── frontend-design/
│   └── SKILL.md
└── my-skill/
    └── SKILL.md
```

### SKILL.md 文件格式

`SKILL.md` 使用 YAML frontmatter + Markdown body 的格式：

```markdown
---
name: pdf
description: PDF 文件处理技能，支持提取文本、表格、OCR 等
tags: [pdf, document, ocr]
license: MIT
version: 1.0.0
---

## 使用指南

当用户需要处理 PDF 文件时：
1. 使用 pdfplumber 提取文本...
2. 对于扫描件，使用 OCR...
```

Frontmatter 字段说明：

- `name`（可选）：Skill 名称，用于匹配和展示。未填写时使用目录名
- `description`（可选）：简短描述，用于匹配和展示
- `tags`（可选）：标签数组，用于关键词匹配
- `license`（可选）：许可证
- `version`（可选）：版本号

Markdown body 是 Skill 的实际提示词内容，会被注入到 system prompt 中指导 Agent 行为。

### 匹配机制

Agent 会根据用户输入自动匹配最相关的 Skill（最多匹配 3 个），匹配依据包括：

- 用户输入中是否包含 Skill 名称
- 用户输入中是否包含 Skill 的标签
- 用户输入分词后与 Skill 描述的关键词重合度

匹配到的 Skill 内容会被组装到 system prompt 中，指导 Agent 使用相应的知识和流程。

### 添加自定义 Skill

1. 在 `~/.yuan-claw/skills/` 下创建新目录：

```bash
mkdir -p ~/.yuan-claw/skills/my-skill
```

2. 创建 `SKILL.md` 文件：

```bash
cat > ~/.yuan-claw/skills/my-skill/SKILL.md << 'EOF'
---
name: my-skill
description: 我的自定义技能
tags: [custom]
---

当用户问到 XXX 时，请按以下步骤操作：
1. ...
2. ...
EOF
```

3. 下次运行 `yuan-claw` 时，该 Skill 会被自动发现和加载。

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

说明模型 API Key 尚未正确配置。请在以下位置填写：

- `~/.yuan-claw/settings.json`

例如：

```json
{
  "MODEL_API_KEY": "your_api_key"
}
```

---

### `web_search disabled: set BAIDU_API_KEY`

说明未配置百度搜索 API Key。请添加：

```json
{
  "BAIDU_API_KEY": "your_baidu_search_api_key"
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

---
## License

MIT