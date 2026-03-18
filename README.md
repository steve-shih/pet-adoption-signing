# 🐾 寵物領養簽署系統

專業的寵物領養協議電子簽署系統，支持雙方簽名、自動數據持久化、PNG 導出和遠程分享。

## ✨ 核心特性

- ✅ **雙方電子簽名** - 送養人和認養人各一個 Canvas 簽名區域
- ✅ **自動數據持久化** - 500ms 防抖自動保存至服務器
- ✅ **PNG 圖片導出** - 基於 html2canvas 的完整合約導出
- ✅ **響應式設計** - 玫瑰粉紅色專業主題，適配所有設備
- ✅ **多值字段支持** - 晶片號碼、認養日期支持逗號分隔的多個值
- ✅ **遠程 URL 分享** - 集成 ngrok 支持遠程訪問
- ✅ **數據管理** - 清空所有數據需要「確認清空」確認

---

## 🏗️ 技術架構

### 整體架構圖

```
┌─────────────────────────────────────────────────────────────┐
│                        用戶端（浏览器）                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  HTML5 Canvas Signature (送養人 + 認養人)              │  │
│  │  表單 (可編輯字段 + 自動保存)                          │  │
│  │  html2canvas (PNG 導出)                               │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                          │ HTTP/HTTPS
                    REST API 調用
                          │
┌──────────────────────────▼──────────────────────────────────┐
│                    Node.js + Express 服務器                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  API 端點                                              │  │
│  │  ├─ GET /api/current (取得當前合約)                    │  │
│  │  ├─ PUT /api/current (自動保存)                        │  │
│  │  ├─ GET /api/records (獲取已保存記錄)                  │  │
│  │  └─ DELETE /api/records (清空所有)                     │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  數據層                                                │  │
│  │  ├─ /data/current.json (當前草稿)                      │  │
│  │  ├─ /data/records.json (已保存協議)                    │  │
│  │  └─ /data/signatures/ (簽名 PNG 圖片)                 │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                          │ ngrok 隧道
                    (可選) 遠程分享
                          │
          ┌───────────────▼────────────────┐
          │  ngrok 免費 / Hobby Level      │
          │  自動生成公網 URL               │
          │  https://xxxx.ngrok.io        │
          └────────────────────────────────┘
```

### 技術棧

| 層級 | 技術 | 版本 | 用途 |
|------|------|------|------|
| **前端** | HTML5 | 5 | 結構和語義化標記 |
| | CSS3 | 3 | 玫瑰粉紅色主題、響應式樣式 |
| | JavaScript (Vanilla) | ES6+ | 表單邏輯、Canvas 簽名、數據交互 |
| | html2canvas | 1.4.1 | 將合約轉換為 PNG 圖片 |
| **後端** | Node.js | v16+ | JavaScript 運行環境 |
| | Express.js | 4.18.2 | HTTP 服務器框架 |
| | CORS | 2.8.5 | 跨域資源共享 |
| | express-fileupload | 1.5.0 | 檔案上傳處理 |
| **數據層** | JSON | - | 文件型數據存儲 |
| | File System | - | 簽名圖片存儲 |
| **遠程分享** | ngrok | 3.37.2 | 公網隧道（可選） |

---

## 📁 項目結構

```
pet-adoption-signing/
├── server.js                 # Express 服務器主文件（261 行）
├── package.json             # 依賴管理
├── package-lock.json        # 依賴鎖定
├── README.md                # 本文檔
├── STARTUP_GUIDE.md         # 啟動指南
│
├── public/
│   └── index.html           # 前端主頁面（響應式設計）
│
├── data/                    # 數據持久化目錄
│   ├── current.json         # 當前工作中的合約
│   ├── records.json         # 已保存的所有協議
│   └── signatures/          # 簽名 PNG 圖片存儲
│
└── .gitignore              # Git 忽略規則
```

---

## 🔌 API 端點

### 1. 獲取當前合約

```http
GET /api/current
```

**應答示例：**
```json
{
  "giverName": "王小明",
  "giverPhone": "0912345678",
  "adopterName": "李大美",
  "adopterPhone": "0987654321",
  "catName": "咪咪",
  "catChip": "123456789, 987654321",
  "adoptionDate": "2026-03-18, 2026-04-01",
  "notes": "貓咪已施打疫苗",
  "giverSignature": "data:image/png;base64,...",
  "adopterSignature": "data:image/png;base64,..."
}
```

