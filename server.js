require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Contract = require('./models/Contract');
const Snapshot = require('./models/Snapshot');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pet-adoption';

// 🛠️ 基礎中間件 (必須放在最前面)
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(fileUpload());

let isMongoReady = false;

// 🔐 Auth Middleware (基於 Header 的簡單驗證，方便前端介接)
async function auth(req, res, next) {
  if (!isMongoReady) {
    // 若無 DB 模式，暫時跳過驗證 (僅限開發)
    req.user = { _id: '000000000000000000000000', role: 'admin', fullName: '開發者' };
    return next();
  }
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ success: false, message: '請登入後再操作' });
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(401).json({ success: false, message: '連線逾時，請重新登入' });
    req.user = user;
    next();
  } catch (e) { res.status(401).json({ success: false, message: '驗證失敗' }); }
}

// 👤 初始化預設帳號 A0001
async function initDefaultUser() {
  if (!isMongoReady) return;
  try {
    const exists = await User.findOne({ username: 'A0001' });
    if (!exists) {
      const newUser = new User({
        username: 'A0001',
        password: Buffer.from('steve91218457').toString('base64'),
        fullName: '創養軟體整合工作室',
        role: 'admin',
        phone: '0900000000',
        email: 'steve@example.com',
        address: '台灣'
      });
      await newUser.save();
      console.log('👤 初始帳號已就緒：A0001 / steve91218457');
    }
  } catch (e) { console.error('初始化帳號失敗:', e); }
}

// Connect to MongoDB (With Fallback Support)
mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => {
    isMongoReady = true;
    console.log('✅ MongoDB 連線成功 (切換至資料庫模式)');
    initDefaultUser();
  })
  .catch(err => {
    isMongoReady = false;
    console.warn('⚠️ MongoDB 連線失敗 (切換至本地模式)：', err.message);
  });

// --------------------------------------------------------------------------
// 🔐 Auth API (MUST be before static files to avoid conflicts)
// --------------------------------------------------------------------------

// 登入
app.post('/api/auth/login', async (req, res) => {
  console.log(`[AUTH] 收到登入請求: ${req.body ? req.body.username : '無資料'}`);
  try {
    if (!isMongoReady) return res.status(503).json({ success: false, message: '資料庫未連接' });
    let { username, password } = req.body;
    if (username) username = username.trim();
    if (password) password = password.trim();
    
    const user = await User.findOne({ 
      username: { $regex: new RegExp('^' + username + '$', 'i') } 
    });

    if (!user || user.password !== Buffer.from(password).toString('base64')) {
      return res.status(400).json({ success: false, message: '帳號或密碼錯誤（提示：請檢查大小寫與有無空格）' });
    }
    
    console.log(`[AUTH] 登入成功: ${user.username}`);
    res.json({ success: true, user: { id: user._id, fullName: user.fullName, role: user.role } });
  } catch (e) { 
    console.error('[AUTH] 登入異常Error:', e);
    res.status(500).json({ success: false, message: '登入失敗' }); 
  }
});

// 註冊
app.post('/api/auth/register', async (req, res) => {
  try {
    if (!isMongoReady) return res.status(503).json({ success: false, message: '離線模式不支援帳號管理' });
    const { username, password, fullName, phone, email, address } = req.body;
    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ success: false, message: '此帳號已存在' });

    const newUser = new User({
      username,
      password: Buffer.from(password).toString('base64'),
      fullName, phone, email, address
    });
    await newUser.save();
    res.json({ success: true, message: '註冊成功！' });
  } catch (e) { res.status(500).json({ success: false, message: '註冊系統異常' }); }
});

// 靜態檔案
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
    initDefaultUser(); // 啟動並檢查預設帳號
  })
  .catch(err => {
    isMongoReady = false;
    console.warn('⚠️ MongoDB 連線失敗 (切換至本地檔案模式)：', err.message);
  });

// --------------------------------------------------------------------------
// 🔐 Auth API 
// --------------------------------------------------------------------------

// 註冊
app.post('/api/auth/register', async (req, res) => {
  try {
    if (!isMongoReady) return res.status(503).json({ success: false, message: '離線模式不支援帳號管理' });
    const { username, password, fullName, phone, email, address } = req.body;
    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ success: false, message: '此帳號已存在' });

    const newUser = new User({
      username,
      password: Buffer.from(password).toString('base64'),
      fullName, phone, email, address
    });
    await newUser.save();
    res.json({ success: true, message: '註冊成功！' });
  } catch (e) { res.status(500).json({ success: false, message: '註冊系統異常' }); }
});

