# 作業系統結構（Chapter 2: Operating-System Structures）

## 1. 作業系統服務

**對使用者有幫助的服務**

| 服務 | 說明 |
|---|---|
| 使用者介面 UI | 幾乎所有 OS 都有；CLI、GUI、Batch |
| 程式執行 | 把程式載入記憶體執行、正常或異常結束 |
| I/O 操作 | 程式需要的檔案或裝置 I/O |
| 檔案系統操作 | 讀寫、建立刪除、**搜尋**、列出檔案資訊、權限管理 |
| 通訊 | 同一台或跨網路的行程交換資訊：**共用記憶體**或**訊息傳遞** |
| 錯誤偵測 | OS 要**持續偵測可能的錯誤**（CPU、記憶體、I/O、使用者程式），對每種錯誤採取適當行動，確保**正確且一致（consistent）**的運算 |

**確保系統本身有效率運作（資源共用）的服務**

- **資源配置**（CPU 週期、記憶體、檔案儲存、I/O 裝置）
- **記帳（accounting）**：記錄誰用了多少、哪些資源
- **保護與安全**：所有對系統資源的存取都受控制；並行的行程互不干擾；安全要求使用者驗證

> ⚠️ 「開機（power on）」不是 OS 提供給使用者的服務。

> 相關題目：作業系統服務, 服務, 提供的功能, I/O 操作, not helpful, 對使用者有幫助, 無助於使用者, 錯誤, errors, consistent, 資源配置, 記帳, accounting, 保護, 通訊, 檔案系統操作

## 2. 使用者介面：CLI、GUI、觸控

- **CLI／命令直譯器**：直接輸入指令；**有時實作在核心、有時是系統程式**；可能有多種版本，稱為 **shell**（UNIX 常見 **Bash**、Bourne shell）。指令可以內建，也可以只是程式名稱（後者新增功能不用改 shell）。**幾乎所有 OS 都有 CLI**。
- **GUI**：桌面比喻、滑鼠＋鍵盤＋螢幕、圖示代表檔案／程式／動作；**發明於 Xerox PARC**。
  - Windows：GUI + CLI「command」shell
  - **Mac OS X 的 GUI 叫 Aqua**，底下是 UNIX 核心
  - UNIX／Linux：CLI 為主，GUI 可選（CDE、KDE、GNOME）
  - **MS-DOS** 只有 CLI，沒有同時提供 GUI
- **觸控螢幕**：不能或不適合用滑鼠，以**手勢**操作，**虛擬鍵盤**輸入，也可用語音。

> 相關題目：使用者介面, CLI, GUI, 指令列, 命令列, shell, Bash, Xerox, Aqua, 觸控, Touchscreen, 文字指令, 文字行輸入, 幾乎所有作業系統

## 3. 系統呼叫與 API

- **系統呼叫**：OS 服務的程式介面，通常用 **C／C++（高階語言）** 寫。
- 程式通常透過 **API** 使用，而非直接呼叫系統呼叫。三大 API：**Win32 API**（Windows）、**POSIX API**（UNIX、Linux、Mac OS X）、**Java API**（JVM）。
- 用 API 的好處：**程式設計師不需知道系統呼叫怎麼實作**、**隱藏大部分 OS 介面細節**（由 run-time support library 管理）、可攜性較好。
- 實作：每個系統呼叫有一個**編號**，系統呼叫介面用編號查表、呼叫核心中的實作、回傳狀態與回傳值。
- 標準 C 的 **printf()** 底層呼叫 **write()** 系統呼叫；用 read() 要 include **`<unistd.h>`**。

**傳參數給 OS 的三種方法**

1. 放在**暫存器**（最簡單，但參數可能比暫存器多）
2. 放在記憶體的**區塊／表格**，把位址放暫存器（**Linux、Solaris** 採用）
3. **推入堆疊（stack）**，由 OS 彈出

區塊與堆疊法**不限制參數數量或長度**。

