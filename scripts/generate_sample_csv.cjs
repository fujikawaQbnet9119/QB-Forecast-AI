
const fs = require('fs');
const path = require('path');

// Helper to format date YYYY-MM-DD
function formatDate(year, month, day = 1) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Helper to generate a random normal distribution
function randn_bm() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

const regions = ['関東', '関西', '中部', '九州', '東北'];
const prefs = {
    '関東': ['東京都', '神奈川県', '埼玉県', '千葉県'],
    '関西': ['大阪府', '京都府', '兵庫県'],
    '中部': ['愛知県', '静岡県'],
    '九州': ['福岡県'],
    '東北': ['宮城県']
};

const storeTypes = [
    { type: 'anchor', count: 12, startYear: 2018, baseSales: 3000000, growth: 1.05 },
    { type: 'growth', count: 6, startYear: 2022, baseSales: 1500000, growth: 1.2 },
    { type: 'startup', count: 6, startYear: 2023, baseSales: 1000000, growth: 1.5 }
];

const seasonFactors = [0.9, 0.9, 1.1, 1.0, 1.0, 0.95, 1.0, 1.05, 0.9, 1.0, 0.95, 1.2]; // Jan - Dec
const covidShock = 0.6; // April 2020 drop to 60%
const covidRecovery = [0.6, 0.65, 0.75, 0.8, 0.85, 0.9, 0.92, 0.94, 0.95, 0.96, 0.97, 0.98]; // Apr 2020 - Mar 2021

const stores = [];

storeTypes.forEach(st => {
    for (let i = 0; i < st.count; i++) {
        const region = regions[Math.floor(Math.random() * regions.length)];
        const pref = prefs[region][Math.floor(Math.random() * prefs[region].length)];
        const block = `${region}ブロック`;
        const name = `${st.type === 'anchor' ? 'QB' : st.type === 'growth' ? 'QB Premium' : 'QB Shell'} ${pref} ${st.type}_${i+1}号店`;

        // Random start month
        let startMonth = Math.floor(Math.random() * 12) + 1;
        let startYear = st.startYear;
        if (st.type === 'startup') {
            startMonth = Math.floor(Math.random() * 6) + 1; // H1 2023
        }

        let currentDate = new Date(startYear, startMonth - 1, 1);
        const endDate = new Date(2023, 11, 1); // Until Dec 2023

        let base = st.baseSales * (0.8 + Math.random() * 0.4); // Randomize base
        let currentLevel = base;

        while (currentDate <= endDate) {
            const y = currentDate.getFullYear();
            const m = currentDate.getMonth(); // 0-11

            // Apply Growth
            if (st.type === 'growth' || st.type === 'startup') {
                // Logistic-like growth ramp up
                const age = (currentDate.getTime() - new Date(startYear, startMonth-1, 1).getTime()) / (1000 * 60 * 60 * 24 * 30);
                const maxLevel = base * 2.0;
                const k = 0.1;
                const t0 = 12;
                currentLevel = base + (maxLevel - base) / (1 + Math.exp(-k * (age - t0)));
            } else {
                // Steady slow growth
                currentLevel *= 1.001;
            }

            // Apply Seasonality
            let val = currentLevel * seasonFactors[m];

            // Apply COVID Shock (for Anchors active in 2020)
            if (y === 2020 && m >= 3) { // From April
                 const covidIdx = m - 3;
                 if (covidIdx < covidRecovery.length) {
                     val *= covidRecovery[covidIdx];
                 }
            } else if (y === 2021 && m < 3) { // Jan-Mar 2021 (residue)
                 val *= 0.98;
            }

            // Random Noise
            val *= (1 + randn_bm() * 0.05);

            stores.push({
                region,
                prefecture: pref,
                block,
                storeName: name,
                date: formatDate(y, m + 1),
                value: Math.round(val)
            });

            currentDate.setMonth(currentDate.getMonth() + 1);
        }
    }
});

// CSV Header
let csvContent = "Region,Prefecture,Block,StoreName,Date,Value\n";
stores.forEach(row => {
    csvContent += `${row.region},${row.prefecture},${row.block},${row.storeName},${row.date},${row.value}\n`;
});

const outDir = path.join(__dirname, '../public');
if (!fs.existsSync(outDir)){
    fs.mkdirSync(outDir);
}

fs.writeFileSync(path.join(outDir, 'sample_data.csv'), csvContent);
console.log(`Generated sample_data.csv with ${stores.length} rows.`);
