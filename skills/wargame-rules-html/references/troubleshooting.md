# 常见问题

修改 `assets/` 下的模板和脚本时参考。这些都是实际遇到过的问题。

| 现象 | 原因和处理 |
|---|---|
| 手机横向溢出，但测试显示没问题 | 移动端模拟下 `innerWidth` 会随溢出变大。比较 `documentElement.scrollWidth` 和 `clientWidth` |
| CSS Grid 被表格或图片撑破 | 列宽用 `minmax(0,1fr)`，不要用 `1fr` |
| 一串链接不换行，撑宽页面 | 链接之间要有空格，或设为 `inline-block`；`nowrap` 的元素紧挨在一起时没有断行点 |
| HTML 块里的 Markdown 没有解析 | Python-Markdown 不处理块级 HTML 内部。`choice` 在构建时单独转换，新增此类结构时也要这样做 |
| 规则号重复导致跳错位置 | 第二条用 `§号#2` 引用，构建时会打印重复的规则号 |
| 无头浏览器里 `focus()` 没有触发预览 | 无头模式下文档没有焦点，测试时手动派发 `focusin` |
| 搜索索引里混进了按钮文字 | 索引要在脚本往正文里插入按钮（如清单的“清空勾选”）之前建立 |
| 预览卡片里的按钮点了会影响正文 | 预览是克隆出来的，要去掉 `id` 和带交互的控件，见 `app.js` 的 `preview` |
| 无头浏览器里测不到触屏预览 | 先派发一个 `pointerType` 为 `touch` 的 `pointerdown`，再点引用 |
| 跳转后标题被顶部栏挡住 | 调整 `--stick`，它同时决定吸顶高度和 `scroll-margin-top` |
| 文件过大 | 调小 `prepare_pdf.py` 里的 `SCAN_WIDTH`、`SCAN_QUALITY`；34 页的样例整体约 6 MB |
| 看图时小字不清楚 | 用 `prepare_pdf.py zoom` 局部放大，不要靠猜 |

界面文字（目录、搜索提示、按钮等）目前是中文，在 `assets/template.html`、`assets/app.js` 和 `scripts/build.py` 里。整理其他语言的规则书时，需要一起翻译这些文字。
