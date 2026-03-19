const mongoose = require('mongoose');

const snapshotSchema = new mongoose.Schema({
    folderName: { type: String, required: true }, // 對應的合約名稱 (giver_adopter_ts)
    filename: { type: String, required: true },   // 本地檔名
    localPath: String,                            // 本地完整路徑 (備用)
    cloudUrl: String,                             // 未來用於存放線上網址
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Snapshot', snapshotSchema);
