(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ArgonBI = root.ArgonBI || {};
    root.ArgonBI.QuerySchema = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * JSON Schema formal para la salida estructurada del LLM en la etapa de interpretación.
   * La IA no debe devolver texto libre en la primera llamada, sino un objeto validable.
   */
  const LLM_QUERY_JSON_SCHEMA = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'LLMStructuredQuery',
    type: 'object',
    required: ['intent', 'metric', 'dimension', 'comparison', 'operation'],
    properties: {
      intent: {
        type: 'string',
        enum: [
          'compare_metric',
          'get_metric',
          'rank_dimension',
          'analyze_drivers',
          'health_check',
          'clarify_ambiguity',
          'unverifiable_external'
        ]
      },
      metric: {
        type: 'string',
        enum: [
          'volume_hl',
          'revenue',
          'unique_customers',
          'target',
          'target_progress',
          'absolute_variance',
          'percentage_variance',
          'score_galaxia',
          'general'
        ]
      },
      dimension: {
        type: 'string',
        enum: [
          'channel',
          'subchannel',
          'business_unit',
          'seller',
          'supervisor',
          'customer',
          'product',
          'brand',
          'month',
          'quarter',
          'year',
          'general'
        ]
      },
      dimensionValue: {
        type: ['string', 'null']
      },
      comparison: {
        type: 'string',
        enum: ['previous_year', 'target', 'none']
      },
      period: {
        type: 'string',
        enum: ['active', 'month_specific', 'quarter_specific', 'year_specific']
      },
      periodValue: {
        type: ['string', 'number', 'null']
      },
      operation: {
        type: 'string',
        enum: [
          'absolute_and_percentage_variance',
          'get_value',
          'rank_top',
          'rank_loss',
          'breakdown_drivers',
          'health_diagnosis',
          'clarify'
        ]
      },
      subDimension: {
        type: ['string', 'null']
      },
      filterDimension: {
        type: ['string', 'null']
      },
      filterValue: {
        type: ['string', 'null']
      },
      condition: {
        type: ['string', 'null']
      },
      ambiguous: {
        type: 'boolean'
      },
      clarificationQuestion: {
        type: ['string', 'null']
      }
    },
    additionalProperties: false
  };

  /**
   * Validador ligero del JSON Schema sin dependencias externas
   */
  function validateSchema(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return { valid: false, errors: ['El resultado del LLM debe ser un objeto JSON válido'] };
    }

    const errors = [];
    for (const req of LLM_QUERY_JSON_SCHEMA.required) {
      if (obj[req] === undefined || obj[req] === null) {
        errors.push(`Campo requerido ausente: ${req}`);
      }
    }

    const props = LLM_QUERY_JSON_SCHEMA.properties;
    if (obj.intent && !props.intent.enum.includes(obj.intent)) {
      errors.push(`Intent desconocido: "${obj.intent}"`);
    }
    if (obj.metric && !props.metric.enum.includes(obj.metric)) {
      errors.push(`Métrica desconocida: "${obj.metric}"`);
    }
    if (obj.dimension && !props.dimension.enum.includes(obj.dimension)) {
      errors.push(`Dimensión desconocida: "${obj.dimension}"`);
    }
    if (obj.comparison && !props.comparison.enum.includes(obj.comparison)) {
      errors.push(`Comparación no soportada: "${obj.comparison}"`);
    }
    if (obj.operation && !props.operation.enum.includes(obj.operation)) {
      errors.push(`Operación no soportada: "${obj.operation}"`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  return {
    LLM_QUERY_JSON_SCHEMA,
    validateSchema
  };
});
