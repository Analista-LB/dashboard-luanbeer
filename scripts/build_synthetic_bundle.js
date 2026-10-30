const fs = require('fs');
const path = require('path');
const IngestionEngine = require('../src/modules/ingestionEngine.js');
const RelationshipEngine = require('../src/modules/relationshipEngine.js');

const synthDir = path.resolve(__dirname, '..', 'test_data', 'sinteticos_controlados');
const orderedFiles = [
  'Ventas_2025.xlsx',
  'Ventas_2026.xlsx',
  'Maestro_Clientes.xlsx',
  'Maestro_Productos.xlsx',
  'Canales_Comerciales.csv',
  'Unidades_Negocio.xlsx',
  'Objetivos_2026.xlsx',
  'Operaciones_Comerciales.xlsx',
  'CCC_Historico.xlsx',
  'Datos_Inconsistentes.xlsx'
];

const entries = orderedFiles.map(name => {
  const full = path.join(synthDir, name);
  const buf = fs.readFileSync(full);
  return {
    name,
    size: buf.length,
    buffer: name.endsWith('.csv') ? buf.toString('utf8') : new Uint8Array(buf)
  };
});

const batchResult = IngestionEngine.validateBatch(entries);
const relResult = RelationshipEngine.detectRelationshipsAcrossSheets(batchResult.files);

const payload = {
  batchResult,
  relResult
};

const outPath = path.resolve(__dirname, '..', 'src', 'data', 'synthetic_test_bundle.js');
fs.writeFileSync(outPath, `window.__ARGON_SYNTHETIC_BATCH__ = ${JSON.stringify(payload)};\n`);
console.log('Saved src/data/synthetic_test_bundle.js with 10 inspected synthetic files and', relResult.relationships.length, 'detected relationships.');
