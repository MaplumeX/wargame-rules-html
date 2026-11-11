#!/usr/bin/env python3
"""把规则书工作目录合成为单文件 HTML。

用法：python3 build.py <book-dir> [-o 输出.html]

工作目录的结构和各文件的格式见 references/source-format.md、references/book-config.md。
校验失败（引用缺失、章节未编排、残留标记）时以非 0 状态退出。
"""
import argparse
import base64
import glob
import html
import json
import math
import os
import re
import sys

try:
    import markdown
except ImportError:
    sys.exit('缺少 Python 包 markdown，请先运行：pip install markdown')

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, '..', 'assets')
sys.path.insert(0, HERE)
from fonts import find_display_font, subset_display_font  # noqa: E402

# 阶段配色：明度相近、都够深，配白字时对比度足够，放在一起也协调
PALETTE = ['#7a6743', '#4a5670', '#4e6b45', '#1d6b75', '#a32237', '#6a4f6e', '#8a5a32', '#5a6478']
LABEL = {'note': '注意', 'except': '例外', 'key': '要点', 'explain': '说明', 'designer': '设计师笔记'}

ap = argparse.ArgumentParser(description='构建规则书 HTML')
ap.add_argument('book_dir')
ap.add_argument('-o', '--output')
args = ap.parse_args()
B = os.path.abspath(args.book_dir)
OUT = args.output or os.path.join(B, 'out.html')
book = json.load(open(os.path.join(B, 'book.json'), encoding='utf8'))
NUM = book.get('rule_number', r'\d+\.\d+(?:\.\d+)*')

sources = sorted(glob.glob(os.path.join(B, 'src', '*.md')))
if not sources:
    sys.exit(f'{B}/src 下没有 .md 文件')
src = ''.join(open(f, encoding='utf8').read() + '\n\n' for f in sources)
size_file = os.path.join(B, 'img', 'sizes.json')
sizes = json.load(open(size_file)) if os.path.exists(size_file) else {}
used_imgs = set()
scan_files = sorted(glob.glob(os.path.join(B, 'scan', '*.webp')), key=lambda f: int(os.path.basename(f)[:-5]))
has_scans = bool(scan_files)
errors, warnings = [], []


NUM_CHARS = r'[\d\s+\-–—−×/.:,%≤≥<>±~～()]'
NUM_CELL = re.compile(rf'{NUM_CHARS}*\d{NUM_CHARS}*|[—–\-]')
CELL = re.compile(r'<(t[hd])([^>]*)>(.*?)</\1>', re.S)


def mark_numeric(tbl):
    """整列都是数字、骰点、修正值的列加 class="nm"，用数字字体居中排。"""
    grid = [CELL.findall(r) for r in re.findall(r'<tr>(.*?)</tr>', tbl, flags=re.S)]
    body = [g for g in grid if g and g[0][0] == 'td']
    numeric = set()
    for c in range(max((len(g) for g in grid), default=0)):
        vals = [v for v in (re.sub(r'<[^>]+>', '', g[c][2]).strip() for g in body if c < len(g)) if v]
        if vals and all(NUM_CELL.fullmatch(v) for v in vals) and any(re.search(r'\d', v) for v in vals):
            numeric.add(c)
    if not numeric:
        return tbl

    def row(m):
        col = iter(range(10 ** 6))

        def cell(c):
            cls = ' class="nm"' if next(col) in numeric else ''
            return f'<{c[1]}{cls}{c[2]}>{c[3]}</{c[1]}>'
        return '<tr>' + CELL.sub(cell, m[1]) + '</tr>'
    return re.sub(r'<tr>(.*?)</tr>', row, tbl, flags=re.S)


def md(t):
    h = markdown.markdown(t, extensions=['tables', 'sane_lists'])
    return re.sub(r'<table>(.*?)</table>', lambda m: f'<div class="tw"><table>{mark_numeric(m[1])}</table></div>', h, flags=re.S)


def img_tag(name, alt):
    if name not in sizes:
        errors.append(f'引用了不存在的图片：{name}')
        return ''
    used_imgs.add(name)
    b = base64.b64encode(open(os.path.join(B, 'img', f'{name}.webp'), 'rb').read()).decode()
    w, h = sizes[name]
    return f'<img src="data:image/webp;base64,{b}" width="{w}" height="{h}" alt="{html.escape(alt, quote=True)}" loading="lazy" decoding="async">'


