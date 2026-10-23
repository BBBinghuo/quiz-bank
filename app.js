'use strict';

/* ========== 小工具 ========== */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nowISO = () => new Date().toISOString();
const LETTERS = 'ABCDEFGHIJ';
const TYPE_LABEL = { single: '單選', multi: '多選', fill: '填空', recall: '選項未知' };
const ALL_TYPES = ['single', 'multi', 'fill', 'recall'];
const DATA_PATH = 'data/questions.json';
const LS = { data: 'qb_data_v1', cfg: 'qb_cfg_v1', stats: 'qb_stats_v1', practice: 'qb_practice_v3', subject: 'qb_subject_v1', chapter: 'qb_chapter_v1' };
const DEFAULT_SUBJECT = '演算法'; // 舊資料沒有科目欄位，一律視為演算法
const BASE_SUBJECTS = ['演算法', '作業系統'];

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
const subjectOf = q => q.subject || DEFAULT_SUBJECT;
const isTextAnswer = q => q.type === 'fill' || q.type === 'recall';
/* 「選項未知」：成績頁 / 文字題庫只給了正確選項，還沒匯入練習頁看到全部選項 */
const answerLines = q => (q.answer || []).flatMap(a => String(a).split('\n')).map(s => s.trim()).filter(Boolean);

/* 比對用的正規化：全形半形、大小寫、空白、填空格、作答提示都不影響比對 */
/* 填空記號：[**1**]、[__1__]、[1]、[ 1 ]；前面緊接英數字的 A[1]、B[2] 是陣列索引，不算 */
const BLANK_SRC = String.raw`\[\*\*\d+\*\*\]|\[_+\d+_+\]|(?<![A-Za-z0-9\])])\[\s*\d+\s*\]`;
const blankRe = () => new RegExp(BLANK_SRC, 'g');
const countBlanks = s => (String(s).match(blankRe()) || []).length;
const blanksToLine = s => String(s).replace(new RegExp('\\s*(?:' + BLANK_SRC + ')\\s*', 'g'), ' ＿＿＿ ').trim();

function normQ(s) {
  return String(s).normalize('NFKC').toLowerCase()
    .replace(blankRe(), '□').replace(/_{2,}/g, '□')
    .replace(/[(（]\s*請[^()（）]*[)）]/g, '')
    .replace(/\s+/g, '').replace(/□+/g, '□')
    .replace(/[。.？?！!：:]+$/, '');
}
const normO = s => String(s).normalize('NFKC').toLowerCase().replace(/\s+/g, '');

/* 把「正確答案」文字（選項內容用空白串起來）對應回選擇題的選項代號；對不完整就回傳 null */
function resolveKeys(q, str) {
  let rest = normO(str);
  const keys = [];
  const opts = Object.entries(q.options || {}).map(([k, v]) => [k, normO(v)]).filter(([, v]) => v)
    .sort((a, b) => b[1].length - a[1].length);
  for (const [k, v] of opts) {
    const i = rest.indexOf(v);
    if (i < 0) continue;
    keys.push(k);
    rest = rest.slice(0, i) + '\u0000' + rest.slice(i + v.length);
  }
  if (!keys.length || rest.replace(/[\u0000,，、;；]/g, '') !== '') return null;
  if (q.type === 'single' && keys.length !== 1) return null;
  return keys.sort();
}

/* 填空題：幾個空格；每格可接受的寫法（多格時每格用 | 分隔多種寫法） */
const blankCount = q => q.blanks || 1;
function blankAlts(q) {
  if (blankCount(q) === 1) return [q.answer || []];
  return (q.answer || []).map(s => String(s).split('|').map(t => t.trim()).filter(Boolean));
}

/* 正確答案（成績頁每行一個；或貼上的整段文字）轉成某一題的 answer 陣列；對不上回傳 null */
function deriveFromLines(q, lines) {
  lines = lines.map(s => String(s).trim()).filter(Boolean);
  if (!lines.length) return null;
  if (q.type === 'recall') return [lines.join('\n')];
  if (q.type === 'fill') {
    const n = blankCount(q);
    const joined = lines.join(',');
    if (n === 1) return [joined];
    const parts = joined.split('/').map(t => t.trim());
    return parts.length === n ? parts : null;
  }
  // 選擇題：先試「一行 = 一個選項」，不行再用整段文字比對
  const byText = new Map(Object.entries(q.options || {}).map(([k, v]) => [normO(v), k]));
  const keys = lines.map(l => byText.get(normO(l)));
  if (keys.every(Boolean) && new Set(keys).size === keys.length && (q.type !== 'single' || keys.length === 1)) return keys.sort();
  return resolveKeys(q, lines.join(' '));
}
const deriveAnswer = (q, str) => deriveFromLines(q, [str]);

function sameAnswer(q, ans) {
  if (q.type === 'fill') {
    const alts = blankAlts(q);
    if (blankCount(q) === 1) return ans.every(a => alts[0].some(b => normO(b) === normO(a)));
    return ans.length === alts.length && ans.every((a, i) => alts[i].some(b => normO(b) === normO(a)));
  }
  return [...q.answer].sort().join('|') === [...ans].sort().join('|');
}

function saveLocal() { lsSet(LS.data, { db: DB, dirty }); }

