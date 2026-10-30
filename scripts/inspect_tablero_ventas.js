const fs = require('fs');
const path = require('path');

// Ensure vendor/xlsx.full.min.js tolerates Excel 365 BIFF12 metadata records (0x3b, etc.)
const xlsxVendorPath = path.join(__dirname, '..', 'vendor', 'xlsx.full.min.js');
let xlsxCode = fs.readFileSync(xlsxVendorPath, 'utf8');
if (xlsxCode.includes('throw new Error("Unexpected record 0x"')) {
  xlsxCode = xlsxCode.replace(/throw new Error\("Unexpected record 0x"\+[a-z]\.toString\(16\)\)/g, 'void 0');
  fs.writeFileSync(xlsxVendorPath, xlsxCode, 'utf8');
  console.log('Patched vendor/xlsx.full.min.js for Excel 365 BIFF12 (.xlsb) support.');
}

const XLSX = require('../vendor/xlsx.full.min.js');

const xlsbPath = path.join(__dirname, '..', '1. Bases', 'Tablero Ventas.xlsb');
const xlsbBuf = fs.readFileSync(xlsbPath);
const wbMeta = XLSX.read(xlsbBuf, { type: 'buffer', bookSheets: true });

const report = [];
for (const sName of wbMeta.SheetNames) {
  try {
    const wb = XLSX.read(xlsbBuf, {
      type: 'buffer',
      sheets: [sName],
      sheetRows: 35,
      cellFormula: false,
      cellHTML: false,
      cellStyles: false
    });
    const ws = wb.Sheets[sName];
    const ref = ws ? ws['!ref'] : 'NO_WS';
    const rows = ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) : [];
    const sample = [];
    for (let r = 0; r < Math.min(rows.length, 35); r++) {
      if (rows[r] && rows[r].some(c => c !== null && c !== '')) {
        sample.push({ r, vals: rows[r].slice(0, 22) });
      }
      if (sample.length >= 6) break;
    }
    console.log(`[OK] Sheet "${sName}" ref=${ref} sampleRows=${rows.length}`);
    report.push({ sheetName: sName, status: 'OK', ref, sample });
  } catch (err) {
    console.log(`[ERR] Sheet "${sName}": ${err.message}`);
    report.push({ sheetName: sName, status: 'ERR', error: err.message });
  }
}

fs.writeFileSync(path.join(__dirname, '..', 'docs', 'inspeccion_tablero_ventas.json'), JSON.stringify(report, null, 2));
console.log('Saved docs/inspeccion_tablero_ventas.json');
