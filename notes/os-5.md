# 執行緒（Chapter 4: Threads & Concurrency）

## 1. 執行緒是什麼、為什麼要多執行緒

- **執行緒（thread）是 CPU 使用的基本單位**，也是多執行緒電腦系統的基礎。
- 每個執行緒有自己的：**執行緒 ID、程式計數器、暫存器集合、堆疊**。
- 同一行程的執行緒**共享**：**程式碼（code）、資料（data）、開啟的檔案**等資源。
- 傳統（重量級）行程只有一個執行緒；一個行程內有多個執行分支 → 多執行緒。
- 例：多執行緒伺服器——收到客戶端請求時**建立一個新執行緒來服務**，主執行緒繼續聽下一個請求（不用像以前那樣建立整個行程）。

**多執行緒的四個好處**

| 好處 | 說明 |
|---|---|
| **響應性（responsiveness）** | 程式的一部分被阻塞或在做長運算時，其他部分還能繼續——**對使用者介面特別重要** |
| **資源共享（resource sharing）** | 執行緒預設就共享行程的資源，比共用記憶體或訊息傳遞更容易 |
| **經濟性（economy）** | 建立執行緒比建立行程**輕量**；執行緒切換的開銷也比**行程的 context switch** 低 |
| **可擴展性（scalability）** | 多執行緒程式可以在**多個處理器核心**上平行執行 |

> 相關題目：CPU 利用率的基本單位, basic unit, 好處, 優點, 響應性, responsiveness, 資源共享, resource sharing, 經濟, 可擴展性, 輕量級, 創建成本, 多執行緒伺服器, 共享哪些資源, 使用者介面

## 2. 多核心程式設計

- **並行性（concurrency）**：系統能支援**多個任務同時取得進展**——**單核心**也能做到（交錯執行）。
- **平行性（parallelism）**：系統能**同時執行**多個任務——需要**多核心**。
- 程式設計的挑戰：**分割活動（dividing activities）**、平衡工作量、**資料分割**、**資料相依性（data dependency）**、**測試與除錯**。
- 兩種平行：

| 類型 | 作法 |
|---|---|
| **資料平行（data parallelism）** | 把**同一份資料的子集**分給多個核心，每個核心做**相同**的操作 |
| **任務平行（task parallelism）** | 把**不同的執行緒（任務）**分給不同核心，每個執行**獨特**的工作 |

**Amdahl's Law**：增加核心能帶來多少加速

speedup ≤ 1 / (S + (1 − S)/N)

- **S = 應用程式中必須序列執行的部分（serial portion）**，**N = 處理核心數（processing cores）**
- 例：75% 可平行、25% 序列，N = 2 → 1/(0.25 + 0.75/2) = 1.6 倍
- N → ∞ 時加速上限是 1/S：**序列部分決定了加速的極限**

> 相關題目：並行, concurrency, 平行, parallelism, 多核心, multicore, 挑戰, challenges, 資料平行, data parallelism, 任務平行, task parallelism, Amdahl, serial, processing cores

## 3. 使用者執行緒與多執行緒模型

- **使用者執行緒（user threads）**：在核心之上，由**使用者層級執行緒函式庫**管理，核心不知道。
- **核心執行緒（kernel threads）**：由作業系統核心支援與管理；現代 OS 都支援。

| 模型 | 對應方式 | 特性 | 例子 |
|---|---|---|---|
| **Many-to-One** | 多個使用者執行緒 → **一個**核心執行緒 | 一個執行緒做阻塞系統呼叫，**整個行程都被阻塞**；一次只有一個能存取核心 → **多核心上無法平行** | Solaris Green Threads、GNU Portable Threads |
| **One-to-One** | 每個使用者執行緒 → **一個**核心執行緒 | 比 many-to-one **更多並行性**；建立使用者執行緒就會建立核心執行緒，**開銷較大**，所以常**限制執行緒數量** | **Windows（NT/XP/2000）、Linux**、Solaris 9 以後 |
| **Many-to-Many** | 多個使用者執行緒 → **同數或較少**的核心執行緒 | 沒有數量限制、阻塞不會卡住整個行程、可用多處理器 | Solaris 9 以前、Windows 的 fiber |
| **Two-level** | Many-to-many，**同時允許**把某個使用者執行緒**綁定**到一個核心執行緒 | many-to-many 的變形 | IRIX、HP-UX、Tru64、Solaris 8 以前 |

> ⚠️ 依課本，能讓「一個使用者執行緒綁定一個核心執行緒」的是 **One-to-One** 和 **Two-level**。題庫原本記錄的是四個全選，已改成課本答案；課程考卷可能仍照原答案計分。

> 💡 填空寫法用連字號：`many-to-one`、`one-to-one`、`many-to-many`。

> 相關題目：使用者層級, user-level, 核心執行緒, kernel thread, Many-to-One, One-to-One, Many-to-Many, Two-level, many-to-one, one-to-one, many-to-many, 映射, mapped, 模型, model, 綁定, bound

## 4. 執行緒函式庫

