# 堆積、堆積排序與優先佇列

## 1. 為什麼要學排序、各排序比較

排序重要的原因：應用本身需要、常當作其他演算法的**子程序**、用到豐富的設計技巧、有非平凡的下界、實作時會遇到很多工程問題。

| 演算法 | 時間 | 原地？ | 備註 |
|---|---|---|---|
| 插入排序 | 最壞 Θ(n²) | ✔ | 小陣列很快 |
| 合併排序 | Θ(n lg n) | ✘ | 需要 L、R 輔助陣列 |
| **堆積排序** | **O(n lg n)** | **✔** | 第 6 章，不穩定 |
| 快速排序 | 最壞 O(n²)、平均 O(n lg n) | ✔ | 第 7 章 |
| 比較排序下界 | Ω(n lg n) | — | 決策樹模型，第 8 章 |

> 相關題目：堆積排序, heapsort, 原地, in-place, 穩定, 比較排序

## 2. 二元堆積（Binary Heap）

- 一個**陣列物件**，可以看成一棵**完全二元樹（complete binary tree）**：除了最後一層都填滿，最後一層**由左到右**填。
- 索引從 **1** 開始：

| 函式 | 公式 |
|---|---|
| PARENT(i) | ⌊i/2⌋ |
| LEFT(i) | 2i |
| RIGHT(i) | 2i + 1 |

- **Max-heap 性質**：A[PARENT(i)] ≥ A[i]（父節點 ≥ 子節點，最大值在根）
- **Min-heap 性質**：A[PARENT(i)] ≤ A[i]
- 節點的**高度** = 從它往下到葉子最長路徑的**邊數**；堆積的高度 = 根的高度 = **Θ(lg n)**
- 基本程序：Max-Heapify、Build-Max-Heap、Heapsort、Max-Heap-Insert、Heap-Extract-Max、Heap-Increase-Key、Heap-Maximum

> 相關題目：二元堆積, binary heap, 完全二元樹, complete, 完整樹, 堆積結構, 節點通常以, 關鍵概念, 父節點, 左子節點, 2i, 索引, 堆積的類型, Max-Heap, Min-Heap, Heap Property, 樹的高度, 堆積樹的高度, 陣列

## 3. Max-Heapify：維持堆積性質

- 輸入：陣列 **A** 和索引 **i**。
- 前提：以 LEFT(i)、RIGHT(i) 為根的子樹**已經是 max-heap**，只有 A[i] 可能比子節點小。
- 作法：讓 A[i] 和較大的子節點交換，再對被換下去的位置**遞迴**。

```
Max-Heapify(A, i)
1  l ← LEFT(i)
2  r ← RIGHT(i)
3  if l ≤ heap-size[A] and A[l] > A[i]
4      then largest ← l
5      else largest ← i
6  if r ≤ heap-size[A] and A[r] > A[largest]
7      then largest ← r
8  if largest ≠ i
9      then exchange A[i] ↔ A[largest]
10          Max-Heapify(A, largest)
```

- 第 6 行比的是 **A[r] > A[largest]**（不是 A[i]）；第 10 行遞迴的是 **largest**。
- 子樹最多有 **2n/3** 個節點（最後一層剛好半滿時）→ **T(n) ≤ T(2n/3) + Θ(1)** → **O(lg n)**，也可寫成 O(h)。

> 💡 填空寫法：`T(n)<=T(2n/3)+big_theta(1)`（中間不留空白）。

> 相關題目：Max-Heapify, 第6與第10行, 第 6 行, 遞迴式, 2n/3, 子樹已經是

## 4. Build-Max-Heap：把陣列變成 max-heap

```
Build-Max-Heap(A)
1  heap-size[A] ← length[A]
2  for i ← ⌊length[A]/2⌋ downto 1
3      do Max-Heapify(A, i)
```

- 從 ⌊n/2⌋ 往回做到根：⌊n/2⌋+1 … n 都是葉子，本身就是 heap。
- 直覺上 n 次 × O(lg n) = O(n lg n)，但大部分節點都很矮：Σ (n/2^(h+1))·O(h) = O(n · Σ h/2^h) = **O(n)**。

**追蹤範例**：A = [4, 1, 3, 2, 16, 9, 10, 14, 8, 7]（n = 10，從 i = 5 開始）

