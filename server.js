require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Contract = require('./models/Contract');
const Snapshot = require('./models/Snapshot');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pet-adoption';

let isMongoReady = false;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(fileUpload());
app.use(express.static('public'));

// Data directory (still used for snapshots and legacy local signatures)
const DATA_DIR = path.join(__dirname, 'data');
const CONTRACTS_DIR = path.join(DATA_DIR, 'contracts');
const SNAPSHOTS_DIR = path.join(DATA_DIR, 'snapshots');

// Ensure directories exist
[DATA_DIR, CONTRACTS_DIR, SNAPSHOTS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Connect to MongoDB (With Fallback Support)
mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => {
    isMongoReady = true;
    console.log('✅ MongoDB 連線成功 (切換至資料庫模式)');
  })
  .catch(err => {
    isMongoReady = false;
    console.warn('⚠️ MongoDB 連線失敗 (切換至本地檔案模式)：', err.message);
  });

/**
 * Generate a folder name for legacy file support
 */
function generateContractFolderName(formData) {
  const donor = (formData.giverName || '').trim() || '未知送養人';
  const adopter = (formData.adopterName || '').trim() || '未知認養人';
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `${donor.replace(/[\\/:*?"<>|]/g, '_')}_${adopter.replace(/[\\/:*?"<>|]/g, '_')}_${ts}`;
}

/**
 * Save signature to local filesystem (支援歷史版本備份)
 */
function saveSignatureToLocal(folderName, base64Data, filename) {
  try {
    const contractDir = path.join(CONTRACTS_DIR, folderName);
    const historyDir = path.join(contractDir, 'history');
    if (!fs.existsSync(contractDir)) fs.mkdirSync(contractDir, { recursive: true });

    const filepath = path.join(contractDir, filename);

    // 1. 如果舊簽名已存在，先將其移入 history 子資料夾
    if (fs.existsSync(filepath)) {
      if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });
      const now = new Date();
      // 使用更精簡的時間戳記：時分秒-毫秒
      const ts = `${now.getHours()}${now.getMinutes()}${now.getSeconds()}-${now.getMilliseconds()}`;
      const backupName = filename.replace('.png', `_deleted_${ts}.png`);
      fs.renameSync(filepath, path.join(historyDir, backupName));
    }

    // 2. 儲存新簽名到根目錄
    const base64String = base64Data.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(filepath, Buffer.from(base64String, 'base64'));
    return true;
  } catch (e) {
    console.error('保存簽名與記錄歷史失敗:', e);
    return false;
  }
}

// ================== API Routes ==================

/**
 * GET /api/ping
 */
app.get('/api/ping', (req, res) => {
  res.json({ success: true, timestamp: new Date().toISOString(), status: 'alive', db: mongoose.connection.readyState === 1 });
});

/**
 * GET /api/contracts - 讀取列表 (支援 DB/Local 混合轉發)
 */
app.get('/api/contracts', async (req, res) => {
  try {
    if (isMongoReady) {
      const contracts = await Contract.find({ valid: true })
        .select('folderName giverName adopterName contractType adoptionDate timestamp isProtected')
        .sort({ timestamp: -1 });

      const data = contracts.map(c => ({
        folder: c.folderName,
        giverName: c.giverName,
        adopterName: c.adopterName,
        contractType: c.contractType,
        adoptionDate: c.adoptionDate,
        timestamp: c.timestamp,
        isProtected: c.isProtected
      }));
      return res.json({ success: true, data, mode: 'mongodb' });
    }

    // Fallback: 純檔案讀取
    const folders = fs.readdirSync(CONTRACTS_DIR)
      .filter(f => fs.statSync(path.join(CONTRACTS_DIR, f)).isDirectory());

    const data = folders.map(f => {
      try {
        const jsonPath = path.join(CONTRACTS_DIR, f, 'contract.json');
        if (!fs.existsSync(jsonPath)) return null;
        const info = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (info.valid === false) return null; // 過濾掉已刪除
        return {
          folder: f,
          giverName: info.giverName,
          adopterName: info.adopterName,
          contractType: info.contractType,
          adoptionDate: info.adoptionDate,
          timestamp: info.timestamp,
          isProtected: info.isProtected
        };
      } catch (e) { return null; }
    }).filter(x => x).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({ success: true, data, mode: 'local' });
  } catch (err) {
    res.status(500).json({ success: false, message: '讀取列表失敗：' + err.message });
  }
});

/**
 * GET /api/contracts/:folder - 讀取指定合約
 */