let dbVersion = 0;
function commit() {
  dbVersion++;
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

/* 取出元素文字：<pre> 保留原本排版（程式碼縮排），其他地方每行去頭尾空白 */
function domText(node) {
  let out = '';
  for (const n of node.childNodes) {
    if (n.nodeType === 3) out += n.nodeValue.replace(/\r/g, '').split('\n').map(l => l.replace(/[ \t ]+/g, ' ').trim()).join('\n');
    else if (n.nodeName === 'BR') out += '\n';
    else if (n.nodeName === 'PRE') out += '\n' + n.textContent.replace(/\r/g, '').replace(/\s+$/, '') + '\n';
    else if (n.nodeType === 1) out += (/^(P|DIV)$/.test(n.nodeName) ? '\n' : '') + domText(n);
  }
  return out;
}
const tidy = s => s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

/* 「3分治法陣(練氣中期)」→ 章節 + 境界 */
function splitTitle(title) {
  const m = title.match(/^(.*?)\s*[（(]([^（()）]*)[）)]\s*$/);
  return { chapter: (m ? m[1] : title).trim() || '未分類', level: m ? m[2].trim() : '' };
}

/* 成績頁（results.php）：有題目與正確答案，但沒有題號與選項 */
function parseResultHTML(doc, filename) {
  const head = $('.result-header', doc)?.textContent || '';
  const tm = head.match(/「([^」]+)」/);
  const { chapter, level } = splitTitle(tm ? tm[1] : '');
  const items = [];
  for (const block of $$('.question-result', doc)) {
    const labelP = label => $$('strong', block).find(s => s.textContent.trim().startsWith(label))?.closest('p');
    const ansP = labelP('正確答案');
    if (!ansP) continue;
    // 題目文字：「你的答案」之前的所有內容
    const clone = block.cloneNode(true);
    const stop = $$('strong', clone).find(s => /^(你的答案|正確答案)/.test(s.textContent.trim()))?.closest('p');
    if (stop) { let n = stop; while (n) { const next = n.nextSibling; n.remove(); n = next; } }
    $$('strong', clone).find(s => s.textContent.trim().startsWith('題目'))?.remove();
    let text = tidy(domText(clone));
    const lines = [];
    let cur = '';
    for (const n of ansP.childNodes) {
      if (n.nodeName === 'STRONG') continue;
      if (n.nodeName === 'BR') { lines.push(cur); cur = ''; } else cur += n.textContent;
    }
    lines.push(cur);
    const clean = lines.map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const blanks = countBlanks(text);
    let hint = '';
    const hm = text.match(/\s*[（(]\s*(請[^（()）]*)[）)]/);
    if (hm) { hint = hm[1].trim(); text = (text.slice(0, hm.index) + text.slice(hm.index + hm[0].length)).trim(); }
    text = blanksToLine(text).replace(/ +\n/g, '\n').trim();
    if (text && clean.length) items.push({ text, hint, blanks, type: blanks ? 'fill' : 'recall', lines: clean });
  }
  return { kind: 'result', filename, chapter, level, items };
}

function parseQuizHTML(html, filename) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if ($('.question-result', doc)) return parseResultHTML(doc, filename);
  let title = ($('#quiz-info-display h3', doc)?.textContent || doc.title || filename || '').trim();
  title = title.replace(/\s*-\s*獵妖與修練.*$/, '').replace(/\.html?$/i, '').trim();
  const { chapter, level } = splitTitle(title);
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
      const inputs = $$('input', box);
      inputs.forEach(i => i.replaceWith(doc.createTextNode(' ＿＿＿ ')));
      let text = tidy(domText(box)).replace(/ +\n/g, '\n');
      const hm = text.match(/\s*[（(]\s*(請[^（()）]*)[）)]/);
      const hint = hm ? hm[1].trim() : '';
      if (hm) text = (text.slice(0, hm.index) + text.slice(hm.index + hm[0].length)).trim();
      q = { type: 'fill', text, hint, options: {} };
      if (inputs.length > 1) q.blanks = inputs.length;
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
  return { kind: 'quiz', filename, chapter, level, difficulty, items };
}

/* 不同科目可能有相同的題號，所以題號只在同科目內有效 */
/* 選項組合（不管順序與代號），用來分辨「同題目、不同選項」 */
const optionSig = q => Object.values(q.options || {}).map(normO).sort().join('\u0001');
const baseId = id => String(id).split(/[@~]/)[0];

/* 同一題 = 同科目、（同題號或同題目文字）、且選項組合相同；選項不同就當成另一個版本 */
function findExisting(q, subject) {
  const sig = optionSig(q), k = textKey(q), id = String(q.id);
  return active().find(x => subjectOf(x) === subject && x.source !== 'text' &&
    (baseId(x.id) === id || textKey(x) === k) && optionSig(x) === sig) || null;
}
function freeId(q, subject) {
  const taken = id => DB.questions[id] && !DB.questions[id].deleted;
  let id = String(q.id);
  if (taken(id) && subjectOf(DB.questions[id]) !== subject) id += '@' + subject;
  if (taken(id)) id += '~' + hashText(optionSig(q)); // 同題號但選項不同的版本
  return id;
}
/* 這份檔案的選項代號 → 題庫裡同一個選項文字的代號（不同版本的代號可能不一樣） */
function remapDisplay(item, q) {
  const byText = new Map(Object.entries(q.options || {}).map(([k, v]) => [normO(v), k]));
  return (item.display || []).map(d => ({ disp: d.disp, key: byText.get(normO(item.options[d.key])) || d.key }));
}

/* 同題目有幾種選項版本 */
let variantCache = null;
function variantCount(q) {
  if (q.source === 'text' || q.type === 'fill') return 1;
  if (!variantCache || variantCache.db !== DB || variantCache.v !== dbVersion) {
    const map = new Map();
    for (const x of active()) {
      if (x.source === 'text' || x.type === 'fill') continue;
      const key = subjectOf(x) + '|' + normQ(x.text);
      map.set(key, (map.get(key) || 0) + 1);
    }
    variantCache = { db: DB, v: dbVersion, map };
  }
  return variantCache.map.get(subjectOf(q) + '|' + normQ(q.text)) || 1;
}

/* ========== 解析文字題庫（NotebookLM / 成績頁） ========== */
function parseTextBank(raw) {
  const entries = [];
  const chunks = String(raw).replace(/\r/g, '').split(/(?=題目\s*\d*\s*[：:])/);
  for (const chunk of chunks) {
    const qm = chunk.match(/題目\s*\d*\s*[：:]([\s\S]*?)(?=你的答案\s*[：:]|正確答案\s*[：:])/);
    const cm = chunk.match(/正確答案\s*[：:]([\s\S]*?)(?=得分\s*[：:]|$)/);
    if (!qm || !cm) continue;
    let text = cleanText(qm[1]);
    const correct = cleanText(cm[1]).replace(/\s+/g, ' ');
    if (!text || !correct) continue;
    const blanks = countBlanks(text);
    let hint = '';
    const hm = text.match(/\s*[（(]\s*(請[^（()）]*)[）)]/);
    if (hm) { hint = hm[1].trim(); text = (text.slice(0, hm.index) + text.slice(hm.index + hm[0].length)).trim(); }
    if (blanks) text = blanksToLine(text);
    entries.push({ text, hint, blanks, lines: [correct], type: blanks ? 'fill' : 'recall' });
  }
  return entries;
}

/* 題庫中「同科目、同題目」的選擇 / 填空題（不含文字匯入的紀錄本身） */
function sameTextQuestions(subject, text) {
  const k = normQ(text);
  return active().filter(q => q.source !== 'text' && subjectOf(q) === subject && normQ(q.text) === k);
}
function textRecordsFor(q) {
  const k = normQ(q.text), s = subjectOf(q);
  return active().filter(r => r.source === 'text' && subjectOf(r) === s && normQ(r.text) === k);
}
/* 答案紀錄轉成這份檔案的選項字母（例如「B. xxx　D. yyy」）；對不上選項就顯示原文 */
function refsFor(q, display) {
  return [...new Set(textRecordsFor(q).map(r => {
    const d = deriveFromLines(q, r.lines || r.answer);
    if (d) return answerText({ ...q, answer: d }, display);
    return r.type === 'recall' ? answerLines(r).join(' / ') : answerText(r);
  }))];
}

/*
 * 把「題目 + 正確答案」套進題庫。
 * official = true（成績頁）時，解答以成績頁為準；貼上的文字則不覆蓋既有解答。
 */
