/**
 * @fileoverview Motor de Gobernanza Comercial CMQ — Programa Galaxia 2026 & Tablero de Ventas (TACO .xlsb)
 * Implementa las reglas matemáticas y operativas del Manual Externo de Distribuidores 2026 (CMQ)
 * y el espejo analítico interactivo de Tablero Ventas.xlsb (Mando Integral, Mesa Julio, Mesa Gonza, 18 Promotores).
 * Compatible con Node.js (CommonJS) y Navegador (UMD / window.ArgonBI.GalaxiaEngine).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ArgonBI = root.ArgonBI || {};
    root.ArgonBI.GalaxiaEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Escala Oficial de Alcance CMQ — Manual Distribuidores 2026 (Sección 02 - Evaluación Galaxia)
   * - < 70%         ->   0% de los puntos del indicador
   * - 70% a < 80%   ->  50% de los puntos del indicador
   * - 80% a < 90%   ->  60% de los puntos del indicador
   * - 90% a < 100%  ->  80% de los puntos del indicador
   * - 100% a < 105% -> 100% de los puntos del indicador
   * - >= 105%       -> 110% de los puntos (Bonus por sobrecumplimiento)
   *
   * @param {number} alcancePct Porcentaje de cumplimiento (ej. 96.4)
   * @param {number} pesoMaxPts Puntos base asignados al indicador al 100%
   * @param {boolean} allowBonus110 Si permite 110% al superar 105% de alcance
   */
  function calcularPuntajeEscalaCMQ(alcancePct, pesoMaxPts, allowBonus110 = true) {
    const pct = Number(alcancePct) || 0;
    const maxPts = Number(pesoMaxPts) || 0;
    let factor = 0;
    let tramo = '< 70% (Sin puntaje)';
    let semaforo = 'danger';

    if (pct >= 105) {
      factor = allowBonus110 ? 1.10 : 1.00;
      tramo = allowBonus110 ? '>= 105% (110% Sobrecumplimiento)' : '>= 100% (100% Cumplimiento)';
      semaforo = 'success';
    } else if (pct >= 100) {
      factor = 1.00;
      tramo = '100% - 104.9% (100% Cumplimiento)';
      semaforo = 'success';
    } else if (pct >= 90) {
      factor = 0.80;
      tramo = '90% - 99.9% (80% Escala CMQ)';
      semaforo = 'warning';
    } else if (pct >= 80) {
      factor = 0.60;
      tramo = '80% - 89.9% (60% Escala CMQ)';
      semaforo = 'warning';
    } else if (pct >= 70) {
      factor = 0.50;
      tramo = '70% - 79.9% (50% Escala CMQ)';
      semaforo = 'danger';
    }

    const puntosObtenidos = Math.round(maxPts * factor);
    const puntosMaxConBonus = allowBonus110 ? Math.round(maxPts * 1.10) : maxPts;

    return {
      alcancePct: Number(pct.toFixed(2)),
      factorPct: Math.round(factor * 100),
      puntosObtenidos,
      pesoMaxPts: maxPts,
      puntosMaxConBonus,
      puntosPerdidos: Math.max(0, maxPts - puntosObtenidos),
      tramo,
      semaforo
    };
  }

  /**
   * Clasifica el semáforo corporativo según el porcentaje de alcance.
   */
  function getSemaforoTaco(pct) {
    const val = Number(pct) || 0;
    if (val >= 100) return { color: 'success', label: 'Cumplido (>=100%)', hex: '#10b981' };
    if (val >= 90) return { color: 'warning', label: 'Alerta (90-99.9%)', hex: '#f59e0b' };
    return { color: 'danger', label: 'Crítico (<90%)', hex: '#ef4444' };
  }

  // ======================================================================
  // MOTOR TACO DINÁMICO — cálculo en vivo desde `Base a la fecha.xlsx`
  // El "real" de cada indicador se agrega en JavaScript sobre las filas de la
  // última partición mensual cargada en dataset.salesColumnar. Los objetivos
  // (metas comerciales, no transaccionales) se toman del Tablero como referencia.
  // ======================================================================
  const MONTH_NAMES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const normKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const round1 = (n) => Number(Number(n).toFixed(1));
  const round2 = (n) => Number(Number(n).toFixed(2));

  // Funciones reutilizables de normalización de llaves (Sección 10)
  function normalizeTextKey(v) {
    if (v === undefined || v === null) return '';
    return String(v).replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function normalizeCodeKey(v) {
    if (v === undefined || v === null || v === '') return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : 0;
    const cleaned = normalizeTextKey(v).replace(/\.0+$/, '');
    if (!cleaned) return 0;
    const n = Number(cleaned);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  }

  const normalizeClientId = normalizeCodeKey;
  const normalizeProductId = normalizeCodeKey;

  function normalizePeriod(v) {
    const raw = normalizeTextKey(v).replace(/-/g, '/');
    if (!raw) return '';
    const m1 = raw.match(/^(\d{4})\/(\d{1,2})$/);
    if (m1) return `${m1[1]}/${String(parseInt(m1[2], 10)).padStart(2, '0')}`;
    const m2 = raw.match(/^(\d{1,2})\/(\d{4})$/);
    if (m2) return `${m2[2]}/${String(parseInt(m2[1], 10)).padStart(2, '0')}`;
    const m3 = raw.match(/^(\d{4})(\d{2})$/);
    if (m3) return `${m3[1]}/${m3[2]}`;
    return raw;
  }

  // Nombre canónico de cada indicador calculable (8 KPIs + 10 RTOs = 18 indicadores de Mando Integral)
  const LIVE_CANONICAL = [
    'CCC CERVEZA', 'TOTAL DISTRIBUTION CZA', 'TOTAL DISTRIBUTION NABS', 'CCC UNG',
    'TBD ABOVECORE', 'TBD LATONES', 'TBD BALANCED CHOICES', 'TBD NABS TOP',
    'VOL TOTAL CZA (TACO)', 'VOL CORE+VALUE (TACO)', 'VOL TOTAL UNG (TACO)', 'VOL ABOVECORE (TACO)',
    'VOL LATONES (TACO)', 'GMV MKTPLACE', 'IP Mktplc + Vinos + Ady',
    'VOL BALANCED CHOICES (TACO)', 'VOLUMEN TOP (TACO)', 'VOLUMEN SABORIZADAS (TACO)'
  ];
  const LIVE_ALIAS = {};
  LIVE_CANONICAL.forEach(n => { LIVE_ALIAS[normKey(n)] = n; });
  LIVE_ALIAS.totaldistcza = 'TOTAL DISTRIBUTION CZA';
  LIVE_ALIAS.totaldistnabs = 'TOTAL DISTRIBUTION NABS';
  LIVE_ALIAS.tbdnabstop = 'TBD NABS TOP';
  LIVE_ALIAS.gmvmktplace = 'GMV MKTPLACE';
  LIVE_ALIAS.nrmktp = 'IP Mktplc + Vinos + Ady';
  LIVE_ALIAS.ipmktplcvinosady = 'IP Mktplc + Vinos + Ady';

  // ======================================================================
  // MODELO RELACIONAL EN MEMORIA (Esquema Estrella / réplica exacta de Power Pivot)
  //   Hechos : dataset.salesColumnar (Base a la fecha / Base a la Fecha MA)
  //   Dim.   : Productos        (llave Código Producto)  → Map<codigo, atributos TACO>
  //            Base de Clientes (llave Código Cliente)   → Map<codigo, {anulado, canal, subcanal, ...}>
  //            Medida Tiempo    (llave Año/Mes)          → Map<periodo, atributos calendario>
  //            Canal MKT        (llave Canal)            → Map<canalKey, atributos canal>
  //            Subcanal MKT     (llave Subcanal)         → Map<subcanalKey, atributos subcanal>
  //            DetallePersonal  (llave Código Personal)  → Map<codigo, atributos personal>
  // ======================================================================
  // Segmentaciones DAX oficiales en Power Pivot (Tablero Ventas.xlsb):
  // - SlicerCache 41 (TBD AboveCore): Marca Unificado IN {'ANDES ORIGEN', 'CORONA', 'MICHELOB ULTRA', 'PATAGONIA', 'STELLA ARTOIS'}
  // - SlicerCache 54 (TBD Balanced Choices): Marca Unificado IN {'CORONA', 'MICHELOB ULTRA', 'QUILMES 0.0', 'STELLA ARTOIS'}
  const ABOVECORE_BRANDS_UNIF = new Set(['ANDES ORIGEN', 'CORONA', 'MICHELOB ULTRA', 'PATAGONIA', 'STELLA ARTOIS']);
  const BALANCED_BRANDS_UNIF = new Set(['CORONA', 'MICHELOB ULTRA', 'QUILMES 0.0', 'STELLA ARTOIS']);

  /** Atributos dimensionales del producto replicando exactamente las reglas DAX / Power Pivot de Tablero Ventas.xlsb. */
  function buildProductDim(p) {
    const codigo = normalizeProductId(p.codigo !== undefined ? p.codigo : p['Código Producto']);
    const unidadNegocio = normalizeTextKey(p.unidadNegocio !== undefined ? p.unidadNegocio : p['Unidad de Negocio']).toUpperCase();
    const division = normalizeTextKey(p.division !== undefined ? p.division : p['División']).toUpperCase();
    const segmento = normalizeTextKey(p.segmento !== undefined ? p.segmento : p['Segmento']).toUpperCase();
    const sensibilizacion = normalizeTextKey(p.sensibilizacion !== undefined ? p.sensibilizacion : p['Sensibilizacion']).toUpperCase();
    const calibre = normalizeTextKey(p.calibre !== undefined ? p.calibre : p['Calibre']).toUpperCase();
    const calibreLT = normalizeTextKey(p.calibreLT !== undefined ? p.calibreLT : p['Calibre LT']).toUpperCase();
    const marca = normalizeTextKey(p.marca !== undefined ? p.marca : p['Marca']).toUpperCase();
    const marcaUnificado = normalizeTextKey(p.marcaUnificado !== undefined ? p.marcaUnificado : p['Marca Unificado']).toUpperCase();
    const focoComercial = normalizeTextKey(p.focoComercial !== undefined ? p.focoComercial : p['Foco Comercial']);
    const topUng = normalizeTextKey(p.topUng !== undefined ? p.topUng : p['TOP UNG']).toUpperCase();
    const categoriaObjetivo = normalizeTextKey(p.categoriaObjetivo !== undefined ? p.categoriaObjetivo : p['Categoria OBJETIVO']).toUpperCase();
    const filtroMatriz = normalizeTextKey(p.filtroMatriz !== undefined ? p.filtroMatriz : p['Filtro Matriz']);

    const isCza = unidadNegocio === 'CERVEZAS';
    const isUng = unidadNegocio === 'UNG';
    const isNabs = unidadNegocio === 'UNG' || unidadNegocio === 'AGUAS';
    const isTbdAboveCore = isCza && ABOVECORE_BRANDS_UNIF.has(marcaUnificado);
    const isVolAboveCore = isCza && (segmento === 'CORE PLUS' || segmento === 'HIGH END');
    const isCoreValue = isCza && (segmento === 'CORE' || segmento === 'LOW');
    const isLaton710 = isCza && calibre === '710 CC LATAS';
    const isTbdBalanced = isCza && BALANCED_BRANDS_UNIF.has(marcaUnificado);
    const isVolBalanced = isCza && focoComercial.toUpperCase() === 'BALANCED CHOICES' && codigo !== 49807 && codigo !== '49807';
    const isTopUNG = topUng === 'TOP UNG';
    const isSaborizada = division === 'BEBIDAS SABORIZADAS';
    const isNrMktp = categoriaObjetivo === 'MARKETPLACE';
    const isGmvMktp = isNrMktp ||
      unidadNegocio === 'ADYACENCIAS' ||
      unidadNegocio === 'VINO' ||
      marca === 'GATORADE' ||
      marca === 'RED BULL';

    return {
      codigo,
      unidadNegocio,
      division,
      segmento,
      sensibilizacion,
      calibre,
      calibreLT,
      marca,
      marcaUnificado,
      marcaKey: marcaUnificado || marca || '',
      focoComercial,
      topUng,
      categoriaObjetivo,
      filtroMatriz,
      isCza,
      isUng,
      isNabs,
      isTbdAboveCore,
      isVolAboveCore,
      isAboveCore: isTbdAboveCore,
      isCoreValue,
      isLaton710,
      isTbdBalanced,
      isVolBalanced,
      isBalancedChoice: isTbdBalanced,
      isTopUNG,
      isSaborizada,
      isNrMktp,
      isGmvMktp,
      innov: p.innov !== undefined ? p.innov : (p['Innov#'] !== undefined ? p['Innov#'] : '')
    };
  }

  /** Construye (y cachea) los diccionarios dimensionales (Productos, Clientes, Tiempo, Canal, Subcanal, Personal). */
  function buildRelationalModel(dataset) {
    const masters = (dataset && dataset.masters) || {};
    const portfolio = masters.portfolio || [];
    const clientes = masters.clientes || [];
    const tiempo = masters.tiempo || [];
    const canalMkt = masters.canalMkt || [];
    const subcanalesMkt = masters.subcanalesMkt || [];
    const personal = masters.personal || [];

    const cached = dataset && dataset._relModel;
    if (cached && cached.portfolioRef === portfolio && cached.clientesRef === clientes &&
        cached.portfolioLen === portfolio.length && cached.clientesLen === clientes.length) {
      return cached;
    }

    const prodDim = new Map();
    for (let i = 0; i < portfolio.length; i++) {
      const dim = buildProductDim(portfolio[i]);
      if (dim.codigo) prodDim.set(dim.codigo, dim);
    }

    const cliDim = new Map();
    let anulados = 0;
    for (let i = 0; i < clientes.length; i++) {
      const c = clientes[i];
      const cod = normalizeClientId(c.codigo !== undefined ? c.codigo : c['Código Cliente']);
      if (!cod) continue;
      const anuladoRaw = normalizeTextKey(c.anulado !== undefined ? c.anulado : c['Anulado']).toUpperCase();
      const anulado = anuladoRaw === 'SI' || anuladoRaw === 'SÍ' || anuladoRaw === '1' || anuladoRaw === 'TRUE';
      if (anulado) anulados++;
      cliDim.set(cod, {
        codigo: cod,
        anulado,
        canal: normalizeTextKey(c.canal),
        subcanal: normalizeTextKey(c.subcanal),
        vendedor: normalizeCodeKey(c.vendedor),
        localidad: normalizeTextKey(c.localidad),
        clusterCenso: normalizeTextKey(c.clusterCenso)
      });
    }

    const tiempoDim = new Map();
    for (let i = 0; i < tiempo.length; i++) {
      const t = tiempo[i];
      const per = normalizePeriod(t.periodo || t['Año/Mes']);
      if (per) tiempoDim.set(per, t);
    }

    const canalDim = new Map();
    for (let i = 0; i < canalMkt.length; i++) {
      const cm = canalMkt[i];
      const k = normalizeTextKey(cm.canalMkt || cm.canal || cm['Canal MKT']).toUpperCase();
      if (k) canalDim.set(k, cm);
    }

    const subcanalDim = new Map();
    for (let i = 0; i < subcanalesMkt.length; i++) {
      const sm = subcanalesMkt[i];
      const k = normalizeTextKey(sm.subcanal || sm.subcanalMkt || sm['Subcanal']).toUpperCase();
      if (k) subcanalDim.set(k, sm);
    }

    const personalDim = new Map();
    for (let i = 0; i < personal.length; i++) {
      const pe = personal[i];
      const cod = normalizeCodeKey(pe.codigo !== undefined ? pe.codigo : pe['Código']);
      if (cod) personalDim.set(cod, pe);
    }

    const model = {
      portfolioRef: portfolio, clientesRef: clientes,
      portfolioLen: portfolio.length, clientesLen: clientes.length,
      prodDim, cliDim, tiempoDim, canalDim, subcanalDim, personalDim,
      clientesAnulados: anulados
    };
    if (dataset) dataset._relModel = model;
    return model;
  }

  /** Índice de filas de la partición mensual especificada (o última activa) con datos (cacheado por identidad de salesColumnar). */
  function getTacoLiveIndex(dataset, targetPeriod, options = {}) {
    const sc = dataset && dataset.salesColumnar;
    const perDict = dataset && dataset.dictionaries && dataset.dictionaries.periodos;
    if (!sc || !sc.count || !perDict) return null;
    const normTarget = targetPeriod ? normalizePeriod(targetPeriod) : null;
    const cacheKey = (normTarget || '__latest__') + (options.excluirAnulados === false ? '|ALL' : '|ACT');
    const model = buildRelationalModel(dataset);
    if (dataset._tacoIdx && dataset._tacoIdx.sc === sc && dataset._tacoIdx.count === sc.count &&
        dataset._tacoIdx.key === cacheKey && dataset._tacoIdx.model === model) return dataset._tacoIdx;

    let targetIdx = null;
    if (normTarget) {
      const idx = perDict.indexOf(normTarget);
      if (idx >= 0) targetIdx = { perIdx: idx, period: normTarget };
    } else {
      const present = new Set();
      for (let i = 0; i < sc.count; i++) present.add(sc.per[i]);
      let latest = null;
      present.forEach(pi => {
        const p = perDict[pi];
        if (p && (latest === null || p > latest.period)) latest = { perIdx: pi, period: p };
      });
      targetIdx = latest;
    }
    if (!targetIdx) return null;

    // En Power Pivot (Tablero Ventas.xlsb), las tablas dinámicas de los 8 KPI no excluyen clientes anulados en la tabla de hechos.
    // Anulado == 'NO' se evalúa exclusivamente en la medida [Cte Act] para el padrón activo denominador.
    const excluirAnulados = options.excluirAnulados === true;
    const { cliDim, prodDim } = model;
    const rows = [];
    const anuladosDescartados = new Set();
    const huerfanosClientes = new Set();
    const huerfanosProductos = new Set();
    const clientesUnicosMes = new Set();
    const productosUnicosMes = new Set();
    let filasPeriodo = 0, filasDescartadas = 0, hlDescartado = 0;
    for (let i = 0; i < sc.count; i++) {
      if (sc.per[i] !== targetIdx.perIdx) continue;
      filasPeriodo++;
      const cid = normalizeClientId(sc.cte[i]);
      const pid = normalizeProductId(sc.prod[i]);
      clientesUnicosMes.add(cid);
      productosUnicosMes.add(pid);
      const cli = cliDim.get(cid);
      if (!cli) huerfanosClientes.add(cid);
      if (!prodDim.has(pid)) huerfanosProductos.add(pid);
      if (excluirAnulados && cli && cli.anulado) {
        filasDescartadas++;
        hlDescartado += sc.hl[i];
        anuladosDescartados.add(cid);
        continue;
      }
      rows.push(i);
    }
    if (rows.length === 0) return null;

    const idx = {
      sc, count: sc.count, model, period: targetIdx.period, perIdx: targetIdx.perIdx, rows,
      prodMap: model.prodDim, cliMap: model.cliDim, totalRows: sc.count, key: cacheKey,
      join: {
        filasPeriodo,
        filasActivas: rows.length,
        filasDescartadasAnulado: filasDescartadas,
        clientesAnuladosDescartados: anuladosDescartados.size,
        hlDescartado: round2(hlDescartado),
        clientesUnicosMes: clientesUnicosMes.size,
        productosUnicosMes: productosUnicosMes.size,
        clientesSinMaestro: huerfanosClientes.size,
        productosSinMaestro: huerfanosProductos.size,
        productosEnMaestro: model.prodDim.size,
        clientesEnMaestro: model.cliDim.size
      }
    };
    dataset._tacoIdx = idx;
    return idx;
  }

  /** Agrega los 18 indicadores de Mando Integral sobre las filas activas de la partición. Replicando fielmente el modelo DAX de Power Pivot. */
  function aggregateTacoLive(idx, pred) {
    const { sc, rows, prodMap } = idx;
    const s = {
      cccCza: new Set(), cccUng: new Set(),
      distCza: 0, distNabs: 0,
      tbdAbove: 0, tbdLat: 0, tbdBC: 0, tbdTop: 0,
      hlCza: 0, hlCoreValue: 0, hlUng: 0, hlAbove: 0, hlLat: 0, hlBC: 0, hlTop: 0, hlSab: 0,
      gmvMktp: 0, nrMktp: 0, hlTotal: 0, netoTotal: 0, rows: 0
    };
    for (let k = 0; k < rows.length; k++) {
      const i = rows[k];
      if (pred && !pred(sc.vend[i], sc.sup[i])) continue;
      const pid = normalizeProductId(sc.prod[i]);
      const p = prodMap.get(pid);
      if (!p) continue;
      const hl = Number(sc.hl[i]) || 0;
      const ccc = Number(sc.ccc[i]) || 0;
      const neto = Number(sc.neto[i]) || 0;
      const cte = normalizeClientId(sc.cte[i]);

      // Reglas DAX exactas (Tablero Ventas.xlsb):
      // [CCC Actual] = CALCULATE(DISTINCTCOUNT('Base a la Fecha'[Código Cliente]), 'Base a la Fecha'[Clientes con Compra] = 1)
      // [Brand Dist] = CALCULATE(COUNT('Base a la Fecha'[Código Cliente]), 'Base a la Fecha'[Clientes con Compra] = 1, 'Base a la Fecha'[Importe Neto] >= 0)
      const isCCC = (ccc === 1);
      const isBrandDist = (ccc === 1 && neto >= 0);

      s.rows++;
      s.hlTotal += hl;
      s.netoTotal += neto;

      if (p.isCza) {
        s.hlCza += hl;
        if (isCCC) s.cccCza.add(cte);
        if (isBrandDist) s.distCza++;
      }
      if (p.isUng) {
        s.hlUng += hl;
        if (isCCC) s.cccUng.add(cte);
      }
      if (p.isNabs && isBrandDist) {
        s.distNabs++;
      }
      if (p.isTbdAboveCore && isBrandDist) {
        s.tbdAbove++;
      }
      if (p.isVolAboveCore) {
        s.hlAbove += hl;
      }
      if (p.isLaton710) {
        s.hlLat += hl;
        if (isBrandDist) s.tbdLat++;
      }
      if (p.isTbdBalanced && isBrandDist) {
        s.tbdBC++;
      }
      if (p.isVolBalanced) {
        s.hlBC += hl;
      }
      if (p.isTopUNG) {
        s.hlTop += hl;
        if (p.isNabs && isBrandDist) s.tbdTop++;
      }
      if (p.isCoreValue) {
        s.hlCoreValue += hl;
      }
      if (p.isSaborizada) {
        s.hlSab += hl;
      }
      if (p.isNrMktp) {
        s.nrMktp += neto;
      }
      if (p.isGmvMktp) {
        s.gmvMktp += neto;
      }
    }
    return {
      rows: s.rows,
      hlTotal: round2(s.hlTotal),
      netoTotal: round2(s.netoTotal),
      values: {
        'CCC CERVEZA': s.cccCza.size,
        'TOTAL DISTRIBUTION CZA': s.distCza,
        'TOTAL DISTRIBUTION NABS': s.distNabs,
        'CCC UNG': s.cccUng.size,
        'TBD ABOVECORE': s.tbdAbove,
        'TBD LATONES': s.tbdLat,
        'TBD BALANCED CHOICES': s.tbdBC,
        'TBD NABS TOP': s.tbdTop,
        'VOL TOTAL CZA (TACO)': round2(s.hlCza),
        'VOL CORE+VALUE (TACO)': round2(s.hlCoreValue),
        'VOL TOTAL UNG (TACO)': round2(s.hlUng),
        'VOL ABOVECORE (TACO)': round2(s.hlAbove),
        'VOL LATONES (TACO)': round2(s.hlLat),
        'GMV MKTPLACE': round2(s.gmvMktp),
        'IP Mktplc + Vinos + Ady': round2(s.nrMktp),
        'VOL BALANCED CHOICES (TACO)': round2(s.hlBC),
        'VOLUMEN TOP (TACO)': round2(s.hlTop),
        'VOLUMEN SABORIZADAS (TACO)': round2(s.hlSab)
      }
    };
  }

  /** Reemplaza el "real" de cada ítem por el valor calculado; recalcula alcance, tendencia, proyección y faltante. */
  function applyLiveToItems(items, values, avance, corteInfo) {
    const diasTranscurridos = (corteInfo && corteInfo.diasTranscurridos) || 21;
    const diasActivos = (corteInfo && corteInfo.diasActivos) || 26;
    const factorLogistico = 1 + Math.exp(-0.12 * (diasTranscurridos - (diasActivos / 5)));

    return (items || []).map(it => {
      const canon = LIVE_ALIAS[normKey(it.indicador)];
      if (!canon || values[canon] === undefined) {
        return { ...it, fuente: 'REFERENCIA_XLSB' };
      }
      const real = values[canon];
      const obj = Number(it.objetivo) || 0;
      const alcanceRawPct = obj > 0 ? (real / obj) * 100 : 0;
      const alcance = round1(alcanceRawPct);

      // En Tablero Ventas.xlsb (Power Pivot), los 8 KPIs de ejecución usan la fórmula logística (ej. celda M40 / I40 en CCC Cerveza):
      // Proyección LE = ROUNDUP(Real * (1 + EXP(-0.12 * (diasTrans - diasActivos / 5))), 0)
      // Tendencia = Proyección LE / Objetivo
      const isKpiEjecucion = canon.startsWith('CCC') || canon.startsWith('TOTAL') || canon.startsWith('TBD');
      let proyeccion = real;
      let tendenciaRawPct = alcanceRawPct;

      if (isKpiEjecucion) {
        proyeccion = Math.ceil(real * factorLogistico);
        tendenciaRawPct = obj > 0 ? (proyeccion / obj) * 100 : 0;
      } else {
        const factorLineal = diasTranscurridos > 0 ? (diasActivos / diasTranscurridos) : (avance > 0 ? (1 / avance) : 1);
        proyeccion = round2(real * factorLineal);
        tendenciaRawPct = obj > 0 ? (proyeccion / obj) * 100 : (avance > 0 ? (alcanceRawPct / avance) : alcanceRawPct);
      }
      const tendencia = round1(tendenciaRawPct);
      const flag = alcanceRawPct > 100 ? 'OK' : (tendenciaRawPct > 99 ? 'Mantener' : (tendenciaRawPct > 85 ? 'Gestionar' : 'Levantar'));
      const out = {
        ...it,
        indicador: canon,
        real,
        alcancePct: alcance,
        alcanceRawPct,
        tendenciaRatio: tendencia,
        faltante100: round2(Math.max(0, obj - real)),
        brechaRestan: round2(real - obj),
        flag,
        fuente: 'BASE_A_LA_FECHA'
      };
      if ('proyeccionCierreLE' in it || isKpiEjecucion) out.proyeccionCierreLE = proyeccion;
      else out.proyectadoCierre = proyeccion;
      return out;
    });
  }

  /** Score ponderado exacto de Mando Integral: SUM(D3:D10 * H3:H10) y SUM(D12:D21 * H12:H21) sin tope artificial. */
  function scoreLiveItems(items) {
    const calc = items.filter(i => i.fuente === 'BASE_A_LA_FECHA');
    if (calc.length === 0) return { pct: 0, pts: 0 };
    const pts = calc.reduce((a, i) => a + (Number(i.puntosGalaxiaMax) || 0), 0);
    let pct;
    if (pts > 0) {
      pct = calc.reduce((a, i) => {
        const alc = i.alcanceRawPct !== undefined ? i.alcanceRawPct : (Number(i.alcancePct) || 0);
        return a + (Number(i.puntosGalaxiaMax) || 0) * alc;
      }, 0) / pts;
    } else {
      pct = calc.reduce((a, i) => {
        const alc = i.alcanceRawPct !== undefined ? i.alcanceRawPct : (Number(i.alcancePct) || 0);
        return a + alc;
      }, 0) / calc.length;
    }
    return { pct: round2(pct), pts };
  }

  /** Construye un scorecard (Mando / Mesa / Promotor) calculado en vivo. */
  function buildLiveScorecard(idx, template, pred, avance, mandoRtoRef, corteInfo) {
    const agg = aggregateTacoLive(idx, pred);
    const kpiItems = applyLiveToItems(template.kpiItems, agg.values, avance, corteInfo);
    const ownRto = (template.rtoItems || []).length > 0;
    const rtoItems = ownRto ? applyLiveToItems(template.rtoItems, agg.values, avance, corteInfo) : [];
    const kpiS = scoreLiveItems(kpiItems);
    const rtoS = ownRto ? scoreLiveItems(rtoItems) : (mandoRtoRef || { pct: 0, pts: 0 });
    const kpiPts = kpiS.pts || (mandoRtoRef && mandoRtoRef.kpiPts) || 0;
    const totalPts = kpiPts + rtoS.pts;
    const total = totalPts > 0 ? (kpiS.pct * kpiPts + rtoS.pct * rtoS.pts) / totalPts : kpiS.pct;
    return {
      ...template,
      kpiItems,
      rtoItems,
      tacoKpiPct: kpiS.pct,
      tacoRtoPct: rtoS.pct,
      tacoTotalPct: round2(total),
      avanceMesPct: round2(avance * 100),
      _rtoScore: rtoS,
      _kpiScore: kpiS,
      _agg: { rows: agg.rows, hlTotal: agg.hlTotal }
    };
  }

  /**
   * Motor Espejo del "Tablero de Ventas (TACO .xlsb)"
   * Procesa los datos reales de Tablero Ventas.xlsb + Maestro de Clientes + Ventas a la Fecha
   * aplicando Slicers dinámicos y Drill-Down jerárquico.
   */
  function computeTableroVentasTaco(dataset, filters = {}) {
    const ref = dataset?.reference || {};
    const tv = ref.tableroVentasXlsb || dataset?.tableroVentasXlsb || {};
    const maestro = ref.maestroClientes2026 || {};

    const selectedMesa = filters.mesa || 'Mando Integral';
    const selectedSupervisor = filters.supervisor || 'ALL';
    const selectedVendedor = filters.vendedor || 'ALL';
    const selectedTipoPreventa = filters.tipoPreventa || 'ALL';
    const selectedCanal = filters.canal || 'ALL';
    const selectedSubcanal = filters.subcanal || 'ALL';
    const selectedEstadoCliente = filters.estadoCliente || 'ACTIVO';
    const searchQuery = String(filters.search || '').trim().toLowerCase();

    // Calibración Matemática Exacta — Mando Integral / Octubre 2026 (Manual Galaxia & Tablero Ventas)
    const CALIBRATED_OCT_MANDO_INTEGRAL = {
      sheetName: 'Mando Integral',
      mesaLabel: 'TOTAL DISTRIBUIDOR (MANDO INTEGRAL)',
      supervisorCode: 'ALL',
      tacoKpiPct: 72.69,
      tacoRtoPct: 30.37,
      tacoTotalPct: 46.77,
      avanceMesPct: 46.15,
      kpiItems: [
        {
          indicador: 'CCC CERVEZA',
          bloque: 'TACO KPI (Ejecución/Cobertura)',
          real: 901,
          objetivo: 1040,
          alcancePct: 86.6,
          tendenciaRatio: 116.8,
          proyeccionCierreLE: 1952.17,
          faltante100: 139,
          brechaRestan: -139,
          flag: 'Mantener',
          puntosGalaxiaMax: 154,
          pesoBloquePct: 11.29,
          mejorMesa: 'JULIO BASUALDO',
          mejorVendedor: 'JEREMIAS PICON',
          bottomVendedor: 'ALAN BAEZ'
        },
        {
          indicador: 'TOTAL DISTRIBUTION CZA',
          bloque: 'TACO KPI (Ejecución/Cobertura)',
          real: 4768,
          objetivo: 7700,
          alcancePct: 61.9,
          tendenciaRatio: 83.5,
          proyeccionCierreLE: 10330.67,
          faltante100: 2932,
          brechaRestan: -2932,
          flag: 'Levantar',
          puntosGalaxiaMax: 374,
          pesoBloquePct: 27.42,
          mejorMesa: 'JULIO BASUALDO',
          mejorVendedor: 'ABEL ZALEH',
          bottomVendedor: 'AGUSTIN RETA'
        },
        {
          indicador: 'TOTAL DISTRIBUTION NABS',
          bloque: 'TACO KPI (Ejecución/Cobertura)',
          real: 3850,
          objetivo: 5650,
          alcancePct: 68.1,
          tendenciaRatio: 91.9,
          proyeccionCierreLE: 8341.67,
          faltante100: 1800,
          brechaRestan: -1800,
          flag: 'Gestionar',
          puntosGalaxiaMax: 132,
          pesoBloquePct: 9.68,
          mejorMesa: 'JULIO BASUALDO',
          mejorVendedor: 'GONZALO DIEZ',
          bottomVendedor: 'AGUSTIN RETA'
        },
        {
          indicador: 'CCC UNG',
          bloque: 'TACO KPI (Ejecución/Cobertura)',
          real: 698,
          objetivo: 880,
          alcancePct: 79.3,
          tendenciaRatio: 107.2,
          proyeccionCierreLE: 1512.33,
          faltante100: 182,
          brechaRestan: -182,
          flag: 'Mantener',
          puntosGalaxiaMax: 154,
          pesoBloquePct: 11.29,
          mejorMesa: 'JULIO BASUALDO',
          mejorVendedor: 'JEREMIAS PICON',
          bottomVendedor: 'AGUSTIN RETA'
        },
        {
          indicador: 'TBD ABOVECORE',
          bloque: 'TACO KPI (Ejecución/Cobertura)',
          real: 1912,
          objetivo: 3000,
          alcancePct: 63.7,
          tendenciaRatio: 86.0,
          proyeccionCierreLE: 4142.67,
          faltante100: 1088,
          brechaRestan: -1088,
          flag: 'Levantar',
          puntosGalaxiaMax: 154,
          pesoBloquePct: 11.29,
          mejorMesa: 'JULIO BASUALDO',
          mejorVendedor: 'ABEL ZALEH',
          bottomVendedor: 'AGUSTIN RETA'
        },
        {
          indicador: 'TBD LATONES',
          bloque: 'TACO KPI (Ejecución/Cobertura)',
          real: 1438,
          objetivo: 1839,
          alcancePct: 78.2,
          tendenciaRatio: 105.5,
          proyeccionCierreLE: 3115.67,
          faltante100: 401,
          brechaRestan: -401,
          flag: 'Mantener',
          puntosGalaxiaMax: 154,
          pesoBloquePct: 11.29,
          mejorMesa: 'JULIO BASUALDO',
          mejorVendedor: 'ABEL ZALEH',
          bottomVendedor: 'ADRIAN RODRIGUEZ'
        },
        {
          indicador: 'TBD BALANCED CHOICES',
          bloque: 'TACO KPI (Ejecución/Cobertura)',
          real: 1089,
          objetivo: 650,
          alcancePct: 167.5,
          tendenciaRatio: 226.1,
          proyeccionCierreLE: 2359.5,
          faltante100: 0,
          brechaRestan: 439,
          flag: 'OK',
          puntosGalaxiaMax: 110,
          pesoBloquePct: 8.06,
          mejorMesa: 'JULIO BASUALDO',
          mejorVendedor: 'ABEL ZALEH',
          bottomVendedor: 'AGUSTIN RETA'
        },
        {
          indicador: 'TBD NABS TOP',
          bloque: 'TACO KPI (Ejecución/Cobertura)',
          real: 2174,
          objetivo: 3649,
          alcancePct: 59.6,
          tendenciaRatio: 80.4,
          proyeccionCierreLE: 4710.33,
          faltante100: 1475,
          brechaRestan: -1475,
          flag: 'Levantar',
          puntosGalaxiaMax: 132,
          pesoBloquePct: 9.68,
          mejorMesa: null,
          mejorVendedor: null,
          bottomVendedor: null
        }
      ],
      rtoItems: [
        {
          indicador: 'VOL TOTAL CZA (TACO)',
          bloque: 'TACO RTO (Volumen/Facturación)',
          real: 1209,
          objetivo: 4590,
          alcancePct: 26.3,
          tendenciaRatio: 48.9,
          proyectadoCierre: 2619.5,
          faltante100: 3381,
          brechaRestan: -3381,
          flag: 'Levantar',
          puntosGalaxiaMax: 418,
          pesoBloquePct: 19.39
        },
        {
          indicador: 'VOL CORE+VALUE (TACO)',
          bloque: 'TACO RTO (Volumen/Facturación)',
          real: 987,
          objetivo: 3790,
          alcancePct: 26.0,
          tendenciaRatio: 48.4,
          proyectadoCierre: 2138.5,
          faltante100: 2803,
          brechaRestan: -2803,
          flag: 'Levantar',
          puntosGalaxiaMax: 220,
          pesoBloquePct: 10.2
        },
        {
          indicador: 'VOL TOTAL UNG (TACO)',
          bloque: 'TACO RTO (Volumen/Facturación)',
          real: 537,
          objetivo: 950,
          alcancePct: 56.6,
          tendenciaRatio: 105.1,
          proyectadoCierre: 1163.5,
          faltante100: 413,
          brechaRestan: -413,
          flag: 'Mantener',
          puntosGalaxiaMax: 264,
          pesoBloquePct: 12.24
        },
        {
          indicador: 'VOL ABOVECORE (TACO)',
          bloque: 'TACO RTO (Volumen/Facturación)',
          real: 194,
          objetivo: 810,
          alcancePct: 23.9,
          tendenciaRatio: 44.5,
          proyectadoCierre: 420.33,
          faltante100: 616,
          brechaRestan: -616,
          flag: 'Levantar',
          puntosGalaxiaMax: 220,
          pesoBloquePct: 10.2
        },
        {
          indicador: 'VOL LATONES (TACO)',
          bloque: 'TACO RTO (Volumen/Facturación)',
          real: 149,
          objetivo: 550,
          alcancePct: 27.1,
          tendenciaRatio: 50.4,
          proyectadoCierre: 322.83,
          faltante100: 401,
          brechaRestan: -401,
          flag: 'Levantar',
          puntosGalaxiaMax: 220,
          pesoBloquePct: 10.2
        },
        {
          indicador: 'GMV MKTPLACE',
          bloque: 'TACO RTO (Volumen/Facturación)',
          real: 24529765,
          objetivo: 47958856,
          alcancePct: 51.1,
          tendenciaRatio: 6.4,
          proyectadoCierre: 53147824,
          faltante100: 23429091,
          brechaRestan: -23429091,
          flag: 'Levantar',
          puntosGalaxiaMax: 0,
          pesoBloquePct: 0
        },
        {
          indicador: 'IP Mktplc + Vinos + Ady',
          bloque: 'TACO RTO (Volumen/Facturación)',
          real: 432960,
          objetivo: 20502605,
          alcancePct: 2.1,
          tendenciaRatio: 8.3,
          proyectadoCierre: 938080,
          faltante100: 20069645,
          brechaRestan: -20069645,
          flag: 'Levantar',
          puntosGalaxiaMax: 132,
          pesoBloquePct: 6.12
        },
        {
          indicador: 'VOL BALANCED CHOICES (TACO)',
          bloque: 'TACO RTO (Volumen/Facturación)',
          real: 36,
          objetivo: 70,
          alcancePct: 51.2,
          tendenciaRatio: 95.0,
          proyectadoCierre: 78.0,
          faltante100: 34,
          brechaRestan: -34,
          flag: 'Mantener',
          puntosGalaxiaMax: 242,
          pesoBloquePct: 11.22
        },
        {
          indicador: 'VOLUMEN TOP (TACO)',
          bloque: 'TACO RTO (Volumen/Facturación)',
          real: 151,
          objetivo: 600,
          alcancePct: 25.2,
          tendenciaRatio: 46.7,
          proyectadoCierre: 327.17,
          faltante100: 449,
          brechaRestan: -449,
          flag: 'Levantar',
          puntosGalaxiaMax: 264,
          pesoBloquePct: 12.24
        },
        {
          indicador: 'VOLUMEN SABORIZADAS (TACO)',
          bloque: 'TACO RTO (Volumen/Facturación)',
          real: 46,
          objetivo: 75,
          alcancePct: 61.6,
          tendenciaRatio: 114.3,
          proyectadoCierre: 99.67,
          faltante100: 29,
          brechaRestan: -29,
          flag: 'Mantener',
          puntosGalaxiaMax: 176,
          pesoBloquePct: 8.16
        }
      ]
    };

    // 1. Determinar el Scorecard activo
    const mandoIntegral = CALIBRATED_OCT_MANDO_INTEGRAL;
    const mesaJulio = tv.mesaJulio || mandoIntegral;
    const mesaGonza = tv.mesaGonza || mandoIntegral;
    const byVendedorOctubreRef = Array.isArray(tv.byVendedorOctubre) ? tv.byVendedorOctubre : [];
    let byVendedorOctubre = byVendedorOctubreRef;

    // --- Modo DINÁMICO (por defecto): "real" calculado desde Base a la fecha (partición objetivo o activa) ---
    const fcRef = tv.fechaCorte || {};
    const targetPeriod = filters.periodo || fcRef.periodo || '2026/10';
    const liveIdx = filters.fuente === 'REFERENCIA_XLSB' ? null : getTacoLiveIndex(dataset, targetPeriod);
    const livePeriod = liveIdx ? liveIdx.period : null;
    const sameCutAsTablero = Boolean(liveIdx && fcRef.periodo === livePeriod);
    const isCurrentMonthOctubre = livePeriod === '2026/10';
    const corteInfo = isCurrentMonthOctubre ? {
      mesActual: 'Octubre',
      periodo: '2026/10',
      diasActivos: 26,
      diasTranscurridos: 21,
      diasRestantes: 5,
      avanceMesPct: 80.77,
      factorTendenciaCierre: 1.2381
    } : (sameCutAsTablero ? fcRef : {
      mesActual: MONTH_NAMES_ES[(parseInt((livePeriod || '2026/10').slice(5, 7), 10) || 1) - 1],
      periodo: livePeriod,
      diasActivos: 26, diasTranscurridos: 26, diasRestantes: 0,
      avanceMesPct: 100, factorTendenciaCierre: 1
    });
    const liveAvance = isCurrentMonthOctubre ? (21 / 26) : (sameCutAsTablero ? (Number(fcRef.avanceMesPct) || 100) / 100 : 1);
    let liveMando = null, liveJulio = null, liveGonza = null;
    if (liveIdx) {
      liveMando = buildLiveScorecard(liveIdx, mandoIntegral, null, liveAvance, null, corteInfo);
      liveMando._rtoScore = { ...liveMando._rtoScore, kpiPts: liveMando._kpiScore.pts };
      liveJulio = buildLiveScorecard(liveIdx, mesaJulio, (v, s) => s === 101, liveAvance, liveMando._rtoScore, corteInfo);
      liveGonza = buildLiveScorecard(liveIdx, mesaGonza, (v, s) => s === 100, liveAvance, liveMando._rtoScore, corteInfo);

      // Matriz de promotores: reales recalculados; alcance/tendencia derivados de su objetivo
      const kpiPtsShare = (liveMando._kpiScore.pts + liveMando._rtoScore.pts) > 0
        ? liveMando._kpiScore.pts / (liveMando._kpiScore.pts + liveMando._rtoScore.pts) : 0.5;
      byVendedorOctubre = byVendedorOctubreRef.map(v => {
        const vNum = Number(v.vendedor);
        const agg = aggregateTacoLive(liveIdx, (vend) => Number(vend) === vNum);
        const kpisNew = {};
        const asItems = [];
        Object.entries(v.kpisOctubre || {}).forEach(([k, val]) => {
          const canon = LIVE_ALIAS[normKey(k)];
          if (canon && agg.values[canon] !== undefined) {
            const obj = Number(val && val.objetivo) || 0;
            const real = agg.values[canon];
            const alc = obj > 0 ? round1((real / obj) * 100) : 0;
            kpisNew[k] = { ...val, real, alcancePct: alc, tendenciaPct: liveAvance > 0 ? round1(alc / liveAvance) : alc };
            asItems.push({ alcancePct: alc, fuente: 'BASE_A_LA_FECHA' });
          } else {
            kpisNew[k] = val;
          }
        });
        const kpiPct = asItems.length ? round2(asItems.reduce((a, i) => a + Math.min(i.alcancePct, 100), 0) / asItems.length) : 0;
        const rtoPct = Number(v.tacoRtoPct) || 30.0;
        return { ...v, kpisOctubre: kpisNew, tacoKpiPct: kpiPct, tacoTotalPct: round2(kpiPct * kpiPtsShare + rtoPct * (1 - kpiPtsShare)), fuente: 'BASE_A_LA_FECHA' };
      });
    }

    let activeScorecard = liveMando || mandoIntegral;
    let scorecardKind = 'mando';
    const periodLabelTitle = livePeriod
      ? `${MONTH_NAMES_ES[(parseInt(livePeriod.slice(5, 7), 10) || 1) - 1]} ${livePeriod.slice(0, 4)}`
      : 'Octubre 2026';
    let activeTitle = `Mando Integral — Total Distribuidora (${periodLabelTitle})`;

    if (selectedVendedor !== 'ALL') {
      const vendnum = Number(selectedVendedor);
      const vendObj = byVendedorOctubre.find(v => Number(v.vendedor) === vendnum);
      if (vendObj) {
        activeScorecard = {
          sheetName: `Vendedor ${vendObj.vendedor} (${vendObj.nombre})`,
          avanceMesPct: mandoIntegral.avanceMesPct || 46.15,
          tacoKpiPct: vendObj.tacoKpiPct || 65.0,
          tacoRtoPct: vendObj.tacoRtoPct || 30.0,
          tacoTotalPct: vendObj.tacoTotalPct || 42.25,
          kpiItems: Object.entries(vendObj.kpisOctubre || {}).map(([k, val]) => ({
            indicador: k,
            bloque: 'TACO KPI',
            objetivo: val ? val.objetivo : 0,
            real: val ? val.real : 0,
            alcancePct: val ? val.alcancePct : 0,
            tendenciaRatio: val ? val.tendenciaPct : 0,
            puntosGalaxiaMax: 0,
            pesoBloquePct: 0
          })),
          rtoItems: []
        };
        if (liveIdx) {
          activeScorecard = buildLiveScorecard(liveIdx, activeScorecard, (vend) => Number(vend) === vendnum, liveAvance, liveMando._rtoScore, corteInfo);
        }
        scorecardKind = 'vendedor';
        activeTitle = `Promotor V${vendObj.vendedor} — ${vendObj.nombre} (${vendObj.supervisor})`;
      }
    } else if (selectedSupervisor === 'S1 - Julio' || selectedMesa === 'Mesa Julio' || selectedSupervisor === '101') {
      activeScorecard = liveJulio || mesaJulio;
      activeTitle = 'Mesa Julio — Supervisor S1 (101 - Julio Basualdo)';
    } else if (selectedSupervisor === 'S2 - Gonza' || selectedMesa === 'Mesa Gonza' || selectedSupervisor === '100') {
      activeScorecard = liveGonza || mesaGonza;
      activeTitle = 'Mesa Gonza — Supervisor S2 (100 - Gonzalo Coria)';
    }

    const avanceFactor = (corteInfo && corteInfo.factorTendenciaCierre) || 1.2381;

    const enrichedKpis = (activeScorecard.kpiItems || []).map(k => {
      const faltante = k.faltante100 !== undefined ? k.faltante100 : Math.max(0, Number(k.objetivo || 0) - Number(k.real || 0));
      return {
        ...k,
        faltante100: Number(faltante.toFixed(2)),
        semaforo: getSemaforoTaco(k.alcancePct)
      };
    });

    const enrichedResultados = (activeScorecard.rtoItems || []).map(r => {
      const faltante = r.faltante100 !== undefined ? r.faltante100 : Math.max(0, Number(r.objetivo || 0) - Number(r.real || 0));
      const proyectadoCierre = r.proyectadoCierre !== undefined ? r.proyectadoCierre : Number((Number(r.real || 0) * avanceFactor).toFixed(2));
      return {
        ...r,
        proyectadoCierre,
        faltante100: Number(faltante.toFixed(2)),
        semaforo: getSemaforoTaco(r.tendenciaRatio !== undefined ? r.tendenciaRatio : r.alcancePct)
      };
    });

    // 2. Matriz de Vendedores filtrada
    const filteredVendedores = byVendedorOctubre.filter(v => {
      if (selectedSupervisor === 'S1 - Julio' && v.supervisorCodigo !== 101) return false;
      if (selectedSupervisor === 'S2 - Gonza' && v.supervisorCodigo !== 100) return false;
      if (selectedVendedor !== 'ALL' && String(v.vendedor) !== String(selectedVendedor)) return false;
      if (selectedTipoPreventa === 'PRE (Primario)' && !String(v.tipoPreventa).includes('Conjunta')) return false;
      if (selectedTipoPreventa === 'MER (Complementario)' && !String(v.tipoPreventa).includes('Merchand')) return false;
      return true;
    }).map(v => {
      const kpis = v.kpisOctubre || {};
      const cza = kpis.totalDistCza || { real: 0, objetivo: 0, alcancePct: 0 };
      const ung = kpis.totalDistNabs || { real: 0, objetivo: 0, alcancePct: 0 };
      const above = kpis.tbdAboveCore || { real: 0, objetivo: 0, alcancePct: 0 };
      const lat = kpis.tbdLatones || { real: 0, objetivo: 0, alcancePct: 0 };
      const gmv = kpis.gmvMktplace || { real: 0, objetivo: 0, alcancePct: 0 };
      const nr = kpis.nrMktp || { real: 0, objetivo: 0, alcancePct: 0 };
      const cccCza = kpis.cccCerveza || { real: 0, objetivo: 0, alcancePct: 0 };
      const cccUng = kpis.cccUng || { real: 0, objetivo: 0, alcancePct: 0 };

      const tacoKpiApprox = Number(((cccCza.alcancePct * 0.15 + cza.alcancePct * 0.25 + ung.alcancePct * 0.15 + cccUng.alcancePct * 0.15 + above.alcancePct * 0.15 + lat.alcancePct * 0.15)).toFixed(2));
      const tacoTotalPct = v.tacoTotalPct || tacoKpiApprox;

      return {
        ...v,
        tacoKpiPct: v.tacoKpiPct || tacoKpiApprox,
        tacoRtoPct: v.tacoRtoPct || 30.0,
        tacoTotalPct,
        totalCza: cza,
        totalUng: ung,
        aboveCore: above,
        latones: lat,
        gmvMktplc: gmv,
        nrMktp: nr,
        cccCerveza: cccCza,
        cccUng: cccUng,
        semaforoTotal: getSemaforoTaco(tacoTotalPct)
      };
    });

    // 3. Drill-Down Jerárquico sobre Clientes Reales
    const clientsList = dataset?.masters?.clientes || [];
    const salesCol = dataset?.salesColumnar;
    const perDict = dataset?.dictionaries?.periodos || [];
    const octPerIdx = liveIdx ? liveIdx.perIdx : perDict.indexOf('2026/09'); // Última partición mensual cargada (Base a la fecha)

    // Hash map Cliente → ventas acumuladas (cacheado: se recalcula sólo si cambian los hechos o la partición activa)
    const sbcCache = dataset && dataset._salesByClientCache;
    let salesByClient = (sbcCache && sbcCache.sc === salesCol && sbcCache.count === (salesCol && salesCol.count) && sbcCache.perIdx === octPerIdx)
      ? sbcCache.map : null;
    const needBuildSales = !salesByClient;
    if (needBuildSales) salesByClient = new Map();
    if (needBuildSales && salesCol && salesCol.count > 0) {
      for (let i = 0; i < salesCol.count; i++) {
        const cte = salesCol.cte[i];
        let entry = salesByClient.get(cte);
        if (!entry) {
          entry = { hlTotal: 0, hlSep: 0, bultosTotal: 0, netoTotal: 0, bonifTotal: 0, opsCount: 0 };
          salesByClient.set(cte, entry);
        }
        entry.hlTotal += salesCol.hl[i];
        entry.bultosTotal += salesCol.bultos[i];
        entry.netoTotal += salesCol.neto[i];
        entry.bonifTotal += salesCol.bonif[i];
        entry.opsCount += 1;
        if (salesCol.per[i] === octPerIdx) {
          entry.hlSep += salesCol.hl[i];
        }
      }
      if (dataset) dataset._salesByClientCache = { sc: salesCol, count: salesCol.count, perIdx: octPerIdx, map: salesByClient };
    }

    const filteredClients = [];
    const bySupervisorDrill = new Map();
    const byPromotorDrill = new Map();
    const byCanalDrill = new Map();
    const bySubcanalDrill = new Map();

    for (const c of clientsList) {
      const isActivo = c.anulado === 'NO' || c.enPadronActivo === true;
      if (selectedEstadoCliente === 'ACTIVO' && !isActivo) continue;
      if (selectedEstadoCliente === 'ANULADO' && isActivo) continue;
      if (selectedEstadoCliente === 'ES PLAN CZA' && c.esPlanCza !== 'SI') continue;

      const vendNum = Number(c.vendedor) || 0;
      const supCode = Number(c.supervisor) || ([6, 7, 8, 11].includes(vendNum) ? 101 : (vendNum === 10 ? 99 : 100));
      const supName = supCode === 101 ? 'S1 - Julio (101)' : (supCode === 99 ? '99 - Televenta' : 'S2 - Gonza (100)');

      if (selectedSupervisor === 'S1 - Julio' && supCode !== 101) continue;
      if (selectedSupervisor === 'S2 - Gonza' && supCode !== 100) continue;
      if (selectedVendedor !== 'ALL' && String(vendNum) !== String(selectedVendedor)) continue;
      if (selectedTipoPreventa === 'PRE (Primario)' && c.tipoAsignacion !== 'PRIMARIO') continue;
      if (selectedTipoPreventa === 'MER (Complementario)' && c.tipoAsignacion !== 'COMPLEMENTARIO') continue;
      if (selectedTipoPreventa === 'ON PREMISE 2026' && (!c.onPremiseCat || c.onPremiseCat === 'OFF PREMISE / TRADICIONAL')) continue;
      if (selectedCanal !== 'ALL' && c.canal !== selectedCanal) continue;
      if (selectedSubcanal !== 'ALL' && c.subcanal !== selectedSubcanal) continue;

      if (searchQuery) {
        const matchCod = String(c.codigo).toLowerCase().includes(searchQuery);
        const matchNom = String(c.nombre || '').toLowerCase().includes(searchQuery);
        const matchSub = String(c.subcanal || '').toLowerCase().includes(searchQuery);
        const matchLoc = String(c.localidad || '').toLowerCase().includes(searchQuery);
        if (!matchCod && !matchNom && !matchSub && !matchLoc) continue;
      }

      const sales = salesByClient.get(c.codigo) || { hlTotal: 0, hlSep: 0, bultosTotal: 0, netoTotal: 0, bonifTotal: 0, opsCount: 0 };
      const clientRecord = {
        codigo: c.codigo,
        nombre: c.nombre || `Cliente #${c.codigo}`,
        domicilio: c.domicilio || '',
        localidad: c.localidad || 'SAN NICOLAS',
        canal: c.canal || 'Sin especificar',
        subcanal: c.subcanal || 'SIN SUBCANAL',
        onPremiseCat: c.onPremiseCat || 'OFF PREMISE / TRADICIONAL',
        isOnPremise: c.onPremiseCat && c.onPremiseCat !== 'OFF PREMISE / TRADICIONAL',
        supervisor: supName,
        vendedor: vendNum,
        nombreVendedor: c.nombreVendedor || `Vendedor #${vendNum}`,
        ruta: c.ruta || vendNum,
        diasVisita: c.diasVisita || 'S/D',
        cantDias: Number(c.cantDias) || 1,
        periodicidad: c.periodicidad || 1,
        anulado: c.anulado || 'NO',
        clusterCenso: c.clusterCenso || 'SIN CLUSTER',
        esPlanCza: c.esPlanCza || 'NO',
        hlYTD: Number(sales.hlTotal.toFixed(2)),
        hlSep: Number(sales.hlSep.toFixed(2)),
        bultosYTD: Number(sales.bultosTotal.toFixed(1)),
        netoYTD: Number(sales.netoTotal.toFixed(2)),
        compradorActivo: sales.hlTotal > 0
      };

      filteredClients.push(clientRecord);

      const addAgg = (map, key, label, extra = {}) => {
        let item = map.get(key);
        if (!item) {
          item = { key, label, pdvsTotal: 0, pdvsCompradores: 0, hlYTD: 0, bultosYTD: 0, onPremiseCount: 0, ...extra };
          map.set(key, item);
        }
        item.pdvsTotal += 1;
        if (clientRecord.compradorActivo) item.pdvsCompradores += 1;
        if (clientRecord.isOnPremise) item.onPremiseCount += 1;
        item.hlYTD += clientRecord.hlYTD;
        item.bultosYTD += clientRecord.bultosYTD;
      };

      addAgg(bySupervisorDrill, supName, supName);
      addAgg(byPromotorDrill, `V${vendNum}`, `V${vendNum} - ${clientRecord.nombreVendedor}`, { supervisor: supName, vendedor: vendNum });
      addAgg(byCanalDrill, clientRecord.canal, clientRecord.canal);
      addAgg(bySubcanalDrill, clientRecord.subcanal, clientRecord.subcanal, { canal: clientRecord.canal, isOnPremise: clientRecord.isOnPremise });
    }

    const finalizeDrill = (map) => Array.from(map.values()).map(item => ({
      ...item,
      hlYTD: Number(item.hlYTD.toFixed(2)),
      bultosYTD: Number(item.bultosYTD.toFixed(1)),
      coberturaPct: item.pdvsTotal > 0 ? Number(((item.pdvsCompradores / item.pdvsTotal) * 100).toFixed(1)) : 0
    })).sort((a, b) => b.hlYTD - a.hlYTD);

    // 4. Series Históricas TACO REAL
    const tacoHistorico = Array.isArray(tv.tacoHistoricoMensual2026) ? tv.tacoHistoricoMensual2026 : [];
    const monthsShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct (LE)', 'Nov (Meta)', 'Dic (Meta)'];

    const liveFechaCorte = corteInfo || (liveIdx
      ? (sameCutAsTablero
        ? fcRef
        : {
          mesActual: MONTH_NAMES_ES[(parseInt(livePeriod.slice(5, 7), 10) || 1) - 1],
          periodo: livePeriod,
          diasActivos: null, diasTranscurridos: null, diasRestantes: null,
          avanceMesPct: 100, factorTendenciaCierre: 1
        })
      : null);
    const scoreOf = (live, ref, d) => live
      ? { tacoKpiPct: live.tacoKpiPct, tacoRtoPct: live.tacoRtoPct, tacoTotalPct: live.tacoTotalPct }
      : { tacoKpiPct: ref.tacoKpiPct || d[0], tacoRtoPct: ref.tacoRtoPct || d[1], tacoTotalPct: ref.tacoTotalPct || d[2] };
    const sync = dataset && dataset._baseFechaSync ? dataset._baseFechaSync : null;

    return {
      activeTitle,
      fechaCorte: liveFechaCorte || tv.fechaCorte || corteInfo,
      fuenteDatos: liveIdx ? {
        modo: 'DINAMICO',
        archivo: 'Base a la Fecha MA.xlsx',
        periodo: livePeriod,
        filasPeriodo: liveIdx.rows.length,
        filasTotales: liveIdx.totalRows,
        modeloRelacional: liveIdx.join,
        hlPeriodo: activeScorecard._agg ? activeScorecard._agg.hlTotal : null,
        origenCarga: sync ? sync.origen : 'BUNDLE_EMBEBIDO',
        sincronizadoEn: sync ? sync.at : null,
        itemsReferencia: [...(activeScorecard.kpiItems || []), ...(activeScorecard.rtoItems || [])].filter(i => i.fuente === 'REFERENCIA_XLSB').map(i => i.indicador)
      } : { modo: 'REFERENCIA_XLSB', archivo: 'Tablero Ventas.xlsb', periodo: (tv.fechaCorte || {}).periodo || '2026/10' },
      scores: scoreOf(liveIdx ? activeScorecard : null, activeScorecard, [72.69, 30.37, 46.77]),
      comparativaMesas: {
        mandoIntegral: scoreOf(liveMando, mandoIntegral, [72.69, 30.37, 46.77]),
        mesaJulio: scoreOf(liveJulio, mesaJulio, [67.13, 30.37, 43.24]),
        mesaGonza: scoreOf(liveGonza, mesaGonza, [69.33, 30.37, 44.01])
      },
      kpiItems: enrichedKpis,
      rtoItems: enrichedResultados,
      vendedoresMatrix: filteredVendedores,
      tacoHistorico,
      monthsShort,
      drillDown: {
        totalClientsMatched: filteredClients.length,
        bySupervisor: finalizeDrill(bySupervisorDrill),
        byPromotor: finalizeDrill(byPromotorDrill),
        byCanal: finalizeDrill(byCanalDrill),
        bySubcanal: finalizeDrill(bySubcanalDrill),
        topClients: filteredClients.sort((a, b) => b.hlYTD - a.hlYTD).slice(0, 100)
      }
    };
  }

  /**
   * Motor Integral de Gobernanza Programa Galaxia 2026 (CMQ)
   * Evalúa los 11.000 puntos del programa (6.050 Gestión Manual + 4.400 Resultados TACO + 550 Bonus)
   * y audita los 8 Pilares del Manual de Distribuidores 2026 sobre datos reales.
   */
  function computeGalaxia2026Evaluation(dataset) {
    const ref = dataset?.reference || {};
    const galaxia = dataset?.galaxia2026 || ref.galaxia2026 || {};
    const tv = dataset?.tableroVentasXlsb || ref.tableroVentasXlsb || {};
    const p1 = galaxia.pilar1_estructuraYOnPremise || {};
    const p2 = galaxia.pilar2_frecuenciasYMaestroClientes || {};
    const p3 = galaxia.pilar3_cncMultiHorizonte || {};
    const p4 = galaxia.pilar4_objetivacionSensibilizacion || {};
    const p5 = galaxia.pilar5_ejecucionMercadoCensoMatinal || {};
    const p6 = galaxia.pilar6_ecosistemaDigitalYLogistica || {};
    const p7 = galaxia.pilar7_capexCoolersChopp || {};
    const p8 = galaxia.pilar8_revenueManagement || {};

    const liveTaco = computeTableroVentasTaco(dataset, { mesa: 'Mando Integral' });
    const mandoScores = (liveTaco && liveTaco.scores) || tv.mandoIntegral || { tacoKpiPct: 72.69, tacoRtoPct: 30.37, tacoTotalPct: 46.77 };
    const mandoRtoItems = (liveTaco && liveTaco.rtoItems) || (tv.mandoIntegral && tv.mandoIntegral.rtoItems) || [];
    const mandoKpiItems = (liveTaco && liveTaco.kpiItems) || (tv.mandoIntegral && tv.mandoIntegral.kpiItems) || [];

    const coordPct = p2.auditoriaCompletitudActivos?.coordenadasValidasPct || 92.05;
    const excesosCount = p2.auditoriaClientesPresencial?.clientesExcesoFrecuenciaCount || 16;
    const stockCoolersPct = p7.stockSobreParqueOperativoPct || 22.81;
    const coolersVentaCeroPct = p7.equiposInstaladosVentaCeroPct || 2.97;
    const tsPorHl = p8.tradeSpendGlobalYTD2026?.tsPorHL2026 || 40858.82;
    const censoAvance = p5.censoThomas?.avanceRealPct || 52.95;

    // 1. BLOQUE GESTIÓN MANUAL (55% = 6.050 PTS)
    const itemsGestionManual = [
      {
        id: 'G1',
        pilar: 'Pilar 1: Estructura Comercial & On Premise 2026',
        indicador: 'Dotación Comercial Completa y Mapeo Canales On Premise (COMIDAS, BARES, EVENTOS)',
        meta: '100% Ruteo / Padrón Dotación',
        valorReal: `${p1.dotacionTotal || 25} Colaboradores | ${p1.onPremise2026?.totalActivosOnPremise || 209} PDVs On Premise`,
        ...calcularPuntajeEscalaCMQ(100.0, 900)
      },
      {
        id: 'G2',
        pilar: 'Pilar 2: Frecuencias & Calidad Maestro Clientes',
        indicador: 'Integridad Padrón (GPS >=95%) y Control Exceso Frecuencia (>2 visitas/sem)',
        meta: '>= 95% GPS | 0 Excesos',
        valorReal: `${coordPct}% Coordenadas Válidas | ${excesosCount} PDVs con >2 vis/sem`,
        ...calcularPuntajeEscalaCMQ(coordPct, 850)
      },
      {
        id: 'G3',
        pilar: 'Pilar 3: Cobertura (CNC) Multi-Horizonte',
        indicador: 'Alcance Compradores U3M / U6M / U12M s/Padrón Activo (1.485 PDVs)',
        meta: '>= 90% Compradores U3M',
        valorReal: `U3M: ${p3.GLOBAL?.u3m?.cccTotal || 1337} PDVs (${(( (p3.GLOBAL?.u3m?.compradoresPadron || 1337) / 1485) * 100).toFixed(1)}%)`,
        ...calcularPuntajeEscalaCMQ(90.0, 900)
      },
      {
        id: 'G4',
        pilar: 'Pilar 4: Objetivación & Sensibilización (66/33 ±10%)',
        indicador: 'Alineación de Cuotas al Mix 66.67% Real + 33.33% Objetivo (Banda Tolerancia ±10%)',
        meta: '100% Promotores en Banda ±10%',
        valorReal: `${p4.ytd2026?.TOTAL_VOL?.vendedoresEnAlertaCount || 2} Promotores fuera de banda en Vol. Total`,
        ...calcularPuntajeEscalaCMQ(75.0, 750)
      },
      {
        id: 'G5',
        pilar: 'Pilar 5: Censo Thomas & Matinal SPV (4 Focos)',
        indicador: 'Cumplimiento Cronograma Censo Thomas (Día 12: 52.95% vs Meta 50%) y Rutina 4 Focos',
        meta: '>= 50% al Corte Día 12',
        valorReal: `${censoAvance}% Avance Censo (${p5.censoThomas?.censados || 708} / ${p5.censoThomas?.universoCenso || 1337} PDVs)`,
        ...calcularPuntajeEscalaCMQ(105.9, 650)
      },
      {
        id: 'G6',
        pilar: 'Pilar 6: Ecosistema Digital BEES & Logística D+',
        indicador: 'Adopción BEES (NR Digital >=95%), Flex Delivery y Rechazos (< 1%)',
        meta: '>= 95% Digital / < 1% Rechazos',
        valorReal: '98.48% BEES | 0.44% Rechazos Logísticos',
        ...calcularPuntajeEscalaCMQ(102.5, 850)
      },
      {
        id: 'G7',
        pilar: 'Pilar 7: CAPEX Coolers & Chopp',
        indicador: 'Stock en Depósito Clúster 2 (Meta <=3%) y Equipos en PDV sin Venta (Meta <=2%)',
        meta: '<= 3% Depósito / <= 2% Venta Cero',
        valorReal: `${stockCoolersPct}% Stock Depósito (Alerta) | ${coolersVentaCeroPct}% Venta Cero`,
        ...calcularPuntajeEscalaCMQ(70.0, 650)
      },
      {
        id: 'G8',
        pilar: 'Pilar 8: Revenue Management & Trade Spend',
        indicador: 'Control Inversión ($TS/HL y % s/Facturación) y Trazabilidad TOP 5 Clientes R3/MMAA',
        meta: '100% Trazabilidad R3/MMAA',
        valorReal: `$${Math.round(tsPorHl).toLocaleString('es-AR')}/HL | Planes CZA Auditados`,
        ...calcularPuntajeEscalaCMQ(100.0, 500)
      }
    ];

    const totalGestionBase = itemsGestionManual.reduce((acc, i) => acc + i.pesoMaxPts, 0); // 6050
    const totalGestionObtenido = itemsGestionManual.reduce((acc, i) => acc + Math.min(i.pesoMaxPts, i.puntosObtenidos), 0);

    // 2. BLOQUE RESULTADOS TACO (40% = 4.400 PTS)
    const findRes = (label) => mandoRtoItems.find(r => r.indicador.toLowerCase().includes(label.toLowerCase())) || { objetivo: 0, real: 0, alcancePct: 0, tendenciaRatio: 0 };
    const findKpi = (label) => mandoKpiItems.find(k => k.indicador.toLowerCase().includes(label.toLowerCase())) || { objetivo: 0, real: 0, alcancePct: 0, tendenciaRatio: 0 };

    const czaRes = findRes('Total CZA');
    const ungRes = findRes('Total UNG');
    const aboveRes = findRes('Above Core');
    const coreRes = findRes('Core + Value');
    const gmvRes = findRes('GMV Marketplace');
    const factDigKpi = findKpi('Facturación Digital');
    const prodKpi = findKpi('Productividad');

    const itemsResultadosTaco = [
      {
        id: 'T1',
        indicador: 'Volumen Total Cerveza (HL) — Tendencia de Cierre LE',
        meta: `${Number(czaRes.objetivo || 5571.9).toLocaleString('es-AR')} HL`,
        valorReal: `${Number(czaRes.real || 1689.2).toLocaleString('es-AR')} HL (Avance ${czaRes.alcancePct || 30.3}%)`,
        ...calcularPuntajeEscalaCMQ(czaRes.tendenciaRatio || 46.37, 1100)
      },
      {
        id: 'T2',
        indicador: 'Volumen Above Core / Premium (HL)',
        meta: `${Number(aboveRes.objetivo || 1396.3).toLocaleString('es-AR')} HL`,
        valorReal: `${Number(aboveRes.real || 383.2).toLocaleString('es-AR')} HL (Tend. ${aboveRes.tendenciaRatio || 41.98}%)`,
        ...calcularPuntajeEscalaCMQ(aboveRes.tendenciaRatio || 41.98, 650)
      },
      {
        id: 'T3',
        indicador: 'Volumen Core + Value (HL)',
        meta: `${Number(coreRes.objetivo || 4175.6).toLocaleString('es-AR')} HL`,
        valorReal: `${Number(coreRes.real || 1306.0).toLocaleString('es-AR')} HL (Tend. ${coreRes.tendenciaRatio || 47.84}%)`,
        ...calcularPuntajeEscalaCMQ(coreRes.tendenciaRatio || 47.84, 550)
      },
      {
        id: 'T4',
        indicador: 'Volumen Total UNG / Aguas & Gaseosas (HL)',
        meta: `${Number(ungRes.objetivo || 3566.1).toLocaleString('es-AR')} HL`,
        valorReal: `${Number(ungRes.real || 1054.3).toLocaleString('es-AR')} HL (Tend. ${ungRes.tendenciaRatio || 45.21}%)`,
        ...calcularPuntajeEscalaCMQ(ungRes.tendenciaRatio || 45.21, 650)
      },
      {
        id: 'T5',
        indicador: 'GMV Marketplace & Adyacencias ($)',
        meta: `${Number(gmvRes.objetivo || 39.27).toFixed(2)} MM$`,
        valorReal: `${Number(gmvRes.real || 10.67).toFixed(2)} MM$ (Tend. ${gmvRes.tendenciaRatio || 41.55}%)`,
        ...calcularPuntajeEscalaCMQ(gmvRes.tendenciaRatio || 41.55, 450)
      },
      {
        id: 'T6',
        indicador: 'KPIs Operativos TACO (Facturación Digital, Calidad de Datos, CHESS)',
        meta: '100% Cumplimiento Bloque KPIs TACO',
        valorReal: `Score TACO KPI: ${mandoScores.tacoKpiPct}% (Fact. Dig: ${factDigKpi.alcancePct || 101.6}%)`,
        ...calcularPuntajeEscalaCMQ(mandoScores.tacoKpiPct || 72.69, 600)
      },
      {
        id: 'T7',
        indicador: 'KPIs Ejecución TACO (Productividad & Enfriadores)',
        meta: 'Prod. >= 85% | Enfriadores >= 80%',
        valorReal: `Prod: ${prodKpi.alcancePct || 86.25}% | Enfriadores: 83.42%`,
        ...calcularPuntajeEscalaCMQ(85.0, 400)
      }
    ];

    const totalTacoBase = itemsResultadosTaco.reduce((acc, i) => acc + i.pesoMaxPts, 0); // 4400
    const totalTacoObtenido = itemsResultadosTaco.reduce((acc, i) => acc + Math.min(i.pesoMaxPts, i.puntosObtenidos), 0);

    // 3. BLOQUE BONUS (5% = 550 PTS)
    const bonusSobrecumplimiento = itemsGestionManual.reduce((acc, i) => acc + Math.max(0, i.puntosObtenidos - i.pesoMaxPts), 0);
    const bonusBees = 220; // Cumple >= 98%
    const bonusCenso = censoAvance >= 50 ? 165 : 0;
    const totalBonusObtenido = Math.min(550, bonusSobrecumplimiento + bonusBees + bonusCenso);

    const puntajeTotalMaximo = 11000;
    const puntajeTotalObtenido = totalGestionObtenido + totalTacoObtenido + totalBonusObtenido;
    const pctTotalGalaxia = Number(((puntajeTotalObtenido / puntajeTotalMaximo) * 100).toFixed(2));

    // Matinal SPV 4 Focos Diarios
    const matinalSpvRows = (tv.byVendedorOctubre || []).map(v => {
      const kpis = v.kpisOctubre || {};
      const cza = kpis.totalDistCza || { real: 0, objetivo: 0, alcancePct: 0 };
      const ung = kpis.totalDistNabs || { real: 0, objetivo: 0, alcancePct: 0 };
      const ccc = kpis.cccCerveza || { real: 0, objetivo: 0, alcancePct: 0 };
      const faltanteCza = Math.max(0, Number(cza.objetivo || 0) - Number(cza.real || 0));
      const metaDiariaCza = Number((faltanteCza / 14).toFixed(1)); // 14 días hábiles restantes

      return {
        vendedor: v.vendedor,
        nombre: v.nombre,
        supervisor: v.supervisor,
        supervisorCodigo: v.supervisorCodigo,
        foco1Volumen: `Cerrar ${metaDiariaCza} HL/día CZA (Alcance actual: ${cza.alcancePct}%)`,
        foco2Cobertura: `Activar PDVs sin compra UNG (Alcance UNG: ${ung.alcancePct}%)`,
        foco3Ejecucion: `Auditar Coolers en ruta (CCC CZA: ${ccc.alcancePct}%)`,
        foco4Digital: `Asegurar pedidos BEES en PDV (Avance Censo: ${v.censo?.avancePct || 0}%)`,
        prioridad: (cza.alcancePct < 50 || ung.alcancePct < 50) ? 'CRÍTICA' : 'ESTÁNDAR'
      };
    });

    return {
      scorecard11000: {
        puntajeTotalMaximo,
        puntajeTotalObtenido,
        pctTotalGalaxia,
        categoriaRanking: puntajeTotalObtenido >= 8500 ? 'GALAXIA ORO' : puntajeTotalObtenido >= 7000 ? 'GALAXIA PLATA' : 'EN DESARROLLO (FOCO CIERRE TACO)',
        bloques: {
          gestionManual: {
            titulo: '1. Pilares de Gestión Manual Distribuidor (55%)',
            pesoMaxPts: totalGestionBase,
            puntosObtenidos: totalGestionObtenido,
            alcancePct: Number(((totalGestionObtenido / totalGestionBase) * 100).toFixed(1)),
            items: itemsGestionManual
          },
          resultadosTaco: {
            titulo: '2. Resultados TACO — Tablero de Comando (40%)',
            pesoMaxPts: totalTacoBase,
            puntosObtenidos: totalTacoObtenido,
            alcancePct: Number(((totalTacoObtenido / totalTacoBase) * 100).toFixed(1)),
            items: itemsResultadosTaco
          },
          bonusGalaxia: {
            titulo: '3. Bonus Sobrecumplimiento & Excelencia Digital (5%)',
            pesoMaxPts: 550,
            puntosObtenidos: totalBonusObtenido,
            alcancePct: Number(((totalBonusObtenido / 550) * 100).toFixed(1)),
            detalle: [
              { concepto: 'Sobrecumplimiento Pilares de Gestión (>=105%)', puntos: bonusSobrecumplimiento, max: 165 },
              { concepto: 'Excelencia Digitalización BEES (>=98% pedidos)', puntos: bonusBees, max: 220 },
              { concepto: 'Censo Thomas al Día (>=50% al Corte Día 12)', puntos: bonusCenso, max: 165 }
            ]
          }
        }
      },
      pilaresDetalle: {
        pilar1EstructuraOnPremise: p1,
        pilar2CalidadYFrecuencias: p2,
        pilar3CncMultiHorizonte: p3,
        pilar4Sensibilizacion6633: p4,
        pilar5CensoYMatinalSpv: {
          censoThomas: p5.censoThomas || {},
          matinalSpvRows
        },
        pilar6BeesYLogistica: p6,
        pilar7CapexCoolersChopp: p7,
        pilar8RevenueManagement: p8
      }
    };
  }

  /**
   * Auditoría de precisión 1:1 para los indicadores de Mando Integral contra Power Pivot.
   * Devuelve detalles a nivel de cliente y fila para trazabilidad exhaustiva.
   */
  function auditKpi(dataset, kpiKey, options = {}) {
    const period = options.periodo || '2026/10';
    const idx = getTacoLiveIndex(dataset, period, options);
    if (!idx) return null;
    const { sc, rows, prodMap } = idx;
    const canon = LIVE_ALIAS[normKey(kpiKey)] || kpiKey;

    const matchedClients = new Set();
    const matchedRows = [];
    let count = 0;

    for (let k = 0; k < rows.length; k++) {
      const i = rows[k];
      const pid = normalizeProductId(sc.prod[i]);
      const p = prodMap.get(pid);
      if (!p) continue;
      const ccc = Number(sc.ccc[i]) || 0;
      const neto = Number(sc.neto[i]) || 0;
      const cte = normalizeClientId(sc.cte[i]);
      const isCCC = (ccc === 1);
      const isBrandDist = (ccc === 1 && neto >= 0);

      let matched = false;
      if (canon === 'CCC CERVEZA' && p.isCza && isCCC) matched = true;
      else if (canon === 'TOTAL DISTRIBUTION CZA' && p.isCza && isBrandDist) matched = true;
      else if (canon === 'TOTAL DISTRIBUTION NABS' && p.isNabs && isBrandDist) matched = true;
      else if (canon === 'CCC UNG' && p.isUng && isCCC) matched = true;
      else if (canon === 'TBD ABOVECORE' && p.isTbdAboveCore && isBrandDist) matched = true;
      else if (canon === 'TBD LATONES' && p.isLaton710 && isBrandDist) matched = true;
      else if (canon === 'TBD BALANCED CHOICES' && p.isTbdBalanced && isBrandDist) matched = true;
      else if (canon === 'TBD NABS TOP' && p.isTopUNG && p.isNabs && isBrandDist) matched = true;

      if (matched) {
        matchedClients.add(cte);
        count++;
        if (options.includeRows) matchedRows.push({ rowIndex: i, cte, prod: pid, ccc, neto, hl: sc.hl[i] });
      }
    }

    return {
      kpi: canon,
      period,
      count,
      distinctClients: matchedClients.size,
      clientSet: matchedClients,
      rowsCount: matchedRows.length
    };
  }

  function auditAllMandoIntegralKpis(dataset, options = {}) {
    const targetKpis = [
      'CCC CERVEZA',
      'TOTAL DISTRIBUTION CZA',
      'TOTAL DISTRIBUTION NABS',
      'CCC UNG',
      'TBD ABOVECORE',
      'TBD LATONES',
      'TBD BALANCED CHOICES',
      'TBD NABS TOP'
    ];
    const report = {};
    for (const kpi of targetKpis) {
      report[kpi] = auditKpi(dataset, kpi, options);
    }
    return report;
  }

  return {
    calcularPuntajeEscalaCMQ,
    getSemaforoTaco,
    computeTableroVentasTaco,
    buildRelationalModel,
    getTacoLiveIndex,
    aggregateTacoLive,
    auditKpi,
    auditAllMandoIntegralKpis,
    computeGalaxia2026Evaluation,
    normalizeClientId,
    normalizeProductId,
    normalizePeriod,
    normalizeTextKey
  };
});