| 做完 i = | 陣列 A |
|---|---|
| 5 | 4, 1, 3, 2, 16, 9, 10, 14, 8, 7（16 > 7，不用換） |
| 4 | 4, 1, 3, **14**, 16, 9, 10, **2**, 8, 7 |
| 3 | 4, 1, **10**, 14, 16, 9, **3**, 2, 8, 7 |
| 2 | 4, **16**, 10, 14, **7**, 9, 3, 2, 8, **1** |
| 1 | **16, 14**, 10, **8**, 7, 9, 3, 2, **4**, 1 |

> 相關題目：Build-Max-Heap, 建立過程, 非葉節點, max-heap 屬性

## 5. Heapsort

```
Heapsort(A)
1  Build-Max-Heap(A)
2  for i ← length[A] downto 2
3      do exchange A[1] ↔ A[i]          ▷ 把目前最大值放到正確位置
4         heap-size[A] ← heap-size[A] − 1  ▷ 縮小（decrease）堆積
5         Max-Heapify(A, 1)
```

- Build 花 O(n)，之後 n−1 次 Max-Heapify 各 O(lg n) → **O(n lg n)**，原地排序、**不穩定**。

**接續上面的追蹤**（每列是做完該 i 之後）

| i | 陣列 A（後面粗體是已排好的） |
|---|---|
| 10 | 14, 8, 10, 4, 7, 9, 3, 2, 1, **16** |
| 9 | 10, 8, 9, 4, 7, 1, 3, 2, **14, 16** |
| 8 | 9, 8, 3, 4, 7, 1, 2, **10, 14, 16** |
| 7 | 8, 7, 3, 4, 2, 1, **9, 10, 14, 16** |
| 6 | 7, 4, 3, 1, 2, **8, 9, 10, 14, 16** |
| 5 | 4, 2, 3, 1, **7, 8, 9, 10, 14, 16** |
| 4 | 3, 2, 1, **4, 7, 8, 9, 10, 14, 16** |
| 3 | 2, 1, **3, 4, 7, 8, 9, 10, 14, 16** |
| 2 | 1, **2, 3, 4, 7, 8, 9, 10, 14, 16** |

> ⚠️ 題目常問「目前跑到 i，下一步 i−1 時陣列是什麼」——先**交換 A[1] 和 A[i]**，heap-size 減 1，再從根做 Max-Heapify。

> 相關題目：Heapsort, 交換 A[1], heap-size, 堆積排序, 過程的結果, exchange

## 6. 優先佇列（Priority Queue）

維護一個集合 S，每個元素有 key。Max-priority queue 支援：

| 操作 | 作用 | 時間 |
|---|---|---|
| Insert(S, x) | 插入 | O(lg n) |
| Maximum(S) | 回傳最大 | O(1) |
| Extract-Max(S) | 移除並回傳最大 | O(lg n) |
| Increase-Key(S, x, k) | 把 key 調大 | O(lg n) |

- **Heap-Extract-Max**：heap-size < 1 → 錯誤「**heap underflow**」；把最後一個元素搬到根、heap-size 減 1、Max-Heapify(A, 1)。
- **Heap-Increase-Key(A, i, key)**：key 比原本小就報錯；設定後**一路和父節點比較、往上換**直到不再大於父節點（或到根）。
- **Max-Heap-Insert**：heap-size 加 1、新位置先放 **−∞**，再呼叫 Increase-Key。
- 應用：作業排程、行程管理、網路封包排程等。

> 相關題目：優先佇列, priority queue, Extract-Max, Increase-Key, Insert, underflow, 應用場景

## 7. 最小－最大堆積樹（Min-Max Heap）

- 一棵**完全二元樹**，層級交替：**奇數層是最小層（min level），偶數層是最大層（max level）**，**根是最小值**。
- 規則：
  1. 第 1 層的鍵值 < 第 3 層 < 第 5 層 < …（奇數層由上往下越來越大）
  2. 第 2 層的鍵值 > 第 4 層 > 第 6 層 > …（偶數層由上往下越來越小）
- 判斷題做法：檢查每個節點是否比它所在「最小層／最大層」的規則矛盾，例如第 3 層的值比根還小就違反規則 1。

> 相關題目：最小-最大, 最小－最大, min-max
