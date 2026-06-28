#!/bin/zsh
set -euo pipefail

echo "====================================="
echo "  一键发布 @jiangyuan1209/yuan-claw 到 npmjs.org"
echo "====================================="

# 登陆
npm login --registry=https://registry.npmjs.org/

# 更新版本
npm version patch
# 构建
npm run build
# 发布
npm publish --registry=https://registry.npmjs.org --access public

echo "✅ 发布到 npm 官方仓库完成"
echo "👉 如需发布 GitHub Packages，执行：npm publish --registry=https://npm.pkg.github.com --access public"