#!/bin/zsh
set -euo pipefail

echo "====================================="
echo "📦 发布包到 GitHub Packages 私有包仓库"
echo "====================================="

# 指定GitHub包源发布
npm publish --registry=https://npm.pkg.github.com --access public

echo -e "\n✅ 发布 GitHub Packages 完成！"
echo "如需发布 npm 官方仓库，请执行 npm run publish:npm"