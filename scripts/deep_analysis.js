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

console.log('--- 1. ANALYZING FIXED MASTER TABLES ---');
const tiempoRows = readSheet('(Fijo) Medida Tiempo.xlsx');
console.log('Medida Tiempo rows:', tiempoRows.length - 1);
console.log('Medida Tiempo all rows:', JSON.stringify(tiempoRows));

const canalMktRows = readSheet('(Fijo) Canal MKT.xlsx');
console.log('Canal MKT all rows:', JSON.stringify(canalMktRows));

const subcanalRows = readSheet('(Fijo) Subcanales Mkt.xlsx');
console.log('Subcanales Mkt first 10 rows:', JSON.stringify(subcanalRows.slice(0, 10)));

const personalRows = readSheet('(Fijo) DetallePersonal.xlsx');
console.log('DetallePersonal all rows:', JSON.stringify(personalRows));

const portfolioRows = readSheet('(Fijo) Base Portfolio.xlsx');
const portHeaders = portfolioRows[0];
const portData = portfolioRows.slice(1).filter(r => r && r[0] !== null);
const prodCodeCounts = new Map();
const unSet = new Set();
const unMktpSet = new Set();
const divSet = new Set();
for (const r of portData) {
  const code = Number(r[0]);
  prodCodeCounts.set(code, (prodCodeCounts.get(code) || 0) + 1);
  if (r[2]) unSet.add(String(r[2]).trim());
  if (r[45]) unMktpSet.add(String(r[45]).trim());
  if (r[3]) divSet.add(String(r[3]).trim());
}
const dupProdCodes = [...prodCodeCounts.entries()].filter(([k, v]) => v > 1);
console.log(`Portfolio: ${portData.length} rows, unique Código Producto: ${prodCodeCounts.size}, duplicates: ${dupProdCodes.length}`, dupProdCodes);
console.log('Portfolio Unidad de Negocio (col 2):', [...unSet]);
console.log('Portfolio Unidad MKTP (col 45):', [...unMktpSet]);
console.log('Portfolio División (col 3):', [...divSet]);

console.log('\n--- 2. COMPARING BASE PROD. Y VOL. VS BASE A LA FECHA ---');
const prodVolRows = readSheet('(Actualizar) Base Prod. y Vol..xlsx');
const baseFechaRows = readSheet('(Actualizar) Base a la fecha.xlsx');

console.log('Prod y Vol headers:', JSON.stringify(prodVolRows[0]));
console.log('Base a la fecha headers:', JSON.stringify(baseFechaRows[0]));

// Aggregate by Año/Mes in both
function aggSales(rows, idxPeriodo, idxCte, idxProd, idxCanal, idxCCC, idxBultos, idxHL, idxNeto, idxBonif, idxDiv, idxVend, idxSup) {
  const byMonth = {};
  const allClientsWithPurchase = new Set();
  const clientsByYear = { '2025': new Set(), '2026': new Set() };
  const clientsByYearYTD = { '2025': new Set(), '2026': new Set() };
  const channels = new Set();
  const divisions = new Set();
  const products = new Set();
  const clients = new Set();
  const vendedores = new Set();
  const supervisores = new Set();
  const keyMap = new Map();
  let dupKeys = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[idxPeriodo]) continue;
    const per = String(r[idxPeriodo]).trim();
    const yr = per.slice(0, 4);
    const mo = parseInt(per.slice(5, 7), 10);
    const cte = Number(r[idxCte]);
    const prod = Number(r[idxProd]);
    const canal = String(r[idxCanal] || '').trim();
    const cccFlag = Number(r[idxCCC]) || 0;
    const bultos = Number(r[idxBultos]) || 0;
    const hl = Number(r[idxHL]) || 0;
    const neto = Number(r[idxNeto]) || 0;
    const bonif = idxBonif !== null ? (Number(r[idxBonif]) || 0) : 0;
    const div = String(r[idxDiv] || '').trim();
    const vend = Number(r[idxVend]);
    const sup = Number(r[idxSup]);

    channels.add(canal);
    divisions.add(div);
    products.add(prod);
    clients.add(cte);
    vendedores.add(vend);
    supervisores.add(sup);

    const compositeKey = `${per}|${cte}|${prod}|${vend}`;
    if (keyMap.has(compositeKey)) dupKeys++;
    else keyMap.set(compositeKey, 1);

    if (!byMonth[per]) {
      byMonth[per] = { rows: 0, hl: 0, bultos: 0, neto: 0, bonif: 0, cccFlagSum: 0, uniqueClientsAll: new Set(), uniqueClientsBought: new Set() };
    }
    const m = byMonth[per];
    m.rows++;
    m.hl += hl;
    m.bultos += bultos;
    m.neto += neto;
    m.bonif += bonif;
    m.cccFlagSum += cccFlag;
    m.uniqueClientsAll.add(cte);
    if (cccFlag > 0 || hl > 0 || bultos > 0) {
      m.uniqueClientsBought.add(cte);
      allClientsWithPurchase.add(cte);
      if (clientsByYear[yr]) clientsByYear[yr].add(cte);
      if (mo <= 9 && clientsByYearYTD[yr]) clientsByYearYTD[yr].add(cte);
    }
  }
  return {
    byMonth,
    allClientsWithPurchaseCount: allClientsWithPurchase.size,
    clients2025: clientsByYear['2025'].size,
    clients2026: clientsByYear['2026'].size,
    clients2025YTD: clientsByYearYTD['2025'].size,
    clients2026YTD: clientsByYearYTD['2026'].size,
    channels: [...channels],
    divisions: [...divisions],
    productsCount: products.size,
    clientsCount: clients.size,
    vendedores: [...vendedores].sort((a,b)=>a-b),
    supervisores: [...supervisores].sort((a,b)=>a-b),
    dupKeys,
    productsSet: products,
    clientsSet: clients
  };
}

