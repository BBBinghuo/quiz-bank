'use strict';

/* ========== 小工具 ========== */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nowISO = () => new Date().toISOString();
const LETTERS = 'ABCDEFGHIJ';
const TYPE_LABEL = { single: '單選', multi: '多選', fill: '填空' };
const DATA_PATH = 'data/questions.json';
const LS = { data: 'qb_data_v1', cfg: 'qb_cfg_v1', stats: 'qb_stats_v1', practice: 'qb_practice_v1' };

function lsGet(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 無痕模式等 */ } }

function toast(msg, ms = 2500) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function hashText(s) {
  let h = 5381;
  for (const ch of s) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0;
  return h.toString(36);
}

/* 章節排序：前面的數字 → 名稱 */
function chapterRank(c) { const m = String(c).match(/^\d+/); return m ? +m[0] : 9999; }
function compareChapter(a, b) { return chapterRank(a) - chapterRank(b) || a.localeCompare(b, 'zh-Hant'); }
const REALMS = ['練氣', '築基', '結丹', '金丹', '元嬰', '化神', '煉虛', '合體', '大乘', '渡劫'];
const STAGES = ['初期', '中期', '後期', '大圓滿'];
function levelRank(l) {
  const r = REALMS.findIndex(x => l.includes(x));
  const s = STAGES.findIndex(x => l.includes(x));
  return (r < 0 ? 99 : r) * 10 + (s < 0 ? 9 : s);
}
function compareLevel(a, b) { return levelRank(a) - levelRank(b) || a.localeCompare(b, 'zh-Hant'); }

/* ========== 資料 ========== */
const emptyDB = () => ({ version: 1, questions: {} });
let DB = emptyDB();
let dirty = false;
let cfg = {};
let stats = {};
let sync = { state: 'loading', msg: '' };

function normalizeDB(x) {
  if (x && x.questions && typeof x.questions === 'object') return { version: 1, questions: x.questions };
  return emptyDB();
}

/* 合併兩份題庫：同一題取 updatedAt 較新的那份（刪除也是一種更新） */
function mergeDB(a, b) {
  const out = { version: 1, questions: {} };
  for (const src of [a, b]) {
    for (const [id, q] of Object.entries(src.questions || {})) {
      const cur = out.questions[id];
      if (!cur || (q.updatedAt || '') > (cur.updatedAt || '')) out.questions[id] = q;
    }
  }
  return out;
}

const active = () => Object.values(DB.questions).filter(q => !q.deleted);
const hasAnswer = q => Array.isArray(q.answer) && q.answer.length > 0;
const textKey = q => q.type + '|' + q.text.replace(/\s+/g, '');

function saveLocal() { lsSet(LS.data, { db: DB, dirty }); }

function commit() {
  dirty = true;
  saveLocal();
  renderBadge();
  schedulePush();
}

/* ========== GitHub 同步 ========== */
function detectRepo() {
  const host = location.hostname;
  if (host.endsWith('.github.io')) {
    const owner = host.split('.')[0];
    const seg = location.pathname.split('/').filter(Boolean)[0];
    return { owner, repo: seg && !seg.includes('.') ? seg : host };
  }
  return {};
}
const repoReady = () => cfg.owner && cfg.repo;
const canPush = () => repoReady() && cfg.token;
const apiUrl = () => `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${DATA_PATH}`;
function ghHeaders(raw) {
  const h = { Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json' };
  if (cfg.token) h.Authorization = 'Bearer ' + cfg.token;
  return h;
}
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

async function fetchRemote() {
  if (repoReady()) {
    try {
      const r = await fetch(`${apiUrl()}?ref=${encodeURIComponent(cfg.branch || 'main')}&_=${Date.now()}`, { headers: ghHeaders(true), cache: 'no-store' });
      if (r.ok) return normalizeDB(await r.json());
    } catch { /* 改用網站上的檔案 */ }
  }
  const r = await fetch(`${DATA_PATH}?_=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error('讀不到 ' + DATA_PATH);
  return normalizeDB(await r.json());
}

let pushTimer = null, pushing = false;
function schedulePush() {
  if (!canPush()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushRemote, 1200);
}

async function pushRemote() {
  if (!canPush()) { renderBadge(); return false; }
  if (pushing) { schedulePush(); return false; }
  pushing = true;
  sync = { state: 'saving', msg: '' };
  renderBadge();
  const branch = cfg.branch || 'main';
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      let sha, remote = emptyDB();
      const g = await fetch(`${apiUrl()}?ref=${encodeURIComponent(branch)}&_=${Date.now()}`, { headers: ghHeaders(false), cache: 'no-store' });
      if (g.ok) {
        const j = await g.json();
        sha = j.sha;
        if (j.content) remote = normalizeDB(JSON.parse(b64decode(j.content)));
        else if (j.size > 0) {
          const raw = await fetch(`${apiUrl()}?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders(true), cache: 'no-store' });
          remote = normalizeDB(await raw.json());
        }
      } else if (g.status !== 404) {
        throw new Error(ghError(g.status));
      }
      const merged = mergeDB(remote, DB);
      const n = Object.values(merged.questions).filter(q => !q.deleted).length;
      const body = { message: `更新題庫（共 ${n} 題）`, content: b64encode(JSON.stringify(merged, null, 1) + '\n'), branch };
      if (sha) body.sha = sha;
      const p = await fetch(apiUrl(), { method: 'PUT', headers: { ...ghHeaders(false), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (p.ok) {
        const changed = JSON.stringify(merged) !== JSON.stringify(DB);
        DB = merged;
        dirty = false;
        saveLocal();
        sync = { state: 'ok', msg: '' };
        if (changed) renderCurrent();
        renderBadge();
        return true;
      }
      if (p.status === 409 || p.status === 422) continue; // 別台電腦剛好也在存，重試
      throw new Error(ghError(p.status));
    }
    throw new Error('多次衝突，請稍後再試');
  } catch (e) {
    sync = { state: 'error', msg: e.message };
    renderBadge();
    return false;
  } finally {
    pushing = false;
  }
}

