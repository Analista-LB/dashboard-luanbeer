(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./responseComposer.js'));
  } else {
    root.ArgonBI = root.ArgonBI || {};
    root.ArgonBI.ResponseValidator = factory(root.ArgonBI.AIResponseComposer);
  }
})(typeof self !== 'undefined' ? self : this, function (AIResponseComposer) {
  'use strict';

  /**
   * ResponseValidator
   * Extrae y valida todos los números generados en la respuesta contra los
   * datos estructurados del motor determinístico.
   * Si la respuesta contiene un número inventado o no verificable, la rechaza y
   * genera una respuesta segura basada exclusivamente en el cálculo verificado.
   */
  class ResponseValidator {
    static parseSpanishNumber(str) {
      if (!str) return null;
      let s = str.trim().replace(/[$%]/g, '');

      // Caso A: Notación decimal con punto (ej. 46.77 o 12.1 o -7099.7)
      if (/^[+-]?\d+\.\d{1,2}$/.test(s)) {
        const num = parseFloat(s);
        return isNaN(num) ? null : num;
      }

      // Caso B: Formato español (puntos de miles y coma decimal opcional, ej. 1.770,5 o 657.115.830)
      const clean = s.replace(/\.(?=\d{3}(?:[,\s]|$))/g, '').replace(/,/g, '.');
      const num = parseFloat(clean);
      return isNaN(num) ? null : num;
    }

    static extractNumbers(text) {
      if (!text) return [];
      // Busca números enteros, con coma o con punto decimal (ej: -1.770,5 | 46.77 | 701,5 | 26,8% | $657.115.830 | 1482 | 91,0%)
      const matches = text.match(/[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:[.,]\d+)?/g);
      if (!matches) return [];

      return matches.map(m => ({
        raw: m,
        val: ResponseValidator.parseSpanishNumber(m)
      })).filter(n => n.val !== null);
    }

    static buildAllowedPool(structuredResult) {
      const pool = new Set();

      const addNumber = (n) => {
        if (n === null || n === undefined || isNaN(Number(n))) return;
        const num = Number(n);
        pool.add(Number(num.toFixed(1)));
        pool.add(Number(num.toFixed(2)));
        pool.add(Number(Math.abs(num).toFixed(1)));
        pool.add(Number(Math.abs(num).toFixed(2)));
        pool.add(Math.round(num));
        pool.add(Math.abs(Math.round(num)));
      };

      // Referencias temporales y bases de porcentaje estándar
      addNumber(2024);
      addNumber(2025);
      addNumber(2026);
      addNumber(100);

      if (Array.isArray(structuredResult.allowedNumbers)) {
        structuredResult.allowedNumbers.forEach(addNumber);
      }

      addNumber(structuredResult.value);
      addNumber(structuredResult.difference);
      addNumber(structuredResult.variationPct);
      addNumber(structuredResult.current);
      addNumber(structuredResult.previous);
      addNumber(structuredResult.remaining);
      addNumber(structuredResult.target);
      addNumber(structuredResult.totalDropHL);
      addNumber(structuredResult.tacoKpi);
      addNumber(structuredResult.tacoRto);
      addNumber(structuredResult.instalados);
      addNumber(structuredResult.repagoHL);
      addNumber(structuredResult.real);
      addNumber(structuredResult.obj);
      addNumber(structuredResult.hl);
      addNumber(structuredResult.tasa);

      if (typeof structuredResult.name === 'string') {
        const extracted = ResponseValidator.extractNumbers(structuredResult.name);
        extracted.forEach(e => addNumber(e.val));
      }

      if (Array.isArray(structuredResult.drivers)) {
        structuredResult.drivers.forEach(d => {
          addNumber(d.diffHL);
          if (d.name) {
            const extracted = ResponseValidator.extractNumbers(String(d.name));
            extracted.forEach(e => addNumber(e.val));
          }
        });
      }

      if (Array.isArray(structuredResult.fallenList)) {
        structuredResult.fallenList.forEach(m => {
          addNumber(m.hlVarPct);
        });
      }

      if (typeof structuredResult.formula === 'string') {
        const extracted = ResponseValidator.extractNumbers(structuredResult.formula);
        extracted.forEach(e => addNumber(e.val));
      }

      if (Array.isArray(structuredResult.valoresUtilizados)) {
        structuredResult.valoresUtilizados.forEach(line => {
          const extracted = ResponseValidator.extractNumbers(String(line));
          extracted.forEach(e => addNumber(e.val));
        });
      }

      return Array.from(pool);
    }

    static validate(responseText, structuredResult) {
      if (!structuredResult) {
        return { valid: true, response: responseText };
      }

      const extracted = ResponseValidator.extractNumbers(responseText);
      const allowedPool = ResponseValidator.buildAllowedPool(structuredResult);

      let allVerified = true;
      const unverified = [];

      for (const item of extracted) {
        const itemVal = item.val;
        const itemAbs = Math.abs(itemVal);

        // Tolerancia de 0.15 para redondeos de porcentaje o decimales
        const exists = allowedPool.some(allowed => {
          return Math.abs(allowed - itemVal) < 0.15 || Math.abs(allowed - itemAbs) < 0.15;
        });

        if (!exists) {
          allVerified = false;
          unverified.push(item.raw);
        }
      }

      if (allVerified) {
        return {
          valid: true,
          response: responseText,
          verifiedNumbersCount: extracted.length
        };
      }

      // Si existe algún número inventado o no verificable, generar respuesta segura determinística
      console.warn(`[ResponseValidator] Número no verificable detectado en respuesta: [${unverified.join(', ')}]. Aplicando respuesta segura.`);
      const safeText = AIResponseComposer && typeof AIResponseComposer.compose === 'function'
        ? AIResponseComposer.compose(structuredResult, null, '')
        : `${structuredResult.name || 'Resultado'}: ${structuredResult.difference || structuredResult.value} ${structuredResult.unit || ''}`;

      return {
        valid: false,
        rejectedResponse: responseText,
        unverifiedNumbers: unverified,
        response: safeText,
        isSafeFallback: true
      };
    }
  }

  return ResponseValidator;
});
