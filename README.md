# 完整优化后 README.md 全文
修改要点：
1. 重写安装模块，区分 npm 官方（普通用户首选）、GitHub Packages（内测灰度）、源码构建三种渠道，补齐 GH 包安装前置配置与报错解决方案；
2. 全文所有 `your-name` 占位符替换为真实用户名 `jiangyuan1209`；
3. Troubleshooting 新增 GitHub Packages 安装404排错章节；
4. 排版分层更清晰，普通用户优先看到最简单的 npm 安装方式；
5. 统一版本命令，补充场景说明，降低新手疑问。

```md
# yuan-claw

一个基于 **Node.js + TypeScript** 的本地 CLI Agent。  
它可以在命令行中使用大模型完成任务，并按需调用网页搜索、HTTP 抓取、网页正文提取以及本地工具。

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
- 🛠️ 基于 TypeScript，便于二次开发

---

## Requirements

- Node.js >= 20
- npm >= 9

---

## Installation
提供三种安装渠道，按需选择：
1. **npm 官方仓库（推荐普通用户）**：全网公开，无任何额外配置，稳定正式版；
2. **GitHub Packages 仓库（内测/灰度专用）**：存放流水线自动发布的测试新版本，必须配置源才能安装；
3. **源码本地构建（开发者/二次开发）**：适合自定义修改源码场景。

### 方式一：npm 官方仓库（推荐普通用户）
全局安装后可在终端直接调用 `yuan-claw` 命令
```bash
# 安装最新稳定正式版
npm install -g @jiangyuan1209/yuan-claw

# 安装指定固定版本
npm install -g @jiangyuan1209/yuan-claw@0.1.14

# 升级到最新版本
npm install -g @jiangyuan1209/yuan-claw@latest

# 卸载工具
npm uninstall -g @jiangyuan1209/yuan-claw
```

安装完成后直接启动：
```bash
yuan-claw
```

### 方式二：GitHub Packages 仓库（内测灰度新版本）
> 注意：未配置源会直接报 404 Not Found，必须先执行下面配置步骤
#### 前置配置（仅需执行一次，全局生效）
```bash
npm config set @jiangyuan1209:registry https://npm.pkg.github.com
```
如果你只想在当前项目生效，在项目根目录新建 `.npmrc` 文件写入：
```ini
@jiangyuan1209:registry=https://npm.pkg.github.com
```

#### 全局安装内测包
```bash
# 安装最新内测版
npm install -g @jiangyuan1209/yuan-claw

# 指定版本安装
npm install -g @jiangyuan1209/yuan-claw@0.1.14

# 升级内测包
npm install -g @jiangyuan1209/yuan-claw@latest