function ghError(status) {
  if (status === 401) return 'Token 無效或已過期';
  if (status === 403) return 'Token 沒有寫入權限（需要 Contents: Read and write）';
  if (status === 404) return '找不到儲存庫，請檢查帳號 / 儲存庫名稱，或 Token 沒有授權這個儲存庫';
  return 'GitHub 回應錯誤 ' + status;
}

async function pullAndMerge() {
  sync = { state: 'loading', msg: '' };
  renderBadge();
  try {
    const remote = await fetchRemote();
    const before = JSON.stringify(remote.questions);
    DB = mergeDB(remote, DB);
    dirty = dirty || JSON.stringify(DB.questions) !== before;
    saveLocal();
    sync = { state: 'ok', msg: '' };
    if (dirty) schedulePush();
  } catch (e) {
    sync = { state: 'error', msg: '無法讀取線上題庫，目前顯示本機資料' };
  }
  renderBadge();
  renderCurrent();
}

function renderBadge() {
  const b = $('#sync-badge');
  let cls = 'ok', txt = '✔ 已同步';
  if (sync.state === 'loading') { cls = ''; txt = '讀取中…'; }
  else if (sync.state === 'saving') { cls = ''; txt = '上傳中…'; }
  else if (sync.state === 'error') { cls = 'bad'; txt = '⚠ ' + sync.msg; }
  else if (dirty && !canPush()) { cls = 'warn'; txt = '⚠ 變更只存在這台電腦（到「設定」填 Token）'; }
  else if (dirty) { cls = 'warn'; txt = '有未上傳的變更'; }
  b.className = 'badge ' + cls;
  b.textContent = txt;
}

/* ========== 解析練習頁 HTML ========== */
function cleanText(s) {
  return s.replace(/ /g, ' ').split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function parseQuizHTML(html, filename) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let title = ($('#quiz-info-display h3', doc)?.textContent || doc.title || filename || '').trim();
  title = title.replace(/\s*-\s*獵妖與修練.*$/, '').replace(/\.html?$/i, '').trim();
  const m = title.match(/^(.*?)\s*[（(]([^（()）]*)[）)]\s*$/);
  const chapter = (m ? m[1] : title).trim() || '未分類';
  const level = m ? m[2].trim() : '';
  const h1 = $$('h1', doc).map(h => h.textContent.trim()).find(t => t.includes(chapter)) || '';
  const dm = h1.match(/[（(]([^（()）]*)[）)]\s*$/);
  const difficulty = dm ? dm[1].trim() : '';

  const items = [];
  const seen = new Set();
  for (const block of $$('.question-block', doc)) {
    const input = $('input[name^="answers["]', block);
    if (!input) continue; // 跳過驗證題與陷阱題
    const idm = input.name.match(/^answers\[([^\]]+)\]/);
    let id = idm ? idm[1] : '';
    let q;
    if (input.type === 'text') {
      const box = ($('.options .question-text', block) || $('.options', block)).cloneNode(true);
      $$('input', box).forEach(i => i.replaceWith(doc.createTextNode(' ＿＿＿ ')));
      let text = cleanText(box.textContent);
      const hm = text.match(/[（(]\s*(請[^（()）]*)[）)]\s*$/);
      const hint = hm ? hm[1].trim() : '';
      if (hm) text = text.slice(0, hm.index).trim();
      q = { type: 'fill', text, hint, options: {} };
    } else {
      const qt = $('p.question-text', block) || $('.question-text', block);
      const text = cleanText((qt?.textContent || '').replace(/^\s*\S{0,8}?\s*\d+\s*[.．、]\s*/, ''));
      const options = {};
      const display = [];
      $$('label', block).forEach((lab, idx) => {
        const inp = $('input', lab);
        if (!inp || !inp.name.startsWith('answers[')) return;
        const raw = cleanText(lab.textContent);
        const lm = raw.match(/^([A-Z])\s*[.．、]\s*/);
        const optText = lm ? raw.slice(lm[0].length) : raw;
        const key = inp.value || LETTERS[idx];
        options[key] = optText;
        display.push({ disp: lm ? lm[1] : LETTERS[display.length], key });
      });
      q = { type: input.type === 'checkbox' ? 'multi' : 'single', text, hint: '', options, display };
    }
    if (!q.text && !Object.keys(q.options).length) continue;
    if (!id) id = 'h' + hashText(textKey(q));
    if (seen.has(id)) continue;
    seen.add(id);
    q.id = String(id);
    items.push(q);
  }
  return { filename, chapter, level, difficulty, items };
}

