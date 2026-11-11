# 章节稿格式

工作目录结构：

```text
<book-dir>/
├── book.json      书名、编排、回合表（见 book-config.md）
├── parts.md       各部分开头的操作清单
├── crops.txt      插图裁剪框
├── src/*.md       规则正文，按文件名顺序拼接
├── pages/ hi/     prepare_pdf.py 生成的页面图
├── scan/ img/     “原文”扫描页和裁出的插图
└── out.html       构建结果
```

完整示例见 `assets/example-book/`。

## 标题

```markdown
# 6.0 移动 {p=8}
## 6.4 突破移动 {p=9}
### 6.5.1 特例 {p=9}
# @qr 速查与说明
```

- 一到三级标题分别是章、节、小节，规则号要匹配 `book.json` 的 `rule_number`。
- `{p=8}` 是规则书印刷页码，用于“原文”按钮。没有扫描页时可省略。
- `@id` 开头的标题没有规则号，用于整理者新增的内容，章级标题会显示“整理补充”。规则书没有编号时，所有标题都用 `@id`。

## 引用

| 写法 | 含义 |
|---|---|
| `§6.4` | 链接到规则 6.4，构建时校验目标存在 |
| `§22.9#2` | 规则书里重复编号时，指第二个 22.9 |
| `§@qr` | 链接到 `@qr` 章节，显示其标题 |

## 区块

```markdown
:::note
注意事项。还可以用 except（例外）、key（要点）、explain（说明）、designer（设计师笔记）。
:::

:::example 标题 | img=ex_los
示例说明，图片可以省略。示例默认折叠。
:::

@fig units_hq | 图注
```

二选一的左右对照：

```html
<div class="choice">
<div class="choice-a">

**撤退**

1. 第一步

</div>
<div class="choice-b">

**坚守**

1. 第一步

</div>
</div>
```

## 占位符

单独成段使用，由 `build.py` 替换：

| 占位符 | 内容 |
|---|---|
| `%%TRACK%%` | 回合轨，放在回合流程的控制区 |
| `%%CAL%%` | 回合日历表 |
| `%%INDEX%%` | 规则号索引 |

## 回合流程（可选）

配置了 `turns` 时可以写成可筛选的流程。这段是 HTML，放在章节稿里：

```html
<div class="turn-flow" data-turnflow>
<div class="tf-controls" role="group" aria-label="选择当前回合">%%TRACK%%</div>
<div class="tf-now" id="tf-now" hidden></div>

<div class="tf-seg" data-only="am">
<h3 id="r-5-3-1" data-rule="5.3.1" data-p="6" class="rh rh3"><span class="rn">5.3.1</span> 指挥阶段</h3>
<ol class="tf-steps"><li>步骤（§18.0）。</li></ol>
</div>

<div class="tf-two">
<div class="tf-side tf-a">
<h4>甲方移动阶段</h4>
<ol class="tf-steps">
<li data-strike="night" data-badge="night:夜间不可用">花费空军点数。</li>
</ol>
<p>移动：<span class="cond" data-only="am pm"><b>白天：</b>减半</span><span class="cond" data-only="night"><b>夜间：</b>不变</span>。</p>
</div>
<div class="tf-side tf-b"><h4>乙方移动阶段</h4></div>
</div>
</div>
```

| 属性 | 作用 |
|---|---|
| `data-only="am pm"` | 只在列出的时段显示，取值是 `turns.slots` 的 `id` |
| `data-strike="night"` | 该时段划掉 |
| `data-badge="night:文字;am:文字"` | 该时段附加标注 |
| `class="cond"` | 行内分支，选“不限回合”时显示全部并保留 `<b>` 标签 |
| `data-rule`、`id` | 让流程内的小节也能被 `§5.3.1` 引用，`id` 要写成 `r-5-3-1` 的形式 |

## parts.md

```markdown
=== move
:::phase
1. 检查补给（§18.1）。
2. 移动单位（§6.0）。
:::
```

`===` 后面是 `book.json` 里某部分的 `id`，下面的内容显示在这一部分开头。`:::phase` 是操作清单样式，也可以写普通 Markdown 和表格。

`:::phase` 里的编号列表和回合流程的 `tf-steps` 在页面上可以逐条勾选，换回合时自动清空。所以每一条写成一个可以独立完成的动作，不要把两步并成一条。

## crops.txt

```text
# 名称 PDF页号 x0 y0 x1 y1
ex_los 12 90 1075 863 1565
```

坐标是 `pages/` 下 150dpi 页面图上的像素。注意这里用 PDF 页号，而标题的 `{p=}` 用印刷页码。