# 卸载（和npm官方包卸载命令完全一致）
npm uninstall -g @jiangyuan1209/yuan-claw
```

### 方式三：从源码本地构建（开发/二次开发）
```bash
# 克隆官方仓库
git clone https://github.com/jiangyuan1209/yuan-claw.git
cd yuan-claw
# 安装项目依赖
npm install
# 编译TypeScript产物至dist目录
npm run build
```

#### 源码模式运行
开发热更新模式（实时修改生效）：
```bash
npm run dev
```
编译后生产模式运行：
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

完整配置示例：

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

最小可用配置（仅基础大模型对话）：
```json
{
  "MODEL_API_KEY": "your_api_key",
  "MODEL_BASE_URL": "https://api.openai.com/v1",
  "MODEL_NAME": "gpt-4o-mini"
}
```

如需启用网页搜索，补充百度搜索密钥：
```json
{
  "BAIDU_API_KEY": "your_baidu_search_api_key"
}
```

如需网络代理，补充代理地址：
```json
{
  "HTTP_PROXY": "http://127.0.0.1:33210",
  "HTTPS_PROXY": "http://127.0.0.1:33210"
}
```

保存配置文件后，重新执行命令启动：
```bash
yuan-claw
```

---

### 3. 开始使用

#### 交互式 REPL 多轮对话
```bash
yuan-claw
```

#### 单次指令一次性执行
```bash
yuan-claw "帮我搜索 OpenAI 最新消息"
```

---

## Configuration

项目固定读取用户目录全局配置文件：
```bash
~/.yuan-claw/settings.json
```

### 支持的全部配置项
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

### 推荐配置模板
#### OpenAI 兼容接口通用模板
```json
{
  "MODEL_API_KEY": "your_api_key",
  "MODEL_BASE_URL": "https://api.openai.com/v1",
  "MODEL_NAME": "gpt-4o-mini"
}
```

#### 阿里通义千问 DashScope 模板
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

项目已不再通过 `.env` 加载配置，所有运行配置统一由 `~/.yuan-claw/settings.json` 管理。

如果你仍习惯使用 `.env` 文件，仅源码开发调试场景可自行引入 dotenv，普通 CLI 用户不推荐。

> 普通终端用户标准配置方式：
> ```bash
> ~/.yuan-claw/settings.json
> ```
> `.env` 仅适用于本地源码开发调试。

---

## REPL Usage

不传入指令参数时，程序自动进入交互式 REPL 模式，支持连续多轮对话：
```txt
yuan-claw[ask]> 帮我总结这个项目
yuan-claw[ask]> 再精简输出
yuan-claw[ask]> 整理成要点清单
```

内置快捷命令：
```txt
/help    展示全部内置命令帮助
/exit    退出REPL终端
/quit    退出REPL终端
/clear   清空当前会话历史，重置工具确认模式
/save    持久保存当前完整会话记录
/reset   将工具确认模式恢复为逐次询问
/status  查看当前会话状态、权限模式
```

---

## Approval / 工具执行权限确认

部分高危本地工具执行前会弹出确认弹窗（例如终端命令读写文件）：
```txt
我需要执行 `pwd` 命令获取当前目录，是否允许运行？
```

操作快捷键：
- `↑ / ↓`：切换选项
- `Enter`：确认选中项
- `Ctrl+C`：拒绝执行并终止当前任务

可选权限模式：
- **不允许**：本次拒绝该工具执行
- **允许**：仅本次会话单次放行
- **总是允许**：当前会话后续同类工具自动放行，提示符变为 `yuan-claw[always]>`

如需恢复逐次确认模式，执行内置命令：
```txt
/reset
```

---

## CLI Usage

全局安装后直接启动：
```bash
yuan-claw
```

单次指令模式：
```bash
yuan-claw "帮我搜索今日AI行业新闻"
```

源码开发环境运行：
```bash
# 热更新开发模式
npm run dev
# 单次指令开发调试
npm run dev -- "帮我梳理项目功能清单"
```

编译后生产运行：
```bash
npm run build
npm run start
```

---

## Web Search 网页搜索能力

如需开启联网搜索工具，在全局配置文件填入百度搜索密钥：
```json
{
  "BAIDU_API_KEY": "your_baidu_search_api_key"
}
```
未配置密钥时，`web_search` 工具会自动禁用。

---

## Proxy 网络代理配置

访问境外模型/网页抓取需要代理时，写入配置文件：
```json
{
  "HTTP_PROXY": "http://127.0.0.1:33210",
  "HTTPS_PROXY": "http://127.0.0.1:33210"
}
```

程序自动识别以下大小写代理配置字段：
- `HTTP_PROXY`
- `HTTPS_PROXY`
- `http_proxy`
- `https_proxy`

---

## Skills / 本地自定义技能插件扩展

yuan-claw 支持本地 Markdown 技能文件扩展 Agent 领域能力，运行时自动匹配用户需求注入提示词。

### Skill 存放目录
所有自定义技能统一存放在用户目录：
```bash
~/.yuan-claw/skills/
```

目录规范：每个技能独立文件夹，内部必须包含 `SKILL.md`
```
~/.yuan-claw/skills/
├── pdf/
│   └── SKILL.md
├── frontend-design/
│   └── SKILL.md
└── my-custom-skill/
    └── SKILL.md
```

### SKILL.md 文件格式
采用 YAML 头部元数据 + Markdown 正文格式：
```markdown
---
name: pdf
description: PDF文档处理技能，支持文本提取、表格解析、扫描件OCR识别
tags: [pdf, document, ocr, file]
license: MIT
version: 1.0.0
---

