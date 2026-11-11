#!/usr/bin/env node
// 用无头 Chrome/Chromium 检查生成的页面。需要 Node 22 以上。
// 用法：node check.mjs <out.html> [截图目录]
// 找不到浏览器时可设置环境变量 CHROME_PATH。
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const file = path.resolve(process.argv[2] || 'out.html');
const shots = path.resolve(process.argv[3] || path.join(path.dirname(file), 'shots'));
if (!fs.existsSync(file)) { console.error('找不到文件：' + file); process.exit(2); }

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const c of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome']) {
    try { return execSync(`command -v ${c}`, { shell: '/bin/sh' }).toString().trim(); } catch {}
  }
  const fixed = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe'];
  for (const f of fixed) if (fs.existsSync(f)) return f;
  const cache = path.join(os.homedir(), '.cache/ms-playwright');
  if (fs.existsSync(cache)) {
    for (const d of fs.readdirSync(cache).filter(x => /^chromium-\d+/.test(x)).sort().reverse()) {
      const p = path.join(cache, d, 'chrome-linux64/chrome');
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

const chrome = findChrome();
if (!chrome) { console.error('没有找到 Chrome/Chromium，浏览器检查未执行。可设置 CHROME_PATH。'); process.exit(3); }
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rulebook-check-'));
const port = 9400 + Math.floor(Math.random() * 400);
const proc = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ws;
for (let i = 0; i < 60; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
    await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
    break;
  } catch { ws = null; await sleep(250); }
}
if (!ws) { proc.kill(); console.error('无法连接浏览器'); process.exit(3); }

let id = 0;
const wait = new Map(), jsErrors = [];
ws.onmessage = m => {
  const d = JSON.parse(m.data);
  if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') jsErrors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
};
const cdp = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => {
  const r = await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) jsErrors.push(r.result.exceptionDetails.exception?.description || e);
  return r.result.result?.value;
};
const shot = async name => {
  const r = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 72 });
  fs.writeFileSync(path.join(shots, name), Buffer.from(r.result.data, 'base64'));
};
const size = (width, height, mobile) => cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
const failures = [];
const expect = (name, ok, detail = '') => { console.log(`${ok ? '通过' : '失败'}  ${name}${detail !== '' ? '：' + detail : ''}`); if (!ok) failures.push(name); };

fs.mkdirSync(shots, { recursive: true });
await cdp('Page.enable'); await cdp('Runtime.enable');
await size(1400, 900, false);
await cdp('Page.navigate', { url: 'file://' + file });
await sleep(2000);
await ev(`document.documentElement.style.scrollBehavior='auto'`);

// 比较 scrollWidth 和 clientWidth：移动端模拟下 innerWidth 会随溢出变大，用它比较测不出问题。
const overflow = `document.documentElement.scrollWidth-document.documentElement.clientWidth`;
expect('桌面端无横向溢出', await ev(overflow) <= 0);
const bad = await ev(`[...document.querySelectorAll('.xref,.hx,.t-ch a,.pb a[href]')].filter(a=>!document.getElementById(a.getAttribute('href').slice(1))).map(a=>a.getAttribute('href'))`);
expect('所有内部链接的目标都存在', bad.length === 0, bad.slice(0, 8).join(' '));
const imgs = await ev(`(async()=>{const a=[...document.querySelectorAll('main img')];a.forEach(i=>i.loading='eager');await Promise.all(a.map(i=>i.decode().catch(()=>{})));return [a.filter(i=>!i.naturalWidth).length,a.length]})()`);
expect('图片全部加载', imgs[0] === 0, `${imgs[1] - imgs[0]}/${imgs[1]}`);

const term = await ev(`document.querySelector('section[data-title]').dataset.title.slice(0,2)`);
const hits = await ev(`(()=>{const q=document.querySelector('#q');q.value=${JSON.stringify(term)};q.dispatchEvent(new Event('input'));return document.querySelectorAll('#results .r').length})()`);
expect('搜索有结果', hits > 0, `“${term}” ${hits} 条`);
await ev(`(()=>{const q=document.querySelector('#q');q.value='';q.dispatchEvent(new Event('input'))})()`);