function applyEntries(entries, subject, chapter, level, official, prefer) {
  const now = nowISO();
  const report = [];
  for (const e of entries) {
    let resolved = sameTextQuestions(subject, e.text)
      .map(q => ({ q, ans: deriveFromLines(q, e.lines) })).filter(x => x.ans);
    // 好幾個版本都對得上時，優先用同一批匯入的練習頁那個版本
    if (resolved.length > 1 && prefer && prefer.size) {
      const inBatch = resolved.filter(x => prefer.has(x.q.id));
      if (inBatch.length === 1) resolved = inBatch;
    }
    if (resolved.length === 1) {
      const { q, ans } = resolved[0];
      let status;
      if (!hasAnswer(q)) status = 'filled';
      else if (sameAnswer(q, ans)) status = 'same';
      else status = official ? 'updated' : 'conflict';
      if (status === 'filled' || status === 'updated') DB.questions[q.id] = { ...q, answer: ans, updatedAt: now };
      report.push({ e, status, id: q.id });
      continue;
    }
    // 題庫沒有這題（或有好幾題同樣題目無法判斷）→ 先存成答案紀錄（選項未知）/ 填空題
    const shape = { type: e.type, blanks: e.blanks > 1 ? e.blanks : undefined };
    const answer = deriveFromLines(shape, e.lines) || [e.lines.join(' / ')];
    const id = 't' + hashText(subject + '|' + normQ(e.text) + '|' + normO(answer.join('|')));
    const old = DB.questions[id];
    if (old && !old.deleted) { report.push({ e, status: 'dup', id }); continue; }
    DB.questions[id] = {
      id, subject, chapter: chapter || '未分類', level: level || '', difficulty: '',
      type: e.type, text: e.text, hint: e.hint, options: {}, ...(shape.blanks ? { blanks: shape.blanks } : {}),
      answer, lines: e.lines, note: '', source: 'text', createdAt: now, updatedAt: now,
    };
    report.push({ e, status: resolved.length > 1 ? 'ambiguous' : 'new', id });
  }
  return report;
}

/* 填空答案可能是「a/b」「a|b」這種多種寫法串在一起；只要有一種寫法相同就算一致 */
function answersOverlap(q, ans) {
  if (q.type !== 'fill') return sameAnswer(q, ans);
  const alts = blankAlts(q);
  const split = s => String(s).split(/\s*[|]\s*|\s*\/\s*/).map(normO).filter(Boolean);
  if (blankCount(q) === 1) {
    const mine = new Set(alts[0].flatMap(split));
    return ans.flatMap(split).some(a => mine.has(a));
  }
  return ans.length === alts.length && ans.every((a, i) => alts[i].map(normO).includes(normO(a)) || split(a).some(x => alts[i].map(normO).includes(x)));
}

/*
 * 匯入 HTML 後：用之前存下的答案紀錄（文字題庫 / 成績頁）補上解答。
 * 回傳 true = 補上了解答；'merged' = 題目原本就有解答，只是把重複的答案紀錄併進來；false = 沒變動。
 */
function autoFillFromText(q) {
  if (q.source === 'text') return false;
  const recs = textRecordsFor(q);
  if (!recs.length) return false;
  // 只採用「答案都在這份選項裡」的版本；對不上的多半是同題目、不同選項的另一題
  const matched = recs.map(r => ({ r, d: deriveFromLines(q, r.lines || r.answer) })).filter(x => x.d);
  if (!matched.length) return false;
  if (hasAnswer(q)) {
    const same = matched.filter(x => answersOverlap(q, x.d));
    if (!same.length) return false;
    const now = nowISO();
    for (const { r } of same) DB.questions[r.id] = { ...r, deleted: true, mergedInto: q.id, updatedAt: now };
    return 'merged';
  }
  let answer;
  if (q.type === 'fill' && blankCount(q) === 1) answer = [...new Set(matched.flatMap(x => x.d))];
  else {
    const distinct = new Set(matched.map(x => x.d.join('|')));
    if (distinct.size !== 1) return false; // 有好幾種答案都對得上，交給使用者判斷
    answer = matched[0].d;
  }
  const now = nowISO();
  DB.questions[q.id] = { ...q, answer, updatedAt: now };
  // 答案紀錄已經併入這題，標記刪除以免重複出現
  for (const { r } of matched) DB.questions[r.id] = { ...r, deleted: true, mergedInto: q.id, updatedAt: now };
  return true;
}

/* ========== 題目卡片 ========== */
const view = {
  tab: 'bank', subject: '', chapter: '', level: '', search: '', filter: 'all',
  editing: null, importResults: null, textResults: null, pr: null,
};

function sortedKeys(q) { return Object.keys(q.options || {}).sort(); }

/* 依某份檔案的選項順序，把解答轉成「B. xxx」 */
function answerText(q, display) {
  if (!hasAnswer(q)) return '';
  if (q.type === 'fill' && blankCount(q) > 1) return q.answer.map((s, i) => `(${i + 1}) ${s}`).join('　');
  if (isTextAnswer(q)) return q.answer.join(' / ');
  const ans = new Set(q.answer);
  const order = display || sortedKeys(q).map(k => ({ disp: k, key: k }));
  return order.filter(d => ans.has(d.key)).map(d => `${d.disp}. ${q.options[d.key] ?? ''}`).join('　');
}

function tagsHTML(q, extra = '') {
  return `<div class="tags">
    <span class="tag sj">${esc(subjectOf(q))}</span>
    <span class="tag">${esc(q.chapter)}</span>
    ${q.level ? `<span class="tag grey">${esc(q.level)}</span>` : ''}
    ${q.difficulty ? `<span class="tag grey">${esc(q.difficulty)}</span>` : ''}
    <span class="tag grey">${TYPE_LABEL[q.type] || q.type}</span>
    ${hasAnswer(q) ? '' : '<span class="tag warn">尚無解答</span>'}
    ${variantCount(q) > 1 ? `<span class="tag" title="題目一樣，但選項不同的題目會分開記錄">同題目共 ${variantCount(q)} 種選項版本</span>` : ''}
    ${q.source === 'gemini' ? '<span class="tag grey" title="由 Gemini 整理的題目；錯誤選項可能與實際考題不同">Gemini</span>' : ''}
    ${extra}
    <span class="muted" style="margin-left:auto">#${esc(q.id)}</span>
  </div>`;
}

