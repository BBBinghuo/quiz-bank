# CPU 排程（Chapter 5: CPU Scheduling）

## 1. 基本概念

- 多元程式的目的：**最大化 CPU 使用率**。
- **CPU–I/O burst 週期**：行程執行由 **CPU burst 和 I/O burst 交替**組成；CPU burst 的分布是排程關心的重點（大多數 burst 很短）。
- **短期排程器（CPU scheduler）** 從 ready queue 選一個行程給 CPU。排程決策發生在行程：
  1. running → waiting
  2. running → ready
  3. waiting → ready
  4. 結束（terminates）
- 只在 **1 和 4** 排程 → **非搶先（nonpreemptive）**；其他情況也排程 → **搶先（preemptive）**。搶先式要考慮共用資料、核心模式下被搶先、關鍵 OS 活動中的中斷。
- **分派器（dispatcher）**：把 CPU 交給短期排程器選中的行程——**切換 context、切換到使用者模式、跳到使用者程式該恢復的位置**。**分派延遲（dispatch latency）**：停掉一個行程、開始另一個所需的時間。

> 相關題目：CPU排程的核心目標, 排程決策, 非搶佔, CPU-I/O, burst, 爆發, 非搶先, 搶先, preemptive, 分派器, Dispatcher, 分派延遲, dispatch latency, 短程排程器, 短期排程器, running, waiting

## 2. 排程準則

| 準則 | 定義 | 目標 |
|---|---|---|
| CPU 使用率 utilization | CPU 忙碌的比例 | 越大越好 |
| 產能 **throughput** | **單位時間完成的行程數** | 越大越好 |
| 周轉時間 **turnaround** | 執行一個行程的總時間（提交到完成） | 越小越好 |
| 等待時間 **waiting** | 在 **ready queue** 中等待的總時間 | 越小越好 |
| 回應時間 **response** | 從提交請求到**產生第一個回應**（不是輸出完）的時間；分時系統重要 | 越小越好 |

> 相關題目：準則, criteria, throughput, 產能, turnaround, 周轉, 迴轉, waiting time, 等待時間, response, 回應時間, 使用率

## 3. FCFS 與 SJF

**FCFS（先到先服務）**

- 例：P1 = 24、P2 = 3、P3 = 3
  - 順序 P1, P2, P3：等待 0、24、27 → 平均 **17**
  - 順序 P2, P3, P1：等待 6、0、3 → 平均 **3**
- **護航效應（convoy effect）**：短的行程排在長的後面（例如一個 CPU-bound 擋住許多 I/O-bound）。

**SJF（最短工作優先）**

- 依「**下一個 CPU burst 長度**」排，最短的先做。
- **SJF 是最佳的**：對一組行程給出**最小平均等待時間**；困難在於**無法事先知道下一個 burst 有多長**。
- 投影片例（burst 6、8、7、3）：順序 P4, P1, P3, P2 → 平均等待 (3 + 16 + 9 + 0)/4 = **7**
- **預測下一個 burst：指數平均（exponential averaging）**

  τₙ₊₁ = α·tₙ + (1 − α)·τₙ（0 ≤ α ≤ 1，tₙ = 第 n 次實際長度，τ = 預測值）

  - α = 0：τₙ₊₁ = τₙ，最近的歷史**不算**
  - α = 1：τₙ₊₁ = tₙ，**只看上一次**實際 burst
  - 常設 α = ½；展開後越舊的 burst 權重越小
- 搶先版本：**SRTF（shortest-remaining-time-first）**。例：P1(0, 8)、P2(1, 4)、P3(2, 9)、P4(3, 5)
  - 甘特圖：P1 0–1、P2 1–5、P4 5–10、P1 10–17、P3 17–26
  - 平均等待 = [(10−1) + (1−1) + (17−2) + (5−3)]/4 = 26/4 = **6.5**

> 相關題目：FCFS, 先到先服務, first-come, 護航, convoy, SJF, 最短工作, shortest-job, 最小的平均等待, 指數平均, exponential, α, SRTF, remaining

## 4. 優先權排程與 RR

**優先權排程（priority scheduling）**

