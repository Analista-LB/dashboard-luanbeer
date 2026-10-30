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

// 1. Inspect Portfolio classifications for TACO & Galaxia
const portRows = readSheet('(Fijo) Base Portfolio.xlsx', 'Productos');
const portHeaders = portRows[0];
console.log('Portfolio all 50 headers:', portHeaders);
const colSummary = {};
for (let c = 0; c < portHeaders.length; c++) {
  const h = portHeaders[c];
  if (!h) continue;
  const vals = new Set();
  for (let r = 1; r < portRows.length; r++) {
    const v = portRows[r][c];
    if (v !== null && v !== '') vals.add(String(v).trim());
  }
  if (vals.size <= 30) {
    colSummary[h] = Array.from(vals);
  } else {
    colSummary[h] = `[${vals.size} unique values]`;
  }
}
console.log('\nPortfolio column unique values:', JSON.stringify(colSummary, null, 2));

// 2. Inspect Tablero Ventas.xlsb key sheets in full
const xlsbBuf = fs.readFileSync(path.join(basesDir, 'Tablero Ventas.xlsb'));
const keyTableroSheets = [
  '0-Base objetivos',
  '1- Base Dinam Taco',
  '1- Base TACO Mensual',
  'TACO REAL',
  'Mando Integral',
  'Mesa Julio',
  'Mesa Gonza',
  '1-BASE FECHA',
  '1-BASE DE PROMOTORES',
  'Dimension FDV',
  'NABS (UDN)',
  'NABS (SEG.)',
  'Elige MES',
  'Censo Clientes'
];

const tableroFull = {};
for (const sName of keyTableroSheets) {
  const wb = XLSX.read(xlsbBuf, {
    type: 'buffer',
    sheets: [sName],
    cellFormula: false,
    cellHTML: false,
    cellStyles: false
  });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sName], { header: 1, defval: null });
  tableroFull[sName] = rows.slice(0, 60);
}
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'tablero_ventas_key_sheets.json'), JSON.stringify(tableroFull, null, 2));
console.log('Saved docs/tablero_ventas_key_sheets.json');

// 3. Inspect Base de Clientes vs Reporte de Clientes vs Clientes Presencial
const bcRows = readSheet('(Actualizar) Base de Clientes.xlsx');
const rcRows = readSheet('(Actualizar) Reporte de Clientes.xlsx');
const cpRows = readSheet('(Actualizar) Clientes Presencial.xlsx');

const bcHeaders = bcRows[0];
const rcHeaders = rcRows[0];
const cpHeaders = cpRows[0];
console.log('\nBase de Clientes headers (170..206):', bcHeaders.slice(165));
console.log('Clientes Presencial all headers:', cpHeaders);
const rcOnly = rcHeaders.filter(h => !bcHeaders.includes(h));
console.log('Headers in Reporte de Clientes not in Base de Clientes:', rcOnly);

// Audit Base de Clientes for Galaxia 2026 rules
let totalClientes = bcRows.length - 1;
let activos = 0;
let anulados = 0;
let activosConCoordValidas = 0;
let activosConRuta = 0;
let activosConDiasVisita = 0;
let activosConSubcanal = 0;
const subcanalesCount = {};
const fdvPersonalCount = {};
const clusterCensoCount = {};
const planesCzaCount = {};

const idxAnulado = bcHeaders.indexOf('Anulado');
const idxCoordX = bcHeaders.indexOf('Coord X');
const idxCoordY = bcHeaders.indexOf('Coord Y');
const idxRuta = bcHeaders.indexOf('Fuerza de venta 1 Ruta de venta');
const idxPersonal = bcHeaders.indexOf('Fuerza de venta 1 Personal comercial');
const idxPersonalDesc = bcHeaders.indexOf('Fuerza de venta 1 Descripcion personal comercial');
const idxDiasVisita = bcHeaders.indexOf('Fuerza de venta 1 Dias de visita');
const idxSubcanalDesc = bcHeaders.indexOf('Descripcion subcanal');
const idxClusterCza = bcHeaders.indexOf('Cluster Censo Cza.CLUSTER');
const idxEsPlan = bcHeaders.indexOf('Planes Cerveza.ES PLAN');

for (let r = 1; r < bcRows.length; r++) {
  const row = bcRows[r];
  if (!row || row[1] === null) continue;
  const isAnulado = String(row[idxAnulado] || '').trim().toUpperCase() === 'SI';
  if (isAnulado) {
    anulados++;
  } else {
    activos++;
    const cx = parseFloat(String(row[idxCoordX] || '0').replace(',', '.'));
    const cy = parseFloat(String(row[idxCoordY] || '0').replace(',', '.'));
    if (cx !== 0 && cy !== 0 && !isNaN(cx) && !isNaN(cy)) activosConCoordValidas++;
    if (row[idxRuta] && Number(row[idxRuta]) > 0) activosConRuta++;
    if (row[idxDiasVisita] && String(row[idxDiasVisita]).trim() !== '') activosConDiasVisita++;
    const sub = String(row[idxSubcanalDesc] || '').trim();
    if (sub && sub !== 'SIN ESPECIFICAR') activosConSubcanal++;
    subcanalesCount[sub] = (subcanalesCount[sub] || 0) + 1;
    const pDesc = `${row[idxPersonal]} - ${row[idxPersonalDesc] || 'SIN ASIGNAR'}`;
    fdvPersonalCount[pDesc] = (fdvPersonalCount[pDesc] || 0) + 1;
    const cl = String(row[idxClusterCza] || 'SIN CLUSTER').trim();
    clusterCensoCount[cl] = (clusterCensoCount[cl] || 0) + 1;
    const pl = String(row[idxEsPlan] || 'SIN PLAN').trim();
    planesCzaCount[pl] = (planesCzaCount[pl] || 0) + 1;
  }
}

console.log('\n--- AUDITORIA MAESTRO DE CLIENTES (GALAXIA 2026) ---');
console.log({
  totalClientes,
  activos,
  anulados,
  activosConCoordValidas,
  pctCoordValidas: ((activosConCoordValidas / activos) * 100).toFixed(2) + '%',
  activosConRuta,
  pctConRuta: ((activosConRuta / activos) * 100).toFixed(2) + '%',
  activosConDiasVisita,
  pctConDiasVisita: ((activosConDiasVisita / activos) * 100).toFixed(2) + '%',
  activosConSubcanal,
  pctConSubcanal: ((activosConSubcanal / activos) * 100).toFixed(2) + '%',
  subcanalesCount,
  fdvPersonalCount,
  clusterCensoCount,
  planesCzaCount
});
