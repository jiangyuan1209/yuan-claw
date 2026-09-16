# Skill 依赖安装备忘录

> 本文档列出了 `~/.yuan-claw/skills/` 下各 Skill 配套脚本所依赖的 Python 包、系统工具和 npm 包。
> 当前系统（macOS）缺少以下所有依赖，需要手动安装后 Skill 脚本才能正常工作。

---

## 一键安装

复制以下命令一次性安装所有依赖：

```bash
# 1. 系统工具（通过 Homebrew）
brew install tesseract poppler
brew install --cask libreoffice

# 2. Python 包
pip3 install pypdf pdfplumber pytesseract pdf2image reportlab \
  openpyxl pandas pillow imageio numpy playwright \
  python-docx python-pptx

# 3. Playwright 浏览器（webapp-testing 需要）
python3 -m playwright install

# 4. npm 包（全局安装）
npm install -g docx exceljs
```

---

## 详细依赖清单

### 系统工具

| 工具 | 命令名 | 依赖它的 Skill | 安装命令 |
|------|--------|---------------|---------|
| LibreOffice | `soffice` | pdf, xlsx, docx, pptx | `brew install --cask libreoffice` |
| Tesseract | `tesseract` | pdf（OCR 功能） | `brew install tesseract` |
| Poppler | `pdftoppm`, `pdftotext` | pdf（PDF 转图片） | `brew install poppler` |

### Python 包

| 包名 | 依赖它的 Skill | 用途 | 安装命令 |
|------|---------------|------|---------|
| `pypdf` | pdf | PDF 读写/合并/拆分/旋转/加密 | `pip3 install pypdf` |
| `pdfplumber` | pdf | PDF 文本和表格提取（保留布局） | `pip3 install pdfplumber` |
| `pytesseract` | pdf | OCR 文字识别 | `pip3 install pytesseract` |
| `pdf2image` | pdf | PDF 渲染为图片（依赖 Poppler） | `pip3 install pdf2image` |
| `reportlab` | pdf | 从零创建 PDF 文件 | `pip3 install reportlab` |
| `openpyxl` | xlsx | 读写 Excel 文件（公式/格式） | `pip3 install openpyxl` |
| `pandas` | xlsx | 数据分析和处理 | `pip3 install pandas` |
| `pillow` | pdf, slack-gif-creator | 图像处理 | `pip3 install pillow` |
| `imageio` | slack-gif-creator | 动画 GIF 编码 | `pip3 install imageio` |
| `numpy` | slack-gif-creator 等 | 数值计算 | `pip3 install numpy` |
| `playwright` | webapp-testing | 浏览器自动化测试 | `pip3 install playwright` |
| `python-docx` | docx | 读写 Word 文档 | `pip3 install python-docx` |
| `python-pptx` | pptx | 读写 PowerPoint 文件 | `pip3 install python-pptx` |

### npm 包

| 包名 | 依赖它的 Skill | 用途 | 安装命令 |
|------|---------------|------|---------|
| `docx` | docx | 通过 Node.js 创建 Word 文档 | `npm install -g docx` |
| `exceljs` | xlsx | Excel 文件处理 | `npm install -g exceljs` |
| `pptxgenjs` | pptx | 从零创建 PPT（✅ 已安装 v4.0.1） | — |

### Skill 自带的 requirements.txt

| 文件路径 | 内容 |
|---------|------|
| `~/.yuan-claw/skills/slack-gif-creator/requirements.txt` | `pillow>=10.0.0, imageio>=2.31.0, imageio-ffmpeg>=0.4.9, numpy>=1.24.0` |
| `~/.yuan-claw/skills/mcp-builder/scripts/requirements.txt` | `anthropic>=0.39.0, mcp>=1.1.0` |

如需按 Skill 独立安装，也可以进入对应目录执行 `pip3 install -r requirements.txt`。

---

## 当前系统环境

| 组件 | 状态 | 版本 |
|------|------|------|
| Python 3 | ✅ 已安装 | 3.11.9 |
| Node.js | ✅ 已安装 | v25.1.0 (nvm) |
| npm | ✅ 已安装 | 11.6.2 |
| Homebrew | ✅ 已安装 | 6.0.22 |
| pip | ✅ 已安装 | 24.0 |
| pptxgenjs | ✅ 已安装 | v4.0.1（全局） |
| 其他 Python 包 | ❌ 全部缺失 | — |
| LibreOffice | ❌ 未安装 | — |
| Tesseract | ❌ 未安装 | — |
| Poppler | ❌ 未安装 | — |

---

## 安装后验证

安装完成后，运行以下命令验证：

```bash
# 验证系统工具
soffice --version
tesseract --version
pdftoppm -v 2>&1

# 验证 Python 包
python3 -c "import pypdf; import pdfplumber; import reportlab; print('PDF tools OK')"
python3 -c "import openpyxl; import pandas; print('Excel tools OK')"
python3 -c "import PIL; import imageio; import numpy; print('Image tools Ok')"
python3 -c "import docx; import pptx; print('Office tools OK')"
python3 -c "from playwright.sync_api import sync_playwright; print('Playwright Ok')"

# 验证 npm 包
node -e "require('docx'); console.log('docx Ok')"
node -e "require('exceljs'); console.log('exceljs Ok')"
node -e "require('pptxgenjs'); console.log('pptxgenjs Ok')"
```
