const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Contract = require('../models/Contract');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONTRACTS_DIR = path.join(DATA_DIR, 'contracts');

// MongoDB URI - can be overridden by environment variable
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pet-adoption';

async function migrate() {
    try {
        console.log(`📡正在連線到 MongoDB: ${MONGODB_URI}`);
        await mongoose.connect(MONGODB_URI);
        console.log('✅ MongoDB 連線成功');

        if (!fs.existsSync(CONTRACTS_DIR)) {
            console.log('⚠️數據目錄不存在，結束遷移。');
            return;
        }

        const folders = fs.readdirSync(CONTRACTS_DIR).filter(name => {
            const fullPath = path.join(CONTRACTS_DIR, name);
            return fs.statSync(fullPath).isDirectory();
        });

        console.log(`📦 發現 ${folders.length} 個合約資料夾，開始準備遷移...`);

        let count = 0;
        for (const folder of folders) {
            const contractFile = path.join(CONTRACTS_DIR, folder, 'contract.json');
            if (fs.existsSync(contractFile)) {
                try {
                    const raw = JSON.parse(fs.readFileSync(contractFile, 'utf-8'));

                    // Add folderName to identify uniquely
                    const contractData = {
                        ...raw,
                        folderName: folder,
                        // Ensure timestamp is a Date
                        timestamp: raw.timestamp ? new Date(raw.timestamp) : new Date(),
                        // Ensure boolean fields are really Boolean
                        isProtected: !!raw.isProtected,
                        valid: raw.valid !== false
                    };

                    // Upsert by folderName
                    await Contract.findOneAndUpdate(
                        { folderName: folder },
                        contractData,
                        { upsert: true, new: true }
                    );

                    count++;
                    process.stdout.write(`\r已遷移 ${count}/${folders.length}...`);
                } catch (e) {
                    console.error(`\n❌ 讀取 ${folder} 失敗: ${e.message}`);
                }
            }
        }

        console.log(`\n🎉 遷移完成！總計遷移 ${count} 筆資料。`);
        process.exit(0);
    } catch (err) {
        console.error('\n💥 遷移過程發生錯誤:', err);
        process.exit(1);
    }
}

migrate();
