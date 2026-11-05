const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('========================================================');
console.log('TEST: ARQUITECTURA ASISTENTE DE CONSULTAS Y AGENTE IA');
console.log('========================================================\n');

// 1. Simular entorno global de navegador para los bundles
global.window = global;
require('../src/data/real_data_bundle.js');
const REAL_BUNDLE = global.window.__ARGON_REAL_BUNDLE__;

// Cargar módulos
const NLQEngine = require('../src/modules/nlqEngine.js');
const CommercialMathEngine = require('../src/modules/commercialMathEngine.js');
const AIAgentModule = require('../src/modules/aiAgent/index.js');

// 2. Verificar separación de módulos en la arquitectura de Agente IA
assert(AIAgentModule.AIAgent, 'AIAgent debe estar exportado');
assert(AIAgentModule.ConversationContext, 'ConversationContext debe estar exportado');
assert(AIAgentModule.CommercialQueryEngine, 'CommercialQueryEngine debe estar exportado');
assert(AIAgentModule.QueryValidator, 'QueryValidator debe estar exportado');
assert(AIAgentModule.AIQueryInterpreter, 'AIQueryInterpreter debe estar exportado');
assert(AIAgentModule.AIResponseComposer, 'AIResponseComposer debe estar exportado');
assert(AIAgentModule.ResponseValidator, 'ResponseValidator debe estar exportado');
console.log('✅ 1. Arquitectura modular de 7 componentes verificada.');

// 3. Evaluar estado real del dashboard
const state = CommercialMathEngine.evaluateDashboard(REAL_BUNDLE, {
  modoComparacion: 'YTD',
  mes: 'ALL',
  trimestre: 'ALL',
  canal: 'ALL',
  canalUnificado: 'ALL',
  unidadNegocio: 'ALL',
  division: 'ALL',
  producto: 'ALL',
  cliente: 'ALL',
  vendedor: 'ALL',
  supervisor: 'ALL'
});

// 4. PRUEBA CRÍTICA: Desviación de volumen versus año anterior en canal autoservicios
const qCritica = 'quiero saber cuanto es la desviacion de volumen versus año anterior en canal autoservicios';
const resCritica = NLQEngine.answerQuery(qCritica, state, REAL_BUNDLE, CommercialMathEngine);
assert(resCritica && resCritica.interpreted === true, 'Prueba crítica debe ser interpretada');
assert(!resCritica.answer.includes('Tradicional'), 'La prueba crítica NUNCA debe responder Tradicional');
assert(!resCritica.answer.includes('918,2'), 'La prueba crítica NUNCA debe responder 918,2 HL');
assert(resCritica.answer.includes('Autoservicio'), 'Debe identificar el canal Autoservicio');
assert(resCritica.answer.includes('-1.770,5') || resCritica.answer.includes('1.770,5'), 'Debe calcular la diferencia exacta (-1.770,5 HL)');
assert(resCritica.answer.includes('-26,8%') || resCritica.answer.includes('26,8%'), 'Debe calcular la variación interanual (-26,8%)');
console.log('✅ 2. PRUEBA CRÍTICA superada con éxito:');
console.log('   - Pregunta:', qCritica);
console.log('   - Respuesta:', resCritica.answer);

// 5. Variaciones equivalentes de la misma intención (Desviación / Variación)
const qVar1 = '¿Cuánto es la desviación de volumen vs AA de Autoservicios?';
const resVar1 = NLQEngine.answerQuery(qVar1, state, REAL_BUNDLE, CommercialMathEngine);
assert(resVar1.answer.includes('Autoservicio') && resVar1.answer.includes('1.770,5'), 'Variación 1 debe calcular la desviación de Autoservicio');

const qVar2 = '¿Cuánto perdió Autoservicios contra el año pasado?';
const resVar2 = NLQEngine.answerQuery(qVar2, state, REAL_BUNDLE, CommercialMathEngine);
assert(resVar2.answer.includes('Autoservicio') && resVar2.answer.includes('1.770,5'), 'Variación 2 debe calcular cuánto perdió Autoservicio');

