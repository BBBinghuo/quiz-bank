'use strict';
/* ========== 重點動畫：把章節筆記變成逐項播放的投影片 ==========
 * 參考 AI_Animation 的 ppt-animation：一頁一個主題，翻頁後元素依序緩入。
 * 筆記先用 app.js 的 mdToHtml 轉成 HTML，再依「## 小節」切頁；內容太多的小節拆成好幾頁。
 * 每頁裡的清單項目、段落、表格列、提示框都是一個「片段」，按下一步就出現一個。
 */

const SLIDE_BUDGET = 8.5; // 每頁大約能放的份量（一個清單項目約 1）

function blockWeight(el) {
  const text = el.textContent.length;
  if (el.matches('ul, ol')) return el.querySelectorAll('li').length + text / 220;
  if (el.matches('.table-wrap')) return 1 + el.querySelectorAll('tr').length * 0.75;
  if (el.matches('pre')) return 1 + el.textContent.split('\n').length / 2.2;
  if (el.matches('.callout')) return 1.3 + text / 90;
  if (el.matches('h4')) return 0.6;
  return 0.6 + text / 75;
}

// 太長的清單或表格先拆成好幾塊，才能分頁
function splitBlock(el) {
  if (el.matches('ul, ol') && blockWeight(el) > SLIDE_BUDGET) {
    const parts = [];
    let cur = null, w = 0;
    for (const li of [...el.children]) {
      const lw = li.querySelectorAll('li').length + 1 + li.textContent.length / 220;
      if (!cur || w + lw > SLIDE_BUDGET - 1) { cur = el.cloneNode(false); parts.push(cur); w = 0; }
      cur.appendChild(li.cloneNode(true)); w += lw;
    }
    return parts;
  }
  if (el.matches('.table-wrap')) {
    const rows = [...el.querySelectorAll('tr')];
    if (rows.length > 9) {
      const parts = [];
      for (let k = 1; k < rows.length; k += 7) {
        const t = document.createElement('div'); t.className = 'table-wrap';
        const tb = document.createElement('table');
        tb.append(rows[0].cloneNode(true), ...rows.slice(k, k + 7).map(r => r.cloneNode(true)));
        t.appendChild(tb); parts.push(t);
      }
      return parts;
    }
  }
  return [el];
}

function buildSlides(html, chapter) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const sections = [];
  for (const node of [...tpl.content.children]) {
    if (node.matches('h3.note-h')) { sections.push({ title: node.innerHTML, blocks: [] }); continue; }
    if (node.matches('.rel')) continue; // 「相關題目」不放進投影片
    if (!sections.length) sections.push({ title: '', blocks: [] });
    sections.at(-1).blocks.push(...splitBlock(node));
  }
  const slides = [{ kind: 'cover', chapter, toc: sections.map(s => s.title).filter(Boolean) }];
  sections.forEach((s, si) => {
    let page = null, w = 0;
    const pages = [];
    for (const b of s.blocks) {
      const bw = blockWeight(b);
      if (!page || (w + bw > SLIDE_BUDGET && page.length)) { page = []; pages.push(page); w = 0; }
      page.push(b); w += bw;
    }
    pages.forEach((blocks, pi) => slides.push({ kind: 'content', title: s.title, sec: si + 1, part: pages.length > 1 ? `${pi + 1}/${pages.length}` : '', blocks }));
  });
  slides.push({ kind: 'end', chapter });
  return slides;
}

/* 把一頁內容標上片段：清單的每一項、表格的每一列、其他區塊各一個 */
function markFragments(box) {
  for (const el of box.querySelectorAll('.sl-content > *')) {
    if (el.matches('ul, ol')) el.querySelectorAll('li').forEach(li => li.classList.add('frag'));
    else if (el.matches('.table-wrap')) el.querySelectorAll('tr').forEach(tr => tr.classList.add('frag', 'frag-row'));
    else if (el.matches('pre')) {
      el.classList.add('frag');
      el.innerHTML = el.innerHTML.split('\n').map((l, k) => `<span class="ln" style="--k:${k}">${l || ' '}</span>`).join('\n');
    } else el.classList.add('frag');
  }
  return [...box.querySelectorAll('.frag')];
}

