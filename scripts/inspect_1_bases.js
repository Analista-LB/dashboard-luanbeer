const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');

const basesDir = path.join(__dirname, '..', '1. Bases');
const files = fs.readdirSync(basesDir).filter(f => /\.(xlsx|xls|xlsb|csv)$/i.test(f));

const summary = [];

for (const file of files) {
  const fullPath = path.join(basesDir, file);
  const stat = fs.statSync(fullPath);
  console.log(`\n================================================================`);
  console.log(`FILE: ${file} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
  try {
    // For huge files (>15MB), first inspect sheet names and first 15 rows using sheetRows: 15
    const isHuge = stat.size > 15 * 1024 * 1024;
    const buf = fs.readFileSync(fullPath);
    const wb = XLSX.read(buf, isHuge ? { type: 'buffer', sheetRows: 25 } : { type: 'buffer' });
    console.log(`Sheets (${wb.SheetNames.length}): ${wb.SheetNames.join(', ')}`);
    const fileInfo = { file, sizeBytes: stat.size, isHugeSample: isHuge, sheets: [] };
    for (const sName of wb.SheetNames) {
      const ws = wb.Sheets[sName];
      const ref = ws['!ref'] || 'EMPTY';
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      // Find first non-empty rows
      const nonEmpty = [];
      for (let r = 0; r < Math.min(rows.length, 12); r++) {
        const row = rows[r];
        if (row && row.some(c => c !== null && c !== '')) {
          nonEmpty.push({ rowIndex: r, values: row.slice(0, 25) });
        }
      }
      console.log(`  Sheet [${sName}] ref=${ref} loadedRows=${rows.length}`);
      if (nonEmpty.length > 0) {
        console.log(`    Row ${nonEmpty[0].rowIndex} (cols=${rows[nonEmpty[0].rowIndex].length}):`, JSON.stringify(nonEmpty[0].values.slice(0, 15)));
      }
      if (nonEmpty.length > 1) {
        console.log(`    Row ${nonEmpty[1].rowIndex}:`, JSON.stringify(nonEmpty[1].values.slice(0, 15)));
      }
      if (nonEmpty.length > 2) {
        console.log(`    Row ${nonEmpty[2].rowIndex}:`, JSON.stringify(nonEmpty[2].values.slice(0, 15)));
      }
      fileInfo.sheets.push({
        sheetName: sName,
        ref,
        loadedRows: rows.length,
        colCount: nonEmpty[0] ? rows[nonEmpty[0].rowIndex].length : 0,
        sampleRows: nonEmpty.slice(0, 4)
      });
    }
    summary.push(fileInfo);
  } catch (err) {
    console.error(`  ERROR reading ${file}:`, err.message);
    summary.push({ file, error: err.message });
  }
}

fs.writeFileSync(path.join(__dirname, '..', 'docs', 'inspeccion_1_bases_raw.json'), JSON.stringify(summary, null, 2));
console.log('\nSaved docs/inspeccion_1_bases_raw.json');