function findExisting(q) {
  const byId = DB.questions[q.id];
  if (byId && !byId.deleted) return byId;
  const k = textKey(q);
  return active().find(x => textKey(x) === k) || null;
}

/* ========== 題目卡片 ========== */
const view = {
  tab: 'bank', chapter: '', level: '', search: '', filter: 'all',
  editing: null, importResults: null, pr: null,
};

function sortedKeys(q) { return Object.keys(q.options || {}).sort(); }

/* 依某份檔案的選項順序，把解答轉成「B. xxx」 */
function answerText(q, display) {
  if (!hasAnswer(q)) return '';
  if (q.type === 'fill') return q.answer.join(' / ');
  const ans = new Set(q.answer);
  const order = display || sortedKeys(q).map(k => ({ disp: k, key: k }));
  return order.filter(d => ans.has(d.key)).map(d => `${d.disp}. ${q.options[d.key] ?? ''}`).join('　');
}

function tagsHTML(q, extra = '') {
  return `<div class="tags">
    <span class="tag">${esc(q.chapter)}</span>
    ${q.level ? `<span class="tag grey">${esc(q.level)}</span>` : ''}
    ${q.difficulty ? `<span class="tag grey">${esc(q.difficulty)}</span>` : ''}
    <span class="tag grey">${TYPE_LABEL[q.type] || q.type}</span>
    ${hasAnswer(q) ? '' : '<span class="tag warn">尚無解答</span>'}
    ${extra}
    <span class="muted" style="margin-left:auto">#${esc(q.id)}</span>
  </div>`;
}

function editorHTML(q) {
  let inner;
  if (q.type === 'fill') {
    inner = `<label>正確答案（有多種寫法可用 <code>|</code> 分隔，例如 <code>lgn | log n</code>）
      <input type="text" name="ed-fill" value="${esc((q.answer || []).join(' | '))}"></label>`;
  } else {
    const ans = new Set(q.answer || []);
    const t = q.type === 'single' ? 'radio' : 'checkbox';
    inner = '<div class="muted">勾選正確的選項：</div>' + sortedKeys(q).map(k =>
      `<label><input type="${t}" name="ed-opt" value="${esc(k)}" ${ans.has(k) ? 'checked' : ''}> ${esc(k)}. ${esc(q.options[k])}</label>`).join('');
  }
  return `<div class="editor">${inner}
    <label>筆記（可留空）<textarea name="ed-note" rows="2">${esc(q.note || '')}</textarea></label>
    <div class="card-actions">
      <button data-act="cancel-edit">取消</button>
      <button class="primary" data-act="save-edit" data-id="${esc(q.id)}">儲存解答</button>
    </div></div>`;
}

function cardHTML(q, o = {}) {
  const editing = view.editing === q.id;
  let body = '';
  if (q.type === 'fill') {
    body = `<div class="answer-line">答案：${hasAnswer(q) ? `<b>${esc(answerText(q))}</b>` : '<span class="muted">尚無解答</span>'}</div>`;
  } else {
    const ans = new Set(q.answer || []);
    const order = o.display || sortedKeys(q).map(k => ({ disp: k, key: k }));
    body = '<ul class="opts">' + order.map(d =>
      `<li class="${ans.has(d.key) ? 'correct' : ''}">${esc(d.disp)}. ${esc(q.options[d.key])}</li>`).join('') + '</ul>';
    if (o.display && hasAnswer(q)) body += `<div class="answer-line">此份檔案的答案：<b>${esc(answerText(q, o.display))}</b></div>`;
  }
  return `<div class="card ${o.cls || ''}" data-qid="${esc(q.id)}">
    ${tagsHTML(q, o.extraTags || '')}
    ${o.prefix || ''}<div class="qtext">${esc(q.text)}</div>
    ${q.hint ? `<div class="hint">（${esc(q.hint)}）</div>` : ''}
    ${editing ? editorHTML(q) : body}
    ${!editing && q.note ? `<div class="note">📝 ${esc(q.note)}</div>` : ''}
    ${editing || o.readonly ? '' : `<div class="card-actions">
      <button data-act="edit" data-id="${esc(q.id)}">${hasAnswer(q) ? '修改解答' : '✏️ 填寫解答'}</button>
      ${o.noDelete ? '' : `<button class="danger" data-act="delete" data-id="${esc(q.id)}">刪除</button>`}
    </div>`}
  </div>`;
}

