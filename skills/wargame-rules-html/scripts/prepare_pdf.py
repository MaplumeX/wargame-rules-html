#!/usr/bin/env python3
"""规则书 PDF 的体检、渲染、裁图工具，依赖 poppler-utils 和 Pillow。

  inspect <pdf>                         判断是扫描件还是文字版
  render  <pdf> <book-dir>              生成阅读用页面、高清页面和“原文”扫描页
  crop    <book-dir>                    按 crops.txt 裁图
  contact <book-dir>                    生成裁图拼图 contact.jpg，用来检查裁得对不对
  zoom    <book-dir> <页号> x0 y0 x1 y1  放大并提高对比度，用来核对褪色的文字
"""
import glob
import json
import os
import re
import shutil
import subprocess
import sys

READ_DPI, HI_DPI = 150, 300
SCAN_WIDTH, SCAN_QUALITY = 1000, 52
CROP_MAX, CROP_QUALITY = 1300, 74


def need(*tools):
    for t in tools:
        if not shutil.which(t):
            sys.exit(f'缺少命令 {t}，请安装 poppler-utils')


def run(*a):
    return subprocess.run(a, capture_output=True, text=True, check=True).stdout


def pil():
    try:
        from PIL import Image, ImageDraw, ImageOps, features
    except ImportError:
        sys.exit('缺少 Python 包 Pillow，请先运行：pip install Pillow')
    if not features.check('webp'):
        sys.exit('当前 Pillow 不支持 WebP')
    return Image, ImageDraw, ImageOps


def page_files(d):
    """返回 {页号: 文件}，pdftoppm 的补零宽度随总页数变化。"""
    out = {}
    for f in glob.glob(os.path.join(d, 'p-*.*')):
        m = re.search(r'p-(\d+)\.', os.path.basename(f))
        if m:
            out[int(m[1])] = f
    return out


def inspect(pdf):
    need('pdfinfo', 'pdffonts', 'pdfimages', 'pdftotext')
    info = run('pdfinfo', pdf)
    pages = int(re.search(r'^Pages:\s+(\d+)', info, re.M)[1])
    size = re.search(r'^Page size:\s+(.+)$', info, re.M)[1]
    fonts = len(run('pdffonts', pdf).splitlines()) - 2
    images = len(run('pdfimages', '-list', pdf).splitlines()) - 2
    chars = len(''.join(run('pdftotext', '-layout', pdf, '-').split()))
    per = chars / max(pages, 1)
    kind = '扫描件（没有可用的文字层）' if per < 30 else ('混合：部分页面可能是图片' if per < 200 else '文字版')
    print(f'页数 {pages}，页面 {size}，字体 {max(fonts, 0)} 个，图片 {max(images, 0)} 张，文字 {chars} 字（每页约 {per:.0f}）')
    print('判断：', kind)


def render(pdf, b):
    need('pdftoppm')
    Image, _, _ = pil()
    for name in ('pages', 'hi', 'scan', 'img'):
        os.makedirs(os.path.join(b, name), exist_ok=True)
    if not page_files(f'{b}/pages'):
        subprocess.run(['pdftoppm', '-r', str(READ_DPI), '-jpeg', '-jpegopt', 'quality=85', pdf, f'{b}/pages/p'], check=True)
    if not page_files(f'{b}/hi'):
        subprocess.run(['pdftoppm', '-r', str(HI_DPI), '-png', pdf, f'{b}/hi/p'], check=True)
    for n, f in sorted(page_files(f'{b}/hi').items()):
        im = Image.open(f).convert('RGB')
        im = im.resize((SCAN_WIDTH, round(im.height * SCAN_WIDTH / im.width)), Image.LANCZOS)
        im.save(f'{b}/scan/{n}.webp', quality=SCAN_QUALITY, method=6)
    print(f'阅读页在 {b}/pages/，共 {len(page_files(f"{b}/pages"))} 页')


def crop(b):
    Image, _, _ = pil()
    hi, reading = page_files(f'{b}/hi'), page_files(f'{b}/pages')
    os.makedirs(f'{b}/img', exist_ok=True)
    out = {}
    for line in open(f'{b}/crops.txt', encoding='utf8'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        name, p, x0, y0, x1, y1 = line.split()
        p = int(p)
        im = Image.open(hi[p]).convert('RGB')
        k = im.width / Image.open(reading[p]).width
        im = im.crop(tuple(int(int(v) * k) for v in (x0, y0, x1, y1)))
        if im.width > CROP_MAX:
            im = im.resize((CROP_MAX, round(im.height * CROP_MAX / im.width)), Image.LANCZOS)
        im.save(f'{b}/img/{name}.webp', quality=CROP_QUALITY, method=6)
        out[name] = (im.width, im.height)
    json.dump(out, open(f'{b}/img/sizes.json', 'w'))
    print(f'裁出 {len(out)} 张图')


def contact(b):
    Image, ImageDraw, _ = pil()
    files = sorted(glob.glob(f'{b}/img/*.webp'))
    cols, cw, ch = 4, 300, 260
    sheet = Image.new('RGB', (cols * cw, ((len(files) + cols - 1) // cols) * ch), 'white')
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(files):
        im = Image.open(f)
        im.thumbnail((cw - 8, ch - 24))
        x, y = (i % cols) * cw + 4, (i // cols) * ch + 20
        sheet.paste(im, (x, y))
        d.text((x, y - 16), os.path.basename(f)[:-5], fill='red')
    sheet.save(f'{b}/contact.jpg', quality=80)
    print(f'{b}/contact.jpg')


def zoom(b, p, *box):
    Image, _, ImageOps = pil()
    p = int(p)
    hi = Image.open(page_files(f'{b}/hi')[p]).convert('L')
    k = hi.width / Image.open(page_files(f'{b}/pages')[p]).width
    c = ImageOps.autocontrast(hi.crop(tuple(int(int(v) * k) for v in box)), cutoff=1)
    out = f'{b}/zoom-{p}.jpg'
    c.save(out, quality=88)
    print(out, c.size)


CMD = {'inspect': (inspect, 1), 'render': (render, 2), 'crop': (crop, 1), 'contact': (contact, 1), 'zoom': (zoom, 6)}
if len(sys.argv) < 2 or sys.argv[1] not in CMD or len(sys.argv) - 2 != CMD[sys.argv[1]][1]:
    sys.exit(__doc__)
CMD[sys.argv[1]][0](*sys.argv[2:])
