# 作業系統導論（Chapter 1: Introduction）

## 1. 作業系統是什麼、做什麼

- 作業系統是**使用者與硬體之間的中介程式**。目標：執行使用者程式讓解題更容易、讓電腦**方便使用**、**有效率**地使用硬體。
- 電腦系統四個組成：**硬體**（CPU、記憶體、I/O 裝置）→ **作業系統**（協調硬體給各程式與使用者）→ **應用程式** → **使用者**。
- 兩種角度定義 OS：
  - **資源分配者（resource allocator）**：管理所有資源，在衝突的請求間做公平、有效率的決定
  - **控制程式（control program）**：控制程式的執行，防止錯誤與不當使用
- 沒有公認的單一定義；「電腦上**一直在執行的那個程式**」稱為**核心（kernel）**，其他是系統程式（隨 OS 附帶）或應用程式。
- 開機時載入的 **bootstrap program** 存在 ROM／EPROM，統稱 **韌體（firmware）**，負責初始化系統並載入核心。

> 相關題目：作業系統主要, 作業系統的角色, 中介, 四大組成, 組成部分, 硬體資源, primary, 目標, 資源分配, resource allocator, 控制程式, kernel, 核心, 永遠在運作, bootstrap, 啟動電腦, 韌體, firmware

## 2. 電腦系統運作與中斷

- 一個或多個 CPU 和**裝置控制器（device controller）**透過共用匯流排存取共用記憶體，CPU 與裝置可**同時執行**。
- 每個裝置控制器負責一類裝置、有自己的**區域緩衝區（local buffer）**；CPU 在主記憶體與 local buffer 之間搬資料。
- 裝置做完工作後以**中斷（interrupt）**通知 CPU。
- 中斷透過**中斷向量（interrupt vector）**找到服務程式的位址；必須保存被中斷指令的位址。
- **Trap／exception** 是軟體產生的中斷，由**錯誤**（例如除以零）或**使用者請求**（系統呼叫）觸發。
- 作業系統是**中斷驅動（interrupt driven）**的；判斷中斷種類的方式：**polling** 或 **vectored interrupt**。
- 中斷常見類型：硬體中斷、軟體中斷（trap/exception）、錯誤產生、使用者請求產生。

**I/O 結構**

- 同步：I/O 開始後要等完成才把控制權還給使用者程式（一次最多一個 I/O 請求）
- 非同步：不等完成就返回；使用者透過**系統呼叫**請 OS 等 I/O 完成；OS 用**裝置狀態表（device-status table）**記錄每個裝置的類型、位址、狀態

> 相關題目：中斷, interrupt, trap, exception, 中斷向量, 裝置控制器, device controller, local buffer, polling, 中斷驅動, I/O 操作完成, 裝置狀態表

## 3. 儲存結構與 DMA

- bit → byte（8 bits，最小方便單位）→ word（架構的原生資料單位）。KB = 1024 bytes、MB = 1024² bytes…；網路速度以 **bit** 計。
- **主記憶體**：CPU **唯一能直接存取**的大型儲存；隨機存取、通常**揮發性**。
- **次級儲存**：大容量、**非揮發**；硬碟（磁軌 tracks → 磁區 sectors）、固態硬碟 SSD（比硬碟快）。
- 儲存階層依 **速度、成本、揮發性** 排列：暫存器 → 快取 → 主記憶體 → SSD → 硬碟 → 光碟 → **磁帶（最底層）**。
- **快取（caching）**：把正在用的資料從慢的儲存暫時複製到快的儲存；先查快取，有就直接用。快取比被快取的東西小 → **快取大小**與**置換策略（replacement policy）**是重要設計問題；多處理器還有**快取一致性（cache coherency）**。
- 每個裝置控制器有對應的**裝置驅動程式（device driver）**，提供控制器和核心之間的統一介面。
- **DMA（Direct Memory Access）**：給高速 I/O 用，控制器**不經 CPU** 直接把整塊資料搬進主記憶體，**每個區塊只產生一次中斷**（而不是每個 byte 一次）。

> 相關題目：儲存, storage, 主記憶體, 揮發, 次級儲存, 磁帶, magnetic tape, 最快, 快取, cache, 置換, coherency, 一致性, DMA, 直接記憶體存取, 驅動程式, device driver, 減輕 CPU 負擔

## 4. 電腦系統架構

**多處理器（multiprocessor／parallel／tightly-coupled）**

- 優點：① **增加產能（increased throughput）** ② **規模經濟（economy of scale）** ③ **增加可靠度（increased reliability）**——優雅降級（graceful degradation）或容錯（fault tolerance）
- 兩種：
  - **非對稱多處理（asymmetric）**：每個處理器被指派**特定工作**
  - **對稱多處理（SMP, symmetric）**：**每個處理器執行所有工作**，架構對稱
- 多核心（multicore）：多個核心在同一晶片上

**叢集系統（clustered systems）**

- 多台系統一起工作，通常透過 **SAN（storage-area network）** 共用儲存，提供高可用性
- **非對稱叢集**：一台處於熱備援（hot-standby）；**對稱叢集**：多個節點都在跑應用並互相監控
- 有些用於高效能運算（HPC）；用 **分散式鎖管理器（DLM）** 避免衝突操作

> 相關題目：多處理器, multiprocess, 優點, throughput, economy of scale, graceful, 非對稱, asymmetric, 對稱, symmetric, SMP, 處理器架構, 多核心, 叢集, cluster, SAN, 熱備援

## 5. OS 結構與運作：多工、雙模式、計時器

