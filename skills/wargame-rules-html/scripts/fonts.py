"""标题字体：找到本机的思源宋体，只取页面标题用到的字，转成 woff2 内嵌。

单文件离线页面没法加载网络字体，而完整的中文字体有几十 MB。标题用到的字通常只有几百个，
子集化后约 100–200 KB。只收录 SIL OFL 授权、允许随文件分发的字体（思源宋体 / Noto Serif CJK）。

依赖 fontTools（pip install fonttools brotli）。缺依赖或找不到字体时返回 None，
页面退回系统字体，构建照常完成。
"""
import base64
import glob
import hashlib
import io
import os

# 文件名模式，按优先顺序。只收 Bold，可变字体会实例化到 700。
PATTERNS = [
    'NotoSerifCJK*-Bold.ttc', 'NotoSerifCJKsc-Bold.otf', 'NotoSerifSC-Bold.otf', 'NotoSerifSC-Bold.ttf',
    'SourceHanSerif*-Bold.ttc', 'SourceHanSerifSC-Bold.otf', 'SourceHanSerifCN-Bold.otf', 'SourceHanSerif-Bold.otf',
    'NotoSerifSC*wght*.ttf', 'NotoSerifCJKsc-VF.otf', 'NotoSerifCJK-VF.ttc', 'SourceHanSerif-VF.ttc', 'SourceHanSerifSC-VF.otf',
]
DIRS = [
    '/usr/share/fonts', '/usr/local/share/fonts', '~/.local/share/fonts', '~/.fonts',
    '/Library/Fonts', '~/Library/Fonts',
    'C:/Windows/Fonts', os.path.join(os.environ.get('LOCALAPPDATA', '~'), 'Microsoft/Windows/Fonts'),
    '/mnt/c/Windows/Fonts',
]


def find_display_font():
    for pat in PATTERNS:
        for d in DIRS:
            d = os.path.expanduser(d)
            if os.path.isdir(d):
                hits = sorted(glob.glob(os.path.join(d, '**', pat), recursive=True))
                if hits:
                    return hits[0]
    return None


def _open(path):
    """打开字体；字体集（.ttc）里挑简体中文那一款。"""
    from fontTools.ttLib import TTCollection, TTFont
    if not path.lower().endswith('.ttc'):
        return TTFont(path)
    n = len(TTCollection(path, lazy=True).fonts)
    for i in range(n):
        f = TTFont(path, fontNumber=i, lazy=True)
        names = {str(r) for r in f['name'].names if r.nameID in (1, 16)}
        if any(' SC' in s or ' CN' in s or s.endswith('SC') for s in names):
            return TTFont(path, fontNumber=i)
    return TTFont(path, fontNumber=0)


def subset_display_font(path, text, cache_dir):
    """返回 (data URI, 格式, 字数)；失败时返回 (None, 原因, 0)。"""
    try:
        from fontTools import subset
    except ImportError:
        return None, '缺少 fontTools（pip install fonttools brotli）', 0
    try:
        import brotli  # noqa: F401
        flavor = 'woff2'
    except ImportError:
        flavor = 'woff'
    chars = ''.join(sorted(set(text) - set(' \t\r\n')))
    key = hashlib.sha1(f'{os.path.abspath(path)}|{os.path.getmtime(path)}|{flavor}|{chars}'.encode()).hexdigest()[:16]
    cached = os.path.join(cache_dir, f'display-{key}.{flavor}')
    if os.path.exists(cached):
        data = open(cached, 'rb').read()
    else:
        font = _open(path)
        if 'fvar' in font:
            from fontTools.varLib import instancer
            font = instancer.instantiateVariableFont(font, {'wght': 700})
        opts = subset.Options()
        opts.flavor = flavor
        opts.hinting = False
        opts.desubroutinize = True
        opts.layout_features = ['kern', 'palt', 'vert', 'locl']
        opts.name_IDs = ['*']
        opts.notdef_outline = True
        s = subset.Subsetter(opts)
        s.populate(text=chars)
        s.subset(font)
        font.flavor = flavor
        buf = io.BytesIO()
        font.save(buf)
        data = buf.getvalue()
        os.makedirs(cache_dir, exist_ok=True)
        open(cached, 'wb').write(data)
    return f'data:font/{flavor};base64,' + base64.b64encode(data).decode(), flavor, len(chars)