function saveEdit(id, card) {
  const q = DB.questions[id];
  if (!q) return;
  let answer;
  if (q.type === 'fill') answer = $('[name=ed-fill]', card).value.split('|').map(s => s.trim()).filter(Boolean);
  else answer = $$('[name=ed-opt]:checked', card).map(i => i.value).sort();
  const note = $('[name=ed-note]', card).value.trim();
  DB.questions[id] = { ...q, answer, note, updatedAt: nowISO() };
  view.editing = null;
  commit();
  renderCurrent();
  toast('已儲存解答');
}

function deleteQuestion(id) {
  const q = DB.questions[id];
  if (!q || !confirm('確定要刪除這題嗎？\n\n' + q.text.slice(0, 80))) return;
  DB.questions[id] = { ...q, deleted: true, updatedAt: nowISO() };
  commit();
  renderCurrent();
  toast('已刪除');
}

/* ========== 題庫頁 ========== */
function chapterTree(list = active()) {
  const tree = new Map();
  for (const q of list) {
    if (!tree.has(q.chapter)) tree.set(q.chapter, new Map());
    const lv = tree.get(q.chapter);
    lv.set(q.level || '', (lv.get(q.level || '') || 0) + 1);
  }
  return [...tree.keys()].sort(compareChapter).map(ch => {
    const lv = tree.get(ch);
    const levels = [...lv.keys()].sort(compareLevel).map(l => ({ level: l, count: lv.get(l) }));
    return { chapter: ch, count: levels.reduce((s, x) => s + x.count, 0), levels };
  });
}

function renderBank() {
  const all = active();
  const tree = chapterTree(all);
  const btn = (ch, lv, label, count, cls = '') =>
    `<button class="${cls} ${view.chapter === ch && view.level === lv ? 'active' : ''}" data-act="pick-ch" data-ch="${esc(ch)}" data-lv="${esc(lv)}">${esc(label)} <span class="count">${count}</span></button>`;
  $('#chapter-list').innerHTML = btn('', '', '全部章節', all.length) + tree.map(t =>
    btn(t.chapter, '', t.chapter, t.count) +
    (t.levels.length > 1 || t.levels[0].level ? t.levels.map(l => btn(t.chapter, l.level, l.level || '（未分）', l.count, 'lv')).join('') : '')
  ).join('');

  const s = view.search.trim().toLowerCase();
  let list = all.filter(q =>
    (!view.chapter || q.chapter === view.chapter) &&
    (!view.level || (q.level || '') === view.level) &&
    (view.filter === 'all' || (view.filter === 'answered') === hasAnswer(q)) &&
    (!s || [q.text, q.hint, q.note, ...Object.values(q.options || {}), ...(q.answer || []), q.id].join('\n').toLowerCase().includes(s)));
  list.sort((a, b) => compareChapter(a.chapter, b.chapter) || compareLevel(a.level || '', b.level || '') || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));

  const answered = all.filter(hasAnswer).length;
  $('#bank-summary').textContent = `題庫共 ${all.length} 題（已有解答 ${answered} 題）　目前顯示 ${list.length} 題`;
  $('#bank-list').innerHTML = list.length ? list.map(q => cardHTML(q)).join('')
    : `<div class="panel muted">${all.length ? '沒有符合條件的題目。' : '題庫還是空的，到「匯入 / 查詢」匯入練習頁的 HTML 檔吧！'}</div>`;
}

/* ========== 匯入 / 查詢 ========== */
async function handleFiles(files) {
  const addNew = $('#add-new').checked;
  const results = [];
  let added = 0;
  const now = nowISO();
  for (const f of files) {
    let parsed;
    try { parsed = parseQuizHTML(await f.text(), f.name); } catch (e) { results.push({ filename: f.name, error: e.message, items: [] }); continue; }
    for (const item of parsed.items) {
      const exist = findExisting(item);
      if (exist) { item.status = 'exists'; item.dbId = exist.id; continue; }
      item.status = 'new';
      item.dbId = item.id;
      if (addNew) {
        DB.questions[item.id] = {
          id: item.id, chapter: parsed.chapter, level: parsed.level, difficulty: parsed.difficulty,
          type: item.type, text: item.text, hint: item.hint, options: item.options,
          answer: [], note: '', createdAt: now, updatedAt: now,
        };
        item.added = true;
        added++;
      }
    }
    results.push(parsed);
  }
  view.importResults = results;
  if (added) commit();
  renderImport();
  toast(added ? `已新增 ${added} 題到題庫` : '沒有新題目需要加入');
}