const qVar3 = 'Comparame el volumen de Autoservicios con AA.';
const resVar3 = NLQEngine.answerQuery(qVar3, state, REAL_BUNDLE, CommercialMathEngine);
assert(resVar3.answer.includes('Autoservicio') && resVar3.answer.includes('1.770,5'), 'Variación 3 debe comparar Autoservicio con AA');

const qVol = '¿Cuánto vendió Autoservicios?';
const resVol = NLQEngine.answerQuery(qVol, state, REAL_BUNDLE, CommercialMathEngine);
assert(resVol.answer.includes('Autoservicio') && resVol.answer.includes('4.841,1'), 'Debe responder volumen puro de Autoservicio: 4.841,1 HL');

const qHealth = '¿Autoservicios viene bien?';
const resHealth = NLQEngine.answerQuery(qHealth, state, REAL_BUNDLE, CommercialMathEngine);
assert(resHealth.answer.startsWith('No.') && resHealth.answer.includes('26,8%'), 'Diagnóstico debe indicar que viene 26,8% debajo del AA');
console.log('✅ 3. Comprensión semántica de variaciones y preguntas diagnósticas verificadas.');

// 6. Ranking de canales (pérdida de volumen)
const qRank1 = '¿Qué canal perdió más volumen?';
const resRank1 = NLQEngine.answerQuery(qRank1, state, REAL_BUNDLE, CommercialMathEngine);
assert(resRank1.answer.includes('Mayorista') && resRank1.answer.includes('-7.099,7'), 'Mayorista debe ser el canal con mayor pérdida (-7.099,7 HL)');

const qRank2 = '¿Cuál fue el canal que más cayó?';
const resRank2 = NLQEngine.answerQuery(qRank2, state, REAL_BUNDLE, CommercialMathEngine);
assert(resRank2.answer.includes('Mayorista') && resRank2.answer.includes('-7.099,7'), 'Debe resolver "¿Cuál fue el canal que más cayó?"');

const qRank3 = '¿Dónde tuvimos la mayor pérdida de HL?';
const resRank3 = NLQEngine.answerQuery(qRank3, state, REAL_BUNDLE, CommercialMathEngine);
assert(resRank3.answer.includes('Mayorista') && resRank3.answer.includes('-7.099,7'), 'Debe resolver "¿Dónde tuvimos la mayor pérdida de HL?"');
console.log('✅ 4. Identificación robusta de canales y rankings de caída verificados.');

// 7. Objetivos y Vendedores (separación estricta Objetivo vs Volumen)
const qObj1 = '¿Qué vendedor está más cerca de su objetivo?';
const resObj1 = NLQEngine.answerQuery(qObj1, state, REAL_BUNDLE, CommercialMathEngine);
assert(resObj1.answer.includes('Abel Zaleh') && resObj1.answer.includes('91,0%'), 'Vendedor cerca del objetivo debe ser Abel Zaleh con 91,0%');
assert(resObj1.answer.includes('326,1'), 'Debe indicar que le faltan 326,1 HL');

const qObj2 = '¿Quién está por llegar a la meta?';
const resObj2 = NLQEngine.answerQuery(qObj2, state, REAL_BUNDLE, CommercialMathEngine);
assert(resObj2.answer.includes('Abel Zaleh') && resObj2.answer.includes('91,0%'), 'Debe resolver "¿Quién está por llegar a la meta?"');

const qVolVend = '¿Qué vendedor vendió más?';
const resVolVend = NLQEngine.answerQuery(qVolVend, state, REAL_BUNDLE, CommercialMathEngine);
assert(resVolVend.answer.includes('Adrian Rodriguez') && resVolVend.answer.includes('4.759,9'), 'Vendedor con más ventas debe ser Adrian Rodriguez (4.759,9 HL)');
console.log('✅ 5. Distinción explícita de métricas (Objetivo vs Volumen) verificada.');

