'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');
global.XLSX = XLSX;

const CustomConsolidator = require('../src/modules/customConsolidator.js');
const PersistenceEngine = require('../src/modules/persistenceEngine.js');
const CommercialMathEngine = require('../src/modules/commercialMathEngine.js');
const GalaxiaEngine = require('../src/modules/galaxiaEngine.js');

function loadFreshRealBundle() {
  const code = fs.readFileSync(path.join(__dirname, '../src/data/real_data_bundle.js'), 'utf8');
  const sb = { window: {} };
  require('vm').runInNewContext(code, sb);
  return sb.window.__ARGON_REAL_BUNDLE__;
}

function loadOctubreFileRows() {
  const buf = fs.readFileSync(path.join(__dirname, '../1. Bases/Base a la Fecha MA.xlsx'));
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: null });
}

async function runTests() {
  console.log('=== INICIANDO PRUEBA OBLIGATORIA DE REEMPLAZO MENSUAL Y MANDO INTEGRAL (SECCIÓN 24) ===\n');

  // 1. Auditoría de mes cerrado 2026/09 contra Tablero Ventas.xlsb
  const bundle = loadFreshRealBundle();
  const initialTotalRows = bundle.salesColumnar.count; // 266,096 (256,186 de 2025/01..2026/09 + 9,910 de 2026/10)
  assert.strictEqual(initialTotalRows, 266096, 'El bundle inicial debe contener exactamente 266.096 filas totales (256.186 Ene25-Sep26 + 9.910 Oct26)');

  const tacoSep = GalaxiaEngine.computeTableroVentasTaco(bundle, { periodo: '2026/09' });
  const sepKpiMap = Object.fromEntries(tacoSep.kpiItems.map(i => [i.indicador, i]));
  const sepRtoMap = Object.fromEntries(tacoSep.rtoItems.map(i => [i.indicador, i]));

  assert.strictEqual(sepKpiMap['CCC CERVEZA'].real, 1095, '2026/09 CCC CERVEZA debe ser 1095');
  assert.strictEqual(sepKpiMap['CCC UNG'].real, 947, '2026/09 CCC UNG debe ser 947');
  assert.strictEqual(sepKpiMap['TBD ABOVECORE'].real, 3354, '2026/09 TBD ABOVECORE debe ser 3354');
  assert.strictEqual(sepKpiMap['TBD LATONES'].real, 2152, '2026/09 TBD LATONES debe ser 2152');
  assert.strictEqual(sepKpiMap['TBD BALANCED CHOICES'].real, 2042, '2026/09 TBD BALANCED CHOICES debe ser 2042');
  assert.strictEqual(sepRtoMap['VOL TOTAL CZA (TACO)'].real, 2414.82, '2026/09 VOL TOTAL CZA activo debe ser 2414.82 HL');
  assert.strictEqual(sepRtoMap['VOL TOTAL UNG (TACO)'].real, 875.71, '2026/09 VOL TOTAL UNG activo debe ser 875.71 HL');
  assert.strictEqual(sepRtoMap['VOL ABOVECORE (TACO)'].real, 317.33, '2026/09 VOL ABOVECORE activo debe ser 317.33 HL');
  console.log('✓ [Paso 1] Validación Relacional Star Schema en mes cerrado 2026/09 contra Tablero Ventas.xlsb: OK');

  // 2. Cargar Versión 1 de Base a la fecha MA (Octubre 2026: 9.910 filas reales)
  const v1RawRows = loadOctubreFileRows();
  const resV1 = CustomConsolidator.upsertSalesPartition(bundle, v1RawRows, {
    fileName: 'Base a la Fecha MA.xlsx (V1)'
  });

  assert.strictEqual(resV1.success, true, 'Ingesta V1 debe ser exitosa');
  assert.strictEqual(resV1.detectedPeriod, '2026/10', 'Período detectado V1 debe ser 2026/10');
  assert.strictEqual(resV1.replacedCount, 0, 'En la primera carga de 2026/10 sobre histórico Ene25-Sep26, replacedCount debe ser 0');
  assert.strictEqual(resV1.appendedCount, 9910, 'Filas insertadas en V1 deben ser 9.910');
  assert.strictEqual(resV1.preservedHistoricalCount, 266096, 'Filas históricas preservadas (2025/01..2026/09) deben ser 266.096');
  assert.strictEqual(bundle.salesColumnar.count, 276006, 'Total de filas tras V1 debe ser 276.006');
  assert.strictEqual(resV1.diagnostic.anuladosDescartadosClientsCount, 0, 'En 2026/10 V1 todos los clientes tienen Anulado=NO (0 anulados)');
  assert.strictEqual(resV1.diagnostic.anuladosDescartadosRowsCount, 0, 'En 2026/10 V1 hay 0 filas de clientes Anulado=SI');
  assert.strictEqual(tacoSep.fuenteDatos.modeloRelacional.clientesAnuladosDescartados, 6, 'En 2026/09 el modelo relacional descarta exactamente 6 clientes con Anulado=SI');
  assert.strictEqual(tacoSep.fuenteDatos.modeloRelacional.filasDescartadasAnulado, 19, 'En 2026/09 el modelo relacional descarta exactamente 19 filas de clientes con Anulado=SI');

  await PersistenceEngine.saveCustomSource({
    id: `PARTITION_${resV1.detectedPeriod}`,
    fileName: 'Base a la Fecha MA.xlsx (V1)',
    partitionPeriod: resV1.detectedPeriod,
    isUserOverride: true,
    rowsCount: resV1.appendedCount,
    diagnostic: resV1.diagnostic,
    data: resV1.normalizedRows
  });

  const tacoV1 = GalaxiaEngine.computeTableroVentasTaco(bundle, { periodo: '2026/10' });
  const v1Kpis = Object.fromEntries(tacoV1.kpiItems.map(i => [i.indicador, i]));
  const v1Rtos = Object.fromEntries(tacoV1.rtoItems.map(i => [i.indicador, i]));

  assert.strictEqual(v1Kpis['CCC CERVEZA'].real, 901, 'V1 CCC CERVEZA debe ser 901');
  assert.strictEqual(v1Kpis['TOTAL DISTRIBUTION CZA'].real, 5175, 'V1 TOTAL DISTRIBUTION CZA debe ser 5175');
  assert.strictEqual(v1Kpis['TOTAL DISTRIBUTION NABS'].real, 4175, 'V1 TOTAL DISTRIBUTION NABS debe ser 4175');
  assert.strictEqual(v1Kpis['CCC UNG'].real, 696, 'V1 CCC UNG debe ser 696');
  assert.strictEqual(v1Kpis['TBD ABOVECORE'].real, 2489, 'V1 TBD ABOVECORE debe ser 2489');
  assert.strictEqual(v1Kpis['TBD LATONES'].real, 574, 'V1 TBD LATONES debe ser 574');
  assert.strictEqual(v1Kpis['TBD BALANCED CHOICES'].real, 1435, 'V1 TBD BALANCED CHOICES debe ser 1435');
  assert.strictEqual(v1Kpis['TBD NABS TOP'].real, 2685, 'V1 TBD NABS TOP debe ser 2685');
  assert.strictEqual(v1Rtos['VOL TOTAL CZA (TACO)'].real, 1285.32, 'V1 VOL TOTAL CZA debe ser 1285.32 HL');
  assert.strictEqual(v1Rtos['VOL TOTAL UNG (TACO)'].real, 378.1, 'V1 VOL TOTAL UNG debe ser 378.1 HL');
  console.log('✓ [Paso 2] Carga V1 (2026/10 - 9.910 filas) y cálculo dinámico de Mando Integral: OK');
  console.log('   -> Scores V1:', JSON.stringify(tacoV1.scores));
  console.log('   -> Diagnóstico V1:', JSON.stringify(resV1.diagnostic));

  // 3. Cargar Versión 2 de Base a la fecha MA (mismo mes 2026/10 con nuevos registros y mayor avance)
  const v2Rows = resV1.normalizedRows.map(r => ({ ...r }));
  const czaProdObj = bundle.masters.portfolio.find(p => p.unidadNegocio === 'CERVEZAS' && p.segmento === 'CORE');
  const ungProdObj = bundle.masters.portfolio.find(p => p.unidadNegocio === 'UNG' && p.topUng === 'TOP UNG');
  const czaCode = czaProdObj ? czaProdObj.codigo : v2Rows[0].prod;
  const ungCode = ungProdObj ? ungProdObj.codigo : v2Rows[1].prod;

  // Agregar 340 nuevas transacciones simulando un nuevo corte del mismo mes 2026/10
  for (let i = 0; i < 340; i++) {
    const baseRow = v2Rows[i % 100];
    v2Rows.push({
      per: '2026/10',
      cte: 90000 + i, // nuevos clientes activos compradores en el corte V2
      prod: i % 2 === 0 ? czaCode : ungCode,
      canal: baseRow.canal || 'Tradicional',
      vend: (i % 8) + 1,
      sup: 101,
      ccc: 1,
      bultos: 5,
      hl: i % 2 === 0 ? 0.85 : 0.30,
      neto: i % 2 === 0 ? 125000 : 45000,
      bonif: 0,
      fecha: '2026-10-24'
    });
  }

  const resV2 = CustomConsolidator.upsertSalesPartition(bundle, v2Rows, {
    fileName: 'Base a la Fecha MA.xlsx (V2 - Corte 24/10)'
  });

  assert.strictEqual(resV2.success, true, 'Ingesta V2 debe ser exitosa');
  assert.strictEqual(resV2.detectedPeriod, '2026/10', 'Período detectado V2 debe ser 2026/10');
  assert.strictEqual(resV2.replacedCount, 9910, 'V2 debe eliminar exactamente las 9.910 filas de V1');
  assert.strictEqual(resV2.appendedCount, 10250, 'V2 debe insertar exactamente las 10.250 filas de la nueva versión');
  assert.strictEqual(resV2.preservedHistoricalCount, 266096, 'Los meses 2025/01..2026/09 (266.096 filas) deben permanecer 100% intactos');
  assert.strictEqual(bundle.salesColumnar.count, 276346, 'Total de filas en salesColumnar debe ser 276.346 (sin duplicar V1 + V2)');

  await PersistenceEngine.saveCustomSource({
    id: `PARTITION_${resV2.detectedPeriod}`,
    fileName: 'Base a la Fecha MA.xlsx (V2 - Corte 24/10)',
    partitionPeriod: resV2.detectedPeriod,
    isUserOverride: true,
    rowsCount: resV2.appendedCount,
    diagnostic: resV2.diagnostic,
    data: resV2.normalizedRows
  });

  // Verificar que IndexedDB / custom_sources tenga una única partición para 2026/10 (la V2)
  const savedSources = await PersistenceEngine.getCustomSources();
  const octSources = savedSources.filter(s => s.partitionPeriod === '2026/10');
  assert.strictEqual(octSources.length, 1, 'IndexedDB (custom_sources) debe conservar exactamente 1 registro para la partición 2026/10');
  assert.strictEqual(octSources[0].rowsCount, 10250, 'La partición guardada en IndexedDB debe ser la V2 (10.250 filas)');

  // Verificar recálculo dinámico de Mando Integral en V2
  const tacoV2 = GalaxiaEngine.computeTableroVentasTaco(bundle, { periodo: '2026/10' });
  const v2Kpis = Object.fromEntries(tacoV2.kpiItems.map(i => [i.indicador, i]));
  const v2Rtos = Object.fromEntries(tacoV2.rtoItems.map(i => [i.indicador, i]));

  assert(v2Kpis['CCC CERVEZA'].real > v1Kpis['CCC CERVEZA'].real, 'V2 CCC CERVEZA debe incrementarse dinámicamente respecto de V1');
  assert(v2Rtos['VOL TOTAL CZA (TACO)'].real > v1Rtos['VOL TOTAL CZA (TACO)'].real, 'V2 VOL TOTAL CZA debe incrementarse dinámicamente respecto de V1');
  assert(v2Rtos['VOL TOTAL UNG (TACO)'].real > v1Rtos['VOL TOTAL UNG (TACO)'].real, 'V2 VOL TOTAL UNG debe incrementarse dinámicamente respecto de V1');
  assert(tacoV2.scores.tacoTotalPct > tacoV1.scores.tacoTotalPct, 'V2 TACO TOTAL % debe actualizarse dinámicamente respecto de V1');
  console.log('✓ [Paso 3] Reemplazo Mensual V1 -> V2 (sin duplicación, meses cerrados intactos y Mando Integral recalculado): OK');
  console.log('   -> Scores V2:', JSON.stringify(tacoV2.scores));
  console.log('   -> Diagnóstico V2:', JSON.stringify(resV2.diagnostic));

  // 4. Simular recarga F5 desde un bundle fresco leyendo de PersistenceEngine (IndexedDB)
  const freshBundleOnF5 = loadFreshRealBundle();
  assert.strictEqual(freshBundleOnF5.salesColumnar.count, 266096, 'Al iniciar F5 antes de hidratar IndexedDB, el bundle base tiene 266.096 filas');
  const persistedAfterF5 = await PersistenceEngine.getCustomSources();
  for (const sp of persistedAfterF5.filter(s => s.partitionPeriod && Array.isArray(s.data))) {
    CustomConsolidator.upsertSalesPartition(freshBundleOnF5, sp.data, {
      partitionPeriod: sp.partitionPeriod,
      fileName: sp.fileName
    });
  }
  assert.strictEqual(freshBundleOnF5.salesColumnar.count, 276346, 'Tras recarga F5 e hidratación desde IndexedDB, el bundle conserva las 276.346 filas de V2');
  const tacoAfterF5 = GalaxiaEngine.computeTableroVentasTaco(freshBundleOnF5, { periodo: '2026/10' });
  assert.strictEqual(tacoAfterF5.scores.tacoTotalPct, tacoV2.scores.tacoTotalPct, 'Tras F5, el TACO TOTAL % coincide exactamente con V2');
  console.log('✓ [Paso 4] Persistencia en IndexedDB y recuperación exacta tras F5: OK');

  // 5. Prueba de Rollback ante archivo inválido o vacío
  const resInvalid = CustomConsolidator.upsertSalesPartition(freshBundleOnF5, [], {
    fileName: 'Archivo_Vacio_Invalido.xlsx'
  });
  assert.strictEqual(resInvalid.success, false, 'Un archivo vacío debe fallar la validación');
  assert.strictEqual(resInvalid.rolledBack, true, 'Debe indicar rolledBack = true');
  assert.strictEqual(freshBundleOnF5.salesColumnar.count, 276346, 'Los datos previos deben quedar 100% intactos tras el rollback');
  console.log('✓ [Paso 5] Rollback atómico ante archivo inválido preservando datos previos: OK');

  console.log('\n=== TODAS LAS PRUEBAS DE REEMPLAZO MENSUAL Y MANDO INTEGRAL PASARON EXITOSAMENTE ===');
}

runTests().catch(err => {
  console.error('❌ Error en test_monthly_replace_and_mando_integral:', err);
  process.exit(1);
});
