# book.json

```json
{
  "title": "渡河之战",
  "eyebrow": "THE RIVER CROSSING",
  "hero": "封面下的一段说明",
  "storage_key": "river-crossing",
  "page_offset": 1,
  "last_printed_page": 32,
  "rule_number": "\\d+\\.\\d+(?:\\.\\d+)*",
  "aliases": [["ZOC", "控制区", "Zone of Control"]],
  "fonts": {"display": "auto"},
  "parts": [],
  "turns": {}
}
```

| 字段 | 说明 |
|---|---|
| `title` | 必填，书名 |
| `eyebrow` | 书名上方的小字 |
| `hero` | 封面说明，应告诉读者规则做过改写、如何核对原文 |
| `storage_key` | 浏览器存储键的前缀，每本书不同，避免互相覆盖 |
| `page_offset` | PDF 页号减印刷页码。封面占一页而正文从第 1 页编起时为 1 |
| `first_printed_page`、`last_printed_page` | “原文”查看器可翻到的范围 |
| `rule_number` | 规则号的正则。规则书用 `A1.2` 时可写 `[A-Z]\\d+(?:\\.\\d+)*` |
| `aliases` | 搜索别名。每组是几个互为同义的词，搜其中一个也会找到写着另外几个的规则。收录原文术语、缩写和玩家的习惯叫法 |
| `fonts.display` | 标题字体。`"auto"`（默认）在本机查找思源宋体 Bold；也可以写字体文件路径（相对于工作目录），或写 `false` 不内嵌。只用 SIL OFL 等允许随文件分发的字体，系统自带的商业字体（宋体、华文宋体、Songti）不要内嵌。子集缓存在 `<book-dir>/.cache/fonts/` |
| `parts` | 编排，省略时全部章节放在一个部分 |
| `turns` | 回合表，省略时不生成回合轨和日历 |

## parts

```json
{
  "id": "combat",
  "short": "战斗",
  "title": "战斗阶段",
  "sub": "火力支援 → 地面突击 → 撤退与推进",
  "color": "#a32237",
  "items": [
    "@combat-card",
    "13.0",
    {"ref": "22.5", "hex": "夜间签"},
    {"ref": "22.6", "hex": false},
    {"ref": "22.9#2", "hex": "燃料短缺", "num": "22.9"}
  ]
}
```

- `short` 显示在顶部阶段栏，`title` 是这一部分的大标题，`color` 省略时使用内置配色。阶段色用在扉页的六角徽章和顶线、首页地图上的算子、章号边框和顶栏的当前阶段标记上。徽章和算子是实色配白字，自定义 `color` 要选够深的颜色，各部分的颜色明度也尽量接近。
- 部分有两项以上内容时，扉页标题下会列出本部分的章节，作为这一部分的目录。
- `items` 按显示顺序排列。写章的规则号会带上它的全部小节；写节的规则号会把这一节从原章节移过来，并在原位置留一行跳转提示。
- 每个章都必须出现在某个部分里，否则构建报错。
- 首页六角格：默认使用章节标题，超过 6 个字会有警告，用 `hex` 缩短；`"hex": false` 表示不显示；`num` 覆盖格内的编号。

## turns

```json
{
  "group_header": "日期",
  "slot_header": "时段",
  "groups": ["5/12", "5/13"],
  "slots": [
    {"id": "am", "tag": "AM", "label": "AM"},
    {"id": "pm", "tag": "PM", "label": "PM"},
    {"id": "night", "tag": "夜", "label": "夜间", "dark": true}
  ],
  "columns": [
    {"id": "a", "label": "甲方"},
    {"id": "b", "label": "乙方"},
    {"id": "note", "label": "提醒"}
  ],
  "events": {
    "1": {"a": ["增援从 A 区进场（§22.6）"], "note": ["从本回合开始……"]}
  }
}
```

总回合数等于 `groups` 数乘 `slots` 数。没有时段的游戏只写一个 slot，例如 `{"id": "turn"}`，把回合按周、季度或每几回合分组放进 `groups`。

事件文字里的 `§` 引用会自动变成链接。日历是从规则条文汇总来的，要逐条对照规则书核对，并注明来源。