// 搜索面板：快捷键打开，方向键选择，回车跳转，然后用返回按钮回到原处
const pal = await ev(`(async()=>{
  const q=document.querySelector('#q'),p=document.querySelector('#pal'),back=document.querySelector('#back');
  scrollTo(0,0);
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'/'}));
  const opened=p.open;
  q.value=${JSON.stringify(term)};q.dispatchEvent(new Event('input'));
  const n=document.querySelectorAll('#results .r').length;
  q.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown'}));
  const sel=document.querySelector('#results .r.sel');
  const moved=n<2||sel===document.querySelectorAll('#results .r')[1];
  return {opened,moved,want:sel&&sel.getAttribute('href')};
})()`);
await sleep(200); await shot('desktop-search.jpg');
const picked = await ev(`(async()=>{
  const q=document.querySelector('#q'),p=document.querySelector('#pal'),back=document.querySelector('#back');
  q.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));
  await new Promise(r=>setTimeout(r,300));
  const there={closed:!p.open,hash:location.hash,back:!back.hidden,y:scrollY};
  document.querySelector('#back-go').click();
  await new Promise(r=>setTimeout(r,300));
  return {...there,home:scrollY,gone:back.hidden};
})()`);
expect('搜索面板可以用键盘打开、选择和跳转', pal.opened && pal.moved && picked.closed && picked.hash === pal.want, picked.hash);
expect('跳转后可以返回原处', picked.back && picked.gone && picked.home === 0 && picked.y > 0, `${picked.y} → ${picked.home}`);

const xr = await ev(`(async()=>{
  const a=document.querySelector('main .xref');if(!a)return null;
  a.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,200));
  const top=a.getBoundingClientRect().top;
  a.click();await new Promise(r=>setTimeout(r,300));
  const hash=location.hash,label=document.querySelector('#back-t').textContent;
  document.querySelector('#back-go').click();await new Promise(r=>setTimeout(r,300));
  return {ok:hash===a.getAttribute('href')&&label.length>0,drift:Math.abs(a.getBoundingClientRect().top-top),label};
})()`);
if (xr !== null) expect('点引用跳转后返回，引用回到原来的位置', xr.ok && xr.drift < 2, `返回 ${xr.label}`);

const cks = await ev(`(()=>{const b=document.querySelector('.ck');if(!b)return null;b.click();const on=b.getAttribute('aria-checked')==='true'&&!b.closest('.phase-card,[data-turnflow]').querySelector('.ck-reset').hidden;document.querySelector('.ck-reset:not([hidden])').click();return [on,document.querySelectorAll('.ck[aria-checked="true"]').length]})()`);
if (cks !== null) expect('清单步骤可以勾选和清空', cks[0] === true && cks[1] === 0);

const ex = await ev(`(()=>{const all=document.querySelectorAll('details.ex').length;document.querySelector('#t-ex').click();const n=[...document.querySelectorAll('details.ex')].filter(d=>d.open).length;document.querySelector('#t-ex').click();return [n,all]})()`);
expect('示例可以全部展开', ex[0] === ex[1], `${ex[0]}/${ex[1]}`);

const pop = await ev(`(()=>{const a=document.querySelector('.xref');if(!a)return null;a.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));const p=document.querySelector('#pop');const on=p.classList.contains('show');a.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));return on})()`);
if (pop !== null) expect('引用预览可以显示', pop === true);

const scan = await ev(`(()=>{const b=document.querySelector('.src');if(!b)return null;b.click();const v=document.querySelector('#viewer'),i=document.querySelector('#v-i');return new Promise(r=>{const d=()=>{const w=i.naturalWidth;document.querySelector('#v-c').click();r(w)};i.complete&&i.naturalWidth?d():i.onload=d;setTimeout(()=>r(0),3000)})})()`);
if (scan !== null) expect('原文扫描页可以打开', scan > 0);

