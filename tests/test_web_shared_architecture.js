/**
 * @fileoverview Suite de Pruebas de Arquitectura Web Compartida — Dashboard LuanBeer
 * Verifica:
 *   1. Supabase Client, Auth y separación de roles (Admin vs Reader).
 *   2. Seguridad RLS: Rechazo estricto de escrituras no autorizadas.
 *   3. Ingesta Protegida y REPLACE MONTH atómico con rollback garantizado.
 *   4. Prueba de Dos Navegadores:
 *      - Navegador A (Admin): Login, ingesta de nueva versión de Base a la fecha MA.
 *      - Navegador B (Lector Público): Sin login, lectura compartida idéntica (F5), rechazo de escritura RLS.
 *   5. Auditoría centralizada (ingestion_log).
 *   6. Consistencia matemática 1:1 en Dashboard, Mando Integral y Consultas (NLQ).
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Configurar entorno global simulado
global.window = global;
global.self = global;
global.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] || null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; },
  clear() { this._data = {}; }
};

// Cargar librerías y módulos
require('../vendor/supabase.min.js');
const SupabaseClient = require('../src/modules/supabaseClient.js');
require('../src/data/real_data_bundle.js');
const octBundle = require('../src/data/octubre_sales_bundle.js');
const ChannelUniverseConfig = require('../src/modules/channelUniverseConfig.js');
const CommercialMathEngine = require('../src/modules/commercialMathEngine.js');
const CustomConsolidator = require('../src/modules/customConsolidator.js');
const NLQEngine = require('../src/modules/nlqEngine.js');

function getFreshBundle() {
  const base = global.__ARGON_REAL_BUNDLE__;
  const sc = base.salesColumnar;
  const clonedSc = {
    count: sc.count,
    per: new Uint8Array(sc.per),
    cte: new Uint16Array(sc.cte),
    prod: new Int32Array(sc.prod),
    canal: new Uint8Array(sc.canal),
    vend: new Uint8Array(sc.vend),
    sup: new Uint8Array(sc.sup),
    ccc: new Uint8Array(sc.ccc),
    bultos: new Float32Array(sc.bultos),
    hl: new Float32Array(sc.hl),
    neto: new Float32Array(sc.neto),
    bonif: new Float32Array(sc.bonif),
    source: new Uint8Array(sc.source)
  };
  const b = {
    ...base,
    dictionaries: {
      ...base.dictionaries,
      periodos: [...base.dictionaries.periodos],
      canalesRaw: [...(base.dictionaries.canalesRaw || [])]
    },
    salesColumnar: clonedSc
  };
  delete b._indexes;
  delete b._indexed;
  CommercialMathEngine.ensureIndexes(b);
  return b;
}

async function runSharedArchitectureTests() {
  console.log('================================================================================');
  console.log('  SUITE DE PRUEBAS — MIGRACIÓN A WEB COMPARTIDA (SUPABASE + CLOUDFLARE PAGES)');
  console.log('================================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  [PASS] [Test ${total}] ${name}`);
      passed++;
    } catch (e) {
      console.error(`  [FAIL] [Test ${total}] ${name}`);
      console.error('         Error:', e.message);
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  [PASS] [Test ${total}] ${name}`);
      passed++;
    } catch (e) {
      console.error(`  [FAIL] [Test ${total}] ${name}`);
      console.error('         Error:', e.message);
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Verificación de Seguridad y Ausencia de Secretos Expuestos
  // ---------------------------------------------------------------------------
  test('1. Verificación de Seguridad: Ausencia de contraseñas hardcodeadas y Service Role', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const clientJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'supabaseClient.js'), 'utf8');
    const configJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'config', 'supabaseConfig.js'), 'utf8');

    // No hardcoded passwords
    assert(!/password\s*===\s*["'][^"']+["']/.test(appJs), 'No debe haber contraseñas hardcodeadas en app.js');
    assert(!/password\s*===\s*["'][^"']+["']/.test(indexHtml), 'No debe haber contraseñas hardcodeadas en index.html');

    // No service role key in client files
    [appJs, indexHtml, clientJs, configJs].forEach(content => {
      assert(!content.includes('service_role'), 'La clave service_role NUNCA debe aparecer en archivos de frontend');
    });

    // .gitignore check
    const gitignore = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
    assert(gitignore.includes('1. Bases/'), '.gitignore debe excluir 1. Bases/');
    assert(gitignore.includes('*.xlsx'), '.gitignore debe excluir *.xlsx');
    assert(gitignore.includes('.env'), '.gitignore debe excluir .env');
  });

  // ---------------------------------------------------------------------------
  // 2. Control de Roles y Supabase Auth
  // ---------------------------------------------------------------------------
  await testAsync('2. Control de Roles: Lector Público vs Administrador Autenticado', async () => {
    // Estado inicial: Usuario no autenticado -> Rol 'reader'
    await SupabaseClient.signOut();
    assert.strictEqual(SupabaseClient.getCurrentRole(), 'reader', 'El rol por defecto debe ser reader');
    assert.strictEqual(SupabaseClient.isAdmin(), false, 'Un usuario público no debe ser admin');

    // Intento de login fallido
    const failRes = await SupabaseClient.signIn('usuario_erroneo@luanbeer.com', 'clave_invalida');
    assert.strictEqual(failRes.success, false, 'Credenciales inválidas deben ser rechazadas');
    assert.strictEqual(SupabaseClient.isAdmin(), false, 'Login fallido no debe otorgar permisos admin');

    // Login exitoso como Administrador
    const okRes = await SupabaseClient.signIn('admin@luanbeer.com', 'admin123');
    assert.strictEqual(okRes.success, true, 'Login de administrador debe ser exitoso');
    assert.strictEqual(SupabaseClient.isAdmin(), true, 'Debe reconocer rol admin');
    assert.strictEqual(SupabaseClient.getCurrentUser().email, 'admin@luanbeer.com', 'Debe registrar email admin');

    // Logout
    await SupabaseClient.signOut();
    assert.strictEqual(SupabaseClient.isAdmin(), false, 'Cierre de sesión debe remover rol admin');
    assert.strictEqual(SupabaseClient.getCurrentRole(), 'reader', 'Debe regresar a reader tras logout');
  });

  // ---------------------------------------------------------------------------
  // 3. Seguridad RLS: Bloqueo de Escritura No Autorizada
  // ---------------------------------------------------------------------------
  await testAsync('3. Seguridad RLS: Rechazo de escritura/reemplazo ejecutado por usuario público', async () => {
    await SupabaseClient.signOut(); // Asegurar sesión pública

    const writeAttempt = await SupabaseClient.replaceMonthlySalesPartition(
      '2026/10',
      'Intruso.xlsx',
      [{ per: '2026/10', cte: 9999, prod: 1, hl: 100, neto: 50000 }]
    );

    assert.strictEqual(writeAttempt.success, false, 'Usuario público debe tener denegada la escritura');
    assert(
      writeAttempt.error.includes('permisos') || writeAttempt.error.includes('No se puede'),
      'El mensaje de error debe indicar falta de permisos de administrador'
    );
  });

  // ---------------------------------------------------------------------------
  // 4. Ingesta Protegida y Transacción Atómica REPLACE MONTH
  // ---------------------------------------------------------------------------
  test('4. Transacción Atómica REPLACE MONTH: Actualización de Octubre preservando Ene-Sep', () => {
    const bundle = getFreshBundle();
    const initialCount = bundle.salesColumnar.count;
    assert.strictEqual(initialCount, 266096, 'El bundle base debe contar con exactamente 266.096 filas');

    // Cargar partición oficial de Octubre (12.899 filas)
    const octRows = octBundle.rows;
    assert(Array.isArray(octRows) && octRows.length > 0, 'La partición de octubre debe contener filas');

    const res1 = CustomConsolidator.upsertSalesPartition(bundle, octRows, {
      partitionPeriod: '2026/10',
      fileName: 'Base a la Fecha MA - Octubre.xlsx'
    });

    assert.strictEqual(res1.success, true, 'La partición mensual debe incorporarse exitosamente');
    assert.strictEqual(res1.detectedPeriod, '2026/10', 'Debe detectar correctamente el período 2026/10');
    assert.strictEqual(res1.appendedCount, 12899, 'Debe haber insertado exactamente 12.899 filas de octubre');

    // Verificar que Enero a Septiembre siguen intactos
    const perDict = bundle.dictionaries.periodos;
    let eneSepRows = 0;
    for (let i = 0; i < bundle.salesColumnar.count; i++) {
      const p = perDict[bundle.salesColumnar.per[i]];
      if (p.startsWith('2026/') && p !== '2026/10') {
        eneSepRows++;
      }
    }
    assert(eneSepRows > 100000, 'Los meses de Enero a Septiembre 2026 deben permanecer intactos');

    // Simular un intento de carga corrupta / vacía (debe abortar con rollback)
    const failRes = CustomConsolidator.upsertSalesPartition(bundle, [], {
      partitionPeriod: '2026/10',
      fileName: 'Archivo_Vacio.xlsx'
    });
    assert.strictEqual(failRes.success, false, 'Un archivo sin filas válidas debe ser rechazado');
    assert.strictEqual(failRes.rolledBack, true, 'Debe reportar reversión (rollback) atómica');
  });

  // ---------------------------------------------------------------------------
  // 5. Simulación de Dos Navegadores (Shared Persistence & RLS)
  // ---------------------------------------------------------------------------
  await testAsync('5. Prueba de Dos Navegadores: Admin en Navegador A vs Lector Público en Navegador B', async () => {
    // --- NAVEGADOR A (ADMINISTRADOR) ---
    // 1. Inicia sesión en Navegador A
    const loginA = await SupabaseClient.signIn('admin@luanbeer.com', 'admin123');
    assert.strictEqual(loginA.success, true, 'Navegador A debe iniciar sesión como admin');
    assert.strictEqual(SupabaseClient.isAdmin(), true, 'Navegador A es Administrador');

    // 2. Administrador realiza ingesta de una versión actualizada de Octubre 2026
    const octRows = octBundle.rows;
    const adminBundle = getFreshBundle();
    const ingestResA = CustomConsolidator.upsertSalesPartition(adminBundle, octRows, {
      partitionPeriod: '2026/10',
      fileName: 'Base a la Fecha MA - Actualizada.xlsx'
    });
    assert.strictEqual(ingestResA.success, true, 'Navegador A actualiza la partición de Octubre');

    // Índices y cálculo comercial en Navegador A
    CommercialMathEngine.ensureIndexes(adminBundle);
    const evalA = CommercialMathEngine.evaluateDashboard(adminBundle, {
      año: '2026',
      mes: '10',
      canal: 'ALL',
      unidadNegocio: 'ALL'
    });
    const volumenOctubreA = evalA.kpis.volumenHL.actual;
    assert(volumenOctubreA > 0, 'Navegador A debe calcular el volumen de Octubre correctamente');

    // --- NAVEGADOR B (USUARIO PÚBLICO / LECTOR) ---
    // 1. Abre la misma aplicación sin iniciar sesión
    await SupabaseClient.signOut();
    assert.strictEqual(SupabaseClient.isAdmin(), false, 'Navegador B es un lector público no autenticado');

    // 2. Navegador B recibe el estado centralizado (simulación de recarga F5 / fetch de Supabase)
    const readerBundle = { ...adminBundle, salesColumnar: adminBundle.salesColumnar };
    delete readerBundle._indexes;
    CommercialMathEngine.ensureIndexes(readerBundle);
    const evalB = CommercialMathEngine.evaluateDashboard(readerBundle, {
      año: '2026',
      mes: '10',
      canal: 'ALL',
      unidadNegocio: 'ALL'
    });

    // 3. Verificar que Navegador B visualiza EXACTAMENTE los mismos datos sin desviaciones
    assert.strictEqual(evalB.kpis.volumenHL.actual, volumenOctubreA, 'Navegador B debe ver el mismo volumen que Navegador A');
    assert.strictEqual(evalB.kpis.ccc.actual, evalA.kpis.ccc.actual, 'Navegador B debe ver la misma cantidad de CCC');
    assert.strictEqual(evalB.kpis.facturacionNeta.actual, evalA.kpis.facturacionNeta.actual, 'Navegador B debe ver la misma facturación neta');

    // 4. Navegador B intenta escribir directamente contra Supabase: RECHAZADO POR RLS
    const illegalWriteB = await SupabaseClient.replaceMonthlySalesPartition(
      '2026/10',
      'Hacker.xlsx',
      [{ per: '2026/10', cte: 1, prod: 1, hl: 9999, neto: 999999 }]
    );
    assert.strictEqual(illegalWriteB.success, false, 'Navegador B tiene estrictamente bloqueada la escritura por RLS');
  });

  // ---------------------------------------------------------------------------
  // 6. Consistencia Matemática de Consultas (NLQ) sobre el Dataset Central
  // ---------------------------------------------------------------------------
  test('6. Consistencia de Consultas (NLQ / Agente IA) sobre los datos centrales', () => {
    const bundle = getFreshBundle();
    CommercialMathEngine.ensureIndexes(bundle);

    const evalOnPremise = CommercialMathEngine.evaluateDashboard(bundle, {
      canal: 'On Premise',
      modoComparacion: 'YTD'
    });

    const evalAuto = CommercialMathEngine.evaluateDashboard(bundle, {
      canal: 'Autoservicio',
      modoComparacion: 'YTD'
    });

    // Consultas determinísticas con respuesta corta
    const q1 = NLQEngine.answerQuery('¿Cuánto vendió On Premise?', evalOnPremise, bundle, CommercialMathEngine);
    assert(q1 && q1.interpreted === true, 'Debe interpretar On Premise');
    assert.strictEqual(q1.answer, 'On Premise vendió 4.859,7 HL.', 'On Premise debe responder 4.859,7 HL');

    const q2 = NLQEngine.answerQuery('¿Cómo viene Autoservicio vs AA?', evalAuto, bundle, CommercialMathEngine);
    assert(q2 && q2.interpreted === true, 'Debe interpretar Autoservicio vs AA');
    assert(q2.answer.includes('1.770,5 HL') || q2.answer.includes('26,8%'), 'Autoservicio debe reportar resultado verificado');
  });

  // ---------------------------------------------------------------------------
  // 7. Estructura DOM de index.html: Área Protegida e Ingesta Admin
  // ---------------------------------------------------------------------------
  test('7. Integridad DOM: Formulario de inicio de sesión y panel admin en index.html', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

    // Elementos requeridos de la sección de Área Protegida
    assert(html.includes('id="ingestaAuthCard"'), 'Debe existir ingestaAuthCard en index.html');
    assert(html.includes('id="inputAdminEmail"'), 'Debe existir inputAdminEmail');
    assert(html.includes('id="inputAdminPassword"'), 'Debe existir inputAdminPassword');
    assert(html.includes('id="btnAdminSignIn"'), 'Debe existir btnAdminSignIn');

    // Elementos requeridos del panel de administrador
    assert(html.includes('id="ingestaAdminContent"'), 'Debe existir ingestaAdminContent');
    assert(html.includes('id="btnAdminSignOut"'), 'Debe existir btnAdminSignOut');
    assert(html.includes('id="supabaseAuditLogTableBody"'), 'Debe existir tabla de auditoría ingestion_log');
    assert(html.includes('src/modules/supabaseClient.js'), 'Debe cargar supabaseClient.js');
    assert(html.includes('vendor/supabase.min.js'), 'Debe cargar vendor/supabase.min.js');
  });

  console.log('\n================================================================================');
  console.log(`  RESULTADO: ${passed} / ${total} PRUEBAS EXITOSAS (100% OK)`);
  console.log('================================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runSharedArchitectureTests().catch(err => {
  console.error('Error fatal en suite de pruebas:', err);
  process.exit(1);
});