> 相關題目：系統呼叫, system call, API, Win32, POSIX, Java API, printf, write(), unistd, 傳遞參數, 暫存器, 堆疊, 高階語言, high level

## 4. 系統呼叫的種類

| 類別 | 例子（Windows ↔ UNIX） |
|---|---|
| **行程控制** | CreateProcess() ↔ **fork()**、ExitProcess() ↔ exit()、WaitForSingleObject() ↔ wait()；載入執行、取得/設定屬性、配置釋放記憶體、dump、除錯、鎖 |
| **檔案管理** | CreateFile() ↔ **open()**、ReadFile() ↔ **read()**、WriteFile() ↔ **write()**、CloseHandle() ↔ close() |
| **裝置管理** | **request device**／release device、SetConsoleMode() ↔ **ioctl()** |
| **資訊維護** | GetCurrentProcessID() ↔ getpid()、SetTimer() ↔ alarm()、Sleep() ↔ sleep() |
| **通訊** | CreatePipe() ↔ pipe()、CreateFileMapping() ↔ shm_open()、MapViewOfFile() ↔ mmap() |
| **保護** | **SetFileSecurity()** ↔ **chmod()**、InitializeSecurityDescriptor() ↔ umask()、SetSecurityDescriptorGroup() ↔ chown() |

> ⚠️ ioctl() 屬於**裝置管理**，不是檔案管理；chmod() 屬於**保護**。fork() 用來**建立新行程**。

**兩個例子**

- **MS-DOS**：**單工（single-tasking）**；開機時啟動 shell；跑程式不建立行程，程式載入後**覆蓋整個記憶體（只留核心）**，結束後重新載入 shell。
- **FreeBSD**（UNIX 變種）：**多工**；登入後啟動使用者選的 shell → shell 用 **fork()** 建立行程 → **exec()** 把程式載入 → 等待或繼續接受指令；結束代碼 0 = 沒錯誤、> 0 = 錯誤碼。

> 相關題目：fork, exec, 建立新行程, 行程控制, Process Control, 檔案管理, File Management, ioctl, 裝置管理, request_device, chmod, SetFileSecurity, MS-DOS, single tasking, FreeBSD, 多工環境

## 5. 系統程式

- 提供程式開發與執行的方便環境；**多數使用者眼中的 OS 是系統程式**，不是系統呼叫。
- 類別：檔案管理、狀態資訊（有的系統有 **registry**）、檔案修改（文字編輯器）、**程式語言支援**（編譯器、組譯器、除錯器、直譯器）、程式載入與執行（loader、linkage editor）、通訊、**背景服務**。
- **背景服務**：開機時啟動，提供磁碟檢查、行程排程、錯誤記錄、列印等；**在使用者內文（user context）執行，不是核心內文**；稱為 services、subsystems、**daemons**。
- **應用程式**不屬於系統，通常不算 OS 的一部分。

> 相關題目：系統程式, system program, registry, 背景服務, daemon, 守護行程, 編譯器, 除錯器, 應用程式, 不是系統程式

## 6. 設計與實作原則

- **使用者目標**：方便使用、易學、可靠、安全、快速
- **系統目標**：容易設計、實作、維護；有彈性、可靠、無錯誤、有效率
- 作業系統的設計與實作是一個定義**目標與規格（goals and rules／specifications）**的過程
- **政策與機制分離（policy vs. mechanism）**：**機制**決定「怎麼做」，**政策**決定「做什麼」；分開才能在政策改變時保有彈性（例：計時器）
- 實作語言：早期用**組合語言（assembly）**，後來 Algol、PL/1，現在 C、C++；通常混用（最底層組語、主體 C）。高階語言**開發快、好懂好除錯、容易移植**，但較慢。

> 相關題目：programming language, 使用者目標, 系統目標, User Goals, System Goals, 政策, policy, mechanism, 機制, 做什麼, 組合語言, assembly, 高級語言, 高階語言, goals and rules, 設計和實作

## 7. 作業系統結構

