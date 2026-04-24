# 项目摘要

这是一个名为 **my-agent** 的 Node.js 项目，当前版本为 **0.1.0**，使用 ES 模块（`type: module`）。

## 脚本命令
- `dev`: 使用 `tsx` 运行开发环境入口 `src/cli/main.ts`
- `build`: 使用 TypeScript 编译器构建项目
- `start`: 启动编译后的应用 `dist/cli/main.js`

## 依赖项
- **生产依赖**：
  - `openai@^4.56.0`
  - `zod@^3.23.8`

- **开发依赖**：
  - `@types/node@^22.7.4`
  - `tsx@^4.19.1`
  - `typescript@^5.6.2`

该项目可能是一个基于 OpenAI API 和 Zod 验证的命令行工具。