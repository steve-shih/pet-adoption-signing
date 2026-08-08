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
const LoginHistory = require('./models/LoginHistory');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// 動態切換 MongoDB 連線字串
let MONGODB_URI;
if (process.env.NODE_ENV === 'production') {
  // Kubernetes/正式環境直接讀取注入的變數
  MONGODB_URI = process.env.MONGODB_URI;
} else if (process.env.USE_ATLAS === 'true') {
  MONGODB_URI = process.env.ATLAS_MONGODB_URI;
  console.log('☁️  [環境切換] 將連線至雲端 MongoDB Atlas...');
} else {
  MONGODB_URI = process.env.LOCAL_MONGODB_URI || 'mongodb://127.0.0.1:27017/pet-adoption';
  console.log('💻  [環境切換] 將連線至本機 Local MongoDB...');
}

// --------------------------------------------------------------------------
// 🛠️ 1. 基礎配置與解析器 (優先級最高)
// --------------------------------------------------------------------------
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(fileUpload());

// 全局請求日誌 (診斷用)
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

let isMongoReady = false;

// 🔐 Auth Middleware
async function auth(req, res, next) {
  if (!isMongoReady) {
    req.user = { _id: '000000000000000000000000', role: 'admin', fullName: '開發模式' };
    return next();
  }
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ success: false, message: '請登入' });
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(401).json({ success: false, message: '請重新登入' });
    req.user = user;
    next();
  } catch (e) { res.status(401).json({ success: false, message: '驗證失敗' }); }
}

// --------------------------------------------------------------------------
// 👤 2. 資料庫與預設帳號初始化
// --------------------------------------------------------------------------
async function initDefaultUser() {
  if (!isMongoReady) return;
  try {
    const exists = await User.findOne({ username: 'A0001' });
    if (!exists) {
      const newUser = new User({
        username: 'A0001',
        password: Buffer.from('steve91218457').toString('base64'),
        fullName: '創養軟體整合工作室',
        role: 'admin'
      });
      await newUser.save();
      console.log('👤 [INIT] 管理員帳號 A0001 已就緒');
    }
  } catch (e) { console.error('初始化帳號失敗:', e); }
}

mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => {
    isMongoReady = true;
    console.log('✅ MongoDB 連線成功');
    initDefaultUser();
  })
  .catch(err => {
    isMongoReady = false;
    console.warn('⚠️ MongoDB 失敗 (本地模式):', err.message);
  });

// --------------------------------------------------------------------------
// 🔐 3. Auth API (不應被靜態檔案擋住)
// --------------------------------------------------------------------------

app.post('/api/auth/login', async (req, res) => {
  console.log('>>> 嘗試登入處理中...');
  try {
    if (!isMongoReady) return res.status(503).json({ success: false, message: '資料庫未連接' });
    let { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: '遺漏帳密' });

    username = username.trim();
    password = password.trim();

    const user = await User.findOne({ 
      username: { $regex: new RegExp('^' + username + '$', 'i') } 
    });

    if (!user || user.password !== Buffer.from(password).toString('base64')) {
      console.warn('>>> 登入失敗: 帳號或密碼不符');
      return res.status(400).json({ success: false, message: '帳號或密碼錯誤' });
    }
    
    console.log(`>>> 登入成功: ${user.username}`);
    res.json({ success: true, user: { 
      id: user._id, 
      fullName: user.fullName, 
      role: user.role,
      defaultContractPassword: user.defaultContractPassword || '00000'
    } });

    // 📍 登入紀錄 (背景非同步執行，不阻擋回應)
    (async () => {
      try {
        let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (ip && ip.includes(',')) ip = ip.split(',')[0];
        if (ip && ip.includes('::ffff:')) ip = ip.replace('::ffff:', '');
        
        let location = '未知的地點';
        // 判斷是否為本地
        if (ip === '::1' || ip === '127.0.0.1') {
          location = '本機 (Localhost)';
        } else if (ip) {
          try {
            const locResp = await fetch(`http://ip-api.com/json/${ip}?lang=zh-TW`);
            const locData = await locResp.json();
            if (locData.status === 'success') location = `${locData.country} ${locData.city}`;
          } catch(e) {}
        }
        await new LoginHistory({ userId: user._id, ip, location }).save();
      } catch (err) { console.error('紀錄登入歷史失敗:', err); }
    })();

  } catch (e) { 
    console.error('>>> 登入異常ERR:', e);
    res.status(500).json({ success: false, message: '登入失敗' }); 
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    if (!isMongoReady) return res.status(503).json({ success: false, message: '資料庫連線失敗' });
    const { username, password, fullName, phone, email, address } = req.body;
    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ success: false, message: '帳號已存在' });

    const newUser = new User({
      username, password: Buffer.from(password).toString('base64'),
      fullName, phone, email, address
    });
    await newUser.save();
    res.json({ success: true, message: '註冊成功' });
  } catch (e) { res.status(500).json({ success: false, message: '註冊失敗' }); }
});

app.get('/api/auth/profile', auth, (req, res) => {
  res.json({ success: true, user: req.user });
});

app.put('/api/auth/profile', auth, async (req, res) => {
  try {
    const { password, fullName, phone, email, address, defaultContractPassword } = req.body;
    const updates = { fullName, phone, email, address };
    if (password) updates.password = Buffer.from(password).toString('base64');
    if (defaultContractPassword !== undefined) updates.defaultContractPassword = defaultContractPassword;
    await User.findByIdAndUpdate(req.user._id, updates);
    res.json({ success: true, message: '更新成功' });
  } catch (e) { res.status(500).json({ success: false, message: '更新失敗' }); }
});

app.get('/api/auth/login-history', auth, async (req, res) => {
  try {
    if (!isMongoReady) return res.json({ success: true, history: [] });
    const history = await LoginHistory.find({ userId: req.user._id }).sort({ timestamp: -1 }).limit(20);
    res.json({ success: true, history });
  } catch (err) { res.status(500).json({ success: false, message: '讀取紀錄失敗' }); }
});


// --------------------------------------------------------------------------
// 📑 4. 合約與檔案 API
// --------------------------------------------------------------------------

const DATA_DIR = path.join(__dirname, 'data');
const CONTRACTS_DIR = path.join(DATA_DIR, 'contracts');
const SNAPSHOTS_DIR = path.join(DATA_DIR, 'snapshots');

[DATA_DIR, CONTRACTS_DIR, SNAPSHOTS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

/**
 * GET /api/contracts - 讀取列表 (支援 DB/Local 混合轉發)
 */
app.get('/api/contracts', auth, async (req, res) => {
  try {
    if (isMongoReady) {
      const query = {};
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
