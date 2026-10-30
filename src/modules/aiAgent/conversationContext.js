(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ArgonBI = root.ArgonBI || {};
    root.ArgonBI.ConversationContext = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * ConversationContext
   * Mantiene el estado y memoria conversacional entre preguntas consecutivas.
   * Permite resolver pronombres y referencias elípticas ("eso", "ese canal", "¿Y cuánto vendió?").
   */
  class ConversationContext {
    constructor() {
      this.clear();
    }

    clear() {
      this.lastEntity = null;         // 'canal' | 'vendedor' | 'unidad_negocio' | 'producto' | 'mes'
      this.lastEntityValue = null;    // 'Mayorista' | 'Autoservicios' | 'Abel Zaleh' | 'CERVEZAS'
      this.lastMetric = null;         // 'volumen_hl' | 'facturacion' | 'cumplimiento_objetivo' | 'clientes_ccc'
      this.lastComparison = null;     // 'previous_year' | 'target'
      this.lastOperation = null;      // 'variance_absolute' | 'rank_drop' | 'analyze_drivers'
      this.lastQuestion = null;
      this.lastStructuredResult = null;
      this.history = [];
    }

    update(query, structuredResult) {
      if (!query || !structuredResult) return;

      this.lastEntity = structuredResult.entity || query.entity || this.lastEntity;
      this.lastEntityValue = structuredResult.name || query.entityValue || this.lastEntityValue;
      this.lastMetric = structuredResult.metric || query.metric || this.lastMetric;
      this.lastComparison = query.comparison || this.lastComparison;
      this.lastOperation = query.operation || this.lastOperation;
      this.lastQuestion = query.questionText || this.lastQuestion;
      this.lastStructuredResult = structuredResult;

      this.history.push({
        timestamp: Date.now(),
        question: query.questionText,
        entity: this.lastEntity,
        entityValue: this.lastEntityValue,
        metric: this.lastMetric,
        result: structuredResult
      });

      if (this.history.length > 10) {
        this.history.shift();
      }
    }

    getContext() {
      return {
        lastEntity: this.lastEntity,
        lastEntityValue: this.lastEntityValue,
        lastMetric: this.lastMetric,
        lastComparison: this.lastComparison,
        lastOperation: this.lastOperation,
        lastQuestion: this.lastQuestion,
        lastResult: this.lastStructuredResult,
        historyLength: this.history.length
      };
    }

    /**
     * Resuelve si una pregunta es de seguimiento dependiente del contexto previo
     */
    resolveFollowUp(normalizedText) {
      if (!this.lastEntity || !this.lastEntityValue) {
        return null;
      }

      // Caso 1: "¿Y cuánto vendió?" / "¿Cuánto vendió?" / "¿Cuánto facturó?"
      if (/\b(y cuanto vendio|cuanto vendio|y cuanto fue su volumen|cuanto vendio ese|cuanto facturo|y cuanto facturo)\b/.test(normalizedText)) {
        const isFact = /\bfacturo\b/.test(normalizedText);
        return {
          isFollowUp: true,
          entity: this.lastEntity,
          entityValue: this.lastEntityValue,
          metric: isFact ? 'facturacion' : 'volumen_hl',
          operation: 'get_metric',
          comparison: 'none',
          confidence: 0.96
        };
      }

      // Caso 2: "¿Y qué productos explican eso?" / "¿Qué marcas explican eso?" / "por qué cayó eso"
      if (/\b(eso|ese canal|ese vendedor|esa unidad|esa division|aquel)\b/.test(normalizedText) &&
          /\b(que productos?|que marcas?|por que|caida|explica)\b/.test(normalizedText)) {
        return {
          isFollowUp: true,
          entity: this.lastEntity,
          entityValue: this.lastEntityValue,
          metric: 'volumen_hl',
          operation: 'analyze_drivers',
          subDimension: 'producto',
          comparison: 'previous_year',
          confidence: 0.95
        };
      }

      // Caso 3: "¿Y contra el año pasado?" / "¿Y vs AA?" sobre la misma entidad
      if (/\b(y vs aa|y contra el ano anterior|y contra aa|y el ano pasado|y la variacion)\b/.test(normalizedText)) {
        return {
          isFollowUp: true,
          entity: this.lastEntity,
          entityValue: this.lastEntityValue,
          metric: this.lastMetric || 'volumen_hl',
          operation: 'variance_absolute',
          comparison: 'previous_year',
          confidence: 0.94
        };
      }

      return null;
    }
  }

  return ConversationContext;
});
