(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const readList = k => { try { const v = JSON.parse(store.get(k)); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const K = BOOK.storage;
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hashId = () => { try { return decodeURIComponent(location.hash.slice(1)); } catch (e) { return location.hash.slice(1); } };

  // 最近一次操作用的是鼠标还是触屏：触屏上点引用先预览，鼠标悬停预览、点击跳转
  let ptr = 'mouse';
  addEventListener('pointerdown', e => { ptr = e.pointerType || 'mouse'; }, true);
  addEventListener('keydown', () => { ptr = 'mouse'; }, true);

  // 主题：日间 / 夜间
  const saved = store.get(K + '-theme');
  if (saved) root.dataset.theme = saved;
  const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme:dark)').matches;
  $('#t-th').addEventListener('click', () => { const v = isDark() ? 'light' : 'dark'; root.dataset.theme = v; store.set(K + '-theme', v); });

  // 抽屉
  const side = $('#side'), scrim = $('#scrim');
  const drawer = on => { side.classList.toggle('open', on); scrim.classList.toggle('show', on); };
  $('#menu').addEventListener('click', () => drawer(true));
  scrim.addEventListener('click', () => drawer(false));

  // 示例折叠
  const exBtn = $('#t-ex');
  let exOpen = false;
  exBtn.addEventListener('click', () => {
    exOpen = !exOpen;
    $$('main details.ex').forEach(d => { d.open = exOpen; });
    exBtn.textContent = exOpen ? '折叠全部示例' : '展开全部示例';
  });
  addEventListener('beforeprint', () => $$('details.ex').forEach(d => { d.open = true; }));

  // 回合：筛选流程、在顶栏前后推进
  const TF = $('[data-turnflow]');
  const nowBox = $('#tf-now'), chip = $('#turn-chip'), tPrev = $('#turn-prev'), tNext = $('#turn-next');
  const has = (v, t) => (v || '').trim().split(/\s+/).includes(t);
  let curTurn = 0;
  const applyTime = time => {
    if (!TF) return;
    TF.dataset.time = time;
    $$('[data-only]', TF).forEach(el => { el.hidden = time !== 'all' && !has(el.dataset.only, time); });
    $$('[data-strike]', TF).forEach(el => el.classList.toggle('struck', has(el.dataset.strike, time)));
    $$('[data-badge]', TF).forEach(el => {
      $$(':scope > .bdg', el).forEach(x => x.remove());
      el.dataset.badge.split(';').forEach(pair => {
        const i = pair.indexOf(':');
        if (pair.slice(0, i).trim() === time) { const b = document.createElement('span'); b.className = 'bdg'; b.textContent = pair.slice(i + 1); el.appendChild(b); }
      });
    });
  };
  // keep：只换显示，不清空清单（页面载入、为了显示被筛掉的规则而取消筛选时）
  const setTurn = (t, keep) => {
    if (!chip) return;
    const b = t ? $('[data-turn="' + t + '"]') : null;
    const next = b ? t : 0;
    if (!keep && next !== curTurn) clearChecks();
    curTurn = next;
    applyTime(b ? b.dataset.time : 'all');
    $$('.tt-c,.tt-all').forEach(x => x.setAttribute('aria-pressed', x === (b || $('.tt-all')) ? 'true' : 'false'));
    $$('tr[data-cal]').forEach(x => x.classList.toggle('now', x.dataset.cal === String(t)));
    tPrev.hidden = !b;
    tPrev.disabled = curTurn <= 1;
    tNext.disabled = curTurn >= BOOK.turns;
    $('#turn-go').hidden = !!b;
    tNext.setAttribute('aria-label', b ? '下一回合' : '从回合 1 开始');
    store.set(K + '-turn', b ? t : '');
    if (!b) { if (nowBox) { nowBox.hidden = true; nowBox.innerHTML = ''; } chip.textContent = '选择回合'; return; }
    const when = (b.dataset.date + ' ' + b.dataset.label).trim();
    const lab = '回合 ' + t + (when ? ' · ' + when : '');
    chip.innerHTML = '回合 ' + t + (when ? '<span class="tc-x"> · ' + esc(when) + '</span>' : '');
    if (!nowBox) return;
    const row = $('tr[data-cal="' + t + '"]');
    const cards = row ? $$('td[data-col]', row).filter(td => td.dataset.empty === undefined).map(td => '<div><h4>' + td.dataset.col + '</h4><div>' + td.innerHTML + '</div></div>').join('') : '';
    nowBox.innerHTML = '<b>' + esc(lab) + '</b>' + (cards ? '<div class="now-g">' + cards + '</div>' : '<p>这一回合没有增援或特殊事件。</p>');
    nowBox.hidden = false;
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('.tt-c,.tt-all');
    if (b) setTurn(b.dataset.turn ? +b.dataset.turn : null);
  });
  if (chip) {
    tPrev.addEventListener('click', () => { if (curTurn > 1) setTurn(curTurn - 1); });
    tNext.addEventListener('click', () => { if (curTurn < BOOK.turns) setTurn(curTurn + 1); });
    const t = +store.get(K + '-turn');
    setTurn(t >= 1 && t <= BOOK.turns ? t : null, true);
  }

  // 跳转高亮
  const flashEl = h => { h.classList.remove('flash'); void h.offsetWidth; h.classList.add('flash'); };
  const flash = id => {
    const t = document.getElementById(id);
    if (!t) return;
    if (t.closest('[data-turnflow]') && !t.getClientRects().length) { setTurn(null, true); t.scrollIntoView(); }
    const h = t.matches('section') ? t.querySelector(':scope > .ch, :scope > .rh') : t;
    if (h) flashEl(h);
    addRecent(id);
  };
  const goTo = id => {
    if (hashId() !== id) { location.hash = '#' + id; return; }
    const t = document.getElementById(id);
    if (t) t.scrollIntoView();
    flash(id);
  };
  addEventListener('hashchange', () => flash(hashId()));

  // 返回：顺着引用跳走之前记下位置，读完一键回到原处
  const back = $('#back'), backT = $('#back-t'), trail = [];
  const showBack = () => { const t = trail[trail.length - 1]; back.hidden = !t; if (t) backT.textContent = t.label; };
  const mark = a => {
    const el = a && a.closest('.wrap') ? a : null;
    const sec = el && el.closest('section[data-rule]'), part = el && el.closest('.part');
    const label = sec ? sec.dataset.label : part ? $('.part-h h1', part).textContent : wantCrumb;
    trail.push({ el, top: el ? el.getBoundingClientRect().top : 0, y: scrollY, label });
    if (trail.length > 12) trail.shift();
    showBack();
  };
  $('#back-go').addEventListener('click', () => {
    const t = trail.pop();
    showBack();
    if (!t) return;
    const there = t.el && t.el.isConnected && t.el.getClientRects().length;
    scrollTo({ top: there ? scrollY + t.el.getBoundingClientRect().top - t.top : t.y });
    if (there) flashEl(t.el);
  });
  $('#back-x').addEventListener('click', () => { trail.length = 0; showBack(); });

  // 页内链接
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    if (a.matches('.r')) { e.preventDefault(); pick(a); return; }
    if (a.matches('.xref') && (ptr !== 'mouse' || a.closest('#peek'))) { e.preventDefault(); openPeek(id, a); return; }
    if ((a.closest('.wrap') && !a.closest('.hexmap')) || a.closest('#pop') || a === chip) mark(a);
    drawer(false); hidePop();
    if (id === hashId()) flash(id);
  });

  // 目录高亮
  const secs = $$('section.top, section.top > section.lv2');
  const parts = $$('.part');
  const pbLinks = new Map($$('.pb a').map(a => [a.getAttribute('href').slice(1), a]));
  const pb = $('.pb');
  let lastPart = '';
  // 窄屏上回合控件固定在阶段条左侧，当前阶段要让出它的宽度
  const turnBox = $('.turn');
  const pbLead = () => turnBox && getComputedStyle(turnBox).position === 'sticky' ? turnBox.offsetWidth + 22 : 120;
  const chItems = new Map($$('.t-ch').map(li => [li.dataset.id, li]));
  const subLinks = new Map($$('.t-sub a').map(a => [a.getAttribute('href').slice(1), a]));
  const crumb = $('#crumb');
  const track = $('#track');
  let lastCh = '', lastSub = '', tick = false;
  const groups = new Map($$('.t-group').map(g => [g.dataset.part, g]));
  // 条目靠近侧栏上下边缘时，平滑移到中间偏上；已经在中间的不动，减少目录移动
  const revealRow = row => {
    if (!row || !row.getClientRects().length) return;
    const r = row.getBoundingClientRect(), tr = track.getBoundingClientRect(), pos = (r.top - tr.top) / tr.height;
    if (pos >= .15 && pos <= .65) return;
    track.scrollTo({ top: track.scrollTop + r.top - tr.top - tr.height * .35, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  // 目录只在页面停下后更新，滚动途中经过的章节不会让列表展开、收起或跟着滚动
  let wantPart = '', wantCh = '', wantSub = '', wantCrumb = '', lastGroup = '', tocTimer = 0, jumpLink = null, jumpY = 0;
  const applyToc = () => {
    if (wantPart !== lastGroup) {
      if (groups.get(lastGroup)) groups.get(lastGroup).classList.remove('cur');
      if (groups.get(wantPart)) groups.get(wantPart).classList.add('cur');
      lastGroup = wantPart;
    }
    const chChanged = wantCh !== lastCh;
    if (chChanged) {
      if (chItems.get(lastCh)) chItems.get(lastCh).classList.remove('on');
      if (chItems.get(wantCh)) chItems.get(wantCh).classList.add('on');
      lastCh = wantCh;
      crumb.textContent = wantCrumb;
    }
    if (wantSub !== lastSub) {
      if (subLinks.get(lastSub)) subLinks.get(lastSub).classList.remove('on');
      if (subLinks.get(wantSub)) subLinks.get(wantSub).classList.add('on');
      lastSub = wantSub;
    }
    const chRow = chItems.get(lastCh) ? chItems.get(lastCh).firstElementChild : null;
    if (jumpLink) {
      // 点目录跳转：先抵消小节列表收放造成的位移，避免跳动，再把条目移到合适的位置
      const clicked = jumpLink.getClientRects().length ? jumpLink : null;
      if (clicked) track.scrollTop += clicked.getBoundingClientRect().top - jumpY;
      revealRow(clicked || chRow);
      jumpLink = null;
    } else if (chChanged) revealRow(chRow);
  };
  const queueToc = delay => { clearTimeout(tocTimer); tocTimer = setTimeout(applyToc, delay); };
  track.addEventListener('click', e => {
    const a = e.target.closest('a');
    if (!a) return;
    jumpLink = a;
    jumpY = a.getBoundingClientRect().top;
    queueToc(300);
  });
  const spy = first => {
    tick = false;
    let cur = null;
    const lim = (parseInt(getComputedStyle(root).getPropertyValue('--stick')) || 44) + 46;
    for (const s of secs) { if (s.getBoundingClientRect().top <= lim) cur = s; else break; }
    let partId = '';
    for (const p of parts) { if (p.getBoundingClientRect().top <= lim) partId = p.id; else break; }
    if (partId !== lastPart) {
      if (pbLinks.get(lastPart)) pbLinks.get(lastPart).classList.remove('on');
      const a = pbLinks.get(partId);
      if (a) { a.classList.add('on'); pb.scrollLeft = a.offsetLeft - pbLead(); }
      lastPart = partId;
    }
    const ch = cur ? cur.closest('section.top') : null;
    wantPart = partId;
    wantCh = ch ? ch.id : '';
    wantSub = cur && !cur.classList.contains('top') ? cur.id : '';
    wantCrumb = ch ? ch.dataset.label : document.title.replace(/ 规则书$/, '');
    if (first === true) applyToc(); else queueToc(120);
  };
  addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(spy); } }, { passive: true });
  spy(true);

  // 搜索索引。要在清单加上勾选按钮之前建立，按钮文字才不会混进正文
  const ownText = s => {
    const c = s.cloneNode(true);
    $$('section', c).forEach(x => x.remove());
    $$('.ch,.rh>.src,.src', c).forEach(x => x.remove());
    return c.textContent.replace(/\s+/g, ' ').trim();
  };
  const entry = (id, n, t, b) => ({ id, n, t, b, nl: n.toLowerCase(), tl: t.toLowerCase(), bl: b.toLowerCase() });
  const index = $$('section[data-rule]').map(s => entry(s.id, s.dataset.rule, s.dataset.title, ownText(s)));
  // 流程中的小节并入索引
  $$('[data-turnflow] h3[data-rule]').forEach(h => {
    const box = h.parentElement.cloneNode(true); $('h3', box).remove();
    index.push(entry(h.id, h.dataset.rule, h.textContent.replace(h.dataset.rule, '').trim(), box.textContent.replace(/\s+/g, ' ').trim()));
  });
  const byId = new Map(index.map(e => [e.id, e]));

  // 最近查看
  let recent = readList(K + '-recent');
  function addRecent(id) {
    if (!byId.has(id)) return;
    recent = [id, ...recent.filter(x => x !== id)].slice(0, 8);
    store.set(K + '-recent', JSON.stringify(recent));
  }

  // 搜索面板
  const pal = $('#pal'), res = $('#results'), q = $('#q');
  const alias = (BOOK.aliases || []).map(g => g.map(s => String(s).toLowerCase()));
  // 一个词连同它的别名一起查，例如搜 ZOC 也能找到“控制区”
  const expand = t => { const s = new Set([t]); alias.forEach(g => { if (g.includes(t)) g.forEach(x => s.add(x)); }); return [...s]; };
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hi = (s, words) => {
    if (!words.length) return esc(s);
    const re = new RegExp('(' + words.map(reEsc).join('|') + ')', 'gi');
    return s.split(re).map((p, i) => i % 2 ? '<mark>' + esc(p) + '</mark>' : esc(p)).join('');
  };
  const rowHtml = (e, words, snip) => '<a class="r" role="option" href="#' + e.id + '"><b><i>' + esc(e.n) + '</i>' + hi(e.t, words) + '</b>' + (snip ? '<span>' + hi(snip, words) + '</span>' : '') + '</a>';
  let sel = 0;
  const rows = () => $$('.r', res);
  const setSel = (i, scroll) => {
    const rs = rows();
    if (!rs.length) return;
    sel = (i + rs.length) % rs.length;
    rs.forEach((r, k) => { r.classList.toggle('sel', k === sel); r.setAttribute('aria-selected', k === sel ? 'true' : 'false'); });
    if (scroll) rs[sel].scrollIntoView({ block: 'nearest' });
  };
  const search = () => {
    const v = q.value.trim().replace(/^§\s*/, '').toLowerCase();
    res.scrollTop = 0;
    if (!v) {
      const rs = recent.map(id => byId.get(id)).filter(Boolean);
      res.innerHTML = rs.length ? '<div class="r-h">最近查看</div>' + rs.map(e => rowHtml(e, [], '')).join('') : '<div class="r-empty">输入关键词或规则号，多个词用空格分开。</div>';
      setSel(0);
      return;
    }
    const whole = expand(v);
    const terms = whole.length > 1 ? [whole] : v.split(/\s+/).map(expand);
    const words = terms.flat().sort((a, b) => b.length - a.length);
    const hits = [];
    for (const e of index) {
      const hay = e.nl + ' ' + e.tl + ' ' + e.bl;
      if (!terms.every(alts => alts.some(a => hay.includes(a)))) continue;
      let score = 0;
      terms.forEach(alts => {
        if (e.nl === alts[0]) score += 100; else if (e.nl.startsWith(alts[0])) score += 50;
        if (alts.some(a => e.tl.includes(a))) score += 20;
      });
      hits.push([score, e]);
    }
    hits.sort((a, b) => b[0] - a[0]);
    if (!hits.length) { res.innerHTML = '<div class="r-empty">没有找到“' + esc(q.value.trim()) + '”。试试更短的词，例如“撤退”。</div>'; return; }
    res.innerHTML = hits.slice(0, 40).map(([, e]) => {
      let at = -1;
      for (const w of words) { const k = e.bl.indexOf(w); if (k >= 0 && (at < 0 || k < at)) at = k; }
      const from = Math.max(0, at - 16);
      const snip = e.b ? (from ? '…' : '') + e.b.slice(from, from + 72) + (e.b.length > from + 72 ? '…' : '') : '';
      return rowHtml(e, words, snip);
    }).join('');
    setSel(0);
  };
  const openPal = () => {
    if (peek.open) peek.close();
    drawer(false); hidePop();
    if (!pal.open) pal.showModal();
    search();
    q.focus(); q.select();
  };
  function pick(a) {
    const id = a.getAttribute('href').slice(1);
    pal.close();
    mark(null);
    goTo(id);
  }
  q.addEventListener('input', search);
  q.addEventListener('keydown', e => {
    if (e.isComposing || e.keyCode === 229) return; // 输入法选字时的回车和方向键不算
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setSel(sel + (e.key === 'ArrowDown' ? 1 : -1), true); }
    if (e.key === 'Enter') { e.preventDefault(); const r = rows()[sel]; if (r) pick(r); }
  });
  res.addEventListener('pointermove', e => { const r = e.target.closest('.r'); if (r) { const i = rows().indexOf(r); if (i !== sel) setSel(i); } });
  $$('.js-q').forEach(b => b.addEventListener('click', openPal));
  $('#pal-x').addEventListener('click', () => pal.close());
  pal.addEventListener('click', e => { if (e.target === pal) pal.close(); });
  addEventListener('keydown', e => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    const hot = (e.key === '/' && !typing) || ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey));
    if (hot && !$('#viewer').open) { e.preventDefault(); openPal(); }
  });

  // 规则预览的内容：悬停卡用精简版，底部预览保留示例和图
  const preview = (id, lite) => {
    const t = document.getElementById(id);
    if (!t) return null;
    let box, num, title, kids = [];
    if (t.matches('section')) {
      box = t.cloneNode(true); num = t.dataset.rule; title = t.dataset.title;
      kids = $$(':scope > section', t);
      $$('section', box).forEach(x => x.remove());
      $$(':scope > .ch, :scope > .rh', box).forEach(x => x.remove());
    } else {
      box = t.parentElement.cloneNode(true); num = t.dataset.rule || ''; title = t.textContent.replace(num, '').trim();
      const self = box.querySelector('#' + CSS.escape(id));
      if (self) self.remove();
    }
    $$('.src,.ck,.ck-reset,.tf-controls,.tf-now' + (lite ? ',details.ex,figure' : ''), box).forEach(x => x.remove());
    $$('ol.ckl', box).forEach(x => x.classList.remove('ckl'));
    $$('.done', box).forEach(x => x.classList.remove('done'));
    $$('[id]', box).forEach(x => x.removeAttribute('id'));
    let body = box.innerHTML;
    if (!box.textContent.trim() && kids.length) body = '<ul>' + kids.map(k => '<li><a class="xref" href="#' + k.id + '">' + esc(k.dataset.label) + '</a></li>').join('') + '</ul>';
    return { head: '<i>' + esc(num) + '</i>' + esc(title), body };
  };

  // 鼠标：悬停预览，可以把鼠标移进卡片里滚动
  const pop = $('#pop');
  let popTimer = 0, popFor = null;
  function hidePop() { clearTimeout(popTimer); pop.classList.remove('show'); popFor = null; }
  const showPop = a => {
    clearTimeout(popTimer);
    if (popFor === a) return;
    const p = preview(a.getAttribute('href').slice(1), true);
    if (!p) return;
    popFor = a;
    pop.innerHTML = '<div class="pt">' + p.head + '</div>' + p.body;
    pop.classList.add('show');
    pop.scrollTop = 0;
    const r = a.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    const x = Math.max(12, Math.min(r.left, innerWidth - pw - 12));
    const y = r.bottom + ph + 12 > innerHeight ? Math.max(12, r.top - ph - 8) : r.bottom + 8;
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
  };
  const hoverable = t => { const a = t.closest('.xref'); return a && !a.closest('#pop,#peek,#pal') ? a : null; };
  document.addEventListener('pointerover', e => { if (e.pointerType !== 'mouse') return; const a = hoverable(e.target); if (a) showPop(a); });
  document.addEventListener('pointerout', e => { if (hoverable(e.target)) { clearTimeout(popTimer); popTimer = setTimeout(hidePop, 180); } });
  pop.addEventListener('pointerenter', () => clearTimeout(popTimer));
  pop.addEventListener('pointerleave', hidePop);
  document.addEventListener('focusin', e => { const a = hoverable(e.target); if (a && ptr === 'mouse') showPop(a); });
  document.addEventListener('focusout', e => { if (hoverable(e.target)) hidePop(); });
  addEventListener('scroll', hidePop, { passive: true });

  // 触屏：点引用从底部弹出预览，不离开当前位置；预览里的引用可以继续点
  const peek = $('#peek'), pkT = $('#pk-t'), pkB = $('#pk-b'), pkPrev = $('#pk-prev');
  let pkStack = [], pkFrom = null;
  const fillPeek = () => {
    const id = pkStack[pkStack.length - 1], p = preview(id);
    pkT.innerHTML = p.head; pkB.innerHTML = p.body; pkB.scrollTop = 0;
    pkPrev.hidden = pkStack.length < 2;
    addRecent(id);
  };
  function openPeek(id, a) {
    if (!document.getElementById(id)) return;
    hidePop();
    if (!peek.open) { pkStack = []; pkFrom = a; }
    pkStack.push(id);
    fillPeek();
    if (!peek.open) peek.showModal();
  }
  pkPrev.addEventListener('click', () => { pkStack.pop(); fillPeek(); });
  $('#pk-x').addEventListener('click', () => peek.close());
  $('#pk-go').addEventListener('click', () => { const id = pkStack[pkStack.length - 1]; peek.close(); mark(pkFrom); goTo(id); });
  peek.addEventListener('click', e => { if (e.target === peek) peek.close(); });

  // 勾选清单：阶段操作清单和回合流程的步骤可以逐条勾掉，换回合时清空
  const lists = $$('.phase-card > ol, ol.tf-steps');
  const cks = [];
  lists.forEach(ol => {
    ol.classList.add('ckl');
    $$(':scope > li', ol).forEach(li => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ck';
      b.setAttribute('role', 'checkbox'); b.setAttribute('aria-checked', 'false'); b.setAttribute('aria-label', '这一步已完成');
      li.prepend(b); cks.push(b);
    });
  });
  const boxes = [...new Set(lists.map(ol => ol.closest('.phase-card,[data-turnflow]') || ol.parentElement))];
  boxes.forEach(box => {
    const r = document.createElement('button');
    r.type = 'button'; r.className = 'ck-reset'; r.textContent = '清空勾选'; r.hidden = true;
    box.appendChild(r);
  });
  const setCk = (b, on) => { b.setAttribute('aria-checked', on ? 'true' : 'false'); b.parentElement.classList.toggle('done', on); };
  const syncChecks = () => {
    boxes.forEach(box => { box.lastElementChild.hidden = !$('.ck[aria-checked="true"]', box); });
    store.set(K + '-ck', JSON.stringify(cks.map((b, i) => b.getAttribute('aria-checked') === 'true' ? i : -1).filter(i => i >= 0)));
  };
  function clearChecks(box) { cks.forEach(b => { if (!box || box.contains(b)) setCk(b, false); }); syncChecks(); }
  readList(K + '-ck').forEach(i => { if (cks[i]) setCk(cks[i], true); });
  syncChecks();
  document.addEventListener('click', e => {
    const b = e.target.closest('.ck');
    if (b && cks.includes(b)) { setCk(b, b.getAttribute('aria-checked') !== 'true'); syncChecks(); }
    const r = e.target.closest('.ck-reset');
    if (r) clearChecks(r.parentElement);
  });

  // 查看器：原文页与放大图
  const v = $('#viewer'), vi = $('#v-i'), vt = $('#v-t'), vp = $('#v-p'), vn = $('#v-n');
  let page = null;
  const showScan = p => {
    page = p;
    const el = document.getElementById('scan-' + (p + BOOK.offset));
    vi.src = el.textContent.trim();
    vi.alt = '原规则书第 ' + p + ' 页扫描图';
    vt.textContent = '原规则书 第 ' + p + ' 页';
    vp.style.display = vn.style.display = '';
    vp.disabled = p <= BOOK.firstPage; vn.disabled = p >= BOOK.lastPage;
    $('.v-s', v).scrollTop = 0;
    if (!v.open) v.showModal();
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('.src');
    if (b) { showScan(+b.dataset.p); return; }
    const img = e.target.closest('figure img,.ex img');
    if (img) {
      page = null; vi.src = img.src; vi.alt = img.alt; vt.textContent = img.alt;
      vp.style.display = vn.style.display = 'none';
      v.showModal();
    }
  });
  vp.addEventListener('click', () => { if (page > BOOK.firstPage) showScan(page - 1); });
  vn.addEventListener('click', () => { if (page < BOOK.lastPage) showScan(page + 1); });
  $('#v-c').addEventListener('click', () => v.close());
  v.addEventListener('click', e => { if (e.target.classList.contains('v-s')) v.close(); });
  v.addEventListener('keydown', e => { if (page && e.key === 'ArrowLeft') vp.click(); if (page && e.key === 'ArrowRight') vn.click(); });

  if (location.hash) flash(hashId());
})();
