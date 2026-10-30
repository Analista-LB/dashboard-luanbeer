/**
 * @fileoverview Suite de verificación específica para la evolución Dashboard LuanBeer.
 * Prueba:
 * 1. Endpoint /api/rescan-bases en server.js.
 * 2. Reconocimiento fuzzy de nombres y huella de columnas de 5 campos en IngestionEngine.
 * 3. Upsert incremental particionado en CustomConsolidator (reemplazo sin duplicación histórica).
 * 4. Integridad de branding, menú limpio sin badges, y estructura de acordeón en index.html y corporate.css.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const WORKSPACE = path.resolve(__dirname, '..');
global.window = global;

const IngestionEngine = require(path.join(WORKSPACE, 'src', 'modules', 'ingestionEngine.js'));
const CustomConsolidator = require(path.join(WORKSPACE, 'src', 'modules', 'customConsolidator.js'));
const CommercialMathEngine = require(path.join(WORKSPACE, 'src', 'modules', 'commercialMathEngine.js'));
const { createServer } = require(path.join(WORKSPACE, 'server.js'));

require(path.join(WORKSPACE, 'src', 'data', 'real_data_bundle.js'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  console.log('================================================================================');
  console.log('  TEST DE EVOLUCIÓN & REFACTORING — DASHBOARD LUANBEER');
  console.log('================================================================================\n');

  // 1. Endpoint /api/rescan-bases
  console.log('1. Probando endpoint HTTP /api/rescan-bases...');
  const { Writable } = require('stream');
  const server = createServer();
  const apiRes = await new Promise((resolve, reject) => {
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
    server.emit('request', { url: '/api/rescan-bases', headers: { host: 'localhost:8080' } }, res);
  });

  assert(apiRes.statusCode === 200, `Status esperado 200, obtenido: ${apiRes.statusCode}`);
  const apiData = JSON.parse(apiRes.body);
  assert(apiData.distribuidor === 'LuanBeer', `Distribuidor esperado 'LuanBeer', obtenido: ${apiData.distribuidor}`);
  assert(apiData.totalFiles >= 20, `Esperados al menos 20 archivos en 1. Bases, detectados: ${apiData.totalFiles}`);
  assert(apiData.detectedPeriod.includes('2026/10'), `Período detectado debe incluir 2026/10: ${apiData.detectedPeriod}`);
  console.log(`  [PASS] /api/rescan-bases respondió 200 OK con ${apiData.totalFiles} archivos y período "${apiData.detectedPeriod}".`);

  // 2. Reconocimiento Fuzzy y Huella de Columnas
  console.log('\n2. Probando reconocimiento fuzzy y huella de 5 columnas...');
  const cols5 = [
    { name: 'Año/Mes', semanticRole: 'periodo' },
    { name: 'Código Cliente', semanticRole: 'cod_cliente' },
    { name: 'Código Producto', semanticRole: 'cod_producto' },
    { name: 'Cantidad Total en HL', semanticRole: 'volumen_hl' },
    { name: 'Importe Neto', semanticRole: 'facturacion_neta' }
  ];
  assert(IngestionEngine.matchSalesColumnFingerprint(cols5) === true, 'Debe reconocer huella canónica de 5 columnas');

  const colsVariations = [
    { name: 'Periodo', semanticRole: 'periodo' },
    { name: 'Cliente_ID', semanticRole: 'cod_cliente' },
    { name: 'Articulo', semanticRole: 'cod_producto' },
    { name: 'Volumen_Litros', semanticRole: 'volumen_litros' },
    { name: 'Facturacion_Neta', semanticRole: 'facturacion_neta' }
  ];
  assert(IngestionEngine.matchSalesColumnFingerprint(colsVariations) === true, 'Debe reconocer variaciones de huella con Litros');

  const alias1 = IngestionEngine.matchFileNameAlias('Base a la Fecha MA.xlsx');
  assert(alias1 && alias1.canonicalEntity === 'Base a la fecha', 'Debe reconocer alias "Base a la Fecha MA.xlsx"');

  const alias2 = IngestionEngine.matchFileNameAlias('Base a la fecha - Octubre.xlsx');
  assert(alias2 && alias2.canonicalEntity === 'Base a la fecha', 'Debe reconocer alias "Base a la fecha - Octubre.xlsx"');

  const classified = IngestionEngine.classifySheet('Detalle', 'Base a la Fecha MA.xlsx', cols5, 500);
  assert(classified.isFingerprintMatch === true && classified.confidence === 1.0, 'Clasificación debe otorgar 100% de confianza por huella');
  console.log(`  [PASS] Huella de 5 columnas y alias fuzzy verificados al 100% de confianza.`);

  // 3. Upsert Incremental Particionado en CustomConsolidator
  console.log('\n3. Probando upsert incremental particionado...');
  const testBundle = JSON.parse(JSON.stringify(global.__ARGON_REAL_BUNDLE__));
  const preIdx = CommercialMathEngine.ensureIndexes(testBundle);
  assert(preIdx.maxMonth2026 === 9, `Mes máximo inicial 2026 debe ser 9, obtenido: ${preIdx.maxMonth2026}`);
  const initialSalesCount = testBundle.salesColumnar.count;

  // Insertar registros para 2026/10
  const octRecords = [
    { per: '2026/10', cte: 1001, prod: 78043, canal: 'Tradicional', vend: 1, sup: 100, ccc: 1, bultos: 15, hl: 2.5, neto: 250000, bonif: 0, source: 1 },
    { per: '2026/10', cte: 1002, prod: 29056, canal: 'Tradicional', vend: 2, sup: 100, ccc: 1, bultos: 30, hl: 5.0, neto: 500000, bonif: 0, source: 1 }
  ];

  const upRes1 = CustomConsolidator.upsertSalesPartition(testBundle, octRecords, { partitionPeriod: '2026/10' });
  assert(upRes1.success === true, 'El upsert debe ser exitoso');
  assert(upRes1.appendedCount === 2, `Esperados 2 registros agregados, obtenidos: ${upRes1.appendedCount}`);
  assert(testBundle.salesColumnar.count === initialSalesCount + 2, 'Total de filas debe sumar exactamente 2');

  const postIdx1 = CommercialMathEngine.ensureIndexes(testBundle);
  assert(postIdx1.maxMonth2026 === 10, `El mes máximo 2026 debe actualizarse reactivamente a 10, obtenido: ${postIdx1.maxMonth2026}`);

  // Re-upsert (reemplazo de la misma partición 2026/10 con 3 registros nuevos)
  const octRecordsReplacement = [
    { per: '2026/10', cte: 1001, prod: 78043, canal: 'Tradicional', vend: 1, sup: 100, ccc: 1, bultos: 10, hl: 1.0, neto: 100000, bonif: 0, source: 1 },
    { per: '2026/10', cte: 1002, prod: 29056, canal: 'Tradicional', vend: 2, sup: 100, ccc: 1, bultos: 20, hl: 2.0, neto: 200000, bonif: 0, source: 1 },
    { per: '2026/10', cte: 1003, prod: 569, canal: 'Tradicional', vend: 3, sup: 100, ccc: 1, bultos: 40, hl: 4.0, neto: 400000, bonif: 0, source: 1 }
  ];

  const upRes2 = CustomConsolidator.upsertSalesPartition(testBundle, octRecordsReplacement, { partitionPeriod: '2026/10' });
  assert(upRes2.replacedCount === 2, `Debe reemplazar exactamente los 2 registros anteriores de 2026/10, reemplazados: ${upRes2.replacedCount}`);
  assert(upRes2.appendedCount === 3, `Esperados 3 registros nuevos, agregados: ${upRes2.appendedCount}`);
  assert(testBundle.salesColumnar.count === initialSalesCount + 3, 'El recuento total debe reflejar exactamente el reemplazo sin duplicación');

  // Verificar que meses históricos cerrados (2025 completo y 2026/01..2026/09) quedaron intactos
  const sPer = testBundle.salesColumnar.per;
  const pDict = testBundle.dictionaries.periodos;
  let sep26Count = 0;
  for (let i = 0; i < sPer.length; i++) {
    if (pDict[sPer[i]] === '2026/09') sep26Count++;
  }
  assert(sep26Count === 14338, `Meses históricos anteriores intactos (esperados 14,338, obtenidos: ${sep26Count})`);
  console.log(`  [PASS] Upsert particionado verificado: reemplaza partición sin duplicar y preserva meses cerrados (${sep26Count} registros en 2026/09).`);

  // 4. Verificación de UI, Branding y Acordeón de Filtros
  console.log('\n4. Probando integridad de index.html y corporate.css...');
  const indexHtml = fs.readFileSync(path.join(WORKSPACE, 'index.html'), 'utf8');
  assert(indexHtml.includes('Dashboard LuanBeer'), 'index.html debe contener "Dashboard LuanBeer"');
  assert(indexHtml.includes('Gestión Comercial & Distribución'), 'index.html debe contener subtítulo');
  assert(indexHtml.includes('src/assets/logo_luanbeer.jpg'), 'index.html debe incluir la imagen oficial del logo en src/assets/logo_luanbeer.jpg');
  assert(indexHtml.includes('class="brand-logo-img"'), 'index.html debe tener la clase brand-logo-img');
  assert(fs.existsSync(path.join(WORKSPACE, 'src', 'assets', 'logo_luanbeer.jpg')), 'El archivo de imagen src/assets/logo_luanbeer.jpg debe existir');
  assert(indexHtml.includes('id="btnSyncBases"') || indexHtml.includes('id="btnActualizarBases"'), 'index.html debe tener botón #btnSyncBases / #btnActualizarBases');
  assert(indexHtml.includes('id="filterAccordion"'), 'index.html debe tener #filterAccordion');
  assert(indexHtml.includes('id="filterAccordionToggle"'), 'index.html debe tener #filterAccordionToggle');
  assert(indexHtml.includes('id="filterSummaryChip"'), 'index.html debe tener #filterSummaryChip');
  assert(indexHtml.includes('id="toastContainer"'), 'index.html debe tener #toastContainer');
  assert(!indexHtml.includes('btnInspectSynthetic10'), 'index.html NO debe incluir btnInspectSynthetic10');

  const css = fs.readFileSync(path.join(WORKSPACE, 'src', 'styles', 'corporate.css'), 'utf8');
  assert(css.includes('--bg-app: #f8fafc;') || css.includes('--bg-primary: #0f172a;'), 'corporate.css debe usar paleta ejecutiva');
  assert(css.includes('.brand-logo-img'), 'corporate.css debe definir .brand-logo-img');
  assert(css.includes('#btnActualizarBases') || css.includes('.btn-sync-bases'), 'corporate.css debe estilizar #btnActualizarBases / .btn-sync-bases');
  assert(css.includes('.filter-accordion'), 'corporate.css debe tener estilos para .filter-accordion');
  assert(css.includes('.btn-sync-bases'), 'corporate.css debe tener estilos para .btn-sync-bases');
  assert(css.includes('.toast-container'), 'corporate.css debe tener estilos para toast');
  assert(css.includes('.nav-badge') && css.includes('display: none !important;'), 'corporate.css debe ocultar nav-badges');
  console.log(`  [PASS] Interfaz, Logo LuanBeer oficial, Botón Actualizar Bases, Acordeón y Paleta Slate verificados.`);

  console.log('\n================================================================================');
  console.log('  TODAS LAS PRUEBAS DE EVOLUCIÓN LUANBEER PASARON EXITOSAMENTE (100% OK)');
  console.log('================================================================================');
}

run().catch(err => {
  console.error('Error en prueba de evolución LuanBeer:', err);
  process.exit(1);
});