def render_block(text):
    text = re.sub(r'<div class="choice-[ab]">\n(.*?)\n</div>', lambda m: '<div>' + md(m[1]).replace('\n\n', '\n') + '</div>', text, flags=re.S)
    out, buf, lines, i = [], [], text.split('\n'), 0

    def flush():
        nonlocal buf
        if ''.join(buf).strip():
            out.append(md('\n'.join(buf)))
        buf = []

    while i < len(lines):
        line = lines[i]
        m = re.match(r'^:::(\w+)\s*(.*)$', line)
        f = re.match(r'^@fig ([\w-]+) \| (.*)$', line)
        if m:
            flush()
            kind, rest, body = m[1], m[2], []
            i += 1
            while i < len(lines) and lines[i].strip() != ':::':
                body.append(lines[i])
                i += 1
            inner = md('\n'.join(body))
            if kind == 'example':
                title, _, img = rest.partition('|')
                title, img = title.strip(), img.strip().removeprefix('img=')
                if img and img in sizes:
                    w, h = sizes[img]
                    cls = 'ex-b wide' if w / h > 1.5 else 'ex-b'
                    content = f'<div>{img_tag(img, "示例图：" + title)}</div><div>{inner}</div>'
                elif img:
                    errors.append(f'示例“{title}”引用了不存在的图片：{img}')
                    cls, content = 'ex-b wide', f'<div>{inner}</div>'
                else:
                    cls, content = 'ex-b wide', f'<div>{inner}</div>'
                out.append(f'<details class="ex"><summary>{html.escape(title)}</summary><div class="{cls}">{content}</div></details>')
            elif kind == 'phase':
                out.append(f'<div class="phase-card">{inner}</div>')
            elif kind in LABEL:
                out.append(f'<div class="call {kind}"><span class="lb">{LABEL[kind]}</span>{inner}</div>')
            else:
                errors.append(f'未知的区块类型：:::{kind}')
        elif f:
            flush()
            out.append(f'<figure>{img_tag(f[1], f[2])}<figcaption>{f[2]}</figcaption></figure>')
        else:
            buf.append(line)
        i += 1
    flush()
    return '\n'.join(out)


class Node:
    def __init__(self, lv, rid_, num, title, p):
        self.lv, self.id, self.num, self.title, self.p, self.text, self.kids = lv, rid_, num, title, p, [], []


def base_id(num):
    return 'r-' + re.sub(r'[^0-9A-Za-z]+', '-', num).strip('-')


def rid(tok):
    """规则号或 @id 转成页面 id；同号的第 n 条写作 号#n。"""
    if tok.startswith('@'):
        return tok[1:]
    num, _, nth = tok.partition('#')
    return base_id(num) + (f'-{nth}' if nth else '')


heads = re.compile(r'^(#{1,3}) (\S+) (.+?)(?: \{p=(\d+)\})?$')
tree, stack, nodes, dups, seen_count = [], [], {}, [], {}
cur = None
in_fence = False
for line in src.split('\n'):
    if line.startswith('```'):
        in_fence = not in_fence
    m = None if in_fence else heads.match(line)
    if not m:
        if cur is not None:
            cur.text.append(line)
        continue
    lv, tok = len(m[1]), m[2]
    if tok.startswith('@'):
        r, num = tok[1:], ''
    elif re.fullmatch(NUM, tok):
        num = tok
        seen_count[num] = seen_count.get(num, 0) + 1
        r = base_id(num) + (f'-{seen_count[num]}' if seen_count[num] > 1 else '')
        if seen_count[num] > 1:
            dups.append(num)
    else:
        sys.exit(f'标题缺少规则号或 @id：{line}\n（规则号的正则是 {NUM}，可在 book.json 的 rule_number 中修改）')
    n = Node(lv, r, num, m[3], int(m[4] or 0))
    nodes[r] = n
    while stack and stack[-1].lv >= lv:
        stack.pop()
    (stack[-1].kids if stack else tree).append(n)
    stack.append(n)
    cur = n

known = set(nodes)
for r in re.findall(r'data-rule="([^"]+)"', src):
    known.add(base_id(r))

# 编排
parts_src = {}
pf = os.path.join(B, 'parts.md')
if os.path.exists(pf):
    for block in re.split(r'^=== ', open(pf, encoding='utf8').read(), flags=re.M)[1:]:
        head, _, rest = block.partition('\n')
        parts_src[head.strip()] = rest