app.get('/api/contracts/:folder', async (req, res) => {
  try {
    const folderName = req.params.folder;
    if (isMongoReady) {
      const contract = await Contract.findOne({ folderName });
      if (contract) return res.json({ success: true, data: contract, folder: folderName });
    }

    // Fallback: 讀取本地 JSON
    const jsonPath = path.join(CONTRACTS_DIR, folderName, 'contract.json');
    if (fs.existsSync(jsonPath)) {
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      return res.json({ success: true, data, folder: folderName });
    }

    res.status(404).json({ success: false, message: '合約不存在' });
  } catch (err) {
    res.status(500).json({ success: false, message: '讀取合約失敗' });
  }
});

/**
 * POST /api/contracts - 建立新合約
 */
app.post('/api/contracts', async (req, res) => {
  try {
    const formData = req.body || {};
    const folderNameBase = generateContractFolderName(formData);

    // 取得唯一資料夾名稱
    let folderName = folderNameBase;
    let counter = 1;
    const checkExists = async (f) => {
      if (isMongoReady) return await Contract.findOne({ folderName: f });
      return fs.existsSync(path.join(CONTRACTS_DIR, f));
    }

    while (await checkExists(folderName)) {
      folderName = `${folderNameBase}_${counter}`;
      counter++;
    }

    formData.folderName = folderName;
    formData.timestamp = new Date();

    // 1. 備份到本地檔案系統 (不管是哪種模式都存一份作為雙重備份)
    const contractDir = path.join(CONTRACTS_DIR, folderName);
    if (!fs.existsSync(contractDir)) fs.mkdirSync(contractDir, { recursive: true });
    fs.writeFileSync(path.join(contractDir, 'contract.json'), JSON.stringify(formData, null, 2));

    if (formData.giverSignatureDataUrl) saveSignatureToLocal(folderName, formData.giverSignatureDataUrl, 'signature_donor.png');
    if (formData.adopterSignatureDataUrl) saveSignatureToLocal(folderName, formData.adopterSignatureDataUrl, 'signature_adopter.png');

    // 2. 如果 DB 可用，存入 DB
    if (isMongoReady) {
      const newContract = new Contract(formData);
      await newContract.save();
    }

    res.json({ success: true, message: isMongoReady ? '新合約已建立 (MongoDB)' : '新合約已建立 (本地檔案)', folder: folderName });
  } catch (err) {
    console.error('建立失敗:', err);
    res.status(500).json({ success: false, message: '建立失敗：' + err.message });
  }
});

/**
 * PUT /api/contracts/:folder - 更新合約
 */
app.put('/api/contracts/:folder', async (req, res) => {
  try {
    const folder = req.params.folder;
    const formData = req.body;
    formData.timestamp = new Date();

    // 1. 更新本地檔案 (雙重備份)
    const jsonPath = path.join(CONTRACTS_DIR, folder, 'contract.json');
    if (fs.existsSync(jsonPath)) {
      const currentData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      const updatedData = { ...currentData, ...formData };
      fs.writeFileSync(jsonPath, JSON.stringify(updatedData, null, 2));
    }

    if (formData.giverSignatureDataUrl) saveSignatureToLocal(folder, formData.giverSignatureDataUrl, 'signature_donor.png');
    if (formData.adopterSignatureDataUrl) saveSignatureToLocal(folder, formData.adopterSignatureDataUrl, 'signature_adopter.png');

    // 2. 更新 MongoDB
    if (isMongoReady) {
      const contract = await Contract.findOneAndUpdate(
        { folderName: folder },
        { $set: formData },
        { new: true }
      );
      if (!contract) return res.status(404).json({ success: false, message: '資料庫中找不到合約' });
    }

    res.json({ success: true, message: '合約已更新', folder });
  } catch (err) {
    console.error('更新失敗:', err);
    res.status(500).json({ success: false, message: '更新失敗' });
  }
});

/**
 * POST /api/contracts/:folder/rename - 重命名合約 (改名連結 ID)
 */