function editorHTML(q) {
  let inner;
  if (q.type === 'fill' && blankCount(q) > 1) {
    inner = `<div class="muted">每一格的正確答案（同一格有多種寫法可用 <code>|</code> 分隔）：</div>` +
      Array.from({ length: blankCount(q) }, (_, i) =>
        `<label>第 ${i + 1} 格 <input type="text" name="ed-blank" value="${esc((q.answer || [])[i] || '')}"></label>`).join('');
  } else if (q.type === 'fill') {
    inner = `<label>正確答案（有多種寫法可用 <code>|</code> 分隔，例如 <code>lgn | log n</code>）
      <input type="text" name="ed-fill" value="${esc((q.answer || []).join(' | '))}"></label>`;
  } else if (q.type === 'recall') {
    inner = `<label>正確選項（一行一個）<textarea name="ed-recall" rows="3">${esc(answerLines(q).join('\n'))}</textarea></label>`;
  } else {
    const ans = new Set(q.answer || []);
    const t = q.type === 'single' ? 'radio' : 'checkbox';
    inner = '<div class="muted">勾選正確的選項：</div>' + sortedKeys(q).map(k =>
      `<label><input type="${t}" name="ed-opt" value="${esc(k)}" ${ans.has(k) ? 'checked' : ''}> ${esc(k)}. ${esc(q.options[k])}</label>`).join('');
  }
  return `<div class="editor">${inner}
    <label>章節<input type="text" name="ed-chapter" list="chapter-options" value="${esc(q.chapter || '')}"></label>
    <label>筆記（可留空）<textarea name="ed-note" rows="2">${esc(q.note || '')}</textarea></label>
    <div class="card-actions">
      <button data-act="cancel-edit">取消</button>
      <button class="primary" data-act="save-edit" data-id="${esc(q.id)}">儲存解答</button>
    </div></div>`;
}

function cardHTML(q, o = {}) {
  const editing = view.editing === q.id;
  let body = '';
  if (q.type === 'recall') {
    body = hasAnswer(q)
      ? '<div class="muted" style="font-size:.9em">正確選項（其他選項要匯入練習頁 HTML 後才看得到）：</div><ul class="opts">' +
        answerLines(q).map(l => `<li class="correct">${esc(l)}</li>`).join('') + '</ul>'
      : '<div class="answer-line"><span class="muted">尚無解答</span></div>';
  } else if (isTextAnswer(q)) {
    body = `<div class="answer-line">答案：${hasAnswer(q) ? `<b>${esc(answerText(q))}</b>` : '<span class="muted">尚無解答</span>'}</div>`;
  } else {
    const ans = new Set(q.answer || []);
    const order = o.display || sortedKeys(q).map(k => ({ disp: k, key: k }));
    body = '<ul class="opts">' + order.map(d =>
      `<li class="${ans.has(d.key) ? 'correct' : ''}">${esc(d.disp)}. ${esc(q.options[d.key])}</li>`).join('') + '</ul>';
    if (o.display && hasAnswer(q)) body += `<div class="answer-line">此份檔案的答案：<b>${esc(answerText(q, o.display))}</b></div>`;
  }
  if (o.refs && o.refs.length) {
    body += o.refs.map((r, i) => `<div class="answer-line">${o.refs.length > 1 ? `參考答案 ${i + 1}` : '參考答案'}：<b>${esc(r)}</b></div>`).join('');
    if (o.refs.length > 1) body += '<div class="hint">這題有不同版本的答案（可能是同題目、不同選項），請自己對照後按「填寫解答」。</div>';
  }
  return `<div class="card ${o.cls || ''}" data-qid="${esc(q.id)}">
    ${tagsHTML(q, o.extraTags || '')}
    ${o.prefix || ''}<div class="qtext">${esc(q.text)}</div>
    ${q.hint ? `<div class="hint">（${esc(q.hint)}）</div>` : ''}
    ${editing ? editorHTML(q) : body}
    ${!editing && q.note ? `<div class="note">📝 ${esc(q.note)}</div>` : ''}
    ${editing || o.readonly ? '' : `<div class="card-actions">
      <button data-act="edit" data-id="${esc(q.id)}">${hasAnswer(q) ? '修改解答' : '✏️ 填寫解答'}</button>
      ${o.moveable ? moveHTML(q) : ''}
      ${o.noDelete ? '' : `<button class="danger" data-act="delete" data-id="${esc(q.id)}">刪除</button>`}
    </div>`}
  </div>`;
}

function saveEdit(id, card) {
  const q = DB.questions[id];
  if (!q) return;
  let answer;
  if (q.type === 'fill' && blankCount(q) > 1) {
    answer = $$('[name=ed-blank]', card).map(i => i.value.trim());
    if (answer.every(a => !a)) answer = [];
  } else if (q.type === 'fill') answer = $('[name=ed-fill]', card).value.split('|').map(s => s.trim()).filter(Boolean);
  else if (q.type === 'recall') answer = [$('[name=ed-recall]', card).value.split('\n').map(s => s.trim()).filter(Boolean).join('\n')].filter(Boolean);
  else answer = $$('[name=ed-opt]:checked', card).map(i => i.value).sort();
  const note = $('[name=ed-note]', card).value.trim();
  const chapter = $('[name=ed-chapter]', card).value.trim() || q.chapter;
  DB.questions[id] = { ...q, answer, note, chapter, updatedAt: nowISO() };
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
function compareSubject(a, b) {
  const ia = BASE_SUBJECTS.indexOf(a), ib = BASE_SUBJECTS.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'zh-Hant');
}
function compareQ(a, b) {
  return compareSubject(subjectOf(a), subjectOf(b)) || compareChapter(a.chapter, b.chapter) ||
    compareLevel(a.level || '', b.level || '') || String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
}

/* 科目 → 章節 → 境界 的樹狀統計 */
function subjectTree(list = active()) {
  const tree = new Map();
  for (const q of list) {
    const sj = subjectOf(q);
    if (!tree.has(sj)) tree.set(sj, new Map());
    const chs = tree.get(sj);
    if (!chs.has(q.chapter)) chs.set(q.chapter, new Map());
    const lv = chs.get(q.chapter);
    lv.set(q.level || '', (lv.get(q.level || '') || 0) + 1);
  }
  return [...tree.keys()].sort(compareSubject).map(sj => {
    const chs = tree.get(sj);
    const chapters = [...chs.keys()].sort(compareChapter).map(ch => {
      const lv = chs.get(ch);
      const levels = [...lv.keys()].sort(compareLevel).map(l => ({ level: l, count: lv.get(l) }));
      return { chapter: ch, count: levels.reduce((s, x) => s + x.count, 0), levels };
    });
    return { subject: sj, count: chapters.reduce((s, x) => s + x.count, 0), chapters };
  });
}

function getSubjects() {
  return [...new Set([...BASE_SUBJECTS, ...active().map(subjectOf), ...(cfg.subjects || [])])].sort(compareSubject);
}