// 登入
app.post('/api/auth/login', async (req, res) => {
  try {
    if (!isMongoReady) return res.status(503).json({ success: false, message: '資料庫未連接' });
    let { username, password } = req.body;
    if (username) username = username.trim();
    if (password) password = password.trim();
    
    // 使用不區分大小寫的搜尋方式尋找帳號
    const user = await User.findOne({ 
      username: { $regex: new RegExp('^' + username + '$', 'i') } 
    });

    if (!user || user.password !== Buffer.from(password).toString('base64')) {
      return res.status(400).json({ success: false, message: '帳號或密碼錯誤（提示：請檢查大小寫與有無空格）' });
    }
    // 返回基本資訊 (包含權限與用戶 ID)
    res.json({ success: true, user: { id: user._id, fullName: user.fullName, role: user.role } });
  } catch (e) { res.status(500).json({ success: false, message: '登入失敗' }); }
});

// 查看個人資料
app.get('/api/auth/profile', auth, (req, res) => {
  res.json({ success: true, user: req.user });
});

// 修改個人資料
app.put('/api/auth/profile', auth, async (req, res) => {
  try {
    const { password, fullName, phone, email, address } = req.body;
    const updates = { fullName, phone, email, address };
    if (password) updates.password = Buffer.from(password).toString('base64');
    
    await User.findByIdAndUpdate(req.user._id, updates);
    res.json({ success: true, message: '資訊已更新' });
  } catch (e) { res.status(500).json({ success: false, message: '更新失敗' }); }
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
app.get('/api/contracts', auth, async (req, res) => {
  try {
    if (isMongoReady) {
      const query = { valid: true };
      // 管理員可以看到全部，一般用戶只能看到自己的
      if (req.user.role !== 'admin') {
        query.ownerId = req.user._id;
      }

      const contracts = await Contract.find(query)
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

    // Fallback: 純檔案讀取 (本地模式暫不支援深入隔離)
    const folders = fs.readdirSync(CONTRACTS_DIR)
      .filter(f => fs.statSync(path.join(CONTRACTS_DIR, f)).isDirectory());

    const data = folders.map(f => {
      try {
        const jsonPath = path.join(CONTRACTS_DIR, f, 'contract.json');
        if (!fs.existsSync(jsonPath)) return null;
        const info = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (info.valid === false) return null;
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
    res.status(500).json({ success: false, message: '讀取列表失敗' });
  }
});

/**
 * GET /api/contracts/:folder - 讀取指定合約
 */
app.get('/api/contracts/:folder', auth, async (req, res) => {
  try {
    const folderName = req.params.folder;
    if (isMongoReady) {
      const query = { folderName };
      if (req.user.role !== 'admin') query.ownerId = req.user._id;
      
      const contract = await Contract.findOne(query);
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
app.post('/api/contracts', auth, async (req, res) => {
  try {
    const formData = req.body || {};
    formData.ownerId = req.user._id; // 綁定擁有者
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

    // 1. 備份到本地檔案系統
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

    res.json({ success: true, message: isMongoReady ? '新合約已建立 (MongoDB)' : '新合約已建立 (本地模式)', folder: folderName });
  } catch (err) {
    console.error('建立失敗:', err);
    res.status(500).json({ success: false, message: '建立失敗' });
  }
});

/**
 * PUT /api/contracts/:folder - 更新合約
 */
app.put('/api/contracts/:folder', auth, async (req, res) => {
  try {
    const folder = req.params.folder;
    const formData = req.body;
    formData.timestamp = new Date();

    // 1. 更新 MongoDB (先做，因為有權限校驗)
    if (isMongoReady) {
      const query = { folderName: folder };
      if (req.user.role !== 'admin') query.ownerId = req.user._id;

      const contract = await Contract.findOneAndUpdate(
        query,
        { $set: formData },
        { new: true }
      );
      if (!contract) return res.status(404).json({ success: false, message: '找不到合約或無編輯權限' });
    }

    // 2. 更新本地檔案
    const jsonPath = path.join(CONTRACTS_DIR, folder, 'contract.json');
    if (fs.existsSync(jsonPath)) {
      const currentData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      const updatedData = { ...currentData, ...formData };
      fs.writeFileSync(jsonPath, JSON.stringify(updatedData, null, 2));
    }

    if (formData.giverSignatureDataUrl) saveSignatureToLocal(folder, formData.giverSignatureDataUrl, 'signature_donor.png');
    if (formData.adopterSignatureDataUrl) saveSignatureToLocal(folder, formData.adopterSignatureDataUrl, 'signature_adopter.png');

    res.json({ success: true, message: '合約已更新', folder });
  } catch (err) {
    console.error('更新失敗:', err);
    res.status(500).json({ success: false, message: '更新失敗' });
  }
});

/**
 * POST /api/contracts/:folder/rename - 重命名合約 (改名連結 ID)
 */
app.post('/api/contracts/:folder/rename', auth, async (req, res) => {
  try {
    const oldName = req.params.folder;
    const { newName: rawNewName } = req.body;
    if (!rawNewName) return res.status(400).json({ success: false, message: '缺少新名稱' });

    // 1. 檢查舊合約權限
    if (isMongoReady) {
      const query = { folderName: oldName };
      if (req.user.role !== 'admin') query.ownerId = req.user._id;
      const contract = await Contract.findOne(query);
      if (!contract) return res.status(404).json({ success: false, message: '找不到合約或無重命名權限' });
    }

    const newName = rawNewName.replace(/[\\/:*?"<>|]/g, '_');
    const oldDirPath = path.join(CONTRACTS_DIR, oldName);
    const newDirPath = path.join(CONTRACTS_DIR, newName);
    
    if (isMongoReady) {
      const exists = await Contract.findOne({ folderName: newName });
      if (exists) return res.status(400).json({ success: false, message: '此名稱已存在' });
    }
    if (fs.existsSync(newDirPath)) return res.status(400).json({ success: false, message: '路徑已存在' });

    // 2. 更新 MongoDB
    if (isMongoReady) {
      await Contract.findOneAndUpdate({ folderName: oldName }, { folderName: newName });
      await Snapshot.updateMany({ folderName: oldName }, { folderName: newName });
    }

    // 3. 實體改名
    if (fs.existsSync(oldDirPath)) {
      fs.renameSync(oldDirPath, newDirPath);
      const jsonPath = path.join(newDirPath, 'contract.json');
      if (fs.existsSync(jsonPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
          data.folderName = newName;
          fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
        } catch (e) {}
      }
    }

    res.json({ success: true, message: '合約已更名', folder: newName });
  } catch (err) {
    res.status(500).json({ success: false, message: '重命名失敗' });
  }
});

/**
 * DELETE /api/contracts/:folder - 軟刪除
 */
app.delete('/api/contracts/:folder', auth, async (req, res) => {
  try {
    const folder = req.params.folder;
    const now = new Date();

    // 1. MongoDB 軟刪除 (先檢查權限)
    if (isMongoReady) {
      const query = { folderName: folder };
      if (req.user.role !== 'admin') query.ownerId = req.user._id;
      const contract = await Contract.findOneAndUpdate(
        query,
        { $set: { valid: false, deletedAt: now } }
      );
      if (!contract) return res.status(404).json({ success: false, message: '找不到合約或無刪除權限' });
    }

    // 2. 本地軟刪除
    const jsonPath = path.join(CONTRACTS_DIR, folder, 'contract.json');
    if (fs.existsSync(jsonPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        data.valid = false;
        data.deletedAt = now;
        fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
      } catch (e) {}
    }

    res.json({ success: true, message: '合約已標記為刪除' });
  } catch (err) {
    res.status(500).json({ success: false, message: '刪除失敗' });
  }
});

/**
 * POST /api/snapshots - 儲存截圖
 */
app.post('/api/snapshots', auth, async (req, res) => {
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
        ownerId: req.user._id,
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
app.get('/api/snapshots', auth, async (req, res) => {
  try {
    if (isMongoReady) {
      const query = {};
      if (req.user.role !== 'admin') query.ownerId = req.user._id;

      const snapshots = await Snapshot.find(query).sort({ timestamp: -1 });
      const data = snapshots.map(s => ({
        id: s._id,
        filename: s.filename,
        url: `/api/files/snapshots/${s.filename}`,
        timestamp: s.timestamp.toISOString(),
        folder: s.folderName
      }));
      return res.json({ success: true, data, mode: 'mongodb' });
    }

    // Fallback: 掃描硬碟 (本地模式暫不支援深入隔離)
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
