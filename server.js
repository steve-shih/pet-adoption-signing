const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(fileUpload());
app.use(express.static('public'));

// Data directory
const DATA_DIR = path.join(__dirname, 'data');
const SIGNATURES_DIR = path.join(DATA_DIR, 'signatures');
const RECORDS_FILE = path.join(DATA_DIR, 'records.json');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(SIGNATURES_DIR)) {
  fs.mkdirSync(SIGNATURES_DIR, { recursive: true });
}

// Initialize records file
if (!fs.existsSync(RECORDS_FILE)) {
  fs.writeFileSync(RECORDS_FILE, JSON.stringify([], null, 2));
}

// Current working contract file
const CURRENT_CONTRACT_FILE = path.join(DATA_DIR, 'current.json');
if (!fs.existsSync(CURRENT_CONTRACT_FILE)) {
  fs.writeFileSync(CURRENT_CONTRACT_FILE, JSON.stringify({}));
}

/**
 * 讀取所有記錄
 */
function getRecords() {
  try {
    const data = fs.readFileSync(RECORDS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

/**
 * 保存記錄
 */
function saveRecords(records) {
  fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2));
}

/**
 * 保存簽名圖片
 */
function saveSignature(base64Data, filename) {
  const base64String = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const filepath = path.join(SIGNATURES_DIR, filename);
  fs.writeFileSync(filepath, Buffer.from(base64String, 'base64'));
  return `/signatures/${filename}`;
}

/**
 * 讀取當前工作中的合約
 */
function getCurrentContract() {
  try {
    const data = fs.readFileSync(CURRENT_CONTRACT_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return {};
  }
}

/**
 * 保存當前工作中的合約
 */
function saveCurrentContract(contractData) {
  fs.writeFileSync(CURRENT_CONTRACT_FILE, JSON.stringify(contractData, null, 2));
}

// Routes

/**
 * GET / - 主頁面
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * POST /api/save - 保存領養簽署紀錄
 */
app.post('/api/save', (req, res) => {
  try {
    const { donor, adopter, donorId, adopterId, notes, remarks, donorSignature, adopterSignature } = req.body;

    const records = getRecords();
    const timestamp = new Date().toISOString();
    const recordId = `record_${Date.now()}`;

    // 保存簽名圖片
    const donorSigPath = donorSignature ? saveSignature(donorSignature, `${recordId}_donor.png`) : null;
    const adopterSigPath = adopterSignature ? saveSignature(adopterSignature, `${recordId}_adopter.png`) : null;

    // 新建記錄
    const newRecord = {
      id: recordId,
      timestamp,
      donor,
      adopter,
      donorId,
      adopterId,
      notes,
      remarks,
      donorSignature: donorSigPath,
      adopterSignature: adopterSigPath,
    };

    records.push(newRecord);
    saveRecords(records);

    res.json({ success: true, id: recordId, message: '記錄保存成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '保存失敗：' + err.message });
  }
});

/**
 * GET /api/records - 取得所有記錄
 */
app.get('/api/records', (req, res) => {
  try {
    const records = getRecords();
    res.json({ success: true, data: records });
  } catch (err) {
    res.status(500).json({ success: false, message: '讀取失敗：' + err.message });
  }
});

/**
 * GET /api/current - 取得當前工作中的合約
 */
app.get('/api/current', (req, res) => {
  try {
    const currentContract = getCurrentContract();
    res.json({ success: true, data: currentContract });
  } catch (err) {
    res.status(500).json({ success: false, message: '讀取失敗：' + err.message });
  }
});

/**
 * PUT /api/current - 更新當前工作中的合約
 */
app.put('/api/current', (req, res) => {
  try {
    const contractData = req.body;
    saveCurrentContract(contractData);
    res.json({ success: true, message: '合約已自動保存' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '保存失敗：' + err.message });
  }
});

/**
 * GET /api/records/:id - 取得單筆記錄
 */
app.get('/api/records/:id', (req, res) => {
  try {
    const records = getRecords();
    const record = records.find(r => r.id === req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, message: '記錄不存在' });
    }
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, message: '讀取失敗：' + err.message });
  }
});

/**
 * DELETE /api/records/:id - 刪除記錄
 */
app.delete('/api/records/:id', (req, res) => {
  try {
    const records = getRecords();
    const index = records.findIndex(r => r.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ success: false, message: '記錄不存在' });
    }
    
    const deletedRecord = records.splice(index, 1)[0];
    saveRecords(records);

    // 刪除簽名檔案
    if (deletedRecord.donorSignature) {
      const donorPath = path.join(__dirname, 'public', deletedRecord.donorSignature);
      if (fs.existsSync(donorPath)) fs.unlinkSync(donorPath);
    }
    if (deletedRecord.adopterSignature) {
      const adopterPath = path.join(__dirname, 'public', deletedRecord.adopterSignature);
      if (fs.existsSync(adopterPath)) fs.unlinkSync(adopterPath);
    }

    res.json({ success: true, message: '記錄已刪除' });
  } catch (err) {
    res.status(500).json({ success: false, message: '刪除失敗：' + err.message });
  }
});

/**
 * DELETE /api/records - 清空所有記錄
 */
app.delete('/api/records', (req, res) => {
  try {
    const records = getRecords();
    
    // 刪除所有簽名檔案
    records.forEach((record) => {
      if (record.donorSignature) {
        const donorPath = path.join(__dirname, 'public', record.donorSignature);
        if (fs.existsSync(donorPath)) fs.unlinkSync(donorPath);
      }
      if (record.adopterSignature) {
        const adopterPath = path.join(__dirname, 'public', record.adopterSignature);
        if (fs.existsSync(adopterPath)) fs.unlinkSync(adopterPath);
      }
    });

    // 清空記錄檔案
    saveRecords([]);
    
    // 同時清空當前工作中的合約
    saveCurrentContract({});
    
    res.json({ success: true, message: '所有記錄已清空' });
  } catch (err) {
    res.status(500).json({ success: false, message: '清空失敗：' + err.message });
  }
});

/**
 * 靜態文件路由 - 簽名圖片
 */
app.use('/signatures', express.static(SIGNATURES_DIR));

// 啟動伺服器
const server = app.listen(PORT, () => {
  console.log(`\n✅ 寵物領養簽署系統已啟動！`);
  console.log(`\n📍 本地地址：http://localhost:${PORT}`);
  console.log(`\n🌐 如需遠程分享，開啟新終端執行：`);
  console.log(`   $ ngrok http 5000\n`);
});