LAYOUT = book.get('parts')
if not LAYOUT:
    LAYOUT = [{'id': 'all', 'short': '规则', 'title': '规则', 'items': [(c.num or '@' + c.id) for c in tree]}]
for i, p in enumerate(LAYOUT):
    p.setdefault('color', PALETTE[i % len(PALETTE)])
    p.setdefault('short', p['title'])
    p['items'] = [({'ref': it} if isinstance(it, str) else it) for it in p['items']]

part_of, claimed = {}, set()
for p in LAYOUT:
    for it in p['items']:
        r = rid(it['ref'])
        if r not in nodes:
            errors.append(f'book.json 引用了不存在的章节：{it["ref"]}')
            continue
        if r in part_of:
            errors.append(f'章节重复编排：{it["ref"]}')
        part_of[r] = p
        if nodes[r].lv > 1:
            claimed.add(r)
for c in tree:
    if c.id not in part_of:
        errors.append(f'章节没有放进任何部分：{c.num or c.id} {c.title}')

missing = []


def linkify(h):
    def rep(m):
        tok, nth = m[1], m[2] or ''
        r = rid(tok + nth)
        if r not in known:
            missing.append(tok + nth)
            return m[0]
        text = html.escape(nodes[r].title) if tok.startswith('@') else f'§{tok}'
        return f'<a class="xref" href="#{r}">{text}</a>'
    return re.sub(rf'§(@[\w-]+|{NUM})(#\d+)?(?![\w.])', rep, h)


def render(n, top=False):
    tag = f'h{n.lv}'
    cls = 'ch' if n.lv == 1 else 'rh'
    rn = f'<span class="rn">{n.num}</span>' if n.num else ''
    src_btn = f'<button type="button" class="src" data-p="{n.p}" aria-label="查看原规则书第 {n.p} 页">原文 P.{n.p}</button>' if (n.p and has_scans) else ''
    extra = '<span class="tag">整理补充</span>' if (n.lv == 1 and not n.num) else ''
    label = html.escape(((n.num + ' ') if n.num else '') + n.title, quote=True)
    body_html = render_block('\n'.join(n.text))
    kids = ''
    for k in n.kids:
        if k.id in claimed:
            kids += f'<p class="moved"><a href="#{k.id}">{k.num} {html.escape(k.title)}</a> 已移到“{part_of[k.id]["title"]}”部分</p>'
        else:
            kids += render(k)
    t = ' top' if top else ''
    return f'<section class="lv{n.lv}{t}" id="{n.id}" data-rule="{n.num or "补充"}" data-title="{html.escape(n.title, quote=True)}" data-label="{label}"><{tag} class="{cls}">{rn}<span class="ttl">{html.escape(n.title)}</span>{extra}{src_btn}</{tag}>{body_html}{kids}</section>'


# 回合轨与日历
turns = book.get('turns')
track_html = cal_html = ''
turn_total = 0
if turns:
    groups, slots, cols = turns['groups'], turns['slots'], turns['columns']
    events = turns.get('events', {})
    turn_total = len(groups) * len(slots)
    multi_slot = len(slots) > 1
    head = f'<th>回合</th><th>{turns.get("group_header", "日期")}</th>' + (f'<th>{turns.get("slot_header", "时段")}</th>' if multi_slot else '') + ''.join(f'<th>{c["label"]}</th>' for c in cols)
    rows = ''
    track_html = '<div class="tt" id="turn-track">'
    for gi, g in enumerate(groups):
        track_html += f'<div class="tt-d"><span>{g}</span><div class="tt-g">'
        for si, s in enumerate(slots):
            t = gi * len(slots) + si + 1
            dark = ' n' if s.get('dark') else ''
            lab = s.get('label', '')
            track_html += f'<button type="button" class="tt-c{dark}" data-turn="{t}" data-time="{s["id"]}" data-date="{g}" data-label="{lab}" aria-pressed="false" aria-label="回合 {t}，{g} {lab}"><b>{t}</b><i>{s.get("tag", "")}</i></button>'
            ev = events.get(str(t), {})
            tds = ''
            for c in cols:
                items = ev.get(c['id'], [])
                if items:
                    tds += f'<td data-col="{c["label"]}"><ul>' + ''.join(f'<li>{i}</li>' for i in items) + '</ul></td>'
                else:
                    tds += f'<td data-col="{c["label"]}" data-empty>—</td>'
            slot_td = f'<td>{lab}</td>' if multi_slot else ''
            night = ' class="night"' if s.get('dark') else ''
            rows += f'<tr data-cal="{t}"{night}><td><b>{t}</b></td><td>{g}</td>{slot_td}{tds}</tr>'
        track_html += '</div></div>'
    track_html += '<button type="button" class="tt-all" aria-pressed="true">不限回合</button></div>'
    cal_html = f'<div class="tw"><table class="cal"><thead><tr>{head}</tr></thead><tbody>{rows}</tbody></table></div>'
    for k in events:
        if not (k.isdigit() and 1 <= int(k) <= turn_total):
            errors.append(f'turns.events 中的回合超出范围：{k}')

