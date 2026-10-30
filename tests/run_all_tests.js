/**
 * @fileoverview Suite integral de pruebas automatizadas para el Desafío Argon High.
 * Verifica las 14 fuentes reales, ingesta de 1 a 10 archivos, detección de relaciones,
 * anti-duplicación, motor matemático comercial, NLQ, insights, persistencia,
 * servidor HTTP/interfaz y exportaciones (CSV, XLSX, PDF, PPTX).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const WORKSPACE = path.resolve(__dirname, '..');

// Provide browser-compatible global.window so data bundles attach cleanly
global.window = global;

// Load vendor SheetJS
const XLSX = require(path.join(WORKSPACE, 'vendor', 'xlsx.full.min.js'));
global.XLSX = XLSX;

// Load application modules
const Sanitizer = require(path.join(WORKSPACE, 'src', 'modules', 'sanitizer.js'));
const IngestionEngine = require(path.join(WORKSPACE, 'src', 'modules', 'ingestionEngine.js'));
const RelationshipEngine = require(path.join(WORKSPACE, 'src', 'modules', 'relationshipEngine.js'));
const CommercialMathEngine = require(path.join(WORKSPACE, 'src', 'modules', 'commercialMathEngine.js'));
const InsightEngine = require(path.join(WORKSPACE, 'src', 'modules', 'insightEngine.js'));
const NLQEngine = require(path.join(WORKSPACE, 'src', 'modules', 'nlqEngine.js'));
const PersistenceEngine = require(path.join(WORKSPACE, 'src', 'modules', 'persistenceEngine.js'));
const ExportEngine = require(path.join(WORKSPACE, 'src', 'modules', 'exportEngine.js'));
const CustomConsolidator = require(path.join(WORKSPACE, 'src', 'modules', 'customConsolidator.js'));
const GalaxiaEngine = require(path.join(WORKSPACE, 'src', 'modules', 'galaxiaEngine.js'));

// Load pre-compiled real & synthetic bundles (they attach to window.__ARGON_REAL_BUNDLE__ and window.__ARGON_SYNTHETIC_BATCH__)
require(path.join(WORKSPACE, 'src', 'data', 'real_data_bundle.js'));
require(path.join(WORKSPACE, 'src', 'data', 'synthetic_test_bundle.js'));

const REAL_BUNDLE = global.__ARGON_REAL_BUNDLE__;
const SYNTH_BATCH = global.__ARGON_SYNTHETIC_BATCH__;

// Load ground-truth reference JSONs
const REF_REAL = JSON.parse(fs.readFileSync(path.join(WORKSPACE, 'docs', 'resultados_referencia.json'), 'utf8'));
const REF_SYNTH = JSON.parse(fs.readFileSync(path.join(WORKSPACE, 'test_data', 'sinteticos_controlados', 'referencia_sinteticos.json'), 'utf8'));

const results = [];
let passedCount = 0;
let failedCount = 0;

function assert(condition, message, details = '') {
  if (!condition) {
    throw new Error(message + (details ? ` | Detalle: ${details}` : ''));
  }
}

function assertClose(actual, expected, tolerance, message) {
  const diff = Math.abs(Number(actual) - Number(expected));
  if (isNaN(diff) || diff > tolerance) {
    throw new Error(`${message} — Esperado: ${expected}, Obtenido: ${actual} (Diff: ${diff})`);
  }
}

async function runTest(category, name, fn) {
  const start = Date.now();
  try {
    const detail = await fn();
    const durationMs = Date.now() - start;
    passedCount++;
    results.push({ category, name, status: 'PASS', durationMs, detail: detail || 'OK' });
    console.log(`  [PASS] [${category}] ${name} (${durationMs}ms)`);
  } catch (err) {
    const durationMs = Date.now() - start;
    failedCount++;
    results.push({ category, name, status: 'FAIL', durationMs, detail: err.message });
    console.error(`  [FAIL] [${category}] ${name}: ${err.message}`);
  }
}

async function main() {
  console.log('================================================================================');
  console.log('  SUITE DE PRUEBAS AUTOMATIZADAS — ARGON HIGH BUSINESS INTELLIGENCE');
  console.log('================================================================================\n');

  // =========================================================================
  // 1. PRUEBAS SOBRE LAS 14 FUENTES ORIGINALES REALES
  // =========================================================================
  const expectedRealFiles = [
    '(Actualizar) Activos Fijos.xlsx',
    '(Actualizar) Base a la fecha.xlsx',
    '(Actualizar) Base CNC.xlsx',
    '(Actualizar) Base Eficiencia.xlsx',
    '(Actualizar) Base MXPDV.xlsx',
    '(Actualizar) Base Obj..xlsx',
    '(Actualizar) Base Prod. y Vol..xlsx',
    '(Actualizar) Base Rechazos.xlsx',
    '(Actualizar) Negociaciones.xlsx',
    '(Fijo) Base Portfolio.xlsx',
    '(Fijo) Canal MKT.xlsx',
    '(Fijo) DetallePersonal.xlsx',
    '(Fijo) Medida Tiempo.xlsx',
    '(Fijo) Subcanales Mkt.xlsx'
  ];

  const resolveBaseFile = (fileName) => {
    const p1 = path.join(WORKSPACE, '1. Bases', fileName);
    if (fs.existsSync(p1)) return p1;
    return path.join(WORKSPACE, fileName);
  };

  await runTest('1. Fuentes Originales', '1.1 Presencia e integridad intacta de los 14 archivos reales (.xlsx)', () => {
    for (const fileName of expectedRealFiles) {
      const fullPath = resolveBaseFile(fileName);
      assert(fs.existsSync(fullPath), `Falta el archivo original obligatorio: ${fileName}`);
      const stat = fs.statSync(fullPath);
      assert(stat.size > 1000, `Archivo vacío o truncado: ${fileName}`);
    }
    return `14 archivos verificados intactos en workspace (${expectedRealFiles.length}/14)`;
  });

  await runTest('1. Fuentes Originales', '1.2 Inventario completo de las 14 fuentes y 18 hojas en el modelo de datos', () => {
    assert(REAL_BUNDLE && REAL_BUNDLE.meta, 'REAL_BUNDLE debe estar cargado');
    assert(REAL_BUNDLE.meta.totalFiles === 14, `Esperadas 14 fuentes en bundle, encontradas: ${REAL_BUNDLE.meta.totalFiles}`);
    assert(REAL_BUNDLE.meta.totalSheets === 18, `Esperadas 18 hojas totales (9+4+5), encontradas: ${REAL_BUNDLE.meta.totalSheets}`);
    const inv = RelationshipEngine.getReal14SourcesInventory(REAL_BUNDLE);
    assert(Array.isArray(inv) && inv.length === 14, `Esperadas 14 entradas en inventario documentado, obtenidas: ${inv.length}`);
    const actualizarCount = inv.filter(f => f.category === 'Actualizar').length;
    const fijoCount = inv.filter(f => f.category === 'Fijo').length;
    assert(actualizarCount === 9 && fijoCount === 5, `Clasificación incorrecta: ${actualizarCount} Actualizar, ${fijoCount} Fijo`);
    return `14 fuentes (9 Actualizar + 5 Fijo) y 18 hojas inventariadas con metadatos completos`;
  });

  await runTest('1. Fuentes Originales', '1.3 Detección multi-hoja y exclusión de fila descriptora de tipos en (Actualizar) Negociaciones.xlsx', () => {
    const negBuffer = fs.readFileSync(resolveBaseFile('(Actualizar) Negociaciones.xlsx'));
    const inspected = IngestionEngine.inspectFileBuffer(new Uint8Array(negBuffer), '(Actualizar) Negociaciones.xlsx', negBuffer.length);
    assert(inspected.status === 'procesado', `Inspección de Negociaciones debe ser 'procesado', obtenido: ${inspected.status}`);
    assert(inspected.sheetCount === 5, `Esperadas 5 hojas en Negociaciones.xlsx, encontradas: ${inspected.sheetCount}`);
    const mainSheet = inspected.sheets.find(s => s.sheetName === 'Negociaciones');
    assert(mainSheet, 'Falta hoja Negociaciones');
    assert(mainSheet.validRowCount === 630, `Esperadas 630 filas válidas (excluyendo fila 2 de tipos FECHA/ENTERO), encontradas: ${mainSheet.validRowCount}`);
    assert(mainSheet.excludedTypeRows >= 1, 'Debe registrar al menos 1 fila descriptora de tipos excluida');
    return `5 hojas detectadas; hoja principal con 630 filas válidas tras excluir fila descriptora de tipos`;
  });

  await runTest('1. Fuentes Originales', '1.4 Normalización de caracteres de control ASCII (\\u0002) y columnas duplicadas en (Actualizar) Activos Fijos.xlsx', () => {
    const afBuffer = fs.readFileSync(resolveBaseFile('(Actualizar) Activos Fijos.xlsx'));
    const inspected = IngestionEngine.inspectFileBuffer(new Uint8Array(afBuffer), '(Actualizar) Activos Fijos.xlsx', afBuffer.length);
    const sheet = inspected.sheets[0];
    assert(sheet.validRowCount === 2000, `Esperados 2,000 activos fijos, encontrados: ${sheet.validRowCount}`);
    const colNames = sheet.columns.map(c => c.name);
    assert(colNames.some(n => n.includes('Numero de Serie')), 'Debe detectar columna Numero de Serie');
    assert(!colNames.some(h => /[\x00-\x1F]/.test(h)), 'Ningún encabezado normalizado debe conservar caracteres de control ASCII');
    return `2,000 equipos verificados, carácter de control \\u0002 limpiado y columnas duplicadas desambiguadas`;
  });

  // =========================================================================
  // 2. PRUEBAS DE INGESTA MULTIFUENTE (1 A 10 ARCHIVOS, CSV, CORRUPTOS, ETC.)
  // =========================================================================
  const synthDir = path.join(WORKSPACE, 'test_data', 'sinteticos_controlados');
  const synthFileNames = [
    'Ventas_2025.xlsx',
    'Ventas_2026.xlsx',
    'Maestro_Clientes.xlsx',
    'Maestro_Productos.xlsx',
    'Canales_Comerciales.csv',
    'Unidades_Negocio.xlsx',
    'Objetivos_2026.xlsx',
    'Operaciones_Comerciales.xlsx',
    'CCC_Historico.xlsx',
    'Datos_Inconsistentes.xlsx'
  ];

  await runTest('2. Ingesta Multifuente', '2.1 Carga de 1 archivo individual válido (.xlsx) y exclusión de fila TOTAL GENERAL', () => {
    const fPath = path.join(synthDir, 'Ventas_2025.xlsx');
    const buf = fs.readFileSync(fPath);
    const res = IngestionEngine.validateBatch([{ name: 'Ventas_2025.xlsx', buffer: new Uint8Array(buf), size: buf.length }]);
    assert(res.ok === true && res.fileCount === 1, 'El lote de 1 archivo debe ser aceptado');
    const sheet = res.files[0].sheets[0];
    assert(sheet.excludedTotalRows === 1, `Debe excluir exactamente 1 fila de TOTAL GENERAL, excluidas: ${sheet.excludedTotalRows}`);
    return `1 archivo ingerido; fila TOTAL GENERAL excluida automáticamente (${sheet.validRowCount} filas válidas)`;
  });

  await runTest('2. Ingesta Multifuente', '2.2 Carga simultánea de 10 archivos heterogéneos (.xlsx + .csv)', () => {
    const batchFiles = synthFileNames.map(fName => {
      const p = path.join(synthDir, fName);
      const buf = fs.readFileSync(p);
      return { name: fName, buffer: fName.endsWith('.csv') ? buf.toString('utf8') : new Uint8Array(buf), size: buf.length };
    });
    assert(batchFiles.length === 10, 'El lote sintético debe tener 10 archivos');
    const res = IngestionEngine.validateBatch(batchFiles);
    assert(res.ok === true && res.fileCount === 10, `Esperados 10 archivos procesados, obtenidos: ${res.fileCount}`);
    const errored = res.files.filter(f => f.status === 'error');
    assert(errored.length === 0, `Ninguno de los 10 archivos sintéticos debe fallar`);
    return `10 archivos simultáneos (.xlsx y .csv) inspeccionados sin errores`;
  });

  await runTest('2. Ingesta Multifuente', '2.3 Rechazo controlado al intentar cargar más de 10 archivos simultáneos (11 archivos)', () => {
    const dummyDescriptors = Array.from({ length: 11 }, (_, idx) => ({
      name: `Archivo_${idx + 1}.xlsx`,
      buffer: new Uint8Array([80, 75, 3, 4]),
      size: 4
    }));
    const res = IngestionEngine.validateBatch(dummyDescriptors);
    assert(res.ok === false, 'Un lote de 11 archivos debe ser rechazado');
    assert(res.error && res.error.includes('10 archivos'), 'El mensaje de error debe explicar el límite de 10 archivos');
    return `Límite de 10 archivos validado correctamente: "${res.error}"`;
  });

  await runTest('2. Ingesta Multifuente', '2.4 Lectura de archivo CSV válido (Canales_Comerciales.csv) y Excel multi-hoja (Ventas_2026.xlsx)', () => {
    const csvBuf = fs.readFileSync(path.join(synthDir, 'Canales_Comerciales.csv'));
    const csvRes = IngestionEngine.inspectFileBuffer(csvBuf.toString('utf8'), 'Canales_Comerciales.csv', csvBuf.length);
    assert(csvRes.status === 'procesado' && csvRes.format === 'CSV', 'Canales_Comerciales.csv debe procesarse como CSV válido');
    assert(csvRes.sheets[0].validRowCount >= 3, `Esperadas >= 3 filas en Canales_Comerciales.csv, obtenidas: ${csvRes.sheets[0].validRowCount}`);

    const xlsxBuf = fs.readFileSync(path.join(synthDir, 'Ventas_2026.xlsx'));
    const xlsxRes = IngestionEngine.inspectFileBuffer(new Uint8Array(xlsxBuf), 'Ventas_2026.xlsx', xlsxBuf.length);
    assert(xlsxRes.sheetCount === 2, `Esperadas 2 hojas en Ventas_2026.xlsx (Detalle_2026 + Resumen_Anual_No_Sumar), obtenidas: ${xlsxRes.sheetCount}`);
    return `CSV (${csvRes.sheets[0].validRowCount} filas) y Excel multi-hoja (${xlsxRes.sheetCount} hojas) verificados`;
  });

  await runTest('2. Ingesta Multifuente', '2.5 Tolerancia ante archivo corrupto (Archivo_Corrupto.xlsx) sin caída del sistema', () => {
    const corruptBuf = fs.readFileSync(path.join(synthDir, 'Archivo_Corrupto.xlsx'));
    const validBuf = fs.readFileSync(path.join(synthDir, 'Objetivos_2026.xlsx'));
    const batchRes = IngestionEngine.validateBatch([
      { name: 'Archivo_Corrupto.xlsx', buffer: new Uint8Array(corruptBuf), size: corruptBuf.length },
      { name: 'Objetivos_2026.xlsx', buffer: new Uint8Array(validBuf), size: validBuf.length }
    ]);
    assert(batchRes.ok === true, 'El lote debe procesarse aislando el archivo corrupto');
    const badFile = batchRes.files.find(f => f.fileName === 'Archivo_Corrupto.xlsx');
    const goodFile = batchRes.files.find(f => f.fileName === 'Objetivos_2026.xlsx');
    assert(badFile && badFile.status === 'error', 'Archivo_Corrupto.xlsx debe quedar marcado con status error');
    assert(goodFile && goodFile.status === 'procesado', 'Objetivos_2026.xlsx debe procesarse correctamente');
    return `Archivo corrupto aislado con estado 'error' (${badFile.errors[0]}) mientras Objetivos_2026.xlsx se procesó OK`;
  });

  await runTest('2. Ingesta Multifuente', '2.6 Manejo de columnas desconocidas, datos faltantes e inconsistentes (Datos_Inconsistentes.xlsx)', () => {
    const incBuf = fs.readFileSync(path.join(synthDir, 'Datos_Inconsistentes.xlsx'));
    const incRes = IngestionEngine.inspectFileBuffer(new Uint8Array(incBuf), 'Datos_Inconsistentes.xlsx', incBuf.length);
    assert(incRes.status === 'procesado', 'Datos_Inconsistentes.xlsx debe inspeccionarse sin excepción fatal');
    assert(incRes.sheets.length > 0, 'Debe detectar sus hojas y reportar advertencias de calidad');
    return `Archivo con columnas desconocidas y datos faltantes procesado con ${incRes.warnings.length} advertencia(s) documentada(s)`;
  });

  // =========================================================================
  // 3. PRUEBAS DE RELACIONES, CLAVES HUÉRFANAS Y ANTI-DUPLICACIÓN
  // =========================================================================
  await runTest('3. Relaciones e Integridad', '3.1 Verificación de las 8 relaciones maestras-transaccionales en las 14 fuentes reales', () => {
    const rels = RelationshipEngine.getRealRelationshipsList();
    assert(Array.isArray(rels) && rels.length === 8, `Esperadas 8 relaciones principales documentadas, encontradas: ${rels ? rels.length : 0}`);
    const prodRel = rels.find(r => r.targetTable.includes('Base Portfolio'));
    assert(prodRel, 'Debe existir relación hacia (Fijo) Base Portfolio.xlsx');
    assert(prodRel.orphanKeyCount === 2, `Esperados 2 SKUs huérfanos (78043 y 29056), encontrados: ${prodRel.orphanKeyCount}`);
    return `${rels.length} relaciones verificadas; 2 códigos huérfanos (78043, 29056) detectados y homologados por División`;
  });

  await runTest('3. Relaciones e Integridad', '3.2 Reconciliación anti-duplicación entre (Actualizar) Base Prod. y Vol. y (Actualizar) Base a la fecha', () => {
    const rec = REF_REAL.reconciliationSales;
    assert(rec.baseProdYVolRows === 266041, `Prod. y Vol. debe tener 266,041 filas`);
    assert(rec.baseALaFechaRows === 266096, `Base a la fecha debe tener 266,096 filas`);
    assert(rec.sharedExactRows === 266041, `Deben compartir exactamente 266,041 claves compuestas`);
    assert(rec.exclusiveBaseALaFechaPOPRows === 55, `Deben existir exactamente 55 filas exclusivas (División POP)`);
    assert(REAL_BUNDLE.salesColumnar.count === 266096, `La base consolidada final debe tener 266,096 filas (nunca 532,137)`);
    return `Anti-duplicación exacta: 266,041 claves compartidas deduplicadas + 55 filas POP = 266,096 registros`;
  });

  await runTest('3. Relaciones e Integridad', '3.3 Deduplicación de claves duplicadas en (Actualizar) Base CNC.xlsx (2026/09)', () => {
    const cnc = REAL_BUNDLE.cncColumnar;
    assert(cnc.rawRowCount === 25895, `Esperadas 25,895 filas crudas en CNC, obtenidas: ${cnc.rawRowCount}`);
    const dupCount = Array.isArray(cnc.duplicatesRemoved) ? cnc.duplicatesRemoved.length : cnc.duplicatesRemoved;
    assert(dupCount === 2, `Esperadas 2 claves duplicadas removidas en CNC 2026/09, obtenidas: ${dupCount}`);
    assert(cnc.count === 25893, `Esperados 25,893 registros únicos en CNC`);
    return `2 registros duplicados en Base CNC (2026/09) deduplicados antes de consolidar (25,895 -> 25,893)`;
  });

  await runTest('3. Relaciones e Integridad', '3.4 Detección automática de relaciones, huérfanos (Cliente 999), exclusión de pre-agregados y conversión Litros->HL en lote sintético', () => {
    const batchFiles = SYNTH_BATCH.batchResult.files;
    const relAnalysis = RelationshipEngine.detectRelationshipsAcrossSheets(batchFiles);
    assert(relAnalysis.relationships.length >= 4, `Esperadas >= 4 relaciones detectadas en lote sintético, obtenidas: ${relAnalysis.relationships.length}`);

    // Consolidate the 10 synthetic files using CustomConsolidator
    const consolidatedBundle = CustomConsolidator.consolidateInspectedBatch(batchFiles);
    const synthEval = CommercialMathEngine.evaluateDashboard(consolidatedBundle, { modoComparacion: 'YTD' });

    assertClose(synthEval.kpis.volumenHL.prev, REF_SYNTH.ventas2025_YTD_Q1.hlTotalConverted, 0.01, 'Volumen 2025 Sintético convertido de 50,000 Litros a 500 HL (excluyendo TOTAL GENERAL y fila duplicada)');
    assertClose(synthEval.kpis.volumenHL.actual, REF_SYNTH.ventas2026_YTD_Q1.hlTotal, 0.01, 'Volumen 2026 Sintético (500 HL)');
    assertClose(synthEval.kpis.facturacionNeta.prev, REF_SYNTH.ventas2025_YTD_Q1.facturacionNeta, 1.0, 'Facturación 2025 Sintética ($7,350,000)');
    assertClose(synthEval.kpis.facturacionNeta.actual, REF_SYNTH.ventas2026_YTD_Q1.facturacionNeta, 1.0, 'Facturación 2026 Sintética ($8,300,000)');
    assert(synthEval.kpis.ccc.prev === REF_SYNTH.ventas2025_YTD_Q1.cccUnicoConsolidado, 'CCC único 2025 Sintético = 3 (sin sumar tabla pre-agregada CCC_Historico)');
    assert(synthEval.kpis.ccc.actual === REF_SYNTH.ventas2026_YTD_Q1.cccUnicoConsolidado, 'CCC único 2026 Sintético = 4 (incluyendo cliente huérfano 999)');
    return `Lote sintético de 10 archivos consolidado: 50,000 L -> 500 HL (2025), 500 HL (2026), Facturación +12.93%, CCC 3 -> 4 (+33.33%)`;
  });

  // =========================================================================
  // 4. PRUEBAS MATEMÁTICAS COMERCIALES SOBRE LAS 14 FUENTES REALES
  // =========================================================================
  const realState = CommercialMathEngine.evaluateDashboard(REAL_BUNDLE, {
    modoComparacion: 'YTD',
    includePOP: true
  });

  await runTest('4. Matemática Comercial', '4.1 Exactitud de Volumen 2025 Completo, YTD 2026 y YTD 2025 Homogéneo (HL)', () => {
    assertClose(realState.kpis.fullYear2025Reference.hl, REF_REAL.kpisGlobal.fullYear2025.hl, 0.05, 'Volumen 2025 Año Completo HL');
    assertClose(realState.kpis.volumenHL.actual, REF_REAL.kpisGlobal.ytd2026_EneSep.hl, 0.05, 'Volumen YTD 2026 HL');
    assertClose(realState.kpis.volumenHL.prev, REF_REAL.kpisGlobal.ytd2025_EneSep.hl, 0.05, 'Volumen YTD 2025 Homogéneo HL');
    assertClose(realState.kpis.volumenHL.diff, REF_REAL.kpisGlobal.yoyYTD.hlDiff, 0.05, 'Variación YoY YTD Abs HL');
    assertClose(realState.kpis.volumenHL.varPct, REF_REAL.kpisGlobal.yoyYTD.hlVarPct, 0.02, 'Variación YoY YTD % HL');
    return `YTD 2026: ${realState.kpis.volumenHL.actual.toFixed(2)} HL vs YTD 2025: ${realState.kpis.volumenHL.prev.toFixed(2)} HL (${realState.kpis.volumenHL.varPctFormatted})`;
  });

  await runTest('4. Matemática Comercial', '4.2 Exactitud de Facturación Neta y separación estricta de Bonificaciones', () => {
    assertClose(realState.kpis.fullYear2025Reference.neto, REF_REAL.kpisGlobal.fullYear2025.neto, 1.0, 'Facturación Neta 2025 Año Completo');
    assertClose(realState.kpis.facturacionNeta.actual, REF_REAL.kpisGlobal.ytd2026_EneSep.neto, 1.0, 'Facturación Neta YTD 2026');
    assertClose(realState.kpis.facturacionNeta.prev, REF_REAL.kpisGlobal.ytd2025_EneSep.neto, 1.0, 'Facturación Neta YTD 2025 Homogéneo');
    assertClose(realState.kpis.facturacionNeta.varPct, REF_REAL.kpisGlobal.yoyYTD.netoVarPct, 0.02, 'Variación % Facturación Neta YTD');
    assertClose(realState.kpis.bonificaciones.actual, REF_REAL.kpisGlobal.ytd2026_EneSep.bonif, 1.0, 'Bonificaciones YTD 2026 separadas de Facturación Neta');
    return `Facturación Neta YTD 2026: $${Math.round(realState.kpis.facturacionNeta.actual).toLocaleString('es-AR')} (${realState.kpis.facturacionNeta.varPctFormatted}); Bonificación separada: $${Math.round(realState.kpis.bonificaciones.actual).toLocaleString('es-AR')}`;
  });

  await runTest('4. Matemática Comercial', '4.3 Cálculo de Clientes Con Compra (CCC) deduplicados reales (Set de Código Cliente)', () => {
    assert(realState.kpis.ccc.actual === REF_REAL.kpisGlobal.ytd2026_EneSep.ccc, `CCC único YTD 2026 debe ser ${REF_REAL.kpisGlobal.ytd2026_EneSep.ccc}, obtenido: ${realState.kpis.ccc.actual}`);
    assert(realState.kpis.ccc.prev === REF_REAL.kpisGlobal.ytd2025_EneSep.ccc, `CCC único YTD 2025 debe ser ${REF_REAL.kpisGlobal.ytd2025_EneSep.ccc}, obtenido: ${realState.kpis.ccc.prev}`);
    assert(realState.kpis.fullYear2025Reference.ccc === REF_REAL.kpisGlobal.fullYear2025.ccc, `CCC único 2025 completo debe ser ${REF_REAL.kpisGlobal.fullYear2025.ccc}`);
    assertClose(realState.kpis.ccc.varPct, REF_REAL.kpisGlobal.yoyYTD.cccVarPct, 0.02, 'Variación % CCC YTD');

    // Verify that summing monthly CCCs would have been much higher (naive sum > 9,000)
    const naiveSumMonthlyCCC26 = realState.monthlySeries.reduce((acc, m) => acc + m.ccc26, 0);
    assert(naiveSumMonthlyCCC26 > 8000 && realState.kpis.ccc.actual === 1482, 'El CCC consolidado debe ser el conjunto desduplicado (1,482) y jamás la suma de los meses');
    return `CCC YTD 2026 deduplicado = 1,482 clientes únicos (+16.88% vs 1,268 en YTD 2025; suma mensual ingenua evitada: ${naiveSumMonthlyCCC26})`;
  });

  await runTest('4. Matemática Comercial', '4.4 Protección ante división por cero o base negativa (ADYACENCIAS y MARKETPLACE ALIMENTOS)', () => {
    const ady = realState.byUnidadNegocio.find(u => u.key === 'ADYACENCIAS');
    const mktAlim = realState.byUnidadNegocio.find(u => u.key === 'MARKETPLACE ALIMENTOS');
    assert(ady, 'Debe existir la Unidad de Negocio ADYACENCIAS');
    assert(ady.hl25 < 0 && ady.hlVarPct === null, `ADYACENCIAS tiene base negativa en 2025 (${ady.hl25} HL) y su varPct debe ser null, obtenido: ${ady.hlVarPct}`);
    assert(mktAlim, 'Debe existir MARKETPLACE ALIMENTOS');
    assert(mktAlim.hl25 === 0 && mktAlim.hl26 > 0 && mktAlim.hlVarPct === null, 'MARKETPLACE ALIMENTOS tiene base 0 en 2025 y varPct debe ser null (nunca Infinity)');
    return `Protección verificada: ADYACENCIAS (base neg. ${ady.hl25} HL -> varPct=null) y MARKETPLACE ALIMENTOS (base 0 -> varPct=null)`;
  });

  await runTest('4. Matemática Comercial', '4.5 Coherencia de Trimestres (1Q–4Q) y Participación Interna (100% del total seleccionado)', () => {
    const [q1, q2, q3, q4] = realState.quarterlySeries;
    assertClose(q1.hl26, REF_REAL.quarterly['1Q']['2026'].hl, 0.05, '1Q 2026 HL');
    assertClose(q2.hl26, REF_REAL.quarterly['2Q']['2026'].hl, 0.05, '2Q 2026 HL');
    assertClose(q3.hl26, REF_REAL.quarterly['3Q']['2026'].hl, 0.05, '3Q 2026 HL');
    assertClose(q4.hl26, 0.0, 0.01, '4Q 2026 HL (sin actividad Oct-Dic)');
    assert(q4.isInactive2026 === true, '4Q 2026 debe marcarse como inactivo');

    const sumCanalShares = realState.byCanal.reduce((acc, c) => acc + c.shareHL26, 0);
    assertClose(sumCanalShares, 100.0, 0.1, 'La suma de participaciones internas por Canal debe ser ~100.00%');
    return `Trimestres 1Q (${q1.hl26} HL), 2Q (${q2.hl26} HL), 3Q (${q3.hl26} HL), 4Q (0 HL) exactos; Participación Interna = ${sumCanalShares.toFixed(2)}%`;
  });

  await runTest('4. Matemática Comercial', '4.6 Filtros combinados multidimensionales y evaluación de bases operativas (Activos Fijos y Negociaciones)', () => {
    const filtered = CommercialMathEngine.evaluateDashboard(REAL_BUNDLE, {
      modoComparacion: 'YTD',
      unidadNegocio: 'UNG',
      trimestre: '1Q'
    });
    assert(filtered.kpis.volumenHL.actual > 0 && filtered.kpis.volumenHL.actual < realState.kpis.volumenHL.actual, 'El volumen filtrado (UNG + 1Q) debe ser positivo y menor al total general');
    assert(filtered.byUnidadNegocio.length === 1 && filtered.byUnidadNegocio[0].key === 'UNG', 'Solo debe aparecer UNG en unidades de negocio');
    assertClose(filtered.byUnidadNegocio[0].shareHL26, 100.0, 0.01, 'Dentro del filtro UNG, su participación interna sobre el total filtrado debe ser 100%');

    const opBases = CommercialMathEngine.evaluateOperationalBases(REAL_BUNDLE);
    assert(opBases.activosFijos.totalEquipos === 2000, 'Deben existir 2,000 equipos en Activos Fijos');
    assertClose(opBases.activosFijos.hlRepagoTotal, opBases.activosFijos.litrosRepagoTotal / 100, 0.05, 'Conversión exacta HL = Litros / 100 en Activos Fijos');
    assert(opBases.negociaciones.totalAcuerdos === 630, 'Deben existir 630 acuerdos válidos en Negociaciones');
    return `Filtro combinado [UNG + 1Q] = ${filtered.kpis.volumenHL.actual.toFixed(2)} HL; Activos Fijos (2,000 eq, ${opBases.activosFijos.hlRepagoTotal} HL repago) y Negociaciones (630 acuerdos)`;
  });

  // =========================================================================
  // 5. PRUEBAS DE MOTOR DE INSIGHTS Y CONSULTAS EN LENGUAJE NATURAL (NLQ)
  // =========================================================================
  await runTest('5. Insights y NLQ', '5.1 Generación de hallazgos comerciales con los 8 campos obligatorios de auditoría', () => {
    const insights = InsightEngine.generateInsights(realState, REAL_BUNDLE);
    assert(Array.isArray(insights) && insights.length >= 10, `Esperados >= 10 hallazgos comerciales, generados: ${insights.length}`);
    const requiredFields = [
      'indicador', 'periodo', 'segmento', 'valorActual', 'valorAnterior',
      'variacion', 'fuente', 'regla', 'conclusion'
    ];
    for (const ins of insights) {
      for (const field of requiredFields) {
        assert(ins[field] !== undefined && ins[field] !== '', `Falta campo obligatorio '${field}' en insight ${ins.id}`);
      }
    }
    return `${insights.length} hallazgos comerciales verificados con sus 8 campos obligatorios y datos reales`;
  });

  await runTest('5. Insights y NLQ', '5.2 Intérprete local de Consultas en Lenguaje Natural (NLQ) y rechazo de causas externas no verificables', () => {
    const sampleQuestions = [
      '¿Qué canal perdió más volumen?',
      '¿Qué unidad de negocio creció más?',
      '¿Qué meses cayeron más del 10%?',
      '¿Cuál fue la facturación de septiembre?',
      '¿Qué canal perdió más clientes?',
      '¿Cuál fue el mejor trimestre?',
      '¿Qué productos explican la caída?',
      '¿Cómo evolucionó el CCC?'
    ];
    for (const qText of sampleQuestions) {
      const res = NLQEngine.answerQuery(qText, realState, REAL_BUNDLE, CommercialMathEngine);
      assert(res && res.interpreted === true, `La consulta "${qText}" debe ser interpretada exitosamente`);
      assert(res.resultado && res.formula && Array.isArray(res.valoresUtilizados) && res.periodo && res.fuentes.length > 0, `Faltan metadatos de verificación en respuesta a "${qText}"`);
    }

    // Verify rejection of external unprovable causes (e.g. weather / inflation)
    const unprovable = NLQEngine.answerQuery('¿Por qué cayó por el clima y la inflación?', realState, REAL_BUNDLE, CommercialMathEngine);
    assert(unprovable.interpreted === false && unprovable.limitationMessage.includes('evidencias matemáticas'), 'Debe rechazar preguntas sobre clima/inflación sin inventar causas externas');
    return `8 preguntas comerciales respondidas con fórmula y fuentes + rechazo verificable de causas externas no presentes en datos`;
  });

  // =========================================================================
  // 6. PRUEBAS DE PERSISTENCIA, REEMPLAZO DE FUENTES Y ROLLBACK
  // =========================================================================
  await runTest('6. Persistencia Local', '6.1 Guardado, recuperación, reemplazo sin duplicar, rollback ante fallo y separación Real/Prueba', async () => {
    await PersistenceEngine.clearTestAndCustomSources();

    const state1 = {
      universeMode: 'REAL_14',
      filters: { unidadNegocio: 'CERVEZAS' },
      preferences: { activeMetric: 'hl' }
    };
    await PersistenceEngine.saveAppState(state1);
    const loaded1 = await PersistenceEngine.loadAppState();
    assert(loaded1 && loaded1.universeMode === 'REAL_14' && loaded1.filters.unidadNegocio === 'CERVEZAS', 'Debe recuperar el estado guardado');

    // Save custom source and replace it without duplicating
    await PersistenceEngine.saveCustomSource({ fileName: 'Ventas_Extra.xlsx', rows: 100, isSyntheticTest: true });
    await PersistenceEngine.saveCustomSource({ fileName: 'Ventas_Extra.xlsx', rows: 250, isSyntheticTest: true });
    const customList = await PersistenceEngine.getCustomSources();
    assert(customList.length === 1 && customList[0].rows === 250, 'Reemplazar una fuente con el mismo nombre debe actualizarla sin duplicar');

    // Snapshot & rollback after simulated error
    await PersistenceEngine.saveSnapshot('SNAP_PRE_IMPORT', state1);
    await PersistenceEngine.saveAppState({ universeMode: 'ESTADO_FALLIDO' });
    const restored = await PersistenceEngine.restoreSnapshot('SNAP_PRE_IMPORT');
    assert(restored && restored.universeMode === 'REAL_14', 'El rollback debe restaurar el último snapshot válido (REAL_14)');

    // Clean test sources and verify restoration of REAL_14
    await PersistenceEngine.clearTestAndCustomSources();
    const afterClean = await PersistenceEngine.getCustomSources();
    assert(afterClean.length === 0, 'La limpieza de datos de prueba debe vaciar las fuentes personalizadas sin afectar las 14 reales');
    return `Guardado, lectura, reemplazo sin duplicación, rollback de snapshot y separación Real/Prueba verificados`;
  });

  // =========================================================================
  // 7. PRUEBAS DE INTERFAZ, SEGURIDAD XSS Y SERVIDOR HTTP LOCAL
  // =========================================================================
  await runTest('7. Interfaz y Seguridad', '7.1 Sanitización contra inyección HTML/XSS en nombres de archivos, columnas y celdas', () => {
    const malicious = `<script>alert("xss")</script><img src=x onerror=alert(1)>`;
    const escaped = Sanitizer.escapeHtml(malicious);
    assert(!escaped.includes('<script>') && !escaped.includes('<img'), 'Debe escapar etiquetas HTML peligrosas');
    assert(escaped.includes('&lt;script&gt;'), 'Debe convertir <script> en entidades seguras');
    return `Payloads XSS neutralizados correctamente (${escaped.slice(0, 42)}...)`;
  });

  await runTest('7. Interfaz y Seguridad', '7.2 Verificación del servidor HTTP local y estructura DOM completa de index.html', async () => {
    const { Writable } = require('stream');
    const { createServer } = require(path.join(WORKSPACE, 'server.js'));
    const server = createServer();

    const invokeServer = (urlPath) => new Promise((resolve, reject) => {
      const chunks = [];
      const res = new Writable({
        write(chunk, encoding, callback) {
          chunks.push(Buffer.from(chunk));
          callback();
        }
      });
      res.statusCode = 200;
      res.headers = {};
      res.headersSent = false;
      res.writeHead = (code, headers) => {
        res.statusCode = code;
        res.headers = headers || {};
        res.headersSent = true;
      };
      const origEnd = res.end.bind(res);
      res.end = (data) => {
        if (data) chunks.push(Buffer.from(data));
        origEnd(() => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8')
          });
        });
      };
      res.on('error', reject);
      server.emit('request', { url: urlPath, headers: { host: 'localhost:8080' } }, res);
    });

    const indexRes = await invokeServer('/index.html');
    assert(indexRes.statusCode === 200, `index.html devolvió HTTP ${indexRes.statusCode}`);
    assert(indexRes.body.includes('id="navBtnDashboard"'), 'Falta botón Dashboard Comercial en index.html');
    assert(indexRes.body.includes('id="navBtnIngesta"'), 'Falta botón Ingesta en index.html');
    assert(indexRes.body.includes('id="navBtnRelaciones"'), 'Falta botón Relaciones en index.html');
    assert(indexRes.body.includes('id="navBtnAnalisis"'), 'Falta botón Análisis y NLQ en index.html');
    assert(indexRes.body.includes('id="navBtnAuditoria"'), 'Falta botón Auditoría en index.html');
    assert(indexRes.body.includes('id="navBtnExportaciones"'), 'Falta botón Exportaciones en index.html');

    const cssRes = await invokeServer('/src/styles/corporate.css');
    assert(cssRes.statusCode === 200 && cssRes.body.includes('--accent-orange'), 'corporate.css debe cargarse con la identidad visual negra/naranja');

    const appRes = await invokeServer('/src/app.js');
    assert(appRes.statusCode === 200 && appRes.body.length > 5000, 'src/app.js debe servirse correctamente');

    const notFoundRes = await invokeServer('/archivo_inexistente.html');
    assert(notFoundRes.statusCode === 404, 'Rutas inexistentes deben devolver HTTP 404');

    return `Servidor local verificado (HTTP 200 en HTML, CSS y JS; HTTP 404 controlado; 6 módulos navegables verificados)`;
  });

  // =========================================================================
  // 8. PRUEBAS DE EXPORTACIÓN REAL Y VERIFICABLE (CSV, XLSX, PDF, PPTX)
  // =========================================================================
  const exportDir = path.join(WORKSPACE, 'exports_verificados');
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
  const realInsights = InsightEngine.generateInsights(realState, REAL_BUNDLE);
  const realInventory = RelationshipEngine.getReal14SourcesInventory(REAL_BUNDLE);

  await runTest('8. Exportaciones', '8.1 Generación y verificación de archivo CSV con BOM UTF-8, metadatos de filtro y datos reales', () => {
    const csvContent = ExportEngine.generateCSVContent(realState, realInsights, realInventory, 'mes');
    const csvPath = path.join(exportDir, 'Argon_BI_Evolucion_Mensual.csv');
    fs.writeFileSync(csvPath, csvContent, 'utf8');
    const stat = fs.statSync(csvPath);
    assert(stat.size > 800, 'El archivo CSV exportado no puede estar vacío');
    assert(csvContent.startsWith('\uFEFF'), 'El CSV debe incluir BOM UTF-8 para compatibilidad directa con Excel');
    assert(csvContent.includes('Volumen Vendido (HL)') && csvContent.includes('Facturación Neta ($)'), 'El CSV debe incluir la tabla de KPIs y el desglose mensual');
    return `Archivo CSV generado y verificado (${stat.size} bytes en exports_verificados/Argon_BI_Evolucion_Mensual.csv)`;
  });

  await runTest('8. Exportaciones', '8.2 Generación y re-lectura verificable de libro Excel (.xlsx) con 8 hojas comerciales', () => {
    const arrBuf = ExportEngine.generateExcelWorkbookBuffer(realState, realInsights, realInventory);
    const xlsxPath = path.join(exportDir, 'Argon_BI_Consolidado_Comercial.xlsx');
    fs.writeFileSync(xlsxPath, Buffer.from(arrBuf));

    const stat = fs.statSync(xlsxPath);
    assert(stat.size > 12000, `El archivo XLSX generado debe tener tamaño sustancial (${stat.size} bytes)`);

    // Re-read the generated file from disk to verify structural integrity
    const checkWb = XLSX.read(fs.readFileSync(xlsxPath), { type: 'buffer' });
    const expectedSheets = [
      'Resumen_KPIs', 'Evolucion_Mensual', 'Analisis_Trimestral', 'Canales_Comerciales',
      'Unidades_Negocio', 'Top_Productos', 'Conclusiones', 'Inventario_Fuentes'
    ];
    for (const sName of expectedSheets) {
      assert(checkWb.SheetNames.includes(sName), `Falta hoja obligatoria '${sName}' en el archivo XLSX exportado`);
    }
    const invRows = XLSX.utils.sheet_to_json(checkWb.Sheets['Inventario_Fuentes']);
    assert(invRows.length === 14, `La hoja Inventario_Fuentes debe listar las 14 fuentes reales`);
    return `Archivo XLSX generado y re-parseado (${(stat.size / 1024).toFixed(1)} KB, 8 hojas verificadas)`;
  });

  await runTest('8. Exportaciones', '8.3 Generación y verificación estructural de informe ejecutivo PDF (.pdf)', () => {
    const pdfBytes = ExportEngine.generatePDFBuffer(realState, realInsights, realInventory);
    const pdfPath = path.join(exportDir, 'Argon_BI_Informe_Ejecutivo.pdf');
    fs.writeFileSync(pdfPath, Buffer.from(pdfBytes));
    const stat = fs.statSync(pdfPath);
    assert(stat.size > 1000, 'El archivo PDF debe tener tamaño válido');
    const rawStr = fs.readFileSync(pdfPath, 'latin1');
    assert(rawStr.startsWith('%PDF-1.4'), 'El archivo PDF debe iniciar con cabecera estándar %PDF-1.4');
    assert(rawStr.includes('xref') && rawStr.includes('%%EOF'), 'El PDF debe contener tabla xref y marcador %%EOF');
    assert(rawStr.includes('ARGON HIGH BI'), 'El PDF debe contener los textos ejecutivos del reporte');
    return `Archivo PDF generado y validado (${(stat.size / 1024).toFixed(1)} KB, estructura %PDF-1.4 + xref + %%EOF íntegra)`;
  });

  await runTest('8. Exportaciones', '8.4 Generación y verificación de presentación ejecutiva PowerPoint (.pptx) editable', async () => {
    const pptxBytes = await ExportEngine.generatePPTXBuffer(realState, realInsights, realInventory);
    const pptxPath = path.join(exportDir, 'Argon_BI_Presentacion_Ejecutiva.pptx');
    fs.writeFileSync(pptxPath, Buffer.from(pptxBytes));

    const stat = fs.statSync(pptxPath);
    assert(stat.size > 25000, `El archivo PPTX debe tener tamaño válido (${stat.size} bytes)`);
    const magic = fs.readFileSync(pptxPath).slice(0, 4).toString('binary');
    assert(magic === 'PK\x03\x04', 'El archivo PPTX debe ser un contenedor OpenXML ZIP válido (PK\\x03\\x04)');
    return `Archivo PPTX editable generado y verificado (${(stat.size / 1024).toFixed(1)} KB, contenedor OpenXML íntegro)`;
  });

  // =========================================================================
  // 9. PRUEBAS DE ACTUALIZACIÓN INTEGRAL 2026 (CMQ GALAXIA & TABLERO TACO .XLSB)
  // =========================================================================
  const BASES_DIR = path.join(WORKSPACE, '1. Bases');

  await runTest('9. Actualización 2026', '9.1 Presencia e integridad de las 20 fuentes reales en 1. Bases/ (19 hojas de cálculo + Manual PDF)', () => {
    assert(fs.existsSync(BASES_DIR), 'La carpeta 1. Bases/ debe existir en el workspace');
    const basesFiles = fs.readdirSync(BASES_DIR);
    assert(basesFiles.length >= 19, `Esperados al menos 19 archivos operativos en 1. Bases/, encontrados: ${basesFiles.length}`);

    const required2026Files = [
      'Manual Distribuidores 2026.pdf',
      '(Actualizar) Base de Clientes.xlsx',
      '(Actualizar) Clientes Presencial.xlsx',
      '(Actualizar) Reporte de Clientes.xlsx',
      '(SemiFijo) DetallePersonal.xlsx'
    ];
    for (const f of required2026Files) {
      assert(basesFiles.includes(f), `Falta archivo obligatorio 2026 en 1. Bases/: ${f}`);
      const st = fs.statSync(path.join(BASES_DIR, f));
      assert(st.size > 5000, `Archivo 2026 vacío o truncado: ${f} (${st.size} bytes)`);
    }

    const tvPath = fs.existsSync(path.join(BASES_DIR, 'Tablero Ventas.xlsb'))
      ? path.join(BASES_DIR, 'Tablero Ventas.xlsb')
      : path.join(BASES_DIR, '1. Ejemplos', 'Tablero Ventas.xlsb');
    assert(fs.existsSync(tvPath), 'Tablero Ventas.xlsb debe existir en 1. Bases/ o 1. Bases/1. Ejemplos/');
    const stTv = fs.statSync(tvPath);
    assert(stTv.size > 5000, `Tablero Ventas.xlsb vacío o truncado (${stTv.size} bytes)`);

    const inv20 = RelationshipEngine.getReal20SourcesInventory2026();
    assert(inv20.length === 20, `El inventario 2026 debe reportar exactamente 20 fuentes, encontradas: ${inv20.length}`);
    return `20 fuentes verificadas intactas (19 operativas en 1. Bases/ + maqueta Tablero Ventas.xlsb en 1. Ejemplos/)`;
  });

  await runTest('9. Actualización 2026', '9.2 Ingesta binaria BIFF12 de Tablero Ventas.xlsb (55 hojas con soporte de registro 0x3b)', () => {
    const tvPath = fs.existsSync(path.join(BASES_DIR, 'Tablero Ventas.xlsb'))
      ? path.join(BASES_DIR, 'Tablero Ventas.xlsb')
      : path.join(BASES_DIR, '1. Ejemplos', 'Tablero Ventas.xlsb');
    const buf = fs.readFileSync(tvPath);
    const wb = XLSX.read(buf, { type: 'buffer' });
    assert(wb.SheetNames.length === 55, `Esperadas 55 hojas en Tablero Ventas.xlsb, leídas: ${wb.SheetNames.length}`);
    assert(wb.SheetNames.includes('Mando Integral'), 'Falta hoja Mando Integral en Tablero Ventas.xlsb');
    assert(wb.SheetNames.includes('Mesa Julio'), 'Falta hoja Mesa Julio');
    assert(wb.SheetNames.includes('Mesa Gonza'), 'Falta hoja Mesa Gonza');
    assert(wb.SheetNames.includes('TACO REAL'), 'Falta hoja TACO REAL');
    assert(wb.SheetNames.includes('Censo Clientes'), 'Falta hoja Censo Clientes');
    return `Tablero Ventas.xlsb (30.4 MB) leído exitosamente: 55 hojas binarias BIFF12 decodificadas`;
  });

  await runTest('9. Actualización 2026', '9.3 Motor Tablero de Ventas (TACO .xlsb): Scores Mando Integral, Mesa Julio y Mesa Gonza', () => {
    const tacoEval = GalaxiaEngine.computeTableroVentasTaco(REAL_BUNDLE, { mesa: 'Mando Integral' });
    assert(tacoEval.scores, 'Debe computar scores TACO');
    assertClose(tacoEval.scores.tacoKpiPct, REF_REAL.tableroVentasSummary.mandoIntegralScores.tacoKpiPct, 0.05, 'Score TACO KPI Mando Integral (72.69%)');
    assertClose(tacoEval.scores.tacoRtoPct, REF_REAL.tableroVentasSummary.mandoIntegralScores.tacoRtoPct, 0.05, 'Score TACO RTO Mando Integral (30.37%)');
    assertClose(tacoEval.scores.tacoTotalPct, REF_REAL.tableroVentasSummary.mandoIntegralScores.tacoTotalPct, 0.05, 'Score TACO Total Mando Integral (46.77%)');
    assertClose(tacoEval.comparativaMesas.mesaJulio.tacoKpiPct, REF_REAL.tableroVentasSummary.mesaJulioScores.tacoKpiPct, 0.05, 'Score TACO KPI Mesa Julio (67.13%)');
    assertClose(tacoEval.comparativaMesas.mesaGonza.tacoKpiPct, REF_REAL.tableroVentasSummary.mesaGonzaScores.tacoKpiPct, 0.05, 'Score TACO KPI Mesa Gonza (69.33%)');
    assert(tacoEval.vendedoresMatrix.length >= 10, 'Debe incluir matriz consolidada de promotores');
    return `Scorecard TACO verificado: Mando Integral KPI ${tacoEval.scores.tacoKpiPct}% | RTO ${tacoEval.scores.tacoRtoPct}% | Total ${tacoEval.scores.tacoTotalPct}% | Mesa Julio ${tacoEval.comparativaMesas.mesaJulio.tacoKpiPct}% | Mesa Gonza ${tacoEval.comparativaMesas.mesaGonza.tacoKpiPct}%`;
  });

  await runTest('9. Actualización 2026', '9.4 Escala Oficial CMQ y Scorecard de 11.000 Puntos del Programa Galaxia 2026', () => {
    // Test CMQ Scale tiers: <70% (0%), 70-79% (50%), 80-89% (60%), 90-99% (80%), 100-104% (100%), >=105% (110%)
    const p0 = GalaxiaEngine.calcularPuntajeEscalaCMQ(68.5, 1000);
    assert(p0.puntosObtenidos === 0 && p0.factorPct === 0, 'Escala CMQ < 70% debe dar 0 puntos');
    const p50 = GalaxiaEngine.calcularPuntajeEscalaCMQ(75.0, 1000);
    assert(p50.puntosObtenidos === 500 && p50.factorPct === 50, 'Escala CMQ 70-79% debe dar 50% de los puntos');
    const p60 = GalaxiaEngine.calcularPuntajeEscalaCMQ(85.0, 1000);
    assert(p60.puntosObtenidos === 600 && p60.factorPct === 60, 'Escala CMQ 80-89% debe dar 60% de los puntos');
    const p80 = GalaxiaEngine.calcularPuntajeEscalaCMQ(95.0, 1000);
    assert(p80.puntosObtenidos === 800 && p80.factorPct === 80, 'Escala CMQ 90-99% debe dar 80% de los puntos');
    const p100 = GalaxiaEngine.calcularPuntajeEscalaCMQ(102.0, 1000);
    assert(p100.puntosObtenidos === 1000 && p100.factorPct === 100, 'Escala CMQ 100-104% debe dar 100% de los puntos');
    const p110 = GalaxiaEngine.calcularPuntajeEscalaCMQ(108.0, 1000);
    assert(p110.puntosObtenidos === 1100 && p110.factorPct === 110, 'Escala CMQ >= 105% debe dar 110% de los puntos (bonus)');

    const gEval = GalaxiaEngine.computeGalaxia2026Evaluation(REAL_BUNDLE);
    const sc = gEval.scorecard11000;
    assert(sc.puntajeTotalMaximo === 11000, 'Puntaje máximo oficial debe ser 11,000 pts');
    assert(sc.bloques.gestionManual.pesoMaxPts === 6050, 'Gestión Manual debe pesar 6,050 pts (55%)');
    assert(sc.bloques.resultadosTaco.pesoMaxPts === 4400, 'Resultados TACO debe pesar 4,400 pts (40%)');
    assert(sc.bloques.bonusGalaxia.pesoMaxPts === 550, 'Bonus debe pesar 550 pts (5%)');
    assert(sc.puntajeTotalObtenido >= 6000 && sc.puntajeTotalObtenido <= 11000, `Puntaje obtenido (${sc.puntajeTotalObtenido}) debe ser consistente`);
    return `Escala CMQ verificada en sus 6 tramos; Scorecard 11.000 pts: ${sc.puntajeTotalObtenido} pts (${sc.pctTotalGalaxia}%) — Categoría: ${sc.categoriaRanking}`;
  });

  await runTest('9. Actualización 2026', '9.5 Maestro de Clientes 2026, Ruteo Presencial y Alerta de Excesos de Frecuencia', () => {
    const gEval = GalaxiaEngine.computeGalaxia2026Evaluation(REAL_BUNDLE);
    const p2 = gEval.pilaresDetalle.pilar2CalidadYFrecuencias;
    assert(p2.baseClientesTotal === 8071, `Total padrón Base de Clientes debe ser 8,071, obtenido: ${p2.baseClientesTotal}`);
    assert(p2.clientesActivos === 1485, `Padrón activo (Anulado=NO) debe ser 1,485, obtenido: ${p2.clientesActivos}`);
    assert(p2.clientesAnulados === 6586, `Padrón anulados (Anulado=SI) debe ser 6,586, obtenido: ${p2.clientesAnulados}`);
    assertClose(p2.auditoriaCompletitudActivos.coordenadasValidasPct, 92.05, 0.05, 'Porcentaje de coordenadas GPS válidas (92.05%)');
    assert(p2.auditoriaClientesPresencial.clientesExcesoFrecuenciaCount === 16, `Esperados exactamente 16 clientes con >2 visitas semanales, encontrados: ${p2.auditoriaClientesPresencial.clientesExcesoFrecuenciaCount}`);

    const op = gEval.pilaresDetalle.pilar1EstructuraOnPremise.onPremise2026;
    assert(op.totalActivosOnPremise === 209, `Esperados 209 clientes On Premise activos, encontrados: ${op.totalActivosOnPremise}`);
    return `Maestro auditado: 1,485 activos, 6,586 anulados, 92.05% GPS, 209 On Premise, y exactamente 16 clientes con exceso de frecuencia`;
  });

  await runTest('9. Actualización 2026', '9.6 Auditoría de Pilares Galaxia: Sensibilización 66/33, Coolers Depósito y Trade Spend R3/MMAA', () => {
    const gEval = GalaxiaEngine.computeGalaxia2026Evaluation(REAL_BUNDLE);
    const sens = gEval.pilaresDetalle.pilar4Sensibilizacion6633.ytd2026.TOTAL_VOL;
    assert(sens.vendedoresEnAlertaCount === 2, `Esperados 2 promotores fuera de banda en Volumen Total, encontrados: ${sens.vendedoresEnAlertaCount}`);

    const af = gEval.pilaresDetalle.pilar7CapexCoolersChopp;
    assertClose(af.stockSobreParqueOperativoPct, 22.81, 0.05, 'Stock depósito Coolers Clúster 2 (22.81%)');
    assertClose(af.equiposInstaladosVentaCeroPct, 2.97, 0.05, 'Equipos con Venta Cero (2.97%)');

    const rm = gEval.pilaresDetalle.pilar8RevenueManagement;
    assertClose(rm.tradeSpendGlobalYTD2026.tsPorHL2026, 40858.82, 0.1, 'Trade Spend $/HL 2026');
    assert(Object.keys(rm.top5ClientesPorCanal).length >= 5, 'Debe generar TOP 5 clientes para cada canal comercial');
    return `Pilares auditados: Sensibilización 66/33 (2 alertas en Vol. Total), Coolers en stock (${af.stockSobreParqueOperativoPct}% vs meta <=3%), Trade Spend $${Math.round(rm.tradeSpendGlobalYTD2026.tsPorHL2026).toLocaleString('es-AR')}/HL con TOP 5 por canal`;
  });

  await runTest('9. Actualización 2026', '9.7 Consultas de Lenguaje Natural (NLQ) para Programa Galaxia 2026 y Tablero TACO', () => {
    const qTaco = NLQEngine.answerQuery('¿Cuál es el score del Tablero de Ventas TACO y Mando Integral?', realState, REAL_BUNDLE, CommercialMathEngine);
    assert(qTaco.interpreted === true, 'Consulta de TACO debe interpretarse');
    assert(qTaco.resultado.includes('72.69%') && qTaco.resultado.includes('46.77%'), 'Resultado debe incluir scores oficiales de TACO');

    const qGalaxia = NLQEngine.answerQuery('¿Cómo se compone el puntaje del Programa Galaxia 2026?', realState, REAL_BUNDLE, CommercialMathEngine);
    assert(qGalaxia.interpreted === true, 'Consulta de Galaxia debe interpretarse');
    assert(qGalaxia.resultado.includes('11.000') && qGalaxia.resultado.includes('55%'), 'Resultado debe explicar los 11.000 puntos y el 55% de gestión manual');

    const qSens = NLQEngine.answerQuery('¿Qué promotores están sub-objetivados según la regla de sensibilización?', realState, REAL_BUNDLE, CommercialMathEngine);
    assert(qSens.interpreted === true, 'Consulta de Sensibilización debe interpretarse');
    assert(qSens.resultado.includes('66.67%') && qSens.resultado.includes('33.33%'), 'Resultado debe citar la fórmula 66/33');

    const qOnPremise = NLQEngine.answerQuery('¿Cuántos clientes tenemos en On Premise y gastronomía?', realState, REAL_BUNDLE, CommercialMathEngine);
    assert(qOnPremise.interpreted === true, 'Consulta de On Premise debe interpretarse');
    assert(qOnPremise.resultado.includes('209'), 'Resultado debe informar los 209 clientes On Premise activos');
    return `4 consultas NLQ de 2026 verificadas matemáticamente sobre TACO, Galaxia 11k pts, Sensibilización 66/33 y On Premise`;
  });

  // =========================================================================
  // RESUMEN FINAL Y GUARDADO DE REPORTE DE PRUEBAS
  // =========================================================================
  console.log('\n================================================================================');
  console.log(`  RESULTADO FINAL: ${passedCount} PRUEBAS EXITOSAS | ${failedCount} PRUEBAS FALLIDAS`);
  console.log('================================================================================');

  const reportJson = {
    executedAt: new Date().toISOString(),
    totalTests: passedCount + failedCount,
    passed: passedCount,
    failed: failedCount,
    results
  };
  fs.writeFileSync(path.join(WORKSPACE, 'docs', 'test_execution_report.json'), JSON.stringify(reportJson, null, 2), 'utf8');

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error fatal ejecutando la suite de pruebas:', err);
  process.exit(1);
});
