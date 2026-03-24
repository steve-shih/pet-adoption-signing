const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true }, // 如 A0001
  password: { type: String, required: true }, // Base64 密碼
  fullName: { type: String, required: true }, // 如 創養軟體整合工作室
  phone: { type: String },
  email: { type: String },
  address: { type: String },
  role: { type: String, default: 'user' }, // admin, user
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
