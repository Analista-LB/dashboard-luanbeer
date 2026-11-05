(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./conversationContext.js'),
      require('./commercialQueryEngine.js'),
      require('./queryValidator.js'),
      require('./queryInterpreter.js'),
      require('./responseComposer.js'),
      require('./responseValidator.js'),
      require('./querySchema.js')
    );
  } else {
    root.ArgonBI = root.ArgonBI || {};
    const exported = factory(
      root.ArgonBI.ConversationContext,
      root.ArgonBI.CommercialQueryEngine,
      root.ArgonBI.QueryValidator,
      root.ArgonBI.AIQueryInterpreter,
      root.ArgonBI.AIResponseComposer,
      root.ArgonBI.ResponseValidator,
      root.ArgonBI.AIQuerySchema
    );
    root.ArgonBI.AIAgent = exported.AIAgent;
    root.ArgonBI.AIAgentModule = exported;
  }
})(typeof self !== 'undefined' ? self : this, function (
  ConversationContext,
  CommercialQueryEngine,
  QueryValidator,
  AIQueryInterpreter,
  AIResponseComposer,
  ResponseValidator,
  AIQuerySchema
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

    _processSpec(questionText, formalQuery, dashboardState, rawBundle, mathEngine) {
      // 1. Validar consulta
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

      // 2. Inicializar motor de tools determinísticas y ejecutar spec
      const toolsEngine = new CommercialQueryEngine(dashboardState, rawBundle, mathEngine);
      const structuredResult = toolsEngine.executeSpec(formalQuery);

      if (!structuredResult || structuredResult.status === 'not_found') {
        return null;
      }

      // 3. Redacción de respuesta natural corta
      const rawAnswer = AIResponseComposer.compose(structuredResult, formalQuery, questionText);

      // 4. Validación numérica estricta (rechazo de números alucinados)
      const validated = ResponseValidator.validate(rawAnswer, structuredResult);

      // 5. Actualizar memoria conversacional
      this.context.update(formalQuery, structuredResult);

      return {
        interpreted: true,
        question: questionText,
        intent: formalQuery.intent || structuredResult.operation,
        answer: validated.response,
        resultado: validated.response,
        result: structuredResult,
        structuredResult,
        sources: structuredResult.sources || ['(Actualizar) Base Prod. y Vol..xlsx'],
        fuentes: structuredResult.sources || ['(Actualizar) Base Prod. y Vol..xlsx'],
        formula: structuredResult.formula,
        valoresUtilizados: structuredResult.valoresUtilizados || [],
        periodo: structuredResult.periodo || '2026',
        confidence: formalQuery.confidence || 0.96,
        calculationDetails: {
          formula: structuredResult.formula,
          periodo: structuredResult.periodo || 'YTD 2026 vs 2025',
          filtros: structuredResult.name || formalQuery.entityValue || 'General',
          valoresUtilizados: structuredResult.valoresUtilizados || [],
          metric: structuredResult.metric,
          entity: structuredResult.entity,
          semanticInterpretation: `Intención: ${formalQuery.intent} | Métrica: ${formalQuery.metric} | Segmento: ${formalQuery.entityValue || 'Total'}`,
          engineDescription: 'Flujo Híbrido Agente Comercial: Interpretación Semántica → Cálculo Determinístico → Validación Numérica → Respuesta Natural',
          confidence: formalQuery.confidence || 0.96,
          validation: {
            numericCheckPassed: validated.valid,
            verifiedNumbersCount: validated.verifiedNumbersCount || 0
          }
        }
      };
    }

    /**
     * Ejecución sincrónica del flujo híbrido (utilizada por NLQEngine.answerQuery)
     */
    executeQuerySync(questionText, dashboardState, rawBundle, mathEngine) {
      const formalQuery = AIQueryInterpreter.interpretHeuristic(questionText, this.context);
      return this._processSpec(questionText, formalQuery, dashboardState, rawBundle, mathEngine);
    }

    /**
     * Ejecución asincrónica del flujo híbrido (soporta adaptador LLM opcional + fallback determinístico)
     */
    async executeQuery(questionText, dashboardState, rawBundle, mathEngine) {
      const formalQuery = await AIQueryInterpreter.interpret(questionText, this.context);
      return this._processSpec(questionText, formalQuery, dashboardState, rawBundle, mathEngine);
    }
  }

  return {
    AIAgent,
    ConversationContext,
    CommercialQueryEngine,
    QueryValidator,
    AIQueryInterpreter,
    AIResponseComposer,
    ResponseValidator,
    AIQuerySchema
  };
});
