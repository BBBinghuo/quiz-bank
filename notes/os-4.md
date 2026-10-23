# 行程（Chapter 3: Processes）

## 1. 行程的概念

- **行程（process）= 執行中的程式**，必須依序執行。課本把 job 和 process 幾乎混用。
- **程式是被動實體**（磁碟上的可執行檔），**行程是主動實體**；可執行檔**載入記憶體後**就變成行程。同一個程式可以是好幾個行程。
- 行程在記憶體中的組成：

| 部分 | 內容 |
|---|---|
| **text section** | 程式碼 |
| **程式計數器 PC、暫存器** | 目前的執行狀態 |
| **stack（堆疊）** | 暫時資料：函式參數、返回位址、區域變數 |
| **data section** | 全域變數 |
| **heap（堆積）** | 執行期間**動態配置**的記憶體 |

> 相關題目：執行中的程式, program in execution, 載入到記憶體, loaded into memory, 被動, passive, 多個部分, text section, interchangeably, 堆積, heap, 堆疊, stack, 動態記憶體

## 2. 行程狀態與 PCB

**五種狀態**

| 狀態 | 意義 |
|---|---|
| new | 正在建立 |
| running | 指令正在執行 |
| waiting | 等某個事件發生（例如 I/O） |
| ready | 等著被分配到處理器 |
| terminated | 執行結束 |

- 主要轉換：new → ready（admitted）、ready → running（**scheduler dispatch**）、running → ready（**interrupt**）、running → waiting（**I/O 或事件等待**）、waiting → ready（I/O 或事件完成）、running → terminated（exit）。

**行程控制區塊 PCB（task control block）** 存放：

- 行程狀態、**程式計數器（下一個要執行的指令位置）**、CPU 暫存器
- CPU 排程資訊（優先權、佇列指標）、記憶體管理資訊、記帳資訊、**I/O 狀態資訊**（配置的裝置、開啟的檔案）
- Linux 用 C 結構 **task_struct** 表示

> 相關題目：狀態, state, running, waiting, ready, terminated, 等待中, 程序狀態, PCB, 程序控制區塊, 程式計數器, program counter, 下一個要執行

## 3. 排程佇列與排程器

- 佇列：**job queue**（系統內所有行程）、**ready queue**（在記憶體中準備執行）、**device queue**（等某個 I/O 裝置）。
- 排程器：

| 排程器 | 作用 | 頻率 |
|---|---|---|
| **短期（CPU scheduler）** | 選下一個執行的行程並配給 CPU | 很頻繁（毫秒），要快 |
| **長期（job scheduler）** | 選哪些行程進 ready queue；**控制多元程式的程度（degree of multiprogramming）** | 不頻繁（秒、分），可以慢 |
| **中期** | 需要降低多元程度時，把行程移出記憶體存到磁碟、之後再帶回：**swapping** | 視需要 |

> ⚠️ 依投影片：「**控制多元程式的程度**」是**長期**排程器；「**把行程換出／換回記憶體（swapping）**」是**中期**排程器。題庫有一題英文題把兩者寫在一起（loading processes from disk into main memory to control the degree of multiprogramming），記錄的答案是 Medium-term，作答時留意題目的重點在哪一個。

- **I/O-bound** 行程：花較多時間做 I/O，很多短的 CPU burst；**CPU-bound** 行程：**大部分時間在計算**，少數很長的 CPU burst。長期排程器追求好的混合比例。
- 行動系統：早期 iOS 只有一個前景行程；Android 前景與背景都能跑，背景用 **service** 做事。

> 相關題目：排程器, scheduler, 長期, 中期, 短期, 多重程式化的程度, multiprogramming, swapping, 佇列, queue, ready queue, CPU-bound, CPU綁定, I/O-bound

## 4. Context Switch

- CPU 換到另一個行程時，要**保存舊行程的狀態、載入新行程保存的狀態**——稱為 **context switch**。
- context 存在 PCB；切換時間是**純開銷**（系統沒做有用的事），PCB 和 OS 越複雜越久，速度取決於硬體支援（有些硬體每顆 CPU 有多組暫存器）。

> 相關題目：context switch, 上下文切換, 儲存舊程序的狀態

## 5. 行程的建立與終止

**建立**

- 父行程建立子行程，形成**行程樹**；用 **pid** 識別。
- 資源分享：父子共享全部／子共享部分／完全不共享；執行：並行，或父等子結束。
- 位址空間：子行程複製父行程，或載入新程式。
- UNIX：**fork()** 建立新行程；**exec()** 在 fork 之後**用新程式取代行程的記憶體空間**。

**終止**

- 行程執行完呼叫 **exit()**；透過 **wait()** 把狀態回傳給父行程：`pid = wait(&status);`
- 父行程可用 **abort()** 終止子行程，原因：**子行程超出配置的資源**、**交給子行程的工作不再需要**、**父行程要結束而 OS 不允許子行程繼續**。
- **連鎖終止（cascading termination）**：有的 OS 父結束時所有子孫都要終止，由 OS 發動。
- **殭屍（zombie）**：子已結束但**父沒呼叫 wait()**；**孤兒（orphan）**：**父沒呼叫 wait() 就先結束了**，子還在。

