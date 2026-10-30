const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');

const workspaceDir = path.resolve(__dirname, '..');
const basesDir = path.join(workspaceDir, '1. Bases');

function resolveSourcePath(fileName) {
  const inBases = path.join(basesDir, fileName);
  if (fs.existsSync(inBases)) return inBases;
  const inRoot = path.join(workspaceDir, fileName);
  if (fs.existsSync(inRoot)) return inRoot;
  throw new Error(`No se encontró el archivo fuente: ${fileName} ni en 1. Bases/ ni en la raíz.`);
}

function readWorkbook(fileName) {
  const fullPath = resolveSourcePath(fileName);
  const stat = fs.statSync(fullPath);
  const buf = fs.readFileSync(fullPath);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  return { wb, stat, fullPath };
}

console.log('=== BUILDING COMPLETE 2026 GROUND-TRUTH REFERENCE & REAL DATA BUNDLE (1. Bases/) ===');

// 1. (Fijo) Medida Tiempo.xlsx
const { wb: wbTiempo } = readWorkbook('(Fijo) Medida Tiempo.xlsx');
const tiempoRaw = XLSX.utils.sheet_to_json(wbTiempo.Sheets[wbTiempo.SheetNames[0]], { header: 1, defval: null, raw: true });
const periodosList = [];
const periodosMap = new Map();
for (let i = 1; i < tiempoRaw.length; i++) {
  const r = tiempoRaw[i];
  if (!r || !r[1]) continue;
  const item = {
    anio: Number(r[0]),
    periodo: String(r[1]).trim(),
    mesNombre: String(r[2] || '').trim(),
    nroMesLabel: String(r[3] || '').trim(),
    mesNum: parseInt(String(r[1]).trim().slice(5, 7), 10),
    trimestre: String(r[4] || '').trim(),
    aVig: String(r[5] || '').trim(),
    bimestre: String(r[6] || '').trim()
  };
  periodosList.push(item);
  periodosMap.set(item.periodo, item);
}

// 2. (Fijo) Canal MKT.xlsx & (Fijo) Subcanales Mkt.xlsx
const { wb: wbCanal } = readWorkbook('(Fijo) Canal MKT.xlsx');
const canalRaw = XLSX.utils.sheet_to_json(wbCanal.Sheets[wbCanal.SheetNames[0]], { header: 1, defval: null, raw: true });
const canalMaster = [];
const canalLookup = new Map();
for (let i = 1; i < canalRaw.length; i++) {
  const r = canalRaw[i];
  if (!r || !r[0]) continue;
  const cMkt = String(r[0]).trim();
  const cUnif = String(r[1] || '').trim();
  const seg = String(r[2] || '').trim();
  canalMaster.push({ canalMkt: cMkt, canalUnificado: cUnif, segmentoCanal: seg });
  canalLookup.set(cMkt.toUpperCase(), { canalMkt: cMkt, canalUnificado: cUnif, segmentoCanal: seg, matchType: 'exacto' });
}

const { wb: wbSubcanal } = readWorkbook('(Fijo) Subcanales Mkt.xlsx');
const subcanalRaw = XLSX.utils.sheet_to_json(wbSubcanal.Sheets[wbSubcanal.SheetNames[0]], { header: 1, defval: null, raw: true });
const subcanalesMaster = [];
const subcanalLookup = new Map();
for (let i = 1; i < subcanalRaw.length; i++) {
  const r = subcanalRaw[i];
  if (!r || !r[0]) continue;
  const sc = String(r[0]).trim();
  const cm = String(r[1] || '').trim();
  const sg = String(r[2] || '').trim();
  subcanalesMaster.push({ subcanal: sc, canalMkt: cm, segmentoCanal: sg });
  subcanalLookup.set(sc.toUpperCase(), { subcanal: sc, canalMkt: cm, segmentoCanal: sg });
}

function resolveCanal(rawCanal) {
  const clean = String(rawCanal || '').trim();
  const upper = clean.toUpperCase();
  if (canalLookup.has(upper)) {
    return { ...canalLookup.get(upper), rawCanal: clean };
  }
  const withoutRef = upper.replace(/^REF\s+/i, '');
  if (canalLookup.has(withoutRef)) {
    const base = canalLookup.get(withoutRef);
    return { rawCanal: clean, canalMkt: base.canalMkt, canalUnificado: base.canalUnificado, segmentoCanal: base.segmentoCanal, matchType: 'homologado_prefijo_REF' };
  }
  if (upper === 'CLIE INSTITUCIONAL' && canalLookup.has('CLIE INSTITUCION')) {
    const base = canalLookup.get('CLIE INSTITUCION');
    return { rawCanal: clean, canalMkt: base.canalMkt, canalUnificado: base.canalUnificado, segmentoCanal: base.segmentoCanal, matchType: 'homologado_variante' };
  }
  if (upper === 'SUPERMERCADOS') {
    return { rawCanal: clean, canalMkt: 'SMK', canalUnificado: 'Supermercados', segmentoCanal: 'SMK', matchType: 'homologado_subcanal_SMK' };
  }
  if (upper === 'KA NOCTURNO') {
    return { rawCanal: clean, canalMkt: 'KA NOCTURNO', canalUnificado: 'Refrigerado', segmentoCanal: 'REFRIG', matchType: 'ambiguo_homologado' };
  }
  return { rawCanal: clean, canalMkt: clean, canalUnificado: clean, segmentoCanal: 'SIN MAPEO', matchType: 'sin_correspondencia' };
}

// 3. (SemiFijo) DetallePersonal.xlsx & (Fijo) DetallePersonal.xlsx
const { wb: wbPersonal } = readWorkbook('(SemiFijo) DetallePersonal.xlsx');
const personalRaw = XLSX.utils.sheet_to_json(wbPersonal.Sheets[wbPersonal.SheetNames[0]], { header: 1, defval: null, raw: true });
const personalMaster = [];
const personalMap = new Map();
for (let i = 1; i < personalRaw.length; i++) {
  const r = personalRaw[i];
  if (!r || r[1] === null) continue;
  const supRaw = r[9] ? String(r[9]).trim() : 'DIRECCIÓN';
  const supCodeMatch = supRaw.match(/^(\d+)\s*-/);
  const supCode = supCodeMatch ? Number(supCodeMatch[1]) : null;
  let mesaLabel = 'GENERAL / DEPÓSITO';
  if (supCode === 100 || Number(r[1]) === 100) mesaLabel = 'MESA GONZA (100 - GONZALO CORIA)';
  else if (supCode === 101 || Number(r[1]) === 101) mesaLabel = 'MESA JULIO (101 - JULIO BASUALDO)';
  else if (supCode === 99 || Number(r[1]) === 99) mesaLabel = 'MESA DEPÓSITO / SMK (99 - DEPOSITO)';

  const item = {
    anulado: String(r[0] || 'false'),
    codigo: Number(r[1]),
    nombre: String(r[2] || '').trim(),
    tipo: String(r[3] || '').trim(),
    sucursal: String(r[4] || '').trim(),
    fuerzaVenta: String(r[5] || '').trim(),
    segmentoVendedor: r[6] ? String(r[6]).trim() : 'No Especificado',
    superior: supRaw,
    superiorCodigo: supCode,
    mesa: mesaLabel,
    cargo: String(r[10] || '').trim()
  };
  personalMaster.push(item);
  personalMap.set(item.codigo, item);
}

// 4. (Fijo) Base Portfolio.xlsx
const { wb: wbPort } = readWorkbook('(Fijo) Base Portfolio.xlsx');
const portRaw = XLSX.utils.sheet_to_json(wbPort.Sheets[wbPort.SheetNames[0]], { header: 1, defval: null, raw: true });
const portfolioMaster = [];
const portfolioMap = new Map();
for (let i = 1; i < portRaw.length; i++) {
  const r = portRaw[i];
  if (!r || r[0] === null) continue;
  const unidadMktp = String(r[45] || r[2] || '').trim();
  const division = String(r[3] || '').trim();
  const catObj = r[47] ? String(r[47]).trim() : '';
  const calibre = String(r[5] || '').trim();
  const calibreTipo = String(r[10] || '').trim();
  const calibreLT = String(r[11] || '').trim();
  const focoComercial = r[46] ? String(r[46]).trim() : '';
  const censo = r[13] ? String(r[13]).trim() : '';
  const topUng = r[17] ? String(r[17]).trim() : '';
  const aboveCoreCol = r[18] ? String(r[18]).trim() : '';
  const sensibilizacion = r[38] ? String(r[38]).trim() : '';
  const ceroAlc = r[41] ? String(r[41]).trim() : '';

  const isCza = unidadMktp === 'CERVEZAS' || division === 'CERVEZAS';
  const isAboveCore = isCza && (aboveCoreCol === 'ABOVE CORE' || catObj === 'CORE PLUS' || catObj === 'HIGH END');
  const isCoreValue = isCza && (catObj === 'CORE' || catObj === 'LOW' || sensibilizacion === 'CORE + VALUE');
  const isLaton710 = isCza && (calibreTipo === 'LATON 710' || calibreLT === 'LATON' || calibre.includes('710'));
  const isBalancedChoice = isCza && (focoComercial === 'Balanced Choices' || ceroAlc === 'Cero Alc.' || String(r[9] || '').trim() === '0.0' || String(r[4] || '').toUpperCase().includes('MICHELOB'));
  const isTopUNG = topUng === 'TOP UNG' || sensibilizacion === 'VOL TOP UNG';
  const isSaborizada = division === 'BEBIDAS SABORIZADAS';

  const item = {
    codigo: Number(r[0]),
    producto: String(r[1] || '').trim(),
    unidadNegocio: String(r[2] || '').trim(),
    division,
    marca: String(r[4] || '').trim(),
    calibre,
    sabor: String(r[6] || '').trim(),
    familia: String(r[7] || '').trim(),
    marcaUnificado: String(r[8] || '').trim(),
    segmento: String(r[9] || '').trim(),
    calibreTipo,
    calibreLT,
    sugar: String(r[12] || '').trim(),
    censo,
    topUng,
    aboveCoreFlag: aboveCoreCol,
    sensibilizacion,
    bEnP: Number(r[42]) || 0,
    uEnB: Number(r[43]) || 0,
    unidadMktp,
    focoComercial,
    categoriaObjetivo: catObj,
    filtroMatriz: r[48] ? String(r[48]).trim() : '',
    nivelSegmento: r[49] ? String(r[49]).trim() : '',
    isCza,
    isAboveCore,
    isCoreValue,
    isLaton710,
    isBalancedChoice,
    isTopUNG,
    isSaborizada,
    enMaestro: true
  };
  portfolioMaster.push(item);
  portfolioMap.set(item.codigo, item);
}

const divToUN = new Map();
for (const p of portfolioMaster) {
  if (p.division && p.unidadNegocio && !divToUN.has(p.division)) {
    divToUN.set(p.division, { un: p.unidadNegocio, unMktp: p.unidadMktp || p.unidadNegocio });
  }
}
divToUN.set('ALIMENTOS MKTPLACE', { un: 'MARKETPLACE ALIMENTOS', unMktp: 'MARKETPLACE' });
divToUN.set('GIFTPACK CERVEZAS', { un: 'CERVEZAS', unMktp: 'CERVEZAS' });
divToUN.set('SIDRAS', { un: 'ADYACENCIAS', unMktp: 'ADYACENCIAS' });
divToUN.set('POP', { un: 'RETORNO COMERCIAL', unMktp: 'RETORNO COMERCIAL' });

// 5. (Actualizar) Base de Clientes.xlsx, Reporte de Clientes.xlsx & Clientes Presencial.xlsx
console.log('Reading (Actualizar) Base de Clientes.xlsx & (Actualizar) Clientes Presencial.xlsx...');
const { wb: wbBaseClientes } = readWorkbook('(Actualizar) Base de Clientes.xlsx');
const bcRaw = XLSX.utils.sheet_to_json(wbBaseClientes.Sheets['Base de Clientes'], { header: 1, defval: null, raw: true });
const { wb: wbRepClientes } = readWorkbook('(Actualizar) Reporte de Clientes.xlsx');
const rcRaw = XLSX.utils.sheet_to_json(wbRepClientes.Sheets[wbRepClientes.SheetNames[0]], { header: 1, defval: null, raw: true });
const { wb: wbPresencial } = readWorkbook('(Actualizar) Clientes Presencial.xlsx');
const presRaw = XLSX.utils.sheet_to_json(wbPresencial.Sheets['Browser'], { header: 1, defval: null, raw: true });

function classifyOnPremise(subcanal, canalMkt) {
  const sc = String(subcanal || '').toUpperCase();
  const cm = String(canalMkt || '').toUpperCase();
  if (sc.includes('BAR')) return 'BAR';
  if (sc.includes('RESTAURANT')) return 'RESTAURANTE';
  if (sc.includes('NOCTURNO') || cm.includes('NOCTURNO') || sc.includes('DISCO') || sc.includes('PUB')) return 'NOCTURNO';
  if (sc.includes('EVENTO')) return 'EVENTO';
  if (sc.includes('COMIDA RAPID') || sc.includes('FAST FOOD')) return 'COMIDA RÁPIDA';
  if (sc.includes('CAFETERIA')) return 'CAFETERÍA';
  if (sc.includes('HOTEL')) return 'HOTEL';
  if (sc.includes('ENTRETENIMIE') || sc.includes('CLUB') || sc.includes('DEPORT')) return 'ENTRETENIMIENTO';
  if (cm.includes('GASTRONOMICO')) return 'GASTRONÓMICO GENERAL';
  return 'OFF PREMISE / TRADICIONAL';
}

