const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');

const outDir = path.resolve(__dirname, '..', 'test_data', 'sinteticos_controlados');
fs.mkdirSync(outDir, { recursive: true });

function saveWorkbook(fileName, sheetsObj) {
  const wb = XLSX.utils.book_new();
  for (const [sName, rows] of Object.entries(sheetsObj)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sName);
  }
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  fs.writeFileSync(path.join(outDir, fileName), buf);
}

// 1. Ventas_2025.xlsx (Header on Row 2 after decorative title, includes Litros that must convert to HL = L/100, and a TOTAL GENERAL row at bottom that must be ignored!)
saveWorkbook('Ventas_2025.xlsx', {
  'Ventas_2025': [
    ['REPORTE OFICIAL DE VENTAS 2025 - DISTRIBUIDORA'],
    [],
    ['Periodo', 'Cod_Cliente', 'ID_Producto', 'Canal Comercial', 'Litros', 'Venta Neta', 'Operaciones'],
    ['2025/01', 101, 501, 'Tradicional', 10000, 1500000, 12], // 100 HL
    ['2025/01', 102, 502, 'Supermercados', 20000, 2800000, 8], // 200 HL
    ['2025/02', 101, 503, 'Tradicional', 15000, 2250000, 10], // 150 HL (Client 101 repeats in Feb and across UN!)
    ['2025/03', 103, 501, 'Kioscos', 5000, 800000, 5],        // 50 HL
    ['2025/03', 103, 501, 'Kioscos', 5000, 800000, 5],        // INTENTIONAL DUPLICATE ROW! Should be detected & deduplicated
    ['TOTAL GENERAL', null, null, null, 55000, 8150000, 40]   // SUBTOTAL/TOTAL ROW! Must be excluded from detail sum
  ]
});

// 2. Ventas_2026.xlsx (Different column names: Año/Mes, Cliente_ID, Cod_Prod, Canal, Hectolitros [already HL!], Facturacion, Cant_Op)
saveWorkbook('Ventas_2026.xlsx', {
  'Detalle_2026': [
    ['Año/Mes', 'Cliente_ID', 'Cod_Prod', 'Canal', 'Hectolitros', 'Facturacion', 'Cant_Op'],
    ['2026/01', 101, 501, 'Tradicional', 120, 2100000, 14],
    ['2026/01', 102, 502, 'Supermercados', 160, 2600000, 9],
    ['2026/02', 104, 503, 'Tradicional', 180, 2900000, 15],
    ['2026/03', 999, 501, 'Kioscos', 40, 700000, 4] // Client 999 is an orphan key not in Maestro_Clientes!
  ],
  'Resumen_Anual_No_Sumar': [
    ['Año', 'Total_HL', 'Total_Facturacion'],
    [2026, 500, 8300000]
  ]
});

// 3. Maestro_Clientes.xlsx
saveWorkbook('Maestro_Clientes.xlsx', {
  'Clientes': [
    ['Cod_Cliente', 'Razon_Social', 'Canal_Asignado', 'Ciudad'],
    [101, 'ALMACEN DON PEDRO', 'Tradicional', 'San Luis'],
    [102, 'SUPERMERCADO CENTRAL SA', 'Supermercados', 'San Luis'],
    [103, 'MAXIKIOSCO EL SOL', 'Kioscos', 'Villa Mercedes'],
    [104, 'AUTOSERVICIO LA ESQUINA', 'Tradicional', 'Juana Koslay']
  ]
});

// 4. Maestro_Productos.xlsx
saveWorkbook('Maestro_Productos.xlsx', {
  'Catalogo_Productos': [
    ['ID_Producto', 'Descripcion_Producto', 'Cod_UN', 'Marca', 'Calibre'],
    [501, 'CERVEZA RUBIA 1000CC', 'UN_CZA', 'QUILMES', '1000CC'],
    [502, 'CERVEZA PREMIUM 473CC', 'UN_CZA', 'STELLA ARTOIS', '473CC'],
    [503, 'AGUA MINERAL SIN GAS 1500CC', 'UN_AGU', 'ECO DE LOS ANDES', '1500CC']
  ]
});

// 5. Canales_Comerciales.csv
const csvContent = [
  'Canal_Comercial,Canal_Unificado,Segmento_Estrategico',
  'Tradicional,Tradicional,K+T',
  'Supermercados,Supermercados,SMK',
  'Kioscos,Tradicional,K+T'
].join('\n');
fs.writeFileSync(path.join(outDir, 'Canales_Comerciales.csv'), csvContent, 'utf8');