- 每個行程有一個優先權整數，CPU 給最高優先權（**數字越小優先權越高**）；可搶先或非搶先。
- **SJF 是優先權排程的特例**（優先權 = 預測 burst 的倒數）。
- 問題：**飢餓（starvation）**——低優先權可能永遠輪不到；解法：**老化（aging）**——隨時間提高等待中行程的優先權。
- 投影片例（burst, priority）：P1(10, 3)、P2(1, 1)、P3(2, 4)、P4(1, 5)、P5(5, 2) → 順序 P2, P5, P1, P3, P4 → 平均等待 **8.2**

**輪轉（Round Robin, RR）**

- 每個行程得到一小段 CPU 時間——**時間片（time quantum, q）**，通常 10–100 毫秒；用完就被搶先、排到 ready queue 尾端。
- n 個行程、時間片 q：每個行程拿到 1/n 的 CPU，**沒有行程等超過 (n − 1)q**。
- q 很大 → 變成 **FIFO（FCFS）**；q 很小 → **context switch 開銷太高**（q 要比 context switch 時間大很多；通常 q 10–100 ms、context switch < 10 μs）。
- 經驗法則：**80% 的 CPU burst 應該比 q 短**。
- 通常平均周轉時間比 SJF 高，但**回應時間比較好**。
- 例（q = 4，P1 = 24、P2 = 3、P3 = 3）：P1 0–4、P2 4–7、P3 7–10、之後 P1 跑到 30 → 等待 6、4、7，平均約 **5.67**
- RR 效能和 **時間片大小、context switch 時間、ready queue 中的行程數** 有關。

> 相關題目：優先權, priority, 飢餓, starvation, 老化, aging, Round Robin, RR, 迴圈排程, 輪轉, 時間片, quantum, TQ, Burst Time

## 5. 多層佇列與多層回饋佇列

**多層佇列（multilevel queue）**

- ready queue 分成好幾個，例如**前景（互動，用 RR）**與**背景（批次，用 FCFS）**；行程**固定**在某個佇列。
- 佇列之間：固定優先權（先服務完前景，可能飢餓）或時間切片（例如前景 80%、背景 20%）。

**多層回饋佇列（multilevel feedback queue, MLFQ）**

- 行程**可以在佇列之間移動**——可以藉此實作**老化**；可依服務時間長短升降級。
- 參數：佇列數量、每個佇列的排程演算法、**何時升級**、**何時降級**、新行程進哪個佇列。
- 例：Q0 = RR（q = 8 ms）、Q1 = RR（q = 16 ms）、Q2 = FCFS。新工作進 Q0；8 ms 沒做完就降到 Q1；再 16 ms 還沒完就降到 Q2。

> 相關題目：多層, multilevel, 回饋, feedback, MLFQ, 前景, 背景, 佇列之間移動

## 6. 執行緒排程與多處理器排程

**執行緒排程**

- 有執行緒時，被排程的是**執行緒**而不是行程。
- **PCS（process-contention scope）**：many-to-one、many-to-many 模型中，執行緒函式庫把使用者執行緒排到 LWP 上，競爭範圍在**行程內**。
- **SCS（system-contention scope）**：核心執行緒排到 CPU 上，和**系統所有執行緒**競爭。
- Pthread：`PTHREAD_SCOPE_PROCESS`（PCS）／`PTHREAD_SCOPE_SYSTEM`（SCS）；**Linux、Mac OS X 只允許 SYSTEM**。

**多處理器排程**

- **非對稱多處理（asymmetric）**：**只有一個處理器**存取系統資料結構，減少資料共享的需要。
- **對稱多處理（SMP）**：**每個處理器自我排程（self-scheduling）**，可以共用一個 ready queue 或各自有私有佇列；最常見。
- **處理器親和性（processor affinity）**：行程偏好留在目前的處理器上（快取還熱）；**soft affinity**（盡量）與 **hard affinity**（指定）。NUMA 架構下記憶體配置也要考慮親和性。
- **負載平衡（load balancing）**：**push migration**（定期檢查，把工作從忙的 CPU 推到別的 CPU）、**pull migration**（閒的 CPU 從忙的 CPU 拉工作）。
- **多核心**：更快、更省電；每核心多執行緒可以利用**記憶體停滯（memory stall）**時間跑另一條執行緒。

> 相關題目：執行緒排程, PCS, SCS, contention, PTHREAD_SCOPE, 多處理器排程, multiple-processor, 非對稱, asymmetric, 對稱多處理, SMP, 自我排程, self-scheduling, 親和性, affinity, 負載平衡, load balancing, push migration, pull migration, 多核心, multicore, NUMA