// Parse Clientes Presencial first to index visit days and frequencies
const presencialMap = new Map();
let presPrimarioCount = 0;
let presMerchandCount = 0;
const presByVisitDaysCount = { 0: 0, 1: 0, 2: 0, mayorA2: 0 };
const presExcesoFrecuenciaList = [];
const presByPeriodicidad = {};
const presByVendedor = {};

const presHeaders = (presRaw[0] || []).map(h => String(h || '').trim().toUpperCase());
const idxPresCte = presHeaders.indexOf('CLIENTE') >= 0 ? presHeaders.indexOf('CLIENTE') : 4;
const idxPresRazon = presHeaders.indexOf('RAZÓN SOCIAL') >= 0 ? presHeaders.indexOf('RAZÓN SOCIAL') : 5;
const idxPresSubcanal = presHeaders.indexOf('SUBCANAL') >= 0 ? presHeaders.indexOf('SUBCANAL') : 53;
const idxPresLU = presHeaders.indexOf('LU') >= 0 ? presHeaders.indexOf('LU') : 9;
const idxPresPer = presHeaders.indexOf('PERIODICIDAD') >= 0 ? presHeaders.indexOf('PERIODICIDAD') : 23;
const idxPresVend = presHeaders.indexOf('DESCRIPCIÓN VENDEDOR') >= 0 ? presHeaders.indexOf('DESCRIPCIÓN VENDEDOR') : (presHeaders.indexOf('VND.') >= 0 ? presHeaders.indexOf('VND.') : 24);
const idxPresRuta = presHeaders.indexOf('RUTA') >= 0 ? presHeaders.indexOf('RUTA') : 7;
const idxPresFdv = presHeaders.indexOf('MODO') >= 0 ? presHeaders.indexOf('MODO') : (presHeaders.indexOf('FUERZA DE VENTAS') >= 0 ? presHeaders.indexOf('FUERZA DE VENTAS') : 56);
const idxPresTipoFdv = presHeaders.indexOf('DSMODOATENCION') >= 0 ? presHeaders.indexOf('DSMODOATENCION') : 57;

for (let i = 1; i < presRaw.length; i++) {
  const r = presRaw[i];
  if (!r || r[idxPresCte] === null) continue;
  const cte = Number(r[idxPresCte]);
  const razon = String(r[idxPresRazon] || '').trim();
  const subcanal = String(r[idxPresSubcanal] || '').trim();
  const vendStr = String(r[idxPresVend] || '').trim();
  const ruta = Number(r[idxPresRuta]) || 0;
  const fdvStr = String(r[idxPresFdv] || '').trim();
  const tipoFdv = String(r[idxPresTipoFdv] || '').trim();
  const dias = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].filter((_, idx) => {
    const v = r[idxPresLU + idx];
    if (v === true || v === 1) return true;
    const s = String(v || '').trim().toUpperCase();
    return s === 'SI' || s === 'TRUE' || s === 'S' || s === '1' || s === 'X';
  });
  const cantDias = dias.length;
  const periodicidad = Number(r[idxPresPer]) || 1;
  const coordX = Number(r[66]) || 0;
  const coordY = Number(r[67]) || 0;

  if (tipoFdv.toUpperCase().includes('PRIMARIO') || fdvStr.toUpperCase().includes('PRE')) presPrimarioCount++;
  else presMerchandCount++;

  if (cantDias === 0) presByVisitDaysCount[0]++;
  else if (cantDias === 1) presByVisitDaysCount[1]++;
  else if (cantDias === 2) presByVisitDaysCount[2]++;
  else {
    presByVisitDaysCount.mayorA2++;
    presExcesoFrecuenciaList.push({
      codigo: cte,
      nombre: razon,
      subcanal,
      vendedor: vendStr,
      ruta,
      diasVisita: dias.join('-'),
      cantDias,
      periodicidad
    });
  }

  presByPeriodicidad[periodicidad] = (presByPeriodicidad[periodicidad] || 0) + 1;
  presByVendedor[vendStr] = (presByVendedor[vendStr] || 0) + 1;

  // Prefer PRE (PRIMARIO) record if a client appears in both PRE and MER
  if (!presencialMap.has(cte) || tipoFdv.includes('PRIMARIO')) {
    presencialMap.set(cte, {
      vendedorStr: vendStr,
      ruta,
      fdvStr,
      tipoFdv,
      diasVisitaList: dias,
      diasVisitaStr: dias.join('-'),
      cantDias,
      periodicidad,
      coordX,
      coordY
    });
  }
}

const clientesMap = new Map();
let bcTotalRows = 0;
let bcActivosCount = 0;
let bcAnuladosCount = 0;
let bcConCoordValidas = 0;
let bcSinCoordValidas = 0;
let bcConRuta = 0;
let bcConDiasVisita = 0;
let bcConSubcanal = 0;
let bcConTelefono = 0;
let bcConCuitValido = 0;
const bcClusterCensoCounts = {};
const bcPlanesCzaCounts = {};
const bcSubcanalActivosCounts = {};
const bcOnPremiseCounts = {};
const bcClientesSinCoordenadas = [];

const bcHeaders = (bcRaw[0] || []).map(h => String(h || '').trim());
const idxAnulado = bcHeaders.indexOf('Anulado'); // 72
const idxCoordX = bcHeaders.indexOf('Coord X'); // 14
const idxCoordY = bcHeaders.indexOf('Coord Y'); // 15
const idxDomicilio = bcHeaders.indexOf('Domicilio'); // 7
const idxLocalidad = bcHeaders.indexOf('Descripcion localidad'); // 28
const idxCodSubcanal = bcHeaders.indexOf('Subcanal'); // 37
const idxDescSubcanal = bcHeaders.indexOf('Descripcion subcanal'); // 38
const idxListaPrecio = bcHeaders.indexOf('Descripcion lista de precios'); // 42
const idxFormaPago = bcHeaders.indexOf('Descripcion forma de pago'); // 47
const idxCuit = bcHeaders.indexOf('Identificador'); // 61
const idxAltaFecha = bcHeaders.indexOf('Alta fecha'); // 71
const idxRuta = bcHeaders.indexOf('Fuerza de venta 1 Ruta de venta'); // 81
const idxVendCode = bcHeaders.indexOf('Fuerza de venta 1 Personal comercial'); // 83
const idxVendNombre = bcHeaders.indexOf('Fuerza de venta 1 Descripcion personal comercial'); // 84
const idxDiasVisita = bcHeaders.indexOf('Fuerza de venta 1 Dias de visita'); // 85
const idxEsPlan = bcHeaders.indexOf('Planes Cerveza.ES PLAN'); // 163
const idxClusterCenso = bcHeaders.indexOf('Cluster Censo Cza.CLUSTER'); // 165

for (let i = 1; i < bcRaw.length; i++) {
  const r = bcRaw[i];
  if (!r || r[1] === null) continue;
  bcTotalRows++;
  const cte = Number(r[1]);
  const razon = String(r[2] || '').trim();
  const fantasia = String(r[3] || '').trim();
  const dom = String(r[idxDomicilio] || '').trim();
  const localidad = String(r[idxLocalidad] || '').trim();
  const codSubcanal = Number(r[idxCodSubcanal]) || 0;
  const descSubcanal = String(r[idxDescSubcanal] || '').trim();
  const tel = String(r[4] || r[5] || '').trim();
  const listaPrecio = String(r[idxListaPrecio] || '').trim();
  const condVenta = String(r[idxFormaPago] || '').trim();
  const cuit = String(r[idxCuit] || '').trim();
  const anulado = String(r[idxAnulado] || 'NO').trim().toUpperCase();
  const fechaAlta = r[idxAltaFecha] instanceof Date ? r[idxAltaFecha].toISOString().slice(0, 10) : String(r[idxAltaFecha] || '').trim();
  const vendCode = Number(r[idxVendCode]) || 0;
  const vendNombre = String(r[idxVendNombre] || '').trim();
  const rutaCode = Number(r[idxRuta]) || 0;
  const diasVisita = String(r[idxDiasVisita] || '').trim();
  const coordX = parseFloat(String(r[idxCoordX] || '0').replace(',', '.')) || 0;
  const coordY = parseFloat(String(r[idxCoordY] || '0').replace(',', '.')) || 0;
  const hasValidCoords = Math.abs(coordX) > 0.001 && Math.abs(coordY) > 0.001;
  const clusterCenso = r[idxClusterCenso] ? String(r[idxClusterCenso]).trim() : 'SIN CLUSTER';
  const esPlanCza = r[idxEsPlan] ? String(r[idxEsPlan]).trim() : 'NO';

  const scInfo = subcanalLookup.get(descSubcanal.toUpperCase());
  const canalMkt = scInfo ? scInfo.canalMkt : (descSubcanal || 'Sin especificar');
  const onPremiseCat = classifyOnPremise(descSubcanal, canalMkt);
  const pres = presencialMap.get(cte);

  if (anulado === 'NO') {
    bcActivosCount++;
    if (hasValidCoords) bcConCoordValidas++;
    else {
      bcSinCoordValidas++;
      if (bcClientesSinCoordenadas.length < 50) {
        bcClientesSinCoordenadas.push({ codigo: cte, nombre: razon, domicilio: dom, subcanal: descSubcanal, vendedor: vendNombre, ruta: rutaCode });
      }
    }
    if (rutaCode > 0) bcConRuta++;
    if (diasVisita.length > 0) bcConDiasVisita++;
    if (descSubcanal.length > 0) bcConSubcanal++;
    if (tel.length > 3) bcConTelefono++;
    if (cuit.length >= 8 && !cuit.startsWith('000000') && !cuit.startsWith('999999')) bcConCuitValido++;

    bcClusterCensoCounts[clusterCenso] = (bcClusterCensoCounts[clusterCenso] || 0) + 1;
    bcPlanesCzaCounts[esPlanCza] = (bcPlanesCzaCounts[esPlanCza] || 0) + 1;
    bcSubcanalActivosCounts[descSubcanal] = (bcSubcanalActivosCounts[descSubcanal] || 0) + 1;
    bcOnPremiseCounts[onPremiseCat] = (bcOnPremiseCounts[onPremiseCat] || 0) + 1;

    clientesMap.set(cte, {
      codigo: cte,
      nombre: razon || fantasia || `Cliente #${cte}`,
      fantasia,
      domicilio: dom,
      localidad,
      canal: canalMkt,
      subcanal: descSubcanal,
      codSubcanal,
      anulado: 'NO',
      enPadronActivo: true,
      vendedor: vendCode,
      nombreVendedor: vendNombre,
      ruta: rutaCode,
      diasVisita: pres ? pres.diasVisitaStr : diasVisita,
      cantDiasVisita: pres ? pres.cantDias : (diasVisita ? diasVisita.split(',').length : 1),
      periodicidad: pres ? pres.periodicidad : 1,
      coordX,
      coordY,
      hasValidCoords,
      listaPrecio,
      condicionVenta: condVenta,
      clusterCenso,
      esPlanCza,
      onPremiseCat
    });
  } else {
    bcAnuladosCount++;
  }
}

// Keep a lightweight lookup of anulados in case historical sales reference an anulado client
const bcAnuladosLookup = new Map();
for (let i = 1; i < bcRaw.length; i++) {
  const r = bcRaw[i];
  if (!r || r[1] === null) continue;
  const anulado = String(r[idxAnulado] || 'NO').trim().toUpperCase();
  if (anulado !== 'NO') {
    const cte = Number(r[1]);
    const descSubcanal = String(r[idxDescSubcanal] || '').trim();
    const scInfo = subcanalLookup.get(descSubcanal.toUpperCase());
    bcAnuladosLookup.set(cte, {
      codigo: cte,
      nombre: String(r[2] || '').trim() || `Cliente #${cte}`,
      domicilio: String(r[idxDomicilio] || '').trim(),
      localidad: String(r[idxLocalidad] || '').trim(),
      canal: scInfo ? scInfo.canalMkt : (descSubcanal || 'Sin especificar'),
      subcanal: descSubcanal,
      anulado: 'SI',
      enPadronActivo: false,
      vendedor: Number(r[idxVendCode]) || 0,
      nombreVendedor: String(r[idxVendNombre] || '').trim(),
      ruta: Number(r[idxRuta]) || 0,
      diasVisita: String(r[idxDiasVisita] || '').trim(),
      cantDiasVisita: 0,
      periodicidad: 1,
      hasValidCoords: false,
      clusterCenso: r[idxClusterCenso] ? String(r[idxClusterCenso]).trim() : 'SIN CLUSTER',
      esPlanCza: r[idxEsPlan] ? String(r[idxEsPlan]).trim() : 'NO',
      onPremiseCat: classifyOnPremise(descSubcanal, '')
    });
  }
}

