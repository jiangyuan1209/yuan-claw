# yuan-claw

一个基于 **Node.js + TypeScript** 的本地 CLI Agent，支持大模型任务执行、网页搜索、HTTP 抓取及本地工具调用。

## Features

- 🤖 本地命令行智能体
- 🧠 基于大模型的任务执行与推理
- 🔧 可扩展的工具调用机制
- 🌐 支持 Baidu Search 网页搜索
- 📄 支持 HTTP 抓取与网页正文提取
- 💬 支持多轮会话
- 🖥️ 支持交互式 REPL
- ✅ 支持工具执行前确认（approval）
- ⌨️ 支持 `↑ / ↓ / Enter` 选择确认项
- 🔁 支持会话级”总是允许”模式
- 📦 支持本地 Skill 插件扩展能力
- 🔌 支持代理配置
- 🌍 支持 Web 网页端对话（React + Ant Design + Ant Design X）
- 🎙️ 支持 Web 端语音输入（浏览器麦克风 + DashScope 实时语音识别）
- 🖼️ 支持 Web 端图片附件输入（视觉模型 OCR 识别图片文字后提问）

---

## Requirements

- Node.js >= 20
- npm >= 9

## Installation

### 1. npm 官方仓库（推荐）
```bash
# 安装最新版
npm install -g @jiangyuan1209/yuan-claw
# 指定版本安装
npm install -g @jiangyuan1209/yuan-claw@0.1.14
# 升级
npm install -g @jiangyuan1209/yuan-claw@latest
# 卸载（和npm官方包卸载命令完全一致）
npm uninstall -g @jiangyuan1209/yuan-claw
```

### 2. GitHub Packages（内测版）
需先配置源：`npm config set @jiangyuan1209:registry https://npm.pkg.github.com`
```bash
npm install -g @jiangyuan1209/yuan-claw
# 卸载（和npm官方包卸载命令完全一致）
npm uninstall -g @jiangyuan1209/yuan-claw
```

### 3. 源码构建
```bash
git clone https://github.com/jiangyuan1209/yuan-claw.git
cd yuan-claw && npm install && npm run build
```

## Quick Start

### 1. 初始化配置
首次运行 `yuan-claw` 会自动创建配置文件 `~/.yuan-claw/settings.json`。

### 2. 编辑配置
填入模型 API 信息：
```json
{
  "MODEL_API_KEY": "your_api_key",
  "MODEL_BASE_URL": "https://api.openai.com/v1",
  "MODEL_NAME": "gpt-4o-mini"
}
```
可选配置：`BAIDU_API_KEY`（搜索）、`HTTP_PROXY`（代理）、`STT_MODEL`（Web 端语音识别模型，缺省 `fun-asr-realtime`）、`VISION_MODEL`（Web 端图片 OCR 视觉模型，缺省 `qwen-vl-plus`）。

### 3. 运行
```bash
# 交互式 REPL
yuan-claw

# 单次指令
yuan-claw "帮我搜索 OpenAI 最新消息"

# Web 网页模式
yuan-claw-web
# 或
npm run dev:web
# 打开 http://localhost:3000
```

## Configuration

配置文件路径：`~/.yuan-claw/settings.json`

| 配置项 | 说明 |
| :--- | :--- |
| `MODEL_API_KEY` | 大模型 API Key（同时用作 Web 端语音识别的 DashScope 密钥） |
| `MODEL_BASE_URL` | 兼容 OpenAI 的 API 地址 |
| `MODEL_NAME` | 模型名称 |
| `BAIDU_API_KEY` | 百度搜索 API Key（启用搜索工具） |
| `HTTP_PROXY` | 网络代理地址 |
| `STT_MODEL` | Web 端语音识别模型名，可选，缺省 `fun-asr-realtime` |
| `VISION_MODEL` | Web 端图片识别（OCR）使用的视觉模型名，可选，缺省 `qwen-vl-plus` |

## Usage

### REPL 模式
内置快捷命令：
```txt
/help    展示全部内置命令帮助
/exit    退出REPL终端
/quit    退出REPL终端
/clear   清空当前会话历史，重置工具确认模式
/save    持久保存当前完整会话记录
/reset   将工具确认模式恢复为逐次询问
/status  查看当前会话状态、权限模式
/debug  调试模式，输出中间步骤
```

