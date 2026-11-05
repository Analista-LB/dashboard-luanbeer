(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./querySchema.js'));
  } else {
    root.ArgonBI = root.ArgonBI || {};
    root.ArgonBI.AIQueryInterpreter = factory(root.ArgonBI.AIQuerySchema);
  }
})(typeof self !== 'undefined' ? self : this, function (Schema) {
  'use strict';

  const { INTENTS, METRICS, DIMENSIONS, COMPARISONS, PERIODS, CONCEPTUAL_GLOSSARY, createEmptyQuerySpec } = Schema;

  let _llmAdapter = null;

  function setLLMAdapter(fn) {
    _llmAdapter = typeof fn === 'function' ? fn : null;
  }

  function normalizeText(str) {
    return String(str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[¿?¡!.,;:()"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const CHANNEL_DEFINITIONS = [
    { value: 'Aiellos', canalFilter: 'CADENITAS_AIELLO', label: 'Supermercados Aiello', regex: /\b(supermercados?\s+aiellos?|aiellos?)\b/ },
    { value: 'Delfines', canalFilter: 'CADENITAS_DELFIN', label: 'Supermercados Delfines', regex: /\b(supermercados?\s+delfines|delfines|delfin)\b/ },
    { value: 'Cadenitas', canalFilter: 'CADENITAS_ALL', label: 'Cadenitas', regex: /\b(cadenitas|cadenas?\s+regionales)\b/ },
    { value: 'On Premise', canalFilter: 'REF_ALL', label: 'On Premise', regex: /\b(on\s*premise|on-premise|refrigerados?|universo\s+ref|canal\s+ref)\b/ },
    { value: 'REF NOCTURNO', canalFilter: 'REF NOCTURNO', label: 'REF NOCTURNO (Bares y Nocturno)', regex: /\b(ref\s*nocturno|ka\s*nocturno|nocturno|bares|boliches|pubs?|disco)\b/ },
    { value: 'REF GASTRONOMICO', canalFilter: 'REF GASTRONOMICO', label: 'REF GASTRONOMICO', regex: /\b(ref\s*gastronomico|ka\s*gastronomico|gastronomico|restaurantes?|comida)\b/ },
    { value: 'REF ENTRETENIMIENTO', canalFilter: 'REF ENTRETENIMIENTO', label: 'REF ENTRETENIMIENTO', regex: /\b(ref\s*entretenimiento|entretenimiento)\b/ },
    { value: 'Mercado Hogar', canalFilter: 'MERCADO_HOGAR_ALL', label: 'Mercado Hogar', regex: /\b(mercado\s*hogar|consumo\s*hogareno)\b/ },
    { value: 'Mayorista', canalFilter: 'Mayorista', label: 'Mayorista', regex: /\b(mayoristas?|distribuidores)\b/ },
    { value: 'Autoservicio', canalFilter: 'Autoservicio', label: 'Autoservicio', regex: /\b(autoservicios?)\b/ },
    { value: 'Tradicional', canalFilter: 'Tradicional', label: 'Tradicional', regex: /\b(tradicional(?:es)?|almacenes|despensas)\b/ },
    { value: 'Kioscos/Maxikioscos', canalFilter: 'Kioscos/Maxikioscos', label: 'Kioscos/Maxikioscos', regex: /\b(kioscos?|maxikioscos?)\b/ },
    { value: 'Instituciones', canalFilter: 'INSTITUCIONES_ALL', label: 'Instituciones y Personal', regex: /\b(instituciones|institucional(?:es)?|clie\s*people)\b/ }
  ];

  const UN_DEFINITIONS = [
    { value: 'CERVEZAS', label: 'Cervezas', regex: /\b(cervezas?|cza|porron(?:es)?)\b/ },
    { value: 'UNG', label: 'UNG', regex: /\b(ung|gaseosas?|no\s*alcoholicos?|saborizadas?|isotonicos?|linea\s*pepsi)\b/ },
    { value: 'AGUAS', label: 'Aguas', regex: /\b(aguas?|sodas?)\b/ },
    { value: 'VINO', label: 'Vinos', regex: /\b(vinos?|sidras?|espumantes?)\b/ }
  ];

  const MONTH_DEFINITIONS = [
    { num: 1, str: '01', name: 'Enero', regex: /\b(enero|ene)\b/ },
    { num: 2, str: '02', name: 'Febrero', regex: /\b(febrero|feb)\b/ },
    { num: 3, str: '03', name: 'Marzo', regex: /\b(marzo|mar)\b/ },
    { num: 4, str: '04', name: 'Abril', regex: /\b(abril|abr)\b/ },
    { num: 5, str: '05', name: 'Mayo', regex: /\b(mayo|may)\b/ },
    { num: 6, str: '06', name: 'Junio', regex: /\b(junio|jun)\b/ },
    { num: 7, str: '07', name: 'Julio', regex: /\b(julio|jul)\b/ },
    { num: 8, str: '08', name: 'Agosto', regex: /\b(agosto|ago)\b/ },
    { num: 9, str: '09', name: 'Septiembre', regex: /\b(septiembre|setiembre|sep|set)\b/ },
    { num: 10, str: '10', name: 'Octubre', regex: /\b(octubre|oct)\b/ },
    { num: 11, str: '11', name: 'Noviembre', regex: /\b(noviembre|nov)\b/ },
    { num: 12, str: '12', name: 'Diciembre', regex: /\b(diciembre|dic)\b/ }
  ];

  const QUARTER_DEFINITIONS = [
    { code: '1Q', label: 'T1 (Ene–Mar)', regex: /\b(primer\s+trimestre|1er\s+trimestre|trimestre\s+1|t1|1q|q1)\b/ },
    { code: '2Q', label: 'T2 (Abr–Jun)', regex: /\b(segundo\s+trimestre|2do\s+trimestre|trimestre\s+2|t2|2q|q2)\b/ },
    { code: '3Q', label: 'T3 (Jul–Sep)', regex: /\b(tercer\s+trimestre|3er\s+trimestre|trimestre\s+3|t3|3q|q3)\b/ },
    { code: '4Q', label: 'T4 (Oct–Dic)', regex: /\b(cuarto\s+trimestre|4to\s+trimestre|trimestre\s+4|t4|4q|q4)\b/ }
  ];

  function detectConceptualQuestion(q) {
    const isConceptSyntax = /^(que\s+es|que\s+significa|que\s+quiere\s+decir|a\s+que\s+se\s+refiere|a\s+que\s+llamamos|que\s+son\s+los|que\s+son\s+las|que\s+son|definime|explicame\s+que\s+es|concepto\s+de|definicion\s+de)\b/.test(q);
    if (!isConceptSyntax) return null;

    // Excluir preguntas analíticas del tipo "¿qué es lo que más cayó?" o "¿qué explica...?"
    if (/\b(mas|menos|mejor|peor|cayo|subio|perdio|gano|vendio|explica|paso)\b/.test(q)) {
      return null;
    }

    // Buscar match exacto o por alias en CONCEPTUAL_GLOSSARY
    for (const key of Object.keys(CONCEPTUAL_GLOSSARY)) {
      const item = CONCEPTUAL_GLOSSARY[key];
      for (const alias of item.aliases) {
        const normAlias = normalizeText(alias);
        const escaped = normAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`\\b${escaped}\\b`).test(q)) {
          return item.id;
        }
      }
    }

    return null;
  }

  function extractAllChannels(q) {
    const found = [];
    for (const ch of CHANNEL_DEFINITIONS) {
      const m = ch.regex.exec(q);
      if (m) {
        found.push({ ...ch, index: m.index, dimension: DIMENSIONS.CANAL });
      }
    }
    found.sort((a, b) => a.index - b.index);
    return found;
  }

  function extractAllUNs(q) {
    const found = [];
    for (const un of UN_DEFINITIONS) {
      const m = un.regex.exec(q);
      if (m) {
        found.push({ ...un, index: m.index, dimension: DIMENSIONS.UNIDAD_NEGOCIO });
      }
    }
    found.sort((a, b) => a.index - b.index);
    return found;
  }

  function interpretHeuristic(rawQuery, contextMemory = null) {
    const spec = createEmptyQuerySpec();
    spec.rawQuery = String(rawQuery || '').trim();
    const q = normalizeText(rawQuery);
    spec.normalizedQuery = q;

    if (!q) {
      spec.intent = INTENTS.UNKNOWN;
      return spec;
    }

    // 1. Detectar causas externas no verificables (clima, inflación, dólar, competencia, gobierno, etc.)
    const externalRegex = /\b(clima|lluvia|calor|frio|inflacion|dolar|devaluacion|gobierno|economia|competencia|crisis|paro|feriado)\b/;
    if (externalRegex.test(q)) {
      spec.intent = INTENTS.UNVERIFIABLE_EXTERNAL;
      spec.externalCauseDetected = 'factores macroeconómicos o climáticos externos';
      spec.confidence = 0.99;
      return spec;
    }

    // 2. Detectar preguntas conceptuales ("¿Qué es YTD?", "¿Qué significa CCC?", etc.)
    const conceptId = detectConceptualQuestion(q);
    if (conceptId) {
      spec.intent = INTENTS.CONCEPTUAL_DEFINITION;
      spec.conceptId = conceptId;
      spec.confidence = 0.98;
      return spec;
    }

    // 3. Detectar período temporal (Mes específico, Trimestre específico o YTD)
    for (const m of MONTH_DEFINITIONS) {
      if (m.regex.test(q)) {
        spec.period = PERIODS.MONTH_SPECIFIC;
        spec.monthNum = m.num;
        spec.monthStr = m.str;
        spec.monthName = m.name;
        break;
      }
    }

    for (const qt of QUARTER_DEFINITIONS) {
      if (qt.regex.test(q)) {
        spec.period = PERIODS.QUARTER_SPECIFIC;
        spec.quarter = qt.code;
        break;
      }
    }

    if (/\b(ytd|year\s+to\s+date|acumulado|este\s+ano|en\s+lo\s+que\s+va\s+del\s+ano|ano\s+a\s+la\s+fecha)\b/.test(q) && spec.period !== PERIODS.MONTH_SPECIFIC && spec.period !== PERIODS.QUARTER_SPECIFIC) {
      spec.period = PERIODS.YTD;
    }

    // 4. Detectar métrica solicitada
    const hasObjectiveWords = /\b(objetivos?|metas?|targets?|cumplimientos?|cuotas?|alcance|cerca\s+de\s+su\s+objetivo|llegar\s+a\s+la\s+meta|falta\s+para\s+el\s+objetivo)\b/.test(q);
    const hasFacturacionWords = /\b(facturacion|neto|pesos|plata|dinero|ingresos|recaudacion|facturo|ventas?\s+netas?)\b/.test(q);
    const hasClientesWords = /\b(clientes?\s+unicos?|clientes?\s+con\s+compra|ccc|cobertura|compradores|cuantos?\s+clientes?)\b/.test(q);
    const hasPrecioWords = /\b(precio\s+promedio|precio\s+por\s+hl|valor\s+por\s+hl|\$\/hl)\b/.test(q);
    const hasBultosWords = /\b(bultos?|cajas?|cajones|packs?)\b/.test(q);
    const hasRechazosWords = /\b(rechazos?|devoluciones|tasa\s+de\s+rechazo)\b/.test(q);
    const hasActivosWords = /\b(activos?\s+fijos?|heladeras?|equipos?\s+de\s+frio|repago|comodato)\b/.test(q);

    // Excepción crítica: "On Premise", "bares", "autoservicios", etc. sin mencionar explícitamente "clientes/ccc" es SIEMPRE volumen
    if (hasObjectiveWords) {
      spec.metric = METRICS.CUMPLIMIENTO_OBJETIVO;
    } else if (hasFacturacionWords) {
      spec.metric = METRICS.FACTURACION;
    } else if (hasPrecioWords) {
      spec.metric = METRICS.PRECIO_PROMEDIO;
    } else if (hasBultosWords) {
      spec.metric = METRICS.BULTOS;
    } else if (hasRechazosWords) {
      spec.metric = METRICS.RECHAZOS;
    } else if (hasActivosWords) {
      spec.metric = METRICS.ACTIVOS_FIJOS;
    } else if (hasClientesWords) {
      spec.metric = METRICS.CLIENTES_CCC;
    } else {
      spec.metric = METRICS.VOLUMEN_HL;
    }

    // 5. Detectar entidades (Canales y Unidades de Negocio)
    const matchedChannels = extractAllChannels(q);
    const matchedUNs = extractAllUNs(q);

    // 6. Detectar comparación entre 2 entidades ("Comparame cerveza con aguas", "Aiellos vs Delfines", "On Premise vs Mercado Hogar")
    const hasCompareBetweenWords = /\b(comparame|compara|comparar|comparacion|versus|vs|contra|frente\s+a|diferencia\s+entre|con)\b/.test(q);
    const mentionsYoY = /\b(ano\s+anterior|ano\s+pasado|aa|yoy|interanual|2025|mismo\s+periodo)\b/.test(q);

    if (hasCompareBetweenWords && !mentionsYoY) {
      if (matchedUNs.length >= 2) {
        spec.intent = INTENTS.COMPARE_ENTITIES;
        spec.compareEntities = {
          entityA: matchedUNs[0],
          entityB: matchedUNs[1]
        };
        spec.comparison = COMPARISONS.ENTITY_VS_ENTITY;
        spec.confidence = 0.97;
        return spec;
      }
      if (matchedChannels.length >= 2) {
        spec.intent = INTENTS.COMPARE_ENTITIES;
        spec.compareEntities = {
          entityA: matchedChannels[0],
          entityB: matchedChannels[1]
        };
        spec.comparison = COMPARISONS.ENTITY_VS_ENTITY;
        spec.confidence = 0.97;
        return spec;
      }
    }

    const primaryChannel = matchedChannels.length > 0 ? matchedChannels[0] : null;
    const primaryUN = matchedUNs.length > 0 ? matchedUNs[0] : null;

    if (primaryChannel) {
      spec.entity = DIMENSIONS.CANAL;
      spec.entityValue = primaryChannel.value;
      spec.canalFilter = primaryChannel.canalFilter;
    } else if (primaryUN) {
      spec.entity = DIMENSIONS.UNIDAD_NEGOCIO;
      spec.entityValue = primaryUN.value;
    }

    // Si hay ambos (ej: "cerveza en mayoristas"), guardar subFilter
    if (primaryChannel && primaryUN) {
      spec.subFilters.canal = primaryChannel.value;
      spec.subFilters.canalFilter = primaryChannel.canalFilter;
      spec.subFilters.unidadNegocio = primaryUN.value;
    }

    // 7. Detectar baja / pérdida de clientes (Client Churn: "¿Qué clientes dejaron de comprar?")
    const isClientChurn = /\b(clientes?\s+que\s+(dejaron\s+de\s+comprar|no\s+compraron|se\s+cayeron|perdimos|abandonaron)|dejaron\s+de\s+comprar|bajas?\s+de\s+clientes|cuentas?\s+que\s+dejaron|clientes?\s+perdidos?|clientes?\s+sin\s+compra)\b/.test(q);
    if (isClientChurn) {
      spec.intent = INTENTS.CLIENT_CHURN;
      spec.dimension = DIMENSIONS.CLIENTE;
      spec.metric = METRICS.VOLUMEN_HL;
      spec.confidence = 0.97;
      return spec;
    }

    // 8. Detectar referencias pronominales / seguimiento conversacional ("eso", "¿Y cuánto vendió?", "¿Y qué productos explican eso?")
    const isFollowUpPronoun = /\b(eso|esa\s+caida|ese\s+canal|esa\s+unidad|ese\s+vendedor|ese\s+resultado|lo\s+anterior)\b/.test(q) ||
      /^(y\s+que|y\s+cual|y\s+cuanto|y\s+como|y\s+por\s+que|por\s+que\s+cayo\s+tanto|que\s+explica\s+eso|y\s+en\s+facturacion|y\s+contra\s+aa)\b/.test(q);

    if (isFollowUpPronoun && contextMemory) {
      spec.isFollowUp = true;
      if (!primaryChannel && !primaryUN && contextMemory.entity && contextMemory.entity !== DIMENSIONS.GENERAL) {
        spec.entity = contextMemory.entity;
        spec.entityValue = contextMemory.entityValue;
        spec.canalFilter = contextMemory.canalFilter || null;
      }
      if (/\b(explica|explican|por\s+que|causa|driver|productos?\s+explican)\b/.test(q)) {
        spec.intent = INTENTS.ANALYZE_DRIVERS;
        spec.comparison = COMPARISONS.PREVIOUS_YEAR;
        spec.confidence = 0.95;
        return spec;
      }
      if (/\b(cuanto\s+vendio|cuanto\s+fue|cual\s+fue\s+el\s+volumen|volumen\s+total)\b/.test(q)) {
        spec.intent = INTENTS.GET_METRIC;
        spec.comparison = COMPARISONS.NONE;
        spec.confidence = 0.95;
        return spec;
      }
    }

    // 9. Detectar dimensión de agrupación para rankings
    if (/\b(vendedor(?:es)?|preventistas?|quien\s+vendio|quien\s+esta|quien\s+fue\s+el\s+mejor\s+vendedor|mejor\s+vendedor)\b/.test(q)) {
      spec.dimension = DIMENSIONS.VENDEDOR;
      if (primaryUN) spec.subFilters.unidadNegocio = primaryUN.value;
      if (primaryChannel) {
        spec.subFilters.canal = primaryChannel.value;
        spec.subFilters.canalFilter = primaryChannel.canalFilter;
      }
    } else if (/\b(canal(?:es)?|donde\s+tuvimos|en\s+que\s+canal|que\s+canal)\b/.test(q) && !primaryChannel) {
      spec.dimension = DIMENSIONS.CANAL;
    } else if (/\b(productos?|skus?|calibres?|marcas?)\b/.test(q) && !/\b(explica|explican|causa|por\s+que)\b/.test(q)) {
      spec.dimension = DIMENSIONS.PRODUCTO;
    } else if (/\b(unidades?\s+de\s+negocio|categorias?)\b/.test(q) && !primaryUN) {
      spec.dimension = DIMENSIONS.UNIDAD_NEGOCIO;
    } else if (/\b(trimestres?|que\s+trimestre|mejor\s+trimestre|peor\s+trimestre)\b/.test(q) && spec.period !== PERIODS.QUARTER_SPECIFIC) {
      spec.dimension = DIMENSIONS.TRIMESTRE;
    } else if (/\b(que\s+mes|cual\s+fue\s+el\s+mejor\s+mes|mejor\s+mes|peor\s+mes)\b/.test(q) && spec.period !== PERIODS.MONTH_SPECIFIC) {
      spec.dimension = DIMENSIONS.MES;
    }

    // 10. Detectar intención: Análisis de causas / drivers ("¿Por qué cayó...?", "¿Qué productos explican...?", "¿Qué pasó con Aiellos este año?")
    const isDriversIntent = /\b(que\s+explica|por\s+que\s+cayo|por\s+que\s+bajo|por\s+que\s+perdio|causas?\s+de|drivers?\s+de|motivos?\s+de|que\s+productos?\s+explican|a\s+que\s+se\s+debe\s+la\s+caida|que\s+impulso|que\s+paso\s+con)\b/.test(q);
    if (isDriversIntent) {
      spec.intent = INTENTS.ANALYZE_DRIVERS;
      spec.comparison = COMPARISONS.PREVIOUS_YEAR;
      if (!primaryChannel && !primaryUN && contextMemory && contextMemory.entityValue && /\b(eso|esa\s+caida|ese\s+canal)\b/.test(q)) {
        spec.entity = contextMemory.entity;
        spec.entityValue = contextMemory.entityValue;
        spec.canalFilter = contextMemory.canalFilter || null;
        spec.isFollowUp = true;
      }
      spec.confidence = 0.95;
      return spec;
    }

    // 11. Detectar intención: Ranking ("¿Qué canal perdió más?", "¿Quién fue el mejor vendedor de septiembre?", "¿Cuál fue el mejor trimestre?")
    const isRankingIntent = /\b(que\s+canal\s+perdio\s+mas|cual\s+fue\s+el\s+canal\s+que\s+mas\s+cayo|que\s+canal\s+cayo\s+mas|donde\s+tuvimos\s+la\s+mayor\s+perdida|que\s+vendedor\s+vendio\s+mas|quien\s+vendio\s+mas|quien\s+fue\s+el\s+mejor\s+vendedor|mejor\s+vendedor|que\s+vendedor\s+esta\s+mas\s+cerca|quien\s+esta\s+por\s+llegar|cual\s+es\s+el\s+mejor|cual\s+fue\s+el\s+mejor|cual\s+fue\s+el\s+peor|ranking|top|mayor\s+caida|mas\s+cayo|perdio\s+mas)\b/.test(q);

    // Ambigüedad ("¿Quién está mejor?", "¿Cómo vamos?" sin sujeto ni métrica clara)
    if (/^(quien\s+esta\s+mejor|quien\s+va\s+mejor|cual\s+es\s+mejor|quien\s+gana)$/.test(q)) {
      spec.intent = INTENTS.CLARIFY_AMBIGUITY;
      spec.ambiguityReason = 'La pregunta es ambigua porque no especifica si buscás evaluar por volumen vendido (HL), facturación neta ($), crecimiento vs Año Anterior (AA) o cumplimiento de objetivo (%).';
      spec.confidence = 0.95;
      return spec;
    }

    if (isRankingIntent || spec.dimension) {
      if (spec.dimension || /\b(donde\s+tuvimos\s+la\s+mayor\s+perdida)\b/.test(q)) {
        spec.intent = INTENTS.RANK_DIMENSION;
        if (!spec.dimension) spec.dimension = DIMENSIONS.CANAL;

        const isWorst = /\b(perdio\s+mas|mas\s+cayo|cayo\s+mas|bajo\s+mas|mayor\s+perdida|mayor\s+caida|peor|menos\s+vendio|mas\s+bajo|cayeron\s+mas|perdieron\s+mas)\b/.test(q);
        spec.direction = isWorst ? 'worst' : 'best';

        if (isWorst || /\b(caida|perdida|cayo|perdio|crecio)\b/.test(q)) {
          spec.comparison = COMPARISONS.PREVIOUS_YEAR;
        } else if (spec.metric === METRICS.CUMPLIMIENTO_OBJETIVO) {
          spec.comparison = COMPARISONS.TARGET;
        } else {
          spec.comparison = COMPARISONS.NONE;
        }
        spec.confidence = 0.94;
        return spec;
      }
    }

    // 12. Detectar desempeño de un mes o trimestre específico ("¿Cómo viene octubre?", "¿Cómo estuvo septiembre?", "¿Cómo dio el T1?")
    const isPeriodStatus = (spec.period === PERIODS.MONTH_SPECIFIC || spec.period === PERIODS.QUARTER_SPECIFIC) &&
      !primaryChannel && !primaryUN &&
      /\b(como\s+viene|como\s+va|como\s+estuvo|como\s+cerro|como\s+dio|resumen\s+de|que\s+tal\s+viene|cuanto\s+llevamos\s+en|cuanto\s+vendimos\s+en)\b/.test(q);
    if (isPeriodStatus) {
      spec.intent = INTENTS.PERIOD_PERFORMANCE;
      spec.comparison = COMPARISONS.PREVIOUS_YEAR;
      spec.confidence = 0.96;
      return spec;
    }

    // 13. Detectar evaluación diagnóstica / salud ("¿Autoservicios viene bien?", "¿Estamos creciendo en UNG?")
    const isHealthCheck = /\b(viene\s+bien|vamos\s+bien|estamos\s+creciendo|viene\s+creciendo|esta\s+creciendo|como\s+viene|como\s+esta\s+yendo)\b/.test(q) &&
      !/\b(vs|versus|contra|frente\s+a|comparado|ano\s+anterior|ano\s+pasado|aa)\b/.test(q);
    if (isHealthCheck) {
      spec.intent = INTENTS.HEALTH_CHECK;
      spec.comparison = COMPARISONS.PREVIOUS_YEAR;
      spec.confidence = 0.93;
      return spec;
    }

    // 14. Detectar comparación interanual o desvío ("desviación vs año anterior", "cuánto perdió contra el año pasado", "comparame con AA", "cómo está On Premise vs año pasado")
    const isComparisonYoY = /\b(desviacion|desvio|variacion|diferencia|vs|versus|contra|frente\s+a|comparame|compara|comparado\s+con|ano\s+anterior|ano\s+pasado|aa|yoy|interanual|cuanto\s+perdio|cuanto\s+cayo|cuanto\s+crecio|cuanto\s+subio|como\s+vienen?\s+los?\s+bares)\b/.test(q);
    if (isComparisonYoY) {
      spec.intent = INTENTS.COMPARE_METRIC;
      spec.comparison = COMPARISONS.PREVIOUS_YEAR;
      spec.confidence = 0.95;
      return spec;
    }

    // 15. Detectar consulta directa de métrica ("¿Cuánto volumen llevamos YTD?", "¿Cuántos clientes únicos compraron?", "¿Cuánto vendió Autoservicios?")
    const isGetMetric = /\b(cuanto|cuantos|cual\s+es|que\s+volumen|volumen\s+de|facturacion\s+de|ventas?\s+de|vendio|vendimos|acumula|llevamos|tenemos|compraron|total\s+de)\b/.test(q);
    if (isGetMetric || primaryChannel || primaryUN || spec.metric === METRICS.CLIENTES_CCC || spec.metric === METRICS.FACTURACION) {
      spec.intent = INTENTS.GET_METRIC;
      spec.comparison = COMPARISONS.NONE;
      spec.confidence = 0.92;
      return spec;
    }

    // 16. Resumen general del negocio ("¿Cómo está el negocio?", "Dame un resumen")
    if (/\b(resumen|estado\s+general|como\s+esta\s+el\s+negocio|panorama|tablero)\b/.test(q)) {
      spec.intent = INTENTS.EXECUTIVE_SUMMARY;
      spec.comparison = COMPARISONS.PREVIOUS_YEAR;
      spec.confidence = 0.90;
      return spec;
    }

    return spec;
  }

  async function interpret(rawQuery, contextMemory = null) {
    if (_llmAdapter) {
      try {
        const llmSpec = await _llmAdapter(rawQuery, contextMemory);
        if (llmSpec && llmSpec.intent && llmSpec.intent !== INTENTS.UNKNOWN) {
          return llmSpec;
        }
      } catch (e) {
        // Fallback seguro al intérprete semántico local
      }
    }
    return interpretHeuristic(rawQuery, contextMemory);
  }

  return {
    interpret,
    interpretHeuristic,
    setLLMAdapter,
    normalizeText
  };
});
