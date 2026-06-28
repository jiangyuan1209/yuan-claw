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
可选配置：`BAIDU_API_KEY`（搜索）、`HTTP_PROXY`（代理）。

### 3. 运行
```bash
# 交互式 REPL
yuan-claw

# 单次指令
yuan-claw "帮我搜索 OpenAI 最新消息"
```

## Configuration

配置文件路径：`~/.yuan-claw/settings.json`

| 配置项 | 说明 |
| :--- | :--- |
| `MODEL_API_KEY` | 大模型 API Key |
| `MODEL_BASE_URL` | 兼容 OpenAI 的 API 地址 |
| `MODEL_NAME` | 模型名称 |
| `BAIDU_API_KEY` | 百度搜索 API Key（启用搜索工具） |
| `HTTP_PROXY` | 网络代理地址 |

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

## Development

```bash
npm run dev    # 热更新开发
npm run build  # 编译至 dist
npm run start  # 运行编译产物
npm run check  # 类型检查
```

## License

木兰宽松许可证，第2版（Mulan PSL v2）。
Copyright (c) 2026 jiangyuan1209