// 8. Análisis multipaso & Drivers de caída
const qDrivers = '¿Qué explica la caída de cerveza?';
const resDrivers = NLQEngine.answerQuery(qDrivers, state, REAL_BUNDLE, CommercialMathEngine);
assert(resDrivers.answer.includes('Cerveza') && resDrivers.answer.includes('-8.471,8'), 'Debe calcular la caída de Cerveza (-8.471,8 HL)');
assert(resDrivers.answer.includes('Mayorista') && resDrivers.answer.includes('-7.099,7'), 'Debe incluir al canal Mayorista como driver principal');
assert(resDrivers.answer.includes('Autoservicio') && resDrivers.answer.includes('-1.770,5'), 'Debe incluir a Autoservicio como driver secundario');
console.log('✅ 6. Análisis multipaso de causas internas comprobado:');
console.log('   - Respuesta drivers:', resDrivers.answer);

// 9. Memoria conversacional y seguimiento (Turnos consecutivos)
NLQEngine.clearLastQueryContext();
const t1 = NLQEngine.answerQuery('¿Qué canal perdió más volumen?', state, REAL_BUNDLE, CommercialMathEngine);
assert(t1.answer.includes('Mayorista'), 'Turno 1 debe responder Mayorista');

const t2 = NLQEngine.answerQuery('¿Y qué productos explican eso?', state, REAL_BUNDLE, CommercialMathEngine);
assert(t2.answer.includes('Mayorista') && t2.answer.includes('Cervezas') && t2.answer.includes('-7.099,7'), 'Turno 2 debe heredar contexto de Mayorista y explicar caída');

const t3 = NLQEngine.answerQuery('¿Y cuánto vendió?', state, REAL_BUNDLE, CommercialMathEngine);
assert(t3.answer.includes('Mayorista') && t3.answer.includes('6.646,8'), 'Turno 3 debe heredar Mayorista y responder su volumen vendido: 6.646,8 HL');
console.log('✅ 7. Contexto conversacional y resolución de pronombres ("eso", "¿Y cuánto vendió?") verificados.');

// 10. Manejo de ambigüedad
const qAmb = '¿Quién está mejor?';
const resAmb = NLQEngine.answerQuery(qAmb, state, REAL_BUNDLE, CommercialMathEngine);
assert(resAmb.interpreted === false && resAmb.ambiguous === true, 'Pregunta ambigua debe solicitar aclaración');
assert(resAmb.limitationMessage.includes('volumen') && resAmb.limitationMessage.includes('objetivo'), 'Debe sugerir alternativas para desambiguar');
console.log('✅ 8. Detección y aclaración de consultas ambiguas verificada.');

// 11. Rechazo de causas externas
const qExt = '¿Por qué cayó por el clima y la inflación?';
const resExt = NLQEngine.answerQuery(qExt, state, REAL_BUNDLE, CommercialMathEngine);
assert(resExt.interpreted === false && resExt.limitationMessage.includes('evidencias matemáticas'), 'Debe rechazar causas externas no demostrables');
console.log('✅ 9. Rechazo verificable de causas externas comprobado.');

// 12. PRUEBA CRÍTICA DE INTERPRETACIÓN SEMÁNTICA: On Premise vs Clientes Galaxia
// "¿Cómo está el volumen de On Premise vs el año pasado?"
// JAMÁS debe responder "209 clientes activos en On Premise..."
const qOnPrem1 = '¿Cómo está el volumen de On Premise vs el año pasado?';
const resOnPrem1 = NLQEngine.answerQuery(qOnPrem1, state, REAL_BUNDLE, CommercialMathEngine);
assert(resOnPrem1 && resOnPrem1.interpreted === true, 'On Premise debe ser interpretado');
assert(!resOnPrem1.answer.includes('209 clientes'), 'NUNCA debe responder 209 clientes activos');
assert(resOnPrem1.answer.includes('On Premise'), 'Debe identificar On Premise');
assert(resOnPrem1.answer.includes('creció'), 'Debe indicar que creció (+292,7 HL)');
assert(resOnPrem1.answer.includes('292,7') && resOnPrem1.answer.includes('6,4%'), 'Debe calcular exactamente 292,7 HL y +6,4%');

const qOnPrem2 = '¿Cuánto cayó On Premise?';
const resOnPrem2 = NLQEngine.answerQuery(qOnPrem2, state, REAL_BUNDLE, CommercialMathEngine);
assert(!resOnPrem2.answer.includes('209'), 'No debe responder clientes');
assert(resOnPrem2.answer.includes('292,7') && resOnPrem2.answer.includes('6,4%'), 'Debe reportar el crecimiento real de On Premise (+292,7 HL)');

