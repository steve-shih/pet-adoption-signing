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
app.use('/snapshots', express.static(path.join(__dirname, 'data', 'snapshots'))); // Serve snapshots statically

// Data directory
const DATA_DIR = path.join(__dirname, 'data');
const CONTRACTS_DIR = path.join(DATA_DIR, 'contracts');
const SNAPSHOTS_DIR = path.join(DATA_DIR, 'snapshots');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(CONTRACTS_DIR)) {
  fs.mkdirSync(CONTRACTS_DIR, { recursive: true });
}
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

// === Legacy migration: move old current.json / records.json into contracts folder ===
const OLD_CURRENT = path.join(DATA_DIR, 'current.json');
if (fs.existsSync(OLD_CURRENT)) {
  try {
    const oldData = JSON.parse(fs.readFileSync(OLD_CURRENT, 'utf-8'));
    if (oldData && Object.keys(oldData).length > 0) {
      const donor = oldData.giverName || '未知送養人';
      const adopter = oldData.adopterName || '未知認養人';
      const ts = oldData.timestamp ? oldData.timestamp.slice(0, 10).replace(/-/g, '') : new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const folderName = `${donor}_${adopter}_${ts}`;
      const contractDir = path.join(CONTRACTS_DIR, folderName);
      if (!fs.existsSync(contractDir)) {
        fs.mkdirSync(contractDir, { recursive: true });
        fs.writeFileSync(path.join(contractDir, 'contract.json'), JSON.stringify(oldData, null, 2));
        console.log(`📦 已遷移舊合約到 ${folderName}`);
      }
    }
    // Keep old file as backup, rename it
    fs.renameSync(OLD_CURRENT, path.join(DATA_DIR, 'current.json.bak'));
  } catch (e) {
    console.error('遷移舊合約失敗', e);
  }
}

/**
 * Generate a contract folder name from form data
 * Format: {送養人}_{認養人}_{YYYYMMDD}
 */
