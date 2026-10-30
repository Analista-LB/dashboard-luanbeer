const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');

const workspaceDir = path.resolve(__dirname, '..');

function readSheet(fileName, sheetIndexOrName = 0) {
  const fullPath = path.join(workspaceDir, fileName);
  const buf = fs.readFileSync(fullPath);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const sName = typeof sheetIndexOrName === 'number' ? wb.SheetNames[sheetIndexOrName] : sheetIndexOrName;
  const ws = wb.Sheets[sName];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
}

// 1. Check Base CNC
const cncRows = readSheet('(Actualizar) Base CNC.xlsx');
const cncByMonth = {};
const cncClients = new Map(); // Cod Cte -> { name, domicilio, canal }
const cncCanales = new Set();
for (let i = 1; i < cncRows.length; i++) {
  const r = cncRows[i];
  if (!r || !r[0]) continue;
  const per = String(r[0]).trim();
  const cte = Number(r[1]);
  const name = String(r[2] || '').trim();
  const dom = String(r[3] || '').trim();
  const canal = String(r[4] || '').trim();
  const univ = Number(r[5]) || 0;
  const act = Number(r[6]) || 0;
  const cnc = Number(r[7]) || 0;
  cncClients.set(cte, { name, dom, canal });
  cncCanales.add(canal);
  if (!cncByMonth[per]) cncByMonth[per] = { rows: 0, univ: 0, act: 0, cnc: 0, uniqueCtes: new Set() };
  cncByMonth[per].rows++;
  cncByMonth[per].univ += univ;
  cncByMonth[per].act += act;
  cncByMonth[per].cnc += cnc;
  cncByMonth[per].uniqueCtes.add(cte);
}
console.log('Base CNC unique clients:', cncClients.size, 'canales:', [...cncCanales]);
Object.keys(cncByMonth).sort().forEach(m => {
  const d = cncByMonth[m];
  console.log(`  CNC ${m}: rows=${d.rows}, uniqueCtes=${d.uniqueCtes.size}, univ=${d.univ}, act=${d.act}, cnc=${d.cnc}, Compradores(act-cnc)=${d.act - d.cnc}`);
});

// 2. Check Base Obj.
const objRows = readSheet('(Actualizar) Base Obj..xlsx');
const objByMonth = {};
const objDivs = new Set();
const objCanales = new Set();
for (let i = 1; i < objRows.length; i++) {
  const r = objRows[i];
  if (!r || !r[0]) continue;
  const per = String(r[0]).trim();
  const div = String(r[1] || '').trim();
  const canal = String(r[8] || '').trim();
  const hl = Number(r[11]) || 0;
  objDivs.add(div);
  objCanales.add(canal);
  if (!objByMonth[per]) objByMonth[per] = { rows: 0, hl: 0 };
  objByMonth[per].rows++;
  objByMonth[per].hl += hl;
}
console.log('\nBase Obj divisions:', [...objDivs]);
console.log('Base Obj canales:', [...objCanales]);
Object.keys(objByMonth).sort().forEach(m => {
  console.log(`  Obj ${m}: rows=${objByMonth[m].rows}, objHL=${objByMonth[m].hl.toFixed(2)}`);
});

// 3. Check Base Eficiencia
const efiRows = readSheet('(Actualizar) Base Eficiencia.xlsx');
const efiByMonth = {};
for (let i = 1; i < efiRows.length; i++) {
  const r = efiRows[i];
  if (!r || !r[0]) continue;
  const per = String(r[0]).trim();
  const vis = Number(r[3]) || 0;
  const visEf = Number(r[4]) || 0;
  const visFR = Number(r[5]) || 0;
  if (!efiByMonth[per]) efiByMonth[per] = { rows: 0, vis: 0, visEf: 0, visFR: 0 };
  efiByMonth[per].rows++;
  efiByMonth[per].vis += vis;
  efiByMonth[per].visEf += visEf;
  efiByMonth[per].visFR += visFR;
}
console.log('\nBase Eficiencia by month:');
Object.keys(efiByMonth).sort().forEach(m => {
  const d = efiByMonth[m];
  console.log(`  Efi ${m}: rows=${d.rows}, visitas=${d.vis}, visEfectivas=${d.visEf}, fueraRuta=${d.visFR}, %Ef=${(d.visEf / d.vis * 100).toFixed(1)}%`);
});

// 4. Check Base MXPDV
const mxRows = readSheet('(Actualizar) Base MXPDV.xlsx');
const mxByMonth = {};
for (let i = 1; i < mxRows.length; i++) {
  const r = mxRows[i];
  if (!r || !r[0]) continue;
  const per = String(r[0]).trim();
  const marcas = Number(r[5]) || 0;
  if (!mxByMonth[per]) mxByMonth[per] = { rows: 0, sumMarcas: 0 };
  mxByMonth[per].rows++;
  mxByMonth[per].sumMarcas += marcas;
}
console.log('\nBase MXPDV by month:');
Object.keys(mxByMonth).sort().forEach(m => {
  const d = mxByMonth[m];
  console.log(`  MXPDV ${m}: rows=${d.rows}, sumMarcas=${d.sumMarcas}, avgMarcas=${(d.sumMarcas / d.rows).toFixed(2)}`);
});

// 5. Check Base Rechazos
const recRows = readSheet('(Actualizar) Base Rechazos.xlsx');
const recByMonth = {};
for (let i = 1; i < recRows.length; i++) {
  const r = recRows[i];
  if (!r || !r[0]) continue;
  const per = String(r[0]).trim();
  const bultos = Number(r[2]) || 0;
  const neto = Number(r[3]) || 0;
  const um = Number(r[4]) || 0;
  if (!recByMonth[per]) recByMonth[per] = { rows: 0, bultos: 0, neto: 0, um: 0 };
  recByMonth[per].rows++;
  recByMonth[per].bultos += bultos;
  recByMonth[per].neto += neto;
  recByMonth[per].um += um;
}
console.log('\nBase Rechazos by month:');
Object.keys(recByMonth).sort().forEach(m => {
  const d = recByMonth[m];
  console.log(`  Rechazos ${m}: rows=${d.rows}, bultos=${d.bultos.toFixed(2)}, UM(HL)=${d.um.toFixed(2)}, neto=${d.neto.toFixed(2)}`);
});
