function fmt(n, dec = 2) {
  if (n === null || n === undefined || isNaN(Number(n))) return 'N/A';
  return Number(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function formatSingleDataSourceName(str) {
  if (!str || typeof str !== 'string') return '';
  let s = str.trim();
  // Strip paths (e.g. 1. Bases/, bases/, C:\...)
  s = s.replace(/^.*[\\\/]/, '');
  // Strip prefixes like (Actualizar), (Fijo), (SemiFijo), (Semifijo)
  s = s.replace(/^\s*\((?:actualizar|fijo|semifijo)\)\s*/i, '');
  // Strip extensions (.xlsx, .xlsm, .xlsb, .xls, .csv, .pdf, .tsv, .txt)
  s = s.replace(/\.(xlsx|xlsm|xlsb|xls|csv|pdf|tsv|txt)\b/gi, '');
  // Clean double dots
  s = s.replace(/\.{2,}/g, '.');
  // Clean underscores into spaces
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
  
  // Missed target: diff < 0
  const missing = Math.abs(diff);
  const formattedMissing = `${prefix}${fmt(missing, dec)}${suffix}`;
  const badgeColor = semaforoColor === 'warning' ? 'warning' : 'danger';
  const label = `Faltan ${formattedMissing}`;
  return `<span class="semaforo-badge ${badgeColor}">${label}</span>`;
}

console.log('--- FORMAT DATA SOURCE NAME TESTS ---');
const testCases = [
  '(Actualizar) Base a la fecha.xlsm',
  '(Fijo) Productos.xlsx',
  '(SemiFijo) Objetivos.xlsx',
  '(Actualizar) Base de Clientes.xlsx',
  '1. Bases/Tablero Ventas.xlsb',
  '1. Bases/Tablero Ventas.xlsb (Mando Integral, Mesa Julio, Mesa Gonza)',
  '(Actualizar) Base Prod. y Vol..xlsx / (Actualizar) Base a la fecha.xlsx',
  '(Actualizar) Base Prod. y Vol..xlsx + (Fijo) Canal MKT.xlsx',
  '(Fijo) Medida Tiempo.xlsx vs (Actualizar) Base Prod. y Vol..xlsx',
  '1. Bases/Manual Distribuidores 2026.pdf (Capitulos 1 al 10)',
  '1. Bases/(Actualizar) Base Obj..xlsx',
  '1. Bases/(Fijo) Subcanales_Mkt.xlsx'
];

testCases.forEach(tc => {
  console.log(`${tc}  =>  "${formatDataSourceName(tc)}"`);
});

console.log('\n--- TACO ESTADO BADGE TESTS ---');
console.log('Exceeded (+96):', renderTacoEstadoBadge(6272, 6176, 'success'));
console.log('Exact (Objetivo alcanzado):', renderTacoEstadoBadge(1038, 1038, 'success'));
console.log('Warning (Faltan 2):', renderTacoEstadoBadge(797, 799, 'warning'));
console.log('Danger (Faltan 1.524):', renderTacoEstadoBadge(2476, 4000, 'danger'));
console.log('Danger HL (Faltan 2.828,6 HL):', renderTacoEstadoBadge(1761.4, 4590, 'danger', { suffix: ' HL', dec: 1 }));
console.log('Danger Money (Faltan $ 19.044.100):', renderTacoEstadoBadge(28914756, 47958856, 'danger', { prefix: '$ ', dec: 0 }));
