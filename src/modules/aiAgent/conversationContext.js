(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ArgonBI = root.ArgonBI || {};
    root.ArgonBI.ConversationContext = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class ConversationContext {
    constructor() {
      this.clear();
    }

    clear() {
      this.lastEntity = null;
      this.lastEntityValue = null;
      this.lastCanalFilter = null;
      this.lastMetric = null;
      this.lastComparison = null;
      this.lastOperation = null;
      this.lastQuestion = null;
      this.lastStructuredResult = null;
      this.entity = null;
      this.entityValue = null;
      this.canalFilter = null;
      this.history = [];
    }

    update(query, structuredResult) {
      if (!query || !structuredResult) return;

      this.lastEntity = structuredResult.entity || query.entity || this.lastEntity;
      this.lastEntityValue = structuredResult.name || query.entityValue || this.lastEntityValue;
      this.lastCanalFilter = query.canalFilter || this.lastCanalFilter;
      this.lastMetric = structuredResult.metric || query.metric || this.lastMetric;
      this.lastComparison = query.comparison || this.lastComparison;
      this.lastOperation = query.intent || query.operation || this.lastOperation;
      this.lastQuestion = query.rawQuery || query.questionText || this.lastQuestion;
      this.lastStructuredResult = structuredResult;

      this.entity = this.lastEntity;
      this.entityValue = this.lastEntityValue;
      this.canalFilter = this.lastCanalFilter;

      this.history.push({
        timestamp: Date.now(),
        question: this.lastQuestion,
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
        entity: this.lastEntity,
        entityValue: this.lastEntityValue,
        canalFilter: this.lastCanalFilter,
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
  }

  return ConversationContext;
});
