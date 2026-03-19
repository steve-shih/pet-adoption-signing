const mongoose = require('mongoose');

const contractSchema = new mongoose.Schema({
    folderName: { type: String, unique: true }, // The original folder name like '{Name}_{Name}_{Date}'
    contractType: String,
    isProtected: Boolean,
    contractPassword: String,
    giverName: String,
    giverId: String,
    adopterName: String,
    adopterId: String,
    petBreed: String,
    catChip: String,
    adoptionDate: String,
    amount: String,
    reason: String,
    notes: String,
    giverSignatureDataUrl: String, // Base64 stored for now
    adopterSignatureDataUrl: String, // Base64 stored for now
    valid: { type: Boolean, default: true },
    timestamp: { type: Date, default: Date.now },
    deletedAt: Date
});

module.exports = mongoose.model('Contract', contractSchema);