### 2. 自動保存合約

```http
PUT /api/current
Content-Type: application/json

{
  "giverName": "王小明",
  "giverPhone": "0912345678",
  ...
}
```

**應答：** `200 OK` - 保存成功

### 3. 獲取已保存記錄

```http
GET /api/records
```

**應答示例：**
```json
[
  {
    "_id": "507f1f77bcf86cd799439011",
    "timestamp": "2026-03-18T10:30:00Z",
    "giverName": "王小明",
    "adopterName": "李大美",
    ...
  }
]
```

### 4. 清空所有數據

```http
DELETE /api/records
```

**應答：** `200 OK` - 數據已清空

---

## 💾 數據持久化設計

### 自動保存機制

```
前端表單改變事件
        ↓
500ms 防抖（debounce）
        ↓
PUT /api/current
        ↓
服務器更新 /data/current.json
        ↓
✅ 自動保存完成
```

### 文件結構

**current.json** - 當前工作合約
```json
{
  "giverName": "送養人名稱",
  "giverPhone": "0912345678",
  "adopterName": "認養人名稱",
  "adopterPhone": "0987654321",
  "catName": "貓咪名稱",
  "catChip": "123456789, 987654321",
  "adoptionDate": "2026-03-18, 2026-04-01",
  "notes": "補充說明",
  "giverSignature": "Base64 encoded PNG",
  "adopterSignature": "Base64 encoded PNG"
}
```

**records.json** - 已保存協議歷史
```json
[
  {
    "_id": "唯一 ID",
    "timestamp": "ISO 8601 時間戳",
    "giverName": "王小明",
    ...
  }
]
```