app.post('/api/contracts/:folder/rename', async (req, res) => {
  try {
    const oldName = req.params.folder;
    const { newName: rawNewName } = req.body;
    if (!rawNewName) return res.status(400).json({ success: false, message: '缺少新名稱' });

    // 清洗檔名防止噴錯
    const newName = rawNewName.replace(/[\\/:*?"<>|]/g, '_');
    
    // 1. 檢查新名稱是否已存在 (DB & Local)
    const oldDirPath = path.join(CONTRACTS_DIR, oldName);
    const newDirPath = path.join(CONTRACTS_DIR, newName);
    
    if (isMongoReady) {
      const exists = await Contract.findOne({ folderName: newName });
      if (exists) return res.status(400).json({ success: false, message: '此名稱在資料庫已存在' });
    }
    if (fs.existsSync(newDirPath)) {
      return res.status(400).json({ success: false, message: '此名稱在檔案系統已存在' });
    }

    // 2. 更新 MongoDB
    if (isMongoReady) {
      await Contract.findOneAndUpdate({ folderName: oldName }, { folderName: newName });
      await Snapshot.updateMany({ folderName: oldName }, { folderName: newName });
    }

    // 3. 實體檔案系統改名
    if (fs.existsSync(oldDirPath)) {
      fs.renameSync(oldDirPath, newDirPath);
      // 更新資料夾內的 contract.json
      const jsonPath = path.join(newDirPath, 'contract.json');
      if (fs.existsSync(jsonPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
          data.folderName = newName;
          fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
        } catch (e) { console.error('更新本地 JSON 失敗', e); }
      }
    }

    res.json({ success: true, message: '合約已成功重命名', folder: newName });
  } catch (err) {
    console.error('重命名失敗:', err);
    res.status(500).json({ success: false, message: '重命名失敗' });
  }
});

/**
 * DELETE /api/contracts/:folder - 軟刪除
 */
app.delete('/api/contracts/:folder', async (req, res) => {
  try {
    const folder = req.params.folder;
    const now = new Date();

    // 1. 本地軟刪除
    const jsonPath = path.join(CONTRACTS_DIR, folder, 'contract.json');
    if (fs.existsSync(jsonPath)) {
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      data.valid = false;
      data.deletedAt = now;
      fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
    }

    // 2. MongoDB 軟刪除
    if (isMongoReady) {
      await Contract.findOneAndUpdate(
        { folderName: folder },
        { $set: { valid: false, deletedAt: now } }
      );
    }

    res.json({ success: true, message: '合約已標記為刪除' });
  } catch (err) {
    res.status(500).json({ success: false, message: '刪除失敗' });
  }
});

/**
 * POST /api/snapshots - 儲存截圖
 */
app.post('/api/snapshots', async (req, res) => {
  try {
    const { image, folder } = req.body;
    if (!image) return res.status(400).json({ success: false, message: '缺少圖片資料' });

    const base64String = image.replace(/^data:image\/\w+;base64,/, '');
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, '-');
    const folderLabel = (folder || 'unknown').replace(/[\\/:*?"<>|]/g, '_');
    const filename = `snapshot_${folderLabel}_${ts}.png`;
    const filepath = path.join(SNAPSHOTS_DIR, filename);

    // 1. 儲存實體檔案到本地 (固定執行)
    fs.writeFileSync(filepath, Buffer.from(base64String, 'base64'));

    // 2. 只有 DB 可用時才存入紀錄
    let dbId = null;
    if (isMongoReady) {
      const newSnapshot = new Snapshot({
        folderName: folder || 'unknown',
        filename: filename,
        localPath: filepath,
        timestamp: now
      });
      await newSnapshot.save();
      dbId = newSnapshot._id;
    }

    res.json({ success: true, filename, id: dbId });
  } catch (err) {
    console.error('儲存截圖失敗:', err);
    res.status(500).json({ success: false, message: '儲存截圖失敗' });
  }
});

/**
 * GET /api/snapshots
 */
app.get('/api/snapshots', async (req, res) => {
  try {
    if (isMongoReady) {
      const snapshots = await Snapshot.find().sort({ timestamp: -1 });
      const data = snapshots.map(s => ({
        id: s._id,
        filename: s.filename,
        url: `/api/files/snapshots/${s.filename}`,
        timestamp: s.timestamp.toISOString(),
        folder: s.folderName
      }));
      return res.json({ success: true, data, mode: 'mongodb' });
    }

    // Fallback: 掃描硬碟
    if (!fs.existsSync(SNAPSHOTS_DIR)) return res.json({ success: true, data: [] });
    const files = fs.readdirSync(SNAPSHOTS_DIR)
      .filter(f => f.endsWith('.png'))
      .map(f => {
        const stats = fs.statSync(path.join(SNAPSHOTS_DIR, f));
        return { filename: f, url: `/api/files/snapshots/${f}`, timestamp: stats.mtime.toISOString() };
      });
    files.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    res.json({ success: true, data: files, mode: 'local' });
  } catch (err) {
    console.error('讀取紀錄失敗:', err);
    res.status(500).json({ success: false, message: '讀取紀錄失敗' });
  }
});

// Static serving
app.use('/api/files/snapshots', express.static(SNAPSHOTS_DIR));
app.use('/api/files', express.static(CONTRACTS_DIR));
app.use('/snapshots', express.static(SNAPSHOTS_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`\n✅ 寵物領養簽署系統 (MongoDB版) 已啟動！`);
  console.log(`📍 本地地址：http://localhost:${PORT}`);
  console.log(`📡 資料庫位址：${MONGODB_URI}`);
  console.log(`🌐 如需遠程分享，執行：ngrok http ${PORT}\n`);
});