const qOnPrem3 = 'Comparame On Premise contra AA.';
const resOnPrem3 = NLQEngine.answerQuery(qOnPrem3, state, REAL_BUNDLE, CommercialMathEngine);
assert(resOnPrem3.answer.includes('On Premise') && resOnPrem3.answer.includes('292,7'), 'Comparación de On Premise con AA');

// Bares / REF NOCTURNO
const qBares = '¿Cómo vienen los bares contra el año pasado?';
const resBares = NLQEngine.answerQuery(qBares, state, REAL_BUNDLE, CommercialMathEngine);
assert(!resBares.answer.includes('209 clientes'), 'Bares no debe responder 209 clientes');
assert(resBares.answer.includes('REF NOCTURNO') && resBares.answer.includes('405,8') && resBares.answer.includes('-18,6%'), 'Bares debe reportar caída de REF NOCTURNO (-405,8 HL, -18,6%)');

// Vendedor líder en Cerveza
const qVendCza = '¿Quién vendió más cerveza?';
const resVendCza = NLQEngine.answerQuery(qVendCza, state, REAL_BUNDLE, CommercialMathEngine);
assert(resVendCza.answer.includes('Brian Castillo'), 'Debe identificar a Brian Castillo como líder en Cerveza');
assert(resVendCza.answer.includes('3.495,6'), 'Debe reportar 3.495,6 HL para Brian Castillo');

// Drivers de caída en Autoservicios
const qDriversAS = '¿Qué productos explican la caída de Autoservicios?';
const resDriversAS = NLQEngine.answerQuery(qDriversAS, state, REAL_BUNDLE, CommercialMathEngine);
assert(resDriversAS.answer.includes('Autoservicios'), 'Debe identificar canal Autoservicios');
assert(resDriversAS.answer.includes('Andes Ret') && resDriversAS.answer.includes('1.028,0'), 'Debe reportar Andes Ret (-1.028,0 HL)');
assert(resDriversAS.answer.includes('Quilmes Clásica 1L') && resDriversAS.answer.includes('536,6'), 'Debe reportar Quilmes Clásica 1L (-536,6 HL)');

// Salud comercial en UNG
const qUng = '¿Estamos creciendo en UNG?';
const resUng = NLQEngine.answerQuery(qUng, state, REAL_BUNDLE, CommercialMathEngine);
assert(resUng.answer.startsWith('No.') && resUng.answer.includes('UNG'), 'Debe diagnosticar que UNG no está creciendo');
assert(resUng.answer.includes('1.095,9') && resUng.answer.includes('-10,9%'), 'Debe reportar caída de UNG (-1.095,9 HL, -10,9%)');

console.log('✅ 10. Consultas críticas resueltas con exactitud (On Premise, Bares, Cerveza, Drivers Autoservicios, UNG).');

// 13. Validación numérica estricta (ResponseValidator)
const rv = AIAgentModule.ResponseValidator.validate(resCritica.answer, resCritica.structuredResult || resCritica.result);
assert(rv.valid === true, 'Los números en la respuesta crítica deben estar certificados por ResponseValidator');
const rvOnPrem = AIAgentModule.ResponseValidator.validate(resOnPrem1.answer, resOnPrem1.structuredResult || resOnPrem1.result);
assert(rvOnPrem.valid === true, 'Los números de On Premise deben estar certificados');
const rvBares = AIAgentModule.ResponseValidator.validate(resBares.answer, resBares.structuredResult || resBares.result);
assert(rvBares.valid === true, 'Los números de Bares deben estar certificados');
const rvDriversAS = AIAgentModule.ResponseValidator.validate(resDriversAS.answer, resDriversAS.structuredResult || resDriversAS.result);
assert(rvDriversAS.valid === true, 'Los números de drivers de Autoservicios deben estar certificados');
const rvUng = AIAgentModule.ResponseValidator.validate(resUng.answer, resUng.structuredResult || resUng.result);
assert(rvUng.valid === true, 'Los números de UNG deben estar certificados');
console.log('✅ 11. Validación numérica estricta: cero números inventados.');