function renderBank() {
  const all = active();
  const tree = subjectTree(all);
  const btn = (sj, ch, lv, label, count, cls = '') =>
    `<button class="${cls} ${view.subject === sj && view.chapter === ch && view.level === lv ? 'active' : ''}" data-act="pick-ch" data-sj="${esc(sj)}" data-ch="${esc(ch)}" data-lv="${esc(lv)}">${esc(label)} <span class="count">${count}</span></button>`;
  $('#chapter-list').innerHTML = btn('', '', '', '全部科目', all.length) + tree.map(s =>
    btn(s.subject, '', '', s.subject, s.count, 'sj') + s.chapters.map(t =>
      btn(s.subject, t.chapter, '', t.chapter, t.count, 'chp') +
      (t.levels.length > 1 || t.levels[0].level ? t.levels.map(l => btn(s.subject, t.chapter, l.level, l.level || '（未分）', l.count, 'lv')).join('') : '')
    ).join('')).join('');

  const s = view.search.trim().toLowerCase();
  let list = all.filter(q =>
    (!view.subject || subjectOf(q) === view.subject) &&
    (!view.chapter || q.chapter === view.chapter) &&
    (!view.level || (q.level || '') === view.level) &&
    (view.filter === 'all' || (view.filter === 'answered') === hasAnswer(q)) &&
    (!s || [q.text, q.hint, q.note, q.chapter, ...Object.values(q.options || {}), ...(q.answer || []), q.id].join('\n').toLowerCase().includes(s)));
  list.sort(compareQ);

  const answered = all.filter(hasAnswer).length;
  $('#bank-summary').textContent = `題庫共 ${all.length} 題（已有解答 ${answered} 題）　目前顯示 ${list.length} 題`;
  $('#bank-list').innerHTML = list.length ? list.map(q => cardHTML(q)).join('')
    : `<div class="panel muted">${all.length ? '沒有符合條件的題目。' : '題庫還是空的，到「匯入 / 查詢」匯入練習頁的 HTML 檔吧！'}</div>`;
}

/* ========== 匯入 / 查詢 ========== */
const currentSubject = () => $('#imp-subject').value || DEFAULT_SUBJECT;
const currentChapter = () => $('#imp-chapter').value;

/* 某科目的章節：題庫裡已有的 + 自己新增但還沒有題目的 */
function chaptersOf(subject) {
  const own = (cfg.chapters || {})[subject] || [];
  return [...new Set([...active().filter(q => subjectOf(q) === subject).map(q => q.chapter), ...own])].sort(compareChapter);
}

function fillSubjectControls() {
  const sel = $('#imp-subject');
  const want = sel.value || lsGet(LS.subject, DEFAULT_SUBJECT);
  sel.innerHTML = getSubjects().map(s => `<option ${s === want ? 'selected' : ''}>${esc(s)}</option>`).join('');
  const subject = currentSubject();
  const chs = chaptersOf(subject);
  const chSel = $('#imp-chapter');
  const remembered = lsGet(LS.chapter, {})[subject];
  const pick = chs.includes(chSel.dataset.subject === subject ? chSel.value : '') ? chSel.value : (chs.includes(remembered) ? remembered : '');
  chSel.innerHTML = '<option value="">（請選擇章節）</option>' +
    chs.map(c => `<option ${c === pick ? 'selected' : ''}>${esc(c)}</option>`).join('');
  chSel.dataset.subject = subject;
  $('#chapter-options').innerHTML = chs.map(c => `<option value="${esc(c)}">`).join('');
  $('#imp-target').textContent = currentChapter() ? `${subject} → ${currentChapter()}` : `${subject} →（還沒選章節）`;
}

function rememberChapter() {
  const map = lsGet(LS.chapter, {});
  map[currentSubject()] = currentChapter();
  lsSet(LS.chapter, map);
  fillSubjectControls();
}

function addChapter() {
  const subject = currentSubject();
  const name = (prompt(`在「${subject}」新增章節（例如 2、第3章 行程管理）：`) || '').trim();
  if (!name) return;
  cfg.chapters = cfg.chapters || {};
  cfg.chapters[subject] = [...new Set([...(cfg.chapters[subject] || []), name])];
  lsSet(LS.cfg, cfg);
  const map = lsGet(LS.chapter, {});
  map[subject] = name;
  lsSet(LS.chapter, map);
  $('#imp-chapter').value = '';
  fillSubjectControls();
}

/* 匯入前一定要選好科目與章節 */
function importTarget() {
  const subject = currentSubject(), chapter = currentChapter();
  if (!chapter) { toast('請先在上方選擇章節（沒有的話按「＋ 新增章節」）', 3500); return null; }
  return { subject, chapter };
}

function addSubject() {
  const name = (prompt('新科目名稱：') || '').trim();
  if (!name) return;
  cfg.subjects = [...new Set([...(cfg.subjects || []), name])];
  lsSet(LS.cfg, cfg);
  lsSet(LS.subject, name);
  $('#imp-subject').value = '';
  fillSubjectControls();
  $('#imp-subject').value = name;
}

async function handleFiles(files) {
  const target = importTarget();
  if (!target) return;
  const addNew = $('#add-new').checked;
  const results = [], textResults = [];
  let added = 0, filled = 0, changed = false;
  const now = nowISO();
  // 先讀練習頁再讀成績頁：同時拖進來時，成績頁的解答可以直接對到剛加入的題目
  const parsedFiles = [];
  for (const f of files) {
    try {
      const html = await f.text();
      const parsed = parseQuizHTML(html, f.name);
      // 科目、章節一律用上方選的，不自動分類
      parsed.subject = target.subject;
      parsed.chapter = target.chapter;
      parsed.level = '';
      parsedFiles.push(parsed);
    } catch (e) { results.push({ filename: f.name, error: e.message, items: [] }); }
  }
  parsedFiles.sort((a, b) => (a.kind === 'result') - (b.kind === 'result'));
  const batchIds = new Set(); // 這次一起匯入的練習頁題目
  for (const parsed of parsedFiles) {
    const subject = parsed.subject;
    if (parsed.kind === 'result') {
      const report = parsed.items.length ? applyEntries(parsed.items, subject, parsed.chapter, parsed.level, true, batchIds) : [];
      if (report.some(r => r.status !== 'dup' && r.status !== 'same')) changed = true;
      filled += report.filter(r => r.status === 'filled' || r.status === 'updated').length;
      textResults.push({ title: '成績頁匯入結果', filename: parsed.filename, subject, chapter: parsed.chapter, report });
      continue;
    }
    for (const item of parsed.items) {
      const exist = findExisting(item, subject);
      if (exist) {
        item.status = 'exists';
        item.dbId = exist.id;
        item.display = remapDisplay(item, exist);
      } else {
        item.status = 'new';
        item.dbId = freeId(item, subject);
        if (sameTextQuestions(subject, item.text).some(x => x.type !== 'fill')) item.variant = true;
        if (!addNew) continue;
        DB.questions[item.dbId] = {
          id: item.dbId, subject, chapter: parsed.chapter, level: parsed.level, difficulty: parsed.difficulty,
          type: item.type, text: item.text, hint: item.hint, options: item.options, ...(item.blanks ? { blanks: item.blanks } : {}),
          answer: [], note: '', createdAt: now, updatedAt: now,
        };
        item.added = true;
        added++;
        changed = true;
      }
      const q = DB.questions[item.dbId];
      if (q) batchIds.add(q.id);
      const fillResult = q ? autoFillFromText(q) : false;
      if (fillResult === true) { item.autoFilled = true; filled++; }
      if (fillResult) changed = true;
    }
    results.push(parsed);
  }
  view.importResults = results;
  view.textResults = textResults;
  if (changed) commit();
  fillSubjectControls();
  renderImport();
  const msg = [added && `新增 ${added} 題`, filled && `補上 ${filled} 題解答`].filter(Boolean).join('，');
  toast(msg || '沒有新題目或新解答');
}

