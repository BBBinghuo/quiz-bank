# 同步工具（Chapter 6: Synchronization Tools）

## 1. 為什麼需要同步：競爭條件

- 行程可能**並行執行**、隨時被中斷；**並行存取共用資料可能造成資料不一致**。
- 例：生產者 `counter++`、消費者 `counter--`，各自在機器層是三步：讀到暫存器 → 加／減 → 寫回。

| 步驟 | 動作 | 結果 |
|---|---|---|
| S0 | 生產者 register1 = counter | register1 = 5 |
| S1 | 生產者 register1 = register1 + 1 | register1 = 6 |
| S2 | 消費者 register2 = counter | register2 = 5 |
| S3 | 消費者 register2 = register2 − 1 | register2 = 4 |
| S4 | 生產者 counter = register1 | counter = 6 |
| S5 | 消費者 counter = register2 | counter = **4**（應該是 5） |

- 結果取決於執行順序 → **競爭條件（race condition）**。

> 相關題目：競爭條件, race condition, counter, 資料不一致, 並行

## 2. 臨界區間問題（Critical-Section Problem）

- 每個行程有一段**臨界區間（critical section）**會改共用變數；**一個行程在臨界區間時，其他行程不能進它們的臨界區間**。
- 行程結構：**entry section**（請求進入）→ critical section → **exit section** → remainder section。

**解法必須滿足三個條件**

1. **互斥（Mutual Exclusion）**：Pᵢ 在臨界區間時，其他行程都不能在各自的臨界區間
2. **進行（Progress）**：沒人在臨界區間、又有人想進時，決定誰進的過程**不能無限延後**
3. **有限等待（Bounded Waiting）**：從某行程提出請求到被允許之間，其他行程進入的次數**有上限**

（假設每個行程速度不為零，不假設相對速度。）

- 核心的處理方式：**搶先式核心**（核心模式下可被搶先，要小心競爭）／**非搶先式核心**（跑到離開核心模式、阻塞或自願讓出 CPU；核心模式下基本上沒有競爭條件）。

> 相關題目：臨界區間, critical section, critical-section, 互斥, mutual exclusion, progress, 有限等待, bounded waiting, entry section

## 3. Peterson's Solution

- **兩個行程**的軟體解法；假設 load／store 是原子的。
- 共用變數：`int turn;`（輪到誰）、`boolean flag[2];`（flag[i] = true 表示 Pᵢ 想進）。

```
do {
    flag[i] = true;
    turn = j;
    while (flag[j] && turn == j);   // 對方想進且輪到對方就等
        /* critical section */
    flag[i] = false;
        /* remainder section */
} while (true);
```

- 可證明三個條件都滿足：Pᵢ 只有在 flag[j] == false **或** turn == i 時才進入。

> 相關題目：Peterson, turn, flag

## 4. 硬體支援與 Mutex Lock

- 基本概念都是**上鎖（locking）**：acquire lock → 臨界區間 → release lock。
- 單處理器可以**關中斷**，但在多處理器上太沒效率、不可擴充。
- 現代機器提供**原子（不可中斷）的硬體指令**：
  - **test_and_set(target)**：回傳原值，並把它設成 TRUE。用法：`while (test_and_set(&lock));`，離開時 `lock = false;`
  - **compare_and_swap(value, expected, new_value)**：回傳原值；只有在 value == expected 時才換成 new_value。用法：`while (compare_and_swap(&lock, 0, 1) != 0);`，離開時 `lock = 0;`
  - 只用上面兩種**不保證有限等待**；加上 `waiting[]` 陣列、離開時依序找下一個在等的行程，才能滿足有限等待。
- **Mutex lock**：最簡單的軟體工具；`acquire()`（等到 available 再設 false）、`release()`（設 true），兩者必須是原子的。等待時一直空轉 → **忙碌等待（busy waiting）**，所以也叫 **spinlock**。

> 相關題目：硬體, test_and_set, compare_and_swap, 原子, atomic, 關中斷, mutex, 互斥鎖, spinlock, busy waiting, 忙碌等待, acquire, release

## 5. 號誌（Semaphore）

- 整數變數 S，只能透過兩個**原子操作**存取：**wait()（P）**與 **signal()（V）**。

```
wait(S)   { while (S <= 0) ;  S--; }   // 忙碌等待版本
signal(S) { S++; }
```

- **計數號誌（counting）**：值域不受限；**二元號誌（binary）**：只有 0、1，**等同 mutex lock**。
- 用來排順序：要 P1 的 S1 先於 P2 的 S2 → `synch` 初值 0；P1：`S1; signal(synch);`、P2：`wait(synch); S2;`
- **不忙碌等待的實作**：每個號誌有一個等待佇列

```
wait(S)   { S->value--; if (S->value < 0) { 加入 S->list; block(); } }
signal(S) { S->value++; if (S->value <= 0) { 從 S->list 移出 P; wakeup(P); } }
```

  - value 為負時，|value| = 正在等的行程數
- **死結（deadlock）**：兩個以上行程無限期等待一個只有彼此才能觸發的事件（例：S、Q 初值 1，P0 先 wait(S) 再 wait(Q)，P1 先 wait(Q) 再 wait(S)）。
- **飢餓（starvation）**：行程一直留在號誌佇列中，永遠不被移出。
- **優先權反轉（priority inversion）**：低優先權行程握住高優先權行程需要的鎖 → 用**優先權繼承協定（priority-inheritance protocol）**解決。
- 常見誤用：signal 和 wait 順序顛倒、連續兩次 wait、漏掉 wait 或 signal → 可能違反互斥或造成死結。

> 相關題目：號誌, semaphore, wait(, signal(, 計數號誌, counting, 二元號誌, binary semaphore, block, wakeup, 死結, deadlock, 飢餓, starvation, 優先權反轉, priority inversion, 優先權繼承

## 6. 監視器（Monitor）

- **高階抽象資料型別**：內部變數只能被監視器內的程序存取；**同一時間只有一個行程能在監視器內活動**。
- **條件變數（condition variable）** `condition x;`
  - `x.wait()`：呼叫的行程暫停，直到別人呼叫 `x.signal()`
  - `x.signal()`：恢復一個在 x 上等待的行程；**沒有人在等就沒有效果**（和號誌的 signal 不同，不會累積）
- P 呼叫 x.signal() 喚醒 Q 時，兩者不能同時執行：
  - **Signal and wait**：P 等到 Q 離開監視器或等待別的條件
  - **Signal and continue**：Q 等到 P 離開或等待別的條件
  - Concurrent Pascal 的折衷：P 執行 signal 後**立刻離開**監視器，Q 恢復；Mesa、C#、Java 也有實作
- 可用號誌實作監視器：`mutex`（初值 1）、`next`（初值 0）、`next_count`；每個條件變數 x 有 `x_sem`（初值 0）與 `x_count`。
- **條件等待 x.wait(c)**：c 是優先權數字，**數字最小（優先權最高）的先恢復**；例：ResourceAllocator 用預計使用時間當優先權分配單一資源。

> 相關題目：監視器, monitor, 條件變數, condition, x.wait, x.signal, signal and wait, signal and continue
