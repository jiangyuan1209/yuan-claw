#!/bin/zsh
set -euo pipefail

echo "====================================="
echo "  一键发布 @jiangyuan1209/yuan-claw 到 npmjs.org"
echo "====================================="

# 检查是否已有 auth token，有则跳过 login
if npm whoami --registry=https://registry.npmjs.org/ &>/dev/null; then
    echo "✅ 已登录为: $(npm whoami --registry=https://registry.npmjs.org/)"
else
    echo "未检测到有效登录，执行 npm login..."
    npm login --registry=https://registry.npmjs.org/
fi

# 更新版本
npm version patch
# 构建
npm run build
# 发布
npm publish --registry=https://registry.npmjs.org --access public

echo "✅ 发布到 npm 官方仓库完成"
echo "👉 如需发布 GitHub Packages，执行：npm publish --registry=https://npm.pkg.github.com --access public"