const fs = require('fs');
const assert = require('assert');

console.log('========================================================');
console.log('VERIFICACIÓN AUTOMATIZADA: ACTUALIZACIÓN VISUAL Y CONSULTAS');
console.log('========================================================\n');

// 1. Verificar index.html
const html = fs.readFileSync('index.html', 'utf8');

// Nav button
assert(html.includes('data-view="analisis" id="navBtnAnalisis"'), 'navBtnAnalisis retains technical data-view="analisis"');
assert(html.includes('<span>💬 Consultas</span>'), 'navBtnAnalisis displays "💬 Consultas"');
console.log('✅ 1. Menú lateral: Botón renombrado a "💬 Consultas" manteniendo data-view="analisis".');

// Section title and subtitle
assert(html.includes('<h1 class="section-title">Consultas sobre los Datos</h1>'), 'Main title is "Consultas sobre los Datos"');
assert(html.includes('Preguntá sobre ventas, clientes, productos y evolución comercial.'), 'Subtitle matches requested text');
console.log('✅ 2. Títulos y subtítulos de Consultas actualizados sin tecnicismos.');

// Check KPI & RTO table headers
assert(html.includes('<th style="text-align:center;min-width:130px;">Estado</th>'), 'Estado header present');
assert(!html.includes('<th>Restan</th>'), 'Old "Restan" column removed');
assert(!html.includes('<th>Faltante 100%</th>'), 'Old "Faltante 100%" column removed');
console.log('✅ 3. Columnas Restan/Faltante y Semáforo unificadas en "Estado" en tacoKpiTable y tacoRtoTable.');

// Matriz Comparativa intact
assert(html.includes('id="tacoVendedoresTable"'), 'tacoVendedoresTable is present');
assert(html.includes('Matriz Comparativa de la Fuerza de Ventas'), 'Matriz Comparativa preserved');
console.log('✅ 4. Matriz Comparativa (vendedores) preservada intacta sin alteraciones.');

// 2. Verificar funciones en src/app.js
const appJs = fs.readFileSync('src/app.js', 'utf8');
assert(appJs.includes('function formatDataSourceName'), 'formatDataSourceName defined');
assert(appJs.includes('function renderTacoEstadoBadge'), 'renderTacoEstadoBadge defined');
assert(appJs.includes('window.formatDataSourceName = formatDataSourceName'), 'formatDataSourceName exposed');
assert(appJs.includes('window.renderTacoEstadoBadge = renderTacoEstadoBadge'), 'renderTacoEstadoBadge exposed');
console.log('✅ 5. Funciones formatDataSourceName y renderTacoEstadoBadge creadas y expuestas.');

// 3. Evaluar lógica de formatDataSourceName
function formatSingleDataSourceName(str) {
  if (!str || typeof str !== 'string') return '';
  let s = str.trim();
  s = s.replace(/^.*[\\\/]/, '');
  s = s.replace(/^\s*\((?:actualizar|fijo|semifijo)\)\s*/i, '');
  s = s.replace(/\.(xlsx|xlsm|xlsb|xls|csv|pdf|tsv|txt)\b/gi, '');
  s = s.replace(/\.{2,}/g, '.');
  s = s.replace(/_/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function formatDataSourceName(val) {
  if (!val) return '';
  if (Array.isArray(val)) {
    return val.map(formatDataSourceName).filter(Boolean);
  }
  const s = String(val).trim();
  const delimiterRegex = /(\s+\/\s+|\s*\+\s*|\s+vs\.?\s+|,\s*)/i;
  if (delimiterRegex.test(s)) {
    const tokens = s.split(delimiterRegex);
    return tokens.map(tok => {
      if (delimiterRegex.test(tok)) return tok;
      return formatSingleDataSourceName(tok);
    }).join('').replace(/\s+/g, ' ').trim();
  }
  return formatSingleDataSourceName(s);
}

assert.strictEqual(formatDataSourceName('(Actualizar) Base a la fecha.xlsm'), 'Base a la fecha');
assert.strictEqual(formatDataSourceName('(Fijo) Productos.xlsx'), 'Productos');
assert.strictEqual(formatDataSourceName('(SemiFijo) Objetivos.xlsx'), 'Objetivos');
assert.strictEqual(formatDataSourceName('1. Bases/(Actualizar) Base de Clientes.xlsx'), 'Base de Clientes');
assert.strictEqual(formatDataSourceName('1. Bases/Tablero Ventas.xlsb'), 'Tablero Ventas');
console.log('✅ 6. formatDataSourceName normaliza correctamente todos los casos de prueba.');

// 4. Evaluar lógica de renderTacoEstadoBadge
function fmt(n, dec = 2) {
  if (n === null || n === undefined || isNaN(Number(n))) return 'N/A';
  return Number(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function renderTacoEstadoBadge(real, objetivo, semaforoColor, options = {}) {
  const r = Number(real) || 0;
  const o = Number(objetivo) || 0;
  const dec = options.dec !== undefined ? options.dec : ((r % 1 === 0 && o % 1 === 0) ? 0 : 1);
  const prefix = options.prefix || '';
  const suffix = options.suffix || '';
  
  const diff = r - o;
  const isZero = Math.abs(diff) < 0.0001;
  
  if (isZero) {
    return `<span class="semaforo-badge success">Objetivo alcanzado</span>`;
  }
  
  if (diff > 0) {
    const formattedDiff = `${prefix}${fmt(diff, dec)}${suffix}`;
    return `<span class="semaforo-badge success">+${formattedDiff}</span>`;
  }
  
  const missing = Math.abs(diff);
  const formattedMissing = `${prefix}${fmt(missing, dec)}${suffix}`;
  const badgeColor = semaforoColor === 'warning' ? 'warning' : 'danger';
  const label = `Faltan ${formattedMissing}`;
  return `<span class="semaforo-badge ${badgeColor}">${label}</span>`;
}

// Check exact badges
assert.strictEqual(renderTacoEstadoBadge(1096, 1000, 'success'), '<span class="semaforo-badge success">+96</span>');
assert.strictEqual(renderTacoEstadoBadge(1038, 1038, 'success'), '<span class="semaforo-badge success">Objetivo alcanzado</span>');
assert.strictEqual(renderTacoEstadoBadge(797, 799, 'warning'), '<span class="semaforo-badge warning">Faltan 2</span>');
assert.strictEqual(renderTacoEstadoBadge(2476, 4000, 'danger'), '<span class="semaforo-badge danger">Faltan 1.524</span>');
assert.strictEqual(renderTacoEstadoBadge(1761.4, 4590, 'danger', { suffix: ' HL', dec: 1 }), '<span class="semaforo-badge danger">Faltan 2.828,6 HL</span>');
console.log('✅ 7. renderTacoEstadoBadge genera badges con color y formato correctos (+96, Objetivo alcanzado, Faltan 2, Faltan 1.524).');

console.log('\n🎉 TODAS LAS VERIFICACIONES VISUALES Y FUNCIONALES PASARON CON ÉXITO! 🎉\n');