// 14. Seguridad y Privacidad
const filesToCheck = ['src/app.js', 'src/modules/nlqEngine.js', 'index.html', 'src/modules/aiAgent/index.js'];
const apiKeyPatterns = [/AIzaSy[A-Za-z0-9_-]{33}/, /sk-[A-Za-z0-9]{20,}/, /Bearer\s+ey/];
for (const f of filesToCheck) {
  const content = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  for (const pat of apiKeyPatterns) {
    assert(!pat.test(content), `No debe existir ninguna API key en ${f}`);
  }
}
console.log('✅ 12. Cero API keys en código fuente cliente (Arquitectura segura y local).');

// 15. Validación obligatoria de Agente de Análisis Comercial (10 preguntas obligatorias + casos libres)
const mandatorySuite = [
  { q: '¿Qué es YTD?', mustContain: ['Year To Date', '33.684,7'] },
  { q: '¿Qué es CCC?', mustContain: ['Clientes Con Compra', '1.482'] },
  { q: '¿Qué significa CCC?', mustContain: ['Clientes Con Compra', '1.482'] },
  { q: '¿Cuánto volumen llevamos YTD?', mustContain: ['33.684,7', '-23,5%'] },
  { q: '¿Cómo está On Premise vs año pasado?', mustContain: ['On Premise', '292,7', '+6,4%'] },
  { q: '¿Qué canal perdió más volumen?', mustContain: ['Mayorista', '-7.099,7'] },
  { q: '¿Qué canal cayó más?', mustContain: ['Mayorista', '-7.099,7'] },
  { q: '¿Cuál fue el mejor trimestre?', mustContain: ['T1 (Ene–Mar)', '15.746,9'] },
  { q: '¿Qué productos explican la caída de volumen?', mustContain: ['-10.351,0', 'Quilmes Clásica Ret 1L', 'Andes X12 970 Ret'] },
  { q: '¿Cuántos clientes únicos compraron?', mustContain: ['1.482', '1.268'] },
  { q: '¿Cómo viene octubre?', mustContain: ['Octubre 2026', '2.763,4', '-56,6%', '1.118'] },
  { q: '¿Por qué cayó Mayoristas?', mustContain: ['Mayorista', '-7.099,7', 'Cervezas', 'Andes X12 970 Ret'] },
  { q: '¿Qué productos explican la caída de Mayoristas?', mustContain: ['Mayorista', 'Andes X12 970 Ret', 'Quilmes Clásica Ret 1L'] },
  { q: '¿Quién fue el mejor vendedor de septiembre?', mustContain: ['Septiembre', 'Brian Castillo', '543,0'] },
  { q: '¿Qué clientes dejaron de comprar?', mustContain: ['143 clientes', '2.522,9', 'Nuevo Bodegon'] },
  { q: '¿Por qué cayó el volumen?', mustContain: ['-10.351,0', 'Mayorista', 'Cervezas', '1.482'] },
  { q: 'Comparame cerveza con aguas.', mustContain: ['Cervezas', '22.839,0', 'Aguas', '1.738,0', '21.101,0'] },
  { q: '¿Qué pasó con Aiellos este año?', mustContain: ['Supermercados Aiello', '2.852,3', '-15,3%', 'UNG'] }
];

for (const item of mandatorySuite) {
  const r = NLQEngine.answerQuery(item.q, state, REAL_BUNDLE, CommercialMathEngine);
  assert(r && r.interpreted === true, `La pregunta "${item.q}" debe ser interpretada`);
  for (const token of item.mustContain) {
    assert(r.answer.includes(token), `Respuesta a "${item.q}" debe incluir "${token}". Recibido: ${r.answer}`);
  }
  const v = AIAgentModule.ResponseValidator.validate(r.answer, r.structuredResult || r.result);
  assert(v.valid === true, `Todos los números en "${item.q}" deben estar certificados por ResponseValidator`);
}
console.log('✅ 13. Las 18 consultas de validación comercial (conceptuales, causales, comparativas y período) pasaron al 100%.');

console.log('\n🎉 TODAS LAS VERIFICACIONES DEL AGENTE IA PASARON CON 100% DE ÉXITO! 🎉\n');
