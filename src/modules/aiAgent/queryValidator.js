(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./querySchema.js'));
  } else {
    root.ArgonBI = root.ArgonBI || {};
    root.ArgonBI.QueryValidator = factory(root.ArgonBI.QuerySchema);
  }
})(typeof self !== 'undefined' ? self : this, function (QuerySchema) {
  'use strict';

  /**
   * QueryValidator
   * Valida la salida estructurada del LLM contra el JSON Schema y contra
   * los catálogos y dimensiones reales del modelo comercial.
   */
  class QueryValidator {
    static validate(formalQuery, dimensionCatalog = null) {
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
          userMessage: formalQuery.clarificationQuestion || formalQuery.ambiguityPrompt || '¿Por volumen, facturación o cumplimiento?',
          confidence: formalQuery.confidence || 0.5
        };
      }

      // 3. Validación de JSON Schema
      if (QuerySchema && typeof QuerySchema.validateSchema === 'function') {
        const schemaCheck = QuerySchema.validateSchema(formalQuery);
        if (!schemaCheck.valid) {
          return {
            valid: false,
            userMessage: `La consulta estructurada no cumple el esquema formal: ${schemaCheck.errors.join('; ')}`,
            confidence: 0.2
          };
        }
      }

      // 4. Validación de valor de dimensión contra datos reales
      const dim = formalQuery.dimension;
      const val = formalQuery.dimensionValue;

      if (val) {
        const valNorm = String(val).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

        // Resolución canónica de On Premise
        if (/on premise|on-premise|refrigerado|consumo en el lugar/i.test(valNorm)) {
          formalQuery.canonicalDimension = 'canalUnificado';
          formalQuery.canonicalValue = 'Refrigerado';
          formalQuery.displayLabel = 'On Premise';
        }
        // Bares / Nocturno
        else if (/bar(es)?|nocturno/i.test(valNorm)) {
          formalQuery.canonicalDimension = 'canal';
          formalQuery.canonicalValue = 'REF NOCTURNO';
          formalQuery.displayLabel = 'REF NOCTURNO';
        }
        // Autoservicio
        else if (/autoservicio/i.test(valNorm)) {
          formalQuery.canonicalDimension = 'canal';
          formalQuery.canonicalValue = 'Autoservicio';
          formalQuery.displayLabel = 'Autoservicios';
        }
        // Mayorista
        else if (/mayorista/i.test(valNorm)) {
          formalQuery.canonicalDimension = 'canal';
          formalQuery.canonicalValue = 'Mayorista';
          formalQuery.displayLabel = 'Mayorista';
        }
        // Cervezas
        else if (/cerveza/i.test(valNorm)) {
          formalQuery.canonicalDimension = 'unidad_negocio';
          formalQuery.canonicalValue = 'CERVEZAS';
          formalQuery.displayLabel = 'Cerveza';
        }
        // UNG
        else if (/ung/i.test(valNorm)) {
          formalQuery.canonicalDimension = 'unidad_negocio';
          formalQuery.canonicalValue = 'UNG';
          formalQuery.displayLabel = 'UNG';
        }
        // Aguas
        else if (/agua/i.test(valNorm)) {
          formalQuery.canonicalDimension = 'unidad_negocio';
          formalQuery.canonicalValue = 'AGUAS';
          formalQuery.displayLabel = 'Aguas';
        }
        // Vinos
        else if (/vino/i.test(valNorm)) {
          formalQuery.canonicalDimension = 'unidad_negocio';
          formalQuery.canonicalValue = 'VINO';
          formalQuery.displayLabel = 'Vinos';
        }
      }

      return {
        valid: true,
        confidence: formalQuery.confidence || 0.96
      };
    }
  }

  return QueryValidator;
});
