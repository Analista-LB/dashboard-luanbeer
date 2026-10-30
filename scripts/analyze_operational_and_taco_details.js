const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');

const basesDir = path.join(__dirname, '..', '1. Bases');

function readSheet(file, sheetName) {
  const buf = fs.readFileSync(path.join(basesDir, file));
  const wb = XLSX.read(buf, {
    type: 'buffer',
    sheets: sheetName ? [sheetName] : undefined,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false
  });
  const s = sheetName || wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, defval: null });
}

// 1. Inspect Activos Fijos in detail
const afRows = readSheet('(Actualizar) Activos Fijos.xlsx');
const afHeaders = afRows[0];
const afStats = {
  totalRows: afRows.length - 1,
  byTipoMaterial: {},
  byEstado: {},
  byRepaga: {},
  byUnidadNegocio: {},
  byModelo: {},
  ventaCeroCount: 0,
  instaladosPDV: 0,
  enDeposito: 0,
  totalLitrosRepago: 0,
  totalVentaPromLitros: 0,
  totalLitrosPendientes: 0
};

for (let r = 1; r < afRows.length; r++) {
  const row = afRows[r];
  if (!row || row[0] === null) continue;
  const tipo = String(row[9] || 'SIN TIPO').trim();
  const estado = String(row[18] || 'SIN ESTADO').trim();
  const repaga = String(row[17] || 'NO').trim();
  const udn = String(row[10] || 'SIN UDN').trim();
  const modelo = String(row[8] || 'SIN MODELO').trim();
  const instalado = String(row[6] || '').trim().toLowerCase();
  const litrosRep = Number(row[14]) || 0;
  const ventaProm = Number(row[15]) || 0;
  const litrosPend = Number(row[16]) || 0;

  afStats.byTipoMaterial[tipo] = (afStats.byTipoMaterial[tipo] || 0) + 1;
  afStats.byEstado[estado] = (afStats.byEstado[estado] || 0) + 1;
  afStats.byRepaga[repaga] = (afStats.byRepaga[repaga] || 0) + 1;
  afStats.byUnidadNegocio[udn] = (afStats.byUnidadNegocio[udn] || 0) + 1;
  afStats.byModelo[modelo] = (afStats.byModelo[modelo] || 0) + 1;

  if (instalado === 'yes' || estado === 'INSTALADO') {
    afStats.instaladosPDV++;
    if (ventaProm <= 0) afStats.ventaCeroCount++;
  } else {
    afStats.enDeposito++;
  }
  afStats.totalLitrosRepago += litrosRep;
  afStats.totalVentaPromLitros += ventaProm;
  afStats.totalLitrosPendientes += litrosPend;
}
console.log('--- ACTIVOS FIJOS STATS ---');
console.log(afStats);

// 2. Inspect Base CNC in detail (25,895 rows)
const cncRows = readSheet('(Actualizar) Base CNC.xlsx');
const cncByPeriod = {};
const clientMonthsActive = new Map(); // codCte -> Set of periods where Clientes Activos > 0
for (let r = 1; r < cncRows.length; r++) {
  const row = cncRows[r];
  if (!row || !row[0]) continue;
  const per = String(row[0]).trim();
  const cte = Number(row[1]);
  const canal = String(row[4] || 'Sin Canal').trim();
  const univ = Number(row[5]) || 0;
  const act = Number(row[6]) || 0;
  const cnc = Number(row[7]) || 0;

  if (!cncByPeriod[per]) cncByPeriod[per] = { rows: 0, universo: 0, activos: 0, cnc: 0 };
  cncByPeriod[per].rows++;
  cncByPeriod[per].universo += univ;
  cncByPeriod[per].activos += act;
  cncByPeriod[per].cnc += cnc;
}
console.log('\n--- BASE CNC BY PERIOD ---');
console.log(cncByPeriod);

// 3. Inspect Base Eficiencia in detail (40,317 rows)
const eficRows = readSheet('(Actualizar) Base Eficiencia.xlsx');
const eficByPeriod = {};
for (let r = 1; r < eficRows.length; r++) {
  const row = eficRows[r];
  if (!row || !row[0]) continue;
  const per = String(row[0]).trim();
  const vis = Number(row[3]) || 0;
  const efec = Number(row[4]) || 0;
  const fueraRuta = Number(row[5]) || 0;
  if (!eficByPeriod[per]) eficByPeriod[per] = { rows: 0, visitas: 0, efectivas: 0, fueraRuta: 0 };
  eficByPeriod[per].rows++;
  eficByPeriod[per].visitas += vis;
  eficByPeriod[per].efectivas += efec;
  eficByPeriod[per].fueraRuta += fueraRuta;
}
console.log('\n--- BASE EFICIENCIA BY PERIOD ---');
console.log(eficByPeriod);

