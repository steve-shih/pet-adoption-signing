require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Contract = require('../models/Contract');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pet-adoption';
const CONTRACTS_DIR = path.join(__dirname, '..', 'data', 'contracts');

const giver = "創養軟體整合工作室";
const rawData = `寵喵貓舍
90007-30007-16885｜2025/08/24
90007-30007-16883｜2025/08/24
90007-30007-16869｜2025/08/24
90007-30007-16859｜2025/08/24
90007-30004-68487｜2025/08/19
90007-30004-30991｜2025/08/19
99200-73000-89867｜2025/08/09
90007-30007-16899｜2025/08/09
90007-30007-16896｜2025/08/09
90007-30007-16892｜2025/08/09
90007-30007-16891｜2025/08/09
90007-30007-16889｜2025/08/09
90007-30007-16876｜2025/08/09
90007-30007-16875｜2025/08/09
90007-30007-16861｜2025/08/09
90007-30007-16866｜2025/08/09
90007-30007-16867｜2025/08/03
90007-30007-16881｜2025/08/03
90007-30007-16877｜2025/08/03
90007-30007-16860｜2025/08/03
豹貓星球貓舍
90007-30010-26680｜2026/02/23
90007-30010-26690｜2026/02/23
90007-30010-26673｜2026/02/23
90007-30010-26692｜2026/01/25
90007-30010-26660｜2026/01/25
90007-30010-26694｜2026/01/21
90007-30010-26679｜2026/01/21
90007-30007-16874｜2025/11/17
喜得貓社
90007-30010-26678｜2026/02/20
90007-30010-26685｜2026/02/20
90007-30010-26676｜2026/02/20
90007-30009-15967｜2025/11/09
心寵兒企業社
90007-30007-16865｜2026/02/23
90007-30010-26686｜2026/02/23
90007-30010-26689｜2026/02/20
愛玩家犬貓寵物社
90007-30009-15951｜2025/08/09
90007-30007-16854｜2025/08/08
90007-30007-16868｜2025/06/07
90007-30007-16863｜2025/06/07
一生一世寵物生活館
90007-30007-16866｜2025/09/13
90007-30007-16851｜2025/06/20`;

async function main() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const lines = rawData.split('\n');
        const groups = {};
        let currentAdopter = "";

        // First pass: Recreate the 41 separate ones but mark as DELETED
        console.log("♻️ Recreating 41 separate contracts as DELETED (Soft Delete)...");
        for (let line of lines) {
            line = line.trim();
            if (!line) continue;
            if (line.includes('｜')) {
                const [chip, date] = line.split('｜');
                const cleanDate = date.trim().replace(/\//g, '');
                const shortChip = chip.split('-').pop();
                const folderName = `${giver}_${currentAdopter}_${cleanDate}_${shortChip}`;
                
                const contractData = {
                    contractType: "送養合約",
                    giverName: giver,
                    adopterName: currentAdopter,
                    catChip: chip.trim(),
                    adoptionDate: date.trim(),
                    amount: "0元",
                    reason: "歷史資料匯入_單獨版",
                    timestamp: new Date(),
                    valid: false, // MARKED DELETED
                    deletedAt: new Date(),
                    folderName: folderName
                };

                const contractPath = path.join(CONTRACTS_DIR, folderName);
                if (!fs.existsSync(contractPath)) fs.mkdirSync(contractPath, { recursive: true });
                fs.writeFileSync(path.join(contractPath, 'contract.json'), JSON.stringify(contractData, null, 2));

                await Contract.findOneAndUpdate({ folderName: folderName }, contractData, { upsert: true });

                // Accumulate for consolidated
                if (!groups[currentAdopter]) groups[currentAdopter] = { chips: [], dates: [] };
                groups[currentAdopter].chips.push(chip.trim());
                groups[currentAdopter].dates.push(date.trim());
            } else {
                currentAdopter = line.replace(/（\d+隻）/, "").trim();
            }
        }

        // Second pass: Create/Update the 6 consolidated ones as ACTIVE
        console.log("✨ Creating 6 consolidated contracts as ACTIVE...");
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
                valid: true, // ACTIVE
                folderName: folderName
            };

            const contractPath = path.join(CONTRACTS_DIR, folderName);
            if (!fs.existsSync(contractPath)) fs.mkdirSync(contractPath, { recursive: true });
            fs.writeFileSync(path.join(contractPath, 'contract.json'), JSON.stringify(contractData, null, 2));

            await Contract.findOneAndUpdate({ folderName: folderName }, contractData, { upsert: true });
        }

        console.log(`✨ Process complete. 41 marked as deleted, 6 marked as active.`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Soft delete migration failed:', err);
        process.exit(1);
    }
}

main();