const show = { slides: [], si: 0, fi: 0, frags: [], timer: null, chapter: null, dir: 1 };

function slideHTML(s) {
  const c = s.chapter;
  if (s.kind === 'cover') {
    return `<div class="sl-cover">
      <div class="sl-kicker frag">${esc(c.subject)} › 第 ${esc(c.chapter)} 章</div>
      <h1 class="sl-big frag">${esc(c.title)}</h1>
      <div class="sl-src frag">${/^無課程投影片/.test(c.slides || '') ? esc(c.slides) : '依課程投影片整理：' + esc(c.slides || '')}</div>
      <ol class="sl-agenda">${s.toc.map(t => `<li class="frag">${t.replace(/^\d+\.\s*/, '')}</li>`).join('')}</ol>
    </div>`;
  }
  if (s.kind === 'end') {
    const n = chapterQuestions(c.subject, c.chapter).length;
    return `<div class="sl-cover sl-end">
      <div class="sl-kicker frag">${esc(c.subject)} › 第 ${esc(c.chapter)} 章</div>
      <h1 class="sl-big frag">這一章看完了！</h1>
      <div class="sl-src frag">${n ? `題庫裡這一章有 ${n} 題，趁記憶還熱的時候刷一輪吧。` : '題庫目前還沒有這一章的題目。'}</div>
      <div class="row frag">${n ? `<button class="primary" data-act="note-practice" data-scope="chapter">刷這一章（${n} 題）</button>` : ''}
        <button data-sl="restart">從頭再看一次</button><button data-sl="close">回到筆記</button></div>
    </div>`;
  }
  return `<div class="sl-title"><span class="sl-no">${s.sec}</span><h2>${s.title.replace(/^\d+\.\s*/, '')}</h2>${s.part ? `<span class="sl-part">${s.part}</span>` : ''}</div>
    <div class="sl-content">${s.blocks.map(b => b.outerHTML).join('')}</div>`;
}

async function openSlides() {
  const idx = await loadNotesIndex();
  const c = idx.find(x => x.subject === view.note.subject && x.chapter === view.note.chapter);
  if (!c || !c.file) { toast('這一章還沒有筆記'); return; }
  const { html } = mdToHtml(await loadNote(c.file));
  closeSlides();
  Object.assign(show, { slides: buildSlides(html, c), si: 0, fi: 0, chapter: c, dir: 1 });
  const m = document.createElement('div');
  m.id = 'slides-modal';
  m.innerHTML = `<div class="sl-bar"><div class="sl-progress"><i></i></div></div>
    <div class="sl-top"><b>${esc(c.title)}</b><span class="muted sl-page"></span>
      <button data-sl="full" title="全螢幕">⛶</button><button data-sl="close" title="關閉（Esc）">✕</button></div>
    <div class="sl-stage"><div class="sl-deck"></div></div>
    <div class="sl-ctrl">
      <button data-sl="prev" title="上一步（←）">◀ 上一步</button>
      <button data-sl="auto" class="sl-auto" title="自動播放（A）">▶ 自動播放</button>
      <button data-sl="next" class="primary" title="下一步（→ 或空白鍵）">下一步 ▶</button>
      <span class="muted sl-hint">點畫面右側＝下一步、左側＝上一步</span>
    </div>`;
  document.body.appendChild(m);
  document.body.classList.add('tr-open');
  renderSlide();
}

function closeSlides() {
  clearInterval(show.timer); show.timer = null;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  document.getElementById('slides-modal')?.remove();
  if (!document.getElementById('trace-modal')) document.body.classList.remove('tr-open');
}

function renderSlide() {
  const m = document.getElementById('slides-modal');
  if (!m) return;
  const deck = m.querySelector('.sl-deck');
  const s = show.slides[show.si];
  const old = deck.querySelector('.sl-slide');
  if (old) { old.classList.add(show.dir > 0 ? 'out-left' : 'out-right'); setTimeout(() => old.remove(), 450); }
  const el = document.createElement('div');
  el.className = `sl-slide sl-kind-${s.kind} ${show.dir > 0 ? 'in-right' : 'in-left'}`;
  el.innerHTML = slideHTML(s);
  deck.appendChild(el);
  show.frags = markFragments(el);
  if (s.kind !== 'content') show.frags = [...el.querySelectorAll('.frag')];
  // 往回翻時直接顯示整頁
  if (show.fi < 0) show.fi = show.frags.length;
  show.frags.forEach((f, k) => f.classList.toggle('on', k < show.fi));
  void el.offsetWidth; // 先套用起始位置，移除 class 時才會播放進場動畫
  el.classList.remove('in-right', 'in-left');
  updateChrome();
}