function renderImport() {
  const box = $('#import-results');
  const res = view.importResults;
  if (!res) { box.innerHTML = ''; return; }
  box.innerHTML = res.map(r => {
    if (r.error || !r.items.length) {
      return `<div class="panel"><h2>${esc(r.filename)}</h2><p class="muted">${r.error ? '讀取失敗：' + esc(r.error) : '這個檔案裡找不到題目。請確認是練習頁面存下來的 HTML。'}</p></div>`;
    }
    const known = r.items.filter(i => i.status === 'exists');
    const withAns = known.filter(i => hasAnswer(DB.questions[i.dbId] || {}));
    const added = r.items.filter(i => i.added).length;
    const cards = r.items.map((it, n) => {
      const q = DB.questions[it.dbId];
      const prefix = `<div class="muted">第 ${n + 1} 題</div>`;
      if (!q || q.deleted) {
        // 沒加入題庫的新題目：只顯示，不能編輯
        const tmp = { ...it, chapter: r.chapter, level: r.level, difficulty: r.difficulty, answer: [] };
        return cardHTML(tmp, { cls: 'new', display: it.display, prefix, extraTags: '<span class="tag warn">題庫沒有</span>', readonly: true });
      }
      const tag = it.status === 'new' ? '<span class="tag warn">新加入</span>' : '<span class="tag ok">題庫已有</span>';
      return cardHTML(q, { cls: hasAnswer(q) ? 'known' : 'new', display: it.display, prefix, extraTags: tag, noDelete: true });
    }).join('');
    return `<div class="panel">
      <h2>${esc(r.chapter)}${r.level ? `（${esc(r.level)}）` : ''}${r.difficulty ? ` · ${esc(r.difficulty)}` : ''}</h2>
      <div class="muted">${esc(r.filename)}</div>
      <div class="summary-stats">
        <div class="stat">共 <b>${r.items.length}</b> 題</div>
        <div class="stat">題庫已有 <b>${known.length}</b> 題</div>
        <div class="stat">其中有解答 <b>${withAns.length}</b> 題</div>
        <div class="stat">本次新增 <b>${added}</b> 題</div>
      </div>
    </div>${cards}`;
  }).join('');
}

/* ========== 刷題 ========== */
function practiceSettings() {
  return lsGet(LS.practice, { picks: null, onlyAnswered: true, types: ['single', 'multi', 'fill'], count: '', shuffleQ: true, shuffleOpt: false, mode: 'all' });
}

function practicePool(ps) {
  const picks = new Set(ps.picks || []);
  return active().filter(q =>
    picks.has(q.chapter + '||' + (q.level || '')) &&
    ps.types.includes(q.type) &&
    (!ps.onlyAnswered || hasAnswer(q)) &&
    (ps.mode !== 'wrong' || (stats[q.id] && stats[q.id].last === 'w')) &&
    (ps.mode !== 'unseen' || !stats[q.id]));
}

function readPracticeForm() {
  const root = $('#practice-root');
  return {
    picks: $$('input.pick:checked', root).map(i => i.value),
    onlyAnswered: $('#ps-answered', root).checked,
    types: $$('input.ps-type:checked', root).map(i => i.value),
    count: $('#ps-count', root).value,
    shuffleQ: $('#ps-shuffleq', root).checked,
    shuffleOpt: $('#ps-shuffleopt', root).checked,
    mode: $('#ps-mode', root).value,
  };
}

function updatePracticeCount() {
  const ps = readPracticeForm();
  lsSet(LS.practice, ps);
  const n = practicePool(ps).length;
  const want = parseInt(ps.count, 10);
  const real = want > 0 ? Math.min(want, n) : n;
  const b = $('#ps-start');
  b.textContent = `開始刷題（${real} 題）`;
  b.disabled = real === 0;
  $$('.tree .chapter').forEach(div => {
    const kids = $$('input.pick', div);
    const on = kids.filter(k => k.checked).length;
    const head = $('input.ch', div);
    head.checked = on === kids.length;
    head.indeterminate = on > 0 && on < kids.length;
  });
}