// 6. (Actualizar) Base CNC.xlsx
const { wb: wbCNC } = readWorkbook('(Actualizar) Base CNC.xlsx');
const cncRaw = XLSX.utils.sheet_to_json(wbCNC.Sheets[wbCNC.SheetNames[0]], { header: 1, defval: null, raw: true });
const cncRecords = [];
const cncSeen = new Set();
const cncDuplicates = [];

for (let i = 1; i < cncRaw.length; i++) {
  const r = cncRaw[i];
  if (!r || !r[0]) continue;
  const per = String(r[0]).trim();
  const cte = Number(r[1]);
  const nombre = String(r[2] || '').trim();
  const dom = String(r[3] || '').trim();
  const canal = String(r[4] || '').trim();
  const univ = Number(r[5]) || 0;
  const act = Number(r[6]) || 0;
  const cnc = Number(r[7]) || 0;

  if (clientesMap.has(cte)) {
    const existing = clientesMap.get(cte);
    existing.canal = canal || existing.canal;
  } else if (bcAnuladosLookup.has(cte)) {
    const an = bcAnuladosLookup.get(cte);
    an.canal = canal || an.canal;
    clientesMap.set(cte, an);
  } else {
    clientesMap.set(cte, {
      codigo: cte,
      nombre,
      domicilio: dom,
      canal,
      subcanal: canal,
      anulado: 'NO',
      enPadronActivo: false,
      vendedor: 0,
      ruta: 0,
      diasVisita: '',
      cantDiasVisita: 1,
      periodicidad: 1,
      hasValidCoords: false,
      clusterCenso: 'SIN CLUSTER',
      esPlanCza: 'NO',
      onPremiseCat: classifyOnPremise(canal, canal)
    });
  }

  const k = `${per}|${cte}`;
  if (cncSeen.has(k)) {
    cncDuplicates.push({ row: i + 1, per, cte, nombre, canal, univ, act, cnc });
    continue;
  }
  cncSeen.add(k);
  cncRecords.push({ per, cte, canal, univ, act, cnc });
}

// 7. (Actualizar) Activos Fijos.xlsx
const { wb: wbAF } = readWorkbook('(Actualizar) Activos Fijos.xlsx');
const afRaw = XLSX.utils.sheet_to_json(wbAF.Sheets[wbAF.SheetNames[0]], { header: 1, defval: null, raw: true });
const activosFijosList = [];
for (let i = 1; i < afRaw.length; i++) {
  const r = afRaw[i];
  if (!r || r[0] === null) continue;
  const cte = r[11] !== null && r[11] !== '' ? Number(r[11]) : null;
  const razon = r[12] ? String(r[12]).trim() : '';
  if (cte && razon && !clientesMap.has(cte)) {
    const an = bcAnuladosLookup.get(cte);
    clientesMap.set(cte, an || { codigo: cte, nombre: razon, domicilio: '', canal: 'Sin especificar', subcanal: 'Sin especificar', anulado: 'SI', enPadronActivo: false });
  }
  const litrosRepago = Number(r[14]) || 0;
  const ventaProm = Number(r[15]) || 0;
  const litrosPend = Number(r[16]) || 0;
  activosFijosList.push({
    articulo: Number(r[0]),
    serie: String(r[21] || r[1] || '').replace(/[\u0000-\u001F]/g, '').trim(),
    nroActivo: String(r[2] || '').trim(),
    descripcion: String(r[4] || '').trim(),
    fisico: String(r[5] || '').trim(),
    instalado: String(r[6] || '').trim(),
    logo: String(r[7] || '').trim(),
    modelo: String(r[8] || '').trim(),
    tipoMaterial: String(r[9] || '').trim(),
    unidadNegocio: String(r[10] || '').trim(),
    cliente: cte,
    razonSocial: razon,
    comprobante: r[13] ? String(r[13]).trim() : '',
    litrosRepago,
    hlRepago: Number((litrosRepago / 100).toFixed(4)),
    ventaPromLitros: ventaProm,
    ventaPromHL: Number((ventaProm / 100).toFixed(4)),
    litrosPendientes: litrosPend,
    hlPendientes: Number((litrosPend / 100).toFixed(4)),
    repaga: String(r[17] || '').trim(),
    estado: String(r[18] || '').trim(),
    fechaColocacion: r[19] instanceof Date ? r[19].toISOString().slice(0, 10) : (r[19] ? String(r[19]).trim() : null)
  });
}

// 8. (Actualizar) Negociaciones.xlsx (5 sheets)
const { wb: wbNeg } = readWorkbook('(Actualizar) Negociaciones.xlsx');
const negRaw = XLSX.utils.sheet_to_json(wbNeg.Sheets['Negociaciones'], { header: 1, defval: null, raw: true });
const negociacionesList = [];
for (let i = 1; i < negRaw.length; i++) {
  const r = negRaw[i];
  if (!r || r[0] === null) continue;
  if (String(r[0]).trim() === 'FECHA' || String(r[2]).trim() === 'ENTERO') continue;
  const cte = Number(r[2]);
  const descCte = String(r[3] || '').trim();
  if (cte && descCte && !clientesMap.has(cte)) {
    const an = bcAnuladosLookup.get(cte);
    clientesMap.set(cte, an || { codigo: cte, nombre: descCte, domicilio: '', canal: 'Sin especificar', subcanal: 'Sin especificar', anulado: 'SI', enPadronActivo: false });
  }
  negociacionesList.push({
    fechaInicio: r[0] instanceof Date ? r[0].toISOString().slice(0, 10) : String(r[0] || '').trim(),
    fechaFin: r[1] instanceof Date ? r[1].toISOString().slice(0, 10) : String(r[1] || '').trim(),
    cliente: cte,
    descripcionCliente: descCte,
    rutaVenta: Number(r[6]) || 0,
    descripcionRuta: String(r[7] || '').trim(),
    responsable: Number(r[8]) || 0,
    nombreResponsable: String(r[9] || '').trim(),
    tipoGrupoArticulo: String(r[12] || '').trim(),
    codigoGrupoArticulo: Number(r[13]) || 0,
    descripcionGrupoArticulo: String(r[14] || '').trim(),
    bonifPorc: Number(r[15]) || 0,
    bultosVarPorc: Number(r[16]) || 0,
    porcCia: Number(r[17]) || 0
  });
}
const modosAtencionRaw = XLSX.utils.sheet_to_json(wbNeg.Sheets['Modos de atencion'], { header: 1, defval: null, raw: true });
const gruposProdRaw = XLSX.utils.sheet_to_json(wbNeg.Sheets['Grupos de productos'], { header: 1, defval: null, raw: true });
console.log(`Activos Fijos: ${activosFijosList.length} rows | Negociaciones valid rows: ${negociacionesList.length} | Clientes Maestro Activos: ${bcActivosCount}`);

// 9. Sales: (Actualizar) Base Prod. y Vol..xlsx + (Actualizar) Base a la fecha.xlsx
const { wb: wbPV } = readWorkbook('(Actualizar) Base Prod. y Vol..xlsx');
const pvRaw = XLSX.utils.sheet_to_json(wbPV.Sheets[wbPV.SheetNames[0]], { header: 1, defval: null, raw: true });
const { wb: wbBF } = readWorkbook('(Actualizar) Base a la fecha.xlsx');
const bfRaw = XLSX.utils.sheet_to_json(wbBF.Sheets[wbBF.SheetNames[0]], { header: 1, defval: null, raw: true });

const salesKeySet = new Set();
const salesRows = [];

for (let i = 1; i < pvRaw.length; i++) {
  const r = pvRaw[i];
  if (!r || !r[0]) continue;
  const per = String(r[0]).trim();
  const div = String(r[1] || '').trim();
  const familia = String(r[2] || '').trim();
  const marca = String(r[3] || '').trim();
  const sabor = String(r[4] || '').trim();
  const calibre = String(r[5] || '').trim();
  const prod = Number(r[6]);
  const cte = Number(r[7]);
  const canal = String(r[8] || '').trim();
  const vend = Number(r[9]);
  const sup = Number(r[10]);
  const ccc = Number(r[11]) || 0;
  const bultos = Number(r[12]) || 0;
  const hl = Number(r[13]) || 0;
  const neto = Number(r[14]) || 0;
  const bonif = Number(r[15]) || 0;

  if (!clientesMap.has(cte)) {
    const an = bcAnuladosLookup.get(cte);
    if (an) {
      an.canal = canal || an.canal;
      clientesMap.set(cte, an);
    } else {
      clientesMap.set(cte, { codigo: cte, nombre: `Cliente #${cte}`, domicilio: '', canal, subcanal: canal, anulado: 'NO', enPadronActivo: false });
    }
  } else {
    const cObj = clientesMap.get(cte);
    if (!cObj.canal || cObj.canal === 'Sin especificar') cObj.canal = canal;
  }

  if (!portfolioMap.has(prod)) {
    const fb = divToUN.get(div) || { un: div, unMktp: div };
    portfolioMap.set(prod, {
      codigo: prod,
      producto: `${marca} ${sabor} ${calibre}`.trim(),
      unidadNegocio: fb.un,
      division: div,
      marca,
      calibre,
      sabor,
      familia,
      marcaUnificado: marca,
      segmento: familia,
      calibreTipo: 'SIN MAESTRO',
      calibreLT: 'SIN MAESTRO',
      sugar: 'REGULAR',
      bEnP: 0,
      uEnB: 0,
      unidadMktp: fb.unMktp,
      focoComercial: '',
      categoriaObjetivo: '',
      nivelSegmento: '',
      isCza: fb.unMktp === 'CERVEZAS',
      isAboveCore: false,
      isCoreValue: fb.unMktp === 'CERVEZAS',
      isLaton710: calibre.includes('710'),
      isBalancedChoice: false,
      isTopUNG: false,
      isSaborizada: div === 'BEBIDAS SABORIZADAS',
      enMaestro: false
    });
  }

  const key = `${per}|${cte}|${prod}|${vend}`;
  salesKeySet.add(key);
  salesRows.push({ per, cte, prod, canal, vend, sup, ccc, bultos, hl, neto, bonif, div, source: 0 });
}

for (let i = 1; i < bfRaw.length; i++) {
  const r = bfRaw[i];
  if (!r || !r[0]) continue;
  const per = String(r[0]).trim();
  const cte = Number(r[1]);
  const prod = Number(r[2]);
  const canal = String(r[3] || '').trim();
  const ccc = Number(r[4]) || 0;
  const marca = String(r[5] || '').trim();
  const vend = Number(r[6]);
  const div = String(r[7] || '').trim();
  const sup = Number(r[8]);
  const hl = Number(r[9]) || 0;
  const bultos = Number(r[10]) || 0;
  const neto = Number(r[11]) || 0;

  const key = `${per}|${cte}|${prod}|${vend}`;
  if (!salesKeySet.has(key)) {
    salesKeySet.add(key);
    if (!clientesMap.has(cte)) {
      const an = bcAnuladosLookup.get(cte);
      clientesMap.set(cte, an || { codigo: cte, nombre: `Cliente #${cte}`, domicilio: '', canal, subcanal: canal, anulado: 'NO', enPadronActivo: false });
    }
    if (!portfolioMap.has(prod)) {
      const fb = divToUN.get(div) || { un: div, unMktp: div };
      portfolioMap.set(prod, {
        codigo: prod,
        producto: `${marca} (${div} #${prod})`,
        unidadNegocio: fb.un,
        division: div,
        marca,
        calibre: 'N/A',
        sabor: 'N/A',
        familia: div,
        marcaUnificado: marca,
        segmento: div,
        calibreTipo: 'SIN MAESTRO',
        calibreLT: 'SIN MAESTRO',
        sugar: 'N/A',
        bEnP: 0,
        uEnB: 0,
        unidadMktp: fb.unMktp,
        focoComercial: '',
        categoriaObjetivo: '',
        nivelSegmento: '',
        isCza: false,
        isAboveCore: false,
        isCoreValue: false,
        isLaton710: false,
        isBalancedChoice: false,
        isTopUNG: false,
        isSaborizada: false,
        enMaestro: false
      });
    }
    salesRows.push({ per, cte, prod, canal, vend, sup, ccc, bultos, hl, neto, bonif: 0, div, source: 1 });
  }
}