- **多元程式（multiprogramming，批次系統）**：把多個工作放在記憶體，CPU 總有工作可做；工作要等 I/O 時就**切換到另一個工作**（job scheduling）。
- **分時（timesharing／multitasking）**：CPU 切換得夠頻繁，使用者可以和每個程式互動；回應時間要 **< 1 秒**；需要 **CPU 排程**、**swapping**、**虛擬記憶體**。
- **雙模式運作（dual-mode operation）**：**使用者模式（user mode）**與**核心模式（kernel mode）**，由硬體提供的 **mode bit** 區分；**特權指令（privileged instructions）**只能在核心模式執行；**系統呼叫**會切到核心模式，返回時切回使用者模式。新 CPU 支援更多模式，例如給虛擬機用的 **VMM 模式**。
- **計時器（timer）**：防止無窮迴圈或某個行程霸佔資源；OS 設定計數器（特權指令），倒數到 0 就產生中斷，讓 OS 拿回控制權。

> 相關題目：多元程式, multiprogramming, 分時, timesharing, 多工, 互動式, 雙模式, dual-mode, mode bit, 使用者模式, 核心模式, 特權, privileged, 系統呼叫, 計時器, timer, 無窮迴圈, 區分使用者程式與核心程式

## 6. 各項管理工作

**行程管理**：行程是**執行中的程式**（程式是被動實體、行程是主動實體）；單執行緒行程有一個程式計數器（PC）。OS 負責：

- 建立與刪除使用者／系統行程
- 暫停與恢復行程
- 提供**同步**機制
- 提供**通訊**機制
- 提供**死結處理**機制

**記憶體管理**：記錄哪些記憶體被誰使用、決定哪些行程或資料搬進搬出記憶體、配置與釋放記憶體空間。

**儲存管理**：把實體性質抽象成邏輯單位——**檔案**。檔案系統管理：建立／刪除檔案與目錄、提供操作檔案的基本指令、把檔案對應到次級儲存、備份。
**大量儲存管理**：空閒空間管理、儲存配置、**磁碟排程**；三級儲存（光碟、磁帶），分 WORM 與 RW。

**I/O 子系統**：隱藏硬體細節；負責 **buffering**（傳輸時暫存）、**caching**（放到快的儲存）、**spooling**（一個工作的輸出和另一個工作的輸入重疊），以及通用驅動介面。

**保護與安全**

- **保護（protection）**：控制行程或使用者存取 OS 定義之資源的機制
- **安全（security）**：防禦內外部攻擊，例如**阻斷服務（denial-of-service）**、蠕蟲、病毒、**身分盜用（identity theft）**、竊取服務
- 用**使用者 ID**、**群組 ID** 判斷誰能做什麼；**權限提升（privilege escalation）**讓使用者切換成權限較高的有效 ID

> 相關題目：Process 管理, Process 的定義, process management, 資源管理, 行程管理, 程序管理, 群組, 記憶體管理, 儲存管理, 檔案系統, 大量儲存, 磁碟排程, I/O 子系統, spooling, buffering, 保護, 安全, protection, security, denial, identity, 權限提升, privilege escalation, 使用者 ID

## 7. 核心資料結構

- **單向、雙向、環狀鏈結串列**（singly / doubly / circular linked list）
- **二元搜尋樹**（左 ≤ 右）：搜尋最壞 O(n)；**平衡**二元搜尋樹 O(lg n)
- **雜湊函數 → 雜湊表（hash map）**
- **點陣圖（bitmap）**：n 個位元表示 n 個項目的狀態
- Linux 定義在 `<linux/list.h>`、`<linux/kfifo.h>`、`<linux/rbtree.h>`

> 相關題目：資料結構, linked list, 鏈結, 二元搜尋樹, binary search tree, 雜湊, hash, bitmap, 點陣圖

## 8. 計算環境

| 環境 | 重點 |
|---|---|
| 傳統 | 獨立電腦，但幾乎都連網；入口網站、精簡型電腦（thin client）、防火牆 |
| 行動 | 手機、平板；GPS、陀螺儀等額外功能；802.11 或行動網路；iOS、Android |
| 分散式 | 多台（可能異質）系統連網；網路類型 **LAN、WAN、MAN、PAN**；網路作業系統讓它們像一個系統 |
| 主從式（client-server） | 伺服器回應客戶端請求：**compute-server**（如資料庫）、**file-server** |
| P2P | **不分 client 和 server，所有節點都是對等（peers）**；加入時向中央查詢服務登記或廣播（discovery protocol）；例：Napster、Gnutella、Skype |
| 虛擬化 | **模擬（emulation）**：來源與目標 CPU 不同，最慢；**虛擬化**：OS 原生編譯在 CPU 上，再跑 guest OS；由 **VMM（虛擬機管理程式）** 提供服務 |
| 雲端 | 以虛擬化為基礎；公有雲、私有雲、混合雲；**SaaS**（應用程式，如文書處理）、**PaaS**（軟體堆疊，如資料庫伺服器）、**IaaS**（伺服器或儲存） |
| 即時嵌入式 | 最普遍的電腦形式；即時 OS 有明確固定的時間限制，**在限制內完成才算正確** |

**開放原始碼 OS**：以原始碼形式釋出（相對於封閉原始碼）；FSF 的 **copyleft GPL** 授權；例：GNU/Linux、BSD UNIX（含 Mac OS X 的核心）。

> 相關題目：計算環境, 分散式, distributed, LAN, WAN, 網路類型, client, 主從, P2P, 對等, peer, 虛擬化, 虛擬機, virtual, VMM, emulation, 雲端, cloud, SaaS, PaaS, IaaS, 即時, real-time, 嵌入式, embedded, 開放原始碼, open-source, GPL
