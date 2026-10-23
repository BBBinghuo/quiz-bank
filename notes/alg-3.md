# 遞迴關係式：代入法、遞迴樹與大師定理

## 1. 三種解遞迴式的方法與「技術細節」

形式：T(n) = aT(n/b) + f(n)。三種主要方法：

1. **代入法（substitution method）**：先猜，再用數學歸納法證明
2. **遞迴樹法（recursion-tree method）**：畫出樹、算每層代價再加總，常用來產生好的猜測
3. **大師定理（master method）**：直接套公式

「暴力列舉」**不是**主要方法。

**忽略技術細節（neglecting technical details）**：捨棄對漸進複雜度沒有影響的因素——

- 假設參數都是整數（**忽略 floor、ceiling**，取整對漸進複雜度影響微乎其微）
- **忽略邊界條件**（boundary conditions），例如 T(1)
- 這不是「錯誤的分析」，而是先抓住主要成長率

> 相關題目：遞迴關係式, 主要方法, 技術細節, technical, 取整, floor, 邊界, boundary

## 2. 代入法（Substitution Method）

兩步：**① 猜解的形式（guess the form）② 用數學歸納法（induction）找出常數並證明。**

**範例**：T(n) = 2T(⌊n/2⌋) + n，猜 T(n) = O(n lg n)

- 歸納假設（假設對**較小的輸入**成立）：T(⌊n/2⌋) ≤ c⌊n/2⌋ lg⌊n/2⌋
- 代入：T(n) ≤ 2c(n/2)lg(n/2) + n = cn lg n − cn + n ≤ **cn lg n**，只要 **c ≥ 1**
- 邊界：T(1) = 1 但 c·1·lg 1 = 0，不成立 → 改從 n = 2、3 起算（T(2) = 2T(1) + 2 = 4 ≤ c·2·lg 2 = 2c，取 c ≥ 2 即可）。也就是要確保**初始條件（initial conditions）**也滿足。

> 💡 填空寫法：代入的式子寫成 `t(n/2)<=c(n/2)log(n/2)`（不留空白）。

**做出好的猜測**

- T(n) = 2T(n/2 + 17) + n：多出的 17 在 n 很大時不重要 → 仍猜 O(n lg n)。這種式子通常用**代入法**處理，不能直接套標準大師定理。
- 先證出寬鬆的上下界，再**逐步縮小差距**。

**微妙之處（Subtleties）**：T(n) = T(⌊n/2⌋) + T(⌈n/2⌉) + 1

- 猜 T(n) ≤ cn → 代入得 cn + 1，**證不出來**
- 改成**減去低階項**：T(n) ≤ cn − b → 得 cn − 2b + 1 ≤ cn − b（取 b ≥ 1）✔ → 解為 **O(n)**

**陷阱（Avoiding pitfalls）**：對 T(n) = 2T(n/2) + n 想證 O(n)，寫成 T(n) ≤ 2c(n/2) + n = cn + n = O(n) 是**錯的**——必須證出「≤ cn」這個**完全相同的形式**，不能偷換成 O(n)。

**變數變換（Changing variables）**：T(n) = 2T(√n) + lg n

- 令 **m = lg n**（n = 2^m）→ T(2^m) = 2T(2^(m/2)) + m
- 令 S(m) = T(2^m) → S(m) = 2S(m/2) + m = O(m lg m)
- 換回去：T(n) = **O(lg n · lg lg n)**

> 相關題目：代入法, substitution, 猜測, 歸納, induction, 常數 c, 邊界值, 2T(n/2 + 17), T(n/2) + T(n/2), 變數變換, sqrt, 上下界

## 3. 遞迴樹法（Recursion-Tree Method）

步驟：**① 畫遞迴樹 ② 算每一層的代價（level cost）③ 把所有層加總（summation）**。根、中間層、葉子的代價都要算。

**範例 1**：T(n) = 3T(n/4) + cn²

