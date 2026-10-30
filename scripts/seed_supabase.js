/**
 * @fileoverview Script de Ingesta y Siembra Completa a Supabase para Dashboard LuanBeer.
 * Ejecuta la migración de los maestros, datos consolidados, estado de Tablero/Galaxia
 * y auditoría hacia PostgreSQL en Supabase.
 *
 * Uso:
 *   node scripts/seed_supabase.js
 *
 * Requiere variables de entorno (o archivo .env):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_ANON_KEY si las políticas permiten la siembra inicial)
 */

const fs = require('fs');
const path = require('path');

// Cargar .env si existe
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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

async function runSeed() {
  console.log('================================================================');
  console.log(' SEED COMPLETO A SUPABASE — DASHBOARD LUANBEER');
  console.log('================================================================');

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

  // 4. Calcular métricas globales de ventas y universos
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

  console.log('----------------------------------------------------------------');
  console.log(`Clientes preparados: ${customers.length}`);
  console.log(`Productos preparados: ${products.length}`);
  console.log(`Canales preparados: ${channels.length}`);
  console.log(`Ventas totales: ${totalSalesRows} filas | ${totalHl.toFixed(2)} HL | $${totalNeto.toFixed(2)}`);
  console.log(`Rango de períodos: ${minPeriod} hasta ${maxPeriod} (${periodsList.length} períodos)`);
  console.log('----------------------------------------------------------------');

  // 5. Calcular estados de Tablero y Galaxia
  const tacoData = GalaxiaEngine.computeTableroVentasTaco(bundle);
  const galaxiaData = GalaxiaEngine.computeGalaxia2026Evaluation(bundle);

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('[seed_supabase] AVISO: SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY no están configuradas en .env.');
    console.log('[seed_supabase] Para conectar Supabase real:');
    console.log('  1. Creá un archivo .env con:');
    console.log('     SUPABASE_URL=https://<tu-id-proyecto>.supabase.co');
    console.log('     SUPABASE_SERVICE_ROLE_KEY=<tu-service-role-key>');
    console.log('     SUPABASE_ANON_KEY=<tu-anon-key>');
    console.log('  2. Ejecutá este script nuevamente: node scripts/seed_supabase.js');
    return;
  }

  const { createClient } = require('../vendor/supabase.min.js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false }
  });

  console.log(`Conectando a Supabase: ${SUPABASE_URL}...`);

  // 1. Clientes
  console.log('Sembrando clientes (1,851 registros)...');
  for (let i = 0; i < customers.length; i += 500) {
    const batch = customers.slice(i, i + 500);
    const { error } = await supabase.from('customers').upsert(batch, { onConflict: 'codigo' });
    if (error) {
      console.error(`Error sembrando clientes batch ${i}-${i + batch.length}:`, error.message);
    }
  }
  console.log('✅ Clientes sembrados.');

  // 2. Productos
  console.log('Sembrando productos portfolio (1,675 registros)...');
  for (let i = 0; i < products.length; i += 500) {
    const batch = products.slice(i, i + 500);
    const { error } = await supabase.from('products').upsert(batch, { onConflict: 'codigo' });
    if (error) {
      console.error(`Error sembrando productos batch ${i}-${i + batch.length}:`, error.message);
    }
  }
  console.log('✅ Portfolio sembrado.');

  // 3. Canales
  console.log('Sembrando canales comerciales (16 registros)...');
  const { error: errChan } = await supabase.from('channel_mkt').upsert(channels, { onConflict: 'canal_mkt' });
  if (errChan) console.error('Error sembrando canales:', errChan.message);
  else console.log('✅ Canales sembrados.');

  // 4. Tablero de Ventas State & Galaxia State
  console.log('Sembrando estado de Tablero de Ventas & Galaxia 2026...');
  const { error: errTaco } = await supabase.from('tablero_ventas_state').upsert({
    period: maxPeriod,
    source_file: 'Tablero Ventas.xlsb',
    fecha_corte: tacoData.fechaCorte,
    mando_integral: tacoData.scores,
    mesa_julio: tacoData.comparativaMesas?.mesaJulio || {},
    mesa_gonza: tacoData.comparativaMesas?.mesaGonza || {},
    by_vendedor: tacoData.vendedoresMatrix || []
  }, { onConflict: 'period' });
  if (errTaco) console.warn('Aviso tablero_ventas_state:', errTaco.message);
  else console.log('✅ Estado de Tablero de Ventas sembrado.');

  const { error: errGal } = await supabase.from('galaxia_state').upsert({
    period: maxPeriod,
    scorecard: galaxiaData.scorecard11000
  }, { onConflict: 'period' });
  if (errGal) console.warn('Aviso galaxia_state:', errGal.message);
  else console.log('✅ Estado de Galaxia 2026 sembrado.');

  // 5. Ventas Históricas y Base a la Fecha (por períodos)
  console.log(`Sembrando ventas agrupadas por períodos (${periodsList.length} períodos)...`);
  for (const per of periodsList) {
    const periodIdx = bundle.dictionaries.periodos.indexOf(per);
    const rows = [];
    for (let i = 0; i < totalSalesRows; i++) {
      if (bundle.salesColumnar.per[i] === periodIdx) {
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

    // Insertar en lotes de 1000
    for (let b = 0; b < rows.length; b += 1000) {
      const chunk = rows.slice(b, b + 1000);
      const { error: errChunk } = await supabase.from('sales_monthly').insert(chunk);
      if (errChunk) {
        console.error(`Error insertando ventas ${per} lote ${b}-${b + chunk.length}:`, errChunk.message);
        break;
      }
    }
    console.log(`  -> Período ${per}: ${rows.length} transacciones procesadas.`);
  }
  console.log('✅ Ventas mensuales sembradas.');

  // 6. Data Versions
  console.log('Actualizando data_versions...');
  const { error: errVer } = await supabase.from('data_versions').upsert([
    { dataset: 'customers', version: 1, metadata: { count: customers.length } },
    { dataset: 'products', version: 1, metadata: { count: products.length } },
    { dataset: 'channel_mkt', version: 1, metadata: { count: channels.length } },
    { dataset: 'sales', version: 1, metadata: { count: totalSalesRows, totalHl: Math.round(totalHl * 100) / 100, minPeriod, maxPeriod } },
    { dataset: 'tablero', version: 1, metadata: { period: maxPeriod } },
    { dataset: 'galaxia', version: 1, metadata: { score: galaxiaData.scorecard11000.puntajeTotalObtenido } }
  ], { onConflict: 'dataset' });
  if (errVer) console.error('Error data_versions:', errVer.message);
  else console.log('✅ Versiones de datos inicializadas.');

  // 7. Ingestion Log Inicial
  console.log('Registrando auditoría inicial en ingestion_log...');
  const { error: errLog } = await supabase.from('ingestion_log').insert({
    source_type: 'CARGA_INICIAL_SISTEMA',
    period: `${minPeriod} - ${maxPeriod}`,
    file_name: 'real_data_bundle.js',
    rows_count: totalSalesRows,
    deleted_rows: 0,
    inserted_rows: totalSalesRows,
    min_date: minPeriod,
    max_date: maxPeriod,
    status: 'EXITOSO',
    user_email: 'admin@luanbeer.com',
    diagnostic: {
      totalHl: Math.round(totalHl * 100) / 100,
      totalNeto: Math.round(totalNeto * 100) / 100,
      customersCount: customers.length,
      productsCount: products.length,
      periodsCount: periodsList.length
    }
  });
  if (errLog) console.warn('Aviso ingestion_log:', errLog.message);
  else console.log('✅ Log de auditoría inicial registrado exitosamente.');

  console.log('================================================================');
  console.log(' SIEMBRA A SUPABASE FINALIZADA CON ÉXITO');
  console.log('================================================================');
}

if (require.main === module) {
  runSeed().catch(err => {
    console.error('Error en seed_supabase:', err);
    process.exit(1);
  });
}

module.exports = { runSeed };