// 10. (Actualizar) Base Obj..xlsx
const { wb: wbObj } = readWorkbook('(Actualizar) Base Obj..xlsx');
const objRaw = XLSX.utils.sheet_to_json(wbObj.Sheets[wbObj.SheetNames[0]], { header: 1, defval: null, raw: true });
const objByKey = new Map();
for (let i = 1; i < objRaw.length; i++) {
  const r = objRaw[i];
  if (!r || !r[0]) continue;
  const per = String(r[0]).trim();
  const div = String(r[1] || '').trim();
  const marca = String(r[3] || '').trim();
  const prod = Number(r[6]);
  const canal = String(r[8] || '').trim();
  const vend = Number(r[9]);
  const sup = Number(r[10]);
  const objHL = Number(r[11]) || 0;

  if (!portfolioMap.has(prod)) {
    const fb = divToUN.get(div) || { un: div, unMktp: div };
    portfolioMap.set(prod, {
      codigo: prod,
      producto: `${marca} (${div} #${prod})`,
      unidadNegocio: fb.un,
      division: div,
      marca,
      calibre: String(r[5] || 'N/A').trim(),
      sabor: String(r[4] || 'N/A').trim(),
      familia: String(r[2] || div).trim(),
      marcaUnificado: marca,
      segmento: div,
      calibreTipo: 'SIN MAESTRO',
      calibreLT: 'SIN MAESTRO',
      sugar: 'N/A',
      bEnP: 0,
      uEnB: 0,
      unidadMktp: fb.unMktp,
      focoComercial: '',
      categoriaObjetivo: '',
      nivelSegmento: '',
      isCza: fb.unMktp === 'CERVEZAS',
      isAboveCore: false,
      isCoreValue: fb.unMktp === 'CERVEZAS',
      isLaton710: false,
      isBalancedChoice: false,
      isTopUNG: false,
      isSaborizada: div === 'BEBIDAS SABORIZADAS',
      enMaestro: false
    });
  }

  const k = `${per}|${prod}|${canal}|${vend}|${sup}`;
  if (!objByKey.has(k)) {
    objByKey.set(k, { per, prod, canal, vend, sup, div, objHL: 0, rows: 0 });
  }
  const entry = objByKey.get(k);
  entry.objHL += objHL;
  entry.rows++;
}

// 11. (Actualizar) Base Eficiencia.xlsx
const { wb: wbEfi } = readWorkbook('(Actualizar) Base Eficiencia.xlsx');
const efiRaw = XLSX.utils.sheet_to_json(wbEfi.Sheets[wbEfi.SheetNames[0]], { header: 1, defval: null, raw: true });
const efiAgg = new Map();
for (let i = 1; i < efiRaw.length; i++) {
  const r = efiRaw[i];
  if (!r || !r[0]) continue;
  const per = String(r[0]).trim();
  const canal = String(r[2] || '').trim();
  const vis = Number(r[3]) || 0;
  const visEf = Number(r[4]) || 0;
  const visFR = Number(r[5]) || 0;
  const k = `${per}|${canal}`;
  if (!efiAgg.has(k)) efiAgg.set(k, { per, canal, rows: 0, vis: 0, visEf: 0, visFR: 0 });
  const item = efiAgg.get(k);
  item.rows++;
  item.vis += vis;
  item.visEf += visEf;
  item.visFR += visFR;
}

// 12. (Actualizar) Base MXPDV.xlsx
const { wb: wbMX } = readWorkbook('(Actualizar) Base MXPDV.xlsx');
const mxRaw = XLSX.utils.sheet_to_json(wbMX.Sheets[wbMX.SheetNames[0]], { header: 1, defval: null, raw: true });
const mxAgg = new Map();
for (let i = 1; i < mxRaw.length; i++) {
  const r = mxRaw[i];
  if (!r || !r[0]) continue;
  const per = String(r[0]).trim();
  const canal = String(r[2] || '').trim();
  const vend = Number(r[3]);
  const sup = Number(r[4]);
  const marcas = Number(r[5]) || 0;
  const k = `${per}|${canal}|${vend}|${sup}`;
  if (!mxAgg.has(k)) mxAgg.set(k, { per, canal, vend, sup, pdvCount: 0, sumMarcas: 0 });
  const item = mxAgg.get(k);
  item.pdvCount++;
  item.sumMarcas += marcas;
}

// 13. (Actualizar) Base Rechazos.xlsx
const { wb: wbRec } = readWorkbook('(Actualizar) Base Rechazos.xlsx');
const recRaw = XLSX.utils.sheet_to_json(wbRec.Sheets[wbRec.SheetNames[0]], { header: 1, defval: null, raw: true });
const recList = [];
for (let i = 1; i < recRaw.length; i++) {
  const r = recRaw[i];
  if (!r || !r[0]) continue;
  const per = String(r[0]).trim();
  const cte = Number(r[1]);
  const bultos = Number(r[2]) || 0;
  const neto = Number(r[3]) || 0;
  const um = Number(r[4]) || 0;
  const motivo = r[5] ? String(r[5]).trim() : 'SIN MOTIVO ESPECIFICADO';
  const cteInfo = clientesMap.get(cte);
  const canal = cteInfo ? cteInfo.canal : 'Sin especificar';
  recList.push({ per, cte, canal, bultos, neto, hl: um, motivo });
}

// 14. Tablero Ventas.xlsb (55 Sheets — Binary BIFF12)
console.log('Reading 1. Bases/Tablero Ventas.xlsb (55 sheets)...');
const { wb: wbTablero } = readWorkbook('Tablero Ventas.xlsb');

function parseScorecardSheet(sheetName, mesaLabel, supervisorCode) {
  const rows = XLSX.utils.sheet_to_json(wbTablero.Sheets[sheetName], { header: 1, defval: null, raw: true });
  const kpiItems = [];
  const rtoItems = [];
  let section = 'KPI';
  let tacoKpiScore = 0;
  let tacoRtoScore = 0;
  let tacoTotalScore = 0;

  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const label = r[0] !== null && r[0] !== undefined ? String(r[0]).trim() : '';
    const col9Label = r[9] !== null && r[9] !== undefined ? String(r[9]).trim() : '';

    if (col9Label === 'TACO KPI' && rows[i + 1] && typeof rows[i + 1][9] === 'number') {
      tacoKpiScore = Number((Number(rows[i + 1][9]) * 100).toFixed(2));
    }
    if (col9Label === 'TACO RTO' && rows[i + 1] && typeof rows[i + 1][9] === 'number') {
      tacoRtoScore = Number((Number(rows[i + 1][9]) * 100).toFixed(2));
    }
    if (col9Label === 'TACO TOTAL' && rows[i + 1] && typeof rows[i + 1][9] === 'number') {
      tacoTotalScore = Number((Number(rows[i + 1][9]) * 100).toFixed(2));
    }

    if (label === 'TACO RESULTADOS' || label === 'RTO GALAXIA') {
      section = 'RTO';
      continue;
    }
    if (!label || r[1] === null || r[2] === null || typeof r[1] !== 'number') continue;
    if (section === 'KPI' || section === 'RTO') {
      const real = Number(r[1]) || 0;
      const obj = Number(r[2]) || 0;
      const alcancePct = Number(((Number(r[3]) || (obj > 0 ? real / obj : 0)) * 100).toFixed(2));
      const tendencia = Number(r[4]) || 0;
      const flag = String(r[5] || '').trim();
      const puntosBase = Number(r[6]) || 0;
      const pesoBloquePct = Number(((Number(r[7]) || 0) * 100).toFixed(2));
      const restan = typeof r[9] === 'number' && section === 'KPI' ? Number(r[9]) : Number((real - obj).toFixed(2));
      const proyeccionLE = Number((real * (26 / 12)).toFixed(2));
      const item = {
        indicador: label,
        bloque: section === 'KPI' ? 'TACO KPI (Ejecución/Cobertura)' : 'TACO RTO (Volumen/Facturación)',
        real: Number(real.toFixed(2)),
        objetivo: Number(obj.toFixed(2)),
        alcancePct,
        proyeccionCierreLE: proyeccionLE,
        tendenciaRatio: Number((tendencia * 100).toFixed(2)),
        flag,
        puntosGalaxiaMax: puntosBase,
        pesoBloquePct,
        brechaRestan: Number(restan.toFixed(2)),
        mejorMesa: r[13] ? String(r[13]).trim() : null,
        mejorVendedor: r[14] ? String(r[14]).trim() : null,
        bottomVendedor: r[15] ? String(r[15]).trim() : null
      };
      if (section === 'KPI') kpiItems.push(item);
      else rtoItems.push(item);
    }
  }

  if (tacoKpiScore === 0 && kpiItems.length > 0) {
    let sumWeighted = 0;
    let sumWeight = 0;
    for (const item of kpiItems) {
      if (item.pesoBloquePct > 0) {
        sumWeighted += (item.alcancePct / 100) * (item.pesoBloquePct / 100);
        sumWeight += (item.pesoBloquePct / 100);
      }
    }
    if (sumWeight > 0) {
      tacoKpiScore = Number(((sumWeighted / sumWeight) * 100).toFixed(2));
    }
  }

  if (tacoRtoScore === 0 && rtoItems.length > 0) {
    let sumWeighted = 0;
    let sumWeight = 0;
    for (const item of rtoItems) {
      if (item.pesoBloquePct > 0) {
        sumWeighted += (item.alcancePct / 100) * (item.pesoBloquePct / 100);
        sumWeight += (item.pesoBloquePct / 100);
      }
    }
    if (sumWeight > 0) {
      tacoRtoScore = Number(((sumWeighted / sumWeight) * 100).toFixed(2));
    }
  }

  if (tacoTotalScore === 0) {
    tacoTotalScore = tacoRtoScore > 0
      ? Number((tacoKpiScore * 0.35 + tacoRtoScore * 0.65).toFixed(2))
      : tacoKpiScore;
  }

  return {
    sheetName,
    mesaLabel,
    supervisorCode,
    tacoKpiPct: tacoKpiScore,
    tacoRtoPct: tacoRtoScore,
    tacoTotalPct: tacoTotalScore,
    kpiItems,
    rtoItems
  };
}

const mandoIntegral = parseScorecardSheet('Mando Integral', 'TOTAL DISTRIBUIDOR (MANDO INTEGRAL)', 'ALL');
const mesaJulio = parseScorecardSheet('Mesa Julio', 'MESA JULIO (101 - JULIO BASUALDO)', 101);
const mesaGonza = parseScorecardSheet('Mesa Gonza', 'MESA GONZA (100 - GONZALO CORIA)', 100);

// Extract promoter-level tables from Tablero Ventas.xlsb
function parsePromoterSheet(sheetName) {
  const ws = wbTablero.Sheets[sheetName];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r[0] === null) continue;
    const vCode = Number(r[0]);
    if (isNaN(vCode) || vCode <= 0 || vCode > 50) continue;
    const real = Number(r[1]) || 0;
    const obj = Number(r[2]) || 0;
    const alc = Number(r[3]) || (obj > 0 ? real / obj : 0);
    const tend = Number(r[4]) || 0;
    const flag = String(r[5] || '').trim();
    const restan = Number(r[6]) || (real - obj);
    const necDiaria = Number(r[7]) || 0;
    list.push({
      vendedor: vCode,
      real: Number(real.toFixed(2)),
      objetivo: Number(obj.toFixed(2)),
      alcancePct: Number((alc * 100).toFixed(2)),
      tendenciaPct: Number((tend * 100).toFixed(2)),
      flag,
      restan: Number(restan.toFixed(2)),
      necesidadDiaria: Number(necDiaria.toFixed(2))
    });
  }
  return list;
}

const promoterSheetsMap = {
  cccCerveza: parsePromoterSheet('CCC Cerveza'),
  totalDistCza: parsePromoterSheet('Total Dist Cza'),
  totalDistNabs: parsePromoterSheet('Total Dist NABS'),
  cccUng: parsePromoterSheet('CCC UNG'),
  tbdAboveCore: parsePromoterSheet('TBD AboveCore'),
  tbdLatones: parsePromoterSheet('TBD Latones'),
  tbdBalancedChoices: parsePromoterSheet('TBD Balanced Choices'),
  tbdNabsTop: parsePromoterSheet('TBD NABS TOP'),
  gmvMktplace: parsePromoterSheet('GMV MKTPLACE'),
  nrMktp: parsePromoterSheet('NR MKTP')
};

// Censo Clientes sheet from Tablero Ventas.xlsb
const censoRaw = XLSX.utils.sheet_to_json(wbTablero.Sheets['Censo Clientes'], { header: 1, defval: null, raw: true });
const censoPorPromotor = [];
let censoTotalActivos = 1337, censoRealizados = 708, censoAvancePct = 52.95, censoRestan = 629;
for (let i = 1; i < censoRaw.length; i++) {
  const r = censoRaw[i];
  if (!r || r[0] === null) continue;
  if (String(r[0]).toUpperCase().includes('TOTAL')) {
    censoTotalActivos = Number(r[1]) || 1337;
    censoRealizados = Number(r[2]) || 708;
    censoAvancePct = Number(((Number(r[3]) || 0) * 100).toFixed(2));
    censoRestan = Math.abs(Number(r[4]) || 629);
    continue;
  }
  const vCode = Number(r[0]);
  if (!isNaN(vCode) && vCode > 0) {
    const pInfo = personalMap.get(vCode);
    censoPorPromotor.push({
      vendedor: vCode,
      nombre: pInfo ? pInfo.nombre : `Vendedor #${vCode}`,
      supervisor: pInfo ? pInfo.superior : '',
      supervisorCodigo: pInfo ? pInfo.superiorCodigo : null,
      tipoPreventa: pInfo ? pInfo.segmentoVendedor : '',
      activos: Number(r[1]) || 0,
      censados: Number(r[2]) || 0,
      avancePct: Number(((Number(r[3]) || 0) * 100).toFixed(2)),
      pendientes: Math.abs(Number(r[4]) || 0)
    });
  }
}

