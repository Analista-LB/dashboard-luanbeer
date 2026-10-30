/**
 * @fileoverview Script de Ingesta y Siembra Completa a Supabase para Dashboard LuanBeer.
 * Ejecuta la migración de los maestros, datos consolidados, estado de Tablero/Galaxia
 * y auditoría hacia PostgreSQL en Supabase.
 *
 * Uso:
 *   node scripts/seed_supabase.js
 *
 * Busca SUPABASE_SERVICE_ROLE_KEY en:
 *   1. Variable de entorno actual (process.env.SUPABASE_SERVICE_ROLE_KEY)
 *   2. Archivo .env en la raíz del proyecto (ignorado por .gitignore)
 *   3. Variables de entorno de usuario de Windows (HKCU\Environment)
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

// 1. Cargar .env si existe
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const k = trimmed.slice(0, idx).trim();
        const v = trimmed.slice(idx + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    }
  });
}

// 2. Si no está en process.env, buscar en variables de entorno de Windows (HKCU)
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const regOutput = execSync('reg query HKCU\\Environment /v SUPABASE_SERVICE_ROLE_KEY', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const match = regOutput.match(/SUPABASE_SERVICE_ROLE_KEY\s+REG_\w+\s+(.+)/);
    if (match && match[1]) {
      process.env.SUPABASE_SERVICE_ROLE_KEY = match[1].trim();
    }
  } catch (e) { /* ignore */ }
}

// 3. Cargar SUPABASE_URL desde src/config/supabaseConfig.js si no viene en env
let SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  try {
    const cfg = require('../src/config/supabaseConfig.js');
    if (cfg && cfg.url) SUPABASE_URL = cfg.url;
  } catch (e) {}
}

const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