# 规则号索引
ix = '<div class="rix">'
numbered = [c for c in tree if c.num]
for c in numbered:
    subs = ' '.join(f'<a href="#{k.id}" title="{html.escape(k.title, quote=True)}">{k.num}</a>' for k in c.kids if k.num)
    ix += f'<div><a class="rc" href="#{c.id}">{c.num} {html.escape(c.title)}</a><span class="rs">{subs}</span></div>'
ix += '</div>'

def chip_num(n):
    """目录、扉页里的编号：章取主号（3.0 → 3），节照写，补充章节写“补”。"""
    if not n.num:
        return '补'
    return re.match(r'[^.]+', n.num)[0] if n.lv == 1 else n.num


# 正文
body = ''
for pi, p in enumerate(LAYOUT, 1):
    refs = [nodes[rid(it['ref'])] for it in p['items'] if rid(it['ref']) in nodes]
    inner = ''.join(render(n, top=True) for n in refs)
    intro = render_block(parts_src.get(p['id'], ''))
    sub = f'<p>{p["sub"]}</p>' if p.get('sub') else ''
    ptoc = ''
    if len(refs) > 1:
        ptoc = '<nav class="part-toc" aria-label="本部分内容">' + ''.join(f'<a href="#{n.id}"><span class="cn">{chip_num(n)}</span>{html.escape(n.title)}</a>' for n in refs) + '</nav>'
    head = f'<header class="part-h"><div class="part-no" aria-hidden="true">{pi}</div><div class="part-t"><div class="part-k">第 {pi} 部分</div><h1>{p["title"]}</h1>{sub}</div>{ptoc}</header>'
    body += f'<div class="part" id="p-{p["id"]}" style="--pc:{p["color"]}">{head}<div class="part-i">{intro}</div>{inner}</div>'
for a, b in {'<p>%%CAL%%</p>': cal_html, '<p>%%INDEX%%</p>': ix, '%%TRACK%%': track_html}.items():
    body = body.replace(a, b)
body = linkify(body)

# 目录
toc = ''
for p in LAYOUT:
    toc += f'<li class="t-group" data-part="p-{p["id"]}" style="--pc:{p["color"]}"><div class="t-part"><a href="#p-{p["id"]}">{p["title"]}</a></div><ol class="t-list">'
    for it in p['items']:
        r = rid(it['ref'])
        if r not in nodes:
            continue
        c = nodes[r]
        subs = ''.join(f'<a href="#{k.id}"><b>{k.num}</b>{html.escape(k.title)}</a>' for k in c.kids if k.id not in claimed)
        toc += f'<li class="t-ch" data-id="{c.id}"><a href="#{c.id}"><span class="n">{chip_num(c)}</span>{html.escape(c.title)}</a><div class="t-sub">{subs}</div></li>'
    toc += '</ol></li>'

phasebar = ''.join(f'<a href="#p-{p["id"]}" style="--pc:{p["color"]}">{p["short"]}</a>' for p in LAYOUT)
ARROW = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="{}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
chip = ''
if turns:
    chip = ('<span class="turn">'
            f'<button type="button" id="turn-prev" aria-label="上一回合" hidden>{ARROW.format("M10 3 5 8l5 5")}</button>'
            '<a id="turn-chip" href="#turn-track">选择回合</a>'
            f'<button type="button" id="turn-next" aria-label="下一回合"><span id="turn-go">开始</span>{ARROW.format("m6 3 5 5-5 5")}</button>'
            '</span>')

# 搜索别名：每组是一串互为同义的词
aliases = book.get('aliases', [])
if not (isinstance(aliases, list) and all(isinstance(g, list) and len(g) > 1 and all(isinstance(w, str) and w.strip() for w in g) for g in aliases)):
    errors.append('book.json 的 aliases 应是词组的列表，每组至少两个词，例如 [["ZOC", "控制区"]]')
    aliases = []