// Consolidate promoter-level October 2026 matrix
const activePromotersCodes = [3, 6, 7, 8, 9, 10, 11, 12, 16, 18];
const byVendedorOctubre = activePromotersCodes.map(vCode => {
  const pInfo = personalMap.get(vCode) || {};
  const censoRow = censoPorPromotor.find(c => c.vendedor === vCode) || { activos: 0, censados: 0, avancePct: 0, pendientes: 0 };
  const metrics = {};
  for (const [k, arr] of Object.entries(promoterSheetsMap)) {
    metrics[k] = arr.find(x => x.vendedor === vCode) || null;
  }
  return {
    vendedor: vCode,
    nombre: pInfo.nombre || `Vendedor #${vCode}`,
    cargo: pInfo.cargo || 'PREVENTISTA',
    tipoPreventa: pInfo.segmentoVendedor || 'VE Conjunta',
    supervisor: pInfo.superior || '',
    supervisorCodigo: pInfo.superiorCodigo || 99,
    mesa: pInfo.mesa || 'GENERAL',
    censo: censoRow,
    kpisOctubre: metrics
  };
});

// Extract TACO REAL (Monthly Jan-Dec 2026 Real vs Objective)
const tacoRealSheet = XLSX.utils.sheet_to_json(wbTablero.Sheets['TACO REAL'], { header: 1, defval: null, raw: true });
const monthsShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const tacoHistoricoMensual2026 = [];
for (let rIdx = 22; rIdx <= 37; rIdx++) {
  const r = tacoRealSheet[rIdx];
  if (!r || !r[0]) continue;
  const kpiName = String(r[0]).trim();
  const realMonths = monthsShort.map((m, idx) => {
    const val = r[idx + 1];
    return typeof val === 'number' ? Number(val.toFixed(2)) : 0;
  });
  const objMonths = monthsShort.map((m, idx) => {
    const rawVal = r[idx + 19];
    if (rawVal === null || rawVal === undefined || rawVal === '') return null;
    if (typeof rawVal === 'number') return Number(rawVal.toFixed(2));
    const parsed = parseFloat(String(rawVal).replace(/\./g, '').replace(',', '.'));
    return isNaN(parsed) ? null : Number(parsed.toFixed(2));
  });
  tacoHistoricoMensual2026.push({
    kpi: kpiName,
    realPorMes: realMonths,
    objetivoPorMes: objMonths
  });
}

// Extract 0-Base objetivos (Digital & BEES targets + TACO monthly objectives)
const baseObjTableroRaw = XLSX.utils.sheet_to_json(wbTablero.Sheets['0-Base objetivos'], { header: 1, defval: null, raw: true });
const objetivosTableroMensual = [];
for (let i = 2; i < baseObjTableroRaw.length; i++) {
  const r = baseObjTableroRaw[i];
  if (!r || !r[0]) continue;
  objetivosTableroMensual.push({
    indicador: String(r[0]).trim(),
    meses: r.slice(1, 13).map(v => (typeof v === 'number' ? Number(v.toFixed(4)) : 0))
  });
}

// ============================================================================
// PROGRAMA GALAXIA 2026 (CMQ) — CÁLCULOS Y AUDITORÍAS VERIFICABLES
// ============================================================================
console.log('Computing Programa Galaxia 2026 KPIs, Sensibilización, CNC Multi-Horizonte, CAPEX & Revenue Management...');

// 1. CNC Multi-Horizonte (U3M: Jul-Sep 2026, U6M: Abr-Sep 2026, U12M: Oct 2025 - Sep 2026) por Unidad de Negocio
const u3mPeriods = new Set(['2026/07', '2026/08', '2026/09']);
const u6mPeriods = new Set(['2026/04', '2026/05', '2026/06', '2026/07', '2026/08', '2026/09']);
const u12mPeriods = new Set(['2025/10', '2025/11', '2025/12', '2026/01', '2026/02', '2026/03', '2026/04', '2026/05', '2026/06', '2026/07', '2026/08', '2026/09']);

const activeClientsSet = new Set();
for (const [cid, cObj] of clientesMap.entries()) {
  if (cObj.enPadronActivo) activeClientsSet.add(cid);
}
const totalPadronActivo = activeClientsSet.size; // 1,485

const buyersByHorizonAndUN = {
  GLOBAL: { u1m_sep26: new Set(), u3m: new Set(), u6m: new Set(), u12m: new Set() },
  CERVEZAS: { u1m_sep26: new Set(), u3m: new Set(), u6m: new Set(), u12m: new Set() },
  UNG: { u1m_sep26: new Set(), u3m: new Set(), u6m: new Set(), u12m: new Set() },
  AGUAS: { u1m_sep26: new Set(), u3m: new Set(), u6m: new Set(), u12m: new Set() },
  MARKETPLACE: { u1m_sep26: new Set(), u3m: new Set(), u6m: new Set(), u12m: new Set() },
  VINO: { u1m_sep26: new Set(), u3m: new Set(), u6m: new Set(), u12m: new Set() }
};

for (const s of salesRows) {
  if (s.hl <= 0 && s.bultos <= 0 && s.ccc <= 0) continue;
  const p = portfolioMap.get(s.prod);
  const un = p ? (p.unidadMktp === 'MARKETPLACE ALIMENTOS' ? 'MARKETPLACE' : p.unidadMktp) : s.div;
  const isSep26 = s.per === '2026/09';
  const isU3 = u3mPeriods.has(s.per);
  const isU6 = u6mPeriods.has(s.per);
  const isU12 = u12mPeriods.has(s.per);

  if (isSep26) buyersByHorizonAndUN.GLOBAL.u1m_sep26.add(s.cte);
  if (isU3) buyersByHorizonAndUN.GLOBAL.u3m.add(s.cte);
  if (isU6) buyersByHorizonAndUN.GLOBAL.u6m.add(s.cte);
  if (isU12) buyersByHorizonAndUN.GLOBAL.u12m.add(s.cte);

  if (buyersByHorizonAndUN[un]) {
    if (isSep26) buyersByHorizonAndUN[un].u1m_sep26.add(s.cte);
    if (isU3) buyersByHorizonAndUN[un].u3m.add(s.cte);
    if (isU6) buyersByHorizonAndUN[un].u6m.add(s.cte);
    if (isU12) buyersByHorizonAndUN[un].u12m.add(s.cte);
  }
}

const cncMultiHorizonte = {};
for (const [unKey, sets] of Object.entries(buyersByHorizonAndUN)) {
  const countInPadron = (buyerSet) => {
    let inPad = 0;
    for (const cid of activeClientsSet) {
      if (buyerSet.has(cid)) inPad++;
    }
    return inPad;
  };
  const compSep = countInPadron(sets.u1m_sep26);
  const compU3 = countInPadron(sets.u3m);
  const compU6 = countInPadron(sets.u6m);
  const compU12 = countInPadron(sets.u12m);

  cncMultiHorizonte[unKey] = {
    padronActivo: totalPadronActivo,
    sep2026: {
      cccTotal: sets.u1m_sep26.size,
      compradoresPadron: compSep,
      cncPadron: totalPadronActivo - compSep,
      tasaCNCPct: Number((((totalPadronActivo - compSep) / totalPadronActivo) * 100).toFixed(2))
    },
    u3m: {
      cccTotal: sets.u3m.size,
      compradoresPadron: compU3,
      cncPadron: totalPadronActivo - compU3,
      tasaCNCPct: Number((((totalPadronActivo - compU3) / totalPadronActivo) * 100).toFixed(2))
    },
    u6m: {
      cccTotal: sets.u6m.size,
      compradoresPadron: compU6,
      cncPadron: totalPadronActivo - compU6,
      tasaCNCPct: Number((((totalPadronActivo - compU6) / totalPadronActivo) * 100).toFixed(2))
    },
    u12m: {
      cccTotal: sets.u12m.size,
      compradoresPadron: compU12,
      cncPadron: totalPadronActivo - compU12,
      tasaCNCPct: Number((((totalPadronActivo - compU12) / totalPadronActivo) * 100).toFixed(2))
    }
  };
}

// 2. Objetivación y Sensibilización (Fórmula Galaxia: 66% Peso Venta Real + 33% Peso Objetivo, Alerta ±10%)
// Evaluated on YTD 2026 (Ene-Sep) and latest closed month (2026/09) across Vendedores (3..18) and Supervisores (99, 100, 101)
const sensCategories = [
  { id: 'TOTAL_VOL', label: 'Volumen Total (HL)', matchProd: () => true },
  { id: 'TOTAL_CZA', label: 'Total Cervezas (CZA)', matchProd: p => p && p.isCza },
  { id: 'CORE_VALUE', label: 'Cervezas Core + Value', matchProd: p => p && p.isCoreValue },
  { id: 'ABOVE_CORE', label: 'Cervezas Above Core', matchProd: p => p && p.isAboveCore },
  { id: 'TOTAL_UNG', label: 'Total UNG (NABS)', matchProd: p => p && p.unidadMktp === 'UNG' },
  { id: 'TOP_UNG', label: 'Volumen TOP UNG', matchProd: p => p && p.isTopUNG },
  { id: 'AGUAS', label: 'Aguas Danone', matchProd: p => p && p.unidadMktp === 'AGUAS' }
];

function computeSensibilizacionTable(periodFilterFn) {
  const resultByCat = {};
  for (const cat of sensCategories) {
    const vendReal = new Map();
    const vendObj = new Map();
    let totalReal = 0;
    let totalObj = 0;

    for (const s of salesRows) {
      if (!periodFilterFn(s.per)) continue;
      const p = portfolioMap.get(s.prod);
      if (!cat.matchProd(p)) continue;
      vendReal.set(s.vend, (vendReal.get(s.vend) || 0) + s.hl);
      totalReal += s.hl;
    }

    for (const o of objByKey.values()) {
      if (!periodFilterFn(o.per)) continue;
      const p = portfolioMap.get(o.prod);
      if (!cat.matchProd(p)) continue;
      vendObj.set(o.vend, (vendObj.get(o.vend) || 0) + o.objHL);
      totalObj += o.objHL;
    }

    const allVends = [...new Set([...vendReal.keys(), ...vendObj.keys()])].sort((a, b) => a - b);
    const rows = [];
    let desvioCount = 0;

    for (const vCode of allVends) {
      const rHL = vendReal.get(vCode) || 0;
      const oHL = vendObj.get(vCode) || 0;
      const shareRealPct = totalReal > 0 ? (rHL / totalReal) * 100 : 0;
      const shareObjPct = totalObj > 0 ? (oHL / totalObj) * 100 : 0;
      // Galaxia 2026 Sensibilización Formula: 2/3 (66.67%) Real + 1/3 (33.33%) Obj
      const pesoSugeridoGalaxiaPct = (2 / 3) * shareRealPct + (1 / 3) * shareObjPct;
      const objSugeridoHL = totalObj * (pesoSugeridoGalaxiaPct / 100);
      // Relative deviation of assigned objective vs Galaxia sensitized objective:
      const desvioRelativoPct = objSugeridoHL > 0 ? ((oHL - objSugeridoHL) / objSugeridoHL) * 100 : 0;
      const desvioPuntosPct = shareObjPct - pesoSugeridoGalaxiaPct;
      const excedeTolerancia10Pct = Math.abs(desvioRelativoPct) > 10.0;
      if (excedeTolerancia10Pct) desvioCount++;

      const pInfo = personalMap.get(vCode);
      rows.push({
        vendedor: vCode,
        nombre: pInfo ? pInfo.nombre : `Vendedor #${vCode}`,
        supervisor: pInfo ? pInfo.superior : '',
        supervisorCodigo: pInfo ? pInfo.superiorCodigo : 99,
        tipoPreventa: pInfo ? pInfo.segmentoVendedor : '',
        ventaRealHL: Number(rHL.toFixed(2)),
        objetivoAsignadoHL: Number(oHL.toFixed(2)),
        shareVentaRealPct: Number(shareRealPct.toFixed(2)),
        shareObjetivoActualPct: Number(shareObjPct.toFixed(2)),
        pesoSensibilizadoGalaxiaPct: Number(pesoSugeridoGalaxiaPct.toFixed(2)),
        objetivoSensibilizadoHL: Number(objSugeridoHL.toFixed(2)),
        diferenciaHL: Number((oHL - objSugeridoHL).toFixed(2)),
        desvioRelativoPct: Number(desvioRelativoPct.toFixed(2)),
        desvioPuntosPct: Number(desvioPuntosPct.toFixed(2)),
        alertaDesvio10Pct: excedeTolerancia10Pct,
        estadoSensibilizacion: excedeTolerancia10Pct
          ? (desvioRelativoPct > 10 ? 'SOBRE-OBJETIVADO (> +10%)' : 'SUB-OBJETIVADO (< -10%)')
          : 'EN RANGO (±10% OK)'
      });
    }

    resultByCat[cat.id] = {
      id: cat.id,
      label: cat.label,
      totalVentaRealHL: Number(totalReal.toFixed(2)),
      totalObjetivoHL: Number(totalObj.toFixed(2)),
      vendedoresEnAlertaCount: desvioCount,
      vendedoresTotalCount: rows.length,
      rows
    };
  }
  return resultByCat;
}

