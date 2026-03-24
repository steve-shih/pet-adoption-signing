require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pet-adoption';

async function main() {
  await mongoose.connect(MONGODB_URI);
  const user = await User.findOne({ username: 'A0001' });
  if (user) {
    console.log(`Found A0001: ID=${user._id}, Role=${user.role}, Pass=${user.password}`);
  } else {
    console.log('A0001 NOT FOUND');
  }
  process.exit(0);
}
main();