function importText() {
  const raw = $('#txt-input').value;
  const entries = parseTextBank(raw);
  if (!entries.length) { toast('找不到題目，請確認格式含有「題目：」與「正確答案：」'); return; }
  const target = importTarget();
  if (!target) return;
  const { subject, chapter } = target;
  const report = applyEntries(entries, subject, chapter, '', false);
  view.textResults = [{ title: '文字匯入結果', subject, chapter, report }];
  view.importResults = null;
  if (report.some(r => r.status !== 'dup' && r.status !== 'same' && r.status !== 'conflict')) commit();
  $('#txt-input').value = '';
  fillSubjectControls();
  renderImport();
  toast(`解析 ${entries.length} 題`);
}

const TEXT_STATUS = {
  filled: ['ok', '補上既有題目的解答'],
  updated: ['ok', '已依成績頁更正解答'],
  same: ['grey', '題庫已有相同解答'],
  conflict: ['warn', '與題庫解答不同（未覆蓋）'],
  ambiguous: ['warn', '題庫有多題相同題目，先存成答案紀錄'],
  new: ['', '新增'],
  dup: ['grey', '已存在，略過'],
};

function textResultHTML(t) {
  const { report } = t;
  const count = st => report.filter(r => r.status === st).length;
  const cards = report.map((r, n) => {
    const q = DB.questions[r.id];
    if (!q) return '';
    if (q.deleted) return `<div class="card muted">第 ${n + 1} 題已${q.mergedInto ? '併入有選項的題目' : '刪除'}：${esc(q.text.slice(0, 40))}</div>`;
    const [cls, label] = TEXT_STATUS[r.status];
    const extra = `<span class="tag ${cls}">${label}</span>`;
    const refs = r.status === 'conflict' ? [r.e.lines.join(' / ')] : [];
    return cardHTML(q, { prefix: `<div class="muted">第 ${n + 1} 題</div>`, extraTags: extra, refs, moveable: true, cls: r.status === 'conflict' ? 'new' : '' });
  }).join('');
  const newIds = report.filter(r => r.status === 'new' || r.status === 'ambiguous').map(r => r.id);
  return `<div class="panel">
    <h2>${esc(t.title)}：${esc(t.subject)} › ${esc(t.chapter)}</h2>
    ${t.filename ? `<div class="muted">${esc(t.filename)}</div>` : ''}
    ${report.length ? `<div class="summary-stats">
      <div class="stat">共 <b>${report.length}</b> 題</div>
      <div class="stat">補上 / 更正解答 <b>${count('filled') + count('updated')}</b></div>
      <div class="stat">新增 <b>${count('new') + count('ambiguous')}</b></div>
      <div class="stat">重複略過 <b>${count('dup') + count('same')}</b></div>
      ${count('conflict') ? `<div class="stat">解答不同 <b>${count('conflict')}</b></div>` : ''}
    </div>
    <p class="muted" style="font-size:.9em">題庫還沒有的題目會先存成答案紀錄（標示「選項未知」）；之後匯入練習頁 HTML 時，會依題目自動對應到選項並補上解答。</p>`
    : '<p class="muted">這個檔案裡找不到題目。</p>'}
    ${bulkBarHTML(t.subject, t.chapter, newIds, 'text', (view.textResults || []).indexOf(t))}
  </div>${cards}`;
}

/* ===== 匯入錯了：移動章節或刪除 ===== */
function targetOptions(selSubject, selChapter) {
  return getSubjects().map(s => {
    const chs = chaptersOf(s);
    if (!chs.length) return '';
    return `<optgroup label="${esc(s)}">` + chs.map(c =>
      `<option value="${esc(s + '||' + c)}" ${s === selSubject && c === selChapter ? 'selected' : ''}>${esc(s)} › ${esc(c)}</option>`).join('') + '</optgroup>';
  }).join('');
}
function moveHTML(q) {
  return `<select class="move-target" title="移動到哪個章節">${targetOptions(subjectOf(q), q.chapter)}</select>
    <button data-act="move-one" data-id="${esc(q.id)}">移動</button>`;
}
function bulkBarHTML(subject, chapter, newIds, kind, idx) {
  const ids = newIds.filter(id => DB.questions[id] && !DB.questions[id].deleted);
  if (!ids.length) return '';
  return `<div class="row bulk">
    <span class="muted">本次新增的 ${ids.length} 題：</span>
    <select class="bulk-target">${targetOptions(subject, chapter)}</select>
    <button data-act="bulk-move" data-kind="${kind}" data-idx="${idx}">全部移到這個章節</button>
    <button class="danger" data-act="bulk-delete" data-kind="${kind}" data-idx="${idx}">全部刪除</button>
  </div>`;
}
function bulkIds(kind, idx) {
  if (kind === 'quiz') return ((view.importResults || [])[idx]?.items || []).filter(i => i.added).map(i => i.dbId);
  return ((view.textResults || [])[idx]?.report || []).filter(r => r.status === 'new' || r.status === 'ambiguous').map(r => r.id);
}
function moveQuestions(ids, value) {
  const [subject, chapter] = String(value).split('||');
  if (!subject || !chapter) return 0;
  const now = nowISO();
  let n = 0;
  for (const id of ids) {
    const q = DB.questions[id];
    if (!q || q.deleted || (subjectOf(q) === subject && q.chapter === chapter)) continue;
    DB.questions[id] = { ...q, subject, chapter, level: '', updatedAt: now };
    n++;
  }
  if (n) commit();
  toast(n ? `已移動 ${n} 題到 ${subject} › ${chapter}` : '已經在這個章節了');
  return n;
}
function deleteQuestions(ids) {
  const live = ids.filter(id => DB.questions[id] && !DB.questions[id].deleted);
  if (!live.length || !confirm(`確定要刪除這 ${live.length} 題嗎？`)) return;
  const now = nowISO();
  for (const id of live) DB.questions[id] = { ...DB.questions[id], deleted: true, updatedAt: now };
  commit();
  toast(`已刪除 ${live.length} 題`);
}
function setResultTarget(kind, idx, value) {
  const [subject, chapter] = String(value).split('||');
  const r = kind === 'quiz' ? (view.importResults || [])[idx] : (view.textResults || [])[idx];
  if (r && subject && chapter) { r.subject = subject; r.chapter = chapter; }
}

