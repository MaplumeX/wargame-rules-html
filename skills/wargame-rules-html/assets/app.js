(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  // 主题：日间 / 夜间
  const saved = store.get(BOOK.storage + '-theme');
  if (saved) root.dataset.theme = saved;
  const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme:dark)').matches;
  $('#t-th').addEventListener('click', () => { const v = isDark() ? 'light' : 'dark'; root.dataset.theme = v; store.set(BOOK.storage + '-theme', v); });

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
    $$('details.ex').forEach(d => { d.open = exOpen; });
    exBtn.textContent = exOpen ? '折叠全部示例' : '展开全部示例';
  });
  addEventListener('beforeprint', () => $$('details.ex').forEach(d => { d.open = true; }));

  // 回合流程筛选
  const TF = $('[data-turnflow]');
  const nowBox = $('#tf-now'), chip = $('#turn-chip');
  const has = (v, t) => (v || '').trim().split(/\s+/).includes(t);
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
  const setTurn = t => {
    if (!chip) return;
    const b = t ? $('[data-turn="' + t + '"]') : null;
    applyTime(b ? b.dataset.time : 'all');
    $$('.tt-c,.tt-all').forEach(x => x.setAttribute('aria-pressed', x === (b || $('.tt-all')) ? 'true' : 'false'));
    $$('tr[data-cal]').forEach(x => x.classList.toggle('now', x.dataset.cal === String(t)));
    if (!b) { if (nowBox) { nowBox.hidden = true; nowBox.innerHTML = ''; } chip.textContent = '选择回合'; store.set(BOOK.storage + '-turn', ''); return; }
    const lab = ('回合 ' + t + ' · ' + b.dataset.date + ' ' + b.dataset.label).trim();
    chip.textContent = lab;
    store.set(BOOK.storage + '-turn', t);
    if (!nowBox) return;
    const row = $('tr[data-cal="' + t + '"]');
    const cards = row ? $$('td[data-col]', row).filter(td => td.dataset.empty === undefined).map(td => '<div><h4>' + td.dataset.col + '</h4><div>' + td.innerHTML + '</div></div>').join('') : '';
    nowBox.innerHTML = '<b>' + lab + '</b>' + (cards ? '<div class="now-g">' + cards + '</div>' : '<p>这一回合没有增援或特殊事件。</p>');
    nowBox.hidden = false;
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('.tt-c,.tt-all');
    if (b) setTurn(b.dataset.turn ? +b.dataset.turn : null);
  });
  { const t = +store.get(BOOK.storage + '-turn'); setTurn(t >= 1 && t <= BOOK.turns ? t : null); }

  // 跳转高亮
  const flash = id => {
    const t = document.getElementById(id);
    if (!t) return;
    if (t.closest('[data-turnflow]') && !t.getClientRects().length) setTurn(null);
    const h = t.matches('section') ? t.querySelector(':scope > .ch, :scope > .rh') : t;
    if (!h) return;
    h.classList.remove('flash'); void h.offsetWidth; h.classList.add('flash');
  };
  addEventListener('hashchange', () => flash(location.hash.slice(1)));
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (a) { drawer(false); hidePop(); if (a.getAttribute('href') === location.hash) flash(a.getAttribute('href').slice(1)); }
  });

  // 目录高亮
  const secs = $$('section.top, section.top > section.lv2');
  const parts = $$('.part');
  const pbLinks = new Map($$('.pb a').map(a => [a.getAttribute('href').slice(1), a]));
  const pb = $('.pb');
  let lastPart = '';
  const chItems = new Map($$('.t-ch').map(li => [li.dataset.id, li]));
  const subLinks = new Map($$('.t-sub a').map(a => [a.getAttribute('href').slice(1), a]));
  const crumb = $('#crumb');
  const track = $('#track');
  let lastCh = '', lastSub = '', tick = false;
  const spy = () => {
    tick = false;
    let cur = null;
    const lim = (parseInt(getComputedStyle(root).getPropertyValue('--stick')) || 44) + 46;
    for (const s of secs) { if (s.getBoundingClientRect().top <= lim) cur = s; else break; }
    let partId = '';
    for (const p of parts) { if (p.getBoundingClientRect().top <= lim) partId = p.id; else break; }
    if (partId !== lastPart) {
      if (pbLinks.get(lastPart)) pbLinks.get(lastPart).classList.remove('on');
      const a = pbLinks.get(partId);
      if (a) { a.classList.add('on'); pb.scrollLeft = a.offsetLeft - 120; }
      lastPart = partId;
    }
    const ch = cur ? cur.closest('section.top') : null;
    const chId = ch ? ch.id : '';
    const subId = cur && !cur.classList.contains('top') ? cur.id : '';
    if (chId !== lastCh) {
      if (lastCh && chItems.get(lastCh)) chItems.get(lastCh).classList.remove('on');
      const li = chItems.get(chId);
      if (li) { li.classList.add('on'); const r = li.getBoundingClientRect(), tr = track.getBoundingClientRect(); if (r.top < tr.top || r.bottom > tr.bottom) track.scrollTop += r.top - tr.top - 40; }
      lastCh = chId;
      crumb.textContent = ch ? ch.dataset.label : document.title.replace(/ 规则书$/, '');
    }
    if (subId !== lastSub) {
      if (subLinks.get(lastSub)) subLinks.get(lastSub).classList.remove('on');
      if (subLinks.get(subId)) subLinks.get(subId).classList.add('on');
      lastSub = subId;
    }
  };
  addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(spy); } }, { passive: true });
  spy();

  // 搜索
  const ownText = s => {
    const c = s.cloneNode(true);
    $$('section', c).forEach(x => x.remove());
    $$('.ch,.rh>.src,.src', c).forEach(x => x.remove());
    return c.textContent.replace(/\s+/g, ' ').trim();
  };
  const index = $$('section[data-rule]').map(s => ({ id: s.id, n: s.dataset.rule, t: s.dataset.title, b: ownText(s), tl: s.dataset.title.toLowerCase() }));
  // 流程中的小节并入索引
  $$('[data-turnflow] h3[data-rule]').forEach(h => {
    const box = h.parentElement.cloneNode(true); $('h3', box).remove();
    index.push({ id: h.id, n: h.dataset.rule, t: h.textContent.replace(h.dataset.rule, '').trim(), b: box.textContent.replace(/\s+/g, ' ').trim(), tl: h.textContent.toLowerCase() });
  });
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const res = $('#results'), q = $('#q');
  const hi = (s, terms) => { let h = esc(s); terms.forEach(t => { h = h.split(esc(t)).join('\u0001' + esc(t) + '\u0002'); }); return h.replace(/\u0001/g, '<mark>').replace(/\u0002/g, '</mark>'); };
  const search = () => {
    const v = q.value.trim();
    const on = v.length > 0;
    res.classList.toggle('show', on);
    track.classList.toggle('hide', on);
    if (!on) { res.innerHTML = ''; return; }
    const terms = v.toLowerCase().split(/\s+/);
    const hits = [];
    for (const e of index) {
      const hay = (e.n + ' ' + e.t + ' ' + e.b).toLowerCase();
      if (!terms.every(t => hay.includes(t))) continue;
      let score = 0;
      terms.forEach(t => { if (e.n === t || e.n.startsWith(t)) score += 50; if (e.tl.includes(t)) score += 20; });
      hits.push([score, e]);
    }
    hits.sort((a, b) => b[0] - a[0]);
    if (!hits.length) { res.innerHTML = '<div class="r-empty">没有找到“' + esc(v) + '”。试试更短的词，例如“撤退”。</div>'; return; }
    res.innerHTML = hits.slice(0, 40).map(([, e]) => {
      const low = e.b.toLowerCase(); const at = Math.max(0, low.indexOf(terms[0]) - 16);
      const snip = (at ? '…' : '') + e.b.slice(at, at + 64) + '…';
      return '<a class="r" href="#' + e.id + '"><b><i>' + esc(e.n) + '</i>' + hi(e.t, [v]) + '</b><span>' + hi(snip, terms) + '</span></a>';
    }).join('');
  };
  q.addEventListener('input', search);
  q.addEventListener('keydown', e => { if (e.key === 'Escape') { q.value = ''; search(); q.blur(); } if (e.key === 'Enter') { const a = $('.r', res); if (a) a.click(); } });
  addEventListener('keydown', e => {
    if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName) && !$('#viewer').open) { e.preventDefault(); drawer(true); q.focus(); q.select(); }
  });

  // 引用悬停预览
  const pop = $('#pop');
  const hover = matchMedia('(hover:hover)').matches;
  function hidePop() { pop.classList.remove('show'); }
  const showPop = a => {
    const id = a.getAttribute('href').slice(1);
    const t = document.getElementById(id);
    if (!t) return;
    let box, num, title;
    if (t.matches('section')) { box = t.cloneNode(true); num = t.dataset.rule; title = t.dataset.title; $$('section', box).forEach(x => x.remove()); }
    else { box = t.parentElement.cloneNode(true); num = t.dataset.rule; title = t.textContent.replace(num, '').trim(); }
    $$('.ch,.rh,details.ex,figure,.src', box).forEach(x => x.remove());
    pop.innerHTML = '<div class="pt"><i>' + esc(num) + '</i>' + esc(title) + '</div>' + box.innerHTML;
    pop.classList.add('show');
    const r = a.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    const x = Math.max(12, Math.min(r.left, innerWidth - pw - 12));
    const y = r.bottom + ph + 12 > innerHeight ? Math.max(12, r.top - ph - 8) : r.bottom + 8;
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
  };
  if (hover) {
    document.addEventListener('mouseover', e => { const a = e.target.closest('.xref'); if (a) showPop(a); });
    document.addEventListener('mouseout', e => { if (e.target.closest('.xref')) hidePop(); });
  }
  document.addEventListener('focusin', e => { const a = e.target.closest('.xref'); if (a) showPop(a); });
  document.addEventListener('focusout', e => { if (e.target.closest('.xref')) hidePop(); });
  addEventListener('scroll', hidePop, { passive: true });

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

  if (location.hash) flash(location.hash.slice(1));
})();