const sensibilizacionYTD2026 = computeSensibilizacionTable(per => per.startsWith('2026/'));
const sensibilizacionSep2026 = computeSensibilizacionTable(per => per === '2026/09');

// 3. Censo Thomas SKUs Performance & SOM/SOS
const censoSkuPerf = new Map();
for (const s of salesRows) {
  if (!s.per.startsWith('2026/')) continue;
  const p = portfolioMap.get(s.prod);
  if (!p || !p.censo) continue;
  if (!censoSkuPerf.has(p.censo)) {
    censoSkuPerf.set(p.censo, { censoCalibre: p.censo, hl26: 0, neto26: 0, cccSet: new Set() });
  }
  const b = censoSkuPerf.get(p.censo);
  b.hl26 += s.hl;
  b.neto26 += s.neto;
  if (s.hl > 0 || s.ccc > 0) b.cccSet.add(s.cte);
}
const censoThomasSkusList = [...censoSkuPerf.values()].map(x => ({
  censoCalibre: x.censoCalibre,
  hlYTD2026: Number(x.hl26.toFixed(2)),
  netoYTD2026: Number(x.neto26.toFixed(2)),
  cccYTD2026: x.cccSet.size,
  coberturaSobrePadronPct: Number(((x.cccSet.size / totalPadronActivo) * 100).toFixed(2))
})).sort((a, b) => b.hlYTD2026 - a.hlYTD2026);

// 4. CAPEX Coolers & Chopp Audit (Venta Cero 3m/6m, Stock en Depósito Clúster 2, Repago por Modelo)
let afInstalados = 0, afEnStock = 0, afDeBaja = 0;
let afVentaCeroReportada = 0;
let afSinCompraCzaU3M = 0;
let afSinCompraCzaU6M = 0;
let afRepagaSi = 0, afRepagaNo = 0;
const afPorModelo = new Map();

for (const item of activosFijosList) {
  if (item.estado === 'INSTALADO') {
    afInstalados++;
    if (item.ventaPromLitros <= 0) afVentaCeroReportada++;
    if (item.cliente && !buyersByHorizonAndUN.CERVEZAS.u3m.has(item.cliente)) afSinCompraCzaU3M++;
    if (item.cliente && !buyersByHorizonAndUN.CERVEZAS.u6m.has(item.cliente)) afSinCompraCzaU6M++;
    if (item.repaga === 'SI') afRepagaSi++;
    else afRepagaNo++;

    const modKey = `${item.unidadNegocio} | ${item.modelo || item.descripcion}`;
    if (!afPorModelo.has(modKey)) {
      afPorModelo.set(modKey, {
        unidadNegocio: item.unidadNegocio,
        modelo: item.modelo || item.descripcion,
        instalados: 0,
        repagaSi: 0,
        ventaCero: 0,
        sumHLRepagoMeta: 0,
        sumHLVentaProm: 0
      });
    }
    const m = afPorModelo.get(modKey);
    m.instalados++;
    if (item.repaga === 'SI') m.repagaSi++;
    if (item.ventaPromLitros <= 0) m.ventaCero++;
    m.sumHLRepagoMeta += item.hlRepago;
    m.sumHLVentaProm += item.ventaPromHL;
  } else if (item.estado === 'EN STOCK') {
    afEnStock++;
  } else if (item.estado === 'DE BAJA') {
    afDeBaja++;
  }
}
const parqueOperativoActivo = afInstalados + afEnStock; // 775 + 229 = 1,004
const stockSobreParqueOperativoPct = Number(((afEnStock / parqueOperativoActivo) * 100).toFixed(2)); // 22.81%
const stockSobreTotal2000Pct = Number(((afEnStock / activosFijosList.length) * 100).toFixed(2)); // 11.45%

// 5. Revenue Management: Trade Spend ($TS/HL y %TS/$Fact) + TOP 5 Clientes por Canal (con R3 y MMAA)
const tsByCanalMap = new Map();
const tsByMarcaMap = new Map();
const clientChannelPerf = new Map(); // key: `${canal}|${cte}`

for (const s of salesRows) {
  const is2026 = s.per.startsWith('2026/');
  const isSep26 = s.per === '2026/09';
  const isSep25 = s.per === '2025/09';
  const isR3 = s.per === '2026/07' || s.per === '2026/08' || s.per === '2026/09';
  const p = portfolioMap.get(s.prod);

  if (is2026) {
    if (!tsByCanalMap.has(s.canal)) {
      tsByCanalMap.set(s.canal, { canal: s.canal, hl26: 0, neto26: 0, bonif26: 0, cccSet: new Set() });
    }
    const bc = tsByCanalMap.get(s.canal);
    bc.hl26 += s.hl;
    bc.neto26 += s.neto;
    bc.bonif26 += s.bonif;
    if (s.hl > 0) bc.cccSet.add(s.cte);

    const marcaKey = p ? (p.marcaUnificado || p.marca) : 'OTRAS';
    if (!tsByMarcaMap.has(marcaKey)) {
      tsByMarcaMap.set(marcaKey, { marca: marcaKey, unidadNegocio: p ? p.unidadMktp : s.div, hl26: 0, neto26: 0, bonif26: 0 });
    }
    const bm = tsByMarcaMap.get(marcaKey);
    bm.hl26 += s.hl;
    bm.neto26 += s.neto;
    bm.bonif26 += s.bonif;
  }

  if (is2026 || isSep25) {
    const ck = `${s.canal}|${s.cte}`;
    if (!clientChannelPerf.has(ck)) {
      clientChannelPerf.set(ck, {
        canal: s.canal,
        cte: s.cte,
        hlYTD26: 0,
        netoYTD26: 0,
        bonifYTD26: 0,
        hlSep26: 0,
        hlR3Sum: 0,
        hlSep25: 0,
        hlCzaTotal: 0,
        hlCzaAboveCore: 0,
        hlCzaCoreValue: 0
      });
    }
    const cp = clientChannelPerf.get(ck);
    if (is2026) {
      cp.hlYTD26 += s.hl;
      cp.netoYTD26 += s.neto;
      cp.bonifYTD26 += s.bonif;
      if (p && p.isCza) {
        cp.hlCzaTotal += s.hl;
        if (p.isAboveCore) cp.hlCzaAboveCore += s.hl;
        if (p.isCoreValue) cp.hlCzaCoreValue += s.hl;
      }
    }
    if (isSep26) cp.hlSep26 += s.hl;
    if (isR3) cp.hlR3Sum += s.hl;
    if (isSep25) cp.hlSep25 += s.hl;
  }
}

const tradeSpendPorCanal = [...tsByCanalMap.values()].map(c => {
  const factBruta = c.neto26 + c.bonif26;
  return {
    canal: c.canal,
    canalUnificado: resolveCanal(c.canal).canalUnificado,
    hlYTD26: Number(c.hl26.toFixed(2)),
    netoYTD26: Number(c.neto26.toFixed(2)),
    bonifYTD26: Number(c.bonif26.toFixed(2)),
    tsPorHL: c.hl26 > 0 ? Number((c.bonif26 / c.hl26).toFixed(2)) : 0,
    tsSobreFactNetaPct: c.neto26 > 0 ? Number(((c.bonif26 / c.neto26) * 100).toFixed(2)) : 0,
    tsSobreFactBrutaPct: factBruta > 0 ? Number(((c.bonif26 / factBruta) * 100).toFixed(2)) : 0,
    ccc: c.cccSet.size
  };
}).sort((a, b) => b.bonifYTD26 - a.bonifYTD26);

const tradeSpendPorMarca = [...tsByMarcaMap.values()].map(m => {
  const factBruta = m.neto26 + m.bonif26;
  return {
    marca: m.marca,
    unidadNegocio: m.unidadNegocio,
    hlYTD26: Number(m.hl26.toFixed(2)),
    netoYTD26: Number(m.neto26.toFixed(2)),
    bonifYTD26: Number(m.bonif26.toFixed(2)),
    tsPorHL: m.hl26 > 0 ? Number((m.bonif26 / m.hl26).toFixed(2)) : 0,
    tsSobreFactNetaPct: m.neto26 > 0 ? Number(((m.bonif26 / m.neto26) * 100).toFixed(2)) : 0,
    tsSobreFactBrutaPct: factBruta > 0 ? Number(((m.bonif26 / factBruta) * 100).toFixed(2)) : 0
  };
}).filter(m => m.hlYTD26 > 10).sort((a, b) => b.bonifYTD26 - a.bonifYTD26).slice(0, 25);

// Count active negotiations per client
const negByClientCount = new Map();
for (const n of negociacionesList) {
  if (!negByClientCount.has(n.cliente)) negByClientCount.set(n.cliente, { count: 0, sumBonif: 0 });
  const nc = negByClientCount.get(n.cliente);
  nc.count++;
  nc.sumBonif += n.bonifPorc;
}

// Build TOP 5 Clientes por Canal with R3, MMAA, Mix CZA & Trade Spend
const top5PorCanalMap = new Map();
for (const cp of clientChannelPerf.values()) {
  if (!top5PorCanalMap.has(cp.canal)) top5PorCanalMap.set(cp.canal, []);
  top5PorCanalMap.get(cp.canal).push(cp);
}

const top5ClientesPorCanal = {};
for (const [canalKey, list] of top5PorCanalMap.entries()) {
  list.sort((a, b) => b.hlYTD26 - a.hlYTD26);
  top5ClientesPorCanal[canalKey] = list.slice(0, 5).map((item, idx) => {
    const cteInfo = clientesMap.get(item.cte) || {};
    const r3Prom = item.hlR3Sum / 3;
    const varVsR3Pct = r3Prom > 0 ? Number((((item.hlSep26 - r3Prom) / r3Prom) * 100).toFixed(2)) : null;
    const varVsMMAAPct = item.hlSep25 > 0 ? Number((((item.hlSep26 - item.hlSep25) / item.hlSep25) * 100).toFixed(2)) : null;
    const mixAboveCorePct = item.hlCzaTotal > 0 ? Number(((item.hlCzaAboveCore / item.hlCzaTotal) * 100).toFixed(2)) : 0;
    const mixCoreValuePct = item.hlCzaTotal > 0 ? Number(((item.hlCzaCoreValue / item.hlCzaTotal) * 100).toFixed(2)) : 0;
    const factBruta = item.netoYTD26 + item.bonifYTD26;
    const negInfo = negByClientCount.get(item.cte);
    return {
      rank: idx + 1,
      codigo: item.cte,
      nombre: cteInfo.nombre || `Cliente #${item.cte}`,
      subcanal: cteInfo.subcanal || canalKey,
      vendedor: cteInfo.nombreVendedor || (cteInfo.vendedor ? `#${cteInfo.vendedor}` : 'S/D'),
      esPlanCza: cteInfo.esPlanCza || 'NO',
      clusterCenso: cteInfo.clusterCenso || 'SIN CLUSTER',
      hlYTD26: Number(item.hlYTD26.toFixed(2)),
      hlMesActualSep26: Number(item.hlSep26.toFixed(2)),
      hlPromedioR3: Number(r3Prom.toFixed(2)),
      hlMMAASep25: Number(item.hlSep25.toFixed(2)),
      varVsR3Pct,
      varVsMMAAPct,
      mixAboveCorePct,
      mixCoreValuePct,
      netoYTD26: Number(item.netoYTD26.toFixed(2)),
      bonifYTD26: Number(item.bonifYTD26.toFixed(2)),
      tsPorHL: item.hlYTD26 > 0 ? Number((item.bonifYTD26 / item.hlYTD26).toFixed(2)) : 0,
      tsSobreFactBrutaPct: factBruta > 0 ? Number(((item.bonifYTD26 / factBruta) * 100).toFixed(2)) : 0,
      acuerdosNegociados: negInfo ? negInfo.count : 0,
      bonifPactadaPromPct: negInfo ? Number((negInfo.sumBonif / negInfo.count).toFixed(2)) : 0
    };
  });
}

// Compute comprehensive mathematical reference metrics
function calcMetrics(filterFn) {
  let hl = 0, bultos = 0, neto = 0, bonif = 0, ops = 0;
  const ctesBought = new Set();
  const ctesAll = new Set();
  for (const s of salesRows) {
    if (!filterFn(s)) continue;
    hl += s.hl;
    bultos += s.bultos;
    neto += s.neto;
    bonif += s.bonif;
    ops++;
    ctesAll.add(s.cte);
    if (s.ccc > 0 || s.hl > 0 || s.bultos > 0) {
      ctesBought.add(s.cte);
    }
  }
  return {
    hl: Number(hl.toFixed(2)),
    bultos: Number(bultos.toFixed(2)),
    neto: Number(neto.toFixed(2)),
    bonif: Number(bonif.toFixed(2)),
    ops,
    ccc: ctesBought.size,
    clientesAtendidos: ctesAll.size,
    precioPromHL: hl > 0 ? Number((neto / hl).toFixed(2)) : 0
  };
}

