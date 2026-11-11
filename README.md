# wargame-rules-html

一个 Agent Skill，让 AI 编程助手把兵棋、桌游的规则书（扫描版或文字版 PDF）整理成单文件、可离线打开、便于对局查阅的 HTML。

## 生成的页面

- **按对局顺序编排**：开局、回合流程、各行动阶段、回合结束、参考资料。规则号保持原书编号，方便和纸质规则对照。
- **回合选择和日历**：选中当前回合，只显示这一回合适用的步骤，并列出增援和事件。顶栏可以直接推进到下一回合。
- **阶段清单和速查卡**：每个阶段的操作步骤可以逐条勾选，换回合时清空；以及结算时常查的数值。
- **规则互链**：`§6.4` 悬停预览内容，手机上点一下从底部弹出预览。跳转后有“返回”按钮回到原处。
- **搜索和索引**：按 `/` 或 Ctrl+K 呼出搜索面板，按关键词、别名或原书规则号查找，方向键选择。
- **原文对照**：每节都能打开对应的扫描页。
- **阅读适配**：手机版、深色模式、打印。

## 安装

`skills/wargame-rules-html/` 是一个标准的 Agent Skill 目录（`SKILL.md` 加脚本和资源），不依赖特定的 AI 工具：

- **支持 Agent Skills 的工具**：把这个目录复制到该工具的 skills 目录。
- **其他工具**：让 AI 读取 `skills/wargame-rules-html/SKILL.md` 并按其中的流程执行。

助手需要能运行命令行和查看图片。如果看不了图片，只能退回 OCR，转录结果需要更严格的人工校对。

## 依赖

```bash
pip install markdown Pillow
# 另需 poppler-utils（提供 pdfinfo、pdftotext、pdftoppm）
# 浏览器检查需要 Node 22+ 和 Chrome/Chromium，可选
```

## 使用

对助手说：

> 用 wargame-rules-html 把 `xxx.pdf` 整理成 HTML。先体检 PDF，告诉我方案，确认后再开始。

## 试运行

用内置的虚构示例，不需要 PDF：

```bash
cd skills/wargame-rules-html
python3 scripts/build.py assets/example-book -o /tmp/example.html
node scripts/check.mjs /tmp/example.html /tmp/example-shots
```

## 版权

本仓库只包含工具和一本虚构的示例规则书，不包含任何商业规则书的内容。规则书通常受版权保护，生成的页面请留作个人使用，公开发布前请确认自己有权这样做。

## 局限

- 转录和改写由 AI 完成。自动校验只能证明链接和结构正确，不能证明规则文字正确，重要规则请对照原文。
- 界面文字目前是中文。整理其他语言的规则书时，需要修改 `assets/` 和 `scripts/build.py` 中的界面文字。
