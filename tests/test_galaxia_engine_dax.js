const fs = require('fs');
const vm = require('vm');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');

// Setup browser-like environment in vm sandbox
const sandbox = {
  window: {},
  console,
  Math,
  Date,
  Array,
  Object,
  Set,
  Map,
  Number,
  String,
  Boolean,
  JSON,
  parseInt,
  parseFloat,
  isNaN,
  isFinite
};
sandbox.window = sandbox;

vm.createContext(sandbox);

// 1. Load real data bundle
vm.runInContext(fs.readFileSync('src/data/real_data_bundle.js', 'utf8'), sandbox);
const bundle = sandbox.__ARGON_REAL_BUNDLE__ || sandbox.window.__ARGON_REAL_BUNDLE__;

// 2. Load customConsolidator
vm.runInContext(fs.readFileSync('src/modules/customConsolidator.js', 'utf8'), sandbox);
const CustomConsolidator = sandbox.ArgonBI?.CustomConsolidator || sandbox.window?.ArgonBI?.CustomConsolidator;

// 3. Load commercialMathEngine
vm.runInContext(fs.readFileSync('src/modules/commercialMathEngine.js', 'utf8'), sandbox);
const CommercialMathEngine = sandbox.ArgonBI?.CommercialMathEngine || sandbox.window?.ArgonBI?.CommercialMathEngine;

// 4. Load galaxiaEngine
vm.runInContext(fs.readFileSync('src/modules/galaxiaEngine.js', 'utf8'), sandbox);
const GalaxiaEngine = sandbox.ArgonBI?.GalaxiaEngine || sandbox.window?.ArgonBI?.GalaxiaEngine;

// 5. Read October Excel
const maPath = '1. Bases/Base a la Fecha MA.xlsx';
const wb = XLSX.read(fs.readFileSync(maPath), { type: 'buffer' });
const ws = wb.Sheets[wb.SheetNames[0]];
const maRows = XLSX.utils.sheet_to_json(ws);
console.log('Read MA rows:', maRows.length);

// Upsert partition
const upsertRes = CustomConsolidator.upsertSalesPartition(bundle, maRows, {
  partitionPeriod: '2026/10',
  fileName: 'Base a la Fecha MA.xlsx'
});
console.log('Upsert result:', {
  success: upsertRes.success,
  appendedCount: upsertRes.appendedCount,
  detectedPeriod: upsertRes.detectedPeriod
});

CommercialMathEngine.ensureIndexes(bundle);

// Run Tablero Ventas Taco
const res = GalaxiaEngine.computeTableroVentasTaco(bundle, { periodo: '2026/10' });
console.log('\n======================================================');
console.log('RECONCILIATION AUDIT: Dashboard LuanBeer vs Tablero Ventas.xlsb');
console.log('Scorecard:', res.activeTitle);
console.log('Fecha Corte:', res.fechaCorte);
console.log('======================================================\n');

const targets = {
  'CCC CERVEZA': { excel: 1038, antes: 1039 },
  'TOTAL DISTRIBUTION CZA': { excel: 6176, antes: 6183 },
  'TOTAL DISTRIBUTION NABS': { excel: 5193, antes: 5205 },
  'CCC UNG': { excel: 797, antes: 799 },
  'TBD ABOVECORE': { excel: 2449, antes: 2444 },
  'TBD LATONES': { excel: 1935, antes: 1932 },
  'TBD BALANCED CHOICES': { excel: 1508, antes: 1510 },
  'TBD NABS TOP': { excel: 2956, antes: 2966 }
};

let allPass = true;
console.log('| KPI | ANTES | EXCEL TARGET | DESPUÉS (APP) | DIFERENCIA | TENDENCIA | PROY LE | STATUS |');
console.log('|---|---:|---:|---:|---:|---:|---:|:---:|');

for (const item of (res.kpiItems || [])) {
  const t = targets[item.indicador];
  if (!t) continue;
  const diff = item.real - t.excel;
  const status = diff === 0 ? '✅ 1:1 EXACT' : '❌ DIFF';
  if (diff !== 0) allPass = false;
  console.log(`| ${item.indicador.padEnd(23)} | ${String(t.antes).padStart(5)} | ${String(t.excel).padStart(12)} | ${String(item.real).padStart(13)} | ${String(diff).padStart(10)} | ${(item.tendenciaRatio + '%').padStart(9)} | ${String(item.proyeccionCierreLE).padStart(7)} | ${status} |`);
}

console.log('\n--- AUDITORÍA DE VOLÚMENES Y DINERO (TACO RESULTADOS) ---');
for (const item of (res.rtoItems || [])) {
  console.log(`  ${item.indicador.padEnd(30)}: Real=${item.real} | Obj=${item.objetivo} | Alc=${item.alcancePct}% | Tend=${item.tendenciaRatio}% | Proy=${item.proyectadoCierre}`);
}

console.log('\n--- AUDITORÍA DE CLIENTES / FILAS MEDIANTE auditAllMandoIntegralKpis ---');
const auditReport = GalaxiaEngine.auditAllMandoIntegralKpis(bundle, { periodo: '2026/10' });
for (const [k, v] of Object.entries(auditReport)) {
  console.log(`  ${k.padEnd(25)}: distinctClients=${v.distinctClients} | countRows=${v.count}`);
}

if (allPass) {
  console.log('\n🎉 ALL 8 KPIS MATCH EXCEL TARGET 1:1 WITH ZERO DIFFERENCE! 🎉\n');
} else {
  console.error('\n❌ RECONCILIATION FAILED!\n');
  process.exit(1);
}
