'use strict';
/* ========== 動畫解說：追蹤題逐步播放 ==========
 * 每種演算法提供 code（虛擬碼）、run(cfg) 產生步驟、view（畫面）。
 * 步驟 = { line, text, key, ...狀態快照 }；key 用來對應「題目問的那一步」。
 * 元素用 token（有 id 的方塊）呈現，位置改變時用 CSS transition 滑動，所以交換看得到移動。
 */

const T$ = (s, el = document) => el.querySelector(s);
const tEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));

/* ---------- 一條「軌道」：固定的格子 + 會移動的 token ---------- */
class Track {
  // layout(pos) → {x, y}；slots 是要畫格子的位置清單；label(pos) 是格子下方的索引
  constructor(box, { slots, layout, label, w, h, cls = '' }) {
    this.el = document.createElement('div');
    this.el.className = 'tr-track ' + cls;
    this.layout = layout;
    this.w = w;
    let maxX = 0, maxY = 0;
    for (const p of slots) {
      const { x, y } = layout(p);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      const s = document.createElement('div');
      s.className = 'tr-slot';
      s.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
      if (label) s.dataset.label = label(p);
      this.el.appendChild(s);
    }
    this.el.style.width = maxX + w + 'px';
    // 下方多留兩列給 i、j 指標
    this.el.style.height = maxY + h + (label ? 18 : 0) + (cls === 'tree' ? 0 : 38) + 'px';
    this.h = h;
    this.tokens = new Map();
    this.ptrs = new Map();
    box.appendChild(this.el);
  }
  // items: [{ id, pos, html, cls }]
  update(items) {
    const seen = new Set();
    for (const it of items) {
      seen.add(it.id);
      let t = this.tokens.get(it.id);
      const { x, y } = this.layout(it.pos);
      if (!t) {
        t = document.createElement('div');
        t.className = 'tr-tok born';
        t.style.cssText = `left:${x}px;top:${y}px;width:${this.w}px;height:${this.h}px`;
        this.el.appendChild(t);
        this.tokens.set(it.id, t);
        setTimeout(() => t.classList.remove('born'), 400);
      }
      if (t._html !== it.html) {
        if (t._html !== undefined) { t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump'); }
        t.innerHTML = it.html; t._html = it.html;
      }
      t.style.left = x + 'px'; t.style.top = y + 'px';
      const keep = ['born', 'bump'].filter(c => t.classList.contains(c)).join(' ');
      t.className = `tr-tok ${it.cls || ''} ${keep}`;
    }
    for (const [id, t] of this.tokens) if (!seen.has(id)) { t.remove(); this.tokens.delete(id); }
  }
  // 指標（i、j…），pos 可以超出格子範圍（例如 i = p − 1）
  pointers(list) {
    const seen = new Set();
    for (const { name, pos, row = 0 } of list) {
      seen.add(name);
      let p = this.ptrs.get(name);
      if (!p) {
        p = document.createElement('div');
        p.className = 'tr-ptr tr-ptr-' + name.replace(/\W/g, '');
        p.textContent = name;
        this.el.appendChild(p);
        this.ptrs.set(name, p);
      }
      const { x, y } = this.layout(pos);
      p.style.left = x + this.w / 2 + 'px';
      p.style.top = y + this.h + 20 + row * 18 + 'px';
    }
    for (const [n, p] of this.ptrs) if (!seen.has(n)) { p.remove(); this.ptrs.delete(n); }
  }
}

const rowLayout = (w, gap = 6, origin = 0) => p => ({ x: (p - origin) * (w + gap) + (w + gap), y: 0 });
const fmt = a => a.map(v => (v == null ? 0 : v)).join(',');

/* ---------- 計數排序（題庫版虛擬碼，行號照題目） ---------- */
const COUNTING = {
  title: 'COUNTING-SORT',
  code: ['for i ← 1 to k', '    do c[i] ← 0', 'for j ← 1 to length[A]', '    do c[A[j]] ← c[A[j]] + 1',
    '▷ c[i] = 等於 i 的個數', 'for i ← 2 to k', '    do c[i] ← c[i] + c[i−1]', '▷ c[i] = 小於或等於 i 的個數',
    'for j ← length[A] downto 1', '    do B[c[A[j]]] ← A[j]', '       c[A[j]] ← c[A[j]] − 1'],
  run({ A }) {
    const n = A.length, k = Math.max(...A);
    const C = Array(k + 1).fill(0), B = Array(n).fill(null);
    const steps = [];
    const snap = (line, text, extra = {}) => steps.push({ line, text, C: C.slice(), B: B.slice(), ...extra });
    snap(1, `k = ${k}，把 C[0..${k}] 全部設成 0（A 裡有 0，所以 C 從索引 0 開始）。`, { hlC: C.map((_, i) => i) });
    for (let j = 1; j <= n; j++) {
      const v = A[j - 1]; C[v]++;
      snap(4, `j = ${j}：A[${j}] = ${v}，C[${v}] 加 1 → ${C[v]}。`, { j, hlA: [j], hlC: [v] });
    }
    snap(5, `數完了：C[i] 是「等於 i」的個數 → ${C.join(',')}。`);
    for (let i = 1; i <= k; i++) {
      C[i] += C[i - 1];
      snap(7, `i = ${i}：C[${i}] ← C[${i}] + C[${i - 1}] = ${C[i]}。`, { hlC: [i - 1, i] });
    }
    snap(8, `累加完成：C[i] 是「小於或等於 i」的個數，也就是值 i 在 B 裡該放的最後位置。`);
    for (let j = n; j >= 1; j--) {
      const v = A[j - 1];
      snap(9, `j = ${j}，A[${j}] = ${v}。（題庫說「做到第 9 行 j = ${j}」就是這個還沒處理的狀態）`,
        { key: j === n ? ['before9', 'j' + j] : ['j' + j], j, hlA: [j] });
      const at = C[v]; B[at - 1] = { v, id: 'b' + j };
      snap(10, `B[C[${v}]] = B[${at}] ← ${v}。由後往前放，相同值保持原順序（穩定）。`, { j, hlA: [j], hlB: [at], hlC: [v] });
      C[v]--;
      snap(11, `C[${v}] 減 1 → ${C[v]}，下一個 ${v} 會放在它前一格。`, { j, hlC: [v] });
    }
    snap(9, `迴圈結束，B 已排好：${fmt(B.map(b => b && b.v))}。`, { key: ['done'] });
    return steps;
  },
  answer: s => `B = ${fmt(s.B.map(b => b && b.v))}\nC = ${s.C.join(',')}`,
  view(box, cfg, W) {
    const n = cfg.A.length, k = Math.max(...cfg.A);
    const mk = (name, slots, origin) => {
      const wrap = document.createElement('div'); wrap.className = 'tr-row';
      wrap.innerHTML = `<div class="tr-name">${name}</div>`;
      box.appendChild(wrap);
      return new Track(wrap, { slots, layout: rowLayout(W, 6, origin), label: p => p, w: W, h: W });
    };
    const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
    const tA = mk('A', range(1, n), 1), tC = mk('C', range(0, k), 0), tB = mk('B', range(1, n), 1);
    return s => {
      const has = (arr, p) => (arr || []).includes(p);
      tA.update(cfg.A.map((v, i) => ({ id: 'a' + i, pos: i + 1, html: v, cls: has(s.hlA, i + 1) ? 'hot' : '' })));
      tA.pointers(s.j ? [{ name: 'j', pos: s.j }] : []);
      tC.update(s.C.map((v, i) => ({ id: 'c' + i, pos: i, html: v, cls: has(s.hlC, i) ? 'hot' : 'soft' })));
      tB.update(s.B.map((b, i) => b && { id: b.id, pos: i + 1, html: b.v, cls: has(s.hlB, i + 1) ? 'hot' : 'ok' }).filter(Boolean));
    };
  },
};

/* ---------- 基數排序 ---------- */
const RADIX = {
  title: 'RADIX-SORT',
  code: ['for i ← 1 to d', '    do use a stable sort to sort array A on digit i'],
  run({ A }) {
    const d = String(Math.max(...A)).length;
    let cur = A.map(v => ({ v }));
    const steps = [];
    const snap = (line, text, digit, extra = {}) => steps.push({ line, text, digit, arr: cur.map(x => x.v), ...extra });
    snap(1, `共 ${d} 位數，從最低位（個位）開始，每一位都要用穩定排序。`, 0);
    for (let i = 1; i <= d; i++) {
      const dig = v => Math.floor(v / 10 ** (i - 1)) % 10;
      snap(2, `i = ${i}：看從右數第 ${i} 位（標色的數字）。`, i);
      cur = cur.slice().sort((a, b) => dig(a.v) - dig(b.v)); // Array.sort 是穩定的
      snap(2, `依第 ${i} 位穩定排序完成：${cur.map(x => x.v).join(',')}。這一位相同的，保持上一輪的先後順序。`, i, { key: ['pass' + i] });
    }
    return steps;
  },
  answer: s => s.arr.join(','),
  view(box, cfg, W) {
    const d = String(Math.max(...cfg.A)).length;
    const w = Math.max(W, 14 * d + 16);
    const wrap = document.createElement('div'); wrap.className = 'tr-row';
    wrap.innerHTML = '<div class="tr-name">A</div>';
    box.appendChild(wrap);
    const t = new Track(wrap, { slots: cfg.A.map((_, i) => i + 1), layout: rowLayout(w, 6, 1), label: p => p, w, h: 40 });
    return s => t.update(s.arr.map((v, i) => {
      const str = String(v).padStart(d, '0');
      const html = s.digit ? [...str].map((c, k) => (k === d - s.digit ? `<b class="dg">${c}</b>` : c)).join('') : str;
      return { id: 'v' + v, pos: i + 1, html };
    }));
  },
};

/* ---------- 桶排序 ---------- */
const BUCKET = {
  title: 'BUCKET-SORT',
  code: ['n ← length[A]', 'for i ← 1 to n', '    do insert A[i] into list B[⌊nA[i]⌋]', 'for i ← 0 to n − 1',
    '    do sort list B[i] with insertion sort', 'concatenate B[0], B[1], …, B[n−1] together in order'],
  run({ A }) {
    const n = A.length, B = Array.from({ length: n }, () => []);
    const steps = [];
    const snap = (line, text, extra = {}) => steps.push({ line, text, B: clone(B), ...extra });
    snap(1, `n = ${n}，把 [0, 1) 切成 ${n} 個桶 B[0..${n - 1}]。`);
    for (let i = 1; i <= n; i++) {
      const v = A[i - 1], b = Math.floor(n * v + 1e-9);
      B[b].push(v);
      snap(3, `i = ${i}：⌊${n} × ${v}⌋ = ${b}，把 ${v} 插到 B[${b}] 的尾端。`, { key: ['ins' + i], hlA: i, hlB: b, fresh: v });
    }
    for (let i = 0; i < n; i++) {
      snap(4, `i = ${i}：準備排 B[${i}]。（題庫「第 4 行做到 i = ${i}」= ${i ? `B[0..${i - 1}] 已排好、` : ''}B[${i}] 還沒排）`,
        { key: ['sort' + i], hlB: i, sortedUpTo: i - 1 });
      if (B[i].length > 1) {
        B[i].sort((a, b) => a - b);
        snap(5, `用插入排序排好 B[${i}]：${B[i].join(', ')}。`, { hlB: i, sortedUpTo: i, sortedNow: i });
      }
    }
    snap(6, `依序串接各桶：${B.flat().join(', ')}。`, { sortedUpTo: n - 1, out: B.flat() });
    return steps;
  },
  answer: (s, cfg) => (cfg.show || [1, 2, 7]).map(b => `B[${b}] = ${s.B[b].join(', ') || '（空）'}`).join('\n'),
  view(box, cfg, W) {
    const n = cfg.A.length;
    const wrap = document.createElement('div'); wrap.className = 'tr-row';
    wrap.innerHTML = '<div class="tr-name">A</div>';
    box.appendChild(wrap);
    const w = Math.max(W, 46);
    const tA = new Track(wrap, { slots: cfg.A.map((_, i) => i + 1), layout: rowLayout(w, 6, 1), label: p => p, w, h: 36 });
    tA.update(cfg.A.map((v, i) => ({ id: 'a' + i, pos: i + 1, html: v })));
    const grid = document.createElement('div'); grid.className = 'tr-buckets';
    box.appendChild(grid);
    const out = document.createElement('div'); out.className = 'tr-out';
    box.appendChild(out);
    return s => {
      tA.update(cfg.A.map((v, i) => ({ id: 'a' + i, pos: i + 1, html: v, cls: s.hlA === i + 1 ? 'hot' : '' })));
      grid.innerHTML = s.B.map((list, b) => `<div class="tr-bucket ${s.hlB === b ? 'hot' : ''} ${s.sortedUpTo >= b ? 'sorted' : ''} ${(cfg.show || [1, 2, 7]).includes(b) ? 'asked' : ''}">
        <span class="tr-bname">B[${b}]</span>${list.map(v => `<span class="tr-chip ${v === s.fresh && s.hlB === b ? 'born' : ''} ${s.sortedNow === b ? 'bump' : ''}">${v}</span>`).join('<span class="tr-arrow">→</span>')}</div>`).join('');
      out.innerHTML = s.out ? `<span class="tr-name">輸出</span>${s.out.map(v => `<span class="tr-chip born">${v}</span>`).join('')}` : '';
    };
  },
};

/* ---------- 堆積：Build-Max-Heap / Heapsort 共用 Max-Heapify ---------- */
const HEAPIFY_CODE = ['MAX-HEAPIFY(A, i)', '  l ← LEFT(i)；r ← RIGHT(i)', '  if l ≤ heap-size and A[l] > A[i] then largest ← l else largest ← i',
  '  if r ≤ heap-size and A[r] > A[largest] then largest ← r', '  if largest ≠ i', '    then exchange A[i] ↔ A[largest]', '         MAX-HEAPIFY(A, largest)'];

function heapifySteps(arr, i, size, snap, depth = 0) {
  const l = 2 * i, r = 2 * i + 1;
  let largest = l <= size && arr[l - 1].v > arr[i - 1].v ? l : i;
  if (r <= size && arr[r - 1].v > arr[largest - 1].v) largest = r;
  const kids = [l <= size ? `左 A[${l}] = ${arr[l - 1].v}` : '沒有左子', r <= size ? `右 A[${r}] = ${arr[r - 1].v}` : '沒有右子'];
  snap('h3', `${depth ? '（遞迴）' : ''}Max-Heapify(A, ${i})：A[${i}] = ${arr[i - 1].v}，${kids.join('，')} → 最大的是 A[${largest}] = ${arr[largest - 1].v}。`,
    { cmp: [i, l, r].filter(p => p <= size), at: i });
  if (largest === i) { snap('h4', `largest = i，A[${i}] 已經比子節點大，這次 Max-Heapify 結束。`, { at: i, ok: [i] }); return; }
  [arr[i - 1], arr[largest - 1]] = [arr[largest - 1], arr[i - 1]];
  snap('h5', `交換 A[${i}] ↔ A[${largest}]：${arr[largest - 1].v} 往下沉、${arr[i - 1].v} 往上浮。`, { hot: [i, largest], at: largest });
  heapifySteps(arr, largest, size, snap, depth + 1);
}

const HEAP_VIEW = function (box, cfg, W) {
  const n = cfg.A.length;
  const wrap = document.createElement('div'); wrap.className = 'tr-row';
  wrap.innerHTML = '<div class="tr-name">A</div>';
  box.appendChild(wrap);
  const tA = new Track(wrap, { slots: cfg.A.map((_, i) => i + 1), layout: rowLayout(W, 6, 1), label: p => p, w: W, h: W });
  // 樹：第 d 層有 2^d 個位置
  const TW = Math.max(320, Math.min(520, box.clientWidth - 20)), nodeW = 34, levelH = 56;
  const depthOf = p => Math.floor(Math.log2(p));
  const tl = p => { const d = depthOf(p), slot = TW / 2 ** d; return { x: (p - 2 ** d + 0.5) * slot - nodeW / 2, y: d * levelH }; };
  const treeBox = document.createElement('div'); treeBox.className = 'tr-tree';
  box.appendChild(treeBox);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const maxD = depthOf(n);
  svg.setAttribute('width', TW); svg.setAttribute('height', maxD * levelH + nodeW);
  for (let p = 2; p <= n; p++) {
    const a = tl(Math.floor(p / 2)), b = tl(p), ln = document.createElementNS(svg.namespaceURI, 'line');
    ln.setAttribute('x1', a.x + nodeW / 2); ln.setAttribute('y1', a.y + nodeW / 2);
    ln.setAttribute('x2', b.x + nodeW / 2); ln.setAttribute('y2', b.y + nodeW / 2);
    ln.dataset.child = p;
    svg.appendChild(ln);
  }
  treeBox.appendChild(svg);
  const tT = new Track(treeBox, { slots: cfg.A.map((_, i) => i + 1), layout: tl, w: nodeW, h: nodeW, cls: 'tree' });
  tT.el.style.position = 'absolute'; tT.el.style.left = '0'; tT.el.style.top = '0';
  treeBox.style.width = TW + 'px'; treeBox.style.height = maxD * levelH + nodeW + 'px';
  return s => {
    const cls = p => [p > s.size ? 'done' : '', (s.hot || []).includes(p) ? 'hot' : '', (s.cmp || []).includes(p) ? 'cmp' : '', (s.ok || []).includes(p) ? 'ok' : ''].join(' ');
    const items = s.arr.map((x, i) => ({ id: 'n' + x.id, pos: i + 1, html: x.v, cls: cls(i + 1) }));
    tA.update(items); tT.update(items);
    tA.pointers(s.ptr ? [{ name: s.ptrName || 'i', pos: s.ptr }] : []);
    svg.querySelectorAll('line').forEach(l => l.classList.toggle('off', +l.dataset.child > s.size));
  };
};

const BUILD_HEAP = {
  title: 'BUILD-MAX-HEAP',
  code: ['BUILD-MAX-HEAP(A)', '1  heap-size[A] ← length[A]', '2  for i ← ⌊length[A]/2⌋ downto 1', '3      do MAX-HEAPIFY(A, i)', '', ...HEAPIFY_CODE],
  lineMap: { b1: 2, b2: 3, b3: 4, h1: 6, h2: 7, h3: 9, h4: 10, h5: 11, h6: 12 },
  run({ A }) {
    const arr = A.map((v, i) => ({ v, id: i })), n = A.length, steps = [];
    let ptr = null;
    const snap = (line, text, extra = {}) => steps.push({ line: this.lineMap[line], text, arr: clone(arr), size: n, ptr, ...extra });
    snap('b1', `heap-size = ${n}。葉節點（${Math.floor(n / 2) + 1}..${n}）本來就是堆積，只要從 ⌊${n}/2⌋ = ${Math.floor(n / 2)} 往回做。`);
    for (let i = Math.floor(n / 2); i >= 1; i--) {
      ptr = i;
      snap('b2', `i = ${i}：呼叫 Max-Heapify(A, ${i})。（題庫圖上標 i = ${i}，就是這輪開始前的陣列）`, { key: ['before' + i] });
      heapifySteps(arr, i, n, snap);
      snap('b3', `i = ${i} 這輪結束：${arr.map(x => x.v).join(',')}。`, { key: ['after' + i], ok: [] });
    }
    ptr = null;
    snap('b2', `迴圈結束，整個陣列是 max-heap，最大值 ${arr[0].v} 在根。`, { key: ['done'] });
    return steps;
  },
  answer: s => s.arr.map(x => x.v).join(','),
  view: HEAP_VIEW,
};

const HEAPSORT = {
  title: 'HEAPSORT',
  code: ['HEAPSORT(A)', '1  BUILD-MAX-HEAP(A)', '2  for i ← length[A] downto 2', '3      do exchange A[1] ↔ A[i]', '4         heap-size[A] ← heap-size[A] − 1', '5         MAX-HEAPIFY(A, 1)', '', ...HEAPIFY_CODE],
  lineMap: { s1: 2, s2: 3, s3: 4, s4: 5, s5: 6, h1: 8, h2: 9, h3: 11, h4: 12, h5: 13, h6: 14 },
  run({ A }) {
    const arr = A.map((v, i) => ({ v, id: i })), n = A.length, steps = [];
    let size = n, ptr = null;
    const snap = (line, text, extra = {}) => steps.push({ line: this.lineMap[line], text, arr: clone(arr), size, ptr, ...extra });
    snap('s1', `從已經建好的 max-heap 開始：${A.join(',')}（課本圖 6.4）。`);
    for (let i = n; i >= 2; i--) {
      ptr = i;
      [arr[0], arr[i - 1]] = [arr[i - 1], arr[0]];
      snap('s3', `i = ${i}：把根（目前最大 ${arr[i - 1].v}）和 A[${i}] = ${arr[0].v} 交換，最大值就定位在 ${i}。`, { hot: [1, i] });
      size--;
      snap('s4', `heap-size 減 1 → ${size}，第 ${i} 格（灰色）之後不再參與。`);
      heapifySteps(arr, 1, size, snap);
      snap('s2', `i = ${i} 這輪結束：${arr.map(x => x.v).join(',')}。`, { key: ['after' + i] });
    }
    ptr = null;
    snap('s2', `排序完成：${arr.map(x => x.v).join(',')}。`, { key: ['done'], size: 0 });
    return steps;
  },
  answer: s => s.arr.map(x => x.v).join(','),
  view: HEAP_VIEW,
};

/* ---------- 快速排序 PARTITION（課本 Lomuto 版） ---------- */
const PARTITION = {
  title: 'PARTITION(A, p, r)',
  code: ['x ← A[r]', 'i ← p − 1', 'for j ← p to r − 1', '    if A[j] ≤ x', '        i ← i + 1', '        exchange A[i] ↔ A[j]', 'exchange A[i + 1] ↔ A[r]', 'return i + 1'],
  run({ A }) {
    const arr = A.map((v, k) => ({ v, id: k })), n = A.length, steps = [];
    const x = A[n - 1];
    let i = 0, j = null;
    const snap = (line, text, extra = {}) => steps.push({ line, text, arr: clone(arr), i, j, x, ...extra });
    snap(1, `pivot x = A[${n}] = ${x}（最後一個元素）。`, { pivot: true });
    snap(2, `i = p − 1 = 0，還在陣列左邊外面。綠色區 A[1..i] 會放 ≤ ${x} 的，橘色區 A[i+1..j−1] 放 > ${x} 的。`, { pivot: true });
    for (j = 1; j <= n - 1; j++) {
      const v = arr[j - 1].v;
      snap(3, `j = ${j}，j 指向 ${v}。（還沒判斷，題目說「j 指向 ${v} 的當下」就是這個狀態）`, { key: ['j=' + v], pivot: true, cmp: [j] });
      if (v <= x) {
        i++;
        [arr[i - 1], arr[j - 1]] = [arr[j - 1], arr[i - 1]];
        snap(6, i === j ? `${v} ≤ ${x}：i → ${i}，A[${i}] 和自己交換（位置不變）。` : `${v} ≤ ${x}：i → ${i}，交換 A[${i}] ↔ A[${j}]，把 ${v} 換到綠色區。`, { pivot: true, hot: [i, j] });
      } else {
        snap(4, `${v} > ${x}：不動，橘色區多一格。`, { pivot: true });
      }
    }
    j = null;
    [arr[i], arr[n - 1]] = [arr[n - 1], arr[i]];
    snap(7, `迴圈結束，交換 A[${i + 1}] ↔ A[${n}]，pivot ${x} 歸位到第 ${i + 1} 格。`, { hot: [i + 1, n], q: i + 1 });
    snap(8, `回傳 q = ${i + 1}。左邊都 ≤ ${x}、右邊都 > ${x}（兩邊內部還沒排序）：${arr.map(o => o.v).join(' ')}。`, { key: ['final'], q: i + 1 });
    return steps;
  },
  answer: s => s.arr.map(o => o.v).join(' ') + (s.q ? `\npivot ${s.x} 在陣列的第 ${s.q} 個位置` : ''),
  view(box, cfg, W) {
    const n = cfg.A.length;
    const wrap = document.createElement('div'); wrap.className = 'tr-row';
    wrap.innerHTML = '<div class="tr-name">A</div>';
    box.appendChild(wrap);
    const t = new Track(wrap, { slots: cfg.A.map((_, k) => k + 1), layout: rowLayout(W, 6, 1), label: p => p, w: W, h: W });
    return s => {
      const region = p => {
        if (s.q) return p === s.q ? 'ok' : p < s.q ? 'low' : 'high';
        if (s.pivot && p === n) return 'pivot';
        if (p <= s.i) return 'low';
        if (s.j && p < s.j) return 'high';
        return '';
      };
      t.update(s.arr.map((o, k) => ({ id: 'p' + o.id, pos: k + 1, html: o.v, cls: [region(k + 1), (s.hot || []).includes(k + 1) ? 'hot' : '', (s.cmp || []).includes(k + 1) ? 'cmp' : ''].join(' ') })));
      const ps = [{ name: 'i', pos: s.i, row: 0 }];
      if (s.j) ps.push({ name: 'j', pos: s.j, row: 1 });
      if (s.q) ps.length = 0, ps.push({ name: 'q', pos: s.q });
      t.pointers(ps);
    };
  },
};

/* ---------- Round Robin 甘特圖 ---------- */
const RR = {
  title: 'Round Robin',
  code: ['依到達順序排入就緒佇列', '取出佇列最前面的行程', '最多執行一個時間片 TQ', '還沒做完 → 排回佇列尾端', '做完 → 離開'],
  run({ procs, q, blocks }) {
    const rem = Object.fromEntries(procs.map(([p, b]) => [p, b]));
    const queue = procs.map(([p]) => p), gantt = [], steps = [];
    let t = 0;
    const snap = (line, text, extra = {}) => steps.push({ line, text, rem: { ...rem }, queue: queue.slice(), gantt: clone(gantt), t, ...extra });
    snap(1, `TQ = ${q}，就緒佇列：${queue.join(' → ')}。`);
    while (queue.length) {
      const p = queue.shift();
      const run = Math.min(q, rem[p]);
      snap(2, `取出 ${p}（剩 ${rem[p]}）。`, { cur: p });
      rem[p] -= run; t += run;
      gantt.push({ p, run, end: t, label: String.fromCharCode(65 + gantt.length) });
      const done = rem[p] === 0;
      if (!done) queue.push(p);
      snap(done ? 5 : 4, `${gantt.at(-1).label}：${p} 跑 ${run}${run < q ? '（不到一個時間片就做完）' : ''}，${done ? `${p} 完成，離開。` : `還剩 ${rem[p]}，排回佇列尾端。`}`,
        { key: gantt.length === blocks ? ['blocks'] : [], cur: p });
    }
    snap(1, `全部完成，總共 ${t} 個時間單位。`);
    return steps;
  },
  answer: s => s.gantt.map(g => g.p).join('->'),
  view(box, cfg) {
    const total = cfg.procs.reduce((a, [, b]) => a + b, 0);
    const scale = Math.max(9, Math.min(26, Math.floor((box.clientWidth - 12) / total)));
    const table = document.createElement('div'); table.className = 'tr-procs';
    const gantt = document.createElement('div'); gantt.className = 'tr-gantt';
    gantt.style.width = total * scale + 'px';
    const queue = document.createElement('div'); queue.className = 'tr-queue';
    box.append(table, queue, gantt);
    const colors = {};
    cfg.procs.forEach(([p], k) => { colors[p] = k; });
    return s => {
      table.innerHTML = cfg.procs.map(([p, b]) => `<div class="tr-proc c${colors[p]} ${s.cur === p ? 'hot' : ''} ${s.rem[p] === 0 ? 'fin' : ''}">
        <b>${p}</b><span>剩 ${s.rem[p]} / ${b}</span><i style="width:${(s.rem[p] / b) * 100}%"></i></div>`).join('');
      queue.innerHTML = `<span class="tr-name">佇列</span>${s.queue.map(p => `<span class="tr-chip c${colors[p]}">${p}</span>`).join('') || '<span class="muted">（空）</span>'}`;
      gantt.innerHTML = s.gantt.map((g, k) => `<div class="tr-gblock c${colors[g.p]} ${k === s.gantt.length - 1 ? 'born' : ''}" style="width:${g.run * scale}px">
        <b>${g.p}</b><small>${g.label}</small><em>${g.end}</em></div>`).join('');
    };
  },
};

const ALGOS = { counting: COUNTING, radix: RADIX, bucket: BUCKET, build: BUILD_HEAP, heapsort: HEAPSORT, partition: PARTITION, rr: RR };

/* ---------- 每一題用哪個演算法、題目問的是哪一步 ---------- */
const CS1 = [2, 5, 3, 0, 2, 3, 0, 3], CS2 = [2, 5, 3, 0, 2, 3, 0, 5, 1, 2, 1, 3, 2, 0, 4], CS3 = [2, 5, 3, 0, 1, 2, 1, 3, 2, 0, 4];
const BK = [0.78, 0.17, 0.39, 0.26, 0.72, 0.94, 0.21, 0.12, 0.23, 0.68];
const HEAP0 = [4, 1, 3, 2, 16, 9, 10, 14, 8, 7], HEAPED = [16, 14, 10, 8, 7, 9, 3, 2, 4, 1];
const ask = (key, label) => ({ key, label });
window.TRACES = {
  2451: { algo: 'counting', A: CS1, asks: [ask('before9', '做到第 9 行前')] },
  2452: { algo: 'counting', A: CS1, asks: [ask('j2', '做到第 9 行 j = 2')] },
  2453: { algo: 'counting', A: CS1, asks: [ask('j4', '做到第 9 行 j = 4')] },
  2463: { algo: 'counting', A: CS2, asks: [ask('before9', '做到第 9 行前')] },
  2464: { algo: 'counting', A: CS2, asks: [ask('j12', '做到第 9 行 j = 12')] },
  2465: { algo: 'counting', A: CS2, asks: [ask('j4', '做到第 9 行 j = 4')] },
  2466: { algo: 'counting', A: CS2, asks: [ask('done', '執行完後')] },
  2467: { algo: 'counting', A: CS3, asks: [ask('done', '執行完後')] },
  2454: { algo: 'radix', A: [329, 457, 657, 839, 436, 720, 355], asks: [ask('pass2', '當 i = 2 時')] },
  2456: { algo: 'radix', A: [4329, 4057, 6507, 2839, 6436, 7720, 8355], asks: [ask('pass3', '當 i = 3 時')] },
  2457: { algo: 'bucket', A: BK, asks: [ask('ins7', '第 2 行做到 i = 7')] },
  tca3ov4: { algo: 'bucket', A: BK, asks: [ask('ins7', '第 2 行做到 i = 7')] },
  2459: { algo: 'bucket', A: BK, asks: [ask('ins5', '第 2 行做到 i = 5')] },
  te7jilb: { algo: 'bucket', A: BK, asks: [ask('ins5', '第 2 行做到 i = 5')] },
  2458: { algo: 'bucket', A: BK, asks: [ask('sort7', '第 4 行做到 i = 7')] },
  t1v5dj8k: { algo: 'bucket', A: BK, asks: [ask('sort7', '第 4 行做到 i = 7')] },
  2460: { algo: 'bucket', A: BK, show: [1, 2, 6], asks: [ask('sort5', '第 4 行做到 i = 5')] },
  t2duw8t: { algo: 'bucket', A: BK, show: [1, 2, 6], asks: [ask('sort5', '第 4 行做到 i = 5')] },
  2339: { algo: 'build', A: HEAP0, asks: [ask('after5', '跑完 i = 5 這輪')] },
  2344: { algo: 'build', A: HEAP0, asks: [ask('after3', '跑完 i = 3 這輪')] },
  2345: { algo: 'heapsort', A: HEAPED, asks: [ask('after9', '下一步 i − 1 = 9 這輪')] },
  g1hg0pmf: { algo: 'heapsort', A: HEAPED, asks: [ask('after9', '下一步 i − 1 = 9 這輪')] },
  2346: { algo: 'heapsort', A: HEAPED, asks: [ask('after6', '下一步 i − 1 = 6 這輪')] },
  g14k3yh0: { algo: 'partition', A: [3, 2, 9, 8, 1, 7, 6, 5], asks: [ask('j=1', '問題 1：j 指向 1 的當下'), ask('final', '問題 2：Partition 執行完')] },
  tl5zn42: { algo: 'partition', A: [3, 2, 9, 8, 1, 7, 6, 5], asks: [ask('j=1', '問題 1：j 指向 1 的當下'), ask('final', '問題 2：Partition 執行完')] },
  t1qc43m3: { algo: 'partition', A: [2, 8, 7, 1, 3, 5, 6, 4], asks: [ask('j=3', 'j 指向 3 的當下')] },
  tubjbnn: { algo: 'partition', A: [2, 8, 7, 1, 3, 5, 6, 4], asks: [ask('final', '執行完畢後 pivot 的位置')] },
  141: { algo: 'rr', procs: [['P1', 20], ['P2', 3], ['P3', 7]], q: 4, blocks: 8, asks: [ask('blocks', 'A～H 的順序')] },
};

/* ---------- 播放器 ---------- */
const player = { cfg: null, algo: null, steps: [], i: 0, timer: null, render: null };

function openTrace(id) {
  const cfg = window.TRACES[id];
  if (!cfg) return;
  closeTrace();
  const algo = ALGOS[cfg.algo];
  const steps = algo.run.call(algo, cfg);
  const wrap = document.createElement('div');
  wrap.id = 'trace-modal';
  wrap.innerHTML = `<div class="tr-card" role="dialog" aria-label="動畫解說">
    <div class="tr-head"><b>${tEsc(algo.title)}</b><span class="muted">逐步動畫解說</span>
      <button class="tr-x" data-tr="close" aria-label="關閉">✕</button></div>
    <div class="tr-asks">${cfg.asks.map((a, k) => `<button data-tr="ask" data-k="${k}">★ 跳到：${tEsc(a.label)}</button>`).join('')}</div>
    <div class="tr-body">
      <ol class="tr-code">${algo.code.map((l, k) => `<li data-n="${k + 1}" class="${l ? '' : 'blank'}">${tEsc(l)}</li>`).join('')}</ol>
      <div class="tr-viz"></div>
    </div>
    <div class="tr-caption"><div class="tr-text"></div><div class="tr-stamp" hidden></div></div>
    <div class="tr-ctrl">
      <button data-tr="first" title="回到開頭">⏮</button>
      <button data-tr="prev" title="上一步（←）">◀</button>
      <button data-tr="play" class="primary tr-play" title="播放／暫停（空白鍵）">▶ 播放</button>
      <button data-tr="next" title="下一步（→）">▶▏</button>
      <input type="range" class="tr-range" min="0" max="${steps.length - 1}" value="0" aria-label="步驟">
      <span class="tr-count muted"></span>
    </div>
  </div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('tr-open');
  const viz = T$('.tr-viz', wrap);
  const W = Math.max(30, Math.min(44, Math.floor((viz.clientWidth - 40) / ((cfg.A || []).length + 1.5))));
  Object.assign(player, { cfg, algo, steps, i: 0, render: algo.view(viz, cfg, W) });
  showStep(0);
}

function closeTrace() {
  clearInterval(player.timer); player.timer = null;
  const m = document.getElementById('trace-modal');
  if (m) m.remove();
  document.body.classList.remove('tr-open');
}

function showStep(i) {
  const { steps, cfg, algo } = player;
  player.i = Math.max(0, Math.min(steps.length - 1, i));
  const s = steps[player.i], m = document.getElementById('trace-modal');
  if (!m) return;
  player.render(s);
  m.querySelectorAll('.tr-code li').forEach(li => li.classList.toggle('cur', +li.dataset.n === s.line));
  T$('.tr-code li.cur', m)?.scrollIntoView({ block: 'nearest' });
  T$('.tr-text', m).textContent = s.text;
  const hit = cfg.asks.find(a => (s.key || []).includes(a.key));
  const stamp = T$('.tr-stamp', m);
  stamp.hidden = !hit;
  if (hit) {
    stamp.innerHTML = `<b>★ 題目問的就是這一步：${tEsc(hit.label)}</b><pre>${tEsc(algo.answer(s, cfg))}</pre>`;
    stamp.classList.remove('bump'); void stamp.offsetWidth; stamp.classList.add('bump');
    if (player.timer) togglePlay(); // 播到答案先停下來
  }
  T$('.tr-range', m).value = player.i;
  T$('.tr-count', m).textContent = `${player.i + 1} / ${steps.length}`;
}

function togglePlay() {
  const btn = T$('#trace-modal .tr-play');
  if (player.timer) {
    clearInterval(player.timer); player.timer = null;
    if (btn) btn.textContent = '▶ 播放';
    return;
  }
  if (player.i >= player.steps.length - 1) showStep(0);
  if (btn) btn.textContent = '⏸ 暫停';
  player.timer = setInterval(() => {
    if (player.i >= player.steps.length - 1) { togglePlay(); return; }
    showStep(player.i + 1);
  }, 1300);
  // 從答案那一步開始播時，先往前一步，避免一按就停
  const s = player.steps[player.i];
  if (player.cfg.asks.some(a => (s.key || []).includes(a.key))) showStep(player.i + 1);
}

function jumpToAsk(k) {
  const key = player.cfg.asks[k].key;
  const at = player.steps.findIndex(s => (s.key || []).includes(key));
  if (player.timer) togglePlay();
  if (at >= 0) showStep(at);
}

document.addEventListener('click', e => {
  const open = e.target.closest('[data-act="trace"]');
  if (open) { openTrace(open.dataset.id); return; }
  const m = document.getElementById('trace-modal');
  if (!m) return;
  if (e.target === m) { closeTrace(); return; }
  const b = e.target.closest('[data-tr]');
  if (!b) return;
  const a = b.dataset.tr;
  if (a === 'close') closeTrace();
  else if (a === 'first') { if (player.timer) togglePlay(); showStep(0); }
  else if (a === 'prev') { if (player.timer) togglePlay(); showStep(player.i - 1); }
  else if (a === 'next') { if (player.timer) togglePlay(); showStep(player.i + 1); }
  else if (a === 'play') togglePlay();
  else if (a === 'ask') jumpToAsk(+b.dataset.k);
});
document.addEventListener('input', e => {
  if (e.target.classList?.contains('tr-range')) { if (player.timer) togglePlay(); showStep(+e.target.value); }
});
// 開著動畫時，方向鍵／空白鍵／Esc 給播放器用，不要觸發刷題的快捷鍵
document.addEventListener('keydown', e => {
  if (!document.getElementById('trace-modal')) return;
  const k = e.key;
  e.stopImmediatePropagation();
  if (k === 'Tab' || k === 'Enter') return; // 保留鍵盤操作按鈕的預設行為
  if (k === 'Escape') closeTrace();
  else if (k === 'ArrowRight') { if (player.timer) togglePlay(); showStep(player.i + 1); }
  else if (k === 'ArrowLeft') { if (player.timer) togglePlay(); showStep(player.i - 1); }
  else if (k === ' ') togglePlay();
  else return;
  e.preventDefault();
}, true);

// 給驗證腳本用：跑出某題在「題目問的那一步」的答案文字
window.traceAnswers = id => {
  const cfg = window.TRACES[id], algo = ALGOS[cfg.algo], steps = algo.run.call(algo, cfg);
  return cfg.asks.map(a => { const s = steps.find(x => (x.key || []).includes(a.key)); return s ? algo.answer(s, cfg) : null; });
};