function renderPracticeSetup() {
  const ps = practiceSettings();
  const tree = chapterTree();
  const all = tree.flatMap(t => t.levels.map(l => t.chapter + '||' + l.level));
  const picks = new Set(ps.picks ?? all);
  const answeredCount = (ch, lv) => active().filter(q => q.chapter === ch && (q.level || '') === lv && hasAnswer(q)).length;
  $('#practice-root').innerHTML = `<div class="panel">
    <h2>選擇要刷的章節</h2>
    ${tree.length ? `<div class="row" style="margin:0 0 8px"><button data-act="ps-all">全選</button><button data-act="ps-none">全不選</button></div>
    <div class="tree">${tree.map(t => `<div class="chapter">
      <label><input type="checkbox" class="ch"> ${esc(t.chapter)} <span class="muted">(${t.count})</span></label>
      <div class="levels">${t.levels.map(l => {
        const v = t.chapter + '||' + l.level;
        return `<label><input type="checkbox" class="pick" value="${esc(v)}" ${picks.has(v) ? 'checked' : ''}> ${esc(l.level || '全部')}
          <span class="muted">(${l.count} 題，有解答 ${answeredCount(t.chapter, l.level)})</span></label>`;
      }).join('')}</div></div>`).join('')}</div>` : '<p class="muted">題庫還是空的，先去「匯入 / 查詢」匯入題目。</p>'}
  </div>
  <div class="panel">
    <h2>刷題選項</h2>
    <div class="opts-grid">
      <label class="check"><input type="checkbox" id="ps-answered" ${ps.onlyAnswered ? 'checked' : ''}> 只出有解答的題目</label>
      <label class="check"><input type="checkbox" id="ps-shuffleq" ${ps.shuffleQ ? 'checked' : ''}> 題目隨機順序</label>
      <label class="check"><input type="checkbox" id="ps-shuffleopt" ${ps.shuffleOpt ? 'checked' : ''}> 選項隨機順序</label>
      <div>題型：${['single', 'multi', 'fill'].map(t => `<label style="display:inline"><input type="checkbox" class="ps-type" value="${t}" ${ps.types.includes(t) ? 'checked' : ''}> ${TYPE_LABEL[t]}</label>`).join('　')}</div>
      <label>題目範圍：<select id="ps-mode">
        <option value="all" ${ps.mode === 'all' ? 'selected' : ''}>全部題目</option>
        <option value="wrong" ${ps.mode === 'wrong' ? 'selected' : ''}>只練上次答錯的</option>
        <option value="unseen" ${ps.mode === 'unseen' ? 'selected' : ''}>只練沒做過的</option>
      </select></label>
      <label>題數：<input type="number" id="ps-count" min="1" placeholder="全部" value="${esc(ps.count)}" style="width:90px"></label>
    </div>
    <div class="row"><button id="ps-start" class="primary" data-act="ps-start">開始刷題</button></div>
    <p class="muted" style="font-size:.85em">對錯紀錄只存在這台電腦。快捷鍵：數字鍵選選項、Enter 提交 / 下一題。</p>
  </div>`;
  if (tree.length) updatePracticeCount();
  else $('#ps-start').disabled = true;
}