def hex_items(p):
    out = []
    for it in p['items']:
        if it.get('hex') is False or rid(it['ref']) not in nodes:
            continue
        n = nodes[rid(it['ref'])]
        ttl = it.get('hex') or n.title
        num = it.get('num') or (re.sub(r'\.0$', '', n.num) if n.num else '补充')
        if len(ttl) > 6:
            warnings.append(f'首页六角格标题偏长，建议在 book.json 用 hex 字段缩短：{ttl}')
        out.append((it['ref'], num, ttl))
    return out


def hexsvg(per_row, desktop, cls):
    """首页章节地图：每章是一枚放在六角格地图上的算子。
    桌面版画出整张地图网格，格子带四位坐标（列行），向右渐隐；手机版只画算子。"""
    R, W = 46, 46 * math.sqrt(3)
    lw = 112 if desktop else 0

    def pts(cx, cy, r):
        return ' '.join(f'{cx + r * math.cos(math.radians(a)):.1f},{cy + r * math.sin(math.radians(a)):.1f}' for a in range(30, 390, 60))

    def col_x(row, col):
        return lw + (W / 2 if row % 2 else 0) + W / 2 + 2 + col * W

    def coord(cx, cy, col, row):
        return f'<text class="hc" x="{cx:.1f}" y="{cy - 26:.1f}">{col + 1:02d}{row + 1:02d}</text>' if desktop else ''

    labels, counters, rows = [], [], []  # rows：每行的（奇偶，圆心 y）
    y, row, widest = 0, 0, 1
    for pi, p in enumerate(LAYOUT, 1):
        hs = hex_items(p)
        if not hs:
            continue
        lx, ly = (0, y + R + 7) if desktop else (2, y + 18)
        labels.append(f'<a class="hl-a" style="--pc:{p["color"]}" href="#p-{p["id"]}"><text class="hl" x="{lx}" y="{ly:.1f}"><tspan class="hl-n">{pi}</tspan> {html.escape(p["short"])}</text></a>')
        if not desktop:
            y += 26
            row = 0
        for i in range(0, len(hs), per_row):
            cy = y + R + 2
            rows.append((row, cy))
            for col, (tok, num, ttl) in enumerate(hs[i:i + per_row]):
                cx = col_x(row, col)
                counters.append(
                    f'<a class="hx" style="--pc:{p["color"]}" href="#{rid(tok)}" aria-label="{html.escape(ttl, quote=True)}">'
                    f'<polygon class="face" points="{pts(cx, cy, R - 3)}"/><polygon class="inner" points="{pts(cx, cy, R - 7)}"/>'
                    f'{coord(cx, cy, col, len(rows) - 1)}'
                    f'<text class="hn" x="{cx:.1f}" y="{cy - 2:.1f}">{html.escape(num)}</text>'
                    f'<text class="ht" x="{cx:.1f}" y="{cy + 16:.1f}">{html.escape(ttl)}</text></a>')
            widest = max(widest, len(hs[i:i + per_row]))
            y += 1.5 * R
            row += 1
        if not desktop:
            y += 0.5 * R + 10
    vw = lw + (widest + .5) * W + 6
    vh = y + 0.5 * R + 6 if desktop else y
    grid = ''
    if desktop:
        vw = max(vw, 720)
        cells = ''
        for ri, (parity, cy) in enumerate(rows):
            for col in range(int((vw - lw) // W) + 1):
                cx = col_x(parity, col)
                cells += f'<polygon points="{pts(cx, cy, R)}"/>{coord(cx, cy, col, ri)}'
        fade = (lw + (widest + 1) * W) / vw
        grid = (f'<defs><linearGradient id="hexfade"><stop offset="{fade:.2f}" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
                f'<mask id="hexmask"><rect width="{vw:.0f}" height="{vh:.0f}" fill="url(#hexfade)"/></mask></defs>'
                f'<g class="grid" mask="url(#hexmask)">{cells}</g>')
    return f'<svg class="{cls}" style="max-width:{vw:.0f}px" viewBox="0 0 {vw:.0f} {vh:.0f}" role="img" aria-label="章节地图">{grid}{"".join(labels)}{"".join(counters)}</svg>'


offset = int(book.get('page_offset', 0))
scans = ''
for f in scan_files:
    n = int(os.path.basename(f)[:-5])
    b = base64.b64encode(open(f, 'rb').read()).decode()
    scans += f'<script type="text/plain" id="scan-{n}">data:image/webp;base64,{b}</script>\n'
last_page = int(book.get('last_printed_page', len(scan_files) - offset))

# 字体：数字字体随 skill 附带；标题字体从本机找思源宋体，只取标题用到的字
hero = book.get('hero', '规则书整理版，按对局顺序重新编排。规则做了改写，含义和数值以原文为准。')
num_font = base64.b64encode(open(os.path.join(ASSETS, 'fonts', 'num.woff2'), 'rb').read()).decode()
font_css = f'@font-face{{font-family:"RB Num";src:url(data:font/woff2;base64,{num_font}) format("woff2");font-weight:100 900;font-display:block}}\n'
font_note = '标题字体：系统字体'
display_cfg = book.get('fonts', {}).get('display', 'auto')
if display_cfg is not False:
    font_path = find_display_font() if display_cfg == 'auto' else os.path.join(B, os.path.expanduser(display_cfg))
    if not font_path or not os.path.exists(font_path):
        warnings.append('没有找到思源宋体（Noto Serif CJK / Source Han Serif，Bold），标题退回系统字体。安装后重新构建，或在 book.json 的 fonts.display 写字体文件路径')
    else:
        display_text = book['title'] + ''.join(p['title'] for p in LAYOUT) + ''.join(n.title for n in nodes.values() if n.lv <= 2)
        uri, fmt, count = subset_display_font(font_path, display_text, os.path.join(B, '.cache', 'fonts'))
        if uri:
            font_css += f'@font-face{{font-family:"RB Display";src:url({uri}) format("{fmt}");font-weight:100 900;font-display:block}}\n'
            font_note = f'标题字体：{os.path.basename(font_path)}，{count} 字，{len(uri) * 3 / 4 / 1024:.0f} KB'
        else:
            warnings.append(f'标题字体没有内嵌，退回系统字体：{fmt}')

cfg = {'offset': offset, 'firstPage': int(book.get('first_printed_page', 1)), 'lastPage': last_page, 'storage': book.get('storage_key', 'rulebook'), 'turns': turn_total, 'aliases': aliases}
t = open(os.path.join(ASSETS, 'template.html'), encoding='utf8').read()
js = f'const BOOK = {json.dumps(cfg)};\n' + open(os.path.join(ASSETS, 'app.js'), encoding='utf8').read()
for k, v in {'{{FONTS}}': font_css, '{{TITLE}}': html.escape(book['title']), '{{EYEBROW}}': html.escape(book.get('eyebrow', '')), '{{HERO}}': html.escape(hero), '{{TOC}}': toc, '{{HEX_D}}': hexsvg(8, True, 'd'), '{{HEX_M}}': hexsvg(4, False, 'm'), '{{PHASEBAR}}': phasebar, '{{TURN_CHIP}}': chip, '{{BODY}}': body, '{{SCANS}}': scans, '{{JS}}': js}.items():
    t = t.replace(k, v)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, 'w', encoding='utf8').write(t)

clean = re.sub(r'data:image[^"<]+', '', body)
stripped = re.sub(r'<a class="xref"[^>]*>[^<]*</a>', '', clean)
leftover = re.findall(r':::|@fig |\*\*|%%\w+%%', stripped)
rendered = clean.count('<section ')
unused = sorted(set(sizes) - used_imgs)
if missing:
    errors.append('找不到的规则引用：' + ', '.join(sorted(set(missing))))
if leftover:
    errors.append(f'正文里有 {len(leftover)} 处未解析的标记：{sorted(set(leftover))}')
if rendered != len(nodes):
    errors.append(f'渲染的小节数 {rendered} 与章节稿 {len(nodes)} 不一致')
if unused:
    warnings.append('裁了但没用到的图片：' + ', '.join(unused))
print(f'章节 {len(tree)}，小节 {len(nodes)}，图片 {len(used_imgs)}，扫描页 {len(scan_files)}，回合 {turn_total}')
print('重复的规则号：', dups or '无')
print(font_note)
print(f'大小 {os.path.getsize(OUT) / 1e6:.2f} MB → {OUT}')
for w in sorted(set(warnings)):
    print('警告：', w)
for e in errors:
    print('错误：', e, file=sys.stderr)
sys.exit(1 if errors else 0)
