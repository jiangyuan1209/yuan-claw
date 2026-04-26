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