**Chrome 多行程架構**：**browser 行程**（UI、磁碟與網路 I/O）、**renderer 行程**（渲染網頁、HTML、JavaScript，每個網站一個，跑在 sandbox）、**plug-in 行程**。

> 相關題目：建立, fork, exec, 替換程序的記憶體空間, exit, wait, abort, 終止子程序, 殭屍, zombie, 孤兒, orphan, 父程序, 子程序, Chrome, 瀏覽器, process creation, termination

## 6. 行程間通訊（IPC）

- 行程可能**獨立**（不影響也不受影響）或**合作**。合作的理由：**資訊共享、加速運算、模組化、方便**（computation speedup、information sharing、modularity、convenience）。
- 兩種 IPC 模型：**共用記憶體（shared memory）**與**訊息傳遞（message passing）**。

**共用記憶體**

- 由**使用者行程**控制（不是 OS）；主要問題是要提供機制讓使用者行程存取共用記憶體時**同步（synchronize）**動作。
- 生產者－消費者：unbounded buffer（大小無限制）／bounded buffer（固定大小）。用 in、out 環狀緩衝區的解法，**最多只能用 BUFFER_SIZE − 1 格**。

**訊息傳遞**

- 兩個操作：**send(message)**、**receive(message)**；訊息大小固定或可變；要先建立通訊連結。
- **直接通訊**：明確指名對方 send(P, msg)、receive(Q, msg)；連結自動建立、**一條連結剛好對應一對行程**、每對之間剛好一條、通常雙向。
- **間接通訊**：透過**信箱（mailbox，又稱 port）**，每個信箱有**唯一 ID**；**共用信箱才能通訊**；一條連結可對應**多個行程**；每對行程可共用多條連結。
- **同步**：阻塞（blocking）= 同步，非阻塞 = 非同步
  - **blocking send**：傳送者等到訊息被收到
  - **blocking receive**：接收者等到有訊息
  - 非阻塞 receive 會拿到有效訊息或 null
  - send 和 receive 都阻塞 → **rendezvous**
- **緩衝（buffering）三種**：**zero capacity**（不排隊，傳送者要等接收者 = rendezvous）、**bounded capacity**（長度 n，滿了要等）、**unbounded capacity**（傳送者永遠不用等）

> 相關題目：IPC, 通訊, 合作, Cooperating, computation speedup, 共享記憶體, shared memory, 同步, synchronize, 訊息傳遞, message passing, 生產者, 緩衝, buffer, send, receive, mailbox, 信箱, 直接通訊, 間接通訊, indirect, blocking, 阻塞, rendezvous, capacity, 無空間的緩衝

## 7. IPC 系統實例

- **POSIX 共用記憶體**：`shm_open()` 建立／開啟區段 → `ftruncate()` 設大小 → `mmap()` 對應後讀寫。
- **Mach**：以訊息為基礎，連系統呼叫都是訊息；每個 task 建立時有 **Kernel** 和 **Notify** 兩個信箱；只需三個系統呼叫：**msg_send()、msg_receive()、msg_rpc()**；用 port_allocate() 建信箱；信箱滿時可等待、等 n 毫秒、立即返回、暫存訊息。
- **Windows**：以訊息傳遞為中心的 **(A)LPC**（advanced local procedure call）設施，只在同一台機器的行程間；用 port 建立通道。

> 相關題目：POSIX, shm_open, Mach, msg_rpc, msg_send, Windows IPC, LPC

## 8. 主從式系統的通訊

**Socket**

- **通訊的端點**，由 **IP 位址 + port** 組成，例如 161.25.19.8:1625
- 1024 以下的 port 是知名服務；**127.0.0.1（loopback）** 指自己
- Java 三種：連線導向（TCP）、無連線（UDP）、MulticastSocket

**RPC（遠端程序呼叫）**

- 把網路上行程之間的程序呼叫抽象化
- **stub** 是伺服器上實際程序的**客戶端代理**：客戶端 stub 找到伺服器並**打包（marshal）參數**，伺服器端 stub 解包並執行
- 用 **XDR** 處理大小端（big/little-endian）差異；訊息應保證**恰好一次（exactly once）**；OS 提供 rendezvous（matchmaker）服務配對客戶端與伺服器

**Pipe（管道）**：讓兩個行程溝通的通道

| | 普通管道 ordinary pipe | 具名管道 named pipe |
|---|---|---|
| 方向 | **單向（unidirectional）**：一端寫、一端讀 | **雙向（bidirectional）** |
| 關係 | **需要親子關係** | **不需要親子關係**，多個行程可用 |
| 其他 | 建立它的行程以外無法存取；Windows 稱 **anonymous pipe** | UNIX、Windows 都有，比普通管道強大 |

> 相關題目：socket, 端點, endpoint, IP, port, RPC, 遠端程序呼叫, stub, 代理, pipe, 管道, ordinary, 普通管道, named pipe, 具名管道, 命名管道, unidirectional, bidirectional, anonymous
