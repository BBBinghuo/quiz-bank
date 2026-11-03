'use strict';
/* ========== 答案卡：答案一樣的題目合成一張卡，依出現題數排序，先背最常考的 ========== */
(() => {
  const CD_LS = 'qb_cards_v1', CD_SET = 'qb_cards_set_v1';
  const MASTER = 3; // 連續記得 3 次算「已熟」
  let mem = lsGet(CD_LS, {}); // 卡片 key → { box: 0..3 }
  let session = null;

  /* 縮寫和全名當成同一個答案 */
  const ALIAS = {
    fcfs: 'firstcomefirstserved', sjf: 'shortestjobfirst', srtf: 'shortestremainingtimefirst', rr: 'roundrobin',
    mlfq: 'multilevelfeedbackqueue', pcb: 'processcontrolblock', ipc: 'interprocesscommunication',
    lwp: 'lightweightprocess', edf: 'earliestdeadlinefirst', rms: 'ratemonotonic',
  };
  /* 比對用：忽略空白、連字號、標點、結尾的 ()；漸進符號保留大小寫（O 和 o 不一樣） */
  function cdNorm(s) {
    let t = String(s).normalize('NFKC').replace(/[\s\-_,，、.。'’]/g, '').replace(/\(\)$/, '');
    t = t.replace(/^big(theta|o|omega)\(/i, (m, w) => ({ theta: 'Θ(', o: 'O(', omega: 'Ω(' })[w.toLowerCase()])
      .replace(/^little(o|omega)\(/i, (m, w) => (w.toLowerCase() === 'o' ? 'o(' : 'ω('))
      .replace(/^theta\(/i, 'Θ(').replace(/^omega\(/, 'ω(').replace(/^θ\(/, 'Θ(');
    if (/^[oOωΩΘ]\(/.test(t)) return t.replace(/lg/g, 'log');
    t = t.toLowerCase().replace(/(.{3,})(scheduling|algorithm)$/, '$1');
    return ALIAS[t] || t;
  }

  const altsOf = q => (q.answer || []).flatMap(a => String(a).split('|')).map(s => s.trim()).filter(Boolean);
  // 每一格（或整題）要顯示的答案
  function cdAnswers(q) {
    if (q.type === 'fill' && blankCount(q) > 1) return blankAlts(q).map(a => a[0] || '');
    if (q.type === 'fill') return [altsOf(q)[0] || ''];
    return [answerLines(q).join(' / ')];
  }

  function buildGroups(qs) {
    const parent = new Map();
    const find = k => { while (parent.get(k) !== k) k = parent.get(k); return k; };
    const union = (a, b) => {
      for (const k of [a, b]) if (!parent.has(k)) parent.set(k, k);
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent.set(rb, ra);
    };
    const items = [];
    for (const q of qs) {
      if (!hasAnswer(q)) continue;
      let keys;
      if (q.type === 'fill' && blankCount(q) > 1) keys = [blankAlts(q).map(a => cdNorm(a[0] || '')).join('/')];
      else if (q.type === 'fill') keys = altsOf(q).map(cdNorm);
      else keys = [cdNorm(answerLines(q).join(' '))];
      keys = keys.filter(Boolean);
      if (!keys.length) continue;
      keys.forEach(k => union(keys[0], k));
      items.push({ q, k: keys[0], keys });
    }
    const map = new Map();
    for (const it of items) {
      const r = find(it.k);
      if (!map.has(r)) map.set(r, { qs: [], keys: new Set(), forms: new Map() });
      const g = map.get(r);
      g.qs.push(it.q);
      it.keys.forEach(k => g.keys.add(k));
      const shown = cdAnswers(it.q).join(' / ');
      g.forms.set(shown, (g.forms.get(shown) || 0) + 1);
      if (it.q.type === 'fill' && blankCount(it.q) === 1) altsOf(it.q).slice(1).forEach(a => { if (!g.forms.has(a)) g.forms.set(a, 0); });
    }
    return [...map.values()].map(g => {
      const forms = [...g.forms].sort((a, b) => b[1] - a[1]).map(([f]) => f);
      const label = forms[0];
      const seen = new Set([normO(label)]);
      const variants = forms.slice(1).filter(f => !seen.has(normO(f)) && seen.add(normO(f)));
      const chapters = [...new Set(g.qs.map(q => subjectOf(q) + ' ' + q.chapter))];
      return { key: [...g.keys].sort()[0], qs: g.qs.sort(compareQ), label, variants, chapters };
    }).sort((a, b) => b.qs.length - a.qs.length || compareQ(a.qs[0], b.qs[0]));
  }

  const settings = () => ({ subject: 'all', chapter: 'all', types: ['fill'], count: 20, all: false, ...lsGet(CD_SET, {}) });
  const boxOf = key => (mem[key] && mem[key].box) || 0;
  function scopeQs(st) {
    return active().filter(q => st.types.includes(q.type) &&
      (st.subject === 'all' || subjectOf(q) === st.subject) &&
      (st.chapter === 'all' || q.chapter === st.chapter));
  }
  const groupsFor = st => buildGroups(scopeQs(st));
  // 依出現次數由多到少背，要背幾張才涵蓋 p 比例的題目
  function cardsToCover(groups, p) {
    const total = groups.reduce((s, g) => s + g.qs.length, 0);
    let sum = 0;
    for (let i = 0; i < groups.length; i++) { sum += groups[i].qs.length; if (sum >= total * p) return i + 1; }
    return groups.length;
  }
  const dots = key => `<span class="cd-dots" title="熟練度 ${boxOf(key)} / ${MASTER}">${[...Array(MASTER)].map((_, i) => `<i class="${i < boxOf(key) ? 'on' : ''}"></i>`).join('')}</span>`;

  function stemHTML(q, filled) {
    let html = kwHTML(blanksToLine(q.text), q);
    const parts = cdAnswers(q);
    let i = 0, hit = false;
    html = html.replace(/＿{2,}|_{3,}/g, () => {
      hit = true;
      if (!filled) return '<span class="cd-blank">＿＿＿</span>';
      return `<span class="cd-fill">${esc(parts[Math.min(i++, parts.length - 1)])}</span>`;
    });
    if (filled && !hit) html += ` <span class="cd-arrow">→</span> <span class="cd-fill">${esc(parts.join(' / '))}</span>`;
    return html;
  }

  function renderSetup(root) {
    const st = settings();
    const typed = active().filter(q => st.types.includes(q.type));
    const subjects = [...new Set(typed.map(subjectOf))].sort(compareSubject);
    const chapters = [...new Set(typed.filter(q => st.subject === 'all' || subjectOf(q) === st.subject).map(q => q.chapter))].sort(compareChapter);
    if (st.chapter !== 'all' && !chapters.includes(st.chapter)) st.chapter = 'all';
    const groups = groupsFor(st);
    const nq = groups.reduce((s, g) => s + g.qs.length, 0);
    const known = groups.filter(g => boxOf(g.key) >= MASTER).length;
    const todo = (st.all ? groups : groups.filter(g => boxOf(g.key) < MASTER)).length;
    const n = Math.min(todo, Math.max(1, +st.count || 20));
    const half = cardsToCover(groups, 0.5), most = cardsToCover(groups, 0.8);
    root.innerHTML = `<div class="panel">
      <h2>答案卡</h2>
      <p class="muted" style="margin-top:4px">答案一樣的題目合成<b>同一張卡</b>（縮寫和全名也算同一個，例如 FCFS = First-Come, First-Served）。
        卡片依<b>出現題數</b>由多到少排，先背最常考的。翻面前先想答案，再誠實按「記得」或「不熟」；不熟的卡會在幾張後再出現。</p>
      <div class="row">
        <label>科目 <select id="cd-subject"><option value="all">全部</option>${subjects.map(s => `<option ${s === st.subject ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
        <label>章節 <select id="cd-chapter"><option value="all">全部章節</option>${chapters.map(c => `<option ${c === st.chapter ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" class="cd-type" value="fill" ${st.types.includes('fill') ? 'checked' : ''}> 填空</label>
        <label class="check"><input type="checkbox" class="cd-type" value="recall" ${st.types.includes('recall') ? 'checked' : ''}> 選項未知</label>
        <label>一次背 <input type="number" id="cd-count" min="1" value="${esc(st.count)}" style="width:70px"> 張</label>
      </div>
      <div class="cd-stats">
        <div><b>${groups.length}</b><span>張卡</span></div>
        <div><b>${nq}</b><span>題</span></div>
        <div><b>${known}</b><span>張已熟</span></div>
        ${groups.length ? `<div class="wide">背前 <b>${half}</b> 張 → 答得出一半的題目；前 <b>${most}</b> 張 → 八成</div>` : ''}
      </div>
      ${groups.length && groups.length < nq ? `<p class="muted" style="margin:0">這個範圍只要背 ${groups.length} 個答案，不用背 ${nq} 題。</p>` : ''}
      <div class="row">
        <button class="primary" data-act="cd-start" ${n ? '' : 'disabled'}>${n ? `開始背（${n} 張）` : '這個範圍都背熟了'}</button>
        <label class="check"><input type="checkbox" id="cd-all" ${st.all ? 'checked' : ''}> 已熟的卡也要出</label>
        <button data-act="cd-reset">重設熟練度</button>
      </div>
      <p class="muted" style="font-size:.85em;margin-bottom:0">快捷鍵：空白鍵翻面，1 不熟、2 記得，Esc 結束。熟練度只存在這台電腦。</p>
    </div>
    ${groups.length ? `<div class="panel">
      <h3 style="margin-top:0">速記表 <span class="muted" style="font-size:.8em">由最常考的排起；點一列只背那一張</span></h3>
      <div class="table-wrap"><table class="cd-table">
        <tr><th>#</th><th>答案</th><th>題數</th><th>章節</th><th>熟練</th></tr>
        ${groups.map((g, i) => `<tr data-act="cd-one" data-key="${esc(g.key)}">
          <td class="muted">${i + 1}</td>
          <td><b class="kw">${esc(g.label)}</b>${g.variants.length ? `<div class="muted cd-var">也可寫：${g.variants.map(esc).join('、')}</div>` : ''}</td>
          <td>${g.qs.length}</td><td class="muted">${esc(g.chapters.join('、'))}</td><td>${dots(g.key)}</td></tr>`).join('')}
      </table></div></div>` : ''}`;
  }

  function startSession(keys) {
    if (!keys.length) { toast('這個範圍沒有可以背的卡'); return; }
    session = { queue: keys, total: keys.length, done: 0, good: 0, bad: 0, flipped: false, st: settings() };
    render();
  }
  function startFromSettings() {
    const st = settings();
    const pool = groupsFor(st).filter(g => st.all || boxOf(g.key) < MASTER);
    startSession(shuffle(pool.slice(0, Math.max(1, +st.count || 20)).map(g => g.key)));
  }

  function grade(ok) {
    const key = session.queue.shift();
    const box = boxOf(key);
    mem[key] = { box: ok ? Math.min(MASTER, box + 1) : 0 };
    lsSet(CD_LS, mem);
    if (ok) { session.good++; session.done++; } else {
      session.bad++;
      session.queue.splice(Math.min(3, session.queue.length), 0, key); // 隔幾張再考一次
    }
    session.flipped = false;
    render();
  }

  function renderCard(root) {
    const groups = groupsFor(session.st);
    while (session.queue.length && !groups.some(g => g.key === session.queue[0])) { session.queue.shift(); session.done++; }
    if (!session.queue.length) {
      const known = groups.filter(g => boxOf(g.key) >= MASTER).length;
      root.innerHTML = `<div class="panel">
        <h2>這一輪背完了！</h2>
        <div class="big">${session.total} 張</div>
        <div class="muted">按了 ${session.good} 次「記得」、${session.bad} 次「不熟」。這個範圍已熟 ${known} / ${groups.length} 張。</div>
        <p class="muted" style="font-size:.9em">每張卡要<b>連續記得 ${MASTER} 次</b>才算已熟，已熟的卡之後就不會再出；沒熟的會優先再出現。</p>
        <div class="row"><button class="primary" data-act="cd-start">再背一批</button><button data-act="cd-exit">回到答案卡</button></div>
      </div>`;
      return;
    }
    const g = groups.find(x => x.key === session.queue[0]);
    const f = session.flipped, n = g.qs.length, SHOW = 5;
    const li = q => `<li><span class="tag grey cd-ch">${esc(/^\d+$/.test(q.chapter) ? `第${q.chapter}章` : q.chapter)}</span>${stemHTML(q, f)}</li>`;
    root.innerHTML = `<div class="panel cd-card ${f ? 'flipped' : ''}">
      <div class="cd-top">
        <span class="muted">完成 ${session.done} / ${session.total} 張${session.queue.length > session.total - session.done ? `（含 ${session.queue.length - (session.total - session.done)} 張重考）` : ''}</span>
        ${dots(g.key)}
        <button data-act="cd-exit" style="margin-left:auto">結束</button>
      </div>
      <div class="progress"><div style="width:${session.done / session.total * 100}%"></div></div>
      <p class="cd-lbl">${n > 1 ? `這 <b>${n}</b> 題的答案都一樣，先想想是什麼：` : '先想想答案是什麼：'}</p>
      <ol class="cd-stems">${g.qs.slice(0, SHOW).map(li).join('')}</ol>
      ${n > SHOW ? `<details class="cd-more"><summary>還有 ${n - SHOW} 題</summary><ol class="cd-stems" start="${SHOW + 1}">${g.qs.slice(SHOW).map(li).join('')}</ol></details>` : ''}
      ${f ? `<div class="cd-ans"><span class="cd-ans-lbl">答案</span><b>${esc(g.label)}</b>
          ${g.variants.length ? `<div class="muted cd-var">也可寫：${g.variants.map(esc).join('、')}</div>` : ''}</div>
        ${explainHTML(g.qs[0])}
        <div class="row cd-grade">
          <button class="cd-bad" data-act="cd-grade" data-ok="0">✗ 不熟 <kbd>1</kbd></button>
          <button class="primary cd-good" data-act="cd-grade" data-ok="1">✓ 記得 <kbd>2</kbd></button>
        </div>`
        : `<div class="row"><button class="primary cd-flip" data-act="cd-flip">翻面看答案 <kbd>空白鍵</kbd></button></div>`}
    </div>`;
  }

  function render() {
    const root = $('#cards-root');
    if (!root) return;
    if (session) renderCard(root); else renderSetup(root);
  }
  window.renderCards = render;

  function saveSetting(patch) { lsSet(CD_SET, { ...settings(), ...patch }); render(); }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act^="cd-"]');
    if (!el || !el.closest('#cards-root')) return;
    switch (el.dataset.act) {
      case 'cd-start': session = null; startFromSettings(); break;
      case 'cd-one': startSession([el.dataset.key]); break;
      case 'cd-flip': session.flipped = true; render(); break;
      case 'cd-grade': grade(el.dataset.ok === '1'); break;
      case 'cd-exit': session = null; render(); window.scrollTo({ top: 0 }); break;
      case 'cd-reset':
        if (!confirm('確定要把所有答案卡的熟練度歸零嗎？')) return;
        mem = {}; lsSet(CD_LS, mem); render(); toast('已重設');
        break;
    }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (!t.closest('#cards-root')) return;
    if (t.id === 'cd-subject') saveSetting({ subject: t.value, chapter: 'all' });
    else if (t.id === 'cd-chapter') saveSetting({ chapter: t.value });
    else if (t.id === 'cd-all') saveSetting({ all: t.checked });
    else if (t.id === 'cd-count') saveSetting({ count: Math.max(1, parseInt(t.value, 10) || 20) });
    else if (t.classList.contains('cd-type')) {
      const types = $$('#cards-root .cd-type:checked').map(i => i.value);
      if (!types.length) { t.checked = true; return; }
      saveSetting({ types });
    }
  });
  document.addEventListener('keydown', e => {
    if (view.tab !== 'cards' || !session || !session.queue.length || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.matches?.('input, select, textarea') || document.querySelector('#trace-modal, #slides-modal')) return;
    if (e.key === 'Escape') { session = null; render(); return; }
    if (!session.flipped) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); session.flipped = true; render(); }
    } else if (e.key === '1') grade(false);
    else if (e.key === '2') grade(true);
  });

  window.cardGroups = st => groupsFor({ ...settings(), ...st }); // 方便檢查分組結果
  if (view.tab === 'cards') render();
})();