function updateChrome() {
  const m = document.getElementById('slides-modal');
  if (!m) return;
  const total = show.slides.length;
  m.querySelector('.sl-page').textContent = `${show.si + 1} / ${total}`;
  const done = show.frags.length ? show.fi / show.frags.length : 1;
  m.querySelector('.sl-progress i').style.width = ((show.si + done) / total) * 100 + '%';
  const last = show.frags[show.fi - 1];
  last?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function slideNext() {
  if (show.fi < show.frags.length) {
    show.frags[show.fi++].classList.add('on');
    updateChrome();
    return true;
  }
  if (show.si >= show.slides.length - 1) return false;
  show.si++; show.fi = 0; show.dir = 1;
  renderSlide();
  return true;
}

function slidePrev() {
  if (show.fi > 0) {
    show.frags[--show.fi].classList.remove('on');
    updateChrome();
    return;
  }
  if (show.si === 0) return;
  show.si--; show.fi = -1; show.dir = -1;
  renderSlide();
}

function toggleAuto(force) {
  const btn = document.querySelector('#slides-modal .sl-auto');
  const on = force ?? !show.timer;
  clearInterval(show.timer); show.timer = null;
  if (btn) btn.textContent = on ? '⏸ 暫停' : '▶ 自動播放';
  if (!on) return;
  // 一頁播完多停一下再翻頁
  let wait = 0;
  show.timer = setInterval(() => {
    if (wait-- > 0) return;
    const pageDone = show.fi >= show.frags.length;
    if (!slideNext()) { toggleAuto(false); return; }
    if (!pageDone && show.fi >= show.frags.length) wait = 1;
  }, 1800);
}

document.addEventListener('click', e => {
  if (e.target.closest('[data-act="note-slides"]')) { openSlides(); return; }
  const m = document.getElementById('slides-modal');
  if (!m || !m.contains(e.target)) return;
  if (e.target.closest('[data-act="note-practice"]')) { closeSlides(); return; } // app.js 會接著開始刷題
  const b = e.target.closest('[data-sl]');
  if (b) {
    const a = b.dataset.sl;
    if (a === 'close') closeSlides();
    else if (a === 'next') { toggleAuto(false); slideNext(); }
    else if (a === 'prev') { toggleAuto(false); slidePrev(); }
    else if (a === 'auto') toggleAuto();
    else if (a === 'restart') { show.si = 0; show.fi = 0; show.dir = -1; renderSlide(); }
    else if (a === 'full') (document.fullscreenElement ? document.exitFullscreen() : m.requestFullscreen?.())?.catch?.(() => {});
    return;
  }
  // 點投影片本身：右側下一步、左側上一步（點到連結或按鈕除外）
  const stage = e.target.closest('.sl-stage');
  if (stage && !e.target.closest('a, button')) {
    toggleAuto(false);
    const r = stage.getBoundingClientRect();
    if (e.clientX - r.left < r.width * 0.3) slidePrev(); else slideNext();
  }
});

document.addEventListener('keydown', e => {
  if (!document.getElementById('slides-modal')) return;
  const k = e.key;
  e.stopImmediatePropagation(); // 不要觸發刷題的快捷鍵
  if (k === 'Tab' || k === 'Enter') return;
  if (k === 'Escape' && !document.fullscreenElement) closeSlides();
  else if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(k)) { toggleAuto(false); slideNext(); }
  else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(k)) { toggleAuto(false); slidePrev(); }
  else if (k === 'a' || k === 'A') toggleAuto();
  else if (k === 'Home') { toggleAuto(false); show.si = 0; show.fi = 0; show.dir = -1; renderSlide(); }
  else return;
  e.preventDefault();
}, true);
