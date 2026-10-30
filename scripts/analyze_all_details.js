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

// 1. Check Portfolio mapping and unmatched products
const portRows = readSheet('(Fijo) Base Portfolio.xlsx');
const portMap = new Map();
for (let i = 1; i < portRows.length; i++) {
  const r = portRows[i];
  if (!r || r[0] === null) continue;
  const code = Number(r[0]);
  portMap.set(code, {
    code,
    name: String(r[1] || '').trim(),
    un: String(r[2] || '').trim(),
    div: String(r[3] || '').trim(),
    marca: String(r[4] || '').trim(),
    calibre: String(r[5] || '').trim(),
    sabor: String(r[6] || '').trim(),
    familia: String(r[7] || '').trim(),
    marcaUnif: String(r[8] || '').trim(),
    segmento: String(r[9] || '').trim(),
    unMktp: String(r[45] || '').trim(),
    foco: String(r[46] || '').trim(),
    catObj: String(r[47] || '').trim()
  });
}

// 2. Inspect exact differences between Prod y Vol and Base a la fecha
const pvRows = readSheet('(Actualizar) Base Prod. y Vol..xlsx');
const bfRows = readSheet('(Actualizar) Base a la fecha.xlsx');

const pvMap = new Map();
for (let i = 1; i < pvRows.length; i++) {
  const r = pvRows[i];
  if (!r || !r[0]) continue;
  const key = `${String(r[0]).trim()}|${Number(r[7])}|${Number(r[6])}|${Number(r[9])}`;
  pvMap.set(key, {
    rowIdx: i,
    per: String(r[0]).trim(),
    div: String(r[1] || '').trim(),
    familia: String(r[2] || '').trim(),
    marca: String(r[3] || '').trim(),
    sabor: String(r[4] || '').trim(),
    calibre: String(r[5] || '').trim(),
    prod: Number(r[6]),
    cte: Number(r[7]),
    canal: String(r[8] || '').trim(),
    vend: Number(r[9]),
    sup: Number(r[10]),
    ccc: Number(r[11]) || 0,
    bultos: Number(r[12]) || 0,
    hl: Number(r[13]) || 0,
    neto: Number(r[14]) || 0,
    bonif: Number(r[15]) || 0
  });
}

let inBoth = 0;
let onlyInBF = 0;
let hlDiffs = 0;
let bultosDiffs = 0;
let netoDiffs = 0;
const onlyBFRows = [];

for (let i = 1; i < bfRows.length; i++) {
  const r = bfRows[i];
  if (!r || !r[0]) continue;
  const key = `${String(r[0]).trim()}|${Number(r[1])}|${Number(r[2])}|${Number(r[6])}`;
  const bfItem = {
    per: String(r[0]).trim(),
    cte: Number(r[1]),
    prod: Number(r[2]),
    canal: String(r[3] || '').trim(),
    ccc: Number(r[4]) || 0,
    marca: String(r[5] || '').trim(),
    vend: Number(r[6]),
    div: String(r[7] || '').trim(),
    sup: Number(r[8]),
    hl: Number(r[9]) || 0,
    bultos: Number(r[10]) || 0,
    neto: Number(r[11]) || 0
  };
  const pvItem = pvMap.get(key);
  if (pvItem) {
    inBoth++;
    if (Math.abs(pvItem.hl - bfItem.hl) > 1e-4) hlDiffs++;
    if (Math.abs(pvItem.bultos - bfItem.bultos) > 1e-4) bultosDiffs++;
    if (Math.abs(pvItem.neto - bfItem.neto) > 1e-2) netoDiffs++;
  } else {
    onlyInBF++;
    onlyBFRows.push(bfItem);
  }
}
const onlyInPV = pvMap.size - inBoth;
console.log(`Reconciliation PV vs BF: inBoth=${inBoth}, onlyInPV=${onlyInPV}, onlyInBF=${onlyInBF}, hlDiffs=${hlDiffs}, bultosDiffs=${bultosDiffs}, netoDiffs=${netoDiffs}`);
console.log('Sample onlyInBF rows:', JSON.stringify(onlyBFRows.slice(0, 10)));

// Check unmatched products in PV and BF
for (const [k, v] of pvMap.entries()) {
  if (!portMap.has(v.prod)) {
    console.log('Unmatched product in PV:', v.prod, v.div, v.familia, v.marca, v.sabor, v.calibre);
    break;
  }
}
for (const r of onlyBFRows) {
  if (!portMap.has(r.prod)) {
    console.log('Unmatched product in onlyBF:', r.prod, r.div, r.marca);
    break;
  }
}

// 3. Check Canal MKT mapping coverage
const canalRows = readSheet('(Fijo) Canal MKT.xlsx');
const canalMapExact = new Map();
const canalMapNorm = new Map();
for (let i = 1; i < canalRows.length; i++) {
  const r = canalRows[i];
  if (!r || !r[0]) continue;
  const raw = String(r[0]).trim();
  const unif = String(r[1] || '').trim();
  const seg = String(r[2] || '').trim();
  canalMapExact.set(raw, { raw, unif, seg });
  canalMapNorm.set(raw.toUpperCase(), { raw, unif, seg });
}

const allFactCanales = new Set();
for (const v of pvMap.values()) allFactCanales.add(v.canal);
console.log('\nChannel mapping check across fact tables:');
for (const c of allFactCanales) {
  const exact = canalMapExact.get(c);
  const withoutRef = canalMapNorm.get(c.replace(/^REF\s+/i, '').toUpperCase());
  console.log(`  Fact Canal "${c}" -> exact: ${JSON.stringify(exact || null)} | withoutRef: ${JSON.stringify(withoutRef || null)}`);
}