| 結構 | 重點 |
|---|---|
| **簡單結構**（MS-DOS） | 用最小空間提供最多功能；沒分模組，介面與層級沒有良好分離 |
| **UNIX（非簡單、單體）** | 兩個可分離部分：**系統程式**和**核心**；核心在系統呼叫介面之下、硬體之上，提供檔案系統、**CPU 排程**、記憶體管理等，一層塞很多功能 |
| **分層（layered）** | **第 0 層是硬體，第 N 層是使用者介面**；每層只用較低層的功能 |
| **微核心（microkernel）** | 把盡量多的功能**移出核心到使用者空間**；模組間用**訊息傳遞（message passing）**溝通；代表：**Mach**（Mac OS X 的 Darwin 部分基於它） |
| **模組（modules）** | 現代 OS 實作**可載入核心模組（loadable kernel modules）**；物件導向，各元件透過已知介面溝通、需要時載入；類似分層但更有彈性（Linux、**Solaris**：排程類別、檔案系統、可載入系統呼叫等） |
| **混合（hybrid）** | 現代 OS 多半混合多種模型：Linux、Solaris（單體 + 動態模組）、Windows（大致單體 + 微核心特性）、Mac OS X（Mach + BSD + 核心擴充） |

**微核心優缺點**

- 優點：**容易擴充**、**容易移植到新架構**、**更可靠（核心模式下的程式碼少）**、**更安全**
- 缺點：使用者空間與核心空間溝通的**效能開銷（performance overhead）**

**行動 OS**

- **iOS**：建立在 Mac OS X 結構上；層次：**Cocoa Touch**（Objective-C API）、**Media services**、**Core services**（雲端、資料庫）、**Core OS**（基於 Mac OS X 核心）；不能原生跑 OS X 程式，CPU 架構不同（ARM）
- **Android**：Open Handset Alliance（主要是 Google）、開源；**修改過的 Linux 核心**（加電源管理）；執行期環境含核心函式庫與 **Dalvik 虛擬機**；用 Java + Android API 開發；函式庫有 **webkit**（瀏覽器）、**SQLite**（資料庫）、多媒體、精簡 libc

> 相關題目：作業系統結構, 系統結構, circled, 最核心, core part, MS-DOS, 簡單結構, 兩個可分離, 分層, layer, 第 0 層, layer 0, 最高層, 微核心, microkernel, Mach, 移出 kernel, 使用者空間, 模組, module, modular, Modularity, 動態載入, 混合, hybrid, iOS, Android, Dalvik, webkit, Cocoa

## 8. 除錯、系統產生、開機

- **除錯**：OS 產生**記錄檔（log files）**；**應用程式**失敗產生 **core dump**（行程記憶體）；**作業系統**失敗產生 **crash dump**（核心記憶體）。
- **效能調校**：移除瓶頸；trace listings、**profiling**（定期取樣指令指標）；工具如 top、Windows 工作管理員。
- **克尼漢定律（Kernighan's Law）**：除錯的難度是寫程式的**兩倍（twice）**。
- **DTrace**：Solaris、FreeBSD、Mac OS X 的工具，可在**正式運作的系統上即時動態追蹤**（probe → provider → consumer）。
- **系統產生（SYSGEN）**：取得特定硬體組態資訊，建出為該系統編譯或調校的核心。
- **開機**：通電後從**固定的記憶體位置**開始執行，初始開機碼放在**韌體 ROM**；**bootstrap loader**（存在 ROM／EEPROM）**找到核心、載入記憶體並啟動**；有時分兩步（ROM 先載入固定位置的 boot block，再載入 bootstrap loader）；常見的 bootstrap loader **GRUB** 可選擇不同磁碟、版本、選項的核心。

> 相關題目：除錯, debug, core dump, crash dump, 核心傾印, 損毀傾印, 記憶體映像, Kernighan, 克尼漢, 兩倍, twice, DTrace, 動態追蹤, 即時監控, profiling, SYSGEN, 硬體組態, 開機, boot, bootstrap, GRUB, ROM, 固定的記憶體位置
