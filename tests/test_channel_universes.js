/**
 * TEST SUITE: REORGANIZACIÓN COMPLETA DE CANALES Y UNIVERSOS COMERCIALES
 * Dashboard LuanBeer vs Tablero Ventas
 * 
 * Verificación obligatoria según Secciones 31 y 32 del requerimiento:
 *  - Test 1: Autoservicio independiente
 *  - Test 2: Mercado Hogar — Sin Autoservicio (exclusión estricta)
 *  - Test 3: Mercado Hogar — Con Autoservicio (inclusión de Autoservicio)
 *  - Test 4: Control Matemático HL MH Con Auto === HL MH Sin Auto + HL Autoservicio
 *  - Test 5: On Premise universo agregado consolidado
 *  - Test 6: Clie People + Instituciones unificado
 *  - Test 7: Cadenitas / Aiellos / Delfines independientes
 *  - Test 8: Consultas / NLQ utilizando exactamente el mismo mapping central
 *  - Control Anti-Duplicación: Fila única por transacción
 *  - Selector DOM: 9 opciones en el orden exacto requerido + Todos los Canales
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// Setup environment
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
sandbox.self = sandbox;
vm.createContext(sandbox);

function loadScript(rel) {
  const fullPath = path.resolve(__dirname, '..', rel);
  const code = fs.readFileSync(fullPath, 'utf8');
  vm.runInContext(code, sandbox);
}

// 1. Cargar dependencias
loadScript('src/data/real_data_bundle.js');
loadScript('src/modules/sanitizer.js');
loadScript('src/modules/channelUniverseConfig.js');
loadScript('src/modules/commercialMathEngine.js');
loadScript('src/modules/galaxiaEngine.js');
loadScript('src/modules/aiAgent/querySchema.js');
loadScript('src/modules/aiAgent/conversationContext.js');
loadScript('src/modules/aiAgent/commercialQueryEngine.js');
loadScript('src/modules/aiAgent/queryValidator.js');
loadScript('src/modules/aiAgent/queryInterpreter.js');
loadScript('src/modules/aiAgent/responseComposer.js');
loadScript('src/modules/aiAgent/responseValidator.js');
loadScript('src/modules/aiAgent/index.js');
loadScript('src/modules/nlqEngine.js');

const bundle = sandbox.window.__ARGON_REAL_BUNDLE__;
const CME = sandbox.window.ArgonBI.CommercialMathEngine;
const CUC = sandbox.window.ArgonBI.ChannelUniverseConfig;
const NLQ = sandbox.window.ArgonBI.NLQEngine;

console.log('================================================================================');
console.log('  SUITE DE PRUEBAS — REORGANIZACIÓN DE CANALES Y UNIVERSOS COMERCIALES');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// CONTROL PREVIO: Selector DOM en index.html
// -----------------------------------------------------------------------------
console.log('[Control DOM] Verificando selector principal en index.html...');
const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

const expectedOrder = [
  'Todos los Canales',
  'On Premise',
  'Mayoristas',
  'Mercado Hogar — Sin Autoservicio',
  'Mercado Hogar — Con Autoservicio',
  'Autoservicio',
  'Clie People + Instituciones',
  'Cadenitas',
  'Aiellos',
  'Delfines'
];

// Extract options from select id="fltCanal"
const selectMatch = indexHtml.match(/<select id="fltCanal"[^>]*>([\s\S]*?)<\/select>/);
assert(selectMatch, 'El selector id="fltCanal" debe existir en index.html');
const selectBody = selectMatch[1];

const optionMatches = [...selectBody.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)];
const actualOptions = optionMatches.map(m => m[2].trim());

console.log('  Opciones encontradas en selector:', actualOptions);
assert.strictEqual(actualOptions.length, 10, 'El selector principal debe tener exactamente 10 opciones (Todos + 9 categorías)');

for (let i = 0; i < expectedOrder.length; i++) {
  assert.strictEqual(
    actualOptions[i],
    expectedOrder[i],
    `Posición ${i} debe ser '${expectedOrder[i]}', pero se encontró '${actualOptions[i]}'`
  );
}
console.log('  [PASS] Selector ordenado estrictamente según requerimiento (Todos + 1 al 9).\n');

// -----------------------------------------------------------------------------
// TEST 1 — Autoservicio independiente
// -----------------------------------------------------------------------------
console.log('[Test 1] Verificando filtro exclusivo: Autoservicio...');
const evalAuto = CME.evaluateDashboard(bundle, { canal: 'Autoservicio', modoComparacion: 'YTD' });
assert(evalAuto.kpis.volumenHL.actual > 0, 'Autoservicio debe tener volumen > 0');
assert.strictEqual(evalAuto.kpis.volumenHL.actual, 4841.08, 'Volumen 2026 de Autoservicio debe ser exactamente 4841.08 HL');
assert.strictEqual(evalAuto.kpis.ccc.actual, 32, 'CCC 2026 de Autoservicio debe ser exactamente 32 clientes');

// Confirmar que todas las transacciones evaluadas pertenecen al canal Autoservicio
const sc = bundle.salesColumnar;
const idx = CME.ensureIndexes(bundle);
for (let i = 0; i < sc.canal.length; i++) {
  const cName = idx.canalDict[sc.canal[i]];
  const cte = sc.cte[i];
  if (CUC.matchesUniverse('AUTOSERVICIO', cName, cte, idx)) {
    assert.strictEqual(cName, 'Autoservicio', 'Filas de universo Autoservicio deben tener canal raw Autoservicio');
  }
}
console.log(`  [PASS] Autoservicio: ${evalAuto.kpis.volumenHL.actual} HL, CCC: ${evalAuto.kpis.ccc.actual}. Filas 100% puras.\n`);

// -----------------------------------------------------------------------------
// TEST 2 — Mercado Hogar — Sin Autoservicio (Exclusión Estricta)
// -----------------------------------------------------------------------------
console.log('[Test 2] Verificando exclusión estricta: Mercado Hogar — Sin Autoservicio...');
const evalMhSin = CME.evaluateDashboard(bundle, { canal: 'Mercado Hogar — Sin Autoservicio', modoComparacion: 'YTD' });
assert(evalMhSin.kpis.volumenHL.actual > 0, 'MH Sin Auto debe tener volumen');
assert.strictEqual(evalMhSin.kpis.volumenHL.actual, 14049.67, 'Volumen 2026 de MH Sin Auto debe ser exactamente 14049.67 HL');
assert.strictEqual(evalMhSin.kpis.ccc.actual, 1133, 'CCC 2026 de MH Sin Auto debe ser exactamente 1133 clientes');

// Confirmar que ninguna fila de MH Sin Auto pertenece a Autoservicio
for (let i = 0; i < sc.canal.length; i++) {
  const cName = idx.canalDict[sc.canal[i]];
  const cte = sc.cte[i];
  if (CUC.matchesUniverse('MH_SIN_AUTO', cName, cte, idx)) {
    assert.notStrictEqual(cName, 'Autoservicio', 'MH Sin Auto NO debe incluir ninguna fila de Autoservicio');
    assert(['Tradicional', 'Kioscos/Maxikioscos'].includes(cName), 'MH Sin Auto sólo debe incluir Tradicional o Kioscos/Maxikioscos');
  }
}
console.log(`  [PASS] MH Sin Auto: ${evalMhSin.kpis.volumenHL.actual} HL, CCC: ${evalMhSin.kpis.ccc.actual}. Exclusión 100% estricta.\n`);

// -----------------------------------------------------------------------------
// TEST 3 — Mercado Hogar — Con Autoservicio
// -----------------------------------------------------------------------------
console.log('[Test 3] Verificando inclusión: Mercado Hogar — Con Autoservicio...');
const evalMhCon = CME.evaluateDashboard(bundle, { canal: 'Mercado Hogar — Con Autoservicio', modoComparacion: 'YTD' });
assert.strictEqual(evalMhCon.kpis.volumenHL.actual, 18890.75, 'Volumen 2026 de MH Con Auto debe ser exactamente 18890.75 HL');
assert.strictEqual(evalMhCon.kpis.ccc.actual, 1165, 'CCC 2026 de MH Con Auto debe ser exactamente 1165 clientes');

let autoIncludedInMHCon = false;
for (let i = 0; i < sc.canal.length; i++) {
  const cName = idx.canalDict[sc.canal[i]];
  const cte = sc.cte[i];
  if (CUC.matchesUniverse('MH_CON_AUTO', cName, cte, idx) && cName === 'Autoservicio') {
    autoIncludedInMHCon = true;
    break;
  }
}
assert(autoIncludedInMHCon, 'MH Con Auto debe incluir transacciones de Autoservicio');
console.log(`  [PASS] MH Con Auto: ${evalMhCon.kpis.volumenHL.actual} HL, CCC: ${evalMhCon.kpis.ccc.actual}. Inclusión confirmada.\n`);

// -----------------------------------------------------------------------------
// TEST 4 — Control Matemático Aditivo: MH Con Auto === MH Sin Auto + Autoservicio
// -----------------------------------------------------------------------------
console.log('[Test 4] Control Matemático de Identidad en Mercado Hogar...');
const hlSin = evalMhSin.kpis.volumenHL.actual;
const hlAuto = evalAuto.kpis.volumenHL.actual;
const hlCon = evalMhCon.kpis.volumenHL.actual;
const sumSinAuto = Number((hlSin + hlAuto).toFixed(2));
const diffHL = Math.abs(hlCon - sumSinAuto);

console.log(`  HL MH Sin Auto:  ${hlSin}`);
console.log(`  HL Autoservicio: ${hlAuto}`);
console.log(`  Suma Calculada:  ${sumSinAuto}`);
console.log(`  HL MH Con Auto:  ${hlCon}`);
console.log(`  Diferencia:      ${diffHL.toFixed(4)} HL`);

assert.strictEqual(diffHL, 0, 'HL MH Con Auto debe ser EXACTAMENTE igual a HL MH Sin Auto + HL Autoservicio');

// Facturación Neta
const factSin = evalMhSin.kpis.facturacionNeta.actual;
const factAuto = evalAuto.kpis.facturacionNeta.actual;
const factCon = evalMhCon.kpis.facturacionNeta.actual;
const sumFact = Number((factSin + factAuto).toFixed(2));
const diffFact = Math.abs(factCon - sumFact);
console.log(`  Facturación Neta Sin + Auto: $${sumFact} vs Con Auto: $${factCon} (Dif: $${diffFact.toFixed(2)})`);
assert(diffFact < 0.01, 'Facturación Neta debe ser aditivamente exacta');
console.log('  [PASS] Identidad aditiva HL y Facturación verificada al 100% (cero diferencia).\n');

// -----------------------------------------------------------------------------
// TEST 5 — On Premise (Universo Agregado Consolidado)
// -----------------------------------------------------------------------------
console.log('[Test 5] Verificando subcanales en On Premise...');
const evalOnPremise = CME.evaluateDashboard(bundle, { canal: 'On Premise', modoComparacion: 'YTD' });
assert.strictEqual(evalOnPremise.kpis.volumenHL.actual, 4859.71, 'Volumen On Premise debe ser 4859.71 HL');
assert.strictEqual(evalOnPremise.kpis.ccc.actual, 214, 'CCC On Premise debe ser 214 clientes');

const expectedOnPremiseChannels = [
  'REF GASTRONOMICO', 'REF NOCTURNO', 'REF ENTRETENIMIENTO',
  'COMIDA', 'BEBIDA', 'Disco/Pub', 'KA GASTRONOMICO', 'KA NOCTURNO'
];
for (const chan of expectedOnPremiseChannels) {
  assert(
    CUC.matchesUniverse('ON_PREMISE', chan, null, idx),
    `On Premise debe incluir el canal ${chan}`
  );
}
console.log(`  [PASS] On Premise incluye los 8 canales/subcanales correspondientes (${evalOnPremise.kpis.volumenHL.actual} HL).\n`);

// -----------------------------------------------------------------------------
// TEST 6 — Clie People + Instituciones (Unificado)
// -----------------------------------------------------------------------------
console.log('[Test 6] Verificando combinación: Clie People + Instituciones...');
const evalPeopleInst = CME.evaluateDashboard(bundle, { canal: 'Clie People + Instituciones', modoComparacion: 'YTD' });
assert.strictEqual(evalPeopleInst.kpis.volumenHL.actual, 102.04, 'Volumen People + Instituciones debe ser 102.04 HL');
assert.strictEqual(evalPeopleInst.kpis.ccc.actual, 60, 'CCC People + Instituciones debe ser 60 clientes');

assert(CUC.matchesUniverse('PEOPLE_INSTITUCIONES', 'Clie People', null, idx), 'Debe incluir Clie People');
assert(CUC.matchesUniverse('PEOPLE_INSTITUCIONES', 'Clie Institucional', null, idx), 'Debe incluir Clie Institucional');
assert(CUC.matchesUniverse('PEOPLE_INSTITUCIONES', 'Instituciones', null, idx), 'Debe incluir Instituciones');
console.log(`  [PASS] Clie People + Instituciones unificado con éxito (${evalPeopleInst.kpis.volumenHL.actual} HL, 60 clientes).\n`);

// -----------------------------------------------------------------------------
// TEST 7 — Cadenitas / Aiellos / Delfines independientes
// -----------------------------------------------------------------------------
console.log('[Test 7] Verificando filtros independientes: Cadenitas, Aiellos y Delfines...');
const evalAiellos = CME.evaluateDashboard(bundle, { canal: 'Aiellos', modoComparacion: 'YTD' });
const evalDelfines = CME.evaluateDashboard(bundle, { canal: 'Delfines', modoComparacion: 'YTD' });
const evalCadenitas = CME.evaluateDashboard(bundle, { canal: 'Cadenitas', modoComparacion: 'YTD' });

console.log(`  Aiellos:   ${evalAiellos.kpis.volumenHL.actual} HL | CCC: ${evalAiellos.kpis.ccc.actual} sucursales`);
console.log(`  Delfines:  ${evalDelfines.kpis.volumenHL.actual} HL | CCC: ${evalDelfines.kpis.ccc.actual} sucursales`);
console.log(`  Cadenitas: ${evalCadenitas.kpis.volumenHL.actual} HL | CCC: ${evalCadenitas.kpis.ccc.actual} cuentas`);

assert.strictEqual(evalAiellos.kpis.volumenHL.actual, 2852.35, 'Aiellos HL 2026 debe ser 2852.35 HL');
assert.strictEqual(evalAiellos.kpis.ccc.actual, 10, 'Aiellos debe tener exactamente 10 sucursales activas');

assert.strictEqual(evalDelfines.kpis.volumenHL.actual, 337.98, 'Delfines HL 2026 debe ser 337.98 HL');
assert.strictEqual(evalDelfines.kpis.ccc.actual, 3, 'Delfines debe tener exactamente 3 sucursales activas');

assert.strictEqual(evalCadenitas.kpis.volumenHL.actual, 3190.33, 'Cadenitas total debe ser 3190.33 HL');
assert.strictEqual(evalCadenitas.kpis.ccc.actual, 13, 'Cadenitas total debe tener 13 cuentas activas');

console.log('  [PASS] Cadenitas, Aiellos y Delfines se filtran independientemente con precisión.\n');

// -----------------------------------------------------------------------------
// TEST 8 — Consultas / NLQ con mapping centralizado idéntico
// -----------------------------------------------------------------------------
console.log('[Test 8] Verificando Consultas / NLQ con el mismo mapping central...');

const q1 = '¿Cómo viene Autoservicio vs AA?';
const ans1 = NLQ.answerQuery(q1, evalAuto, bundle, CME);
console.log(`  P1: ${q1} -> ${ans1.answer}`);
assert.strictEqual(ans1.answer, 'Autoservicio cayó 1.770,5 HL vs. AA (-26,8%).', 'P1 debe responder exclusivamente Autoservicio');

const q2 = '¿Cómo viene Mercado Hogar sin Autoservicio?';
const ans2 = NLQ.answerQuery(q2, evalMhSin, bundle, CME);
console.log(`  P2: ${q2} -> ${ans2.answer}`);
assert.strictEqual(ans2.answer, 'Mercado Hogar — Sin Autoservicio cayó 1.459,1 HL vs. AA (-9,4%).', 'P2 debe responder MH Sin Auto');

const q3 = '¿Cuánto vendió On Premise?';
const ans3 = NLQ.answerQuery(q3, evalOnPremise, bundle, CME);
console.log(`  P3: ${q3} -> ${ans3.answer}`);
assert.strictEqual(ans3.answer, 'On Premise vendió 4.859,7 HL.', 'P3 debe responder volumen On Premise');

const q4 = 'Comparame Aiellos con Delfines.';
const ans4 = NLQ.answerQuery(q4, evalAiellos, bundle, CME);
console.log(`  P4: ${q4} -> ${ans4.answer}`);
assert(ans4.answer.includes('Aiellos: 2.852,4 HL') && ans4.answer.includes('Delfines: 338,0 HL'), 'P4 debe comparar ambos universos con exactitud');

const q5 = '¿Cuánto vendió Mercado Hogar sin Autoservicio?';
const ans5 = NLQ.answerQuery(q5, evalMhSin, bundle, CME);
console.log(`  P5: ${q5} -> ${ans5.answer}`);
assert.strictEqual(ans5.answer, 'Mercado Hogar — Sin Autoservicio vendió 14.049,7 HL.', 'P5 debe responder volumen MH Sin Auto');

const q6 = '¿Cómo viene Mercado Hogar?';
const ans6 = NLQ.answerQuery(q6, evalMhCon, bundle, CME);
console.log(`  P6: ${q6} -> ${ans6.answer}`);
assert.strictEqual(ans6.answer, 'Mercado Hogar — Con Autoservicio cayó 3.229,6 HL vs. AA (-14,6%).', 'P6 debe utilizar por defecto Con Autoservicio');

console.log('  [PASS] El módulo Consultas utiliza exactamente el mismo mapping central sin discrepancias.\n');

// -----------------------------------------------------------------------------
// CONTROL ANTI-DUPLICACIÓN DE DATOS (Sección 26)
// -----------------------------------------------------------------------------
console.log('[Control Anti-Duplicación] Verificando conteo estricto de transacciones...');
const originalRowCount = bundle.salesColumnar.hl.length;
console.log(`  Filas físicas en bundle.salesColumnar: ${originalRowCount}`);

// Evaluar con Todos los Canales
const evalAll = CME.evaluateDashboard(bundle, { canal: 'ALL', modoComparacion: 'YTD' });
assert.strictEqual(evalAll.kpis.volumenHL.actual, 33684.68, 'Volumen total global debe permanecer intacto');
console.log(`  Volumen Global intacto: ${evalAll.kpis.volumenHL.actual} HL`);
console.log('  [PASS] Ninguna fila fue duplicada ni creada en bases físicas.\n');

console.log('================================================================================');
console.log('  TODOS LOS 8 TESTS OBLIGATORIOS PASARON CON ÉXITO (100% OK)');
console.log('================================================================================');