| 項目 | 結果 |
|---|---|
| 第 i 層 | 3ⁱ 個節點，每個 c(n/4ⁱ)²，該層共 (3/16)ⁱ cn² |
| 樹高 | log₄ n |
| 葉子數 | 3^(log₄ n) = n^(log₄ 3) ≈ n^0.79 |
| 總和 | ≤ Σ (3/16)ⁱ cn² + Θ(n^(log₄3)) = (16/13)cn² + … = **O(n²)** |

再用代入法驗證 T(n) ≤ dn²：3d(n/4)² + cn² = (3/16)dn² + cn² ≤ dn²，只要 d ≥ (16/13)c。

**範例 2**（不平衡的樹）：T(n) = T(n/3) + T(2n/3) + cn

- 每層代價最多 cn；最長路徑是一直走 2n/3：高度 **log₃/₂ n**
- 猜 O(n lg n)，代入法證明需 d ≥ c / (lg 3 − 2/3)

一般 T(n) = aT(n/b) + f(n) 的遞迴樹：高度 log_b n、葉子深度 log_b n、葉子數 n^(log_b a)；若每層代價相同（如 2T(n/2)+n 每層 n，共 lg n 層）→ Θ(n lg n)。

> 相關題目：遞迴樹, recursion tree, 每層, 每一層, 葉節點, 樹高, 高度, 加總, summation, 3T(n/4), T(n/3)

## 4. 大師定理（Master Theorem）

設 a ≥ 1、b > 1 為常數，T(n) = aT(n/b) + f(n)。**a = 子問題個數、b = 輸入縮小的倍數**，關鍵是比較 f(n) 和 **n^(log_b a)** 的成長率：

| 情況 | 條件 | 結果 |
|---|---|---|
| Case 1 | f(n) = O(n^(log_b a − ε))，某個 ε > 0（f **多項式地慢**） | T(n) = Θ(n^(log_b a)) |
| Case 2 | f(n) = Θ(n^(log_b a))（一樣快） | T(n) = Θ(n^(log_b a) · lg n) |
| Case 3 | f(n) = Ω(n^(log_b a + ε))，某個 ε > 0（f **多項式地快**），**且**滿足規則性條件 af(n/b) ≤ cf(n)（某 c < 1） | T(n) = Θ(f(n)) |

**例子（投影片）**

| 遞迴式 | a, b, n^(log_b a) | 結果 |
|---|---|---|
| 9T(n/3) + n | 9, 3, n² | Case 1 → Θ(n²) |
| T(2n/3) + 1 | 1, 3/2, n⁰ = 1 | Case 2 → Θ(lg n) |
| 3T(n/4) + n lg n | 3, 4, n^0.793 | Case 3（3(n/4)lg(n/4) ≤ (3/4)n lg n）→ Θ(n lg n) |
| 2T(n/2) + n lg n | 2, 2, n | **不適用**：n lg n 比 n 大，但**不是多項式地大**（大的只是 lg n） |

**常見的其他結果**

- 2T(n/2) + n → Case 2 → Θ(n lg n)（代入法、遞迴樹、大師定理都能解）
- T(n/2) + n → Case 3 → Θ(n)
- T(n−1) + n：不是 aT(n/b) 形式，**不能用大師定理**；展開得 Θ(n²)（屬於線性遞迴）

> ⚠️ **易錯**：大師定理不是萬能的——f(n) 與 n^(log_b a) 相差「非多項式」倍數（例如 lg n 倍）時落在 Case 2 和 3 之間的縫隙，三個 case 都不適用。

> 💡 填空寫法：大師定理解的形式寫成 `t(n)=at(n/b)+f(n)`；Case 3 要求 f(n) 「polynomially」大於 n^(log_b a)；它是一種 asymptotic（漸進）分析工具。

> 相關題目：大師定理, master, Case, 規則性, regularity, a 與 b, 子問題, log_b, nˡᵒᵍᵇ, T(n/2) + n, T(n-1), 9T(n/3), 2T(n/2)
