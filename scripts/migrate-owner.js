require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Contract = require('../models/Contract');
const Snapshot = require('../models/Snapshot');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pet-adoption';

async function main() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const admin = await User.findOne({ username: 'A0001' });
    if (!admin) {
      console.error('❌ 找不到 A0001 帳號，請先啟動一次伺服器以完成初始化。');
      process.exit(1);
    }

    console.log(`🔗 Assigning all existing contracts and snapshots to user: ${admin.fullName} (${admin._id})`);

    const cResult = await Contract.updateMany(
      { ownerId: { $exists: false } },
      { $set: { ownerId: admin._id } }
    );
    console.log(`✅ Updated ${cResult.modifiedCount} contracts.`);

    const sResult = await Snapshot.updateMany(
      { ownerId: { $exists: false } },
      { $set: { ownerId: admin._id } }
    );
    console.log(`✅ Updated ${sResult.modifiedCount} snapshots.`);

    console.log('✨ All old data has been assigned to A0001.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

main();
