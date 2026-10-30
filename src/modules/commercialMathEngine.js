(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ArgonBI = root.ArgonBI || {};
    root.ArgonBI.CommercialMathEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ChannelUniverseConfig = (typeof window !== 'undefined' && window.ArgonBI && window.ArgonBI.ChannelUniverseConfig)
    ? window.ArgonBI.ChannelUniverseConfig
    : (typeof root !== 'undefined' && root.ArgonBI && root.ArgonBI.ChannelUniverseConfig)
      ? root.ArgonBI.ChannelUniverseConfig
      : (typeof require === 'function' ? require('./channelUniverseConfig.js') : null);

  function convertLitersToHL(liters) {
    const val = Number(liters) || 0;
    return Number((val / 100).toFixed(4));
  }

  function calcYoY(actual, prev) {
    const a = Number(actual) || 0;
    const p = Number(prev) || 0;
    const diff = Number((a - p).toFixed(2));
    if (p <= 0) {
      return {
        actual: Number(a.toFixed(2)),
        prev: Number(p.toFixed(2)),
        diff,
        varPct: null,
        varPctFormatted: p === 0 ? 'N/A (Base 0)' : 'N/A (Base neg.)'
      };
    }
    const varPct = Number((((a - p) / p) * 100).toFixed(2));
    return {
      actual: Number(a.toFixed(2)),
      prev: Number(p.toFixed(2)),
      diff,
      varPct,
      varPctFormatted: `${varPct > 0 ? '+' : ''}${varPct.toFixed(2)}%`
    };
  }

  // Build fast lookup maps on a bundle once
  function ensureIndexes(bundle) {
    if (bundle._indexed) return bundle._indexed;

    const prodMap = new Map();
    for (const p of bundle.masters.portfolio) {
      prodMap.set(Number(p.codigo), p);
    }

    const cteMap = new Map();
    for (const c of bundle.masters.clientes) {
      cteMap.set(Number(c.codigo), c);
    }

    const personalMap = new Map();
    for (const p of bundle.masters.personal) {
      personalMap.set(Number(p.codigo), p);
    }

    const tiempoMap = new Map();
    for (const t of bundle.masters.tiempo) {
      tiempoMap.set(t.periodo, t);
    }

    const perDict = bundle.dictionaries.periodos;
    const perMeta = perDict.map(per => {
      const t = tiempoMap.get(per);
      const anio = t ? t.anio : parseInt(per.slice(0, 4), 10);
      const mesNum = t ? t.mesNum : parseInt(per.slice(5, 7), 10);
      const trimestre = t ? t.trimestre : `${Math.ceil(mesNum / 3)}Q`;
      return {
        periodo: per,
        anio,
        mesNum,
        mesStr: String(mesNum).padStart(2, '0'),
        mesNombre: t ? t.mesNombre : per,
        trimestre
      };
    });

    const canalDict = bundle.dictionaries.canalesRaw;
    const canalResolved = bundle.dictionaries.canalesResolved;

    // Determine max active month in 2026 in salesColumnar
    let maxMonth2026 = 0;
    const sPer = bundle.salesColumnar.per;
    for (let i = 0; i < sPer.length; i++) {
      const pm = perMeta[sPer[i]];
      if (pm && pm.anio === 2026 && pm.mesNum > maxMonth2026) {
        maxMonth2026 = pm.mesNum;
      }
    }
    if (maxMonth2026 === 0) maxMonth2026 = 9;

    // Aiello & Delfines client code sets for Cadenitas segmentation
    const aielloCteSet = new Set();
    const delfinCteSet = new Set();
    const cadenitasCteSet = new Set();

    for (const c of (bundle.masters.clientes || [])) {
      const nom = String(c.nombre || '').toUpperCase();
      const rz = String(c.razonSocial || '').toUpperCase();
      const fan = String(c.fantasia || '').toUpperCase();
      const lp = String(c.listaPrecio || '').toUpperCase();
      const canal = String(c.canal || '').toUpperCase();
      const subcanal = String(c.subcanal || '').toUpperCase();

      const isAiello = nom.includes('AIELLO') || rz.includes('AIELLO') || fan.includes('AIELLO');
      const isDelfin = nom.includes('DELFIN') || rz.includes('DELFIN') || fan.includes('DELFIN') || lp.includes('DELFIN');
      const isCadenita = canal.includes('SUPERMERCADO') || subcanal.includes('CADENITA');

      if (isAiello) {
        aielloCteSet.add(c.codigo);
        cadenitasCteSet.add(c.codigo);
      }
      if (isDelfin) {
        delfinCteSet.add(c.codigo);
        cadenitasCteSet.add(c.codigo);
      }
      if (isCadenita) {
        cadenitasCteSet.add(c.codigo);
      }
    }

    bundle._indexed = {
      prodMap,
      cteMap,
      personalMap,
      tiempoMap,
      perDict,
      perMeta,
      canalDict,
      canalResolved,
      maxMonth2026,
      aielloCteSet,
      delfinCteSet,
      cadenitasCteSet
    };
    return bundle._indexed;
  }

  /**
   * Evaluates the entire commercial dashboard state from the active bundle and active filters.
   * Filters supported:
   * - modoComparacion: 'YTD' (default, homogeneous Jan..Sep or selected months) | 'ANUAL_2025' (Full 12m of 2025)
   * - mes: 'ALL' or '01'..'12'
   * - trimestre: 'ALL' or '1Q'|'2Q'|'3Q'|'4Q'
   * - canal: 'ALL' or raw canal name
   * - canalUnificado: 'ALL' or unified canal name
   * - unidadNegocio: 'ALL' or Unidad MKTP / Unidad de Negocio
   * - division: 'ALL' or Division name
   * - producto: 'ALL' or product code (number/string)
   * - cliente: 'ALL' or client code (number/string)
   * - vendedor: 'ALL' or vendedor code (number/string)
   * - supervisor: 'ALL' or supervisor code (number/string)
   * - includePOP: boolean (default true)
   */
  function evaluateDashboard(bundle, rawFilters = {}) {
    const idx = ensureIndexes(bundle);
    const filters = {
      modoComparacion: rawFilters.modoComparacion || 'YTD',
      mes: rawFilters.mes || 'ALL',
      mesDesde: rawFilters.mesDesde || 'ALL',
      mesHasta: rawFilters.mesHasta || 'ALL',
      trimestre: rawFilters.trimestre || 'ALL',
      canal: rawFilters.canal || 'ALL',
      canalUnificado: rawFilters.canalUnificado || 'ALL',
      unidadNegocio: rawFilters.unidadNegocio || 'ALL',
      division: rawFilters.division || 'ALL',
      producto: rawFilters.producto && rawFilters.producto !== 'ALL' ? Number(rawFilters.producto) : 'ALL',
      cliente: rawFilters.cliente && rawFilters.cliente !== 'ALL' ? Number(rawFilters.cliente) : 'ALL',
      vendedor: rawFilters.vendedor && rawFilters.vendedor !== 'ALL' ? Number(rawFilters.vendedor) : 'ALL',
      supervisor: rawFilters.supervisor && rawFilters.supervisor !== 'ALL' ? Number(rawFilters.supervisor) : 'ALL',
      includePOP: rawFilters.includePOP !== undefined ? Boolean(rawFilters.includePOP) : true,
      anio: String(rawFilters.anio || '2026')
    };

    // Año Base: con 2025, el ejercicio 2025 pasa a ser el período actual (sin año previo cargado).
    const baseYear = filters.anio === '2025' ? 2025 : 2026;
    const yrOf = (pm) => (baseYear === 2025 ? (pm.anio === 2025 ? 2026 : (pm.anio === 2026 ? 0 : pm.anio)) : pm.anio);
    const maxYTDMonth = baseYear === 2025 ? 12 : idx.maxMonth2026; // 9 (Septiembre) or updated to 10+
    const dNum = (filters.mesDesde && filters.mesDesde !== 'ALL') ? Number(filters.mesDesde) : null;
    const hNum = (filters.mesHasta && filters.mesHasta !== 'ALL') ? Number(filters.mesHasta) : null;

    // Helper: does a period's month pass the time slice filter (mes, range mesDesde..mesHasta, trimestre, YTD cutoff)?
    function passesMonthFilter(pm, enforceYTD) {
      if (dNum !== null && hNum !== null) {
        if (pm.mesNum < dNum || pm.mesNum > hNum) return false;
      } else if (dNum !== null) {
        if (pm.mesNum < dNum) return false;
      } else if (hNum !== null) {
        if (pm.mesNum > hNum) return false;
      } else if (filters.mes !== 'ALL' && pm.mesStr !== String(filters.mes).padStart(2, '0')) {
        return false;
      }
      if (filters.trimestre !== 'ALL' && pm.trimestre !== filters.trimestre) return false;
      if (enforceYTD && filters.mes === 'ALL' && dNum === null && hNum === null && filters.trimestre === 'ALL') {
        if (pm.mesNum > maxYTDMonth) return false;
      }
      return true;
    }

    // Helper: does a product pass UN / Division / Product filter?
    function passesProductFilter(prodCode) {
      if (filters.producto !== 'ALL' && prodCode !== filters.producto) return false;
      if (filters.unidadNegocio !== 'ALL' || filters.division !== 'ALL') {
        const p = idx.prodMap.get(prodCode);
        if (!p) return false;
        const un = p.unidadMktp || p.unidadNegocio;
        if (filters.unidadNegocio !== 'ALL' && un !== filters.unidadNegocio) return false;
        if (filters.division !== 'ALL' && p.division !== filters.division) return false;
      }
      return true;
    }

    // 1. Refrigerados / On Premise (REF): Includes KA Gastronómico and KA Nocturno
    const REF_CANAL_SET = new Set([
      'REF GASTRONOMICO',
      'REF NOCTURNO',
      'REF ENTRETENIMIENTO',
      'COMIDA',
      'BEBIDA',
      'Disco/Pub',
      'KA GASTRONOMICO',
      'KA NOCTURNO'
    ]);

    // 2. Mercado Hogar: Replaces Tradicional & Cercanía
    const MERCADO_HOGAR_SET = new Set([
      'Kioscos/Maxikioscos',
      'Tradicional',
      'Autoservicio'
    ]);

    // 3. Instituciones y Personal: Clean grouping without duplicates
    const INSTITUCIONES_SET = new Set([
      'Instituciones',
      'Clie Institucional',
      'Clie People'
    ]);

    // Helper: does a channel index pass Canal / CanalUnificado filter?
    function passesCanalFilter(canalIdx, cteCode = null) {
      if (filters.canal && filters.canal !== 'ALL' && filters.canal !== 'Todos los Canales') {
        const rawCanal = idx.canalDict[canalIdx];
        const u = ChannelUniverseConfig ? ChannelUniverseConfig.resolveUniverse(filters.canal) : null;
        if (u && u.key !== 'ALL') {
          if (!ChannelUniverseConfig.matchesUniverse(u, rawCanal, cteCode, idx)) return false;
        } else {
          if (filters.canal === 'REF_ALL') {
            if (!REF_CANAL_SET.has(rawCanal) && !(rawCanal && rawCanal.startsWith('REF '))) return false;
          } else if (filters.canal === 'MERCADO_HOGAR_ALL') {
            if (!MERCADO_HOGAR_SET.has(rawCanal)) return false;
          } else if (filters.canal === 'INSTITUCIONES_ALL') {
            if (!INSTITUCIONES_SET.has(rawCanal)) return false;
          } else if (filters.canal === 'CADENITAS_ALL') {
            if (rawCanal !== 'Supermercados' && !(cteCode && idx.cadenitasCteSet && idx.cadenitasCteSet.has(cteCode))) return false;
          } else if (filters.canal === 'CADENITAS_AIELLO' || filters.canal === 'AIELLOS' || filters.canal === 'Aiellos') {
            if (!cteCode || !idx.aielloCteSet || !idx.aielloCteSet.has(cteCode)) return false;
          } else if (filters.canal === 'CADENITAS_DELFIN' || filters.canal === 'DELFINES' || filters.canal === 'Delfines') {
            if (!cteCode || !idx.delfinCteSet || !idx.delfinCteSet.has(cteCode)) return false;
          } else if (rawCanal !== filters.canal) {
            return false;
          }
        }
      }
      if (filters.canalUnificado && filters.canalUnificado !== 'ALL' && filters.canalUnificado !== 'Todos (Unificados)') {
        const cr = idx.canalResolved[canalIdx];
        if (!cr || cr.canalUnificado !== filters.canalUnificado) return false;
      }
      return true;
    }

    const enforceYTD = (filters.modoComparacion === 'YTD' || filters.modoComparacion === 'YTD_HOMOGENEO' || !filters.modoComparacion);

    // Accumulators for 2026 (Actual) and 2025 (Anterior) + Full 2025
    let hl26 = 0, hl25 = 0, hl25Full = 0;
    let aielloHL25 = 0, aielloHL26 = 0;
    let aielloNeto25 = 0, aielloNeto26 = 0;
    const aielloCCC25 = new Set(), aielloCCC26 = new Set();
    let delfinHL25 = 0, delfinHL26 = 0;
    let delfinNeto25 = 0, delfinNeto26 = 0;
    const delfinCCC25 = new Set(), delfinCCC26 = new Set();
    let bultos26 = 0, bultos25 = 0;
    let neto26 = 0, neto25 = 0, neto25Full = 0;
    let bonif26 = 0, bonif25 = 0;
    let ops26 = 0, ops25 = 0;
    const cccSet26 = new Set();
    const cccSet25 = new Set();
    const cccSet25Full = new Set();

    // Universe totals (ignoring Canal and UN filters so we can also compute global share if needed, and filtered totals for internal share)
    // Monthly series (01..12)
    const monthly = Array.from({ length: 12 }, (_, i) => ({
      mesNum: i + 1,
      mesStr: String(i + 1).padStart(2, '0'),
      mesNombre: ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][i],
      trimestre: `${Math.ceil((i + 1) / 3)}Q`,
      hl25: 0, hl26: 0,
      bultos25: 0, bultos26: 0,
      neto25: 0, neto26: 0,
      bonif25: 0, bonif26: 0,
      ops25: 0, ops26: 0,
      objHL25: 0, objHL26: 0,
      cccSet25: new Set(),
      cccSet26: new Set()
    }));

    // Quarterly series (1Q..4Q)
    const quarterlyMap = {
      '1Q': { quarter: '1Q', label: 'T1 (Ene–Mar)', hl25: 0, hl26: 0, bultos25: 0, bultos26: 0, neto25: 0, neto26: 0, ops25: 0, ops26: 0, objHL25: 0, objHL26: 0, cccSet25: new Set(), cccSet26: new Set() },
      '2Q': { quarter: '2Q', label: 'T2 (Abr–Jun)', hl25: 0, hl26: 0, bultos25: 0, bultos26: 0, neto25: 0, neto26: 0, ops25: 0, ops26: 0, objHL25: 0, objHL26: 0, cccSet25: new Set(), cccSet26: new Set() },
      '3Q': { quarter: '3Q', label: 'T3 (Jul–Sep)', hl25: 0, hl26: 0, bultos25: 0, bultos26: 0, neto25: 0, neto26: 0, ops25: 0, ops26: 0, objHL25: 0, objHL26: 0, cccSet25: new Set(), cccSet26: new Set() },
      '4Q': { quarter: '4Q', label: 'T4 (Oct–Dic)', hl25: 0, hl26: 0, bultos25: 0, bultos26: 0, neto25: 0, neto26: 0, ops25: 0, ops26: 0, objHL25: 0, objHL26: 0, cccSet25: new Set(), cccSet26: new Set() }
    };

    // Group maps for Canal, Unidad de Negocio, División, Vendedor, Producto
    const byCanal = new Map();
    const byUN = new Map();
    const byDivision = new Map();
    const byVendedor = new Map();
    const byProducto = new Map();

    function getGroupBucket(map, key, label, extra = {}) {
      if (!map.has(key)) {
        map.set(key, {
          key,
          label,
          ...extra,
          hl25: 0, hl26: 0,
          bultos25: 0, bultos26: 0,
          neto25: 0, neto26: 0,
          bonif25: 0, bonif26: 0,
          ops25: 0, ops26: 0,
          objHL25: 0, objHL26: 0,
          cccSet25: new Set(),
          cccSet26: new Set()
        });
      }
      return map.get(key);
    }

    const sc = bundle.salesColumnar;
    const nSales = sc.count;

    for (let i = 0; i < nSales; i++) {
      if (!filters.includePOP && sc.source[i] === 1) continue;

      const cte = sc.cte[i];
      if (filters.cliente !== 'ALL' && cte !== filters.cliente) continue;

      const vend = sc.vend[i];
      if (filters.vendedor !== 'ALL' && vend !== filters.vendedor) continue;

      const sup = sc.sup[i];
      if (filters.supervisor !== 'ALL' && sup !== filters.supervisor) continue;

      const canalIdx = sc.canal[i];
      if (!passesCanalFilter(canalIdx, cte)) continue;

      const prod = sc.prod[i];
      if (!passesProductFilter(prod)) continue;

      const pm = idx.perMeta[sc.per[i]];
      if (!pm) continue;

      const hl = sc.hl[i];
      const bultos = sc.bultos[i];
      const neto = sc.neto[i];
      const bonif = sc.bonif[i];
      const bought = sc.ccc[i] > 0 || hl > 0 || bultos > 0;

      // Always accumulate into monthly & quarterly if it passes Mes/Trimestre filter (or across all months for the monthly chart)
      const mSlot = monthly[pm.mesNum - 1];
      const qSlot = quarterlyMap[pm.trimestre];
      if (yrOf(pm) === 2025) {
        mSlot.hl25 += hl; mSlot.bultos25 += bultos; mSlot.neto25 += neto; mSlot.bonif25 += bonif; mSlot.ops25++;
        if (bought) mSlot.cccSet25.add(cte);
        qSlot.hl25 += hl; qSlot.bultos25 += bultos; qSlot.neto25 += neto; qSlot.ops25++;
        if (bought) qSlot.cccSet25.add(cte);
        hl25Full += hl;
        neto25Full += neto;
        if (bought) cccSet25Full.add(cte);
      } else if (yrOf(pm) === 2026) {
        mSlot.hl26 += hl; mSlot.bultos26 += bultos; mSlot.neto26 += neto; mSlot.bonif26 += bonif; mSlot.ops26++;
        if (bought) mSlot.cccSet26.add(cte);
        qSlot.hl26 += hl; qSlot.bultos26 += bultos; qSlot.neto26 += neto; qSlot.ops26++;
        if (bought) qSlot.cccSet26.add(cte);
      }

      // Now check if it passes the active time slice (Mes, Trimestre, and YTD homogeneity cutoff)
      if (!passesMonthFilter(pm, enforceYTD)) continue;

      const canalName = idx.canalDict[canalIdx] || 'Sin Canal';
      const canalRes = idx.canalResolved[canalIdx] || { canalUnificado: canalName, segmentoCanal: '' };
      const prodInfo = idx.prodMap.get(prod);
      const unName = prodInfo ? (prodInfo.unidadMktp || prodInfo.unidadNegocio) : 'OTROS';
      const divName = prodInfo ? prodInfo.division : 'OTROS';
      const prodLabel = prodInfo ? `${prodInfo.producto} (#${prod})` : `Producto #${prod}`;
      const vendInfo = idx.personalMap.get(vend);
      const vendLabel = vendInfo ? `${vendInfo.nombre} (#${vend})` : `Vendedor #${vend}`;

      const bC = getGroupBucket(byCanal, canalName, canalName, { canalUnificado: canalRes.canalUnificado, segmentoCanal: canalRes.segmentoCanal });
      const bU = getGroupBucket(byUN, unName, unName);
      const bD = getGroupBucket(byDivision, divName, divName, { unidadNegocio: unName });
      const bV = getGroupBucket(byVendedor, vend, vendLabel, { supervisor: vendInfo ? vendInfo.superior : '' });
      const bP = getGroupBucket(byProducto, prod, prodLabel, { marca: prodInfo ? prodInfo.marca : '', unidadNegocio: unName, division: divName });

      if (yrOf(pm) === 2025) {
        hl25 += hl; bultos25 += bultos; neto25 += neto; bonif25 += bonif; ops25++;
        if (bought) cccSet25.add(cte);

        bC.hl25 += hl; bC.bultos25 += bultos; bC.neto25 += neto; bC.bonif25 += bonif; bC.ops25++;
        bU.hl25 += hl; bU.bultos25 += bultos; bU.neto25 += neto; bU.bonif25 += bonif; bU.ops25++;
        bD.hl25 += hl; bD.bultos25 += bultos; bD.neto25 += neto; bD.bonif25 += bonif; bD.ops25++;
        bV.hl25 += hl; bV.bultos25 += bultos; bV.neto25 += neto; bV.bonif25 += bonif; bV.ops25++;
        bP.hl25 += hl; bP.bultos25 += bultos; bP.neto25 += neto; bP.bonif25 += bonif; bP.ops25++;
        if (bought) {
          bC.cccSet25.add(cte);
          bU.cccSet25.add(cte);
          bD.cccSet25.add(cte);
          bV.cccSet25.add(cte);
          bP.cccSet25.add(cte);
        }
      } else if (yrOf(pm) === 2026) {
        hl26 += hl; bultos26 += bultos; neto26 += neto; bonif26 += bonif; ops26++;
        if (bought) cccSet26.add(cte);

        bC.hl26 += hl; bC.bultos26 += bultos; bC.neto26 += neto; bC.bonif26 += bonif; bC.ops26++;
        bU.hl26 += hl; bU.bultos26 += bultos; bU.neto26 += neto; bU.bonif26 += bonif; bU.ops26++;
        bD.hl26 += hl; bD.bultos26 += bultos; bD.neto26 += neto; bD.bonif26 += bonif; bD.ops26++;
        bV.hl26 += hl; bV.bultos26 += bultos; bV.neto26 += neto; bV.bonif26 += bonif; bV.ops26++;
        bP.hl26 += hl; bP.bultos26 += bultos; bP.neto26 += neto; bP.bonif26 += bonif; bP.ops26++;
        if (bought) {
          bC.cccSet26.add(cte);
          bU.cccSet26.add(cte);
          bD.cccSet26.add(cte);
          bV.cccSet26.add(cte);
          bP.cccSet26.add(cte);
        }
      }

      // Specific Cadenitas (Aiello & Delfines) tracking
      if (idx.aielloCteSet && idx.aielloCteSet.has(cte)) {
        if (yrOf(pm) === 2025) { aielloHL25 += hl; aielloNeto25 += neto; if (bought) aielloCCC25.add(cte); }
        else if (yrOf(pm) === 2026) { aielloHL26 += hl; aielloNeto26 += neto; if (bought) aielloCCC26.add(cte); }
      }
      if (idx.delfinCteSet && idx.delfinCteSet.has(cte)) {
        if (yrOf(pm) === 2025) { delfinHL25 += hl; delfinNeto25 += neto; if (bought) delfinCCC25.add(cte); }
        else if (yrOf(pm) === 2026) { delfinHL26 += hl; delfinNeto26 += neto; if (bought) delfinCCC26.add(cte); }
      }
    }

    // Evaluate Objectives (Base Obj.)
    let objHL25 = 0, objHL26 = 0, objHL25Full = 0;
    const oc = bundle.objColumnar;
    if (oc && filters.cliente === 'ALL') {
      const nObj = oc.count;
      for (let i = 0; i < nObj; i++) {
        if (filters.vendedor !== 'ALL' && oc.vend[i] !== filters.vendedor) continue;
        if (filters.supervisor !== 'ALL' && oc.sup[i] !== filters.supervisor) continue;
        const canalIdx = oc.canal[i];
        const isClientSpecificFilter = (
          filters.canal === 'CADENITAS_AIELLO' ||
          filters.canal === 'CADENITAS_DELFIN' ||
          filters.canal === 'AIELLOS' ||
          filters.canal === 'Aiellos' ||
          filters.canal === 'DELFINES' ||
          filters.canal === 'Delfines'
        );
        if (isClientSpecificFilter) {
          if (idx.canalDict[canalIdx] !== 'Supermercados') continue;
        } else if (!passesCanalFilter(canalIdx)) {
          continue;
        }
        const prod = oc.prod[i];
        if (!passesProductFilter(prod)) continue;

        const pm = idx.perMeta[oc.per[i]];
        if (!pm) continue;
        const ohl = oc.hl[i];

        const mSlot = monthly[pm.mesNum - 1];
        const qSlot = quarterlyMap[pm.trimestre];
        if (yrOf(pm) === 2025) {
          mSlot.objHL25 += ohl;
          qSlot.objHL25 += ohl;
          objHL25Full += ohl;
        } else if (yrOf(pm) === 2026) {
          mSlot.objHL26 += ohl;
          qSlot.objHL26 += ohl;
        }

        if (!passesMonthFilter(pm, enforceYTD)) continue;

        const canalName = idx.canalDict[canalIdx] || 'Sin Canal';
        const prodInfo = idx.prodMap.get(prod);
        const unName = prodInfo ? (prodInfo.unidadMktp || prodInfo.unidadNegocio) : 'OTROS';
        const divName = prodInfo ? prodInfo.division : 'OTROS';
        const vend = oc.vend[i];
        const vendInfo = idx.personalMap.get(vend);
        const vendLabel = vendInfo ? `${vendInfo.nombre} (#${vend})` : `Vendedor #${vend}`;
        const canalRes = idx.canalResolved[canalIdx] || { canalUnificado: canalName, segmentoCanal: '' };

        const bC = getGroupBucket(byCanal, canalName, canalName, { canalUnificado: canalRes.canalUnificado, segmentoCanal: canalRes.segmentoCanal });
        const bU = getGroupBucket(byUN, unName, unName);
        const bD = getGroupBucket(byDivision, divName, divName, { unidadNegocio: unName });
        const bV = getGroupBucket(byVendedor, vend, vendLabel, { supervisor: vendInfo ? vendInfo.superior : '' });

        if (yrOf(pm) === 2025) {
          objHL25 += ohl;
          bC.objHL25 += ohl; bU.objHL25 += ohl; bD.objHL25 += ohl; bV.objHL25 += ohl;
        } else if (yrOf(pm) === 2026) {
          objHL26 += ohl;
          bC.objHL26 += ohl; bU.objHL26 += ohl; bD.objHL26 += ohl; bV.objHL26 += ohl;
        }
      }
    }

    // Evaluate CNC (Base CNC)
    let cncUniv25 = 0, cncAct25 = 0, cncNoComp25 = 0;
    let cncUniv26 = 0, cncAct26 = 0, cncNoComp26 = 0;
    const cncUniqueCtes25 = new Set();
    const cncUniqueCtes26 = new Set();
    const cc = bundle.cncColumnar;
    if (cc && filters.unidadNegocio === 'ALL' && filters.division === 'ALL' && filters.producto === 'ALL' && filters.vendedor === 'ALL' && filters.supervisor === 'ALL') {
      for (let i = 0; i < cc.count; i++) {
        if (filters.cliente !== 'ALL' && cc.cte[i] !== filters.cliente) continue;
        if (!passesCanalFilter(cc.canal[i], cc.cte[i])) continue;
        const pm = idx.perMeta[cc.per[i]];
        if (!pm || !passesMonthFilter(pm, enforceYTD)) continue;
        if (yrOf(pm) === 2025) {
          cncUniv25 += cc.univ[i];
          cncAct25 += cc.act[i];
          cncNoComp25 += cc.cnc[i];
          cncUniqueCtes25.add(cc.cte[i]);
        } else if (yrOf(pm) === 2026) {
          cncUniv26 += cc.univ[i];
          cncAct26 += cc.act[i];
          cncNoComp26 += cc.cnc[i];
          cncUniqueCtes26.add(cc.cte[i]);
        }
      }
    }

    // Evaluate Eficiencia (Base Eficiencia)
    let vis25 = 0, visEf25 = 0, visFR25 = 0;
    let vis26 = 0, visEf26 = 0, visFR26 = 0;
    if (bundle.eficienciaAgg && filters.unidadNegocio === 'ALL' && filters.division === 'ALL' && filters.producto === 'ALL') {
      for (const e of bundle.eficienciaAgg) {
        const cIdx = idx.canalDict.indexOf(e.canal);
        if (cIdx >= 0 && !passesCanalFilter(cIdx)) continue;
        const t = idx.tiempoMap.get(e.per);
        if (!t) continue;
        const pm = { anio: t.anio, mesNum: t.mesNum, mesStr: String(t.mesNum).padStart(2, '0'), trimestre: t.trimestre };
        if (!passesMonthFilter(pm, enforceYTD)) continue;
        if (yrOf(pm) === 2025) {
          vis25 += e.vis; visEf25 += e.visEf; visFR25 += e.visFR;
        } else if (yrOf(pm) === 2026) {
          vis26 += e.vis; visEf26 += e.visEf; visFR26 += e.visFR;
        }
      }
    }

    // Evaluate MXPDV (Base MXPDV)
    let mxPdv25 = 0, mxSum25 = 0;
    let mxPdv26 = 0, mxSum26 = 0;
    if (bundle.mxpdvAgg && filters.unidadNegocio === 'ALL' && filters.division === 'ALL' && filters.producto === 'ALL') {
      for (const m of bundle.mxpdvAgg) {
        if (filters.vendedor !== 'ALL' && m.vend !== filters.vendedor) continue;
        if (filters.supervisor !== 'ALL' && m.sup !== filters.supervisor) continue;
        const cIdx = idx.canalDict.indexOf(m.canal);
        if (cIdx >= 0 && !passesCanalFilter(cIdx)) continue;
        const t = idx.tiempoMap.get(m.per);
        if (!t) continue;
        const pm = { anio: t.anio, mesNum: t.mesNum, mesStr: String(t.mesNum).padStart(2, '0'), trimestre: t.trimestre };
        if (!passesMonthFilter(pm, enforceYTD)) continue;
        if (yrOf(pm) === 2025) {
          mxPdv25 += m.pdvCount; mxSum25 += m.sumMarcas;
        } else if (yrOf(pm) === 2026) {
          mxPdv26 += m.pdvCount; mxSum26 += m.sumMarcas;
        }
      }
    }

    // Evaluate Rechazos (Base Rechazos)
    let recHL25 = 0, recBultos25 = 0, recNeto25 = 0, recCount25 = 0;
    let recHL26 = 0, recBultos26 = 0, recNeto26 = 0, recCount26 = 0;
    const recByMotivo = new Map();
    if (bundle.rechazos) {
      for (const r of bundle.rechazos) {
        if (filters.cliente !== 'ALL' && r.cte !== filters.cliente) continue;
        const cIdx = idx.canalDict.indexOf(r.canal);
        if (filters.canal !== 'ALL' && r.canal !== filters.canal) continue;
        if (filters.canalUnificado !== 'ALL' && cIdx >= 0 && !passesCanalFilter(cIdx)) continue;
        const t = idx.tiempoMap.get(r.per);
        if (!t) continue;
        const pm = { anio: t.anio, mesNum: t.mesNum, mesStr: String(t.mesNum).padStart(2, '0'), trimestre: t.trimestre };
        if (!passesMonthFilter(pm, enforceYTD)) continue;
        if (yrOf(pm) === 2025) {
          recHL25 += r.hl; recBultos25 += r.bultos; recNeto25 += r.neto; recCount25++;
        } else if (yrOf(pm) === 2026) {
          recHL26 += r.hl; recBultos26 += r.bultos; recNeto26 += r.neto; recCount26++;
        }
        const mKey = r.motivo || 'SIN MOTIVO ESPECIFICADO';
        if (!recByMotivo.has(mKey)) recByMotivo.set(mKey, { motivo: mKey, count25: 0, hl25: 0, neto25: 0, count26: 0, hl26: 0, neto26: 0 });
        const mb = recByMotivo.get(mKey);
        if (yrOf(pm) === 2025) { mb.count25++; mb.hl25 += r.hl; mb.neto25 += r.neto; }
        else if (yrOf(pm) === 2026) { mb.count26++; mb.hl26 += r.hl; mb.neto26 += r.neto; }
      }
    }

    // Finalize group buckets with shares and YoY variations
    function finalizeBuckets(map) {
      const list = [];
      for (const b of map.values()) {
        const ccc25 = b.cccSet25.size;
        const ccc26 = b.cccSet26.size;
        const hlYoY = calcYoY(b.hl26, b.hl25);
        const netoYoY = calcYoY(b.neto26, b.neto25);
        const cccYoY = calcYoY(ccc26, ccc25);
        const shareHL25 = hl25 > 0 ? Number(((b.hl25 / hl25) * 100).toFixed(2)) : 0;
        const shareHL26 = hl26 > 0 ? Number(((b.hl26 / hl26) * 100).toFixed(2)) : 0;
        const shareNeto26 = neto26 > 0 ? Number(((b.neto26 / neto26) * 100).toFixed(2)) : 0;
        const cumplObj26 = b.objHL26 > 0 ? Number(((b.hl26 / b.objHL26) * 100).toFixed(2)) : null;

        list.push({
          key: b.key,
          label: b.label,
          canalUnificado: b.canalUnificado || null,
          segmentoCanal: b.segmentoCanal || null,
          unidadNegocio: b.unidadNegocio || null,
          division: b.division || null,
          marca: b.marca || null,
          supervisor: b.supervisor || null,
          hl25: Number(b.hl25.toFixed(2)),
          hl26: Number(b.hl26.toFixed(2)),
          hlDiff: hlYoY.diff,
          hlVarPct: hlYoY.varPct,
          bultos25: Number(b.bultos25.toFixed(2)),
          bultos26: Number(b.bultos26.toFixed(2)),
          neto25: Number(b.neto25.toFixed(2)),
          neto26: Number(b.neto26.toFixed(2)),
          netoDiff: netoYoY.diff,
          netoVarPct: netoYoY.varPct,
          bonif25: Number(b.bonif25.toFixed(2)),
          bonif26: Number(b.bonif26.toFixed(2)),
          ops25: b.ops25,
          ops26: b.ops26,
          ccc25,
          ccc26,
          cccDiff: cccYoY.diff,
          cccVarPct: cccYoY.varPct,
          precioPromHL25: b.hl25 > 0 ? Number((b.neto25 / b.hl25).toFixed(2)) : 0,
          precioPromHL26: b.hl26 > 0 ? Number((b.neto26 / b.hl26).toFixed(2)) : 0,
          shareHL25,
          shareHL26,
          shareHLDiffPts: Number((shareHL26 - shareHL25).toFixed(2)),
          shareNeto26,
          objHL25: Number(b.objHL25.toFixed(2)),
          objHL26: Number(b.objHL26.toFixed(2)),
          cumplObj26Pct: cumplObj26
        });
      }
      return list.sort((a, b) => b.hl26 - a.hl26 || b.hl25 - a.hl25);
    }

    const monthlySeries = monthly.map(m => {
      const ccc25 = m.cccSet25.size;
      const ccc26 = m.cccSet26.size;
      const hlYoY = calcYoY(m.hl26, m.hl25);
      const netoYoY = calcYoY(m.neto26, m.neto25);
      const cccYoY = calcYoY(ccc26, ccc25);
      return {
        mesNum: m.mesNum,
        mesStr: m.mesStr,
        mesNombre: m.mesNombre,
        trimestre: m.trimestre,
        isInactive2026: m.mesNum > maxYTDMonth && m.hl26 === 0 && m.ops26 === 0,
        hl25: Number(m.hl25.toFixed(2)),
        hl26: Number(m.hl26.toFixed(2)),
        hlDiff: hlYoY.diff,
        hlVarPct: hlYoY.varPct,
        bultos25: Number(m.bultos25.toFixed(2)),
        bultos26: Number(m.bultos26.toFixed(2)),
        neto25: Number(m.neto25.toFixed(2)),
        neto26: Number(m.neto26.toFixed(2)),
        netoDiff: netoYoY.diff,
        netoVarPct: netoYoY.varPct,
        bonif25: Number(m.bonif25.toFixed(2)),
        bonif26: Number(m.bonif26.toFixed(2)),
        ops25: m.ops25,
        ops26: m.ops26,
        ccc25,
        ccc26,
        cccDiff: cccYoY.diff,
        cccVarPct: cccYoY.varPct,
        precioPromHL25: m.hl25 > 0 ? Number((m.neto25 / m.hl25).toFixed(2)) : 0,
        precioPromHL26: m.hl26 > 0 ? Number((m.neto26 / m.hl26).toFixed(2)) : 0,
        objHL25: Number(m.objHL25.toFixed(2)),
        objHL26: Number(m.objHL26.toFixed(2)),
        cumplObj26Pct: m.objHL26 > 0 ? Number(((m.hl26 / m.objHL26) * 100).toFixed(2)) : null
      };
    });

    const quarterlySeries = ['1Q', '2Q', '3Q', '4Q'].map(qKey => {
      const q = quarterlyMap[qKey];
      const ccc25 = q.cccSet25.size;
      const ccc26 = q.cccSet26.size;
      const hlYoY = calcYoY(q.hl26, q.hl25);
      const netoYoY = calcYoY(q.neto26, q.neto25);
      const cccYoY = calcYoY(ccc26, ccc25);
      return {
        quarter: q.quarter,
        label: q.label,
        isInactive2026: qKey === '4Q' && q.hl26 === 0 && q.ops26 === 0,
        hl25: Number(q.hl25.toFixed(2)),
        hl26: Number(q.hl26.toFixed(2)),
        hlDiff: hlYoY.diff,
        hlVarPct: hlYoY.varPct,
        bultos25: Number(q.bultos25.toFixed(2)),
        bultos26: Number(q.bultos26.toFixed(2)),
        neto25: Number(q.neto25.toFixed(2)),
        neto26: Number(q.neto26.toFixed(2)),
        netoDiff: netoYoY.diff,
        netoVarPct: netoYoY.varPct,
        ops25: q.ops25,
        ops26: q.ops26,
        ccc25,
        ccc26,
        cccDiff: cccYoY.diff,
        cccVarPct: cccYoY.varPct,
        precioPromHL25: q.hl25 > 0 ? Number((q.neto25 / q.hl25).toFixed(2)) : 0,
        precioPromHL26: q.hl26 > 0 ? Number((q.neto26 / q.hl26).toFixed(2)) : 0,
        objHL25: Number(q.objHL25.toFixed(2)),
        objHL26: Number(q.objHL26.toFixed(2)),
        cumplObj26Pct: q.objHL26 > 0 ? Number(((q.hl26 / q.objHL26) * 100).toFixed(2)) : null
      };
    });

    const precioProm25 = hl25 > 0 ? Number((neto25 / hl25).toFixed(2)) : 0;
    const precioProm26 = hl26 > 0 ? Number((neto26 / hl26).toFixed(2)) : 0;

    const monthNamesShort = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const maxMonthName = monthNamesShort[Math.min(11, Math.max(0, maxYTDMonth - 1))];
    const isStandardYTD = (dNum === 1 || dNum === null) && (hNum === maxYTDMonth || hNum === null) && enforceYTD && filters.trimestre === 'ALL' && filters.mes === 'ALL';

    const kpis = {
      periodoLabel: isStandardYTD
        ? `YTD (Ene–${maxMonthName} ${baseYear} vs Ene–${maxMonthName} ${baseYear - 1})`
        : ((dNum !== null && hNum !== null)
          ? (dNum === hNum
            ? `Mes ${String(dNum).padStart(2, '0')} (${baseYear} vs ${baseYear - 1})`
            : `Rango Meses ${String(dNum).padStart(2, '0')} a ${String(hNum).padStart(2, '0')} (${baseYear} vs ${baseYear - 1})`)
          : (filters.mes !== 'ALL'
            ? `Mes ${filters.mes} (${baseYear} vs ${baseYear - 1})`
            : (filters.trimestre !== 'ALL'
              ? `Trimestre ${filters.trimestre} (${baseYear} vs ${baseYear - 1})`
              : (enforceYTD ? `YTD (Ene–${maxMonthName} ${baseYear} vs Ene–${maxMonthName} ${baseYear - 1})` : `2026 (Ene–${maxMonthName}) vs 2025 Completo (Ene–Dic)`)))),
      volumenHL: calcYoY(hl26, hl25),
      bultos: calcYoY(bultos26, bultos25),
      facturacionNeta: calcYoY(neto26, neto25),
      bonificaciones: calcYoY(bonif26, bonif25),
      ccc: calcYoY(cccSet26.size, cccSet25.size),
      operaciones: calcYoY(ops26, ops25),
      precioPromedioHL: calcYoY(precioProm26, precioProm25),
      objetivoHL: {
        available: filters.cliente === 'ALL' && (objHL26 > 0 || objHL25 > 0),
        reasonIfUnavailable: filters.cliente !== 'ALL' ? 'No disponible al filtrar por un cliente individual (optimización de memoria columnar).' : null,
        obj25: Number(objHL25.toFixed(2)),
        obj26: Number(objHL26.toFixed(2)),
        cumplimiento25Pct: objHL25 > 0 ? Number(((hl25 / objHL25) * 100).toFixed(2)) : null,
        cumplimiento26Pct: objHL26 > 0 ? Number(((hl26 / objHL26) * 100).toFixed(2)) : null,
        gapHL26: Number((hl26 - objHL26).toFixed(2))
      },
      fullYear2025Reference: {
        hl: Number(hl25Full.toFixed(2)),
        neto: Number(neto25Full.toFixed(2)),
        ccc: cccSet25Full.size,
        objHL: Number(objHL25Full.toFixed(2))
      },
      complementarios: {
        cnc: {
          available: cncAct26 > 0 || cncAct25 > 0,
          reasonIfUnavailable: 'El padrón CNC sólo se desglosa por Período, Canal y Cliente (no por Producto/Unidad de Negocio).',
          univ25: cncUniv25,
          act25: cncAct25,
          noComp25: cncNoComp25,
          tasaCNC25Pct: cncAct25 > 0 ? Number(((cncNoComp25 / cncAct25) * 100).toFixed(2)) : null,
          univ26: cncUniv26,
          act26: cncAct26,
          noComp26: cncNoComp26,
          tasaCNC26Pct: cncAct26 > 0 ? Number(((cncNoComp26 / cncAct26) * 100).toFixed(2)) : null,
          clientesUnicosPadron26: cncUniqueCtes26.size
        },
        eficiencia: {
          available: vis26 > 0 || vis25 > 0,
          reasonIfUnavailable: 'La Base Eficiencia se desglosa por Período y Canal Comercial.',
          visitas25: vis25,
          efectivas25: visEf25,
          fueraRuta25: visFR25,
          efectividad25Pct: vis25 > 0 ? Number(((visEf25 / vis25) * 100).toFixed(2)) : null,
          visitas26: vis26,
          efectivas26: visEf26,
          fueraRuta26: visFR26,
          efectividad26Pct: vis26 > 0 ? Number(((visEf26 / vis26) * 100).toFixed(2)) : null
        },
        mxpdv: {
          available: mxPdv26 > 0 || mxPdv25 > 0,
          reasonIfUnavailable: 'La Base MXPDV se desglosa por Período, Canal, Vendedor y Supervisor.',
          promMarcas25: mxPdv25 > 0 ? Number((mxSum25 / mxPdv25).toFixed(2)) : null,
          promMarcas26: mxPdv26 > 0 ? Number((mxSum26 / mxPdv26).toFixed(2)) : null
        },
        rechazos: {
          available: true,
          hl25: Number(recHL25.toFixed(2)),
          bultos25: Number(recBultos25.toFixed(2)),
          neto25: Number(recNeto25.toFixed(2)),
          count25: recCount25,
          tasaRechazoHL25Pct: hl25 > 0 ? Number(((recHL25 / hl25) * 100).toFixed(2)) : null,
          hl26: Number(recHL26.toFixed(2)),
          bultos26: Number(recBultos26.toFixed(2)),
          neto26: Number(recNeto26.toFixed(2)),
          count26: recCount26,
          tasaRechazoHL26Pct: hl26 > 0 ? Number(((recHL26 / hl26) * 100).toFixed(2)) : null,
          porMotivo: [...recByMotivo.values()].sort((a, b) => b.hl26 - a.hl26)
        }
      }
    };

    return {
      filters,
      kpis,
      monthlySeries,
      quarterlySeries,
      byCanal: finalizeBuckets(byCanal),
      byUnidadNegocio: finalizeBuckets(byUN),
      byDivision: finalizeBuckets(byDivision),
      byVendedor: finalizeBuckets(byVendedor),
      byProducto: finalizeBuckets(byProducto),
      cadenitasBreakdown: {
        aiello: {
          nombre: 'Supermercados Aiello',
          hl25: Number(aielloHL25.toFixed(2)),
          hl26: Number(aielloHL26.toFixed(2)),
          neto25: Number(aielloNeto25.toFixed(2)),
          neto26: Number(aielloNeto26.toFixed(2)),
          ccc25: aielloCCC25.size,
          ccc26: aielloCCC26.size
        },
        delfines: {
          nombre: 'Supermercados Delfines',
          hl25: Number(delfinHL25.toFixed(2)),
          hl26: Number(delfinHL26.toFixed(2)),
          neto25: Number(delfinNeto25.toFixed(2)),
          neto26: Number(delfinNeto26.toFixed(2)),
          ccc25: delfinCCC25.size,
          ccc26: delfinCCC26.size
        }
      }
    };
  }

  // Summarize Activos Fijos & Negociaciones
  function evaluateOperationalBases(bundle) {
    const af = bundle.activosFijos || [];
    let totalCoolers = af.length;
    let instalados = 0, enStock = 0, deBaja = 0;
    let litrosRepagoTotal = 0, hlRepagoTotal = 0;
    let litrosVentaPromTotal = 0, hlVentaPromTotal = 0;
    let repagaSi = 0, repagaNo = 0;
    const clientesConCooler = new Set();
    const byUN = {};
    const byLogo = {};

    for (const item of af) {
      if (item.estado === 'INSTALADO') instalados++;
      else if (item.estado === 'EN STOCK') enStock++;
      else if (item.estado === 'DE BAJA') deBaja++;

      litrosRepagoTotal += item.litrosRepago;
      hlRepagoTotal += item.hlRepago;
      litrosVentaPromTotal += item.ventaPromLitros;
      hlVentaPromTotal += item.ventaPromHL;

      if (item.repaga === 'SI') repagaSi++;
      else repagaNo++;

      if (item.cliente) clientesConCooler.add(item.cliente);
      byUN[item.unidadNegocio] = (byUN[item.unidadNegocio] || 0) + 1;
      byLogo[item.logo] = (byLogo[item.logo] || 0) + 1;
    }

    const neg = (bundle.negociaciones && bundle.negociaciones.items) || [];
    const clientesNegociados = new Set();
    let sumBonif = 0;
    const byGrupo = new Map();
    for (const n of neg) {
      clientesNegociados.add(n.cliente);
      sumBonif += n.bonifPorc;
      const gKey = n.descripcionGrupoArticulo || `Código ${n.codigoGrupoArticulo}`;
      if (!byGrupo.has(gKey)) byGrupo.set(gKey, { descripcion: gKey, acuerdos: 0, clientes: new Set(), sumBonif: 0 });
      const g = byGrupo.get(gKey);
      g.acuerdos++;
      g.clientes.add(n.cliente);
      g.sumBonif += n.bonifPorc;
    }

    return {
      activosFijos: {
        totalEquipos: totalCoolers,
        instalados,
        enStock,
        deBaja,
        clientesUnicosConActivo: clientesConCooler.size,
        litrosRepagoTotal: Number(litrosRepagoTotal.toFixed(2)),
        hlRepagoTotal: Number(hlRepagoTotal.toFixed(2)),
        hlVentaPromTotal: Number(hlVentaPromTotal.toFixed(2)),
        repagaSi,
        repagaNo,
        porcRepagaSobreInstalados: instalados > 0 ? Number(((repagaSi / instalados) * 100).toFixed(2)) : 0,
        porUnidadNegocio: byUN,
        porLogo: byLogo
      },
      negociaciones: {
        totalAcuerdos: neg.length,
        clientesNegociados: clientesNegociados.size,
        bonifPromedioPct: neg.length > 0 ? Number((sumBonif / neg.length).toFixed(2)) : 0,
        porGrupoProducto: [...byGrupo.values()].map(g => ({
          descripcion: g.descripcion,
          acuerdos: g.acuerdos,
          clientesUnicos: g.clientes.size,
          bonifPromedioPct: Number((g.sumBonif / g.acuerdos).toFixed(2))
        })).sort((a, b) => b.acuerdos - a.acuerdos)
      }
    };
  }

  return {
    convertLitersToHL,
    calcYoY,
    ensureIndexes,
    evaluateDashboard,
    evaluateOperationalBases,
    ChannelUniverseConfig,
    CHANNEL_UNIVERSES: ChannelUniverseConfig ? ChannelUniverseConfig.CHANNEL_UNIVERSES : null,
    resolveUniverse: ChannelUniverseConfig ? ChannelUniverseConfig.resolveUniverse : null,
    matchesUniverse: ChannelUniverseConfig ? ChannelUniverseConfig.matchesUniverse : null
  };
});