// 4. Inspect Base Rechazos in detail (5,803 rows)
const rechRows = readSheet('(Actualizar) Base Rechazos.xlsx');
const rechByPeriod = {};
const rechByMotivo = {};
for (let r = 1; r < rechRows.length; r++) {
  const row = rechRows[r];
  if (!row || !row[0]) continue;
  const per = String(row[0]).trim();
  const bultos = Number(row[2]) || 0;
  const neto = Number(row[3]) || 0;
  const um = Number(row[4]) || 0;
  const mot = String(row[5] || 'SIN MOTIVO ESPECIFICADO').trim();
  if (!rechByPeriod[per]) rechByPeriod[per] = { rows: 0, bultos: 0, neto: 0, um: 0 };
  rechByPeriod[per].rows++;
  rechByPeriod[per].bultos += bultos;
  rechByPeriod[per].neto += neto;
  rechByPeriod[per].um += um;

  if (!rechByMotivo[mot]) rechByMotivo[mot] = { rows: 0, bultos: 0, neto: 0, um: 0 };
  rechByMotivo[mot].rows++;
  rechByMotivo[mot].bultos += bultos;
  rechByMotivo[mot].neto += neto;
  rechByMotivo[mot].um += um;
}
console.log('\n--- BASE RECHAZOS BY PERIOD ---');
console.log(rechByPeriod);
console.log('--- BASE RECHAZOS BY MOTIVO ---');
console.log(rechByMotivo);

// 5. Inspect Clientes Presencial in detail (1,491 rows)
const cpRows = readSheet('(Actualizar) Clientes Presencial.xlsx');
const cpStats = {
  totalRows: cpRows.length - 1,
  byPeriodicidad: {},
  byDiasVisitaCount: {},
  byModo: {},
  byVendedor: {},
  freqMasDe2VisitasSemana: 0
};
for (let r = 1; r < cpRows.length; r++) {
  const row = cpRows[r];
  if (!row || row[4] === null) continue;
  const vnd = `${row[0]} - ${row[24] || ''}`;
  const per = String(row[23] ?? 'N/A');
  const modo = `${row[56] || ''} (${row[57] || ''})`;
  // Count how many days LU..SA are marked 'X'
  let daysCount = 0;
  for (let d = 9; d <= 15; d++) {
    if (row[d] && String(row[d]).trim() !== '') daysCount++;
  }
  cpStats.byPeriodicidad[per] = (cpStats.byPeriodicidad[per] || 0) + 1;
  cpStats.byDiasVisitaCount[daysCount] = (cpStats.byDiasVisitaCount[daysCount] || 0) + 1;
  cpStats.byModo[modo] = (cpStats.byModo[modo] || 0) + 1;
  cpStats.byVendedor[vnd] = (cpStats.byVendedor[vnd] || 0) + 1;
  if (daysCount > 2) cpStats.freqMasDe2VisitasSemana++;
}
console.log('\n--- CLIENTES PRESENCIAL STATS (GALAXIA FRECUENCIAS) ---');
console.log(cpStats);

// 6. Inspect Tablero Ventas.xlsb remaining sheets: Mesa Julio, Mesa Gonza, Base ranking, CCC Cerveza, Total Dist Cza, etc.
const xlsbBuf = fs.readFileSync(path.join(basesDir, 'Tablero Ventas.xlsb'));
const moreSheets = [
  'Mesa Julio',
  'Mesa Gonza',
  'Base ranking',
  'CCC Cerveza',
  'Total Dist Cza',
  'Total Dist NABS',
  'CCC UNG',
  'TBD AboveCore',
  'TBD Latones',
  'TBD Balanced Choices',
  'TBD NABS TOP',
  'GMV MKTPLACE',
  'NR MKTP'
];
const moreData = {};
for (const sName of moreSheets) {
  const wb = XLSX.read(xlsbBuf, {
    type: 'buffer',
    sheets: [sName],
    cellFormula: false,
    cellHTML: false,
    cellStyles: false
  });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sName], { header: 1, defval: null });
  // filter non-null rows
  const nonNull = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i].some(c => c !== null && c !== '')) {
      nonNull.push({ r: i, vals: rows[i].slice(0, 25) });
    }
    if (nonNull.length >= 40) break;
  }
  moreData[sName] = nonNull;
}
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'tablero_ventas_more_sheets.json'), JSON.stringify(moreData, null, 2));
console.log('Saved docs/tablero_ventas_more_sheets.json');