function renderImport() {
  const box = $('#import-results');
  const texts = (view.textResults || []).map(textResultHTML).join('');
  const res = view.importResults || [];
  box.innerHTML = texts + res.map((r, idx) => {
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
        // 沒加入題庫（或剛刪掉）的題目：只顯示，不能編輯
        const tmp = { ...it, subject: r.subject, chapter: r.chapter, level: r.level, difficulty: r.difficulty, answer: [] };
        const refs = refsFor(tmp, it.display);
        const tag = q && q.deleted ? '<span class="tag warn">已刪除</span>' : '<span class="tag warn">題庫沒有</span>';
        return cardHTML(tmp, { cls: 'new', display: it.display, prefix, extraTags: tag, readonly: true, refs });
      }
      let tag = it.status === 'new' ? `<span class="tag warn">${it.variant ? '新選項版本' : '新加入'}</span>` : '<span class="tag ok">題庫已有</span>';
      if (it.autoFilled) tag += '<span class="tag ok">已用文字題庫補上解答</span>';
      const refs = hasAnswer(q) ? [] : refsFor(q, it.display);
      return cardHTML(q, { cls: hasAnswer(q) ? 'known' : 'new', display: it.display, prefix, extraTags: tag, refs, moveable: true });
    }).join('');
    const newIds = r.items.filter(i => i.added).map(i => i.dbId);
    return `<div class="panel">
      <h2>${esc(r.subject)} › ${esc(r.chapter)}${r.level ? `（${esc(r.level)}）` : ''}${r.difficulty ? ` · ${esc(r.difficulty)}` : ''}</h2>
      <div class="muted">${esc(r.filename)}</div>
      <div class="summary-stats">
        <div class="stat">共 <b>${r.items.length}</b> 題</div>
        <div class="stat">題庫已有 <b>${known.length}</b> 題</div>
        <div class="stat">其中有解答 <b>${withAns.length}</b> 題</div>
        <div class="stat">本次新增 <b>${added}</b> 題</div>
      </div>
      ${bulkBarHTML(r.subject, r.chapter, newIds, 'quiz', idx)}
    </div>${cards}`;
  }).join('');
}

/* ========== 刷題 ========== */
function practiceSettings() {
  return lsGet(LS.practice, { picks: null, onlyAnswered: true, types: ['single', 'multi', 'fill'], count: '', shuffleQ: true, shuffleOpt: false, mode: 'all' });
}

const pickKey = (sj, ch, lv) => sj + '||' + ch + '||' + (lv || '');

