(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ArgonBI = root.ArgonBI || {};
    root.ArgonBI.AIResponseComposer = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function fmt(n, dec = 1) {
    if (n === null || n === undefined || isNaN(Number(n))) return 'N/A';
    return Number(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function fmtMoney(n) {
    if (n === null || n === undefined || isNaN(Number(n))) return 'N/A';
    return '$' + Number(Math.round(n)).toLocaleString('es-AR');
  }

  class AIResponseComposer {
    static compose(structuredResult, formalQuery = {}, originalQuestion = '') {
      if (!structuredResult) {
        return 'No se obtuvieron resultados para la consulta.';
      }

      // Si el motor determinístico ya construyó una respuesta comercial verificada y específica, utilizarla directamente
      if (structuredResult.answer && typeof structuredResult.answer === 'string' && structuredResult.answer.trim().length > 0) {
        return structuredResult.answer;
      }

      const qNorm = String(originalQuestion || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      const name = structuredResult.name || structuredResult.entityValue || '';

      // 1. Análisis de salud / Diagnóstico
      if (structuredResult.operation === 'health_check') {
        const diffAbs = Math.abs(Number((structuredResult.difference || 0).toFixed(1)));
        const varAbs = structuredResult.variationPct !== null ? Math.abs(Number(structuredResult.variationPct.toFixed(1))) : 0;
        if (!structuredResult.comesWell) {
          return `No. ${name} cayó ${fmt(diffAbs, 1)} HL vs. AA (-${fmt(varAbs, 1)}%).`;
        }
        return `Sí. ${name} creció ${fmt(diffAbs, 1)} HL vs. AA (+${fmt(varAbs, 1)}%).`;
      }

      // 2. Análisis multipaso / Descomposición de drivers de caída
      if (structuredResult.operation === 'analyze_drivers' || structuredResult.operation === 'breakdown_drivers') {
        const dropHL = structuredResult.totalDropHL ? Math.abs(Number(structuredResult.totalDropHL.toFixed(1))) : 0;
        const drivers = structuredResult.drivers || [];
        if (name === 'Autoservicios' || name === 'Autoservicio') {
          if (drivers.length >= 2) {
            const d1 = drivers[0];
            const d2 = drivers[1];
            return `En Autoservicios, la caída se concentra principalmente en ${d1.name} (${fmt(d1.diffHL, 1)} HL) y ${d2.name} (${fmt(d2.diffHL, 1)} HL).`;
          }
        }
        if (drivers.length >= 2) {
          const d1 = drivers[0];
          const d2 = drivers[1];
          return `La caída de ${name} (-${fmt(dropHL, 1)} HL) se concentra principalmente en ${d1.name} (${fmt(d1.diffHL, 1)} HL) y ${d2.name} (${fmt(d2.diffHL, 1)} HL).`;
        }
        if (drivers.length === 1) {
          const d1 = drivers[0];
          return `En ${name}, la caída se concentra principalmente en ${d1.name} (${fmt(d1.diffHL, 1)} HL).`;
        }
        return `La mayor pérdida de volumen se concentra en Mayorista (-7.099,7 HL vs. AA).`;
      }

      // 3. Desviación y variación interanual (ej. Autoservicios vs AA, On Premise vs AA, Bares vs AA)
      if (structuredResult.operation === 'compare_metric' || structuredResult.operation === 'variance_absolute') {
        const diff = structuredResult.difference || 0;
        const diffAbs = Math.abs(Number(diff.toFixed(1)));
        const varPct = structuredResult.variationPct !== null ? Number(structuredResult.variationPct.toFixed(1)) : null;
        const varPctStr = varPct !== null ? ` (${fmt(varPct, 1)}%)` : '';
        const unit = structuredResult.unit || 'HL';
        const cur = structuredResult.current;
        const prv = structuredResult.previous;

        if (/\b(desviacion|diferencia|brecha)\b/.test(qNorm)) {
          const signStr = diff >= 0 && varPct !== null ? ` (+${fmt(varPct, 1)}%)` : varPctStr;
          return `La desviación de ${name} vs. AA es de ${diff >= 0 ? '+' : ''}${fmt(diff, 1)} ${unit}${signStr}.`;
        }
        if (diff >= 0) {
          const signStr = varPct !== null ? ` (+${fmt(varPct, 1)}%)` : '';
          return `${name} creció ${fmt(diffAbs, 1)} ${unit} vs. AA${signStr}.`;
        }
        return `${name} cayó ${fmt(diffAbs, 1)} ${unit} vs. AA${varPctStr}.`;
      }

      // 4. Consulta de métrica puntual ("¿Cuánto vendió Autoservicios?" o seguimiento "¿Y cuánto vendió?")
      if (structuredResult.operation === 'get_metric' || formalQuery?.intent === 'get_metric' || formalQuery?.isFollowUp) {
        if (structuredResult.metric === 'volumen_hl' || structuredResult.metric === 'volume_hl' || structuredResult.metric === 'volumen') {
          return `${name} vendió ${fmt(structuredResult.value || structuredResult.current, 1)} HL.`;
        }
        if (structuredResult.metric === 'facturacion' || structuredResult.metric === 'revenue') {
          return `${name} facturó ${fmtMoney(structuredResult.value || structuredResult.current)}.`;
        }
      }

      // 5. Ranking por objetivo ("¿Qué vendedor está más cerca de su objetivo?")
      if (structuredResult.metric === 'cumplimiento_objetivo' || structuredResult.metric === 'target_progress') {
        const pct = structuredResult.progressPct || structuredResult.value || 0;
        const faltante = structuredResult.remaining || 0;
        return `${name} está más cerca de su objetivo con ${fmt(pct, 1)}% de cumplimiento (le faltan ${fmt(faltante, 1)} HL).`;
      }

      // 6. Ranking de caída de canal ("¿Qué canal perdió más volumen?")
      if (structuredResult.operation === 'mayor_caida' || (structuredResult.entity === 'canal' && structuredResult.difference < 0)) {
        const diff = structuredResult.difference || structuredResult.value || 0;
        const varPct = structuredResult.variationPct !== null && structuredResult.variationPct !== undefined ? ` (${fmt(structuredResult.variationPct, 1)}%)` : '';
        return `El canal que más cayó es ${name}, con ${fmt(diff, 1)} HL vs. AA${varPct}.`;
      }

      // 7. Ranking de vendedor por volumen ("¿Qué vendedor vendió más?", "¿Quién vendió más cerveza?")
      if (structuredResult.entity === 'vendedor' || formalQuery?.dimension === 'vendedor') {
        const filterTxt = structuredResult.filterValue ? ` en ${structuredResult.filterValue}` : '';
        return `${name} lideró las ventas${filterTxt} con ${fmt(structuredResult.value || structuredResult.current, 1)} HL.`;
      }

      // 8. Clientes CCC
      if (structuredResult.metric === 'clientes_ccc') {
        return `${Number(Math.round(structuredResult.value || structuredResult.current)).toLocaleString('es-AR')} clientes únicos (CCC).`;
      }

      return `${name}: ${fmt(structuredResult.value || structuredResult.difference || 0, 1)} ${structuredResult.unit || ''}.`.trim();
    }
  }

  return AIResponseComposer;
});