// 6. Unidades_Negocio.xlsx
saveWorkbook('Unidades_Negocio.xlsx', {
  'Unidades': [
    ['Cod_UN', 'Nombre_Unidad_Negocio', 'Gerente_UN'],
    ['UN_CZA', 'CERVEZAS', 'Juan Perez'],
    ['UN_AGU', 'AGUAS', 'Maria Gomez'],
    ['UN_UNG', 'GASEOSAS Y UNG', 'Carlos Ruiz']
  ]
});

// 7. Objetivos_2026.xlsx
saveWorkbook('Objetivos_2026.xlsx', {
  'Metas_2026': [
    ['Año/Mes', 'Canal', 'Cod_UN', 'Objetivo_HL'],
    ['2026/01', 'Tradicional', 'UN_CZA', 130],
    ['2026/01', 'Supermercados', 'UN_CZA', 180],
    ['2026/02', 'Tradicional', 'UN_AGU', 170],
    ['2026/03', 'Kioscos', 'UN_CZA', 50]
  ]
});

// 8. Operaciones_Comerciales.xlsx
saveWorkbook('Operaciones_Comerciales.xlsx', {
  'Visitas_Rutas': [
    ['Año/Mes', 'Cod_Cliente', 'Visitas_Programadas', 'Visitas_Efectivas'],
    ['2026/01', 101, 8, 6],
    ['2026/01', 102, 4, 4],
    ['2026/02', 104, 8, 5],
    ['2026/03', 103, 4, 2]
  ]
});

// 9. CCC_Historico.xlsx (Aggregated CCC table - must NOT be deduplicated with invented IDs!)
saveWorkbook('CCC_Historico.xlsx', {
  'CCC_Agregado': [
    ['Año/Mes', 'Canal', 'CCC_Reportado'],
    ['2025/01', 'Tradicional', 450],
    ['2025/01', 'Supermercados', 85],
    ['2025/02', 'Tradicional', 460]
  ]
});

// 10. Datos_Inconsistentes.xlsx (Missing values, ambiguous columns, negative outliers)
saveWorkbook('Datos_Inconsistentes.xlsx', {
  'Hoja_Con_Advertencias': [
    ['Periodo', 'Codigo', 'Codigo_Alt', 'Importe_Dudoso', 'Notas'],
    ['2026/01', 101, 501, null, 'Falta importe'],
    ['2026/02', null, 502, 12500, 'Falta clave primaria'],
    ['SUBTOTAL', null, null, 12500, 'Fila de subtotal']
  ]
});

// Also create a corrupt file for negative testing
fs.writeFileSync(path.join(outDir, 'Archivo_Corrupto.xlsx'), Buffer.from('NOT_A_VALID_ZIP_OR_XLSX_HEADER_1234567890'));

// Ground truth reference for synthetic dataset
const syntheticRef = {
  description: 'Resultados matemáticos de referencia para el conjunto de 10 archivos sintéticos controlados',
  ventas2025_YTD_Q1: {
    rawRows: 6,
    excludedTotalRows: 1,
    excludedDuplicateRows: 1,
    validDetailRows: 4,
    litrosTotal: 50000,
    hlTotalConverted: 500, // 50000 / 100
    facturacionNeta: 7350000,
    operaciones: 35,
    cccUnicoConsolidado: 3 // Clients 101, 102, 103 (101 bought in Jan and Feb, counted once in Q1/YTD!)
  },
  ventas2026_YTD_Q1: {
    validDetailRows: 4,
    hlTotal: 500, // 120 + 160 + 180 + 40 (already in HL, not divided by 100!)
    facturacionNeta: 8300000,
    operaciones: 42,
    cccUnicoConsolidado: 4, // Clients 101, 102, 104, 999
    orphanClientKeys: [999]
  },
  variacionInteranual: {
    hlDiff: 0,
    hlVarPct: 0,
    facturacionDiff: 950000,
    facturacionVarPct: 12.93,
    cccDiff: 1,
    cccVarPct: 33.33
  }
};

fs.writeFileSync(path.join(outDir, 'referencia_sinteticos.json'), JSON.stringify(syntheticRef, null, 2));
console.log('Generated 10 controlled synthetic files + Archivo_Corrupto.xlsx + referencia_sinteticos.json in test_data/sinteticos_controlados/');