function generateContractFolderName(formData) {
  const donor = (formData.giverName || '').trim() || '未知送養人';
  const adopter = (formData.adopterName || '').trim() || '未知認養人';
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  // Sanitize folder name (remove illegal characters for file system)
  const safeDonor = donor.replace(/[\\/:*?"<>|]/g, '_');
  const safeAdopter = adopter.replace(/[\\/:*?"<>|]/g, '_');
  return `${safeDonor}_${safeAdopter}_${ts}`;
}

/**
 * Save signature to a specific contract folder
 */
function saveSignatureToFolder(contractDir, base64Data, filename) {
  const base64String = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const filepath = path.join(contractDir, filename);
  fs.writeFileSync(filepath, Buffer.from(base64String, 'base64'));
  return filename;
}

// ================== API Routes ==================

/**
 * GET / - 主頁面
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * GET /api/contracts - 列出所有合約資料夾
 */
app.get('/api/contracts', (req, res) => {
  try {
    if (!fs.existsSync(CONTRACTS_DIR)) {
      return res.json({ success: true, data: [] });
    }
    const folders = fs.readdirSync(CONTRACTS_DIR).filter(name => {
      const fullPath = path.join(CONTRACTS_DIR, name);
      return fs.statSync(fullPath).isDirectory();
    });

    // Return folder info with metadata, filter out soft-deleted (valid: false)
    const contracts = folders.map(folder => {
      const contractFile = path.join(CONTRACTS_DIR, folder, 'contract.json');
      let meta = {};
      let valid = true;
      if (fs.existsSync(contractFile)) {
        try {
          const raw = JSON.parse(fs.readFileSync(contractFile, 'utf-8'));
          if (raw.valid === false) valid = false;
          meta = {
            giverName: raw.giverName || '',
            adopterName: raw.adopterName || '',
            contractType: raw.contractType || '送養合約',
            adoptionDate: raw.adoptionDate || '',
            timestamp: raw.timestamp || '',
            isProtected: !!raw.isProtected,
          };
        } catch (e) { /* ignore */ }
      }
      return valid ? { folder, ...meta } : null;
    }).filter(c => c !== null);

    // Sort by timestamp descending (newest first)
    contracts.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

    res.json({ success: true, data: contracts });
  } catch (err) {
    res.status(500).json({ success: false, message: '讀取合約列表失敗：' + err.message });
  }
});

/**
 * GET /api/contracts/:folder - 讀取指定合約
 */
app.get('/api/contracts/:folder', (req, res) => {
  try {
    const folder = req.params.folder;
    const contractFile = path.join(CONTRACTS_DIR, folder, 'contract.json');
    if (!fs.existsSync(contractFile)) {
      return res.status(404).json({ success: false, message: '合約不存在' });
    }
    const data = JSON.parse(fs.readFileSync(contractFile, 'utf-8'));
    res.json({ success: true, data, folder });
  } catch (err) {
    res.status(500).json({ success: false, message: '讀取合約失敗：' + err.message });
  }
});

/**
 * PUT /api/contracts/:folder - 更新指定合約 (auto-save)
 */
app.put('/api/contracts/:folder', (req, res) => {
  try {
    const folder = req.params.folder;
    const contractDir = path.join(CONTRACTS_DIR, folder);
    if (!fs.existsSync(contractDir)) {
      fs.mkdirSync(contractDir, { recursive: true });
    }

    const formData = req.body;

    // Save signatures as separate files in the contract folder
    if (formData.giverSignatureDataUrl) {
      saveSignatureToFolder(contractDir, formData.giverSignatureDataUrl, 'signature_donor.png');
    }
    if (formData.adopterSignatureDataUrl) {
      saveSignatureToFolder(contractDir, formData.adopterSignatureDataUrl, 'signature_adopter.png');
    }

    // Save the JSON (with signature data urls kept for reload)
    formData.timestamp = new Date().toISOString();
    fs.writeFileSync(path.join(contractDir, 'contract.json'), JSON.stringify(formData, null, 2));

    res.json({ success: true, message: '合約已保存', folder });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '保存失敗：' + err.message });
  }
});

/**
 * POST /api/contracts - 建立新合約
 */
app.post('/api/contracts', (req, res) => {
  try {
    const formData = req.body || {};
    const folderName = generateContractFolderName(formData);
    const contractDir = path.join(CONTRACTS_DIR, folderName);

    // If folder already exists, append a counter
    let finalFolder = folderName;
    let counter = 1;
    while (fs.existsSync(path.join(CONTRACTS_DIR, finalFolder))) {
      finalFolder = `${folderName}_${counter}`;
      counter++;
    }

    const finalDir = path.join(CONTRACTS_DIR, finalFolder);
    fs.mkdirSync(finalDir, { recursive: true });

    // Save initial data
    formData.timestamp = new Date().toISOString();
    fs.writeFileSync(path.join(finalDir, 'contract.json'), JSON.stringify(formData, null, 2));

    // Save signatures if present
    if (formData.giverSignatureDataUrl) {
      saveSignatureToFolder(finalDir, formData.giverSignatureDataUrl, 'signature_donor.png');
    }
    if (formData.adopterSignatureDataUrl) {
      saveSignatureToFolder(finalDir, formData.adopterSignatureDataUrl, 'signature_adopter.png');
    }

    res.json({ success: true, message: '新合約已建立', folder: finalFolder });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '建立失敗：' + err.message });
  }
});

/**
 * POST /api/contracts/:folder/rename - 重新命名合約資料夾（當姓名或日期改變時）
 */