**signatures/** - 簽名圖片存儲
```
signatures/
├── signature_1710745800000_giver.png
├── signature_1710745800000_adopter.png
└── ...
```

---

## 🎨 前端架構

### 頁面結構

```
┌─────────────────────────────────────────┐
│           寵物領養簽署系統 Header          │
│        (玫瑰粉紅色 #c46b88 漸層)          │
├─────────────────────────────────────────┤
│  工具欄（Sticky 固定）                     │
│  [💾 保存] [🗑️ 刪除] [📸 下載圖片]        │
├─────────────────────────────────────────┤
│                                         │
│  📋 送養人/認養人 資訊                     │
│  ├─ 送養人姓名 [input]                   │
│  ├─ 送養人電話 [input]                   │
│  ├─ 認養人姓名 [input]                   │
│  └─ 認養人電話 [input]                   │
│                                         │
│  🐱 寵物相關資訊                          │
│  ├─ 貓咪名稱 [input]                     │
│  ├─ 晶片號碼 [input] (多值)              │
│  ├─ 認養日期 [input] (多值)              │
│  └─ 品種 [input]                       │
│                                         │
│  📝 補充說明與注意事項                     │
│  ├─ 特殊需求 [textarea]                 │
│  └─ 承諾事項 [textarea]                 │
│                                         │
│  ✍️ 電子簽名                             │
│  ├─ 送養人簽名 [Canvas 120px]           │
│  └─ 認養人簽名 [Canvas 120px]           │
│                                         │
└─────────────────────────────────────────┘
```

### Canvas 簽名設計

```javascript
// 簽名配置
{
  寬度: 500px,
  高度: 120px,
  背景: 白色 (dashed 邊框),
  光標: crosshair (十字),
  筆寬: 2px,
  筆色: #333,
  觸控支持: 是 (支持手機/平板)
}
```

### 自動保存邏輯

```javascript
// 防抖（debounce）實現
const autoSaveTimer = null;

function triggerAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveToServer();
  }, 500); // 500ms 延遲
}

// 所有表單字段綁定 onchange 事件
// 所有 Canvas 綁定 mouseup/touchend 事件
```

---

## 🚀 快速開始

### 前置需求

- **Node.js** v16 以上
- **npm** v7 以上
- **ngrok** (可選，用於遠程分享)

### 安裝依賴

```bash
cd /Users/steveshihjubo.health/Documents/GitHub/pet-adoption-signing
npm install
```

### 本地開發

```bash
npm start
```

服務器將啟動在 `http://localhost:5000`

打開瀏覽器訪問：
```
http://localhost:5000
```

### 遠程分享（ngrok）

在另一個終端：

```bash
ngrok http 5000
```

ngrok 將顯示公網 URL（如 `https://xxxx.ngrok.io`）

---

## 🔧 開發指南

### 開發模式（自動重載）

```bash
npm run dev
```

使用 nodemon 監視文件變化，自動重啟服務器

### 常用命令

| 命令 | 說明 |
|------|------|
| `npm start` | 啟動生產服務器 |
| `npm run dev` | 啟動開發服務器（自動重載） |
| `git add .` | 添加所有文件到 Git |
| `git commit -m "msg"` | 提交變更 |
| `git push origin main` | 推送到 GitHub |

---

## 📊 數據流程

### 新建合約流程

```
1. 用戶打開 http://localhost:5000
           ↓
2. 前端執行 loadFromServer() 
           ↓
3. GET /api/current 從服務器讀取 current.json
           ↓
4. 前端填充表單和簽名 Canvas
           ↓
5. 顯示已保存的協議
```

### 保存合約流程

```
1. 用戶點擊「保存」按鈕
           ↓
2. 收集所有表單數據
           ↓
3. 將 Canvas 簽名轉換為 Base64
           ↓
4. PUT /api/current 發送數據
           ↓
5. 服務器保存到 /data/current.json
           ↓
6. 生成唯一 ID，保存到 /data/records.json
           ↓
7. ✅ 保存完成
```

### 導出 PNG 流程

```
1. 用戶點擊「下載圖片」
           ↓
2. html2canvas 將頁面渲染為 Canvas
           ↓
3. Canvas.toBlob() 轉換為 PNG
           ↓
4. 創建臨時下載鏈接
           ↓
5. 觸發瀏覽器下載
           ↓
6. ✅ PNG 文件已下載
```

---

## 🌐 部署方案

### 本地部署

```bash
npm install
npm start
# 訪問 http://localhost:5000
```

### Docker 部署

```bash
docker build -t pet-adoption .
docker run -p 5000:5000 pet-adoption
```

### ngrok 遠程分享

```bash
# 終端 1：啟動服務器
npm start

# 終端 2：啟動 ngrok
ngrok http 5000

# 分享公網 URL（如 https://xxxx.ngrok.io）
```

### 生產環境建議

- 使用 PM2 進程管理
- Nginx 反向代理
- HTTPS/SSL 證書
- 定期備份 `/data` 目錄

---

## ✅ 功能清單

### 已實現

- [x] 雙方電子簽名（Canvas）
- [x] 自動數據持久化（500ms 防抖）
- [x] PNG 圖片導出（html2canvas）
- [x] 響應式設計（玫瑰粉紅色主題）
- [x] 多值字段支持（晶片號碼、認養日期）
- [x] 清空數據確認（「確認清空」）
- [x] ngrok 遠程分享支持
- [x] Git 版本控制

### 未來計劃

- [ ] 數據庫遷移（MongoDB / PostgreSQL）
- [ ] 用戶認證系統
- [ ] 簽署歷史版本對比
- [ ] 郵件通知功能
- [ ] PDF 導出（不只 PNG）
- [ ] 移動 App（React Native）
- [ ] 人工智能簽名驗證

---

## 📞 常見問題

### Q: ngrok 網址每次重啟都會改變？

**A:** 是的，免費版本每次重啟都會產生新網址。購買 Hobby Level ($5/月) 或 Pro ($12/月) 可保留固定網址。

### Q: 如何永久保存已簽署的合約？

**A:** 所有合約自動保存在 `/data/records.json`。建議定期備份此目錄。

### Q: 可以自訂表單字段嗎？

**A:** 可以。編輯 `public/index.html` 中的 HTML，然後在 `server.js` 中對應添加 API 邏輯。

### Q: 簽名圖片存儲在哪裡？

**A:** 存儲在 `/data/signatures/` 目錄，以 Base64 格式保存在 JSON 中。

---

## 📄 授權

MIT License - 可自由使用和修改

---

## 👨‍💻 開發者

**Steve Shih**
- GitHub: [@steve-shih](https://github.com/steve-shih)
- Email: steveshihjubo@health.com

---

## 🙏 致謝

- **html2canvas** - 頁面截圖轉 PNG
- **Express.js** - 高效的 Web 框架
- **ngrok** - 快速遠程隧道分享

---

**最後更新：2026 年 3 月 18 日**
