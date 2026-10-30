const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');

const basesDir = path.join(__dirname, '..', '1. Bases');

// 1. Inspect full headers of Base de Clientes, Reporte de Clientes, Clientes Presencial, Base Portfolio, DetallePersonal
const detailFiles = [
  '(Actualizar) Base de Clientes.xlsx',
  '(Actualizar) Reporte de Clientes.xlsx',
  '(Actualizar) Clientes Presencial.xlsx',
  '(Fijo) Base Portfolio.xlsx',
  '(Fijo) DetallePersonal.xlsx',
  '(SemiFijo) DetallePersonal.xlsx',
  '(Fijo) Canal MKT.xlsx',
  '(Fijo) Subcanales Mkt.xlsx',
  '(Fijo) Medida Tiempo.xlsx'
];

const headersReport = {};
for (const f of detailFiles) {
  const wb = XLSX.read(fs.readFileSync(path.join(basesDir, f)), { type: 'buffer', sheetRows: 20 });
  headersReport[f] = {};
  for (const s of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, defval: null });
    headersReport[f][s] = {
      headers: rows[0],
      sampleRow1: rows[1],
      sampleRow2: rows[2],
      allRowsIfSmall: rows.length <= 25 ? rows : undefined
    };
  }
}
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'inspeccion_headers_detallados.json'), JSON.stringify(headersReport, null, 2));
console.log('Saved docs/inspeccion_headers_detallados.json');

// 2. Try reading Tablero Ventas.xlsb without sheetRows or inspect its zip entries
const xlsbPath = path.join(basesDir, 'Tablero Ventas.xlsb');
const xlsbBuf = fs.readFileSync(xlsbPath);
try {
  const wbXlsb = XLSX.read(xlsbBuf, { type: 'buffer', bookSheets: true });
  console.log('Tablero Ventas.xlsb SheetNames:', wbXlsb.SheetNames);
} catch (e) {
  console.log('bookSheets error:', e.message);
}

try {
  // Try reading specific sheets or full workbook without sheetRows
  const wbXlsbFull = XLSX.read(xlsbBuf, { type: 'buffer', cellFormula: false, cellHTML: false, cellStyles: false });
  console.log('Full XLSB read success! Sheets:', wbXlsbFull.SheetNames);
  for (const s of wbXlsbFull.SheetNames) {
    const ws = wbXlsbFull.Sheets[s];
    console.log(`  Sheet [${s}] ref=${ws['!ref']}`);
  }
} catch (e) {
  console.log('Full XLSB read error:', e.message);
}
