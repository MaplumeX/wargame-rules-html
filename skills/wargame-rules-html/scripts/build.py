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
PALETTE = ['#8a9580', '#515a6d', '#536a4b', '#17707c', '#a32237', '#7a1a2b', '#6f8350', '#6b7488']
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


def md(t):
    h = markdown.markdown(t, extensions=['tables', 'sane_lists'])
    return re.sub(r'<table>(.*?)</table>', r'<div class="tw"><table>\1</table></div>', h, flags=re.S)


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

# 正文
body = ''
for p in LAYOUT:
    inner = ''.join(render(nodes[rid(it['ref'])], top=True) for it in p['items'] if rid(it['ref']) in nodes)
    intro = render_block(parts_src.get(p['id'], ''))
    sub = f'<p>{p["sub"]}</p>' if p.get('sub') else ''
    body += f'<div class="part" id="p-{p["id"]}" style="--pc:{p["color"]}"><header class="part-h"><h1>{p["title"]}</h1>{sub}</header><div class="part-i">{intro}</div>{inner}</div>'
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
        short_num = re.match(r'[^.]+', c.num)[0] if (c.num and c.lv == 1) else c.num
        n = short_num or '补'
        subs = ''.join(f'<a href="#{k.id}"><b>{k.num}</b>{html.escape(k.title)}</a>' for k in c.kids if k.id not in claimed)
        toc += f'<li class="t-ch" data-id="{c.id}"><a href="#{c.id}"><span class="n">{n}</span>{html.escape(c.title)}</a><div class="t-sub">{subs}</div></li>'
    toc += '</ol></li>'

phasebar = ''.join(f'<a href="#p-{p["id"]}">{p["short"]}</a>' for p in LAYOUT)
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


def hexsvg(per_row, label_left, cls):
    R, W = 46, 46 * math.sqrt(3)
    parts = []

    def hx(cx, cy, color, tok, num, ttl, solid=False):
        pts = ' '.join(f'{cx + R * math.cos(math.radians(a)):.1f},{cy + R * math.sin(math.radians(a)):.1f}' for a in range(30, 390, 60))
        parts.append(f'<a class="hx{" solid" if solid else ""}" style="--pc:{color}" href="#{rid(tok)}" aria-label="{html.escape(ttl, quote=True)}"><polygon points="{pts}"/><text class="hn" x="{cx:.1f}" y="{cy - 2:.1f}">{html.escape(num)}</text><text class="ht" x="{cx:.1f}" y="{cy + 18:.1f}">{html.escape(ttl)}</text></a>')

    lw = 112 if label_left else 0
    y, row, widest = 0, 0, 1
    for pi, p in enumerate(LAYOUT):
        hs = hex_items(p)
        if not hs:
            continue
        chunks = [hs[i:i + per_row] for i in range(0, len(hs), per_row)]
        if label_left:
            parts.append(f'<a class="hl-a" href="#p-{p["id"]}"><text class="hl" x="0" y="{y + R + 7:.1f}">{p["short"]}</text></a>')
        else:
            parts.append(f'<a class="hl-a" href="#p-{p["id"]}"><text class="hl" x="2" y="{y + 18:.1f}">{p["short"]}</text></a>')
            y += 26
            row = 0
        for ch in chunks:
            off = W / 2 if row % 2 else 0
            for i, (tok, num, ttl) in enumerate(ch):
                hx(lw + off + W / 2 + 2 + i * W, y + R + 2, p['color'], tok, num, ttl, solid=pi % 2 == 1)
            widest = max(widest, len(ch))
            y += 1.5 * R
            row += 1
        if not label_left:
            y += 0.5 * R + 10
    vh = y + 0.5 * R + 6 if label_left else y
    vw = lw + (widest + .5) * W + 6
    return f'<svg class="{cls}" style="max-width:{vw:.0f}px" viewBox="0 0 {vw:.0f} {vh:.0f}" role="img" aria-label="章节地图">{"".join(parts)}</svg>'


offset = int(book.get('page_offset', 0))
scans = ''
for f in scan_files:
    n = int(os.path.basename(f)[:-5])
    b = base64.b64encode(open(f, 'rb').read()).decode()
    scans += f'<script type="text/plain" id="scan-{n}">data:image/webp;base64,{b}</script>\n'
last_page = int(book.get('last_printed_page', len(scan_files) - offset))

cfg = {'offset': offset, 'firstPage': int(book.get('first_printed_page', 1)), 'lastPage': last_page, 'storage': book.get('storage_key', 'rulebook'), 'turns': turn_total, 'aliases': aliases}
t = open(os.path.join(ASSETS, 'template.html'), encoding='utf8').read()
js = f'const BOOK = {json.dumps(cfg)};\n' + open(os.path.join(ASSETS, 'app.js'), encoding='utf8').read()
hero = book.get('hero', '规则书整理版，按对局顺序重新编排。规则做了改写，含义和数值以原文为准。')
for k, v in {'{{TITLE}}': html.escape(book['title']), '{{EYEBROW}}': html.escape(book.get('eyebrow', '')), '{{HERO}}': html.escape(hero), '{{TOC}}': toc, '{{HEX_D}}': hexsvg(8, True, 'd'), '{{HEX_M}}': hexsvg(4, False, 'm'), '{{PHASEBAR}}': phasebar, '{{TURN_CHIP}}': chip, '{{BODY}}': body, '{{SCANS}}': scans, '{{JS}}': js}.items():
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
print(f'大小 {os.path.getsize(OUT) / 1e6:.2f} MB → {OUT}')
for w in sorted(set(warnings)):
    print('警告：', w)
for e in errors:
    print('错误：', e, file=sys.stderr)
sys.exit(1 if errors else 0)
