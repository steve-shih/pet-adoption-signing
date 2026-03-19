require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Snapshot = require('../models/Snapshot');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pet-adoption';
const SNAPSHOTS_DIR = path.join(__dirname, '..', 'data', 'snapshots');

async function migrate() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        if (!fs.existsSync(SNAPSHOTS_DIR)) {
            console.log('❌ Snapshots directory does not exist.');
            process.exit(0);
        }

        const files = fs.readdirSync(SNAPSHOTS_DIR).filter(f => f.endsWith('.png'));
        console.log(`🔍 Found ${files.length} existing snapshots. Checking for missing DB records...`);

        let count = 0;
        for (const file of files) {
            const exists = await Snapshot.findOne({ filename: file });
            if (!exists) {
                const stats = fs.statSync(path.join(SNAPSHOTS_DIR, file));
                
                // Try to extract folder name from filename format: snapshot_FOLDER_TS.png
                let folderName = 'unknown';
                const match = file.match(/^snapshot_(.*?)_\d{4}-\d{2}-\d{2}/);
                if (match && match[1]) {
                    folderName = match[1];
                }

                await new Snapshot({
                    folderName: folderName,
                    filename: file,
                    localPath: path.join(SNAPSHOTS_DIR, file),
                    timestamp: stats.mtime
                }).save();
                count++;
            }
        }

        console.log(`✨ Migration complete. Added ${count} records.`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

migrate();
