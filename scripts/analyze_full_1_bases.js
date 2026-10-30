const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');

const basesDir = path.join(__dirname, '..', '1. Bases');

function readSheetRows(file, sheetName) {
  const buf = fs.readFileSync(path.join(basesDir, file));
  const wb = XLSX.read(buf, {
    type: 'buffer',
    sheets: sheetName ? [sheetName] : undefined,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false
  });
  const target = sheetName || wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[target], { header: 1, defval: null });
}

console.log('1. Reading Master Files...');
const portfolioRows = readSheetRows('(Fijo) Base Portfolio.xlsx', 'Productos');
console.log('  Portfolio rows:', portfolioRows.length - 1, 'headers:', portfolioRows[0].slice(0, 25));

const canalMktRows = readSheetRows('(Fijo) Canal MKT.xlsx');
console.log('  Canal MKT rows:', canalMktRows.length - 1, 'data:', canalMktRows);

const subcanalMktRows = readSheetRows('(Fijo) Subcanales Mkt.xlsx');
console.log('  Subcanales Mkt rows:', subcanalMktRows.length - 1);

const medidaTiempoRows = readSheetRows('(Fijo) Medida Tiempo.xlsx');
console.log('  Medida Tiempo rows:', medidaTiempoRows.length - 1, 'data:', medidaTiempoRows);

const personalFijoRows = readSheetRows('(Fijo) DetallePersonal.xlsx');
const personalSemiRows = readSheetRows('(SemiFijo) DetallePersonal.xlsx');
console.log('  DetallePersonal (Fijo) rows:', personalFijoRows.length - 1);
console.log('  DetallePersonal (SemiFijo) rows:', personalSemiRows.length - 1, 'all rows:', personalSemiRows);

console.log('\n2. Reading Client Masters...');
const baseClientesRows = readSheetRows('(Actualizar) Base de Clientes.xlsx');
console.log('  Base de Clientes rows:', baseClientesRows.length - 1, 'cols:', baseClientesRows[0].length);

const reporteClientesRows = readSheetRows('(Actualizar) Reporte de Clientes.xlsx');
console.log('  Reporte de Clientes rows:', reporteClientesRows.length - 1, 'cols:', reporteClientesRows[0].length);

const clientesPresencialRows = readSheetRows('(Actualizar) Clientes Presencial.xlsx');
console.log('  Clientes Presencial rows:', clientesPresencialRows.length - 1, 'cols:', clientesPresencialRows[0].length);

console.log('\n3. Reading Transactional Sales & Objectives...');
const baseFechaRows = readSheetRows('(Actualizar) Base a la fecha.xlsx');
console.log('  Base a la fecha rows:', baseFechaRows.length - 1, 'headers:', baseFechaRows[0]);

const baseProdVolRows = readSheetRows('(Actualizar) Base Prod. y Vol..xlsx');
console.log('  Base Prod. y Vol. rows:', baseProdVolRows.length - 1, 'headers:', baseProdVolRows[0]);

const baseObjRows = readSheetRows('(Actualizar) Base Obj..xlsx');
console.log('  Base Obj. rows:', baseObjRows.length - 1, 'headers:', baseObjRows[0]);

console.log('\n4. Reading Operational Bases...');
const baseCncRows = readSheetRows('(Actualizar) Base CNC.xlsx');
console.log('  Base CNC rows:', baseCncRows.length - 1, 'headers:', baseCncRows[0]);

const baseEficRows = readSheetRows('(Actualizar) Base Eficiencia.xlsx');
console.log('  Base Eficiencia rows:', baseEficRows.length - 1, 'headers:', baseEficRows[0]);

const baseMxpdvRows = readSheetRows('(Actualizar) Base MXPDV.xlsx');
console.log('  Base MXPDV rows:', baseMxpdvRows.length - 1, 'headers:', baseMxpdvRows[0]);

const baseRechazosRows = readSheetRows('(Actualizar) Base Rechazos.xlsx');
console.log('  Base Rechazos rows:', baseRechazosRows.length - 1, 'headers:', baseRechazosRows[0]);

