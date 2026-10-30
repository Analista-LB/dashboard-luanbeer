(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./conversationContext.js'),
      require('./commercialQueryEngine.js'),
      require('./queryValidator.js'),
      require('./queryInterpreter.js'),
      require('./responseComposer.js'),
      require('./responseValidator.js')
    );
  } else {
    root.ArgonBI = root.ArgonBI || {};
    root.ArgonBI.AIAgent = factory(
      root.ArgonBI.ConversationContext,
      root.ArgonBI.CommercialQueryEngine,
      root.ArgonBI.QueryValidator,
      root.ArgonBI.AIQueryInterpreter,
      root.ArgonBI.AIResponseComposer,
      root.ArgonBI.ResponseValidator
    );
  }
})(typeof self !== 'undefined' ? self : this, function (
  ConversationContext,
  CommercialQueryEngine,
  QueryValidator,
  AIQueryInterpreter,
  AIResponseComposer,
  ResponseValidator
) {
  'use strict';

  class AIAgent {
    constructor() {
      this.context = new ConversationContext();
    }

    getContext() {
      return this.context;
    }

    clearContext() {
      this.context.clear();
    }

    /**
     * Pipeline híbrido de 7 etapas:
     * 1. Pregunta natural -> 2. Interpretación -> 3. Validación -> 4. Tools comerciales determinísticas
     * -> 5. Resultado estructurado -> 6. Redactor conciso -> 7. Validación numérica estricta
     */
    async executeQuery(questionText, dashboardState, rawBundle, mathEngine) {
      // 1. Interpretar pregunta
      const formalQuery = AIQueryInterpreter.interpret(questionText, this.context);

      // 2. Validar consulta
      const validation = QueryValidator.validate(formalQuery);
      if (!validation.valid) {
        return {
          interpreted: false,
          question: questionText,
          answer: validation.userMessage,
          resultado: validation.userMessage,
          limitationMessage: validation.userMessage,
          ambiguous: validation.ambiguous || false,
          confidence: validation.confidence || 0.1,
          sources: [],
          fuentes: [],
          calculationDetails: null
        };
      }

      // 3. Inicializar motor de tools determinísticas
      const toolsEngine = new CommercialQueryEngine(dashboardState, rawBundle, mathEngine);

      // 4. Invocar la tool correspondiente según intención
      let structuredResult = null;

      if (formalQuery.operation === 'variance_absolute' || formalQuery.operation === 'compare_metric') {
        structuredResult = toolsEngine.compareMetric({
          metric: formalQuery.metric,
          dimension: formalQuery.entity,
          value: formalQuery.entityValue,
          comparison: formalQuery.comparison || 'previous_year'
        });
      } else if (formalQuery.operation === 'get_metric' || formalQuery.isFollowUp) {
        structuredResult = toolsEngine.getMetric({
          metric: formalQuery.metric,
          dimension: formalQuery.entity,
          value: formalQuery.entityValue
        });
      } else if (formalQuery.operation === 'health_check') {
        structuredResult = toolsEngine.healthCheck({
          dimension: formalQuery.entity,
          value: formalQuery.entityValue
        });
      } else if (formalQuery.operation === 'analyze_drivers') {
        structuredResult = toolsEngine.analyzeDrivers({
          dimension: formalQuery.entity,
          value: formalQuery.entityValue,
          metric: formalQuery.metric,
          subDimension: formalQuery.subDimension || 'canal'
        });
      } else if (formalQuery.operation === 'cerca_objetivo') {
        structuredResult = toolsEngine.rankDimension({
          metric: 'cumplimiento_objetivo',
          dimension: 'vendedor',
          condition: '<100%',
          sortDirection: 'desc'
        });
      } else if (formalQuery.operation === 'mayor_caida') {
        structuredResult = toolsEngine.rankDimension({
          metric: 'volumen_hl',
          dimension: 'canal',
          comparison: 'previous_year',
          sortDirection: 'asc'
        });
      } else if (formalQuery.operation === 'mayor_caida_ccc') {
        structuredResult = toolsEngine.compareMetric({
          metric: 'clientes_ccc',
          dimension: 'canal',
          value: formalQuery.entityValue || 'Mayorista',
          comparison: 'previous_year'
        });
      } else if (formalQuery.operation === 'ranking_desc') {
        structuredResult = toolsEngine.rankDimension({
          metric: formalQuery.metric,
          dimension: formalQuery.entity,
          filterDimension: formalQuery.filterDimension,
          filterValue: formalQuery.filterValue,
          sortDirection: 'desc'
        });
      }

      // Fallback a motor base si la tool puntual no se resolvió
      if (!structuredResult || structuredResult.status === 'not_found') {
        return null;
      }

      // 5. Redacción de respuesta ultracorta
      const rawAnswer = AIResponseComposer.compose(structuredResult, formalQuery, questionText);

      // 6. Validación numérica estricta (rechazo de números alucinados)
      const validated = ResponseValidator.validate(rawAnswer, structuredResult);

      // 7. Actualizar memoria conversacional
      this.context.update(formalQuery, structuredResult);

      return {
        interpreted: true,
        question: questionText,
        intent: formalQuery.intent || formalQuery.operation,
        answer: validated.response,
        resultado: validated.response,
        result: structuredResult,
        structuredResult,
        sources: structuredResult.sources || ['(Actualizar) Base Prod. y Vol..xlsx'],
        fuentes: structuredResult.sources || ['(Actualizar) Base Prod. y Vol..xlsx'],
        formula: structuredResult.formula,
        valoresUtilizados: structuredResult.valoresUtilizados || [],
        periodo: structuredResult.periodo || '2026',
        confidence: formalQuery.confidence || 0.95,
        calculationDetails: {
          formula: structuredResult.formula,
          valoresUtilizados: structuredResult.valoresUtilizados || [],
          metric: structuredResult.metric,
          entity: structuredResult.entity,
          confidence: formalQuery.confidence || 0.95,
          validation: {
            numericCheckPassed: validated.valid,
            verifiedNumbersCount: validated.verifiedNumbersCount || 0
          }
        }
      };
    }
  }

  return {
    AIAgent,
    ConversationContext,
    CommercialQueryEngine,
    QueryValidator,
    AIQueryInterpreter,
    AIResponseComposer,
    ResponseValidator
  };
});
