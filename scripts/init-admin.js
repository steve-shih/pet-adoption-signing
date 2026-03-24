require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pet-adoption';

async function main() {
  await mongoose.connect(MONGODB_URI);
  // Delete potentially corrupted A0001
  await User.deleteOne({ username: { $regex: /^a0001$/i } });

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
  console.log('👤 RE-CREATED A0001 (Clean Version)');
  process.exit(0);
}
main();