const turns = await ev(`BOOK.turns`);
if (turns) {
  const t = await ev(`(()=>{const b=document.querySelector('[data-turn="${turns}"]');b.click();return [document.querySelector('#turn-chip').textContent,b.getAttribute('aria-pressed'),document.querySelectorAll('tr.now').length]})()`);
  expect('回合选择生效', t[1] === 'true' && t[2] === 1 && t[0].includes(String(turns)), t[0]);
  await ev(`document.querySelector('.tt-all').click()`);
  const step = await ev(`(()=>{const n=document.querySelector('#turn-next'),c=document.querySelector('#turn-chip'),k=document.querySelector('.ck');n.click();const first=c.textContent;if(k)k.click();n.click();const r=[first,c.textContent,document.querySelectorAll('.ck[aria-checked="true"]').length];document.querySelector('.tt-all').click();return r})()`);
  expect('顶栏可以推进回合，换回合时清空勾选', step[0].includes('1') && (turns < 2 || step[1].includes('2')) && step[2] === 0, step[1]);
}

const toc = await ev(`(async()=>{const gs=[...document.querySelectorAll('.t-group')];if(!gs.length)return null;const g=gs[gs.length>1?1:0];const p=document.getElementById(g.dataset.part);scrollTo(0,p.getBoundingClientRect().top+scrollY-60);await new Promise(r=>setTimeout(r,400));const cur=gs.filter(x=>x.classList.contains('cur'));const hidden=[...document.querySelectorAll('.t-ch')].filter(x=>!x.getClientRects().length).length;return cur.length===1&&cur[0]===g&&hidden===0})()`);
if (toc !== null) expect('目录全部展开并标出当前阶段', toc === true);

await ev(`scrollTo(0,0)`); await sleep(300); await shot('desktop-top.jpg');
const parts = await ev(`[...document.querySelectorAll('.part')].map(p=>Math.round(p.getBoundingClientRect().top+scrollY))`);
for (let i = 0; i < Math.min(parts.length, 4); i++) { await ev(`scrollTo(0,${parts[i] - 50})`); await sleep(250); await shot(`desktop-part-${i + 1}.jpg`); }
await ev(`document.documentElement.dataset.theme='dark';scrollTo(0,0)`); await sleep(250); await shot('desktop-dark.jpg');
await ev(`document.documentElement.dataset.theme='light'`);

await size(390, 800, true); await sleep(500);
expect('手机端无横向溢出', await ev(overflow) <= 0);
const wide = await ev(`[...document.querySelectorAll('.tw')].filter(t=>t.scrollWidth>t.clientWidth+1).length`);
console.log(`提示  手机上需要左右滑动的表格：${wide} 张`);
await ev(`scrollTo(0,0)`); await sleep(300); await shot('mobile-top.jpg');
if (parts.length > 1) { const y = await ev(`Math.round(document.querySelectorAll('.part')[1].getBoundingClientRect().top+scrollY)`); await ev(`scrollTo(0,${y - 100})`); await sleep(250); await shot('mobile-part.jpg'); }

// 触屏上点引用：先在底部预览，再决定是否跳过去
const peek = await ev(`(async()=>{
  const a=document.querySelector('main .xref');if(!a)return null;
  a.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,200));
  const before=location.hash,p=document.querySelector('#peek');
  document.body.dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',bubbles:true}));
  a.click();
  return {open:p.open,stay:location.hash===before,text:document.querySelector('#pk-t').textContent.length>0,want:a.getAttribute('href')};
})()`);
if (peek !== null) {
  await sleep(300); await shot('mobile-peek.jpg');
  const went = await ev(`(async()=>{document.querySelector('#pk-go').click();await new Promise(r=>setTimeout(r,300));const r=[document.querySelector('#peek').open,location.hash,document.querySelector('#back').hidden];window.dispatchEvent(new KeyboardEvent('keydown',{key:'Shift'}));return r})()`);
  expect('触屏上点引用先弹出预览，再跳转', peek.open && peek.stay && peek.text && went[0] === false && went[1] === peek.want && went[2] === false, went[1]);
  await shot('mobile-back.jpg');
}

expect('页面没有脚本错误', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '));
console.log('截图目录：' + shots);
ws.close(); proc.kill();
await sleep(200);
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(failures.length ? 1 : 0);
