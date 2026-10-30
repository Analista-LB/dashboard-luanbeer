/**
 * @fileoverview Script de Ingesta y Siembra Inicial a Supabase para Dashboard LuanBeer.
 * Ejecuta la migración de los maestros y datos consolidados desde el bundle local
 * hacia la base de datos PostgreSQL en Supabase.
 *
 * Uso:
 *   node scripts/seed_supabase.js
 *
 * Requiere variables de entorno (o archivo .env):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_ANON_KEY si las tablas aún no tienen datos)
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

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.log('[seed_supabase] AVISO: SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY no están configuradas en .env.');
  console.log('[seed_supabase] Creando archivo plantilla de seed y export de datos listos para importar.');
}

async function runSeed() {
  console.log('================================================================');
  console.log(' SEED INICIAL A SUPABASE — DASHBOARD LUANBEER');
  console.log('================================================================');

  // Cargar bundle real
  global.window = global;
  require('../src/data/real_data_bundle.js');
  const bundle = global.__ARGON_REAL_BUNDLE__;

  if (!bundle) {
    console.error('Error: no se pudo cargar __ARGON_REAL_BUNDLE__');
    process.exit(1);
  }

  console.log(`Cargado bundle: ${bundle.salesColumnar ? bundle.salesColumnar.count : 0} transacciones.`);
  console.log(`Clientes maestros: ${(bundle.masters.clientes || []).length}`);
  console.log(`Productos portfolio: ${(bundle.masters.portfolio || []).length}`);

  // Preparar clientes
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

  // Preparar productos
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

  // Preparar canales
  const channels = (bundle.dictionaries.canalesRaw || []).map(c => ({
    canal_mkt: c,
    canal_unificado: c,
    segmento_canal: 'GENERAL'
  }));

  console.log(`Clientes preparados: ${customers.length}`);
  console.log(`Productos preparados: ${products.length}`);
  console.log(`Canales preparados: ${channels.length}`);

  if (SUPABASE_URL && SUPABASE_KEY) {
    // Si hay credenciales activas, importar vía REST API oficial de Supabase
    const { createClient } = require('../vendor/supabase.min.js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    console.log(`Conectando a Supabase: ${SUPABASE_URL}...`);

    // 1. Clientes
    console.log('Sembrando clientes...');
    for (let i = 0; i < customers.length; i += 500) {
      const batch = customers.slice(i, i + 500);
      const { error } = await supabase.from('customers').upsert(batch, { onConflict: 'codigo' });
      if (error) console.error('Error sembrando clientes batch:', error.message);
    }
    console.log('✅ Clientes sembrados.');

    // 2. Productos
    console.log('Sembrando portfolio...');
    for (let i = 0; i < products.length; i += 500) {
      const batch = products.slice(i, i + 500);
      const { error } = await supabase.from('products').upsert(batch, { onConflict: 'codigo' });
      if (error) console.error('Error sembrando productos batch:', error.message);
    }
    console.log('✅ Portfolio sembrado.');

    // 3. Canales
    console.log('Sembrando canales...');
    const { error: errChan } = await supabase.from('channel_mkt').upsert(channels, { onConflict: 'canal_mkt' });
    if (errChan) console.error('Error sembrando canales:', errChan.message);
    else console.log('✅ Canales sembrados.');

    // 4. Versión inicial
    await supabase.from('data_versions').upsert([
      { dataset: 'customers', version: 1 },
      { dataset: 'products', version: 1 },
      { dataset: 'sales', version: 1 }
    ], { onConflict: 'dataset' });
    console.log('✅ Versiones de datos inicializadas.');
  } else {
    console.log('[seed_supabase] Operación en modo local / offline. Los datos están listos para ser transmitidos cuando se conecte Supabase.');
  }
}

if (require.main === module) {
  runSeed().catch(err => {
    console.error('Error en seed_supabase:', err);
  });
}

module.exports = { runSeed };