const activosFijosRows = readSheetRows('(Actualizar) Activos Fijos.xlsx');
console.log('  Activos Fijos rows:', activosFijosRows.length - 1, 'headers:', activosFijosRows[0]);

const negoBuf = fs.readFileSync(path.join(basesDir, '(Actualizar) Negociaciones.xlsx'));
const negoWb = XLSX.read(negoBuf, { type: 'buffer', cellFormula: false, cellHTML: false, cellStyles: false });
for (const s of negoWb.SheetNames) {
  const r = XLSX.utils.sheet_to_json(negoWb.Sheets[s], { header: 1, defval: null });
  console.log(`  Negociaciones [${s}] rows:`, r.length);
}

// Compare Base a la fecha vs Base Prod. y Vol.
const periodsFecha = {};
const divFecha = {};
for (let i = 1; i < baseFechaRows.length; i++) {
  const row = baseFechaRows[i];
  if (!row || !row[0]) continue;
  const p = String(row[0]).trim();
  const d = String(row[7] || '').trim();
  const hl = Number(row[9]) || 0;
  const bultos = Number(row[10]) || 0;
  const neto = Number(row[11]) || 0;
  if (!periodsFecha[p]) periodsFecha[p] = { rows: 0, hl: 0, bultos: 0, neto: 0 };
  periodsFecha[p].rows++;
  periodsFecha[p].hl += hl;
  periodsFecha[p].bultos += bultos;
  periodsFecha[p].neto += neto;

  if (!divFecha[d]) divFecha[d] = { rows: 0, hl: 0, bultos: 0, neto: 0 };
  divFecha[d].rows++;
  divFecha[d].hl += hl;
  divFecha[d].bultos += bultos;
  divFecha[d].neto += neto;
}

const periodsProdVol = {};
const divProdVol = {};
for (let i = 1; i < baseProdVolRows.length; i++) {
  const row = baseProdVolRows[i];
  if (!row || !row[0]) continue;
  const p = String(row[0]).trim();
  const d = String(row[1] || '').trim();
  const bultos = Number(row[12]) || 0;
  const hl = Number(row[13]) || 0;
  const neto = Number(row[14]) || 0;
  const bonif = Number(row[15]) || 0;
  if (!periodsProdVol[p]) periodsProdVol[p] = { rows: 0, hl: 0, bultos: 0, neto: 0, bonif: 0 };
  periodsProdVol[p].rows++;
  periodsProdVol[p].hl += hl;
  periodsProdVol[p].bultos += bultos;
  periodsProdVol[p].neto += neto;
  periodsProdVol[p].bonif += bonif;

  if (!divProdVol[d]) divProdVol[d] = { rows: 0, hl: 0, bultos: 0, neto: 0, bonif: 0 };
  divProdVol[d].rows++;
  divProdVol[d].hl += hl;
  divProdVol[d].bultos += bultos;
  divProdVol[d].neto += neto;
  divProdVol[d].bonif += bonif;
}

const periodsObj = {};
const divObj = {};
for (let i = 1; i < baseObjRows.length; i++) {
  const row = baseObjRows[i];
  if (!row || !row[0]) continue;
  const p = String(row[0]).trim();
  const d = String(row[1] || '').trim();
  const objHl = Number(row[11]) || 0;
  if (!periodsObj[p]) periodsObj[p] = { rows: 0, objHl: 0 };
  periodsObj[p].rows++;
  periodsObj[p].objHl += objHl;

  if (!divObj[d]) divObj[d] = { rows: 0, objHl: 0 };
  divObj[d].rows++;
  divObj[d].objHl += objHl;
}

console.log('\n--- PERIODS IN BASE A LA FECHA ---');
console.log(periodsFecha);
console.log('\n--- PERIODS IN BASE PROD Y VOL ---');
console.log(periodsProdVol);
console.log('\n--- DIVISIONS IN BASE A LA FECHA ---');
console.log(divFecha);
console.log('\n--- DIVISIONS IN BASE PROD Y VOL ---');
console.log(divProdVol);
console.log('\n--- PERIODS IN BASE OBJ ---');
console.log(periodsObj);
console.log('\n--- DIVISIONS IN BASE OBJ ---');
console.log(divObj);
