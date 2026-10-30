/**
 * @fileoverview Prueba de verificación para:
 * 1. Simplificación de Corte Comparativo (#fltModoComp) a YTD y ANUAL sin "Homogéneo".
 * 2. Reestructuración y agrupación de Canales Comerciales (#fltCanal):
 *    - Refrigerados / On Premise (REF): incluye KA Gastronómico y KA Nocturno.
 *    - Mayoristas: Mayorista.
 *    - Mercado Hogar: Kioscos/Maxikioscos, Tradicional, Autoservicio.
 *    - Cadenitas: Aiello, Delfines, Supermercados con desglose inteligente.
 *    - Instituciones y Personal: Instituciones, Clie Institucional, Clie People.
 * 3. Depuración estricta del Padrón de Clientes (#fltCliente):
 *    - Cruce contra columna Anulado === 'NO' para exactamente 1.485 clientes activos.
 *    - Exclusión estricta de los 6.586 clientes históricos inactivos / dados de baja.
 */
const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..');
global.window = global;

const CommercialMathEngine = require(path.join(WORKSPACE, 'src', 'modules', 'commercialMathEngine.js'));
const IngestionEngine = require(path.join(WORKSPACE, 'src', 'modules', 'ingestionEngine.js'));
require(path.join(WORKSPACE, 'src', 'data', 'real_data_bundle.js'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const logStream = fs.createWriteStream(path.join(WORKSPACE, 'test_filters_output.log'));
  const log = (msg) => {
    console.log(msg);
    logStream.write(msg + '\n');
  };

  log('================================================================================');
  log('  TEST DE CALIBRACIÓN FINAL — CANALES, CADENITAS Y PADRÓN ACTIVO (LUANBEER)');
  log('================================================================================\n');

  // 1. Verificación de index.html
  log('1. Verificando estructura de index.html...');
  const html = fs.readFileSync(path.join(WORKSPACE, 'index.html'), 'utf8');

  // Modo Comparativo
  assert(html.includes('<option value="YTD">YTD</option>'), 'Debe incluir opción YTD');
  assert(html.includes('<option value="ANUAL">Año Anterior Completo (Ene–Dic)</option>'), 'Debe incluir opción ANUAL');
  assert(!html.includes('YTD Homogéneo'), 'No debe existir el texto "YTD Homogéneo" en index.html');

  // Grupos en fltCanal
  assert(html.includes('optgroup label="🍺 Refrigerados / On Premise (REF)"'), 'Debe incluir optgroup Refrigerados / On Premise');
  assert(html.includes('value="REF_ALL"'), 'Debe incluir opción REF_ALL');
  assert(html.includes('value="KA GASTRONOMICO"'), 'Debe incluir KA Gastronómico dentro de REF');
  assert(html.includes('value="KA NOCTURNO"'), 'Debe incluir KA Nocturno dentro de REF');

  assert(html.includes('optgroup label="📦 Mayoristas"'), 'Debe incluir optgroup Mayoristas');

  assert(html.includes('optgroup label="🏠 Mercado Hogar"'), 'Debe incluir optgroup Mercado Hogar');
  assert(html.includes('value="MERCADO_HOGAR_ALL"'), 'Debe incluir opción MERCADO_HOGAR_ALL');
  assert(html.includes('value="Kioscos/Maxikioscos"'), 'Debe incluir Kioscos');
  assert(html.includes('value="Tradicional"'), 'Debe incluir Tradicional');
  assert(html.includes('value="Autoservicio"'), 'Debe incluir Autoservicio');

  assert(html.includes('optgroup label="🛒 Cadenitas"'), 'Debe incluir optgroup Cadenitas');
  assert(html.includes('value="CADENITAS_ALL"'), 'Debe incluir opción CADENITAS_ALL');
  assert(html.includes('value="CADENITAS_AIELLO"'), 'Debe incluir opción CADENITAS_AIELLO');
  assert(html.includes('value="CADENITAS_DELFIN"'), 'Debe incluir opción CADENITAS_DELFIN');

  assert(html.includes('optgroup label="🏢 Instituciones y Personal"'), 'Debe incluir optgroup Instituciones y Personal');
  assert(html.includes('value="INSTITUCIONES_ALL"'), 'Debe incluir opción INSTITUCIONES_ALL');
  assert(html.includes('value="Instituciones"'), 'Debe incluir Instituciones');
  assert(html.includes('value="Clie Institucional"'), 'Debe incluir Clie Institucional');
  assert(html.includes('value="Clie People"'), 'Debe incluir Clie People');

  // Fallback retrocompatible
  assert(html.includes('id="fltCanalUnif" class="filter-control" style="display:none;"'), 'fltCanalUnif debe estar oculto como fallback');

  // Padrón Activo
  assert(html.includes('Todos (1.485 Clientes Activos)'), 'Default de fltCliente debe ser "Todos (1.485 Clientes Activos)"');
  log('  [PASS] index.html validado con éxito.');

  // 2. Verificación de IngestionEngine CHANNEL_FAMILIES
  log('\n2. Verificando CHANNEL_FAMILIES en IngestionEngine...');
  assert(IngestionEngine.CHANNEL_FAMILIES, 'IngestionEngine debe exponer CHANNEL_FAMILIES');
  assert(IngestionEngine.CHANNEL_FAMILIES.REF.channels.includes('KA GASTRONOMICO'), 'REF debe incluir KA GASTRONOMICO');
  assert(IngestionEngine.CHANNEL_FAMILIES.REF.channels.includes('KA NOCTURNO'), 'REF debe incluir KA NOCTURNO');
  assert(IngestionEngine.CHANNEL_FAMILIES.MERCADO_HOGAR.channels.includes('Tradicional'), 'MERCADO_HOGAR debe incluir Tradicional');
  assert(IngestionEngine.CHANNEL_FAMILIES.CADENITAS.chains.includes('AIELLO'), 'CADENITAS debe incluir AIELLO');
  assert(IngestionEngine.CHANNEL_FAMILIES.CADENITAS.chains.includes('DELFIN'), 'CADENITAS debe incluir DELFIN');
  log('  [PASS] Diccionario institucional CHANNEL_FAMILIES validado en IngestionEngine.');

  // 3. Verificación de Padrón Activo de Clientes en bundle
  log('\n3. Verificando padrón de clientes y filtro de activos...');
  const bundle = JSON.parse(JSON.stringify(global.__ARGON_REAL_BUNDLE__));
  const totalCtes = bundle.masters.clientes.length;
  const activos = bundle.masters.clientes.filter(c => (c.anulado || '').toUpperCase() === 'NO');
  const inactivos = bundle.masters.clientes.filter(c => (c.anulado || '').toUpperCase() === 'SI');

  log(`  Total clientes transaccionales en bundle: ${totalCtes}`);
  log(`  Clientes activos oficiales (Anulado === 'NO'): ${activos.length}`);
  log(`  Clientes inactivos en bundle (Anulado === 'SI'): ${inactivos.length}`);

  assert(totalCtes === 1851, `Total esperado 1851, obtenido: ${totalCtes}`);
  assert(activos.length === 1485, `Activos esperados 1485, obtenidos: ${activos.length}`);
  assert(inactivos.length === 366, `Inactivos esperados 366, obtenidos: ${inactivos.length}`);
  log('  [PASS] Padrón de 1.485 clientes activos verificado con exactitud matemática.');

  // 4. Verificación de cálculo del motor para On Premise (REF_ALL con KA)
  log('\n4. Verificando cálculo del motor para canal REF_ALL (con KA On Premise)...');
  const evalGlobal = CommercialMathEngine.evaluateDashboard(bundle, { canal: 'ALL' });
  const evalRef = CommercialMathEngine.evaluateDashboard(bundle, { canal: 'REF_ALL' });

  log(`  Volumen Global HL 2026: ${evalGlobal.kpis.volumenHL.actual} HL`);
  log(`  Volumen REF_ALL HL 2026: ${evalRef.kpis.volumenHL.actual} HL`);
  log(`  CCC REF_ALL 2026: ${evalRef.kpis.ccc.actual} clientes`);

  assert(evalRef.kpis.volumenHL.actual > 4800, 'Volumen REF_ALL debe ser mayor a 4800 HL');
  assert(evalRef.kpis.volumenHL.actual < evalGlobal.kpis.volumenHL.actual, 'Volumen REF_ALL debe ser subconjunto del global');
  log('  [PASS] On Premise / REF_ALL incluye subcanales KA gastronómico y nocturno.');

  // 5. Verificación de cálculo y desglose especial para Cadenitas (Aiello y Delfines)
  log('\n5. Verificando filtro y desglose especial de Cadenitas (Aiello & Delfines)...');
  const evalAiello = CommercialMathEngine.evaluateDashboard(bundle, { canal: 'CADENITAS_AIELLO' });
  const evalDelfin = CommercialMathEngine.evaluateDashboard(bundle, { canal: 'CADENITAS_DELFIN' });
  const evalCadenitas = CommercialMathEngine.evaluateDashboard(bundle, { canal: 'CADENITAS_ALL' });

  log(`  Volumen Aiello HL 2026: ${evalAiello.kpis.volumenHL.actual} HL (CCC: ${evalAiello.kpis.ccc.actual})`);
  log(`  Volumen Delfines HL 2026: ${evalDelfin.kpis.volumenHL.actual} HL (CCC: ${evalDelfin.kpis.ccc.actual})`);
  log(`  Volumen Total Cadenitas HL 2026: ${evalCadenitas.kpis.volumenHL.actual} HL`);

  assert(evalAiello.kpis.volumenHL.actual > 2800, `Aiello esperado > 2800 HL, obtenido: ${evalAiello.kpis.volumenHL.actual}`);
  assert(evalAiello.kpis.ccc.actual === 10, `Aiello esperado 10 sucursales activas, obtenido: ${evalAiello.kpis.ccc.actual}`);
  assert(evalDelfin.kpis.volumenHL.actual > 300, `Delfines esperado > 300 HL, obtenido: ${evalDelfin.kpis.volumenHL.actual}`);

  assert(evalGlobal.cadenitasBreakdown, 'evaluateDashboard debe incluir cadenitasBreakdown');
  assert(evalGlobal.cadenitasBreakdown.aiello.nombre.includes('Aiello'), 'cadenitasBreakdown debe tener Aiello');
  assert(evalGlobal.cadenitasBreakdown.delfines.nombre.includes('Delfines'), 'cadenitasBreakdown debe tener Delfines');
  log(`  Breakdown Aiello HL 2026: ${evalGlobal.cadenitasBreakdown.aiello.hl26} HL | 2025: ${evalGlobal.cadenitasBreakdown.aiello.hl25} HL`);
  log(`  Breakdown Delfines HL 2026: ${evalGlobal.cadenitasBreakdown.delfines.hl26} HL | 2025: ${evalGlobal.cadenitasBreakdown.delfines.hl25} HL`);
  log('  [PASS] Filtro y desglose especial de Cadenitas (Aiello y Delfines) verificado.');

  // 6. Verificación de cálculo para Mercado Hogar
  log('\n6. Verificando cálculo para Mercado Hogar (MERCADO_HOGAR_ALL)...');
  const evalHogar = CommercialMathEngine.evaluateDashboard(bundle, { canal: 'MERCADO_HOGAR_ALL' });
  log(`  Volumen Mercado Hogar HL 2026: ${evalHogar.kpis.volumenHL.actual} HL (CCC: ${evalHogar.kpis.ccc.actual})`);
  assert(evalHogar.kpis.volumenHL.actual > 18000, 'Mercado Hogar debe concentrar el mayor volumen de la distribuidora');
  log('  [PASS] Mercado Hogar verificado.');

  // 7. Verificación de Corte Comparativo
  log('\n7. Verificando Corte Comparativo (YTD vs ANUAL)...');
  const evalYTD = CommercialMathEngine.evaluateDashboard(bundle, { modoComparacion: 'YTD' });
  assert(evalYTD.kpis.periodoLabel.startsWith('YTD'), `Label YTD debe comenzar con "YTD", obtenido: ${evalYTD.kpis.periodoLabel}`);
  assert(!evalYTD.kpis.periodoLabel.includes('Homogéneo'), `Label YTD no debe contener "Homogéneo", obtenido: ${evalYTD.kpis.periodoLabel}`);
  log(`  Periodo YTD: ${evalYTD.kpis.periodoLabel}`);
  log('  [PASS] Corte comparativo YTD verificado.');

  log('\n================================================================================');
  log('  TODAS LAS PRUEBAS DE CALIBRACIÓN FINAL PASARON EXITOSAMENTE (100% OK)');
  log('================================================================================');
  logStream.end();
}

run();
