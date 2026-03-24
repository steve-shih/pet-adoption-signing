const mongoose = require('mongoose');

const LoginHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  timestamp: { type: Date, default: Date.now },
  ip: { type: String },
  location: { type: String, default: '查詢中...' }
});

module.exports = mongoose.model('LoginHistory', LoginHistorySchema);
