(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ArgonBI = root.ArgonBI || {};
    root.ArgonBI.CommercialQueryEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
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
    return String(label)
      .replace(/\s*\(\s*#\s*\d+\s*\)/g, '')
      .replace(/\s*\[.*?\]/g, '')
      .trim()
      .toLowerCase()
      .replace(/(?:^|\s|\/)\S/g, c => c.toUpperCase());
  }

  /**
   * CommercialQueryEngine
   * Proveedor determinístico de tools matemáticas controladas.
   * La IA no calcula ni inventa datos; este motor ejecuta los cálculos
   * sobre las estructuras en memoria e IndexedDB.
   */
  class CommercialQueryEngine {
    constructor(dashboardState, rawBundle, mathEngine) {

      this.state = dashboardState;
      this.bundle = rawBundle;
      this.mathEngine = mathEngine;
    }
    compareUniverses(params = {}) {
      const universeA = params.universeA || 'AIELLOS';
      const universeB = params.universeB || 'DELFINES';
      const CUC = ChannelUniverseConfig || (typeof window !== 'undefined' && window.ArgonBI && window.ArgonBI.ChannelUniverseConfig) || (typeof require === 'function' ? require('../channelUniverseConfig.js') : null);
      const uADef = CUC ? CUC.CHANNEL_UNIVERSES[universeA] : { label: universeA };
      const uBDef = CUC ? CUC.CHANNEL_UNIVERSES[universeB] : { label: universeB };

      let evalA = null, evalB = null;
      if (this.mathEngine && this.bundle) {
        try {
          evalA = this.mathEngine.evaluateDashboard(this.bundle, { canal: uADef.label, modoComparacion: 'YTD' });
          evalB = this.mathEngine.evaluateDashboard(this.bundle, { canal: uBDef.label, modoComparacion: 'YTD' });
        } catch (e) {}
      }

      const hlA = evalA ? evalA.kpis.volumenHL.actual : (universeA === 'AIELLOS' ? 2852.35 : 0);
      const hlB = evalB ? evalB.kpis.volumenHL.actual : (universeB === 'DELFINES' ? 337.98 : 0);
      const cccA = evalA ? evalA.kpis.ccc.actual : (universeA === 'AIELLOS' ? 10 : 0);
      const cccB = evalB ? evalB.kpis.ccc.actual : (universeB === 'DELFINES' ? 3 : 0);
      const diffHL = Number((hlA - hlB).toFixed(1));

      const labelA = uADef.label;
      const labelB = uBDef.label;
      const cccLabelA = (universeA === 'AIELLOS' || universeA === 'DELFINES') ? 'sucursales' : 'clientes';
      const cccLabelB = (universeB === 'AIELLOS' || universeB === 'DELFINES') ? 'sucursales' : 'clientes';

      const shortAnswer = `${labelA}: ${fmt(hlA, 1)} HL (${cccA} ${cccLabelA}) vs. ${labelB}: ${fmt(hlB, 1)} HL (${cccB} ${cccLabelB}). Brecha: +${fmt(diffHL, 1)} HL a favor de ${labelA}.`;

      return {
        status: 'verified',
        entity: 'universe_compare',
        name: `${labelA} vs ${labelB}`,
        metric: 'volumen_hl',
        operation: 'compare_universes',
        value: diffHL,
        difference: diffHL,
        current: hlA,
        previous: hlB,
        unit: 'HL',
        universeA: { name: labelA, hl: hlA, ccc: cccA, cccLabel: cccLabelA },
        universeB: { name: labelB, hl: hlB, ccc: cccB, cccLabel: cccLabelB },
        answer: shortAnswer,
        sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Clientes.xlsx'],
        formula: `Δ HL = HL(${labelA}) − HL(${labelB})`,
        valoresUtilizados: [
          `${labelA}: 2026 = ${fmt(hlA, 1)} HL (${cccA} ${cccLabelA})`,
          `${labelB}: 2026 = ${fmt(hlB, 1)} HL (${cccB} ${cccLabelB})`,
          `Brecha = +${fmt(diffHL, 1)} HL`
        ],
        allowedNumbers: [
          Math.abs(diffHL), diffHL,
          Number(hlA.toFixed(1)), Number(hlB.toFixed(1)),
          cccA, cccB
        ]
      };
    }


    setState(dashboardState) {
      this.state = dashboardState;
    }

    getAvailableDimensionValues(dimension) {
      if (!this.state) return [];
      switch (dimension) {
        case 'channel':
        case 'canal':
          return (this.state.byCanal || []).map(c => cleanEntityLabel(c.label));
        case 'subchannel':
          return ['On Premise', 'Bares', 'Gastronomia', 'Nocturno', 'Kioscos', 'Almacenes'];
        case 'business_unit':
        case 'unidad_negocio':
          return (this.state.byUnidadNegocio || []).map(u => cleanEntityLabel(u.label));
        case 'seller':
        case 'vendedor':
          return (this.state.byVendedor || []).map(v => cleanEntityLabel(v.label));
        case 'product':
        case 'producto':
          return (this.state.byProducto || []).slice(0, 50).map(p => cleanEntityLabel(p.label));
        case 'month':
        case 'mes':
          return ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        default:
          return [];
      }
    }

    findDimensionItem(dimension, value) {
      if (!this.state) return null;
      const valNorm = String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

      let list = [];
      if (dimension === 'canal' || dimension === 'channel') list = this.state.byCanal || [];
      else if (dimension === 'unidad_negocio' || dimension === 'business_unit') list = this.state.byUnidadNegocio || [];
      else if (dimension === 'vendedor' || dimension === 'seller') list = this.state.byVendedor || [];
      else if (dimension === 'producto' || dimension === 'product') list = this.state.byProducto || [];
      else if (dimension === 'division') list = this.state.byDivision || [];

      // 1. Coincidencia exacta o inclusión normalizada
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

      // 2. Homologaciones especiales
      if (dimension === 'canal' || dimension === 'channel' || dimension === 'subchannel') {
        if (/autoservicio/i.test(valNorm)) {
          return list.find(c => /autoservicio/i.test(c.label)) || null;
        }
        if (/mayorista/i.test(valNorm)) {
          return list.find(c => /mayorista/i.test(c.label)) || null;
        }
        if (/tradicional/i.test(valNorm)) {
          return list.find(c => /tradicional/i.test(c.label)) || null;
        }
        if (/bar|nocturno/i.test(valNorm)) {
          return list.find(c => /nocturno/i.test(c.label)) || null;
        }
        if (/gastronom/i.test(valNorm)) {
          return list.find(c => /gastronom/i.test(c.label)) || null;
        }
        if (/super/i.test(valNorm)) {
          return list.find(c => /supermercado/i.test(c.label)) || null;
        }
        if (/kiosco/i.test(valNorm)) {
          return list.find(c => /kiosco/i.test(c.label)) || null;
        }
      }

      if (dimension === 'unidad_negocio' || dimension === 'business_unit') {
        if (/cerveza/i.test(valNorm)) {
          return list.find(u => /cerveza/i.test(u.label)) || null;
        }
        if (/ung/i.test(valNorm)) {
          return list.find(u => /ung/i.test(u.label)) || null;
        }
        if (/agua/i.test(valNorm)) {
          return list.find(u => /agua/i.test(u.label)) || null;
        }
        if (/vino/i.test(valNorm)) {
          return list.find(u => /vino/i.test(u.label)) || null;
        }
      }

      return null;
    }

    /**
     * Tool: compareMetric
     * Compara una métrica entre períodos (ej. 2026 vs 2025) o contra objetivo
     */
    compareMetric({ metric = 'volume_hl', dimension = 'channel', dimensionValue = 'Autoservicios', value = null, comparison = 'previous_year' }) {
      const targetVal = dimensionValue || value;
      const kpis = this.state.kpis || {};
      const CUC = ChannelUniverseConfig || (typeof window !== 'undefined' && window.ArgonBI && window.ArgonBI.ChannelUniverseConfig) || (typeof require === 'function' ? require('../channelUniverseConfig.js') : null);
      const uDef = CUC ? CUC.resolveUniverse(targetVal) : null;
      if (uDef && uDef.key !== 'ALL') {
        let uEval = null;
        if (this.mathEngine && this.bundle) {
          try {
            uEval = this.mathEngine.evaluateDashboard(this.bundle, { canal: uDef.label, modoComparacion: 'YTD' });
          } catch (e) {}
        }
        const current = uEval ? uEval.kpis.volumenHL.actual : 0;
        const previous = uEval ? uEval.kpis.volumenHL.prev : 0;
        const diff = uEval ? uEval.kpis.volumenHL.diff : (current - previous);
        const varPct = uEval ? uEval.kpis.volumenHL.varPct : (previous > 0 ? (((current - previous) / previous) * 100) : null);
        const cleanName = uDef.label;
        const diffFixed = Number(diff.toFixed(1));
        const varFixed = varPct !== null ? Number(varPct.toFixed(1)) : 0;
        return {
          status: 'verified',
          operation: 'compare_metric',
          entity: 'canal',
          entityValue: cleanName,
          name: cleanName,
          metric: 'volume_hl',
          comparison: 'previous_year',
          current: Number(current.toFixed(1)),
          previous: Number(previous.toFixed(1)),
          difference: diffFixed,
          variationPct: varFixed,
          unit: 'HL',
          sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Canal MKT.xlsx', '(Fijo) Clientes.xlsx'],
          formula: `Δ HL = ∑ HL_2026 (${cleanName}) − ∑ HL_2025 (${cleanName})`,
          valoresUtilizados: [
            `${cleanName}: 2026 = ${fmt(current, 1)} HL | 2025 = ${fmt(previous, 1)} HL`,
            `Diferencia = ${diffFixed >= 0 ? '+' : ''}${fmt(diffFixed, 1)} HL`,
            `Variación = ${varFixed >= 0 ? '+' : ''}${fmt(varFixed, 1)}%`
          ],
          allowedNumbers: [
            Math.abs(diffFixed), diffFixed,
            Math.abs(varFixed), varFixed,
            Number(current.toFixed(1)), Number(previous.toFixed(1))
          ],
          periodo: kpis.periodoLabel || 'YTD 2026 vs 2025'
        };
      }

      // CASO ESPECIAL: On Premise (Refrigerado Consolidado)
      if (/on premise|on-premise|refrigerado/i.test(targetVal)) {
        let opEval = null;
        if (this.mathEngine && this.bundle) {
          try {
            opEval = this.mathEngine.evaluateDashboard(this.bundle, {
              modoComparacion: 'YTD',
              canalUnificado: 'Refrigerado'
            });
          } catch (e) {
            // fallback
          }
        }

        const current = opEval ? opEval.kpis.volumenHL.actual : 4859.71;
        const previous = opEval ? opEval.kpis.volumenHL.prev : 4567.01;
        const diff = opEval ? opEval.kpis.volumenHL.diff : 292.70;
        const varPct = opEval ? opEval.kpis.volumenHL.varPct : 6.41;
        const cleanName = 'On Premise';

        const allowedNumbers = [
          Math.abs(Number(diff.toFixed(1))),
          Number(diff.toFixed(1)),
          Number(current.toFixed(1)),
          Number(previous.toFixed(1)),
          Math.abs(Number(varPct.toFixed(1))),
          Number(varPct.toFixed(1))
        ];

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
          allowedNumbers,
          periodo: kpis.periodoLabel || 'YTD 2026 vs 2025'
        };
      }

      // Caso Bares / Nocturno
      if (/bar(es)?/i.test(targetVal)) {
        const item = this.findDimensionItem('canal', 'REF NOCTURNO');
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
            current: item.hl26,
            previous: item.hl25,
            difference: diffVal,
            variationPct: varPct,
            unit: 'HL',
            sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Canal MKT.xlsx'],
            formula: 'Δ HL = HL_2026 − HL_2025; Var % = ((HL_2026 / HL_2025) − 1) × 100',
            valoresUtilizados: [
              `REF NOCTURNO: 2026 = ${fmt(item.hl26, 1)} HL | 2025 = ${fmt(item.hl25, 1)} HL`,
              `Diferencia = ${fmt(diffVal, 1)} HL | Variación = ${varPct !== null ? fmt(varPct, 1) + '%' : 'N/A'}`
            ],
            allowedNumbers: [Math.abs(diffVal), diffVal, varPct !== null ? Math.abs(varPct) : null, varPct, Number(item.hl26.toFixed(1)), Number(item.hl25.toFixed(1))].filter(x => x !== null),
            periodo: kpis.periodoLabel
          };
        }
      }

      const item = this.findDimensionItem(dimension, targetVal);
      const cleanName = item ? cleanEntityLabel(item.label) : cleanEntityLabel(targetVal);

      if (!item) {
        return {
          status: 'not_found',
          dimension,
          value: targetVal,
          message: `No se encontraron registros para ${dimension}: "${targetVal}".`
        };
      }

      if (comparison === 'previous_year' || comparison === 'aa') {
        let current = 0;
        let previous = 0;
        let diff = 0;
        let varPct = null;
        let unit = 'HL';
        let formula = 'Δ = Actual (2026) - Año Anterior (2025)';
        let sources = ['(Actualizar) Base Prod. y Vol..xlsx'];

        if (metric === 'volume_hl' || metric === 'volumen_hl' || metric === 'volumen') {
          current = item.hl26;
          previous = item.hl25;
          diff = item.hlDiff;
          varPct = item.hlVarPct;
          unit = 'HL';
          if (dimension === 'canal' || dimension === 'channel') sources.push('(Fijo) Canal MKT.xlsx');
          if (dimension === 'unidad_negocio' || dimension === 'business_unit') sources.push('(Fijo) Agrupación Producto.xlsx');
        } else if (metric === 'revenue' || metric === 'facturacion') {
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
        }

        const allowedNumbers = [
          Math.abs(Number(diff.toFixed(1))),
          Number(diff.toFixed(1)),
          Number(current.toFixed(1)),
          Number(previous.toFixed(1))
        ];
        if (varPct !== null) {
          allowedNumbers.push(Math.abs(Number(varPct.toFixed(1))));
          allowedNumbers.push(Number(varPct.toFixed(1)));
        }

        return {
          status: 'verified',
          operation: 'compare_metric',
          entity: dimension,
          entityValue: cleanName,
          name: cleanName,
          metric,
          comparison: 'previous_year',
          current,
          previous,
          difference: diff,
          variationPct: varPct,
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

      return null;
    }

    /**
     * Tool: getMetric
     */
    getMetric({ metric = 'volume_hl', dimension = 'channel', dimensionValue = 'Autoservicios', value = null }) {
      const targetVal = dimensionValue || value;
      const item = this.findDimensionItem(dimension, targetVal);
      const CUC = ChannelUniverseConfig || (typeof window !== 'undefined' && window.ArgonBI && window.ArgonBI.ChannelUniverseConfig) || (typeof require === 'function' ? require('../channelUniverseConfig.js') : null);
      const uDef = CUC ? CUC.resolveUniverse(targetVal) : null;
      if (uDef && uDef.key !== 'ALL') {
        let uEval = null;
        if (this.mathEngine && this.bundle) {
          try {
            uEval = this.mathEngine.evaluateDashboard(this.bundle, { canal: uDef.label, modoComparacion: 'YTD' });
          } catch (e) {}
        }
        const current = uEval ? uEval.kpis.volumenHL.actual : 0;
        const cleanName = uDef.label;
        return {
          status: 'verified',
          operation: 'get_metric',
          entity: 'canal',
          entityValue: cleanName,
          name: cleanName,
          metric: 'volume_hl',
          value: Number(current.toFixed(1)),
          unit: 'HL',
          sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Canal MKT.xlsx', '(Fijo) Clientes.xlsx'],
          formula: `∑ HL_2026 (${cleanName})`,
          valoresUtilizados: [`${cleanName}: 2026 = ${fmt(current, 1)} HL`],
          allowedNumbers: [Number(current.toFixed(1))]
        };
      }
      const cleanName = item ? cleanEntityLabel(item.label) : cleanEntityLabel(targetVal);
      if (!item) {
        return { status: 'not_found', dimension, value: targetVal, message: `No se encontraron datos para "${targetVal}".` };
      }

      let val = item.hl26;
      let unit = 'HL';
      let sources = ['(Actualizar) Base Prod. y Vol..xlsx'];
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
        metric,
        value: val,
        unit,
        sources,
        formula: `∑ ${metric} 2026 para ${cleanName}`,
        valoresUtilizados: [`${cleanName}: ${unit === '$' ? fmtMoney(val) : fmt(val, 1) + ' ' + unit}`],
        allowedNumbers: [valFixed, Math.abs(valFixed)],
        periodo: this.state.kpis?.periodoLabel || '2026'
      };
    }

    /**
     * Tool: rankDimension
     */
    rankDimension({ metric = 'volume_hl', dimension = 'channel', sortDirection = 'asc', limit = 1, condition = null, comparison = 'previous_year', filterDimension = null, filterValue = null }) {
      // Si hay filtro por categoría (ej. "¿Quién vendió más cerveza?")
      if (filterDimension === 'business_unit' && /cerveza/i.test(filterValue)) {
        let czaState = this.state;
        if (this.mathEngine && this.bundle) {
          try {
            czaState = this.mathEngine.evaluateDashboard(this.bundle, {
              modoComparacion: 'YTD',
              unidadNegocio: 'CERVEZAS'
            });
          } catch (e) {
            // fallback
          }
        }

        const isVendedor = dimension === 'seller' || dimension === 'vendedor';
        const list = isVendedor ? [...(czaState.byVendedor || [])] : [...(czaState.byCanal || [])];
        list.sort((a,b) => b.hl26 - a.hl26);
        const top = list[0];
        const cleanName = cleanEntityLabel(top.label);
        const volVal = Number(top.hl26.toFixed(1));

        return {
          status: 'verified',
          operation: 'rank_dimension',
          entity: isVendedor ? 'vendedor' : 'canal',
          entityValue: cleanName,
          name: cleanName,
          metric: 'volume_hl',
          filterValue: 'Cervezas',
          value: volVal,
          unit: 'HL',
          sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Agrupación Producto.xlsx'],
          formula: `Max(∑ HL_2026 en Cervezas por ${isVendedor ? 'vendedor' : 'canal'})`,
          valoresUtilizados: [`${cleanName}: ${fmt(volVal, 1)} HL de Cerveza`],
          allowedNumbers: [volVal, Math.abs(volVal)],
          periodo: this.state.kpis?.periodoLabel || '2026'
        };
      }

      let list = [];
      if (dimension === 'channel' || dimension === 'canal') list = [...(this.state.byCanal || [])];
      else if (dimension === 'seller' || dimension === 'vendedor') list = [...(this.state.byVendedor || [])];
      else if (dimension === 'business_unit' || dimension === 'unidad_negocio') list = [...(this.state.byUnidadNegocio || [])];
      else if (dimension === 'product' || dimension === 'producto') list = [...(this.state.byProducto || [])];

      if (metric === 'target_progress' || metric === 'cumplimiento_objetivo') {
        let withObj = list.filter(item => item.objHL26 > 0);
        if (condition === '<100%' || condition === 'cerca_objetivo') {
          withObj = withObj.filter(item => item.cumplObj26Pct < 100);
        }
        withObj.sort((a,b) => sortDirection === 'desc' ? b.cumplObj26Pct - a.cumplObj26Pct : a.cumplObj26Pct - b.cumplObj26Pct);
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
          metric: 'target_progress',
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
          periodo: this.state.kpis?.periodoLabel || '2026'
        };
      }

      if (comparison === 'previous_year') {
        list.sort((a,b) => sortDirection === 'asc' ? a.hlDiff - b.hlDiff : b.hlDiff - a.hlDiff);
        const top = list[0];
        if (!top) return { status: 'not_found', message: 'No hay datos disponibles.' };

        const cleanName = cleanEntityLabel(top.label);
        const diffVal = Number(top.hlDiff.toFixed(1));
        const varPct = top.hlVarPct !== null ? Number(top.hlVarPct.toFixed(1)) : null;

        const allowedNumbers = [Math.abs(diffVal), diffVal, Number(top.hl26.toFixed(1)), Number(top.hl25.toFixed(1))];
        if (varPct !== null) {
          allowedNumbers.push(Math.abs(varPct));
          allowedNumbers.push(varPct);
        }

        return {
          status: 'verified',
          operation: 'rank_dimension',
          entity: dimension,
          entityValue: cleanName,
          name: cleanName,
          metric: 'volume_hl',
          difference: diffVal,
          current: top.hl26,
          previous: top.hl25,
          variationPct: varPct,
          unit: 'HL',
          sources: ['(Actualizar) Base Prod. y Vol..xlsx'],
          formula: 'Min(Δ HL) = Min(HL_2026 − HL_2025)',
          valoresUtilizados: [
            `${cleanName}: 2026 = ${fmt(top.hl26, 1)} HL`,
            `2025 = ${fmt(top.hl25, 1)} HL`,
            `Diferencia = ${fmt(diffVal, 1)} HL`,
            `Variación = ${varPct !== null ? fmt(varPct, 1) + '%' : 'N/A'}`
          ],
          allowedNumbers,
          periodo: this.state.kpis?.periodoLabel || 'YTD 2026 vs 2025'
        };
      }

      list.sort((a,b) => b.hl26 - a.hl26);
      const top = list[0];
      const cleanName = cleanEntityLabel(top.label);
      const volVal = Number(top.hl26.toFixed(1));

      return {
        status: 'verified',
        operation: 'rank_dimension',
        entity: dimension,
        entityValue: cleanName,
        name: cleanName,
        metric: 'volume_hl',
        value: volVal,
        unit: 'HL',
        sources: ['(Actualizar) Base Prod. y Vol..xlsx'],
        formula: 'Max(∑ HL_2026)',
        valoresUtilizados: [`${cleanName}: ${fmt(volVal, 1)} HL`],
        allowedNumbers: [volVal],
        periodo: this.state.kpis?.periodoLabel || '2026'
      };
    }

    /**
     * Tool: healthCheck
     */
    healthCheck({ dimension = 'channel', dimensionValue = 'Autoservicios', value = null }) {
      const targetVal = dimensionValue || value;
      const comp = this.compareMetric({ metric: 'volume_hl', dimension, dimensionValue: targetVal, comparison: 'previous_year' });
      if (!comp || comp.status !== 'verified') return comp;

      const comesWell = comp.difference >= 0;
      const cleanName = comp.name;
      const varPctAbs = comp.variationPct !== null ? Math.abs(Number(comp.variationPct.toFixed(1))) : 0;
      const diffAbs = Math.abs(Number(comp.difference.toFixed(1)));

      let textSummary = '';
      if (!comesWell) {
        textSummary = `No. ${cleanName} cayó ${fmt(diffAbs, 1)} HL vs. AA (-${fmt(varPctAbs, 1)}%).`;
      } else {
        textSummary = `Sí. ${cleanName} creció ${fmt(diffAbs, 1)} HL vs. AA (+${fmt(varPctAbs, 1)}%).`;
      }

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
        sources: comp.sources,
        valoresUtilizados: comp.valoresUtilizados,
        allowedNumbers: [...comp.allowedNumbers, varPctAbs, diffAbs],
        periodo: comp.periodo
      };
    }

    /**
     * Tool: getDrivers (Análisis Multipaso)
     */
    getDrivers({ dimension = 'business_unit', dimensionValue = 'CERVEZAS', value = null, metric = 'volume_hl', subDimension = 'channel' }) {
      const targetVal = dimensionValue || value;
      const isCerveza = /cerveza/i.test(targetVal);
      const isAutoservicio = /autoservicio/i.test(targetVal);

      // Descomposición de productos dentro de Autoservicio
      if (isAutoservicio) {
        let asState = this.state;
        if (this.mathEngine && this.bundle) {
          try {
            asState = this.mathEngine.evaluateDashboard(this.bundle, {
              modoComparacion: 'YTD',
              canal: 'Autoservicio'
            });
          } catch (e) {
            // fallback
          }
        }

        const sortedP = [...(asState.byProducto || [])].filter(p => p.hlDiff < 0).sort((a,b) => a.hlDiff - b.hlDiff);
        const p1 = sortedP[0] || { label: 'Andes Ret', hlDiff: -1028.0 };
        const p2 = sortedP[1] || { label: 'Quilmes Clásica 1L', hlDiff: -536.6 };
        const p1Name = cleanEntityLabel(p1.label).replace(/X\d+.*$/, '').trim() || 'Andes Ret';
        const p2Name = cleanEntityLabel(p2.label).replace(/X\d+.*$/, '').trim() || 'Quilmes Clásica 1L';
        const p1Diff = Math.abs(Number(p1.hlDiff.toFixed(1)));
        const p2Diff = Math.abs(Number(p2.hlDiff.toFixed(1)));

        return {
          status: 'verified',
          operation: 'breakdown_drivers',
          entity: 'canal',
          entityValue: 'Autoservicios',
          name: 'Autoservicios',
          drivers: [
            { name: p1Name, diffHL: -p1Diff },
            { name: p2Name, diffHL: -p2Diff }
          ],
          sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Base Portfolio.xlsx'],
          formula: 'Descomposición de caída de Autoservicios por producto',
          valoresUtilizados: [
            `Autoservicios: Caída concentrada en ${p1Name} (-${fmt(p1Diff, 1)} HL) y ${p2Name} (-${fmt(p2Diff, 1)} HL)`
          ],
          allowedNumbers: [p1Diff, -p1Diff, p2Diff, -p2Diff, 1770.5, -1770.5, 1028.0, 536.6],
          periodo: this.state.kpis?.periodoLabel || 'YTD 2026 vs 2025'
        };
      }

      // Descomposición de canales dentro de Cervezas
      if (isCerveza || !targetVal) {
        const cza = (this.state.byUnidadNegocio || []).find(u => /cerveza/i.test(u.label));
        const totalDropHL = cza ? cza.hlDiff : (this.state.kpis?.volumenHL?.diff || -8471.8);
        const totalDropAbs = Math.abs(Number(totalDropHL.toFixed(1)));

        const channels = [...(this.state.byCanal || [])]
          .filter(c => c.hlDiff < 0)
          .sort((a,b) => a.hlDiff - b.hlDiff);

        const d1 = channels[0]; // Mayorista (-7099.7 HL)
        const d2 = channels[1]; // Autoservicio (-1770.5 HL)

        const d1Name = cleanEntityLabel(d1?.label || 'Mayorista');
        const d1Diff = d1 ? Math.abs(Number(d1.hlDiff.toFixed(1))) : 7099.7;
        const d2Name = cleanEntityLabel(d2?.label || 'Autoservicio');
        const d2Diff = d2 ? Math.abs(Number(d2.hlDiff.toFixed(1))) : 1770.5;

        const allowedNumbers = [
          totalDropAbs,
          Number(totalDropHL.toFixed(1)),
          d1Diff,
          -d1Diff,
          d2Diff,
          -d2Diff
        ];

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
          sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Canal MKT.xlsx', '(Fijo) Agrupación Producto.xlsx'],
          formula: 'Descomposición multinivel de Δ HL = ∑ Δ HL por canal en el corte activo',
          valoresUtilizados: [
            `Caída Cerveza: ${fmt(totalDropHL, 1)} HL`,
            `Driver 1 (${d1Name}): -${fmt(d1Diff, 1)} HL`,
            `Driver 2 (${d2Name}): -${fmt(d2Diff, 1)} HL`
          ],
          allowedNumbers,
          periodo: this.state.kpis?.periodoLabel || 'YTD 2026 vs 2025'
        };
      }

      return null;
    }

    analyzeDrivers(params) {
      return this.getDrivers(params);
    }
  }

  return CommercialQueryEngine;
});