// Prod y Vol: ["Año/Mes","División","Familia","Marca","Sabor","Calibre","Código Producto","Código Cliente","Canal Mkt.","Código Sector de Venta","Código Sector de Supervisión","Clientes con Compra","Cantidad Total en Bultos","Cantidad Total en HL","Importe Neto","Importe Bonif. Total"]
const pvStats = aggSales(prodVolRows, 0, 7, 6, 8, 11, 12, 13, 14, 15, 1, 9, 10);

// Base a la fecha: ["Año/Mes","Código Cliente","Código Producto","Canal Mkt.","Clientes con Compra","Marca","Código Sector de Venta","División","Código Sector de Supervisión","Cantidad Total en HL","Cantidad Total en Bultos","Importe Neto"]
const bfStats = aggSales(baseFechaRows, 0, 1, 2, 3, 4, 10, 9, 11, null, 7, 6, 8);

console.log('Prod y Vol summary:', {
  productsCount: pvStats.productsCount,
  clientsCount: pvStats.clientsCount,
  allClientsWithPurchaseCount: pvStats.allClientsWithPurchaseCount,
  clients2025: pvStats.clients2025,
  clients2025YTD: pvStats.clients2025YTD,
  clients2026: pvStats.clients2026,
  clients2026YTD: pvStats.clients2026YTD,
  channels: pvStats.channels,
  divisions: pvStats.divisions,
  vendedores: pvStats.vendedores,
  supervisores: pvStats.supervisores,
  dupKeys: pvStats.dupKeys
});

console.log('Base a la fecha summary:', {
  productsCount: bfStats.productsCount,
  clientsCount: bfStats.clientsCount,
  allClientsWithPurchaseCount: bfStats.allClientsWithPurchaseCount,
  clients2025: bfStats.clients2025,
  clients2025YTD: bfStats.clients2025YTD,
  clients2026: bfStats.clients2026,
  clients2026YTD: bfStats.clients2026YTD,
  channels: bfStats.channels,
  divisions: bfStats.divisions,
  vendedores: bfStats.vendedores,
  supervisores: bfStats.supervisores,
  dupKeys: bfStats.dupKeys
});

console.log('\nMonthly Comparison (Prod y Vol vs Base a la fecha):');
const months = Object.keys(pvStats.byMonth).sort();
for (const m of months) {
  const pv = pvStats.byMonth[m];
  const bf = bfStats.byMonth[m];
  console.log(`${m}: PV[rows=${pv.rows}, HL=${pv.hl.toFixed(2)}, Bultos=${pv.bultos.toFixed(2)}, Neto=${pv.neto.toFixed(2)}, CCC_uniq=${pv.uniqueClientsBought.size}, CCC_all=${pv.uniqueClientsAll.size}] | BF[rows=${bf.rows}, HL=${bf.hl.toFixed(2)}, Bultos=${bf.bultos.toFixed(2)}, Neto=${bf.neto.toFixed(2)}, CCC_uniq=${bf.uniqueClientsBought.size}]`);
}

// Check which products are in Base a la fecha but not in Prod y Vol
const diffProds = [...bfStats.productsSet].filter(p => !pvStats.productsSet.has(p));
console.log('Products in Base a la fecha but not in Prod y Vol:', diffProds);
for (let i = 1; i < baseFechaRows.length; i++) {
  const r = baseFechaRows[i];
  if (r && diffProds.includes(Number(r[2]))) {
    console.log('  Sample diff row in Base a la fecha:', JSON.stringify(r));
    break;
  }
}

// Check unmatched products against Portfolio
const unmatchedPVProds = [...pvStats.productsSet].filter(p => !prodCodeCounts.has(p));
const unmatchedBFProds = [...bfStats.productsSet].filter(p => !prodCodeCounts.has(p));
console.log('Unmatched products in PV vs Portfolio:', unmatchedPVProds);
console.log('Unmatched products in BF vs Portfolio:', unmatchedBFProds);