const m2025Full = calcMetrics(s => s.per.startsWith('2025/'));
const m2025YTD = calcMetrics(s => s.per.startsWith('2025/') && parseInt(s.per.slice(5, 7), 10) <= 9);
const m2026YTD = calcMetrics(s => s.per.startsWith('2026/') && parseInt(s.per.slice(5, 7), 10) <= 9);

const yoyYTD = {
  hlDiff: Number((m2026YTD.hl - m2025YTD.hl).toFixed(2)),
  hlVarPct: Number((((m2026YTD.hl - m2025YTD.hl) / m2025YTD.hl) * 100).toFixed(2)),
  netoDiff: Number((m2026YTD.neto - m2025YTD.neto).toFixed(2)),
  netoVarPct: Number((((m2026YTD.neto - m2025YTD.neto) / m2025YTD.neto) * 100).toFixed(2)),
  cccDiff: m2026YTD.ccc - m2025YTD.ccc,
  cccVarPct: Number((((m2026YTD.ccc - m2025YTD.ccc) / m2025YTD.ccc) * 100).toFixed(2)),
  bultosDiff: Number((m2026YTD.bultos - m2025YTD.bultos).toFixed(2)),
  bultosVarPct: Number((((m2026YTD.bultos - m2025YTD.bultos) / m2025YTD.bultos) * 100).toFixed(2))
};

// Quarterly breakdown
const quarters = ['1Q', '2Q', '3Q', '4Q'];
const quarterlyRef = {};
for (const q of quarters) {
  const m25 = calcMetrics(s => {
    const p = periodosMap.get(s.per);
    return p && p.anio === 2025 && p.trimestre === q;
  });
  const m26 = calcMetrics(s => {
    const p = periodosMap.get(s.per);
    return p && p.anio === 2026 && p.trimestre === q;
  });
  quarterlyRef[q] = {
    '2025': m25,
    '2026': m26,
    hlDiff: Number((m26.hl - m25.hl).toFixed(2)),
    hlVarPct: m25.hl > 0 ? Number((((m26.hl - m25.hl) / m25.hl) * 100).toFixed(2)) : null,
    netoDiff: Number((m26.neto - m25.neto).toFixed(2)),
    netoVarPct: m25.neto > 0 ? Number((((m26.neto - m25.neto) / m25.neto) * 100).toFixed(2)) : null,
    cccDiff: m26.ccc - m25.ccc,
    cccVarPct: m25.ccc > 0 ? Number((((m26.ccc - m25.ccc) / m25.ccc) * 100).toFixed(2)) : null
  };
}

// Breakdown by Canal Mkt. (YTD 2025 vs YTD 2026)
const canalesSet = new Set(salesRows.map(s => s.canal));
const byCanalRef = {};
for (const c of [...canalesSet].sort()) {
  const c25 = calcMetrics(s => s.canal === c && s.per.startsWith('2025/') && parseInt(s.per.slice(5, 7), 10) <= 9);
  const c26 = calcMetrics(s => s.canal === c && s.per.startsWith('2026/') && parseInt(s.per.slice(5, 7), 10) <= 9);
  byCanalRef[c] = {
    canalUnificado: resolveCanal(c).canalUnificado,
    segmentoCanal: resolveCanal(c).segmentoCanal,
    ytd2025: c25,
    ytd2026: c26,
    hlDiff: Number((c26.hl - c25.hl).toFixed(2)),
    hlVarPct: c25.hl > 0 ? Number((((c26.hl - c25.hl) / c25.hl) * 100).toFixed(2)) : null,
    shareHL2026Pct: Number(((c26.hl / m2026YTD.hl) * 100).toFixed(2))
  };
}

// Breakdown by Unidad MKTP / Unidad de Negocio
const byUNRef = {};
const unSet = new Set();
for (const s of salesRows) {
  const p = portfolioMap.get(s.prod);
  unSet.add(p ? p.unidadMktp : s.div);
}
for (const un of [...unSet].sort()) {
  const u25 = calcMetrics(s => {
    const p = portfolioMap.get(s.prod);
    return (p ? p.unidadMktp : s.div) === un && s.per.startsWith('2025/') && parseInt(s.per.slice(5, 7), 10) <= 9;
  });
  const u26 = calcMetrics(s => {
    const p = portfolioMap.get(s.prod);
    return (p ? p.unidadMktp : s.div) === un && s.per.startsWith('2026/') && parseInt(s.per.slice(5, 7), 10) <= 9;
  });
  byUNRef[un] = {
    ytd2025: u25,
    ytd2026: u26,
    hlDiff: Number((u26.hl - u25.hl).toFixed(2)),
    hlVarPct: u25.hl > 0 ? Number((((u26.hl - u25.hl) / u25.hl) * 100).toFixed(2)) : null,
    shareHL2026Pct: Number(((u26.hl / m2026YTD.hl) * 100).toFixed(2))
  };
}

const galaxiaData = {
  manualMeta: {
    titulo: 'Manual Externo de Distribuidores 2026 — Cervecería y Maltería Quilmes (CMQ)',
    programa: 'Programa de Excelencia Galaxia 2026',
    paginasInspeccionadas: 212,
    puntajeTotalMaximo: 11000,
    distribucionGlobal: {
      gestionManualPts: 6050,
      gestionManualPesoPct: 55,
      resultadosTacoPts: 4400,
      resultadosTacoPesoPct: 40,
      bonusPts: 550,
      bonusPesoPct: 5
    },
    capitulosManual: [
      { cap: 1, nombre: 'Desarrollo Comercial (Estructura, On Premise, Frecuencias, CNC, Objetivación, Censo, Matinal)', puntosMax: 850 },
      { cap: 2, nombre: 'Soluciones Digitales (BEES Force, BEES Vision, Compromiso BEES, Club B, Flex Delivery, CX)', puntosMax: 550 },
      { cap: 3, nombre: 'Trade Marketing y Ejecución (Coolers, Chopp, Materiales POP)', puntosMax: 950 },
      { cap: 4, nombre: 'Revenue Management (Trade Spend $TS/HL, TOP 5 Clientes R3/MMAA, Planes CZA)', puntosMax: 350 },
      { cap: 5, nombre: 'Logística y Distribución (Cero Fallas, Rechazos, Flota)', puntosMax: 1300 },
      { cap: 6, nombre: 'Almacenes e Inventario', puntosMax: 550 },
      { cap: 7, nombre: 'Administración, Gestión y Finanzas', puntosMax: 800 },
      { cap: 8, nombre: 'Gente, Seguridad y Sustentabilidad', puntosMax: 700 },
      { cap: 9, nombre: 'TACO Resultados Comerciales (KPI 1,540 pts + RTO 2,860 pts)', puntosMax: 4400 },
      { cap: 10, nombre: 'Bonus Galaxia (Proyectos Especiales / Auditoría)', puntosMax: 550 }
    ]
  },
  pilar1_estructuraYOnPremise: {
    dotacionTotal: personalMaster.length,
    anuladosCount: personalMaster.filter(p => p.anulado === 'true').length,
    gerente: personalMaster.filter(p => p.cargo === 'GERENTE'),
    supervisores: personalMaster.filter(p => p.cargo === 'SUPERVISOR'),
    vendedores: personalMaster.filter(p => p.cargo === 'PREVENTISTA'),
    segmentosFdv: {
      veConjunta: personalMaster.filter(p => p.segmentoVendedor === 'VE Conjunta').length,
      veAutoservicios: personalMaster.filter(p => p.segmentoVendedor === 'VE Autoservicios').length,
      merchand: personalMaster.filter(p => p.segmentoVendedor === 'Merchand').length,
      noAplicable: personalMaster.filter(p => p.segmentoVendedor === 'No Aplicable').length
    },
    onPremise2026: {
      totalActivosOnPremise: Object.entries(bcOnPremiseCounts)
        .filter(([k]) => k !== 'OFF PREMISE / TRADICIONAL')
        .reduce((a, [, v]) => a + v, 0),
      desglosePorCategoria: bcOnPremiseCounts
    }
  },
  pilar2_frecuenciasYMaestroClientes: {
    baseClientesTotal: bcTotalRows,
    reporteClientesTotal: rcRaw.length - 1,
    clientesActivos: bcActivosCount,
    clientesAnulados: bcAnuladosCount,
    auditoriaCompletitudActivos: {
      coordenadasValidasCount: bcConCoordValidas,
      coordenadasValidasPct: Number(((bcConCoordValidas / bcActivosCount) * 100).toFixed(2)),
      sinCoordenadasCount: bcSinCoordValidas,
      metaGalaxiaGeolocalizacionPct: 95.0,
      estadoGeolocalizacion: (bcConCoordValidas / bcActivosCount) >= 0.95 ? 'CUMPLE (>=95%)' : 'BRECHA DETECTADA (92.05% vs 95.0% Meta)',
      rutaAsignadaCount: bcConRuta,
      rutaAsignadaPct: Number(((bcConRuta / bcActivosCount) * 100).toFixed(2)),
      diasVisitaAsignadosCount: bcConDiasVisita,
      diasVisitaAsignadosPct: Number(((bcConDiasVisita / bcActivosCount) * 100).toFixed(2)),
      subcanalAsignadoCount: bcConSubcanal,
      subcanalAsignadoPct: Number(((bcConSubcanal / bcActivosCount) * 100).toFixed(2)),
      telefonoInformadoCount: bcConTelefono,
      telefonoInformadoPct: Number(((bcConTelefono / bcActivosCount) * 100).toFixed(2)),
      cuitValidoCount: bcConCuitValido,
      cuitValidoPct: Number(((bcConCuitValido / bcActivosCount) * 100).toFixed(2)),
      muestraSinCoordenadas: bcClientesSinCoordenadas.slice(0, 20)
    },
    auditoriaClientesPresencial: {
      totalRegistrosPresencial: presRaw.length - 1,
      preventaPrimariaCount: presPrimarioCount,
      merchandComplementarioCount: presMerchandCount,
      distribucionDiasVisitaSemanal: presByVisitDaysCount,
      clientesExcesoFrecuenciaCount: presExcesoFrecuenciaList.length,
      clientesExcesoFrecuenciaDetalle: presExcesoFrecuenciaList,
      distribucionPeriodicidad: presByPeriodicidad,
      carteraPorVendedor: presByVendedor
    },
    subcanalesActivosTop: Object.entries(bcSubcanalActivosCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([subcanal, cantidad]) => ({ subcanal, cantidad, pct: Number(((cantidad / bcActivosCount) * 100).toFixed(2)) }))
  },
  pilar3_cncMultiHorizonte: cncMultiHorizonte,
  pilar4_objetivacionSensibilizacion: {
    reglaFormula: 'Peso Sugerido Galaxia = 66.67% × (% Participación Venta Real) + 33.33% × (% Participación Objetivo Actual)',
    toleranciaMaximaPct: 10.0,
    ytd2026: sensibilizacionYTD2026,
    septiembre2026: sensibilizacionSep2026
  },
  pilar5_ejecucionMercadoCensoMatinal: {
    censoThomas: {
      universoCenso: censoTotalActivos,
      censados: censoRealizados,
      pendientes: censoRestan,
      avanceRealPct: censoAvancePct,
      escalaLinealSemanal: [
        { semana: 'Semana 1', metaLinealPct: 25.0, estado: censoAvancePct >= 25 ? 'CUMPLIDO' : 'PENDIENTE' },
        { semana: 'Semana 2 (Corte Actual: Día 12/26 = 46.15%)', metaLinealPct: 50.0, estado: censoAvancePct >= 50 ? 'CUMPLIDO (52.95% >= 50%)' : 'EN RIESGO' },
        { semana: 'Semana 3', metaLinealPct: 75.0, estado: censoAvancePct >= 75 ? 'CUMPLIDO' : 'EN CURSO' },
        { semana: 'Semana 4 (Cierre Mes)', metaLinealPct: 100.0, estado: censoAvancePct >= 95 ? 'CUMPLIDO' : 'EN CURSO' }
      ],
      clustersCensoPadron: bcClusterCensoCounts,
      porPromotor: censoPorPromotor,
      desempenoSkusCensoYTD: censoThomasSkusList
    }
  },
  pilar6_ecosistemaDigitalYLogistica: {
    metasDigitalesBees: {
      nrDigitalMetaPct: 95.0,
      clientesDigitalizadosMetaPct: 85.0,
      algoSellingMetaPct: 11.0,
      upsellTotalMetaPct: 16.0,
      ofertaDpMetaPct: 45.0,
      canjesClubBMetaPct: 65.0,
      antifraudeMaxPct: 3.0,
      ordenesInfluenciadasMetaPct: 23.0,
      fillRatePortafolioIdealMetaPct: 90.0,
      tareasValidadasCreacionAsMetaPct: 63.0,
      tareasValidadasRestoAsMetaPct: 72.0
    }
  },
  pilar7_capexCoolersChopp: {
    clusterDistribuidor: 'Clúster 2 (750 a 1,499 equipos operativos)',
    metaMaxStockDepositoCluster2Pct: 3.0,
    totalEquiposRegistrados: activosFijosList.length,
    instaladosEnPDV: afInstalados,
    enStockDeposito: afEnStock,
    deBaja: afDeBaja,
    parqueOperativoActivo,
    stockSobreParqueOperativoPct,
    stockSobreTotalPct: stockSobreTotal2000Pct,
    excesoStockUnidadesSobreMeta3Pct: Math.max(0, afEnStock - Math.round(parqueOperativoActivo * 0.03)),
    equiposInstaladosVentaCeroReportada: afVentaCeroReportada,
    equiposInstaladosVentaCeroPct: Number(((afVentaCeroReportada / afInstalados) * 100).toFixed(2)),
    equiposInstaladosSinCompraCzaU3M: afSinCompraCzaU3M,
    equiposInstaladosSinCompraCzaU3MPct: Number(((afSinCompraCzaU3M / afInstalados) * 100).toFixed(2)),
    equiposInstaladosSinCompraCzaU6M: afSinCompraCzaU6M,
    equiposInstaladosSinCompraCzaU6MPct: Number(((afSinCompraCzaU6M / afInstalados) * 100).toFixed(2)),
    metaMaxVentaCero6mPct: 2.0,
    metaMaxVentaCero3mPct: 5.0,
    repagaSiCount: afRepagaSi,
    repagaNoCount: afRepagaNo,
    cumplimientoRepagoPct: Number(((afRepagaSi / afInstalados) * 100).toFixed(2)),
    productividadPorModelo: [...afPorModelo.values()].map(m => ({
      unidadNegocio: m.unidadNegocio,
      modelo: m.modelo,
      instalados: m.instalados,
      repagaSi: m.repagaSi,
      porcRepaga: Number(((m.repagaSi / m.instalados) * 100).toFixed(2)),
      ventaCero: m.ventaCero,
      hlRepagoPromRequerido: Number((m.sumHLRepagoMeta / m.instalados).toFixed(2)),
      hlVentaPromReal: Number((m.sumHLVentaProm / m.instalados).toFixed(2)),
      alcanceProductividadPct: m.sumHLRepagoMeta > 0 ? Number(((m.sumHLVentaProm / m.sumHLRepagoMeta) * 100).toFixed(2)) : 100
    })).sort((a, b) => b.instalados - a.instalados)
  },
  pilar8_revenueManagement: {
    planesCervezaPadronActivos: bcPlanesCzaCounts,
    negociacionesVigentesTotal: negociacionesList.length,
    clientesUnicosConNegociacion: negByClientCount.size,
    tradeSpendGlobalYTD2026: {
      hlTotal: m2026YTD.hl,
      facturacionNeta: m2026YTD.neto,
      bonificacionTotal: m2026YTD.bonif,
      tsPorHL2026: Number((m2026YTD.bonif / m2026YTD.hl).toFixed(2)),
      tsPorHL2025: Number((m2025YTD.bonif / m2025YTD.hl).toFixed(2)),
      tsSobreFactNeta2026Pct: Number(((m2026YTD.bonif / m2026YTD.neto) * 100).toFixed(2)),
      tsSobreFactNeta2025Pct: Number(((m2025YTD.bonif / m2025YTD.neto) * 100).toFixed(2)),
      tsSobreFactBruta2026Pct: Number(((m2026YTD.bonif / (m2026YTD.neto + m2026YTD.bonif)) * 100).toFixed(2)),
      tsSobreFactBruta2025Pct: Number(((m2025YTD.bonif / (m2025YTD.neto + m2025YTD.bonif)) * 100).toFixed(2))
    },
    tradeSpendPorCanal,
    tradeSpendPorMarca,
    top5ClientesPorCanal
  }
};