function createSupabaseClient(url, key) {
  const vendorPath = path.join(__dirname, '..', 'vendor', 'supabase.min.js');
  const code = fs.readFileSync(vendorPath, 'utf8');
  const ctx = {
    window: {},
    self: {},
    fetch: global.fetch,
    console: console,
    Headers: global.Headers,
    Request: global.Request,
    Response: global.Response,
    URL: global.URL,
    URLSearchParams: global.URLSearchParams,
    WebSocket: global.WebSocket || class DummyWS {},
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.supabase.createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function runSeed() {
  console.log('================================================================');
  console.log(' SEED COMPLETO A SUPABASE — DASHBOARD LUANBEER');
  console.log('================================================================');

  if (!SUPABASE_KEY) {
    console.log('\n[AVISO CRÍTICO] SUPABASE_SERVICE_ROLE_KEY no encontrada.');
    console.log('Para cargarla localmente de forma segura (sin exponerla en el chat):');
    console.log('\n--- OPCIÓN 1 (Recomendada: Archivo .env en la raíz del proyecto) ---');
    console.log('Creá el archivo: c:\\Users\\thoma\\OneDrive\\Desktop\\Argon Gemini\\.env');
    console.log('Con el contenido:');
    console.log('SUPABASE_SERVICE_ROLE_KEY=tu_secret_service_role_key_aqui');
    console.log('(El archivo .env está protegido por .gitignore y nunca se subirá a git)\n');
    console.log('--- OPCIÓN 2 (Variable de Entorno de Usuario en PowerShell) ---');
    console.log('[Environment]::SetEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY", "tu_secret_service_role_key_aqui", "User")\n');
    return { success: false, missingKey: true };
  }

  // Cargar bundle real
  global.window = global;
  require('../src/data/real_data_bundle.js');
  const bundle = global.__ARGON_REAL_BUNDLE__;

  if (!bundle) {
    console.error('Error: no se pudo cargar __ARGON_REAL_BUNDLE__');
    process.exit(1);
  }

  const GalaxiaEngine = require('../src/modules/galaxiaEngine.js');

  const totalSalesRows = bundle.salesColumnar ? bundle.salesColumnar.count : 0;
  console.log(`Proyecto Supabase: ${SUPABASE_URL}`);
  console.log(`Cargado bundle: ${totalSalesRows} transacciones.`);
  console.log(`Clientes maestros: ${(bundle.masters.clientes || []).length}`);
  console.log(`Productos portfolio: ${(bundle.masters.portfolio || []).length}`);

  // 1. Preparar clientes (1,851)
  const customers = (bundle.masters.clientes || []).map(c => ({
    codigo: c.codigo,
    nombre: c.nombre || `Cliente #${c.codigo}`,
    canal: c.canal || 'General',
    subcanal: c.subcanal || '',
    supervisor: c.supervisor || '',
    rtv: c.rtv || '',
    anulado: c.anulado || 'NO',
    domicilio: c.domicilio || ''
  }));

  // 2. Preparar productos (1,675)
  const products = (bundle.masters.portfolio || []).map(p => ({
    codigo: p.codigo,
    producto: p.producto || `Producto #${p.codigo}`,
    unidad_negocio: p.unidadNegocio || 'GENERAL',
    division: p.division || 'GENERAL',
    marca: p.marca || 'MARCA GENERAL',
    calibre: p.calibre || 'ESTÁNDAR',
    sabor: p.sabor || 'REGULAR',
    familia: p.familia || 'REGULAR',
    en_maestro: Boolean(p.enMaestro),
    is_cza: Boolean(p.isCza),
    is_above_core: Boolean(p.isAboveCore),
    is_core_value: Boolean(p.isCoreValue),
    is_laton_710: Boolean(p.isLaton710),
    is_balanced_choice: Boolean(p.isBalancedChoice),
    is_top_ung: Boolean(p.isTopUNG),
    is_saborizada: Boolean(p.isSaborizada)
  }));

  // 3. Preparar canales (16)
  const channels = (bundle.dictionaries.canalesRaw || []).map(c => ({
    canal_mkt: c,
    canal_unificado: c,
    segmento_canal: 'GENERAL'
  }));

  // 4. Calcular métricas globales de ventas
  let totalHl = 0;
  let totalNeto = 0;
  const periodsSet = new Set();
  for (let i = 0; i < totalSalesRows; i++) {
    totalHl += bundle.salesColumnar.hl[i];
    totalNeto += bundle.salesColumnar.neto[i];
    periodsSet.add(bundle.dictionaries.periodos[bundle.salesColumnar.per[i]]);
  }
  const periodsList = Array.from(periodsSet).sort();
  const minPeriod = periodsList[0] || '2025/01';
  const maxPeriod = periodsList[periodsList.length - 1] || '2026/09';

  const tacoData = GalaxiaEngine.computeTableroVentasTaco(bundle);
  const galaxiaData = GalaxiaEngine.computeGalaxia2026Evaluation(bundle);

  const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_KEY);

  const summary = {
    tables: {},
    errors: []
  };

  try {
    // 1. Clientes
    console.log(`\n[1/7] Sembrando clientes (${customers.length} registros)...`);
    let custCount = 0;
    for (let i = 0; i < customers.length; i += 500) {
      const batch = customers.slice(i, i + 500);
      const { error } = await supabase.from('customers').upsert(batch, { onConflict: 'codigo' });
      if (error) {
        console.error(`  Error en lote clientes [${i}]:`, error.message);
        summary.errors.push(`customers [${i}]: ${error.message}`);
      } else {
        custCount += batch.length;
      }
    }
    summary.tables['customers'] = custCount;
    console.log(`  -> Clientes cargados: ${custCount}`);

    // 2. Productos
    console.log(`\n[2/7] Sembrando portfolio (${products.length} registros)...`);
    let prodCount = 0;
    for (let i = 0; i < products.length; i += 500) {
      const batch = products.slice(i, i + 500);
      const { error } = await supabase.from('products').upsert(batch, { onConflict: 'codigo' });
      if (error) {
        console.error(`  Error en lote productos [${i}]:`, error.message);
        summary.errors.push(`products [${i}]: ${error.message}`);
      } else {
        prodCount += batch.length;
      }
    }
    summary.tables['products'] = prodCount;
    console.log(`  -> Productos cargados: ${prodCount}`);

    // 3. Canales
    console.log(`\n[3/7] Sembrando canales (${channels.length} registros)...`);
    const { error: errChan } = await supabase.from('channel_mkt').upsert(channels, { onConflict: 'canal_mkt' });
    if (errChan) {
      console.error('  Error canales:', errChan.message);
      summary.errors.push(`channel_mkt: ${errChan.message}`);
      summary.tables['channel_mkt'] = 0;
    } else {
      summary.tables['channel_mkt'] = channels.length;
      console.log(`  -> Canales cargados: ${channels.length}`);
    }

    // 4. Tablero de Ventas & Galaxia State
    console.log('\n[4/7] Sembrando estado Tablero TACO & Galaxia 2026...');
    const { error: errTaco } = await supabase.from('tablero_ventas_state').upsert({
      period: maxPeriod,
      source_file: 'Tablero Ventas.xlsb',
      fecha_corte: tacoData.fechaCorte,
      mando_integral: tacoData.scores,
      mesa_julio: tacoData.comparativaMesas?.mesaJulio || {},
      mesa_gonza: tacoData.comparativaMesas?.mesaGonza || {},
      by_vendedor: tacoData.vendedoresMatrix || []
    }, { onConflict: 'period' });
    if (errTaco) summary.errors.push(`tablero_ventas_state: ${errTaco.message}`);
    summary.tables['tablero_ventas_state'] = errTaco ? 0 : 1;

    const { error: errGal } = await supabase.from('galaxia_state').upsert({
      period: maxPeriod,
      scorecard: galaxiaData.scorecard11000
    }, { onConflict: 'period' });
    if (errGal) summary.errors.push(`galaxia_state: ${errGal.message}`);
    summary.tables['galaxia_state'] = errGal ? 0 : 1;
    console.log('  -> Estados de Tablero y Galaxia cargados.');

    // 5. Ventas Mensuales (sales_monthly)
    console.log(`\n[5/7] Sembrando ventas mensuales (${totalSalesRows} filas en ${periodsList.length} períodos)...`);
    let salesInserted = 0;

    for (let pIdx = 0; pIdx < periodsList.length; pIdx++) {
      const per = periodsList[pIdx];
      const dictPerIdx = bundle.dictionaries.periodos.indexOf(per);
      const rows = [];
      for (let i = 0; i < totalSalesRows; i++) {
        if (bundle.salesColumnar.per[i] === dictPerIdx) {
          rows.push({
            period: per,
            cte: bundle.salesColumnar.cte[i],
            prod: bundle.salesColumnar.prod[i],
            canal: bundle.dictionaries.canalesRaw[bundle.salesColumnar.canal[i]],
            vend: bundle.salesColumnar.vend[i],
            sup: bundle.salesColumnar.sup[i],
            ccc: bundle.salesColumnar.ccc[i],
            bultos: bundle.salesColumnar.bultos[i],
            hl: bundle.salesColumnar.hl[i],
            neto: bundle.salesColumnar.neto[i],
            bonif: bundle.salesColumnar.bonif[i],
            source: bundle.salesColumnar.source[i]
          });
        }
      }

      // Insertar por lotes de 1000
      let periodSuccess = 0;
      for (let b = 0; b < rows.length; b += 1000) {
        const chunk = rows.slice(b, b + 1000);
        const { error: errChunk } = await supabase.from('sales_monthly').insert(chunk);
        if (errChunk) {
          console.error(`  Error en período ${per} lote [${b}]:`, errChunk.message);
          summary.errors.push(`sales_monthly ${per} [${b}]: ${errChunk.message}`);
          break;
        } else {
          periodSuccess += chunk.length;
        }
      }
      salesInserted += periodSuccess;
      console.log(`  [${pIdx + 1}/${periodsList.length}] Período ${per}: ${periodSuccess} filas insertadas.`);
    }
    summary.tables['sales_monthly'] = salesInserted;
    console.log(`  -> Ventas mensuales totales cargadas: ${salesInserted}`);

    // 6. Data Versions
    console.log('\n[6/7] Inicializando data_versions...');
    const { error: errVer } = await supabase.from('data_versions').upsert([
      { dataset: 'customers', version: 1, metadata: { count: custCount } },
      { dataset: 'products', version: 1, metadata: { count: prodCount } },
      { dataset: 'channel_mkt', version: 1, metadata: { count: channels.length } },
      { dataset: 'sales', version: 1, metadata: { count: salesInserted, totalHl: Math.round(totalHl * 100) / 100, minPeriod, maxPeriod } },
      { dataset: 'tablero', version: 1, metadata: { period: maxPeriod } },
      { dataset: 'galaxia', version: 1, metadata: { score: galaxiaData.scorecard11000.puntajeTotalObtenido } }
    ], { onConflict: 'dataset' });
    if (errVer) summary.errors.push(`data_versions: ${errVer.message}`);
    summary.tables['data_versions'] = errVer ? 0 : 6;
    console.log('  -> data_versions inicializado.');

    // 7. Ingestion Log
    console.log('\n[7/7] Registrando auditoría inicial en ingestion_log...');
    const { error: errLog } = await supabase.from('ingestion_log').insert({
      source_type: 'CARGA_INICIAL_SISTEMA',
      period: `${minPeriod} - ${maxPeriod}`,
      file_name: 'real_data_bundle.js',
      rows_count: totalSalesRows,
      deleted_rows: 0,
      inserted_rows: salesInserted,
      min_date: minPeriod,
      max_date: maxPeriod,
      status: 'EXITOSO',
      user_email: 'admin@luanbeer.com',
      diagnostic: {
        totalHl: Math.round(totalHl * 100) / 100,
        totalNeto: Math.round(totalNeto * 100) / 100,
        customersCount: custCount,
        productsCount: prodCount,
        periodsCount: periodsList.length
      }
    });
    if (errLog) summary.errors.push(`ingestion_log: ${errLog.message}`);
    summary.tables['ingestion_log'] = errLog ? 0 : 1;
    console.log('  -> ingestion_log registrado.');

    console.log('\n================================================================');
    console.log(' RESUMEN FINAL DE SIEMBRA');
    console.log('================================================================');
    console.table(summary.tables);
    if (summary.errors.length > 0) {
      console.log(`Avisos / Errores (${summary.errors.length}):`, summary.errors);
    } else {
      console.log('0 errores. Todos los registros fueron transferidos exitosamente.');
    }

    return { success: true, summary };
  } catch (err) {
    console.error('Excepción durante la siembra:', err);
    return { success: false, error: err.message };
  }
}

if (require.main === module) {
  runSeed().catch(err => {
    console.error('Error fatal en seed_supabase:', err);
    process.exit(1);
  });
}

module.exports = { runSeed };