## 使用指引
用户提出PDF相关需求时严格遵循以下流程：
1. 使用pdfplumber提取PDF内文字与表格；
2. 扫描图片类PDF自动调用OCR文字识别；
3. 整理提取内容并精简输出总结。
```

元数据字段说明：
- `name`（可选）：技能名称，无配置则使用文件夹名
- `description`（可选）：简短功能描述，用于关键词匹配
- `tags`（可选）：标签数组，提升用户输入匹配命中率
- `license`（可选）：开源协议声明
- `version`（可选）：技能版本号

Markdown 正文会作为系统提示词注入大模型，指导Agent对应领域执行逻辑。

### 技能匹配规则
运行时自动匹配最多3个关联技能，匹配权重：
1. 用户输入包含技能名称
2. 用户输入命中技能标签
3. 用户输入关键词与技能描述语义重合

### 添加自定义技能步骤
1. 创建技能文件夹
```bash
mkdir -p ~/.yuan-claw/skills/my-skill
```
2. 写入SKILL.md技能文件
```bash
cat > ~/.yuan-claw/skills/my-skill/SKILL.md << 'EOF'
---
name: my-skill
description: 自定义业务处理技能
tags: [custom, business]
---
用户询问业务相关内容时，按标准化流程输出回答。
EOF
```
3. 重启 `yuan-claw` 自动加载新技能。

---

## Package Scripts
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

脚本功能说明：
- `npm run dev`：源码热更新开发模式运行CLI
- `npm run build`：编译TypeScript代码至dist生产目录
- `npm run start`：执行编译后的成品CLI程序
- `npm run check`：仅执行TS类型校验，不编译输出产物

参数传递规则：
- 无追加参数：直接进入REPL多轮对话
- 追加字符串参数：单次执行指令后退出

---

## Examples 使用示例
### 基础问答
```bash
yuan-claw "帮我总结本项目全部功能"
```

### 联网搜索资讯
```bash
yuan-claw "搜索2026最新大模型行业资讯"
```

### 进入交互式多轮对话
```bash
yuan-claw
```

### 源码开发调试
```bash
npm run dev
```

### 编译成品单次指令运行
```bash
npm run build
npm run start -- "搜索前端AI工具最新开源项目"
```

---

## Troubleshooting 常见问题排错
### 1. 首次运行配置文件不生效
初次执行 `yuan-claw` 仅生成空白配置文件 `~/.yuan-claw/settings.json`，**必须手动填入模型密钥后重启程序**，配置才会加载生效。

### 2. 报错 `Missing MODEL_API_KEY / OPENAI_API_KEY`
未填写大模型API密钥，打开全局配置文件补充：
```json
{
  "MODEL_API_KEY": "你的模型密钥"
}
```

### 3. 提示 `web_search disabled: set BAIDU_API_KEY`
未配置百度搜索密钥，无法调用联网搜索工具，补充配置：
```json
{
  "BAIDU_API_KEY": "你的百度搜索密钥"
}
```

### 4. 请求模型超时/无法连接境外接口
需要配置网络代理，写入代理地址至配置文件：
```json
{
  "HTTP_PROXY": "http://127.0.0.1:33210",
  "HTTPS_PROXY": "http://127.0.0.1:33210"
}
```

### 5. 网页抓取返回 403 Forbidden
目标网站存在反爬拦截策略，属于站点限制，建议优先使用内置web_search搜索工具获取公开内容。

### 6. `npm run start` 运行报错
执行前必须先编译生成dist产物：
```bash
npm run build
```
`start` 脚本依赖编译输出 `dist/cli/main.js` 文件。

### 7. 全局终端输入 `yuan-claw` 提示命令不存在
全局安装未成功，重装官方npm包：
```bash
npm uninstall -g @jiangyuan1209/yuan-claw
npm install -g @jiangyuan1209/yuan-claw@latest
```

### 8. 安装 GitHub Packages 包提示 404 Not Found
未配置scope源，执行全局源配置命令后重新安装：
```bash
npm config set @jiangyuan1209:registry https://npm.pkg.github.com
```

---

## Development
```bash
# 安装全部依赖
npm install
# 全量TS类型检查
npm run check
# 热更新开发运行
npm run dev
```

---
## License

yuan-claw 采用 **木兰宽松许可证，第2版（Mulan PSL v2）** 开源。

完整许可证文本见仓库根目录 `LICENSE` 文件，也可在线查阅官方原版：
http://license.coscl.org.cn/MulanPSL2

### 版权声明
Copyright (c) 2026 jiangyuan1209
yuan-claw is licensed under Mulan PSL v2.
You can use this software according to the terms and conditions of the Mulan PSL v2.
You may obtain a copy of Mulan PSL v2 at:
http://license.coscl.org.cn/MulanPSL2
THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
See the Mulan PSL v2 for more details.