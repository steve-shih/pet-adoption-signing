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

// --------------------------------------------------------------------------
// 📑 4. 合約與檔案 API
// --------------------------------------------------------------------------

const DATA_DIR = path.join(__dirname, 'data');
const CONTRACTS_DIR = path.join(DATA_DIR, 'contracts');
const SNAPSHOTS_DIR = path.join(DATA_DIR, 'snapshots');

[DATA_DIR, CONTRACTS_DIR, SNAPSHOTS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.get('/api/contracts', auth, async (req, res) => {
  try {
    if (isMongoReady) {
      const query = {};
      if (req.user.role !== 'admin') query.ownerId = req.user._id;
      const contracts = await Contract.find(query).sort({ updatedAt: -1 });
      return res.json({ success: true, data: contracts });
    }
    const folders = fs.readdirSync(CONTRACTS_DIR).filter(f => fs.statSync(path.join(CONTRACTS_DIR, f)).isDirectory());
    const data = folders.map(f => ({ folder: f }));
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: '列表取得失敗' }); }
});

app.get('/api/contracts/:id', auth, async (req, res) => {
  try {
    const id = req.params.id;
    if (isMongoReady) {
      const contract = await Contract.findOne({ folder: id });
      if (!contract) return res.status(404).json({ success: false, message: '合約不存在' });
      if (req.user.role !== 'admin' && String(contract.ownerId) !== String(req.user._id)) {
        return res.status(403).json({ success: false, message: '無存取權限' });
      }
      return res.json({ success: true, data: contract });
    }
    const fPath = path.join(CONTRACTS_DIR, id, 'contract.json');
    if (!fs.existsSync(fPath)) return res.status(404).json({ success: false, message: '檔案不存在' });
    const data = JSON.parse(fs.readFileSync(fPath, 'utf-8'));
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: '讀取失敗' }); }
});

// ... 其他 API (由舊有邏輯轉移)
// 這裡暫時省略其餘部分以維持精簡，主要登入邏輯已經在上面

app.use('/api/files', express.static(CONTRACTS_DIR));
app.use(express.static('public'));

app.listen(PORT, () => {
  console.log(`🚀 伺服器啟動於 http://localhost:${PORT}`);
});