## 7. 即時排程

- **軟即時（soft real-time）**：不保證何時排到關鍵行程；**硬即時（hard real-time）**：必須在**截止時間（deadline）前**完成。
- 影響效能的兩種延遲：**中斷延遲（interrupt latency）**：中斷到達 → 開始服務程序；**分派延遲（dispatch latency）**。
- 即時排程需要**搶先、以優先權為基礎**的排程（但只保證軟即時）；週期性任務：處理時間 t、截止時間 d、週期 p，**0 ≤ t ≤ d ≤ p**，速率 = 1/p。

| 演算法 | 規則 |
|---|---|
| **Rate Monotonic** | 優先權 = 週期的倒數：**週期越短優先權越高**（靜態） |
| **EDF（Earliest Deadline First）** | **截止時間越早優先權越高**（動態） |
| **比例分享（proportional share）** | 共 T 份，應用拿 N 份 → 保證 N/T 的處理器時間 |

- **POSIX 即時排程**：**SCHED_FIFO**（FCFS + FIFO 佇列，同優先權**不切時間片**）、**SCHED_RR**（同優先權會切時間片）。
- 虛擬化時，guest OS 以為自己擁有 CPU，可能造成回應變差、時鐘不準。

> 相關題目：即時, real-time, 軟即時, 硬即時, 截止, deadline, 中斷延遲, rate monotonic, EDF, earliest deadline, 比例分享, proportional, SCHED_FIFO, SCHED_RR, POSIX

## 8. 作業系統實例

**Linux**

- 2.5 版：**O(1)** 排程；搶先、以優先權為基礎；即時範圍 0–99、nice 值對應 100–140；active／expired 兩個優先權陣列；互動行程回應時間差。
- **2.6.23 起：CFS（Completely Fair Scheduler）**
  - 依**比例**分配 CPU 時間，不是固定時間片；排程類別：default 與 real-time
  - nice 值 **−20 到 +19**，數字越小優先權越高；**target latency**：每個任務至少執行一次的時間區間
  - 每個任務記錄**虛擬執行時間 vruntime**；**選 vruntime 最小**的任務執行；優先權越低衰減越快（normal 優先權時 vruntime = 實際執行時間）

**Windows**

- 以優先權為基礎的搶先排程，**分派器就是排程器**；執行緒跑到（1）阻塞（2）用完時間片（3）被更高優先權搶先
- **32 個優先權層級**：**可變類別 1–15**、**即時類別 16–31**、0 是記憶體管理執行緒；沒有可跑的執行緒就跑 idle 執行緒
- 優先權類別：REALTIME、HIGH、ABOVE_NORMAL、NORMAL、BELOW_NORMAL、IDLE——**除了 REALTIME 都是可變的**
- 時間片用完優先權降低（但不低於 base）；等待結束時提升；**前景視窗 3 倍提升**
- **Windows 7 加入使用者模式排程（UMS, user-mode scheduling）**：應用程式自行建立與管理執行緒

**Solaris**

- 六個類別：Time sharing（預設）、Interactive、Real time、System、Fair Share、Fixed priority
- Time sharing 是**多層回饋佇列**；系統管理員可設定的**可載入表格（dispatch table）**

> 相關題目：Linux, CFS, Completely Fair, vruntime, nice, target latency, 2.6.23, O(1), Windows, 優先權類別, PRIORITY_CLASS, 可變, Variable, 32, UMS, user-mode scheduling, Solaris, dispatch table

## 9. 演算法評估

| 方法 | 重點 |
|---|---|
| **決定性模型（deterministic modeling）** | 用**事先定好的工作負載**算出各演算法的表現（簡單快速，但只適用那組輸入） |
| **排隊模型（queueing models）** | 用機率分布描述到達與 burst；**Little's formula：n = λ × W**（佇列平均長度 = 到達率 × 平均等待時間），例：每秒到 7 個、佇列平均 14 個 → 平均等 2 秒 |
| **模擬（simulation）** | 用程式模擬系統，時鐘是變數；資料用亂數或 **trace tapes** 驅動；比排隊模型準 |
| **實作（implementation）** | 直接實作並在真實系統測試；最準但成本與風險最高 |

> 相關題目：評估, evaluat, deterministic, 決定性, queueing, 排隊, Little, simulation, 模擬, trace, implementation