- 兩種實作：完全在使用者空間（無核心支援）或核心層級（呼叫系統呼叫）。
- 三大函式庫：**POSIX Pthreads**、**Win32 threads**（Windows）、**Java threads**（「Android threads」**不是**主要的執行緒函式庫）。
- **Pthreads**：POSIX（IEEE 1003.1c）定義的**API 規格（標準）**，不是某個特定實作；UNIX、Linux、macOS 都有；`pthread_create()` 建立、`pthread_join()` 等待。
- **Java threads**：由 **JVM 管理**（底層在 UNIX 用 Pthreads、Windows 用 Win32）；建立方式兩種：**繼承 Thread 類別**、**實作 Runnable 介面**；覆寫 `run()`，用 `start()` 啟動（不要直接呼叫 run()）。

> 相關題目：Pthreads, POSIX, Win32 threads, Java threads, 函式庫, librar, Java 執行緒, JVM, Runnable, Thread 類別, pthread_create, Android threads

## 5. 隱式執行緒（Implicit Threading）

- 執行緒數量越多，程式正確性越難保證 → 把建立與管理執行緒交給**編譯器和執行期函式庫**，**減少程式設計師的負擔**。

| 方法 | 重點 |
|---|---|
| **執行緒池（thread pool）** | 啟動時先建立一定數量的執行緒放在池中等工作；**用現有執行緒服務請求比建立新的快**；**限制執行緒數量在池的大小**；**把任務與建立任務的機制分開** |
| **OpenMP** | 一組**編譯器指令與 API**，支援**共享記憶體**環境的平行程式設計；程式設計師**標出平行區域**（`#pragma omp parallel`），依核心數建立執行緒 |
| **Grand Central Dispatch（GCD）** | **Apple** 的技術（macOS、iOS），識別平行區域、管理執行緒細節；用 block 放進 serial／concurrent 佇列，內部管理 POSIX 執行緒池 |
| 其他 | Intel TBB、Java 的 `java.util.concurrent` |

- **pthread_create() 不是**隱式執行緒——它是程式設計師自己明確建立執行緒。

> 相關題目：隱式, implicit, 執行緒池, thread pool, OpenMP, Grand Central Dispatch, GCD, Apple, 池中, pthread_create

## 6. 執行緒的問題（Threading Issues）

**fork() 與 exec()**

- 多執行緒程式呼叫 fork()：有的 UNIX 版本**複製所有執行緒**，有的**只複製呼叫的那個執行緒**（所以有兩種 fork）。
- exec() 通常**取代整個行程（包含所有執行緒）**；若 fork 後馬上 exec，只複製呼叫的執行緒就夠了。

**信號處理（signal handling）**

- **信號（signal）**用來在 UNIX 中**通知行程發生了某個事件**。
- 多執行緒時有四種傳送方式：**傳給該信號適用的特定執行緒**、**傳給行程中每一個執行緒**、**傳給某些特定執行緒**、**指定一個執行緒接收所有信號**。
- UNIX：`kill(pid, sig)` 送給行程、`pthread_kill(tid, sig)` 送給執行緒；Windows 沒有信號，用 APC 模擬。

**執行緒取消（thread cancellation）**

| 方式 | 特性 |
|---|---|
| **非同步取消（asynchronous）** | **立即**終止目標執行緒（可能正在更新共用資料，有風險） |
| **延遲取消（deferred）** | 目標執行緒**定期檢查**自己是否該被取消；只有到達**取消點（cancellation point）**才會取消；**Pthreads 的預設**方式 |

**執行緒區域儲存（Thread-Local Storage, TLS）**

- 讓**每個執行緒擁有自己的資料副本**。
- 和區域變數不同：**區域變數只在單次函式呼叫中可見**，**TLS 在多次函式呼叫之間都可見**（比較像 static 資料，但每個執行緒一份）。

**Scheduler activations 與 LWP**

- many-to-many／two-level 模型中，使用者執行緒與核心執行緒之間有一層**輕量行程（LWP）**，對執行緒函式庫來說像一顆虛擬處理器；核心用 **upcall** 通知函式庫事件。

> 相關題目：fork(), exec(), 語義, semantics, signal, 信號, 通知, 取消, cancellation, 異步, asynchronous, 延遲, deferred, 取消點, Thread-local, TLS, 執行緒本地儲存, 區域變數, 資料副本, LWP, scheduler activation

## 7. 作業系統實例

**Windows**

- Win32 API 採用 **One-to-One** 模型。
- 每個執行緒的 **context**：執行緒 ID、**暫存器集合**、使用者與核心**堆疊**、**私有資料儲存區**（**不包含其他行程執行緒的 ID**）。
- 資料結構：**ETHREAD、KTHREAD 在核心空間**；**TEB（Thread Environment Block）在使用者空間**（含執行緒 ID、使用者堆疊、**執行緒區域儲存**）。

**Linux**

- 不區分行程和執行緒，**都稱為任務（task）**。
- 建立執行緒用 **clone()** 系統呼叫；用旗標（CLONE_FS、CLONE_VM、CLONE_SIGHAND、CLONE_FILES）決定子任務和父任務**共享哪些資源**（例如位址空間）。不設旗標就像 fork()。

> 相關題目：Windows, ETHREAD, KTHREAD, TEB, 上下文, context, 使用者空間, user space, kernel space, 核心空間, Linux, clone(), 任務, tasks
