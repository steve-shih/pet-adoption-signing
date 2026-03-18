# 🐾 寵物領養簽署系統 - 啟動指南

## 快速開始

### 前置需求

- Node.js (v14+)
- ngrok (用於遠程分享)

### 安裝 ngrok

```bash
# macOS (使用 Homebrew)
brew install ngrok

# 或從官網下載
# https://ngrok.com/download
```

---

## 方法一：本地使用（推薦測試用）

### 步驟 1：啟動 Node.js 服務器

```bash
cd /Users/steveshihjubo.health/Documents/GitHub/pet-adoption-signing
node server.js
```

你會看到：
```
🐾 寵物領養簽署系統運行於 http://localhost:5000
📱 分享 URL 使用：ngrok http 5000
```

### 步驟 2：打開瀏覽器

```
http://localhost:5000
```

---

## 方法二：使用 ngrok 遠程分享（推薦給他人）

### 步驟 1：在一個終端啟動 Node.js 服務器

```bash
cd /Users/steveshihjubo.health/Documents/GitHub/pet-adoption-signing
node server.js
```

### 步驟 2：在另一個終端啟動 ngrok

```bash
ngrok http 5000
```

ngrok 會顯示類似的輸出：

```
ngrok                                    (Ctrl+C to quit)

Session Status                online
Session Expires               1 hour, 59 minutes
Version                       3.x.x
Region                        ap (Asia Pacific)
Latency                       25ms
Web Interface                 http://127.0.0.1:4040

Forwarding                    https://xxxx-xxxx-xxxx.ngrok.io -> http://localhost:5000
```

### 步驟 3：分享公開網址

**公開網址：**
```
https://xxxx-xxxx-xxxx.ngrok.io
```

將這個網址分享給其他人，他們就可以直接使用（無需 VPN）！

---

## 一鍵啟動腳本（自動啟動服務 + ngrok）

### macOS / Linux

創建 `start.sh`：

```bash
#!/bin/bash

cd /Users/steveshihjubo.health/Documents/GitHub/pet-adoption-signing

# 啟動 Node.js 服務器（後台）
echo "🚀 啟動 Node.js 服務器..."
node server.js > /tmp/server.log 2>&1 &
SERVER_PID=$!
echo "✅ 服務器 PID: $SERVER_PID"

sleep 2

# 啟動 ngrok
echo "🌐 啟動 ngrok..."
ngrok http 5000

# 清理
trap "kill $SERVER_PID" EXIT
```

運行：
```bash
chmod +x start.sh
./start.sh
```

---

## 常用命令

### 啟動服務（開發模式自動重載）

```bash
cd /Users/steveshihjubo.health/Documents/GitHub/pet-adoption-signing
npm run dev
```

### 停止所有服務

```bash
# 停止 Node.js
pkill -f "node server"

# 停止 ngrok
pkill -f ngrok
```

### 查看服務日誌

```bash
tail -f /tmp/server.log
```

### 查看 ngrok 隧道信息

在瀏覽器打開：
```
http://localhost:4040
```

---

## 數據持久化

所有數據自動保存在：

```
/Users/steveshihjubo.health/Documents/GitHub/pet-adoption-signing/
├── data/
│   ├── records.json          # 協議記錄
│   └── signatures/           # 簽名圖檔
```

### 備份數據

```bash
cp -r data/ data_backup_$(date +%Y%m%d)/
```

---

## 常見問題

### Q: ngrok 網址每次重啟都會改變？
**A:** 是的，免費版本每次重啟都會產生新網址。購買付費版可保留固定網址。

### Q: 如何讓 ngrok 在背景運行？
```bash
ngrok http 5000 > /tmp/ngrok.log 2>&1 &
```

### Q: 簽名圖片儲存在哪裡？
```
/Users/steveshihjubo.health/Documents/GitHub/pet-adoption-signing/data/signatures/
```

### Q: 如何清空所有數據？
1. 點擊「🗑️ 清空所有」按鈕
2. 輸入確認碼「確認清空」

---

## API 端點（程式開發用）

| 方法 | 端點 | 說明 |
|------|------|------|
| GET | `/` | 主頁面 |
| POST | `/api/save` | 保存協議 |
| GET | `/api/records` | 獲取所有記錄 |
| GET | `/api/records/:id` | 獲取單筆記錄 |
| DELETE | `/api/records/:id` | 刪除記錄 |
| DELETE | `/api/records` | 清空所有記錄 |

---

## 技術支援

- **問題反饋**：檢查 `/tmp/server.log`
- **ngrok 幫助**：https://ngrok.com/docs
- **Node.js 文件**：https://nodejs.org/docs/

---

**快樂簽署！🎉**



1 每次合約用送養人認養人姓名+時間戳
2 每次開啟網站時 因該能選json檔
3 每一份合約都有自己獨立的資料夾與兩個簽名檔
4 合約樣式 如沒特別選則使用目前版本 但做一個按鈕是可以仔入其他版本的合約的
此為以後的功能 先記錄在這