function startPractice() {
  const ps = readPracticeForm();
  let pool = practicePool(ps);
  if (ps.shuffleQ) pool = shuffle(pool);
  else pool.sort((a, b) => compareChapter(a.chapter, b.chapter) || compareLevel(a.level || '', b.level || '') || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  const want = parseInt(ps.count, 10);
  if (want > 0) pool = pool.slice(0, want);
  if (!pool.length) return;
  view.pr = { ids: pool.map(q => q.id), i: 0, shuffleOpt: ps.shuffleOpt, results: [], cur: null };
  newCurrent();
  renderPractice();
}

function newCurrent() {
  const pr = view.pr;
  const q = DB.questions[pr.ids[pr.i]];
  if (!q) { pr.cur = null; return; }
  const keys = sortedKeys(q);
  pr.cur = { order: pr.shuffleOpt ? shuffle(keys) : keys, submitted: false, chosen: [], fill: '', ok: null };
}

function normFill(s) {
  return String(s).normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

function submitAnswer() {
  const pr = view.pr, cur = pr.cur;
  const q = DB.questions[pr.ids[pr.i]];
  if (!cur || cur.submitted || !q) return;
  const root = $('#practice-root');
  if (q.type === 'fill') cur.fill = $('#pr-fill', root).value;
  else cur.chosen = $$('input[name=pr-opt]:checked', root).map(i => i.value);
  if (q.type !== 'fill' && !cur.chosen.length) { toast('請先選擇答案'); return; }
  if (q.type === 'fill' && !cur.fill.trim()) { toast('請先輸入答案'); return; }
  cur.submitted = true;
  if (hasAnswer(q)) {
    if (q.type === 'fill') cur.ok = q.answer.some(a => normFill(a) === normFill(cur.fill));
    else cur.ok = [...cur.chosen].sort().join() === [...q.answer].sort().join();
    const s = stats[q.id] || { r: 0, w: 0 };
    if (cur.ok) s.r++; else s.w++;
    s.last = cur.ok ? 'r' : 'w';
    s.t = nowISO();
    stats[q.id] = s;
    lsSet(LS.stats, stats);
    pr.results.push({ id: q.id, ok: cur.ok });
  } else {
    pr.results.push({ id: q.id, ok: null });
  }
  renderPractice();
}

function nextQuestion() {
  const pr = view.pr;
  pr.i++;
  view.editing = null;
  if (pr.i < pr.ids.length) newCurrent();
  renderPractice();
}

function renderPractice() {
  const root = $('#practice-root');
  const pr = view.pr;
  if (!pr) { renderPracticeSetup(); return; }

  if (pr.i >= pr.ids.length) {
    const graded = pr.results.filter(r => r.ok !== null);
    const right = graded.filter(r => r.ok).length;
    const wrong = graded.filter(r => !r.ok).map(r => DB.questions[r.id]).filter(Boolean);
    root.innerHTML = `<div class="panel">
      <h2>完成！</h2>
      <div class="big">${right} / ${graded.length}</div>
      <div class="muted">${graded.length ? `正確率 ${Math.round(right / graded.length * 100)}%` : ''}${pr.results.length > graded.length ? `　（${pr.results.length - graded.length} 題沒有解答未計分）` : ''}</div>
      <div class="row"><button class="primary" data-act="pr-again">再刷一次（同樣設定）</button><button data-act="pr-exit">回到選擇章節</button></div>
    </div>
    ${wrong.length ? `<h3>答錯的題目</h3>${wrong.map(q => cardHTML(q, { noDelete: true })).join('')}` : ''}`;
    return;
  }

  const q = DB.questions[pr.ids[pr.i]];
  const cur = pr.cur;
  if (!q || !cur) { nextQuestion(); return; }
  const pct = Math.round(pr.i / pr.ids.length * 100);
  const ans = new Set(q.answer || []);
  let body;
  if (q.type === 'fill') {
    body = `<input id="pr-fill" class="fill-input" type="text" autocomplete="off" value="${esc(cur.fill)}" ${cur.submitted ? 'disabled' : ''} placeholder="輸入答案後按 Enter">`;
  } else {
    const t = q.type === 'single' ? 'radio' : 'checkbox';
    const chosen = new Set(cur.chosen);
    body = cur.order.map((k, n) => {
      let cls = '';
      if (cur.submitted && hasAnswer(q)) cls = ans.has(k) ? 'right' : (chosen.has(k) ? 'wrong' : '');
      return `<label class="choice ${cls}"><input type="${t}" name="pr-opt" value="${esc(k)}" ${chosen.has(k) ? 'checked' : ''} ${cur.submitted ? 'disabled' : ''}>
        <span>${LETTERS[n]}. ${esc(q.options[k])}</span></label>`;
    }).join('');
  }
  let result = '';
  if (cur.submitted) {
    if (!hasAnswer(q)) {
      result = `<div class="result warn">這題題庫裡還沒有解答，無法判斷對錯。知道答案的話可以現在填上：</div>
        ${cardHTML(q, { noDelete: true })}`;
    } else {
      const disp = q.type === 'fill' ? q.answer.join(' / ')
        : cur.order.map((k, n) => ans.has(k) ? `${LETTERS[n]}. ${q.options[k]}` : null).filter(Boolean).join('　');
      result = `<div class="result ${cur.ok ? 'ok' : 'bad'}">${cur.ok ? '✔ 答對了！' : '✘ 答錯了'}　正確答案：<b>${esc(disp)}</b></div>
        ${q.note ? `<div class="note">📝 ${esc(q.note)}</div>` : ''}`;
    }
  }
  const right = pr.results.filter(r => r.ok).length;
  root.innerHTML = `<div class="panel">
    <div class="row" style="margin:0;justify-content:space-between">
      <span>第 ${pr.i + 1} / ${pr.ids.length} 題　<span class="muted">答對 ${right}</span></span>
      <button data-act="pr-exit">結束刷題</button>
    </div>
    <div class="progress"><div style="width:${pct}%"></div></div>
    ${tagsHTML(q)}
    <div class="qtext">${esc(q.text)}</div>
    ${q.hint ? `<div class="hint">（${esc(q.hint)}）</div>` : ''}
    ${q.type === 'multi' ? '<div class="hint">（可複選）</div>' : ''}
    ${body}
    <div class="row">${cur.submitted
      ? `<button class="primary" data-act="pr-next" id="pr-next">${pr.i + 1 < pr.ids.length ? '下一題 →' : '看結果'}</button>`
      : '<button class="primary" data-act="pr-submit">提交答案</button>'}</div>
    ${result}
  </div>`;
  if (!cur.submitted && q.type === 'fill') $('#pr-fill').focus();
}

/* ========== 設定 ========== */
function fillSettingsForm() {
  $('#cfg-owner').value = cfg.owner || '';
  $('#cfg-repo').value = cfg.repo || '';
  $('#cfg-branch').value = cfg.branch || 'main';
  $('#cfg-token').value = cfg.token ? '••••••••（已設定）' : '';
  $('#cfg-msg').textContent = canPush() ? '✔ 這台電腦已設定 Token，變更會自動上傳。' : '這台電腦尚未設定 Token：可以瀏覽與刷題，但新增 / 修改的內容只會存在這台電腦。';
}

async function saveSettings() {
  cfg.owner = $('#cfg-owner').value.trim();
  cfg.repo = $('#cfg-repo').value.trim();
  cfg.branch = $('#cfg-branch').value.trim() || 'main';
  const tk = $('#cfg-token').value.trim();
  if (tk && !tk.startsWith('••')) cfg.token = tk;
  lsSet(LS.cfg, cfg);
  $('#cfg-msg').textContent = '連線中…';
  await pullAndMerge();
  if (canPush()) {
    const ok = await pushRemote();
    fillSettingsForm();
    $('#cfg-msg').textContent = ok ? '✔ 連線成功，題庫已同步到 GitHub。' : '✘ ' + sync.msg;
  } else {
    fillSettingsForm();
  }
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(DB, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `questions-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importJSON(file) {
  try {
    const data = normalizeDB(JSON.parse(await file.text()));
    const n = Object.keys(data.questions).length;
    DB = mergeDB(DB, data);
    commit();
    renderCurrent();
    toast(`已合併備份（${n} 題）`);
  } catch (e) {
    toast('備份檔格式不正確');
  }
}

/* ========== 畫面切換與事件 ========== */
function renderCurrent() {
  if (view.tab === 'bank') renderBank();
  else if (view.tab === 'import') renderImport();
  else if (view.tab === 'practice') {
    // 刷題中途不重畫，避免打斷作答；只在設定畫面時更新
    if (!view.pr) renderPracticeSetup();
  } else if (view.tab === 'settings') fillSettingsForm();
}

function switchTab(tab) {
  view.tab = tab;
  view.editing = null;
  $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + tab));
  if (tab === 'practice') renderPractice(); else renderCurrent();
  try { history.replaceState(null, '', '#' + tab); } catch { /* ignore */ }
}

function rerenderAfterEdit() {
  if (view.tab === 'practice' && view.pr) renderPractice(); else renderCurrent();
}

document.addEventListener('click', e => {
  const tabBtn = e.target.closest('.tabs button');
  if (tabBtn) { switchTab(tabBtn.dataset.tab); return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;
  switch (act) {
    case 'pick-ch': view.chapter = el.dataset.ch; view.level = el.dataset.lv; renderBank(); break;
    case 'edit': view.editing = id; rerenderAfterEdit(); break;
    case 'cancel-edit': view.editing = null; rerenderAfterEdit(); break;
    case 'save-edit': saveEdit(id, el.closest('.card')); if (view.tab === 'practice') renderPractice(); break;
    case 'delete': deleteQuestion(id); break;
    case 'ps-all': $$('#practice-root input.pick').forEach(i => { i.checked = true; }); updatePracticeCount(); break;
    case 'ps-none': $$('#practice-root input.pick').forEach(i => { i.checked = false; }); updatePracticeCount(); break;
    case 'ps-start': startPractice(); break;
    case 'pr-submit': submitAnswer(); break;
    case 'pr-next': nextQuestion(); break;
    case 'pr-exit': view.pr = null; view.editing = null; renderPractice(); break;
    case 'pr-again': view.pr = null; renderPracticeSetup(); startPractice(); break;
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  if (!t.closest('#practice-root') || view.pr) return;
  if (t.classList.contains('ch')) $$('input.pick', t.closest('.chapter')).forEach(i => { i.checked = t.checked; });
  updatePracticeCount();
});
document.addEventListener('input', e => {
  if (e.target.id === 'ps-count') updatePracticeCount();
});

document.addEventListener('keydown', e => {
  if (view.tab !== 'practice' || !view.pr || !view.pr.cur || view.editing) return;
  const cur = view.pr.cur;
  const inText = e.target.matches('input[type=text], textarea');
  if (e.key === 'Enter') {
    e.preventDefault();
    if (cur.submitted) nextQuestion(); else submitAnswer();
    return;
  }
  if (inText || cur.submitted) return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 9) {
    const inp = $$('#practice-root input[name=pr-opt]')[n - 1];
    if (inp) { inp.checked = inp.type === 'radio' ? true : !inp.checked; }
  }
});

function setupStatic() {
  $('#search').addEventListener('input', e => { view.search = e.target.value; renderBank(); });
  $('#filter').addEventListener('change', e => { view.filter = e.target.value; renderBank(); });
  $('#sync-badge').addEventListener('click', async () => { await pullAndMerge(); if (canPush() && dirty) pushRemote(); });

  const fi = $('#file-input'), dz = $('#drop-zone');
  fi.addEventListener('change', () => { if (fi.files.length) handleFiles([...fi.files]); fi.value = ''; });
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('over');
    const files = [...e.dataTransfer.files].filter(f => /\.html?$/i.test(f.name));
    if (files.length) handleFiles(files); else toast('請拖曳 .html 檔案');
  });

  $('#cfg-save').addEventListener('click', saveSettings);
  $('#cfg-token').addEventListener('focus', e => { if (e.target.value.startsWith('••')) e.target.value = ''; });
  $('#cfg-clear-token').addEventListener('click', () => { delete cfg.token; lsSet(LS.cfg, cfg); fillSettingsForm(); renderBadge(); toast('已移除 Token'); });
  $('#export-json').addEventListener('click', exportJSON);
  $('#import-json').addEventListener('change', e => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ''; });
  $('#reset-stats').addEventListener('click', () => {
    if (!confirm('確定要清除這台電腦的刷題對錯紀錄嗎？')) return;
    stats = {};
    lsSet(LS.stats, stats);
    toast('已清除');
  });

  window.addEventListener('beforeunload', e => {
    if (pushTimer && dirty && canPush()) { e.preventDefault(); e.returnValue = ''; }
  });
}

function init() {
  cfg = { branch: 'main', ...detectRepo(), ...lsGet(LS.cfg, {}) };
  stats = lsGet(LS.stats, {});
  const local = lsGet(LS.data, null);
  if (local && local.db) { DB = normalizeDB(local.db); dirty = !!local.dirty; }
  setupStatic();
  const start = location.hash.slice(1);
  switchTab(['bank', 'import', 'practice', 'settings'].includes(start) ? start : 'bank');
  renderBadge();
  pullAndMerge();
}

init();
