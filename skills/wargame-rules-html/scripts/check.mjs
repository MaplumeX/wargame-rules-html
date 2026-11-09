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
}

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

expect('页面没有脚本错误', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '));
console.log('截图目录：' + shots);
ws.close(); proc.kill();
await sleep(200);
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(failures.length ? 1 : 0);
