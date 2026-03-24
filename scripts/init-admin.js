require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pet-adoption';

async function main() {
  await mongoose.connect(MONGODB_URI);
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
    console.log('👤 Created A0001');
  } else {
    console.log('👤 A0001 already exists');
  }
  process.exit(0);
}
main();