### 工具确认
执行高危操作（如 Shell 命令）时会请求确认：
- `↑/↓` 选择，`Enter` 确认
- 支持“总是允许”模式（当前会话生效）

### Skills 扩展
在 `~/.yuan-claw/skills/` 下创建文件夹并添加 `SKILL.md` 即可扩展 Agent 能力。
格式：YAML 元数据 + Markdown 正文。

## Web 模式

启动 Web 服务器后，在浏览器中打开 `http://localhost:3000` 即可开始网页对话。

```bash
# 开发模式（使用 tsx 直接运行）
npm run dev:web

# 开发模式（同时启动前端 Vite 开发服务器）
npm run dev:web:ui

# 生产模式（需先构建）
npm run build
npm run build:web:ui
npm run start:web
```

网页端支持：
- 💬 实时对话气泡展示（Ant Design X Bubble）
- 🔧 工具调用状态实时展示
- 📱 响应式布局
- 🔄 多轮对话上下文保持
- 🎙️ 语音输入（浏览器麦克风实时识别）
- 🖼️ 图片附件输入（视觉模型 OCR 识别图片文字）

### 语音输入

Web 端底部输入区内置话筒按钮，可将语音实时转写为文字后发送：

1. 点击**话筒按钮**开始录音，浏览器采集麦克风音频（首次会请求麦克风权限）；
2. 录音过程中，输入框实时显示识别中的文字；
3. 再次点击**话筒按钮**停止录音，最终识别结果会**追加**到输入框已有内容之后（不覆盖、不自动发送）；
4. 可继续手动编辑，确认后点击**发送按钮**（或按 Enter）发送，与文字输入走完全相同的对话链路。

**配置说明：**

- 语音识别使用**阿里云百炼 DashScope 实时语音识别（ASR）**，通过独立的 `/ws/audio` WebSocket 通道传输音频；
- 复用配置中的 `MODEL_API_KEY` 作为鉴权密钥，识别模型由 `STT_MODEL` 指定（缺省 `fun-asr-realtime`）；
- 该密钥需能访问公共端点 `wss://dashscope.aliyuncs.com`（语音识别**不使用** `MODEL_BASE_URL`）。若密钥不被该端点接受，界面会提示 `STT 错误`，但不影响文字对话；
- 浏览器麦克风权限要求安全上下文：`localhost` 或 `https` 页面可用。

### 图片附件输入

Web 端支持通过图片附件上传图片，由视觉模型自动识别图中文字（OCR），识别结果作为附件文字追加到用户输入中，一并发送给大模型进行提问。

1. 点击输入区左侧的**图片按钮**，选择一张或多张图片（也可通过 `Ctrl+V` / `Cmd+V` 直接粘贴剪贴板中的图片）；
2. 选中的图片以缩略图形式预览在输入框上方，可逐个点击关闭按钮移除；
3. 输入文字后点击**发送**（或按 Enter），系统会先调用视觉模型对图片进行 OCR 文字识别；
4. 识别完成后，识别出的文字作为**附件文字**追加到用户输入文字后面，一起发送给大模型；
5. 消息气泡中会展示图片缩略图和附件识别文字区域，方便查看。

**配置说明：**

- 图片识别使用**视觉大模型**（如阿里云 `qwen-vl-plus`）作为 OCR 引擎，通过 OpenAI 兼容的多模态 API 发送图片；
- 复用配置中的 `MODEL_API_KEY` 和 `MODEL_BASE_URL`，视觉模型由 `VISION_MODEL` 指定（缺省 `qwen-vl-plus`）；
- 若未配置 `VISION_MODEL` 或视觉模型不可用，发送图片时会提示错误，但不影响纯文字对话；
- 单次最多支持 5 张图片，每张图片最大 5MB，支持 PNG / JPG / GIF / WebP 格式。

## Development

```bash
npm run dev          # CLI 热更新开发
npm run dev:web      # Web 服务器开发
npm run dev:web:ui   # Web 前端开发服务器
npm run build        # 编译至 dist
npm run start        # 运行编译产物
npm run start:web    # 运行 Web 生产模式
npm run check        # 类型检查
```

## License

木兰宽松许可证，第2版（Mulan PSL v2）。
Copyright (c) 2026 jiangyuan1209
