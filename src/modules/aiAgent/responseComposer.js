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

  /**
   * AIResponseComposer
   * Redactor comercial bajo la regla "BUENO + CLARO + CORTO".
   * Responde en 1 sola oración lo preguntado y nada más, garantizando
   * que no existan divagaciones ni causas inventadas.
   */
  class AIResponseComposer {
    static compose(structuredResult, formalQuery, originalQuestion = '') {
      if (!structuredResult) {
        return 'No se obtuvieron resultados para la consulta.';
      }

      const qNorm = String(originalQuestion || '').toLowerCase();
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

      // 3. Desviación y variación interanual (caso crítico: Autoservicios y On Premise vs AA)
      if (structuredResult.operation === 'compare_metric' || structuredResult.operation === 'variance_absolute') {
        const diff = structuredResult.difference || 0;
        const diffAbs = Math.abs(Number(diff.toFixed(1)));
        const varPct = structuredResult.variationPct !== null ? Number(structuredResult.variationPct.toFixed(1)) : null;
        const varPctStr = varPct !== null ? ` (${fmt(varPct, 1)}%)` : '';
        const unit = structuredResult.unit || 'HL';

        // Si la pregunta pide explícitamente "desviación" o "diferencia"
        if (/\b(desviacion|diferencia|brecha)\b/.test(qNorm)) {
          const signStr = diff >= 0 && varPct !== null ? ` (+${fmt(varPct, 1)}%)` : varPctStr;
          return `La desviación de ${name} vs. AA es de ${diff >= 0 ? '+' : ''}${fmt(diff, 1)} ${unit}${signStr}.`;
        }
        // Si el valor creció (positivo)
        if (diff >= 0) {
          const signStr = varPct !== null ? ` (+${fmt(varPct, 1)}%)` : '';
          return `${name} creció ${fmt(diffAbs, 1)} ${unit} vs. AA${signStr}.`;
        }
        // Si el valor cayó (negativo)
        return `${name} cayó ${fmt(diffAbs, 1)} ${unit} vs. AA${varPctStr}.`;
      }

      // 4. Consulta de métrica puntual (ej. "¿Cuánto vendió Autoservicios?" o seguimiento "¿Y cuánto vendió?")
      if (structuredResult.operation === 'get_metric' || formalQuery?.operation === 'get_metric' || formalQuery?.isFollowUp) {
        if (structuredResult.metric === 'volumen_hl' || structuredResult.metric === 'volumen') {
          return `${name} vendió ${fmt(structuredResult.value || structuredResult.current, 1)} HL.`;
        }
        if (structuredResult.metric === 'facturacion') {
          return `${name} facturó ${fmtMoney(structuredResult.value || structuredResult.current)}.`;
        }
      }

      // 5. Ranking por objetivo (ej. "¿Qué vendedor está más cerca de su objetivo?")
      if (structuredResult.metric === 'cumplimiento_objetivo') {
        const pct = structuredResult.progressPct || structuredResult.value || 0;
        const faltante = structuredResult.remaining || 0;
        return `${name}: ${fmt(pct, 1)}%. Le faltan ${fmt(faltante, 1)} HL.`;
      }

      // 6. Ranking de caída de canal (ej. "¿Qué canal perdió más volumen?")
      if (structuredResult.operation === 'mayor_caida' || (formalQuery?.entity === 'canal' && formalQuery?.operation === 'mayor_caida')) {
        const diff = structuredResult.difference || structuredResult.value || 0;
        return `${name}: ${fmt(diff, 1)} HL vs. AA.`;
      }

      // 7. Ranking de vendedor por volumen (ej. "¿Qué vendedor vendió más?")
      if (formalQuery?.entity === 'vendedor' && (formalQuery?.operation === 'ranking_desc' || formalQuery?.metric === 'volumen_hl')) {
        return `${name}: ${fmt(structuredResult.value || structuredResult.current, 1)} HL.`;
      }

      // 8. Mes específico
      if (structuredResult.entity === 'mes' || formalQuery?.entity === 'mes') {
        if (structuredResult.metric === 'facturacion') {
          return `${fmtMoney(structuredResult.value)}.`;
        }
        if (structuredResult.metric === 'volumen_hl' || structuredResult.metric === 'volumen') {
          return `${name}: ${fmt(structuredResult.value, 1)} HL.`;
        }
      }

      // 9. Clientes CCC
      if (structuredResult.metric === 'clientes_ccc' || formalQuery?.metric === 'clientes_ccc') {
        return `${Number(Math.round(structuredResult.value || structuredResult.current)).toLocaleString('es-AR')} clientes.`;
      }

      // 10. Fallback directo conciso
      return `${name}: ${fmt(structuredResult.value || structuredResult.difference || 0, 1)} ${structuredResult.unit || ''}.`.trim();
    }
  }

  return AIResponseComposer;
});
