const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');

const workspaceDir = path.resolve(__dirname, '..');
const files = fs.readdirSync(workspaceDir)
  .filter(f => f.endsWith('.xlsx') || f.endsWith('.xls') || f.endsWith('.csv'))
  .sort();

console.log(`Found ${files.length} source files in workspace:`);
files.forEach((f, idx) => {
  const stat = fs.statSync(path.join(workspaceDir, f));
  console.log(`  ${idx + 1}. ${f} (${(stat.size / 1024).toFixed(1)} KB)`);
});

const report = [];

for (const file of files) {
  const fullPath = path.join(workspaceDir, file);
  const stat = fs.statSync(fullPath);
  console.log(`\n======================================================`);
  console.log(`INSPECTING: ${file} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
  const t0 = Date.now();
  try {
    const buf = fs.readFileSync(fullPath);
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
    console.log(`Read in ${Date.now() - t0}ms. Sheets: ${JSON.stringify(wb.SheetNames)}`);
    const fileInfo = {
      fileName: file,
      sizeBytes: stat.size,
      category: file.startsWith('(Fijo)') ? 'Fijo' : (file.startsWith('(Actualizar)') ? 'Actualizar' : 'Otro'),
      sheets: []
    };

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const ref = ws['!ref'] || 'A1:A1';
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
      console.log(`  Sheet "${sheetName}" | ref: ${ref} | total rows: ${rows.length}`);

      // Print first 8 non-empty rows to identify headers
      let printed = 0;
      let headerRowIdx = 0;
      let maxNonEmptyCols = 0;
      for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const r = rows[i] || [];
        const nonEmpty = r.filter(c => c !== null && c !== undefined && String(c).trim() !== '').length;
        if (nonEmpty > maxNonEmptyCols) {
          maxNonEmptyCols = nonEmpty;
          headerRowIdx = i;
        }
        if (nonEmpty > 0 && printed < 5) {
          console.log(`    Row[${i}] (${nonEmpty} cols):`, JSON.stringify(r.slice(0, 15)));
          printed++;
        }
      }

      // Check last 3 rows for totals
      for (let i = Math.max(headerRowIdx + 1, rows.length - 3); i < rows.length; i++) {
        const r = rows[i] || [];
        const nonEmpty = r.filter(c => c !== null && c !== undefined && String(c).trim() !== '').length;
        if (nonEmpty > 0) {
          console.log(`    LastRow[${i}]:`, JSON.stringify(r.slice(0, 10)));
        }
      }

      const headers = (rows[headerRowIdx] || []).map((h, idx) => h !== null && h !== undefined ? String(h).trim() : `COL_${idx}`);
      const dataRows = rows.slice(headerRowIdx + 1).filter(r => r && r.some(c => c !== null && c !== undefined && String(c).trim() !== ''));

      // Analyze columns on up to 5000 sample rows + full scan for distincts on key cols
      const colStats = headers.map((h, colIdx) => {
        let nonNull = 0;
        let numCount = 0;
        let dateCount = 0;
        let strCount = 0;
        const distinct = new Set();
        const samples = [];
        let sum = 0;
        let min = null;
        let max = null;

        const step = dataRows.length > 10000 ? Math.ceil(dataRows.length / 10000) : 1;
        for (let rIdx = 0; rIdx < dataRows.length; rIdx++) {
          const val = dataRows[rIdx][colIdx];
          if (val === null || val === undefined || val === '') continue;
          nonNull++;
          if (typeof val === 'number') {
            numCount++;
            sum += val;
            if (min === null || val < min) min = val;
            if (max === null || val > max) max = val;
          } else if (val instanceof Date) {
            dateCount++;
            const iso = val.toISOString().slice(0, 10);
            if (min === null || iso < min) min = iso;
            if (max === null || iso > max) max = iso;
          } else {
            strCount++;
          }
          if (rIdx % step === 0 && distinct.size < 1000) {
            distinct.add(val instanceof Date ? val.toISOString().slice(0, 10) : String(val).trim());
          }
          if (samples.length < 5) {
            const s = val instanceof Date ? val.toISOString().slice(0, 10) : val;
            if (!samples.includes(s)) samples.push(s);
          }
        }
        return {
          colIdx,
          name: h,
          nonNull,
          nullCount: dataRows.length - nonNull,
          inferredType: dateCount > nonNull * 0.5 ? 'date' : (numCount > nonNull * 0.5 ? 'number' : 'string'),
          distinctApprox: distinct.size,
          sum: numCount > 0 ? Number(sum.toFixed(2)) : null,
          min,
          max,
          samples
        };
      });

      console.log(`    HeaderRow=${headerRowIdx}, ValidDataRows=${dataRows.length}, Cols=${headers.length}`);
      colStats.forEach(cs => {
        if (cs.nonNull > 0 || !cs.name.startsWith('COL_')) {
          console.log(`      Col[${cs.colIdx}] "${cs.name}" (${cs.inferredType}): nonNull=${cs.nonNull}, distinct~=${cs.distinctApprox}, sum=${cs.sum}, min=${cs.min}, max=${cs.max}, samples=${JSON.stringify(cs.samples)}`);
        }
      });

      fileInfo.sheets.push({
        sheetName,
        ref,
        totalRowsRaw: rows.length,
        headerRowIdx,
        dataRowCount: dataRows.length,
        columns: colStats.filter(cs => cs.nonNull > 0 || !cs.name.startsWith('COL_'))
      });
    }
    report.push(fileInfo);
  } catch (err) {
    console.error(`ERROR reading ${file}:`, err.message);
    report.push({ fileName: file, error: err.message });
  }
}

fs.mkdirSync(path.join(workspaceDir, 'docs'), { recursive: true });
fs.writeFileSync(path.join(workspaceDir, 'docs', 'inspection_raw.json'), JSON.stringify(report, null, 2));
console.log('\nSaved detailed inspection to docs/inspection_raw.json');
