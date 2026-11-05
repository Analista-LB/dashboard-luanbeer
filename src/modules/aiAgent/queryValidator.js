(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./querySchema.js'));
  } else {
    root.ArgonBI = root.ArgonBI || {};
    root.ArgonBI.QueryValidator = factory(root.ArgonBI.AIQuerySchema);
  }
})(typeof self !== 'undefined' ? self : this, function (QuerySchema) {
  'use strict';

  class QueryValidator {
    static validate(formalQuery) {
      if (!formalQuery) {
        return {
          valid: false,
          userMessage: 'No se recibió una consulta formal válida.',
          confidence: 0.0
        };
      }

      // 1. Manejo de causas externas no verificables
      if (formalQuery.intent === 'unverifiable_external' || formalQuery.interpreted === false) {
        return {
          valid: false,
          userMessage: formalQuery.limitationMessage || 'No existen datos ni fuentes sobre factores externos (clima, inflación o contexto) para responder con evidencias matemáticas en las bases importadas.',
          confidence: formalQuery.confidence || 0.1,
          ambiguous: formalQuery.ambiguous || false
        };
      }

      // 2. Manejo de ambigüedad
      if (formalQuery.ambiguous || formalQuery.intent === 'clarify_ambiguity') {
        return {
          valid: false,
          ambiguous: true,
          userMessage: formalQuery.ambiguityReason || formalQuery.clarificationQuestion || 'La pregunta es ambigua porque no especifica si buscás evaluar por volumen vendido (HL), facturación neta ($) o cumplimiento de objetivo (%).',
          confidence: formalQuery.confidence || 0.5
        };
      }

      // 3. Intención no reconocida
      if (formalQuery.intent === 'unknown') {
        return {
          valid: false,
          userMessage: 'Podés consultar sobre conceptos del tablero (YTD, CCC, AA, UNG, Cadenitas), volumen (HL), facturación ($), clientes únicos (CCC), canales, unidades de negocio, vendedores, trimestres, meses, objetivos o análisis de causas de caída.',
          confidence: 0.2
        };
      }

      return {
        valid: true,
        confidence: formalQuery.confidence || 0.96
      };
    }
  }

  return QueryValidator;
});
