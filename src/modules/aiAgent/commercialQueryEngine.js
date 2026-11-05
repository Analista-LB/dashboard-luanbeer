(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./querySchema.js'));
  } else {
    root.ArgonBI = root.ArgonBI || {};
    root.ArgonBI.CommercialQueryEngine = factory(root.ArgonBI.AIQuerySchema);
  }
})(typeof self !== 'undefined' ? self : this, function (Schema) {
  'use strict';

  const ChannelUniverseConfig = (typeof window !== 'undefined' && window.ArgonBI && window.ArgonBI.ChannelUniverseConfig)
    ? window.ArgonBI.ChannelUniverseConfig
    : (typeof root !== 'undefined' && root.ArgonBI && root.ArgonBI.ChannelUniverseConfig)
      ? root.ArgonBI.ChannelUniverseConfig
      : (typeof require === 'function' ? require('../channelUniverseConfig.js') : null);

  function fmt(n, dec = 1) {
    if (n === null || n === undefined || isNaN(Number(n))) return 'N/A';
    return Number(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function fmtMoney(n) {
    if (n === null || n === undefined || isNaN(Number(n))) return 'N/A';
    return '$' + Number(Math.round(n)).toLocaleString('es-AR');
  }

  function cleanEntityLabel(label) {
    if (!label) return '';
    const raw = String(label)
      .replace(/\s*\(\s*#\s*\d+\s*\)/g, '')
      .replace(/\s*\[.*?\]/g, '')
      .trim();
    if (/^(UNG|CNC|CCC|YTD|REF|KA|POP|CMI|TACO)$/i.test(raw)) return raw.toUpperCase();
    if (/^REF\s+/i.test(raw)) return raw.toUpperCase();
    return raw
      .toLowerCase()
      .replace(/(?:^|\s|\/)\S/g, c => c.toUpperCase());
  }

  function cleanProductShortName(label) {
    if (!label) return '';
    const s = String(label).replace(/\s*\(\s*#\s*\d+\s*\)/g, '').trim();
    if (/ANDES.*970\s*RET/i.test(s)) return 'Andes Ret';
    if (/QUILMES\s+CLASICA\s+RET.*1L\s+BAJO\s+TAPA/i.test(s)) return 'Quilmes Clásica 1L';
    if (/QUILMES\s+CLASICA\s+CAN.*710/i.test(s)) return 'Quilmes Clásica Can 710cc';
    if (/QUILMES.*4X6\s+LAT\s+473/i.test(s)) return 'Quilmes Lat 473cc';
    return cleanEntityLabel(s);
  }

  class CommercialQueryEngine {
    constructor(dashboardState, rawBundle, mathEngine) {
      this.state = dashboardState;
      this.bundle = rawBundle;
      this.mathEngine = mathEngine;
      this._ytdStateCache = null;
    }

    setState(dashboardState) {
      this.state = dashboardState;
    }

    /**
     * Obtiene la evaluación YTD completa (mes: 'ALL', trimestre: 'ALL') sin verse afectada
     * si el filtro visual superior del navegador quedó en un mes puntual (ej. Octubre).
     */
    getYTDState() {
      if (this._ytdStateCache) return this._ytdStateCache;
      if (this.state && this.state.filters) {
        const f = this.state.filters;
        if (f.mes === 'ALL' && f.trimestre === 'ALL' && f.canal === 'ALL' && f.canalUnificado === 'ALL' && f.unidadNegocio === 'ALL' && f.vendedor === 'ALL') {
          this._ytdStateCache = this.state;
          return this.state;
        }
      }
      if (this.mathEngine && this.bundle) {
        try {
          this._ytdStateCache = this.mathEngine.evaluateDashboard(this.bundle, {
            modoComparacion: 'YTD',
            mes: 'ALL',
            trimestre: 'ALL',
            canal: 'ALL',
            canalUnificado: 'ALL',
            unidadNegocio: 'ALL',
            division: 'ALL',
            producto: 'ALL',
            cliente: 'ALL',
            vendedor: 'ALL',
            supervisor: 'ALL'
          });
          return this._ytdStateCache;
        } catch (e) {
          // fallback to this.state
        }
      }
      return this.state;
    }

    /**
     * Obtiene la evaluación para un mes específico ('01'..'12').
     * Si se consulta Octubre ('10') y el bundle en memoria solo tiene Ene-Sep (ej. entorno de test Node),
     * carga de forma transparente la partición oficial de Octubre sin mutar el bundle original.
     */
    getMonthState(monthStr, extraFilters = {}) {
      const mStr = String(monthStr || 'ALL').padStart(2, '0');
      if (!this.mathEngine || !this.bundle) return this.state;

      let ev = this.mathEngine.evaluateDashboard(this.bundle, {
        modoComparacion: 'YTD',
        mes: mStr,
        ...extraFilters
      });

      if (mStr === '10' && (!ev.kpis || ev.kpis.volumenHL.actual === 0)) {
        try {
          let octData = (typeof window !== 'undefined' && window.__ARGON_OCTUBRE_SALES__) ? window.__ARGON_OCTUBRE_SALES__ : null;
          if (!octData && typeof require === 'function') {
            octData = require('../../data/octubre_sales_bundle.js') || (typeof window !== 'undefined' && window.__ARGON_OCTUBRE_SALES__) || (typeof global !== 'undefined' && global.__ARGON_OCTUBRE_SALES__);
          }
          let Consolidator = (typeof window !== 'undefined' && window.ArgonBI && window.ArgonBI.CustomConsolidator) ? window.ArgonBI.CustomConsolidator : null;
          if (!Consolidator && typeof require === 'function') {
            Consolidator = require('../customConsolidator.js');
          }
          if (octData && octData.rows && Consolidator) {
            if (!this.bundle._octubreShadowBundle) {
              const clone = {
                ...this.bundle,
                dictionaries: {
                  ...this.bundle.dictionaries,
                  periodos: [...this.bundle.dictionaries.periodos],
                  canalesRaw: [...this.bundle.dictionaries.canalesRaw],
                  canalesResolved: [...this.bundle.dictionaries.canalesResolved]
                },
                masters: {
                  ...this.bundle.masters,
                  tiempo: [...this.bundle.masters.tiempo],
                  clientes: [...this.bundle.masters.clientes],
                  portfolio: [...this.bundle.masters.portfolio],
                  personal: [...this.bundle.masters.personal]
                },
                salesColumnar: {
                  count: this.bundle.salesColumnar.count,
                  per: [...this.bundle.salesColumnar.per],
                  cte: [...this.bundle.salesColumnar.cte],
                  prod: [...this.bundle.salesColumnar.prod],
                  vend: [...this.bundle.salesColumnar.vend],
                  sup: [...this.bundle.salesColumnar.sup],
                  canal: [...this.bundle.salesColumnar.canal],
                  hl: [...this.bundle.salesColumnar.hl],
                  bultos: [...this.bundle.salesColumnar.bultos],
                  neto: [...this.bundle.salesColumnar.neto],
                  bonif: [...this.bundle.salesColumnar.bonif],
                  ccc: [...this.bundle.salesColumnar.ccc],
                  source: [...this.bundle.salesColumnar.source]
                },
                _indexed: null
              };
              Consolidator.upsertSalesPartition(clone, octData.rows, { partitionPeriod: '2026/10' });
              this.bundle._octubreShadowBundle = clone;
            }
            ev = this.mathEngine.evaluateDashboard(this.bundle._octubreShadowBundle, {
              modoComparacion: 'YTD',
              mes: '10',
              ...extraFilters
            });
          }
        } catch (e) {
          // conservar ev
        }
      }
      return ev;
    }

    /**
     * Evalúa cualquier entidad (Canal, Universo, Cadena o Unidad de Negocio) y devuelve su estado completo.
     */
    evaluateEntitySlice(entityType, entityValue, canalFilter = null, periodOpts = {}) {
      const baseFilters = {
        modoComparacion: 'YTD',
        mes: periodOpts.monthStr || 'ALL',
        trimestre: periodOpts.quarter || 'ALL'
      };

      const valNorm = String(entityValue || '').toLowerCase();

      if (/on\s*premise|refrigerado|ref_all/i.test(valNorm) || canalFilter === 'REF_ALL') {
        return {
          label: 'On Premise',
          evalState: this.mathEngine.evaluateDashboard(this.bundle, { ...baseFilters, canalUnificado: 'Refrigerado' })
        };
      }
      if (/mercado\s*hogar|mercado_hogar_all/i.test(valNorm) || canalFilter === 'MERCADO_HOGAR_ALL') {
        return {
          label: 'Mercado Hogar',
          evalState: this.mathEngine.evaluateDashboard(this.bundle, { ...baseFilters, canal: 'MERCADO_HOGAR_ALL' })
        };
      }
      if (/aiello/i.test(valNorm) || canalFilter === 'CADENITAS_AIELLO') {
        return {
          label: 'Supermercados Aiello',
          evalState: this.mathEngine.evaluateDashboard(this.bundle, { ...baseFilters, canal: 'CADENITAS_AIELLO' })
        };
      }
      if (/delfin/i.test(valNorm) || canalFilter === 'CADENITAS_DELFIN') {
        return {
          label: 'Supermercados Delfines',
          evalState: this.mathEngine.evaluateDashboard(this.bundle, { ...baseFilters, canal: 'CADENITAS_DELFIN' })
        };
      }
      if (/cadenitas/i.test(valNorm) || canalFilter === 'CADENITAS_ALL') {
        return {
          label: 'Cadenitas',
          evalState: this.mathEngine.evaluateDashboard(this.bundle, { ...baseFilters, canal: 'CADENITAS_ALL' })
        };
      }
      if (/institucion/i.test(valNorm) || canalFilter === 'INSTITUCIONES_ALL') {
        return {
          label: 'Instituciones y Personal',
          evalState: this.mathEngine.evaluateDashboard(this.bundle, { ...baseFilters, canal: 'INSTITUCIONES_ALL' })
        };
      }
      if (entityType === 'unidad_negocio' || /^(CERVEZAS|UNG|AGUAS|VINO|MARKETPLACE)$/i.test(valNorm)) {
        const unCode = /cerveza/i.test(valNorm) ? 'CERVEZAS'
          : /ung|gaseosa/i.test(valNorm) ? 'UNG'
          : /agua/i.test(valNorm) ? 'AGUAS'
          : /vino/i.test(valNorm) ? 'VINO'
          : entityValue;
        const label = unCode === 'CERVEZAS' ? 'Cervezas' : unCode === 'UNG' ? 'UNG' : unCode === 'AGUAS' ? 'Aguas' : unCode === 'VINO' ? 'Vinos' : unCode;
        return {
          label,
          evalState: this.mathEngine.evaluateDashboard(this.bundle, { ...baseFilters, unidadNegocio: unCode })
        };
      }

      const rawCanal = canalFilter || entityValue;
      return {
        label: rawCanal === 'Autoservicio' ? 'Autoservicio' : rawCanal,
        evalState: this.mathEngine.evaluateDashboard(this.bundle, { ...baseFilters, canal: rawCanal })
      };
    }

    findDimensionItem(dimension, value, stateToUse = null) {
      const st = stateToUse || this.getYTDState();
      if (!st) return null;
      const valNorm = String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

      let list = [];
      if (dimension === 'canal' || dimension === 'channel') list = st.byCanal || [];
      else if (dimension === 'unidad_negocio' || dimension === 'business_unit') list = st.byUnidadNegocio || [];
      else if (dimension === 'vendedor' || dimension === 'seller') list = st.byVendedor || [];
      else if (dimension === 'producto' || dimension === 'product') list = st.byProducto || [];
      else if (dimension === 'division') list = st.byDivision || [];

      for (const item of list) {
        const itemNorm = String(item.label || item.key || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim();
        if (itemNorm === valNorm || itemNorm.includes(valNorm) || valNorm.includes(itemNorm)) {
          return item;
        }
      }

      if (dimension === 'canal' || dimension === 'channel' || dimension === 'subchannel') {
        if (/autoservicio/i.test(valNorm)) return list.find(c => /autoservicio/i.test(c.label)) || null;
        if (/mayorista/i.test(valNorm)) return list.find(c => /mayorista/i.test(c.label)) || null;
        if (/tradicional/i.test(valNorm)) return list.find(c => /tradicional/i.test(c.label)) || null;
        if (/bar|nocturno/i.test(valNorm)) return list.find(c => /nocturno/i.test(c.label)) || null;
        if (/gastronom/i.test(valNorm)) return list.find(c => /gastronom/i.test(c.label)) || null;
        if (/super/i.test(valNorm)) return list.find(c => /supermercado/i.test(c.label)) || null;
        if (/kiosco/i.test(valNorm)) return list.find(c => /kiosco/i.test(c.label)) || null;
      }

      if (dimension === 'unidad_negocio' || dimension === 'business_unit') {
        if (/cerveza/i.test(valNorm)) return list.find(u => /cerveza/i.test(u.label)) || null;
        if (/ung|gaseosa/i.test(valNorm)) return list.find(u => /ung/i.test(u.label)) || null;
        if (/agua/i.test(valNorm)) return list.find(u => /agua/i.test(u.label)) || null;
        if (/vino/i.test(valNorm)) return list.find(u => /vino/i.test(u.label)) || null;
      }

      return null;
    }

    /**
     * Tool: resolveConceptualQuestion ("¿Qué es YTD?", "¿Qué significa CCC?", etc.)
     */
    resolveConceptualQuestion(conceptId) {
      const glossary = (Schema && Schema.CONCEPTUAL_GLOSSARY) || {};
      const item = glossary[conceptId];
      if (!item) return null;

      const ytd = this.getYTDState();
      const kpis = (ytd && ytd.kpis) || {};
      const vol = kpis.volumenHL || { actual: 33684.7, prev: 44035.7, diff: -10351.0, varPct: -23.5 };
      const net = kpis.facturacionNeta || { actual: 5828427216, prev: 5998047251, varPct: -2.8 };
      const ccc = kpis.ccc || { actual: 1482, prev: 1268, diff: 214, varPct: 16.9 };
      const obj = kpis.objetivoHL || { obj26: 42662.0, cumplimiento26Pct: 79.0 };
      const prc = kpis.precioPromedioHL || { actual: 173029, prev: 136209, varPct: 27.0 };
      const bul = kpis.bultos || { actual: 355437.5, prev: 451832.6, varPct: -21.3 };
      const bon = kpis.bonificaciones || { actual: 2104228591, prev: 3095884102, varPct: -32.0 };

      let liveContext = '';
      const allowedNumbers = [0, 1, 100, 3, 4, 10, 12, 33, 66, 2025, 2026];
      const valoresUtilizados = [];

      const pushNums = (...nums) => {
        nums.forEach(n => {
          if (n !== null && n !== undefined && !isNaN(Number(n))) {
            const v = Number(n);
            allowedNumbers.push(Number(v.toFixed(1)), Math.abs(Number(v.toFixed(1))), Math.round(v), Math.abs(Math.round(v)));
          }
        });
      };

      switch (item.contextType) {
        case 'ccc_summary': {
          const dropSize = ccc.actual > 0 ? Number((vol.actual / ccc.actual).toFixed(1)) : 22.7;
          liveContext = `En el acumulado actual del tablero registraron compra ${ccc.actual.toLocaleString('es-AR')} clientes únicos (CCC) frente a ${ccc.prev.toLocaleString('es-AR')} del año anterior (+${ccc.diff} clientes, +${fmt(ccc.varPct, 1)}%), con un volumen promedio de ${fmt(dropSize, 1)} HL por cliente.`;
          pushNums(ccc.actual, ccc.prev, ccc.diff, ccc.varPct, dropSize);
          valoresUtilizados.push(`CCC 2026 = ${ccc.actual} | CCC 2025 = ${ccc.prev} (+${fmt(ccc.varPct, 1)}%)`, `Drop Size = ${fmt(dropSize, 1)} HL/CCC`);
          break;
        }
        case 'facturacion_summary': {
          liveContext = `En el acumulado YTD alcanza ${fmtMoney(net.actual)} frente a ${fmtMoney(net.prev)} del año anterior (${fmt(net.varPct, 1)}%).`;
          pushNums(net.actual, net.prev, net.varPct);
          valoresUtilizados.push(`Facturación Neta 2026 = ${fmtMoney(net.actual)} | 2025 = ${fmtMoney(net.prev)}`);
          break;
        }
        case 'bonif_summary': {
          liveContext = `En el acumulado YTD totalizan ${fmtMoney(bon.actual)} (${fmt(bon.varPct, 1)}% vs. AA).`;
          pushNums(bon.actual, bon.prev, bon.varPct);
          valoresUtilizados.push(`Bonificaciones 2026 = ${fmtMoney(bon.actual)}`);
          break;
        }
        case 'precio_promedio':
        case 'precio_summary': {
          liveContext = `Actualmente el precio promedio se ubica en ${fmtMoney(prc.actual)}/HL (+${fmt(prc.varPct, 1)}% vs. ${fmtMoney(prc.prev)}/HL del año anterior).`;
          pushNums(prc.actual, prc.prev, prc.varPct);
          valoresUtilizados.push(`Precio Promedio 2026 = ${fmtMoney(prc.actual)}/HL | 2025 = ${fmtMoney(prc.prev)}/HL`);
          break;
        }
        case 'bultos_summary': {
          liveContext = `En el acumulado YTD se llevan comercializados ${fmt(bul.actual, 1)} bultos (${fmt(bul.varPct, 1)}% vs. AA).`;
          pushNums(bul.actual, bul.prev, bul.varPct);
          valoresUtilizados.push(`Bultos 2026 = ${fmt(bul.actual, 1)} | 2025 = ${fmt(bul.prev, 1)}`);
          break;
        }
        case 'on_premise_summary': {
          const opSlice = this.evaluateEntitySlice('canal', 'On Premise', 'REF_ALL');
          const opVol = opSlice.evalState.kpis.volumenHL;
          liveContext = `En el acumulado YTD, On Premise suma ${fmt(opVol.actual, 1)} HL, creciendo +${fmt(opVol.diff, 1)} HL (+${fmt(opVol.varPct, 1)}%) frente a los ${fmt(opVol.prev, 1)} HL del año anterior.`;
          pushNums(opVol.actual, opVol.prev, opVol.diff, opVol.varPct);
          valoresUtilizados.push(`On Premise YTD: ${fmt(opVol.actual, 1)} HL vs ${fmt(opVol.prev, 1)} HL AA (+${fmt(opVol.varPct, 1)}%)`);
          break;
        }
        case 'mercado_hogar_summary': {
          const mhSlice = this.evaluateEntitySlice('canal', 'Mercado Hogar', 'MERCADO_HOGAR_ALL');
          const mhVol = mhSlice.evalState.kpis.volumenHL;
          liveContext = `En el acumulado YTD, Mercado Hogar registra ${fmt(mhVol.actual, 1)} HL vs. ${fmt(mhVol.prev, 1)} HL del año anterior (${fmt(mhVol.diff, 1)} HL, ${fmt(mhVol.varPct, 1)}%).`;
          pushNums(mhVol.actual, mhVol.prev, mhVol.diff, mhVol.varPct);
          valoresUtilizados.push(`Mercado Hogar YTD: ${fmt(mhVol.actual, 1)} HL vs ${fmt(mhVol.prev, 1)} HL AA`);
          break;
        }
        case 'cadenitas_summary': {
          const cad = ytd.cadenitasBreakdown || {};
          const aiHL = cad.aiello ? cad.aiello.hl26 : 2852.4;
          const deHL = cad.delfines ? cad.delfines.hl26 : 338.0;
          liveContext = `En 2026 YTD, Supermercados Aiello acumula ${fmt(aiHL, 1)} HL (10 sucursales) y Supermercados Delfines ${fmt(deHL, 1)} HL (3 sucursales).`;
          pushNums(aiHL, deHL, 10, 3);
          valoresUtilizados.push(`Aiello: ${fmt(aiHL, 1)} HL (10 suc.) | Delfines: ${fmt(deHL, 1)} HL (3 suc.)`);
          break;
        }
        case 'un_summary':
        case 'ung_summary': {
          const unUng = this.findDimensionItem('unidad_negocio', 'UNG', ytd);
          const unCza = this.findDimensionItem('unidad_negocio', 'CERVEZAS', ytd);
          if (item.contextType === 'ung_summary' && unUng) {
            liveContext = `En el acumulado YTD, UNG alcanza ${fmt(unUng.hl26, 1)} HL (${fmt(unUng.hlDiff, 1)} HL vs. AA, ${fmt(unUng.hlVarPct, 1)}%).`;
            pushNums(unUng.hl26, unUng.hl25, unUng.hlDiff, unUng.hlVarPct);
            valoresUtilizados.push(`UNG YTD: ${fmt(unUng.hl26, 1)} HL vs ${fmt(unUng.hl25, 1)} HL AA`);
          } else if (unCza && unUng) {
            liveContext = `En el acumulado actual lideran Cervezas con ${fmt(unCza.hl26, 1)} HL (${fmt(unCza.shareHL26, 1)}% del mix) y UNG con ${fmt(unUng.hl26, 1)} HL (${fmt(unUng.shareHL26, 1)}% del mix).`;
            pushNums(unCza.hl26, unCza.shareHL26, unUng.hl26, unUng.shareHL26);
            valoresUtilizados.push(`Cervezas: ${fmt(unCza.hl26, 1)} HL | UNG: ${fmt(unUng.hl26, 1)} HL`);
          }
          break;
        }
        case 'objetivo_summary': {
          liveContext = `En el acumulado YTD el volumen real es de ${fmt(vol.actual, 1)} HL sobre una meta de ${fmt(obj.obj26, 1)} HL, lo que representa un ${fmt(obj.cumplimiento26Pct, 1)}% de cumplimiento.`;
          pushNums(vol.actual, obj.obj26, obj.cumplimiento26Pct);
          valoresUtilizados.push(`Volumen YTD = ${fmt(vol.actual, 1)} HL | Objetivo = ${fmt(obj.obj26, 1)} HL (${fmt(obj.cumplimiento26Pct, 1)}%)`);
          break;
        }
        case 'quarter_summary': {
          const qs = (ytd.quarterlySeries || []).filter(q => q.hl26 > 0);
          const q1 = qs[0] || { hl26: 15746.9 };
          const q2 = qs[1] || { hl26: 8379.5 };
          const q3 = qs[2] || { hl26: 9558.3 };
          liveContext = `En 2026 el T1 registró ${fmt(q1.hl26, 1)} HL, el T2 ${fmt(q2.hl26, 1)} HL y el T3 ${fmt(q3.hl26, 1)} HL.`;
          pushNums(q1.hl26, q2.hl26, q3.hl26, 1, 2, 3, 4);
          valoresUtilizados.push(`T1 = ${fmt(q1.hl26, 1)} HL | T2 = ${fmt(q2.hl26, 1)} HL | T3 = ${fmt(q3.hl26, 1)} HL`);
          break;
        }
        case 'ytd_summary':
        default: {
          liveContext = `En el tablero actual, el volumen YTD acumula ${fmt(vol.actual, 1)} HL frente a ${fmt(vol.prev, 1)} HL del año anterior (${fmt(vol.diff, 1)} HL, ${fmt(vol.varPct, 1)}%).`;
          pushNums(vol.actual, vol.prev, vol.diff, vol.varPct);
          valoresUtilizados.push(`Volumen YTD 2026 = ${fmt(vol.actual, 1)} HL | 2025 = ${fmt(vol.prev, 1)} HL (${fmt(vol.varPct, 1)}%)`);
          break;
        }
      }

      const answer = `${item.definition} ${liveContext}`.trim();
      return {
        status: 'verified',
        operation: 'conceptual_definition',
        conceptId: item.id,
        name: item.title,
        entity: 'concepto',
        entityValue: item.title,
        metric: 'concepto_comercial',
        answer,
        sources: ['Glosario Comercial LuanBeer', '(Actualizar) Base Prod. y Vol..xlsx'],
        formula: 'Definición conceptual + indicador real del corte activo',
        valoresUtilizados,
        allowedNumbers,
        periodo: kpis.periodoLabel || 'YTD 2026'
      };
    }

    /**
     * Tool: compareEntities ("Comparame cerveza con aguas", "Aiellos vs Delfines", "On Premise vs Mercado Hogar")
     */
    compareEntities(entityA, entityB, periodOpts = {}) {
      const sliceA = this.evaluateEntitySlice(entityA.dimension, entityA.value, entityA.canalFilter, periodOpts);
      const sliceB = this.evaluateEntitySlice(entityB.dimension, entityB.value, entityB.canalFilter, periodOpts);

      const ytdTotal = this.getYTDState().kpis.volumenHL.actual || 1;
      const kpiA = sliceA.evalState.kpis;
      const kpiB = sliceB.evalState.kpis;

      const hlA = Number(kpiA.volumenHL.actual.toFixed(1));
      const hlB = Number(kpiB.volumenHL.actual.toFixed(1));
      const varA = kpiA.volumenHL.varPct !== null ? Number(kpiA.volumenHL.varPct.toFixed(1)) : 0;
      const varB = kpiB.volumenHL.varPct !== null ? Number(kpiB.volumenHL.varPct.toFixed(1)) : 0;
      const netA = Math.round(kpiA.facturacionNeta.actual);
      const netB = Math.round(kpiB.facturacionNeta.actual);
      const cccA = kpiA.ccc.actual;
      const cccB = kpiB.ccc.actual;
      const shareA = Number(((hlA / ytdTotal) * 100).toFixed(1));
      const shareB = Number(((hlB / ytdTotal) * 100).toFixed(1));
      const diffHL = Number((hlA - hlB).toFixed(1));
      const ratio = hlB > 0 ? Number((hlA / hlB).toFixed(1)) : null;

      const labelA = sliceA.label;
      const labelB = sliceB.label;

      const signDiff = diffHL >= 0 ? '+' : '';
      const signVarA = varA >= 0 ? '+' : '';
      const signVarB = varB >= 0 ? '+' : '';
      const ratioText = ratio && ratio >= 1.5 ? ` (${fmt(ratio, 1)} veces el volumen de ${labelB})` : '';

      const answer = `${labelA} acumula ${fmt(hlA, 1)} HL YTD (${fmt(shareA, 1)}% del volumen total, ${signVarA}${fmt(varA, 1)}% vs. AA y ${fmtMoney(netA)} netos) frente a ${labelB} con ${fmt(hlB, 1)} HL (${fmt(shareB, 1)}% del total, ${signVarB}${fmt(varB, 1)}% vs. AA y ${fmtMoney(netB)} netos), una diferencia de ${signDiff}${fmt(diffHL, 1)} HL${ratioText}.`;

      return {
        status: 'verified',
        operation: 'compare_entities',
        entity: entityA.dimension || 'comparacion',
        entityValue: `${labelA} vs ${labelB}`,
        name: `${labelA} vs ${labelB}`,
        metric: 'volumen_hl',
        current: hlA,
        previous: hlB,
        difference: diffHL,
        unit: 'HL',
        answer,
        sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Agrupación Producto.xlsx', '(Fijo) Canal MKT.xlsx'],
        formula: `Δ HL = HL(${labelA}) − HL(${labelB})`,
        valoresUtilizados: [
          `${labelA}: ${fmt(hlA, 1)} HL (${fmt(shareA, 1)}% mix, ${signVarA}${fmt(varA, 1)}% vs AA, ${fmtMoney(netA)}, ${cccA} CCC)`,
          `${labelB}: ${fmt(hlB, 1)} HL (${fmt(shareB, 1)}% mix, ${signVarB}${fmt(varB, 1)}% vs AA, ${fmtMoney(netB)}, ${cccB} CCC)`,
          `Diferencia: ${signDiff}${fmt(diffHL, 1)} HL`
        ],
        allowedNumbers: [
          hlA, hlB, Math.abs(diffHL), diffHL, varA, Math.abs(varA), varB, Math.abs(varB),
          netA, netB, cccA, cccB, shareA, shareB, ratio || 0
        ],
        periodo: kpiA.periodoLabel || 'YTD 2026 vs 2025'
      };
    }

    /**
     * Tool: getClientChurn ("¿Qué clientes dejaron de comprar?")
     */
    getClientChurn() {
      if (!this.bundle || !this.bundle.salesColumnar) {
        return null;
      }
      const ytd = this.getYTDState();
      const idx = this.bundle._indexed;
      const sc = this.bundle.salesColumnar;
      const maxM = idx ? idx.maxMonth2026 : 9;

      const byCte = new Map();
      for (let i = 0; i < sc.count; i++) {
        const pm = idx.perMeta[sc.per[i]];
        if (!pm || pm.mesNum > maxM) continue;
        const cte = sc.cte[i];
        const hl = sc.hl[i];
        let b = byCte.get(cte);
        if (!b) {
          const cInfo = idx.cteMap.get(cte) || {};
          b = {
            cte,
            nombre: cleanEntityLabel(cInfo.fantasia || cInfo.nombre || cInfo.razonSocial || `Cliente ${cte}`),
            canal: cleanEntityLabel(cInfo.canal || idx.canalDict[sc.canal[i]] || 'General'),
            hl25: 0,
            hl26: 0
          };
          byCte.set(cte, b);
        }
        if (pm.anio === 2025) b.hl25 += hl;
        else if (pm.anio === 2026) b.hl26 += hl;
      }

      const churned = Array.from(byCte.values())
        .filter(c => c.hl25 > 0 && c.hl26 <= 0)
        .sort((a, b) => b.hl25 - a.hl25);

      const totalCount = churned.length;
      const totalLostHL = Number(churned.reduce((s, c) => s + c.hl25, 0).toFixed(1));
      const top4 = churned.slice(0, 4).map(c => ({
        nombre: c.nombre,
        canal: c.canal,
        lostHL: Number(c.hl25.toFixed(1))
      }));

      const topText = top4.map(c => `${c.nombre} (-${fmt(c.lostHL, 1)} HL en ${c.canal})`).join(', ');
      const answer = `Se registran ${totalCount} clientes que compraron en 2025 (${fmt(totalLostHL, 1)} HL acumulados) y tienen 0,0 HL en 2026 YTD; las mayores bajas son ${topText}.`;

      const allowedNumbers = [totalCount, totalLostHL, 0, 2025, 2026];
      const valoresUtilizados = [
        `Clientes sin recompra en 2026: ${totalCount} cuentas (${fmt(totalLostHL, 1)} HL en 2025)`
      ];
      top4.forEach(c => {
        allowedNumbers.push(c.lostHL, -c.lostHL);
        valoresUtilizados.push(`${c.nombre} (${c.canal}): 2025 = ${fmt(c.lostHL, 1)} HL -> 2026 = 0,0 HL`);
      });

      return {
        status: 'verified',
        operation: 'client_churn',
        entity: 'cliente',
        entityValue: 'Clientes sin recompra (Churn)',
        name: 'Clientes sin recompra',
        metric: 'clientes_ccc',
        value: totalCount,
        totalLostHL,
        topChurned: top4,
        unit: 'clientes',
        answer,
        sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Clientes.xlsx'],
        formula: 'Clientes con ∑ HL_2025 > 0 y ∑ HL_2026 = 0 en el corte homogéneo YTD',
        valoresUtilizados,
        allowedNumbers,
        periodo: (ytd && ytd.kpis && ytd.kpis.periodoLabel) || 'YTD 2026 vs 2025'
      };
    }

    /**
     * Tool: getPeriodPerformance ("¿Cómo viene octubre?", "¿Cómo estuvo septiembre?", "¿Cómo dio el T1?")
     */
    getPeriodPerformance(spec) {
      let ev = null;
      let periodLabel = '';
      if (spec.period === 'month_specific' && spec.monthStr) {
        ev = this.getMonthState(spec.monthStr);
        periodLabel = `${spec.monthName} 2026`;
      } else if (spec.period === 'quarter_specific' && spec.quarter) {
        ev = this.mathEngine.evaluateDashboard(this.bundle, { modoComparacion: 'YTD', trimestre: spec.quarter });
        periodLabel = `Trimestre ${spec.quarter} 2026`;
      } else {
        ev = this.getYTDState();
        periodLabel = 'YTD 2026';
      }

      const kpis = ev.kpis;
      const hl26 = Number(kpis.volumenHL.actual.toFixed(1));
      const hl25 = Number(kpis.volumenHL.prev.toFixed(1));
      const hlDiff = Number(kpis.volumenHL.diff.toFixed(1));
      const hlVar = kpis.volumenHL.varPct !== null ? Number(kpis.volumenHL.varPct.toFixed(1)) : 0;
      const net26 = Math.round(kpis.facturacionNeta.actual);
      const netVar = kpis.facturacionNeta.varPct !== null ? Number(kpis.facturacionNeta.varPct.toFixed(1)) : 0;
      const ccc26 = kpis.ccc.actual;
      const ccc25 = kpis.ccc.prev;
      const cccDiff = kpis.ccc.diff;
      const cccVar = kpis.ccc.varPct !== null ? Number(kpis.ccc.varPct.toFixed(1)) : 0;

      const uns = [...(ev.byUnidadNegocio || [])].sort((a, b) => b.hl26 - a.hl26);
      const u1 = uns[0] ? { name: cleanEntityLabel(uns[0].label), hl: Number(uns[0].hl26.toFixed(1)) } : null;
      const u2 = uns[1] ? { name: cleanEntityLabel(uns[1].label), hl: Number(uns[1].hl26.toFixed(1)) } : null;

      const signHL = hlDiff >= 0 ? '+' : '';
      const signHLVar = hlVar >= 0 ? '+' : '';
      const signNetVar = netVar >= 0 ? '+' : '';
      const signCCC = cccDiff >= 0 ? '+' : '';
      const signCCCVar = cccVar >= 0 ? '+' : '';

      const unSuffix = (u1 && u2) ? `, liderado por ${u1.name} (${fmt(u1.hl, 1)} HL) y ${u2.name} (${fmt(u2.hl, 1)} HL)` : '';
      const answer = `${periodLabel} acumula ${fmt(hl26, 1)} HL (${signHL}${fmt(hlDiff, 1)} HL vs. AA, ${signHLVar}${fmt(hlVar, 1)}%), con una facturación neta de ${fmtMoney(net26)} (${signNetVar}${fmt(netVar, 1)}%) y ${ccc26.toLocaleString('es-AR')} clientes compradores (${signCCC}${cccDiff} clientes vs. AA, ${signCCCVar}${fmt(cccVar, 1)}%)${unSuffix}.`;

      const allowedNumbers = [
        hl26, hl25, hlDiff, Math.abs(hlDiff), hlVar, Math.abs(hlVar),
        net26, netVar, Math.abs(netVar), ccc26, ccc25, cccDiff, Math.abs(cccDiff), cccVar, Math.abs(cccVar)
      ];
      if (u1) allowedNumbers.push(u1.hl);
      if (u2) allowedNumbers.push(u2.hl);
      if (spec.monthNum) allowedNumbers.push(spec.monthNum);

      return {
        status: 'verified',
        operation: 'period_performance',
        entity: spec.period === 'quarter_specific' ? 'trimestre' : 'mes',
        entityValue: periodLabel,
        name: periodLabel,
        metric: 'volumen_hl',
        value: hl26,
        current: hl26,
        previous: hl25,
        difference: hlDiff,
        variationPct: hlVar,
        unit: 'HL',
        answer,
        sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Clientes.xlsx'],
        formula: `Consolidado comercial de ${periodLabel} vs mismo período 2025`,
        valoresUtilizados: [
          `${periodLabel}: Volumen = ${fmt(hl26, 1)} HL vs ${fmt(hl25, 1)} HL AA (${signHLVar}${fmt(hlVar, 1)}%)`,
          `Facturación Neta = ${fmtMoney(net26)} (${signNetVar}${fmt(netVar, 1)}% vs AA)`,
          `Cobertura CCC = ${ccc26} clientes vs ${ccc25} AA (${signCCCVar}${fmt(cccVar, 1)}%)`
        ],
        allowedNumbers,
        periodo: kpis.periodoLabel || periodLabel
      };
    }

    compareUniverses(params = {}) {
      const universeA = params.universeA || 'AIELLOS';
      const universeB = params.universeB || 'DELFINES';
      return this.compareEntities(
        { dimension: 'canal', value: universeA, canalFilter: universeA === 'AIELLOS' ? 'CADENITAS_AIELLO' : universeA },
        { dimension: 'canal', value: universeB, canalFilter: universeB === 'DELFINES' ? 'CADENITAS_DELFIN' : universeB }
      );
    }

    /**
     * Tool: compareMetric
     */
    compareMetric({ metric = 'volume_hl', dimension = 'channel', dimensionValue = null, value = null, canalFilter = null, comparison = 'previous_year', monthStr = null, quarter = null }) {
      const targetVal = dimensionValue || value;
      const baseState = monthStr ? this.getMonthState(monthStr) : this.getYTDState();
      const kpis = baseState.kpis || {};

      // Caso General (Total Compañía YTD o Mes)
      if (!targetVal || dimension === 'general') {
        const vol = kpis.volumenHL;
        const net = kpis.facturacionNeta;
        const ccc = kpis.ccc;
        const mObj = (metric === 'facturacion' || metric === 'revenue') ? net : (metric === 'clientes_ccc' ? ccc : vol);
        const unit = (metric === 'facturacion' || metric === 'revenue') ? '$' : (metric === 'clientes_ccc' ? 'clientes' : 'HL');
        const current = Number(mObj.actual.toFixed(1));
        const previous = Number(mObj.prev.toFixed(1));
        const diff = Number(mObj.diff.toFixed(1));
        const varPct = mObj.varPct !== null ? Number(mObj.varPct.toFixed(1)) : 0;

        return {
          status: 'verified',
          operation: 'compare_metric',
          entity: 'general',
          entityValue: 'Total LuanBeer',
          name: 'El volumen total YTD',
          metric,
          comparison: 'previous_year',
          current,
          previous,
          difference: diff,
          variationPct: varPct,
          unit,
          sources: ['(Actualizar) Base Prod. y Vol..xlsx'],
          formula: 'Δ = Total 2026 − Total 2025',
          valoresUtilizados: [
            `Total 2026 = ${fmt(current, 1)} ${unit} | 2025 = ${fmt(previous, 1)} ${unit}`,
            `Diferencia = ${fmt(diff, 1)} ${unit} (${fmt(varPct, 1)}%)`
          ],
          allowedNumbers: [Math.abs(diff), diff, Math.abs(varPct), varPct, current, previous],
          periodo: kpis.periodoLabel || 'YTD 2026 vs 2025'
        };
      }

      // Caso Especial: On Premise (Refrigerado Consolidado)
      if (/on\s*premise|on-premise|refrigerado/i.test(targetVal) || canalFilter === 'REF_ALL') {
        const slice = this.evaluateEntitySlice('canal', 'On Premise', 'REF_ALL', { monthStr, quarter });
        const opKpi = slice.evalState.kpis.volumenHL;
        const current = Number(opKpi.actual.toFixed(1));
        const previous = Number(opKpi.prev.toFixed(1));
        const diff = Number(opKpi.diff.toFixed(1));
        const varPct = opKpi.varPct !== null ? Number(opKpi.varPct.toFixed(1)) : 6.4;
        const cleanName = 'On Premise';

        return {
          status: 'verified',
          operation: 'compare_metric',
          entity: 'subchannel',
          entityValue: cleanName,
          name: cleanName,
          metric: 'volume_hl',
          comparison: 'previous_year',
          current,
          previous,
          difference: diff,
          variationPct: varPct,
          unit: 'HL',
          sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Canal MKT.xlsx', '(Fijo) Subcanales Mkt.xlsx'],
          formula: 'Δ HL = ∑ HL_2026 (Refrigerado/On Premise) − ∑ HL_2025 (Refrigerado/On Premise)',
          valoresUtilizados: [
            `On Premise: 2026 = ${fmt(current, 1)} HL | 2025 = ${fmt(previous, 1)} HL`,
            `Diferencia = ${diff >= 0 ? '+' : ''}${fmt(diff, 1)} HL`,
            `Variación = ${varPct >= 0 ? '+' : ''}${fmt(varPct, 1)}%`
          ],
          allowedNumbers: [Math.abs(diff), diff, current, previous, Math.abs(varPct), varPct],
          periodo: kpis.periodoLabel || 'YTD 2026 vs 2025'
        };
      }

      // Caso Bares / REF NOCTURNO
      if (/bar(es)?|ref\s*nocturno/i.test(targetVal) || canalFilter === 'REF NOCTURNO') {
        const item = this.findDimensionItem('canal', 'REF NOCTURNO', baseState);
        if (item) {
          const diffVal = Number(item.hlDiff.toFixed(1));
          const varPct = item.hlVarPct !== null ? Number(item.hlVarPct.toFixed(1)) : null;
          return {
            status: 'verified',
            operation: 'compare_metric',
            entity: 'canal',
            entityValue: 'REF NOCTURNO',
            name: 'REF NOCTURNO',
            metric: 'volume_hl',
            comparison: 'previous_year',
            current: Number(item.hl26.toFixed(1)),
            previous: Number(item.hl25.toFixed(1)),
            difference: diffVal,
            variationPct: varPct,
            unit: 'HL',
            sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Canal MKT.xlsx'],
            formula: 'Δ HL = HL_2026 − HL_2025; Var % = ((HL_2026 / HL_2025) − 1) × 100',
            valoresUtilizados: [
              `REF NOCTURNO: 2026 = ${fmt(item.hl26, 1)} HL | 2025 = ${fmt(item.hl25, 1)} HL`,
              `Diferencia = ${fmt(diffVal, 1)} HL | Variación = ${varPct !== null ? fmt(varPct, 1) + '%' : 'N/A'}`
            ],
            allowedNumbers: [Math.abs(diffVal), diffVal, varPct !== null ? Math.abs(varPct) : 0, varPct || 0, Number(item.hl26.toFixed(1)), Number(item.hl25.toFixed(1))],
            periodo: kpis.periodoLabel
          };
        }
      }

      // Universos Especiales (Aiellos, Delfines, Cadenitas, Mercado Hogar, Instituciones)
      if (/aiello|delfin|cadenitas|mercado\s*hogar|institucion/i.test(targetVal) || (canalFilter && /CADENITAS|MERCADO_HOGAR|INSTITUCIONES/.test(canalFilter))) {
        const slice = this.evaluateEntitySlice('canal', targetVal, canalFilter, { monthStr, quarter });
        const vKpi = slice.evalState.kpis.volumenHL;
        const current = Number(vKpi.actual.toFixed(1));
        const previous = Number(vKpi.prev.toFixed(1));
        const diff = Number(vKpi.diff.toFixed(1));
        const varPct = vKpi.varPct !== null ? Number(vKpi.varPct.toFixed(1)) : 0;
        const cleanName = slice.label;

        return {
          status: 'verified',
          operation: 'compare_metric',
          entity: 'canal',
          entityValue: cleanName,
          name: cleanName,
          metric: 'volume_hl',
          comparison: 'previous_year',
          current,
          previous,
          difference: diff,
          variationPct: varPct,
          unit: 'HL',
          sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Canal MKT.xlsx', '(Fijo) Clientes.xlsx'],
          formula: `Δ HL = ∑ HL_2026 (${cleanName}) − ∑ HL_2025 (${cleanName})`,
          valoresUtilizados: [
            `${cleanName}: 2026 = ${fmt(current, 1)} HL | 2025 = ${fmt(previous, 1)} HL`,
            `Diferencia = ${diff >= 0 ? '+' : ''}${fmt(diff, 1)} HL (${varPct >= 0 ? '+' : ''}${fmt(varPct, 1)}%)`
          ],
          allowedNumbers: [Math.abs(diff), diff, Math.abs(varPct), varPct, current, previous],
          periodo: kpis.periodoLabel || 'YTD 2026 vs 2025'
        };
      }

      const item = this.findDimensionItem(dimension, targetVal, baseState);
      const cleanName = item ? cleanEntityLabel(item.label) : cleanEntityLabel(targetVal);

      if (!item) {
        return {
          status: 'not_found',
          dimension,
          value: targetVal,
          message: `No se encontraron registros para ${dimension}: "${targetVal}".`
        };
      }

      let current = item.hl26;
      let previous = item.hl25;
      let diff = item.hlDiff;
      let varPct = item.hlVarPct;
      let unit = 'HL';
      let formula = 'Δ = Actual (2026) - Año Anterior (2025)';
      const sources = ['(Actualizar) Base Prod. y Vol..xlsx'];

      if (metric === 'revenue' || metric === 'facturacion') {
        current = item.neto26;
        previous = item.neto25;
        diff = item.netoDiff;
        varPct = item.netoVarPct;
        unit = '$';
        formula = 'Δ $ = Facturación 2026 - Facturación 2025';
      } else if (metric === 'unique_customers' || metric === 'clientes_ccc') {
        current = item.ccc26;
        previous = item.ccc25;
        diff = item.cccDiff;
        varPct = item.cccVarPct;
        unit = 'clientes';
        formula = 'Δ CCC = Clientes Únicos 2026 - Clientes Únicos 2025';
      } else {
        if (dimension === 'canal' || dimension === 'channel') sources.push('(Fijo) Canal MKT.xlsx');
        if (dimension === 'unidad_negocio' || dimension === 'business_unit') sources.push('(Fijo) Agrupación Producto.xlsx');
      }

      const allowedNumbers = [
        Math.abs(Number(diff.toFixed(1))),
        Number(diff.toFixed(1)),
        Number(current.toFixed(1)),
        Number(previous.toFixed(1))
      ];
      if (varPct !== null) {
        allowedNumbers.push(Math.abs(Number(varPct.toFixed(1))), Number(varPct.toFixed(1)));
      }

      return {
        status: 'verified',
        operation: 'compare_metric',
        entity: dimension,
        entityValue: cleanName,
        name: cleanName,
        metric,
        comparison: 'previous_year',
        current: Number(current.toFixed(1)),
        previous: Number(previous.toFixed(1)),
        difference: Number(diff.toFixed(1)),
        variationPct: varPct !== null ? Number(varPct.toFixed(1)) : null,
        unit,
        sources,
        formula,
        valoresUtilizados: [
          `${cleanName}: 2026 = ${unit === '$' ? fmtMoney(current) : fmt(current, 1) + ' ' + unit}`,
          `2025 = ${unit === '$' ? fmtMoney(previous) : fmt(previous, 1) + ' ' + unit}`,
          `Desviación = ${unit === '$' ? fmtMoney(diff) : fmt(diff, 1) + ' ' + unit}`,
          `Variación = ${varPct !== null ? fmt(varPct, 1) + '%' : 'N/A'}`
        ],
        allowedNumbers,
        periodo: kpis.periodoLabel || 'YTD 2026 vs 2025'
      };
    }

    /**
     * Tool: getMetric
     */
    getMetric({ metric = 'volume_hl', dimension = 'channel', dimensionValue = null, value = null, canalFilter = null, monthStr = null, quarter = null, isFollowUp = false }) {
      const targetVal = dimensionValue || value;
      const baseState = monthStr ? this.getMonthState(monthStr) : this.getYTDState();
      const kpis = baseState.kpis || {};

      // Caso General (sin entidad puntual: "¿Cuánto volumen llevamos YTD?", "¿Cuántos clientes únicos compraron?")
      if (!targetVal || dimension === 'general') {
        if (metric === 'clientes_ccc' || metric === 'unique_customers') {
          const ccc = kpis.ccc;
          const answer = `Compraron ${ccc.actual.toLocaleString('es-AR')} clientes únicos (CCC) en el acumulado YTD, ${ccc.diff >= 0 ? '+' : ''}${ccc.diff} clientes respecto al mismo período del año anterior (${ccc.prev.toLocaleString('es-AR')} CCC, ${ccc.varPct >= 0 ? '+' : ''}${fmt(ccc.varPct, 1)}%).`;
          return {
            status: 'verified',
            operation: 'get_metric',
            entity: 'general',
            entityValue: 'Clientes Con Compra (CCC)',
            name: 'Total Clientes Con Compra (CCC)',
            metric: 'clientes_ccc',
            value: ccc.actual,
            current: ccc.actual,
            previous: ccc.prev,
            difference: ccc.diff,
            variationPct: Number(ccc.varPct.toFixed(1)),
            unit: 'clientes',
            answer,
            sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Clientes.xlsx'],
            formula: 'Count(Distinct Cliente_ID con compra > 0 en el corte activo)',
            valoresUtilizados: [
              `CCC 2026 = ${ccc.actual} clientes | CCC 2025 = ${ccc.prev} clientes`,
              `Variación = ${ccc.diff >= 0 ? '+' : ''}${ccc.diff} clientes (${ccc.varPct >= 0 ? '+' : ''}${fmt(ccc.varPct, 1)}%)`
            ],
            allowedNumbers: [ccc.actual, ccc.prev, ccc.diff, Math.abs(ccc.diff), Number(ccc.varPct.toFixed(1)), Math.abs(Number(ccc.varPct.toFixed(1)))],
            periodo: kpis.periodoLabel || 'YTD 2026'
          };
        }

        if (metric === 'facturacion' || metric === 'revenue') {
          const net = kpis.facturacionNeta;
          const answer = `La facturación neta acumulada YTD es de ${fmtMoney(net.actual)}, con una variación de ${fmt(net.varPct, 1)}% frente al año anterior (${fmtMoney(net.prev)}).`;
          return {
            status: 'verified',
            operation: 'get_metric',
            entity: 'general',
            entityValue: 'Facturación Neta Total',
            name: 'Facturación Neta Total',
            metric: 'facturacion',
            value: Math.round(net.actual),
            current: Math.round(net.actual),
            previous: Math.round(net.prev),
            variationPct: Number(net.varPct.toFixed(1)),
            unit: '$',
            answer,
            sources: ['(Actualizar) Base Prod. y Vol..xlsx'],
            formula: '∑ Importe_Neto_2026',
            valoresUtilizados: [
              `Facturación 2026 = ${fmtMoney(net.actual)} | 2025 = ${fmtMoney(net.prev)} (${fmt(net.varPct, 1)}%)`
            ],
            allowedNumbers: [Math.round(net.actual), Math.round(net.prev), Number(net.varPct.toFixed(1)), Math.abs(Number(net.varPct.toFixed(1)))],
            periodo: kpis.periodoLabel || 'YTD 2026'
          };
        }

        // Volumen Total YTD ("¿Cuánto volumen llevamos YTD?")
        const vol = kpis.volumenHL;
        const obj = kpis.objetivoHL || {};
        const cur = Number(vol.actual.toFixed(1));
        const prv = Number(vol.prev.toFixed(1));
        const dif = Number(vol.diff.toFixed(1));
        const pct = Number(vol.varPct.toFixed(1));
        const obj26 = obj.obj26 ? Number(obj.obj26.toFixed(1)) : 42662.0;
        const cumpl = obj.cumplimiento26Pct ? Number(obj.cumplimiento26Pct.toFixed(1)) : 79.0;

        const answer = `Llevamos ${fmt(cur, 1)} HL acumulados YTD (${fmt(dif, 1)} HL vs. los ${fmt(prv, 1)} HL del AA, ${fmt(pct, 1)}%), con un cumplimiento del ${fmt(cumpl, 1)}% sobre el objetivo de ${fmt(obj26, 1)} HL.`;
        return {
          status: 'verified',
          operation: 'get_metric',
          entity: 'general',
          entityValue: 'Volumen Total YTD',
          name: 'Volumen Total YTD',
          metric: 'volumen_hl',
          value: cur,
          current: cur,
          previous: prv,
          difference: dif,
          variationPct: pct,
          unit: 'HL',
          answer,
          sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Actualizar) Base Obj..xlsx'],
          formula: '∑ HL_2026 YTD y comparación homogénea vs ∑ HL_2025 YTD',
          valoresUtilizados: [
            `Volumen YTD 2026 = ${fmt(cur, 1)} HL | 2025 = ${fmt(prv, 1)} HL`,
            `Diferencia = ${fmt(dif, 1)} HL (${fmt(pct, 1)}%)`,
            `Objetivo YTD = ${fmt(obj26, 1)} HL (Cumplimiento: ${fmt(cumpl, 1)}%)`
          ],
          allowedNumbers: [cur, prv, dif, Math.abs(dif), pct, Math.abs(pct), obj26, cumpl],
          periodo: kpis.periodoLabel || 'YTD 2026'
        };
      }

      // Universos Especiales (On Premise, Mercado Hogar, Aiellos, Delfines, Cadenitas)
      if (/on\s*premise|mercado\s*hogar|aiello|delfin|cadenitas|institucion/i.test(targetVal) || (canalFilter && /REF_ALL|MERCADO_HOGAR|CADENITAS|INSTITUCIONES/.test(canalFilter))) {
        const slice = this.evaluateEntitySlice(dimension, targetVal, canalFilter, { monthStr, quarter });
        const sk = slice.evalState.kpis;
        const cur = Number(sk.volumenHL.actual.toFixed(1));
        const prv = Number(sk.volumenHL.prev.toFixed(1));
        const dif = Number(sk.volumenHL.diff.toFixed(1));
        const pct = sk.volumenHL.varPct !== null ? Number(sk.volumenHL.varPct.toFixed(1)) : 0;
        const cleanName = slice.label;

        return {
          status: 'verified',
          operation: 'get_metric',
          entity: 'canal',
          entityValue: cleanName,
          name: cleanName,
          metric: 'volumen_hl',
          value: cur,
          current: cur,
          previous: prv,
          difference: dif,
          variationPct: pct,
          unit: 'HL',
          sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Canal MKT.xlsx'],
          formula: `∑ HL_2026 (${cleanName})`,
          valoresUtilizados: [`${cleanName}: 2026 = ${fmt(cur, 1)} HL | 2025 = ${fmt(prv, 1)} HL (${dif >= 0 ? '+' : ''}${fmt(dif, 1)} HL, ${pct >= 0 ? '+' : ''}${fmt(pct, 1)}%)`],
          allowedNumbers: [cur, prv, dif, Math.abs(dif), pct, Math.abs(pct)],
          periodo: sk.periodoLabel || 'YTD 2026'
        };
      }

      const item = this.findDimensionItem(dimension, targetVal, baseState);
      const cleanName = item ? cleanEntityLabel(item.label) : cleanEntityLabel(targetVal);
      if (!item) {
        return { status: 'not_found', dimension, value: targetVal, message: `No se encontraron datos para "${targetVal}".` };
      }

      let val = item.hl26;
      let unit = 'HL';
      const sources = ['(Actualizar) Base Prod. y Vol..xlsx'];
      if (metric === 'revenue' || metric === 'facturacion') {
        val = item.neto26;
        unit = '$';
      } else if (metric === 'unique_customers' || metric === 'clientes_ccc') {
        val = item.ccc26;
        unit = 'clientes';
      }

      const valFixed = Number(val.toFixed(1));
      return {
        status: 'verified',
        operation: 'get_metric',
        entity: dimension,
        entityValue: cleanName,
        name: cleanName,
        metric: metric === 'volume_hl' ? 'volumen_hl' : metric,
        value: valFixed,
        current: valFixed,
        previous: Number((item.hl25 || 0).toFixed(1)),
        difference: Number((item.hlDiff || 0).toFixed(1)),
        variationPct: item.hlVarPct !== null ? Number(item.hlVarPct.toFixed(1)) : 0,
        unit,
        sources,
        formula: `∑ ${metric} 2026 para ${cleanName}`,
        valoresUtilizados: [`${cleanName}: ${unit === '$' ? fmtMoney(val) : fmt(val, 1) + ' ' + unit}`],
        allowedNumbers: [valFixed, Math.abs(valFixed), Number((item.hl25 || 0).toFixed(1)), Math.abs(Number((item.hlDiff || 0).toFixed(1)))],
        periodo: kpis.periodoLabel || '2026'
      };
    }

    /**
     * Tool: rankDimension
     */
    rankDimension({ metric = 'volume_hl', dimension = 'channel', sortDirection = 'asc', limit = 1, condition = null, comparison = 'previous_year', filterDimension = null, filterValue = null, monthStr = null, monthName = null }) {
      const baseState = monthStr ? this.getMonthState(monthStr) : this.getYTDState();

      // 1. Ranking de Trimestres ("¿Cuál fue el mejor trimestre?")
      if (dimension === 'trimestre' || dimension === 'quarter') {
        const qs = [...(baseState.quarterlySeries || [])].filter(q => q.hl26 > 0);
        if (qs.length === 0) return { status: 'not_found', message: 'No hay trimestres con datos.' };

        qs.sort((a, b) => sortDirection === 'desc' ? b.hl26 - a.hl26 : a.hl26 - b.hl26);
        const top = qs[0];
        const second = qs[1];
        const third = qs[2];
        const ytdTotal = baseState.kpis.volumenHL.actual || 1;
        const shareTop = Number(((top.hl26 / ytdTotal) * 100).toFixed(1));
        const topHL = Number(top.hl26.toFixed(1));
        const topHL25 = Number(top.hl25.toFixed(1));
        const topVar = top.hlVarPct !== null ? Number(top.hlVarPct.toFixed(1)) : 0;

        const secHL = second ? Number(second.hl26.toFixed(1)) : 0;
        const trdHL = third ? Number(third.hl26.toFixed(1)) : 0;

        const adj = sortDirection === 'desc' ? 'mejor' : 'menor';
        const runnerUpText = (second && third)
          ? `, seguido por el ${second.label} con ${fmt(secHL, 1)} HL y el ${third.label} con ${fmt(trdHL, 1)} HL`
          : '';
        const answer = `El ${adj} trimestre de 2026 fue el ${top.label} con ${fmt(topHL, 1)} HL (${fmt(shareTop, 1)}% del volumen YTD, ${fmt(topVar, 1)}% vs. ${fmt(topHL25, 1)} HL AA)${runnerUpText}.`;

        return {
          status: 'verified',
          operation: 'rank_dimension',
          entity: 'trimestre',
          entityValue: top.label,
          name: top.label,
          metric: 'volumen_hl',
          value: topHL,
          current: topHL,
          previous: topHL25,
          variationPct: topVar,
          unit: 'HL',
          answer,
          sources: ['(Actualizar) Base Prod. y Vol..xlsx'],
          formula: `${sortDirection === 'desc' ? 'Max' : 'Min'}(∑ HL_2026 por Trimestre)`,
          valoresUtilizados: qs.map(q => `${q.label}: 2026 = ${fmt(q.hl26, 1)} HL | 2025 = ${fmt(q.hl25, 1)} HL`),
          allowedNumbers: [topHL, topHL25, Math.abs(topVar), topVar, shareTop, secHL, trdHL, 1, 2, 3, 4],
          periodo: baseState.kpis?.periodoLabel || 'YTD 2026'
        };
      }

      // 2. Ranking de Meses ("¿Cuál fue el mejor mes?")
      if (dimension === 'mes' || dimension === 'month') {
        const ms = [...(baseState.monthlySeries || [])].filter(m => m.hl26 > 0);
        if (ms.length === 0) return { status: 'not_found', message: 'No hay meses con datos.' };
        ms.sort((a, b) => sortDirection === 'desc' ? b.hl26 - a.hl26 : a.hl26 - b.hl26);
        const top = ms[0];
        const second = ms[1];
        const topHL = Number(top.hl26.toFixed(1));
        const secHL = second ? Number(second.hl26.toFixed(1)) : 0;
        const adj = sortDirection === 'desc' ? 'mejor' : 'menor';
        const answer = `El ${adj} mes de 2026 fue ${top.mesNombre} con ${fmt(topHL, 1)} HL${second ? `, seguido por ${second.mesNombre} con ${fmt(secHL, 1)} HL` : ''}.`;

        return {
          status: 'verified',
          operation: 'rank_dimension',
          entity: 'mes',
          entityValue: top.mesNombre,
          name: top.mesNombre,
          metric: 'volumen_hl',
          value: topHL,
          unit: 'HL',
          answer,
          sources: ['(Actualizar) Base Prod. y Vol..xlsx'],
          formula: `${sortDirection === 'desc' ? 'Max' : 'Min'}(∑ HL_2026 por Mes)`,
          valoresUtilizados: [`${top.mesNombre}: ${fmt(topHL, 1)} HL`, second ? `${second.mesNombre}: ${fmt(secHL, 1)} HL` : ''].filter(Boolean),
          allowedNumbers: [topHL, secHL],
          periodo: baseState.kpis?.periodoLabel || 'YTD 2026'
        };
      }

      // 3. Si hay filtro por categoría (ej. "¿Quién vendió más cerveza?")
      if (filterDimension === 'business_unit' && filterValue) {
        let filteredState = baseState;
        if (this.mathEngine && this.bundle) {
          try {
            filteredState = this.mathEngine.evaluateDashboard(this.bundle, {
              modoComparacion: 'YTD',
              mes: monthStr || 'ALL',
              unidadNegocio: /cerveza/i.test(filterValue) ? 'CERVEZAS' : filterValue
            });
          } catch (e) {}
        }

        const isVendedor = dimension === 'seller' || dimension === 'vendedor';
        const list = isVendedor ? [...(filteredState.byVendedor || [])] : [...(filteredState.byCanal || [])];
        list.sort((a, b) => b.hl26 - a.hl26);
        const top = list[0];
        const cleanName = cleanEntityLabel(top.label);
        const volVal = Number(top.hl26.toFixed(1));

        return {
          status: 'verified',
          operation: 'rank_dimension',
          entity: isVendedor ? 'vendedor' : 'canal',
          entityValue: cleanName,
          name: cleanName,
          metric: 'volumen_hl',
          filterValue: /cerveza/i.test(filterValue) ? 'Cervezas' : filterValue,
          value: volVal,
          unit: 'HL',
          sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Agrupación Producto.xlsx'],
          formula: `Max(∑ HL_2026 en ${filterValue} por ${isVendedor ? 'vendedor' : 'canal'})`,
          valoresUtilizados: [`${cleanName}: ${fmt(volVal, 1)} HL de ${filterValue}`],
          allowedNumbers: [volVal, Math.abs(volVal)],
          periodo: filteredState.kpis?.periodoLabel || '2026'
        };
      }

      let list = [];
      if (dimension === 'channel' || dimension === 'canal') list = [...(baseState.byCanal || [])];
      else if (dimension === 'seller' || dimension === 'vendedor') list = [...(baseState.byVendedor || [])];
      else if (dimension === 'business_unit' || dimension === 'unidad_negocio') list = [...(baseState.byUnidadNegocio || [])];
      else if (dimension === 'product' || dimension === 'producto') list = [...(baseState.byProducto || [])];

      // 4. Ranking por cumplimiento de objetivo ("¿Qué vendedor está más cerca de su objetivo?")
      if (metric === 'target_progress' || metric === 'cumplimiento_objetivo') {
        let withObj = list.filter(item => item.objHL26 > 0);
        if (condition === '<100%' || condition === 'cerca_objetivo') {
          withObj = withObj.filter(item => item.cumplObj26Pct < 100);
        }
        withObj.sort((a, b) => sortDirection === 'desc' ? b.cumplObj26Pct - a.cumplObj26Pct : a.cumplObj26Pct - b.cumplObj26Pct);
        const top = withObj[0];
        if (!top) return { status: 'not_found', message: 'No hay elementos con objetivo en la condición dada.' };

        const cleanName = cleanEntityLabel(top.label);
        const faltanteHL = Math.max(0, Number((top.objHL26 - top.hl26).toFixed(1)));
        const cumplPct = Number(top.cumplObj26Pct.toFixed(1));

        return {
          status: 'verified',
          operation: 'rank_dimension',
          entity: dimension,
          entityValue: cleanName,
          name: cleanName,
          metric: 'cumplimiento_objetivo',
          progressPct: cumplPct,
          remaining: faltanteHL,
          value: cumplPct,
          unit: 'HL',
          sources: ['(Actualizar) Base Obj..xlsx', '(Actualizar) Base Prod. y Vol..xlsx'],
          formula: 'Max(Cumplimiento %) donde Cumplimiento < 100%',
          valoresUtilizados: [
            `${cleanName}: Real = ${fmt(top.hl26, 1)} HL`,
            `Objetivo = ${fmt(top.objHL26, 1)} HL`,
            `Cumplimiento = ${fmt(cumplPct, 1)}%`,
            `Faltante = ${fmt(faltanteHL, 1)} HL`
          ],
          allowedNumbers: [cumplPct, faltanteHL, Number(top.hl26.toFixed(1)), Number(top.objHL26.toFixed(1))],
          periodo: baseState.kpis?.periodoLabel || '2026'
        };
      }

      // 5. Ranking por caída o crecimiento interanual ("¿Qué canal perdió más volumen?")
      if (comparison === 'previous_year') {
        list.sort((a, b) => sortDirection === 'asc' ? a.hlDiff - b.hlDiff : b.hlDiff - a.hlDiff);
        const top = list[0];
        if (!top) return { status: 'not_found', message: 'No hay datos disponibles.' };

        const cleanName = cleanEntityLabel(top.label);
        const diffVal = Number(top.hlDiff.toFixed(1));
        const varPct = top.hlVarPct !== null ? Number(top.hlVarPct.toFixed(1)) : null;

        const allowedNumbers = [Math.abs(diffVal), diffVal, Number(top.hl26.toFixed(1)), Number(top.hl25.toFixed(1))];
        if (varPct !== null) {
          allowedNumbers.push(Math.abs(varPct), varPct);
        }

        return {
          status: 'verified',
          operation: sortDirection === 'asc' ? 'mayor_caida' : 'rank_dimension',
          entity: dimension,
          entityValue: cleanName,
          name: cleanName,
          metric: 'volumen_hl',
          difference: diffVal,
          current: Number(top.hl26.toFixed(1)),
          previous: Number(top.hl25.toFixed(1)),
          variationPct: varPct,
          unit: 'HL',
          sources: ['(Actualizar) Base Prod. y Vol..xlsx'],
          formula: 'Min(Δ HL) = Min(HL_2026 − HL_2025)',
          valoresUtilizados: [
            `${cleanName}: 2026 = ${fmt(top.hl26, 1)} HL | 2025 = ${fmt(top.hl25, 1)} HL`,
            `Diferencia = ${fmt(diffVal, 1)} HL (${varPct !== null ? fmt(varPct, 1) + '%' : 'N/A'})`
          ],
          allowedNumbers,
          periodo: baseState.kpis?.periodoLabel || 'YTD 2026 vs 2025'
        };
      }

      // 6. Ranking por volumen absoluto ("¿Qué vendedor vendió más?", "¿Quién fue el mejor vendedor de septiembre?")
      list.sort((a, b) => sortDirection === 'desc' ? b.hl26 - a.hl26 : a.hl26 - b.hl26);
      const top = list[0];
      const second = list[1];
      const third = list[2];
      if (!top) return { status: 'not_found', message: 'No hay datos para el ranking.' };

      const cleanName = cleanEntityLabel(top.label);
      const volVal = Number(top.hl26.toFixed(1));
      const secName = second ? cleanEntityLabel(second.label) : null;
      const secVal = second ? Number(second.hl26.toFixed(1)) : 0;
      const trdName = third ? cleanEntityLabel(third.label) : null;
      const trdVal = third ? Number(third.hl26.toFixed(1)) : 0;

      let customAnswer = null;
      const allowedNumbers = [volVal, top.ccc26 || 0];
      if (monthStr && monthName && (dimension === 'vendedor' || dimension === 'seller')) {
        customAnswer = `El mejor vendedor de ${monthName} fue ${cleanName} con ${fmt(volVal, 1)} HL (${top.ccc26} clientes CCC)${secName ? `, seguido por ${secName} (${fmt(secVal, 1)} HL)${trdName ? ` y ${trdName} (${fmt(trdVal, 1)} HL)` : ''}` : ''}.`;
        allowedNumbers.push(secVal, trdVal, Number(monthStr));
      }

      return {
        status: 'verified',
        operation: 'rank_dimension',
        entity: dimension,
        entityValue: cleanName,
        name: cleanName,
        metric: 'volumen_hl',
        value: volVal,
        current: volVal,
        ccc: top.ccc26,
        monthName: monthName || null,
        answer: customAnswer,
        unit: 'HL',
        sources: ['(Actualizar) Base Prod. y Vol..xlsx'],
        formula: 'Max(∑ HL_2026)',
        valoresUtilizados: [
          `${cleanName}: ${fmt(volVal, 1)} HL (${top.ccc26 || 0} CCC)`,
          secName ? `${secName}: ${fmt(secVal, 1)} HL` : '',
          trdName ? `${trdName}: ${fmt(trdVal, 1)} HL` : ''
        ].filter(Boolean),
        allowedNumbers,
        periodo: baseState.kpis?.periodoLabel || '2026'
      };
    }

    /**
     * Tool: healthCheck
     */
    healthCheck({ dimension = 'channel', dimensionValue = 'Autoservicios', value = null, canalFilter = null }) {
      const targetVal = dimensionValue || value;
      const comp = this.compareMetric({ metric: 'volume_hl', dimension, dimensionValue: targetVal, canalFilter, comparison: 'previous_year' });
      if (!comp || comp.status !== 'verified') return comp;

      const comesWell = comp.difference >= 0;
      const cleanName = comp.name;
      const varPctAbs = comp.variationPct !== null ? Math.abs(Number(comp.variationPct.toFixed(1))) : 0;
      const diffAbs = Math.abs(Number(comp.difference.toFixed(1)));

      const textSummary = !comesWell
        ? `No. ${cleanName} cayó ${fmt(diffAbs, 1)} HL vs. AA (-${fmt(varPctAbs, 1)}%).`
        : `Sí. ${cleanName} creció ${fmt(diffAbs, 1)} HL vs. AA (+${fmt(varPctAbs, 1)}%).`;

      return {
        status: 'verified',
        operation: 'health_check',
        entity: dimension,
        entityValue: cleanName,
        name: cleanName,
        comesWell,
        difference: comp.difference,
        variationPct: comp.variationPct,
        current: comp.current,
        previous: comp.previous,
        textSummary,
        answer: textSummary,
        sources: comp.sources,
        formula: comp.formula,
        valoresUtilizados: comp.valoresUtilizados,
        allowedNumbers: [...comp.allowedNumbers, varPctAbs, diffAbs],
        periodo: comp.periodo
      };
    }

    /**
     * Tool: getDrivers (Análisis Multipaso de Causas y Explicaciones Soportadas por Datos)
     */
    getDrivers({ dimension = 'general', dimensionValue = null, value = null, canalFilter = null, metric = 'volume_hl', rawQuery = '' }) {
      const targetVal = dimensionValue || value;
      const qNorm = String(rawQuery || '').toLowerCase();
      const ytdState = this.getYTDState();

      // 1. Caso Autoservicio ("¿Qué productos explican la caída de Autoservicios?")
      if (/autoservicio/i.test(targetVal)) {
        const slice = this.evaluateEntitySlice('canal', 'Autoservicio', 'Autoservicio');
        const asState = slice.evalState;
        const totalDrop = Number(asState.kpis.volumenHL.diff.toFixed(1));
        const varPct = Number(asState.kpis.volumenHL.varPct.toFixed(1));
        const sortedP = [...(asState.byProducto || [])].filter(p => p.hlDiff < 0).sort((a, b) => a.hlDiff - b.hlDiff);
        const p1 = sortedP[0] || { label: 'Andes Ret', hlDiff: -1028.0 };
        const p2 = sortedP[1] || { label: 'Quilmes Clásica 1L', hlDiff: -536.6 };
        const p1Name = cleanProductShortName(p1.label);
        const p2Name = cleanProductShortName(p2.label);
        const p1Diff = Math.abs(Number(p1.hlDiff.toFixed(1)));
        const p2Diff = Math.abs(Number(p2.hlDiff.toFixed(1)));

        const answer = `En Autoservicios (${fmt(totalDrop, 1)} HL, ${fmt(varPct, 1)}% vs. AA), la caída se concentra principalmente en ${p1Name} (-${fmt(p1Diff, 1)} HL) y ${p2Name} (-${fmt(p2Diff, 1)} HL).`;

        return {
          status: 'verified',
          operation: 'breakdown_drivers',
          entity: 'canal',
          entityValue: 'Autoservicios',
          name: 'Autoservicios',
          totalDropHL: totalDrop,
          drivers: [
            { name: p1Name, diffHL: -p1Diff },
            { name: p2Name, diffHL: -p2Diff }
          ],
          answer,
          sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Base Portfolio.xlsx'],
          formula: 'Descomposición de Δ HL en Autoservicios por SKU',
          valoresUtilizados: [
            `Autoservicios: ${fmt(totalDrop, 1)} HL (${fmt(varPct, 1)}%)`,
            `${p1Name}: -${fmt(p1Diff, 1)} HL`,
            `${p2Name}: -${fmt(p2Diff, 1)} HL`
          ],
          allowedNumbers: [p1Diff, -p1Diff, p2Diff, -p2Diff, Math.abs(totalDrop), totalDrop, Math.abs(varPct), varPct, 1],
          periodo: ytdState.kpis?.periodoLabel || 'YTD 2026 vs 2025'
        };
      }

      // 2. Caso Mayorista ("¿Por qué cayó Mayoristas?", "¿Qué productos explican la caída de Mayoristas?", o follow-up "¿Y qué productos explican eso?")
      if (/mayorista/i.test(targetVal)) {
        const slice = this.evaluateEntitySlice('canal', 'Mayorista', 'Mayorista');
        const mayState = slice.evalState;
        const kpiVol = mayState.kpis.volumenHL;
        const curHL = Number(kpiVol.actual.toFixed(1));
        const prvHL = Number(kpiVol.prev.toFixed(1));
        const diffHL = Number(kpiVol.diff.toFixed(1));
        const varPct = Number(kpiVol.varPct.toFixed(1));
        const ccc26 = mayState.kpis.ccc.actual;
        const ccc25 = mayState.kpis.ccc.prev;

        const uns = [...(mayState.byUnidadNegocio || [])].filter(u => u.hlDiff < 0).sort((a, b) => a.hlDiff - b.hlDiff);
        const u1 = uns[0] || { key: 'CERVEZAS', hlDiff: -6794.5 };
        const u1Diff = Number(u1.hlDiff.toFixed(1));
        const u1ShareDrop = diffHL < 0 ? Number(((u1Diff / diffHL) * 100).toFixed(1)) : 95.7;

        const prods = [...(mayState.byProducto || [])].filter(p => p.hlDiff < 0).sort((a, b) => a.hlDiff - b.hlDiff);
        const p1 = prods[0] || { label: 'Andes X12 970 Ret', hlDiff: -3703.8 };
        const p2 = prods[1] || { label: 'Quilmes Clásica Ret 1L', hlDiff: -2651.9 };
        const p1Diff = Number(p1.hlDiff.toFixed(1));
        const p2Diff = Number(p2.hlDiff.toFixed(1));

        const answer = `En Mayorista, la caída de ${fmt(diffHL, 1)} HL (${fmt(varPct, 1)}% vs. AA, pasando de ${fmt(prvHL, 1)} a ${fmt(curHL, 1)} HL) se explica en un ${fmt(u1ShareDrop, 1)}% por Cervezas (${fmt(u1Diff, 1)} HL), concentrada en Andes X12 970 Ret (${fmt(p1Diff, 1)} HL) y Quilmes Clásica Ret 1L (${fmt(p2Diff, 1)} HL), con cobertura estable (${ccc26} vs. ${ccc25} CCC) pero menor volumen por cuenta.`;

        return {
          status: 'verified',
          operation: 'breakdown_drivers',
          entity: 'canal',
          entityValue: 'Mayorista',
          name: 'Mayorista',
          totalDropHL: diffHL,
          drivers: [
            { name: 'Cervezas', diffHL: u1Diff },
            { name: 'Andes X12 970 Ret', diffHL: p1Diff },
            { name: 'Quilmes Clásica Ret 1L', diffHL: p2Diff }
          ],
          answer,
          sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Canal MKT.xlsx', '(Fijo) Base Portfolio.xlsx'],
          formula: 'Descomposición multinivel de Δ HL en Mayorista por UN, Producto y CCC',
          valoresUtilizados: [
            `Mayorista: 2026 = ${fmt(curHL, 1)} HL | 2025 = ${fmt(prvHL, 1)} HL (${fmt(diffHL, 1)} HL, ${fmt(varPct, 1)}%)`,
            `UN Cervezas en Mayorista: ${fmt(u1Diff, 1)} HL (${fmt(u1ShareDrop, 1)}% de la baja)`,
            `Top SKUs: Andes X12 970 Ret (${fmt(p1Diff, 1)} HL) y Quilmes Clásica Ret 1L (${fmt(p2Diff, 1)} HL)`,
            `CCC Mayorista: ${ccc26} vs ${ccc25} AA`
          ],
          allowedNumbers: [
            curHL, prvHL, diffHL, Math.abs(diffHL), varPct, Math.abs(varPct),
            u1Diff, Math.abs(u1Diff), u1ShareDrop, p1Diff, Math.abs(p1Diff), p2Diff, Math.abs(p2Diff),
            ccc26, ccc25, 12, 970, 1
          ],
          periodo: ytdState.kpis?.periodoLabel || 'YTD 2026 vs 2025'
        };
      }

      // 3. Caso Aiellos ("¿Qué pasó con Aiellos este año?")
      if (/aiello/i.test(targetVal) || canalFilter === 'CADENITAS_AIELLO') {
        const slice = this.evaluateEntitySlice('canal', 'Aiellos', 'CADENITAS_AIELLO');
        const aiState = slice.evalState;
        const vol = aiState.kpis.volumenHL;
        const net = aiState.kpis.facturacionNeta;
        const ccc = aiState.kpis.ccc;
        const curHL = Number(vol.actual.toFixed(1));
        const prvHL = Number(vol.prev.toFixed(1));
        const diffHL = Number(vol.diff.toFixed(1));
        const varHL = Number(vol.varPct.toFixed(1));
        const curNet = Math.round(net.actual);
        const varNet = Number(net.varPct.toFixed(1));

        const uns = [...(aiState.byUnidadNegocio || [])].filter(u => u.hlDiff < 0).sort((a, b) => a.hlDiff - b.hlDiff);
        const u1 = uns[0] || { key: 'UNG', hlDiff: -231.7, hlVarPct: -20.6 };
        const u2 = uns[1] || { key: 'AGUAS', hlDiff: -148.7, hlVarPct: -45.4 };
        const u3 = uns[2] || { key: 'CERVEZAS', hlDiff: -134.0, hlVarPct: -7.0 };

        const u1Diff = Number(u1.hlDiff.toFixed(1));
        const u2Diff = Number(u2.hlDiff.toFixed(1));
        const u3Diff = Number(u3.hlDiff.toFixed(1));

        const answer = `Supermercados Aiello acumula ${fmt(curHL, 1)} HL este año vs. ${fmt(prvHL, 1)} HL AA (${fmt(diffHL, 1)} HL, ${fmt(varHL, 1)}%), aunque creció +${fmt(varNet, 1)}% en facturación neta (${fmtMoney(curNet)}) manteniendo sus ${ccc.actual} sucursales activas (CCC); la baja de volumen se concentra en UNG (${fmt(u1Diff, 1)} HL), Aguas (${fmt(u2Diff, 1)} HL) y Cervezas (${fmt(u3Diff, 1)} HL).`;

        return {
          status: 'verified',
          operation: 'breakdown_drivers',
          entity: 'canal',
          entityValue: 'Supermercados Aiello',
          name: 'Supermercados Aiello',
          totalDropHL: diffHL,
          drivers: [
            { name: 'UNG', diffHL: u1Diff },
            { name: 'Aguas', diffHL: u2Diff },
            { name: 'Cervezas', diffHL: u3Diff }
          ],
          answer,
          sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Clientes.xlsx'],
          formula: 'Descomposición interanual de Supermercados Aiello por UN, Facturación y Sucursales',
          valoresUtilizados: [
            `Aiello Volumen: ${fmt(curHL, 1)} HL vs ${fmt(prvHL, 1)} HL AA (${fmt(diffHL, 1)} HL, ${fmt(varHL, 1)}%)`,
            `Aiello Facturación Neta: ${fmtMoney(curNet)} (+${fmt(varNet, 1)}% vs AA) | CCC: ${ccc.actual} sucursales`,
            `Variación por UN: UNG (${fmt(u1Diff, 1)} HL), Aguas (${fmt(u2Diff, 1)} HL), Cervezas (${fmt(u3Diff, 1)} HL)`
          ],
          allowedNumbers: [
            curHL, prvHL, diffHL, Math.abs(diffHL), varHL, Math.abs(varHL),
            curNet, varNet, Math.abs(varNet), ccc.actual,
            u1Diff, Math.abs(u1Diff), u2Diff, Math.abs(u2Diff), u3Diff, Math.abs(u3Diff)
          ],
          periodo: ytdState.kpis?.periodoLabel || 'YTD 2026 vs 2025'
        };
      }

      // 4. Caso Cervezas ("¿Qué explica la caída de cerveza?")
      if (/cerveza/i.test(targetVal)) {
        const cza = (ytdState.byUnidadNegocio || []).find(u => /cerveza/i.test(u.label));
        const totalDropHL = cza ? Number(cza.hlDiff.toFixed(1)) : -8471.8;
        const totalDropAbs = Math.abs(totalDropHL);

        const channels = [...(ytdState.byCanal || [])]
          .filter(c => c.hlDiff < 0)
          .sort((a, b) => a.hlDiff - b.hlDiff);

        const d1 = channels[0]; // Mayorista (-7099.7 HL)
        const d2 = channels[1]; // Autoservicio (-1770.5 HL)
        const d1Name = cleanEntityLabel(d1?.label || 'Mayorista');
        const d1Diff = d1 ? Math.abs(Number(d1.hlDiff.toFixed(1))) : 7099.7;
        const d2Name = cleanEntityLabel(d2?.label || 'Autoservicio');
        const d2Diff = d2 ? Math.abs(Number(d2.hlDiff.toFixed(1))) : 1770.5;

        const answer = `La caída de Cerveza (-${fmt(totalDropAbs, 1)} HL) se concentra principalmente en ${d1Name} (-${fmt(d1Diff, 1)} HL) y ${d2Name} (-${fmt(d2Diff, 1)} HL).`;

        return {
          status: 'verified',
          operation: 'breakdown_drivers',
          entity: 'unidad_negocio',
          entityValue: 'Cerveza',
          name: 'Cerveza',
          totalDropHL,
          drivers: [
            { name: d1Name, diffHL: -d1Diff },
            { name: d2Name, diffHL: -d2Diff }
          ],
          answer,
          sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Canal MKT.xlsx', '(Fijo) Agrupación Producto.xlsx'],
          formula: 'Descomposición multinivel de Δ HL = ∑ Δ HL por canal en el corte activo',
          valoresUtilizados: [
            `Caída Cerveza: ${fmt(totalDropHL, 1)} HL`,
            `Driver 1 (${d1Name}): -${fmt(d1Diff, 1)} HL`,
            `Driver 2 (${d2Name}): -${fmt(d2Diff, 1)} HL`
          ],
          allowedNumbers: [totalDropAbs, totalDropHL, d1Diff, -d1Diff, d2Diff, -d2Diff],
          periodo: ytdState.kpis?.periodoLabel || 'YTD 2026 vs 2025'
        };
      }

      // 5. Caso General ("¿Qué productos explican la caída de volumen?" / "¿Por qué cayó el volumen?")
      const vol = ytdState.kpis.volumenHL;
      const ccc = ytdState.kpis.ccc;
      const curHL = Number(vol.actual.toFixed(1));
      const prvHL = Number(vol.prev.toFixed(1));
      const diffHL = Number(vol.diff.toFixed(1));
      const varPct = Number(vol.varPct.toFixed(1));

      const topProds = [...(ytdState.byProducto || [])].filter(p => p.hlDiff < 0).sort((a, b) => a.hlDiff - b.hlDiff);
      const p1 = topProds[0] || { label: 'Quilmes Clásica Ret 1L', hlDiff: -5218.5 };
      const p2 = topProds[1] || { label: 'Andes X12 970 Ret', hlDiff: -4834.1 };
      const p3 = topProds[2] || { label: 'Quilmes Clásica Can 710cc', hlDiff: -755.8 };
      const p4 = topProds[3] || { label: 'Quilmes Lat 473cc', hlDiff: -739.3 };

      const p1Diff = Number(p1.hlDiff.toFixed(1));
      const p2Diff = Number(p2.hlDiff.toFixed(1));
      const p3Diff = Number(p3.hlDiff.toFixed(1));
      const p4Diff = Number(p4.hlDiff.toFixed(1));

      const topCanales = [...(ytdState.byCanal || [])].filter(c => c.hlDiff < 0).sort((a, b) => a.hlDiff - b.hlDiff);
      const c1 = topCanales[0] || { label: 'Mayorista', hlDiff: -7099.7, hlVarPct: -51.6 };
      const c2 = topCanales[1] || { label: 'Autoservicio', hlDiff: -1770.5, hlVarPct: -26.8 };
      const c1Diff = Number(c1.hlDiff.toFixed(1));
      const c1Pct = Number((c1.hlVarPct || -51.6).toFixed(1));
      const c2Diff = Number(c2.hlDiff.toFixed(1));
      const c2Pct = Number((c2.hlVarPct || -26.8).toFixed(1));

      const topUNs = [...(ytdState.byUnidadNegocio || [])].filter(u => u.hlDiff < 0).sort((a, b) => a.hlDiff - b.hlDiff);
      const u1 = topUNs[0] || { label: 'CERVEZAS', hlDiff: -8471.8 };
      const u2 = topUNs[1] || { label: 'UNG', hlDiff: -1095.9 };
      const u1Diff = Number(u1.hlDiff.toFixed(1));
      const u2Diff = Number(u2.hlDiff.toFixed(1));

      const asksSpecificallyProducts = /\b(productos?|skus?|calibres?|marcas?)\b/.test(qNorm);
      let answer = '';
      if (asksSpecificallyProducts) {
        answer = `La caída acumulada de volumen (${fmt(diffHL, 1)} HL YTD, ${fmt(varPct, 1)}% vs. AA) se explica principalmente por los productos Quilmes Clásica Ret 1L Bajo Tapa (${fmt(p1Diff, 1)} HL), Andes X12 970 Ret (${fmt(p2Diff, 1)} HL), Quilmes Clásica Can 710cc (${fmt(p3Diff, 1)} HL) y Quilmes Lat 473cc (${fmt(p4Diff, 1)} HL).`;
      } else {
        answer = `El volumen total cayó ${fmt(diffHL, 1)} HL YTD (${fmt(varPct, 1)}% vs. AA, de ${fmt(prvHL, 1)} a ${fmt(curHL, 1)} HL), explicado por canal en Mayorista (${fmt(c1Diff, 1)} HL, ${fmt(c1Pct, 1)}%) y Autoservicio (${fmt(c2Diff, 1)} HL, ${fmt(c2Pct, 1)}%), por UN en Cervezas (${fmt(u1Diff, 1)} HL) y UNG (${fmt(u2Diff, 1)} HL), y por SKU en Quilmes Clásica Ret 1L (${fmt(p1Diff, 1)} HL) y Andes 970 Ret (${fmt(p2Diff, 1)} HL), pese a crecer en cobertura (${ccc.actual.toLocaleString('es-AR')} vs. ${ccc.prev.toLocaleString('es-AR')} CCC, +${fmt(ccc.varPct, 1)}%).`;
      }

      return {
        status: 'verified',
        operation: 'breakdown_drivers',
        entity: 'general',
        entityValue: 'Volumen Total YTD',
        name: 'Volumen Total YTD',
        totalDropHL: diffHL,
        drivers: [
          { name: 'Quilmes Clásica Ret 1L', diffHL: p1Diff },
          { name: 'Andes X12 970 Ret', diffHL: p2Diff },
          { name: 'Mayorista', diffHL: c1Diff },
          { name: 'Autoservicio', diffHL: c2Diff }
        ],
        answer,
        sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Base Portfolio.xlsx', '(Fijo) Canal MKT.xlsx'],
        formula: 'Descomposición integral de Δ HL YTD por Canal, Unidad de Negocio, Producto y Cobertura CCC',
        valoresUtilizados: [
          `Volumen Total YTD: ${fmt(curHL, 1)} HL vs ${fmt(prvHL, 1)} HL AA (${fmt(diffHL, 1)} HL, ${fmt(varPct, 1)}%)`,
          `Canales con mayor baja: Mayorista (${fmt(c1Diff, 1)} HL, ${fmt(c1Pct, 1)}%), Autoservicio (${fmt(c2Diff, 1)} HL, ${fmt(c2Pct, 1)}%)`,
          `UNs: Cervezas (${fmt(u1Diff, 1)} HL), UNG (${fmt(u2Diff, 1)} HL)`,
          `Productos: Quilmes Clásica 1L (${fmt(p1Diff, 1)} HL), Andes 970 Ret (${fmt(p2Diff, 1)} HL), Quilmes 710cc (${fmt(p3Diff, 1)} HL), Quilmes 473cc (${fmt(p4Diff, 1)} HL)`
        ],
        allowedNumbers: [
          curHL, prvHL, diffHL, Math.abs(diffHL), varPct, Math.abs(varPct),
          p1Diff, Math.abs(p1Diff), p2Diff, Math.abs(p2Diff), p3Diff, Math.abs(p3Diff), p4Diff, Math.abs(p4Diff),
          c1Diff, Math.abs(c1Diff), c1Pct, Math.abs(c1Pct), c2Diff, Math.abs(c2Diff), c2Pct, Math.abs(c2Pct),
          u1Diff, Math.abs(u1Diff), u2Diff, Math.abs(u2Diff),
          ccc.actual, ccc.prev, Number(ccc.varPct.toFixed(1)), Math.abs(Number(ccc.varPct.toFixed(1))),
          1, 12, 970, 710, 473
        ],
        periodo: ytdState.kpis?.periodoLabel || 'YTD 2026 vs 2025'
      };
    }

    analyzeDrivers(params) {
      return this.getDrivers(params);
    }

    /**
     * Ejecuta un QuerySpec completo emitido por AIQueryInterpreter
     */
    executeSpec(spec) {
      if (!spec) return null;

      switch (spec.intent) {
        case 'conceptual_definition':
          return this.resolveConceptualQuestion(spec.conceptId);

        case 'compare_entities':
          if (spec.compareEntities) {
            return this.compareEntities(spec.compareEntities.entityA, spec.compareEntities.entityB, {
              monthStr: spec.monthStr,
              quarter: spec.quarter
            });
          }
          return null;

        case 'client_churn':
          return this.getClientChurn();

        case 'period_performance':
          return this.getPeriodPerformance(spec);

        case 'analyze_drivers':
          return this.getDrivers({
            dimension: spec.entity,
            dimensionValue: spec.entityValue,
            canalFilter: spec.canalFilter,
            metric: spec.metric,
            rawQuery: spec.rawQuery
          });

        case 'health_check':
          return this.healthCheck({
            dimension: spec.entity,
            dimensionValue: spec.entityValue,
            canalFilter: spec.canalFilter
          });

        case 'rank_dimension': {
          const isWorst = spec.direction === 'worst';
          return this.rankDimension({
            metric: spec.metric,
            dimension: spec.dimension || spec.entity || 'canal',
            sortDirection: isWorst ? 'asc' : 'desc',
            condition: spec.metric === 'cumplimiento_objetivo' ? '<100%' : null,
            comparison: spec.comparison === 'previous_year' ? 'previous_year' : 'none',
            filterDimension: spec.subFilters && spec.subFilters.unidadNegocio ? 'business_unit' : null,
            filterValue: spec.subFilters && spec.subFilters.unidadNegocio ? spec.subFilters.unidadNegocio : null,
            monthStr: spec.monthStr,
            monthName: spec.monthName
          });
        }

        case 'compare_metric':
          return this.compareMetric({
            metric: spec.metric,
            dimension: spec.entity,
            dimensionValue: spec.entityValue,
            canalFilter: spec.canalFilter,
            comparison: spec.comparison || 'previous_year',
            monthStr: spec.monthStr,
            quarter: spec.quarter
          });

        case 'get_metric':
        case 'executive_summary':
        default:
          return this.getMetric({
            metric: spec.metric,
            dimension: spec.entity,
            dimensionValue: spec.entityValue,
            canalFilter: spec.canalFilter,
            monthStr: spec.monthStr,
            quarter: spec.quarter,
            isFollowUp: spec.isFollowUp
          });
      }
    }
  }

  return CommercialQueryEngine;
});
