# 项目概览

这是一个基于 TypeScript 的命令行代理项目（`my-agent`，版本 0.1.0），旨在利用 OpenAI API 提供智能交互能力。

## 技术栈

- **语言**：TypeScript（目标 ECMAScript 2022）
- **运行时**：Node.js（使用 `NodeNext` 模块系统）
- **核心依赖**：
  - `openai`：用于与 OpenAI API 通信
  - `zod`：用于运行时类型验证和数据解析
- **开发依赖**：
  - `tsx`：支持直接运行 TypeScript 文件
  - `typescript`：编译器
  - `@types/node`：Node.js 类型定义

## 项目结构

- 源代码位于 `src/` 目录
- 编译后的输出位于 `dist/` 目录

## 常用脚本

- `npm run dev`：使用 `tsx` 直接运行开发版本（`src/cli/main.ts`）
- `npm run build`：编译 TypeScript 代码到 `dist/`
- `npm run start`：运行编译后的生产版本（`dist/cli/main.js`）

项目配置启用了严格的类型检查，并跳过对库文件的类型检查以提升编译速度。