function practicePool(ps) {
  const picks = new Set(ps.picks || []);
  return active().filter(q =>
    picks.has(pickKey(subjectOf(q), q.chapter, q.level)) &&
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
  $$('#practice-root .chapter, #practice-root .subject').forEach(div => {
    const kids = $$('input.pick', div);
    const on = kids.filter(k => k.checked).length;
    const head = $('input.ch, input.sj', div);
    head.checked = on === kids.length;
    head.indeterminate = on > 0 && on < kids.length;
  });
}

function renderPracticeSetup() {
  const ps = practiceSettings();
  const tree = subjectTree();
  const all = tree.flatMap(s => s.chapters.flatMap(t => t.levels.map(l => pickKey(s.subject, t.chapter, l.level))));
  const picks = new Set(ps.picks ?? all);
  const answeredCount = (sj, ch, lv) => active().filter(q => subjectOf(q) === sj && q.chapter === ch && (q.level || '') === lv && hasAnswer(q)).length;
  $('#practice-root').innerHTML = `<div class="panel">
    <h2>選擇要刷的科目與章節</h2>
    ${tree.length ? `<div class="row" style="margin:0 0 8px"><button data-act="ps-all">全選</button><button data-act="ps-none">全不選</button></div>
    ${tree.map(s => `<div class="subject">
      <label class="sj-head"><input type="checkbox" class="sj"> ${esc(s.subject)} <span class="muted">(${s.count})</span></label>
      <div class="tree">${s.chapters.map(t => `<div class="chapter">
        <label><input type="checkbox" class="ch"> ${esc(t.chapter)} <span class="muted">(${t.count})</span></label>
        <div class="levels">${t.levels.map(l => {
          const v = pickKey(s.subject, t.chapter, l.level);
          return `<label><input type="checkbox" class="pick" value="${esc(v)}" ${picks.has(v) ? 'checked' : ''}> ${esc(l.level || '全部')}
            <span class="muted">(${l.count} 題，有解答 ${answeredCount(s.subject, t.chapter, l.level)})</span></label>`;
        }).join('')}</div></div>`).join('')}</div></div>`).join('')}` : '<p class="muted">題庫還是空的，先去「匯入 / 查詢」匯入題目。</p>'}
  </div>
  <div class="panel">
    <h2>刷題選項</h2>
    <div class="opts-grid">
      <label class="check"><input type="checkbox" id="ps-answered" ${ps.onlyAnswered ? 'checked' : ''}> 只出有解答的題目</label>
      <label class="check"><input type="checkbox" id="ps-shuffleq" ${ps.shuffleQ ? 'checked' : ''}> 題目隨機順序</label>
      <label class="check"><input type="checkbox" id="ps-shuffleopt" ${ps.shuffleOpt ? 'checked' : ''}> 選項隨機順序</label>
      <div>題型：${ALL_TYPES.map(t => `<label style="display:inline"><input type="checkbox" class="ps-type" value="${t}" ${ps.types.includes(t) ? 'checked' : ''}> ${TYPE_LABEL[t]}</label>`).join('　')}</div>
      <label>題目範圍：<select id="ps-mode">
        <option value="all" ${ps.mode === 'all' ? 'selected' : ''}>全部題目</option>
        <option value="wrong" ${ps.mode === 'wrong' ? 'selected' : ''}>只練上次答錯的</option>
        <option value="unseen" ${ps.mode === 'unseen' ? 'selected' : ''}>只練沒做過的</option>
      </select></label>
      <label>題數：<input type="number" id="ps-count" min="1" placeholder="全部" value="${esc(ps.count)}" style="width:90px"></label>
    </div>
    <div class="row"><button id="ps-start" class="primary" data-act="ps-start">開始刷題</button></div>
    <p class="muted" style="font-size:.85em">對錯紀錄只存在這台電腦。快捷鍵：數字鍵選選項、Enter 提交 / 下一題；「選項未知」的題目按 Enter 看答案，再按 1（會）或 2（不會）。</p>
  </div>`;
  if (tree.length) updatePracticeCount();
  else $('#ps-start').disabled = true;
}

function startPractice() {
  const ps = readPracticeForm();
  let pool = practicePool(ps);
  if (ps.shuffleQ) pool = shuffle(pool);
  else pool.sort(compareQ);
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
  pr.cur = { order: pr.shuffleOpt ? shuffle(keys) : keys, submitted: false, chosen: [], fill: [], ok: null };
}

function normFill(s) {
  return String(s).normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

function submitAnswer() {
  const pr = view.pr, cur = pr.cur;
  const q = DB.questions[pr.ids[pr.i]];
  if (!cur || cur.submitted || !q) return;
  const root = $('#practice-root');
  if (q.type === 'recall') {
    // 問答題：先看答案，再自己判斷對錯
    cur.submitted = true;
    if (!hasAnswer(q)) pr.results.push({ id: q.id, ok: null });
    renderPractice();
    return;
  }
  if (q.type === 'fill') cur.fill = $$('.pr-fill', root).map(i => i.value);
  else cur.chosen = $$('input[name=pr-opt]:checked', root).map(i => i.value);
  if (q.type !== 'fill' && !cur.chosen.length) { toast('請先選擇答案'); return; }
  if (q.type === 'fill' && cur.fill.every(v => !v.trim())) { toast('請先輸入答案'); return; }
  cur.submitted = true;
  if (hasAnswer(q)) {
    if (q.type === 'fill') {
      const alts = blankAlts(q);
      cur.ok = alts.length === cur.fill.length && alts.every((a, i) => a.some(x => normFill(x) === normFill(cur.fill[i])));
    }
    else cur.ok = [...cur.chosen].sort().join() === [...q.answer].sort().join();
    recordResult(q, cur.ok);
  } else {
    pr.results.push({ id: q.id, ok: null });
  }
  renderPractice();
}

function recordResult(q, ok) {
  const s = stats[q.id] || { r: 0, w: 0 };
  if (ok) s.r++; else s.w++;
  s.last = ok ? 'r' : 'w';
  s.t = nowISO();
  stats[q.id] = s;
  lsSet(LS.stats, stats);
  view.pr.results.push({ id: q.id, ok });
}

function selfGrade(ok) {
  const pr = view.pr, cur = pr && pr.cur;
  const q = pr && DB.questions[pr.ids[pr.i]];
  if (!cur || !cur.submitted || !q || q.type !== 'recall' || !hasAnswer(q) || cur.ok !== null) return;
  cur.ok = ok;
  recordResult(q, ok);
  nextQuestion();
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
  if (q.type === 'recall') {
    body = cur.submitted ? '' : '<div class="muted">先在心裡想好答案，再按「顯示答案」。</div>';
  } else if (q.type === 'fill') {
    const n = blankCount(q);
    body = Array.from({ length: n }, (_, i) => `<div class="fill-row">${n > 1 ? `<span class="muted">第 ${i + 1} 格</span>` : ''}
      <input class="fill-input pr-fill" type="text" autocomplete="off" value="${esc((cur.fill || [])[i] || '')}" ${cur.submitted ? 'disabled' : ''} placeholder="${i === n - 1 ? '輸入答案後按 Enter' : ''}"></div>`).join('');
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
    } else if (q.type === 'recall') {
      result = `<div class="result ok" style="white-space:pre-wrap">正確答案：<b>${esc(q.answer.join(' / '))}</b></div>
        ${q.note ? `<div class="note">📝 ${esc(q.note)}</div>` : ''}`;
    } else {
      const disp = q.type === 'fill' ? answerText(q)
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
    ${q.type === 'recall' && cur.submitted && hasAnswer(q) ? '' : `<div class="row">${cur.submitted
      ? `<button class="primary" data-act="pr-next" id="pr-next">${pr.i + 1 < pr.ids.length ? '下一題 →' : '看結果'}</button>`
      : `<button class="primary" data-act="pr-submit">${q.type === 'recall' ? '顯示答案' : '提交答案'}</button>`}</div>`}
    ${result}
    ${q.type === 'recall' && cur.submitted && hasAnswer(q) ? `<div class="row">
      <button class="primary" data-act="pr-self" data-ok="1">✔ 我答對了 (1)</button>
      <button data-act="pr-self" data-ok="0">✘ 我答錯了 (2)</button></div>` : ''}
  </div>`;
  if (!cur.submitted && q.type === 'fill') $('.pr-fill').focus();
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
  else if (view.tab === 'import') { fillSubjectControls(); renderImport(); }
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
    case 'pick-ch': view.subject = el.dataset.sj; view.chapter = el.dataset.ch; view.level = el.dataset.lv; renderBank(); break;
    case 'pr-self': selfGrade(el.dataset.ok === '1'); break;
    case 'edit': view.editing = id; rerenderAfterEdit(); break;
    case 'cancel-edit': view.editing = null; rerenderAfterEdit(); break;
    case 'save-edit': saveEdit(id, el.closest('.card')); if (view.tab === 'practice') renderPractice(); break;
    case 'delete': deleteQuestion(id); break;
    case 'move-one': moveQuestions([id], $('.move-target', el.closest('.card')).value); rerenderAfterEdit(); break;
    case 'bulk-move': {
      const value = $('.bulk-target', el.closest('.bulk')).value;
      if (moveQuestions(bulkIds(el.dataset.kind, +el.dataset.idx), value)) setResultTarget(el.dataset.kind, +el.dataset.idx, value);
      renderImport();
      break;
    }
    case 'bulk-delete': deleteQuestions(bulkIds(el.dataset.kind, +el.dataset.idx)); renderImport(); break;
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
  if (t.classList.contains('sj')) $$('input.pick', t.closest('.subject')).forEach(i => { i.checked = t.checked; });
  updatePracticeCount();
});
document.addEventListener('input', e => {
  if (e.target.id === 'ps-count') updatePracticeCount();
});

document.addEventListener('keydown', e => {
  if (view.tab !== 'practice' || !view.pr || !view.pr.cur || view.editing) return;
  const cur = view.pr.cur;
  const inText = !!e.target.matches?.('input[type=text], textarea');
  const q = DB.questions[view.pr.ids[view.pr.i]];
  if (q && q.type === 'recall' && cur.submitted && hasAnswer(q)) {
    if (e.key === '1') selfGrade(true);
    else if (e.key === '2') selfGrade(false);
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    // 多格填空：在前面的格子按 Enter 先跳到下一格
    const boxes = $$('#practice-root .pr-fill');
    const at = boxes.indexOf(e.target);
    if (!cur.submitted && at >= 0 && at < boxes.length - 1) { boxes[at + 1].focus(); return; }
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

  $('#imp-subject').addEventListener('change', e => { lsSet(LS.subject, e.target.value); fillSubjectControls(); });
  $('#imp-chapter').addEventListener('change', rememberChapter);
  $('#add-chapter').addEventListener('click', addChapter);
  $('#add-subject').addEventListener('click', addSubject);
  $('#txt-import').addEventListener('click', importText);

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
