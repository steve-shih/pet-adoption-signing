require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Contract = require('../models/Contract');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pet-adoption';
const CONTRACTS_DIR = path.join(__dirname, '..', 'data', 'contracts');

const giver = "創養軟體整合工作室";
const rawData2 = `史恆毅
90007-30004-97390｜2026/03/15
90007-30006-13639｜2026/02/23
90007-30010-26691｜2026/02/23
90007-30009-15967｜2025/11/17
90007-30007-16859｜2025/11/03
90007-30004-68487｜2025/09/21


蔡瑞震
90007-30004-30991｜2025/10/07
張菀琳
90007-30007-16883｜2025/10/04`;

async function main() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const lines = rawData2.split('\n');
        const groups = {};
        let currentAdopter = "";

        for (let line of lines) {
            line = line.trim();
            if (!line) continue;
            if (line.includes('｜')) {
                const [chip, date] = line.split('｜');
                if (!groups[currentAdopter]) groups[currentAdopter] = { chips: [], dates: [] };
                groups[currentAdopter].chips.push(chip.trim());
                groups[currentAdopter].dates.push(date.trim());
            } else {
                currentAdopter = line.replace(/（\d+隻）/, "").trim();
            }
        }

        console.log(`✨ Adding ${Object.keys(groups).length} NEW individual active contracts...`);
        for (const [adopter, data] of Object.entries(groups)) {
            const folderName = `${giver}_${adopter}`;
            const contractData = {
                contractType: "送養合約",
                giverName: giver,
                adopterName: adopter,
                catChip: data.chips.join('\n'),
                adoptionDate: Array.from(new Set(data.dates)).join(', '),
                amount: "0元",
                reason: "歷史資料匯入",
                notes: `本合約包含共 ${data.chips.length} 隻貓咪清單`,
                timestamp: new Date(),
                valid: true,
                folderName: folderName
            };

            const contractPath = path.join(CONTRACTS_DIR, folderName);
            if (!fs.existsSync(contractPath)) fs.mkdirSync(contractPath, { recursive: true });
            fs.writeFileSync(path.join(contractPath, 'contract.json'), JSON.stringify(contractData, null, 2));

            await Contract.findOneAndUpdate({ folderName: folderName }, contractData, { upsert: true });
        }

        console.log(`✨ Process complete. Total new active contracts created.`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Re-import failed:', err);
        process.exit(1);
    }
}

main();