app.post('/api/contracts/:folder/rename', (req, res) => {
  try {
    const oldFolder = req.params.folder;
    const formData = req.body;
    const newFolder = generateContractFolderName(formData);

    if (oldFolder === newFolder) {
      return res.json({ success: true, folder: oldFolder, message: '名稱未變' });
    }

    const oldPath = path.join(CONTRACTS_DIR, oldFolder);
    let finalNewFolder = newFolder;
    let counter = 1;
    while (fs.existsSync(path.join(CONTRACTS_DIR, finalNewFolder)) && finalNewFolder !== oldFolder) {
      finalNewFolder = `${newFolder}_${counter}`;
      counter++;
    }

    if (finalNewFolder !== oldFolder) {
      fs.renameSync(oldPath, path.join(CONTRACTS_DIR, finalNewFolder));
    }

    res.json({ success: true, folder: finalNewFolder, message: '資料夾已重新命名' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '重新命名失敗：' + err.message });
  }
});

/**
 * DELETE /api/contracts/:folder - 軟刪除指定合約（標記 valid: false，不真正刪除檔案）
 */
app.delete('/api/contracts/:folder', (req, res) => {
  try {
    const folder = req.params.folder;
    const contractDir = path.join(CONTRACTS_DIR, folder);
    const contractFile = path.join(contractDir, 'contract.json');
    if (!fs.existsSync(contractFile)) {
      return res.status(404).json({ success: false, message: '合約不存在' });
    }

    // Soft delete: mark valid = false in JSON
    const data = JSON.parse(fs.readFileSync(contractFile, 'utf-8'));
    data.valid = false;
    data.deletedAt = new Date().toISOString();
    fs.writeFileSync(contractFile, JSON.stringify(data, null, 2));

    res.json({ success: true, message: '合約已標記為刪除（資料仍保留）' });
  } catch (err) {
    res.status(500).json({ success: false, message: '刪除失敗：' + err.message });
  }
});

/**
 * POST /api/snapshots - 儲存合約截圖版本 (歷史紀錄)
 */
app.post('/api/snapshots', (req, res) => {
  try {
    const { image, folder } = req.body;
    if (!image) return res.status(400).json({ success: false, message: '缺少圖片資料' });

    const base64String = image.replace(/^data:image\/\w+;base64,/, '');
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, '-');
    const safeFolder = (folder || 'unknown').replace(/[\\/:*?"<>|]/g, '_');
    const filename = `snapshot_${safeFolder}_${ts}.png`;
    const filepath = path.join(SNAPSHOTS_DIR, filename);

    fs.writeFileSync(filepath, Buffer.from(base64String, 'base64'));

    res.json({ success: true, filename });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '儲存截圖失敗' });
  }
});

/**
 * GET /api/snapshots - 列出所有截圖
 */
app.get('/api/snapshots', (req, res) => {
  try {
    if (!fs.existsSync(SNAPSHOTS_DIR)) {
      return res.json({ success: true, data: [] });
    }
    const files = fs.readdirSync(SNAPSHOTS_DIR)
      .filter(f => f.endsWith('.png'))
      .map(f => {
        const stats = fs.statSync(path.join(SNAPSHOTS_DIR, f));
        return {
          filename: f,
          url: `/api/files/snapshots/${f}`,
          timestamp: stats.mtime.toISOString()
        };
      });

    // Newest first
    files.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    res.json({ success: true, data: files });
  } catch (err) {
    res.status(500).json({ success: false, message: '讀取紀錄失敗' });
  }
});

/**
 * 靜態文件路由 - 讓前端可以讀取合約資料夾內的簽名圖檔
 */
app.use('/api/files/snapshots', express.static(SNAPSHOTS_DIR));
app.use('/api/files', express.static(CONTRACTS_DIR));

/**
 * 靜態文件路由 - 舊版相容
 */
app.use('/signatures', express.static(path.join(DATA_DIR, 'signatures')));

// 啟動伺服器
const server = app.listen(PORT, () => {
  console.log(`\n✅ 寵物領養簽署系統已啟動！`);
  console.log(`\n📍 本地地址：http://localhost:${PORT}`);
  console.log(`\n📂 合約資料夾：${CONTRACTS_DIR}`);
  console.log(`\n🌐 如需遠程分享，開啟新終端執行：`);
  console.log(`   $ ngrok http ${PORT}\n`);
});
