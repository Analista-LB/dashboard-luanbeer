/**
 * @fileoverview Prueba de verificación integral para:
 * 1. Identidad Visual Corporativa en Tema Claro (Light Theme / Color Hueso #f8fafc).
 * 2. Rango Temporal (Mes Desde, Mes Hasta) y Presets Rápidos (Mes Actual, YTD, Último Trimestre).
 * 3. Ficha de Diagnóstico Pre-Incorporación ("¿Cómo sé qué datos cargué?") y Muestra de Datos.
 * 4. Actualización reactiva de maxMonth2026 e índices de CommercialMathEngine.
 */
const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..');
global.window = global;

const CommercialMathEngine = require(path.join(WORKSPACE, 'src', 'modules', 'commercialMathEngine.js'));
const CustomConsolidator = require(path.join(WORKSPACE, 'src', 'modules', 'customConsolidator.js'));
require(path.join(WORKSPACE, 'src', 'data', 'real_data_bundle.js'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  console.log('================================================================================');
  console.log('  TEST DE VERIFICACIÓN — TEMA CLARO, RANGOS TEMPORALES & AUDITORÍA PREVIA');
  console.log('================================================================================\n');

  // 1. Verificación de Corporate Light Theme CSS
  console.log('1. Verificando variables y estilos del Tema Claro (Light Theme) en corporate.css...');
  const css = fs.readFileSync(path.join(WORKSPACE, 'src', 'styles', 'corporate.css'), 'utf8');

  assert(css.includes('--bg-app: #f8fafc;'), 'corporate.css debe definir --bg-app: #f8fafc');
  assert(css.includes('--bg-surface: #ffffff;'), 'corporate.css debe definir --bg-surface: #ffffff');
  assert(css.includes('--text-primary: #0f172a;'), 'corporate.css debe definir texto principal #0f172a');
  assert(css.includes('--accent-orange: #ea580c;'), 'corporate.css debe definir naranja corporativo #ea580c');
  assert(css.includes('--accent-blue: #1e40af;'), 'corporate.css debe definir azul marino #1e40af');
  assert(css.includes('.quick-presets-row'), 'corporate.css debe incluir estilos para .quick-presets-row');
  assert(css.includes('.quick-preset-btn'), 'corporate.css debe incluir estilos para .quick-preset-btn');
  assert(css.includes('.audit-diagnostic-card'), 'corporate.css debe incluir estilos para .audit-diagnostic-card');
  assert(css.includes('.preview-sample-table-container'), 'corporate.css debe incluir estilos para .preview-sample-table-container');
  console.log('  [PASS] Tema Claro y clases de inspección y presets verificadas en CSS.');

  // 2. Verificación de Controles DOM en index.html
  console.log('\n2. Verificando estructura de filtros y ficha de auditoría en index.html...');
  const html = fs.readFileSync(path.join(WORKSPACE, 'index.html'), 'utf8');

  assert(html.includes('id="fltMesDesde"'), 'index.html debe contener select #fltMesDesde');
  assert(html.includes('id="fltMesHasta"'), 'index.html debe contener select #fltMesHasta');
  assert(html.includes('id="btnQuickCurrentMonth"'), 'index.html debe contener botón #btnQuickCurrentMonth');
  assert(html.includes('id="btnQuickYTD"'), 'index.html debe contener botón #btnQuickYTD');
  assert(html.includes('id="btnQuickLastQuarter"'), 'index.html debe contener botón #btnQuickLastQuarter');
  assert(html.includes('id="auditDiagnosticCardContainer"'), 'index.html debe contener contenedor #auditDiagnosticCardContainer');
  assert(html.includes('id="previewDataSampleTable"'), 'index.html debe contener tabla #previewDataSampleTable');
  assert(html.includes('id="previewDataSampleBody"'), 'index.html debe contener tbody #previewDataSampleBody');
  console.log('  [PASS] Elementos HTML de rango temporal y ficha de auditoría previa verificados.');

  // 3. Filtrado por Rango Temporal en CommercialMathEngine
  console.log('\n3. Evaluando filtrado por rango temporal en CommercialMathEngine...');
  const bundle = JSON.parse(JSON.stringify(global.__ARGON_REAL_BUNDLE__));
  const idx = CommercialMathEngine.ensureIndexes(bundle);
  assert(idx.maxMonth2026 === 9, 'Mes máximo inicial debe ser 9');

  // Evaluar rango Mes 01 a Mes 03 (Primer Trimestre exacto)
  const evalT1 = CommercialMathEngine.evaluateDashboard(bundle, {
    mesDesde: '01',
    mesHasta: '03'
  });
  assert(evalT1.kpis.periodoLabel.includes('01 a 03'), `Label debe indicar Rango 01 a 03, obtenido: ${evalT1.kpis.periodoLabel}`);
  assert(evalT1.kpis.volumenHL.actual > 15000, `Volumen T1 debe ser significativo, obtenido: ${evalT1.kpis.volumenHL.actual}`);

  // Evaluar Mes único mediante rango Desde: 09, Hasta: 09
  const evalM9 = CommercialMathEngine.evaluateDashboard(bundle, {
    mesDesde: '09',
    mesHasta: '09'
  });
  assert(evalM9.kpis.periodoLabel.includes('Mes 09'), `Label debe indicar Mes 09, obtenido: ${evalM9.kpis.periodoLabel}`);

  // 4. Inserción de Mes 10 y actualización dinámica de maxMonth2026 y YTD
  console.log('\n4. Simulando incorporación de Octubre 2026 y verificando reactividad de maxMonth2026...');
  const octRows = [
    { per: '2026/10', cte: 101, prod: 78043, canal: 'Tradicional', vend: 1, sup: 100, ccc: 1, bultos: 100, hl: 25.5, neto: 2550000, bonif: 0, source: 1 },
    { per: '2026/10', cte: 102, prod: 29056, canal: 'Tradicional', vend: 2, sup: 100, ccc: 1, bultos: 200, hl: 50.0, neto: 5000000, bonif: 0, source: 1 }
  ];

  CustomConsolidator.upsertSalesPartition(bundle, octRows, { partitionPeriod: '2026/10' });
  const postIdx = CommercialMathEngine.ensureIndexes(bundle);
  assert(postIdx.maxMonth2026 === 10, `El mes máximo debe actualizarse reactivamente a 10, obtenido: ${postIdx.maxMonth2026}`);

  // Filtrar específicamente por Mes 10 (Preset Mes Actual)
  const evalOct = CommercialMathEngine.evaluateDashboard(bundle, {
    mesDesde: '10',
    mesHasta: '10'
  });
  assert(evalOct.kpis.periodoLabel.includes('Mes 10'), `Label debe indicar Mes 10, obtenido: ${evalOct.kpis.periodoLabel}`);
  assert(Math.abs(evalOct.kpis.volumenHL.actual - 75.5) < 0.01, `Volumen de mes 10 debe ser exactamente 75.50 HL, obtenido: ${evalOct.kpis.volumenHL.actual}`);
  assert(evalOct.kpis.ccc.actual === 2, `Clientes únicos en mes 10 deben ser exactamente 2, obtenidos: ${evalOct.kpis.ccc.actual}`);

  // Evaluar YTD completo (Ene-Oct)
  const evalYTD10 = CommercialMathEngine.evaluateDashboard(bundle, {
    modoComparacion: 'YTD',
    mesDesde: '01',
    mesHasta: '10'
  });
  assert(evalYTD10.kpis.periodoLabel.includes('Ene–Oct'), `Periodo YTD debe reflejar Ene–Oct, obtenido: ${evalYTD10.kpis.periodoLabel}`);
  console.log(`  [PASS] Incorporación de Octubre 2026 reactiva verificada: maxMonth2026 = 10, Mes 10 = 75.5 HL / 2 CCC, YTD = Ene–Oct.`);

  console.log('\n================================================================================');
  console.log('  TODAS LAS VERIFICACIONES DE LA REFACTORIZACIÓN PASARON AL 100%');
  console.log('================================================================================');
}

run();