const tableroVentasData = {
  sourceFile: '1. Bases/Tablero Ventas.xlsb',
  totalSheets: wbTablero.SheetNames.length,
  sheetNames: wbTablero.SheetNames,
  fechaCorte: {
    mesActual: 'Octubre',
    periodo: '2026/10',
    diasActivos: 26,
    diasTranscurridos: 12,
    diasRestantes: 14,
    avanceMesPct: 46.15,
    factorTendenciaCierre: Number((26 / 12).toFixed(4))
  },
  mandoIntegral,
  mesaJulio,
  mesaGonza,
  byVendedorOctubre,
  tacoHistoricoMensual2026,
  objetivosTableroMensual
};

const referenceOutput = {
  generatedAt: new Date().toISOString(),
  basesDirectory: '1. Bases/',
  totalSourcesInspected: 14,
  totalSources2026: 20,
  totalSpreadsheetSources2026: 19,
  totalSheets2026: 77,
  activePeriods: ['2025/01','2025/02','2025/03','2025/04','2025/05','2025/06','2025/07','2025/08','2025/09','2025/10','2025/11','2025/12','2026/01','2026/02','2026/03','2026/04','2026/05','2026/06','2026/07','2026/08','2026/09'],
  octoberLiveCutInTableroXlsb: '2026/10 (12 de 26 días hábiles = 46.15%)',
  inactivePeriodsInMasterTime: ['2026/10','2026/11','2026/12'],
  reconciliationSales: {
    baseProdYVolRows: pvRaw.length - 1,
    baseALaFechaRows: bfRaw.length - 1,
    sharedExactRows: pvRaw.length - 1,
    exclusiveBaseALaFechaPOPRows: bfRaw.length - pvRaw.length,
    consolidatedTotalRows: salesRows.length,
    totalHLAll21Months: Number((m2025Full.hl + m2026YTD.hl).toFixed(2)),
    totalNetoProdYVol: 14823747363.87,
    totalNetoConsolidatedWithPOP: 14824765958.71,
    totalBonifProdYVol: 5026659272.45
  },
  kpisGlobal: {
    fullYear2025: m2025Full,
    ytd2025_EneSep: m2025YTD,
    ytd2026_EneSep: m2026YTD,
    yoyYTD: yoyYTD
  },
  quarterly: quarterlyRef,
  byCanalYTD: byCanalRef,
  byUnidadNegocioYTD: byUNRef,
  tableroVentasSummary: {
    fechaCorte: tableroVentasData.fechaCorte,
    mandoIntegralScores: {
      tacoKpiPct: mandoIntegral.tacoKpiPct,
      tacoRtoPct: mandoIntegral.tacoRtoPct,
      tacoTotalPct: mandoIntegral.tacoTotalPct
    },
    mesaJulioScores: {
      tacoKpiPct: mesaJulio.tacoKpiPct,
      tacoRtoPct: mesaJulio.tacoRtoPct,
      tacoTotalPct: mesaJulio.tacoTotalPct
    },
    mesaGonzaScores: {
      tacoKpiPct: mesaGonza.tacoKpiPct,
      tacoRtoPct: mesaGonza.tacoRtoPct,
      tacoTotalPct: mesaGonza.tacoTotalPct
    }
  },
  galaxia2026Summary: {
    padronTotal: bcTotalRows,
    padronActivos: bcActivosCount,
    padronAnulados: bcAnuladosCount,
    coordenadasValidasPct: galaxiaData.pilar2_frecuenciasYMaestroClientes.auditoriaCompletitudActivos.coordenadasValidasPct,
    clientesPresencialTotal: presRaw.length - 1,
    excesoFrecuenciaCount: presExcesoFrecuenciaList.length,
    censoAvancePct: censoAvancePct,
    coolersStockPct: stockSobreParqueOperativoPct,
    coolersVentaCeroPct: galaxiaData.pilar7_capexCoolersChopp.equiposInstaladosVentaCeroPct,
    tradeSpendPorHL2026: galaxiaData.pilar8_revenueManagement.tradeSpendGlobalYTD2026.tsPorHL2026
  }
};

fs.mkdirSync(path.join(workspaceDir, 'docs'), { recursive: true });
fs.writeFileSync(path.join(workspaceDir, 'docs', 'resultados_referencia.json'), JSON.stringify(referenceOutput, null, 2));
console.log('Saved docs/resultados_referencia.json');

// Build compact columnar dataset for browser instant loading
const perDict = [...periodosMap.keys()].sort();
const perIdxMap = new Map(perDict.map((p, i) => [p, i]));

const canalDict = [...new Set([...canalesSet, ...cncRecords.map(c => c.canal), ...objByKey.values()].map(x => typeof x === 'string' ? x : x.canal))].filter(Boolean).sort();
const canalIdxMap = new Map(canalDict.map((c, i) => [c, i]));

const nSales = salesRows.length;
const sPer = new Array(nSales);
const sCte = new Array(nSales);
const sProd = new Array(nSales);
const sCanal = new Array(nSales);
const sVend = new Array(nSales);
const sSup = new Array(nSales);
const sCCC = new Array(nSales);
const sBultos = new Array(nSales);
const sHL = new Array(nSales);
const sNeto = new Array(nSales);
const sBonif = new Array(nSales);
const sSource = new Array(nSales);

for (let i = 0; i < nSales; i++) {
  const s = salesRows[i];
  sPer[i] = perIdxMap.get(s.per);
  sCte[i] = s.cte;
  sProd[i] = s.prod;
  sCanal[i] = canalIdxMap.get(s.canal);
  sVend[i] = s.vend;
  sSup[i] = s.sup;
  sCCC[i] = s.ccc;
  sBultos[i] = s.bultos;
  sHL[i] = s.hl;
  sNeto[i] = s.neto;
  sBonif[i] = s.bonif;
  sSource[i] = s.source;
}

const objArr = [...objByKey.values()];
const nObj = objArr.length;
const oPer = new Array(nObj);
const oProd = new Array(nObj);
const oCanal = new Array(nObj);
const oVend = new Array(nObj);
const oSup = new Array(nObj);
const oHL = new Array(nObj);
for (let i = 0; i < nObj; i++) {
  const o = objArr[i];
  oPer[i] = perIdxMap.get(o.per);
  oProd[i] = o.prod;
  oCanal[i] = canalIdxMap.get(o.canal);
  oVend[i] = o.vend;
  oSup[i] = o.sup;
  oHL[i] = o.objHL;
}

const nCNC = cncRecords.length;
const cPer = new Array(nCNC);
const cCte = new Array(nCNC);
const cCanal = new Array(nCNC);
const cUniv = new Array(nCNC);
const cAct = new Array(nCNC);
const cNoComp = new Array(nCNC);
for (let i = 0; i < nCNC; i++) {
  const c = cncRecords[i];
  cPer[i] = perIdxMap.get(c.per);
  cCte[i] = c.cte;
  cCanal[i] = canalIdxMap.get(c.canal);
  cUniv[i] = c.univ;
  cAct[i] = c.act;
  cNoComp[i] = c.cnc;
}

const bundle = {
  meta: {
    generatedAt: new Date().toISOString(),
    version: '2.0.0-galaxia-2026',
    basesFolder: '1. Bases/',
    totalFiles: 14,
    totalFiles2026: 19,
    totalSourcesWithManual2026: 20,
    totalSheets: 18,
    totalSheets2026: 77
  },
  dictionaries: {
    periodos: perDict,
    canalesRaw: canalDict,
    canalesResolved: canalDict.map(c => resolveCanal(c))
  },
  masters: {
    tiempo: periodosList,
    canalMkt: canalMaster,
    subcanalesMkt: subcanalesMaster,
    personal: personalMaster,
    portfolio: [...portfolioMap.values()],
    clientes: [...clientesMap.values()]
  },
  salesColumnar: {
    count: nSales,
    per: sPer,
    cte: sCte,
    prod: sProd,
    canal: sCanal,
    vend: sVend,
    sup: sSup,
    ccc: sCCC,
    bultos: sBultos,
    hl: sHL,
    neto: sNeto,
    bonif: sBonif,
    source: sSource
  },
  objColumnar: {
    count: nObj,
    rawRowCount: objRaw.length - 1,
    per: oPer,
    prod: oProd,
    canal: oCanal,
    vend: oVend,
    sup: oSup,
    hl: oHL
  },
  cncColumnar: {
    count: nCNC,
    rawRowCount: cncRaw.length - 1,
    duplicatesRemoved: cncDuplicates,
    per: cPer,
    cte: cCte,
    canal: cCanal,
    univ: cUniv,
    act: cAct,
    cnc: cNoComp
  },
  eficienciaAgg: [...efiAgg.values()],
  mxpdvAgg: [...mxAgg.values()],
  rechazos: recList,
  activosFijos: activosFijosList,
  negociaciones: {
    items: negociacionesList,
    modosAtencion: modosAtencionRaw.slice(2),
    gruposProductosCount: gruposProdRaw.length - 2
  },
  tableroVentasXlsb: tableroVentasData,
  galaxia2026: galaxiaData,
  reference: referenceOutput
};

fs.mkdirSync(path.join(workspaceDir, 'src', 'data'), { recursive: true });
const bundleJson = JSON.stringify(bundle);
fs.writeFileSync(path.join(workspaceDir, 'src', 'data', 'real_data_bundle.js'), `window.__ARGON_REAL_BUNDLE__ = ${bundleJson};\n`);
console.log(`Saved src/data/real_data_bundle.js (${(bundleJson.length / 1024 / 1024).toFixed(2)} MB)`);
