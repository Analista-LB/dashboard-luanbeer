(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ArgonBI = root.ArgonBI || {};
    root.ArgonBI.AIQueryInterpreter = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ChannelUniverseConfig = (typeof window !== 'undefined' && window.ArgonBI && window.ArgonBI.ChannelUniverseConfig)
    ? window.ArgonBI.ChannelUniverseConfig
    : (typeof root !== 'undefined' && root.ArgonBI && root.ArgonBI.ChannelUniverseConfig)
      ? root.ArgonBI.ChannelUniverseConfig
      : (typeof require === 'function' ? require('../channelUniverseConfig.js') : null);

  const MONTHS_MAP = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12
  };

  function normalizeText(str) {
    return String(str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[¿?¡!.,;:()"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * AIQueryInterpreter
   * Intérprete semántico con razonamiento de intenciones, resolución de entidades
   * y mapeo normalizado contra catálogos dimensionales reales.
   */
  class AIQueryInterpreter {
    static interpret(questionText, context = null) {
      const qNorm = normalizeText(questionText);

      if (!qNorm || qNorm.length < 3) {
        return {
          interpreted: false,
          confidence: 0.0,
          limitationMessage: 'La consulta ingresada es demasiado breve. Preguntá sobre ventas, objetivos, clientes, canales, productos o meses.'
        };
      }

      // 1. Descarte estricto de causas externas no verificables
      if (/\b(clima|lluvia|temperatura|inflacion|competencia|competidor|dolar|politica|marketing|publicidad|por que cayo|causa de la caida)\b/.test(qNorm) &&
          !/\b(producto|canal|unidad|mes|cliente|cerveza|vendedor|autoservicio|mayorista)\b/.test(qNorm)) {
        return {
          interpreted: false,
          confidence: 0.1,
          intent: 'UNVERIFIABLE_EXTERNAL',
          limitationMessage: 'No existen datos ni fuentes sobre factores externos (clima, inflación o contexto) para responder con evidencias matemáticas en las bases importadas.'
        };
      }

      // 2. Manejo de ambigüedad general (sin métrica ni dimensión clara)
      if (/^(quien esta mejor|cual viene mejor|como estamos|quien va ganando|como venimos|estamos bien)\b/.test(qNorm)) {
        return {
          interpreted: false,
          ambiguous: true,
          confidence: 0.5,
          ambiguityPrompt: '¿Querés compararlos por volumen, facturación o cumplimiento de objetivos?'
        };
      }

      // 3. Resolución contextual de seguimiento (ConversationContext)
      if (context && typeof context.resolveFollowUp === 'function') {
        const followUp = context.resolveFollowUp(qNorm);
        if (followUp) {
          return {
            interpreted: true,
            isFollowUp: true,
            confidence: followUp.confidence || 0.95,
            entity: followUp.entity,
            entityValue: followUp.entityValue,
            metric: followUp.metric,
            operation: followUp.operation,
            comparison: followUp.comparison,
            subDimension: followUp.subDimension,
            questionText
          };
        }
      }

      // 4. Detección de comparación temporal
      const hasAA = /\b(versus ano anterior|vs aa|contra el ano pasado|contra el ano anterior|comparado con 2025|vs 2025|contra aa|interanual|ano anterior|ano pasado|vs anterior)\b/.test(qNorm);
      const hasObj = /\b(versus objetivo|vs meta|contra objetivo|vs obj|meta|objetivo)\b/.test(qNorm);
      const comparison = hasAA ? 'previous_year' : (hasObj ? 'target' : 'none');

      // 5. Detección de operación de variación / desviación
      const hasDeviation = /\b(desviacion|diferencia|cuanto perdio|cuanto gano|cuanto cayo|brecha|gap)\b/.test(qNorm);
      const hasVariationPct = /\b(variacion|porcentaje de variacion|var %|evolucion)\b/.test(qNorm);

      // 6. Detección de entidades específicas en dimensiones
      // Comparación entre dos universos comerciales (ej. 'Comparame Aiellos con Delfines')
      if (/\b(compara(me)?|comparar|comparacion|vs|contra)\b/.test(qNorm) && !/\b(ano anterior|ano pasado|aa)\b/.test(qNorm)) {
        let uA = null, uB = null;
        if (/\baiello(s)?\b/.test(qNorm) && /\bdelfin(es)?\b/.test(qNorm)) {
          uA = 'AIELLOS';
          uB = 'DELFINES';
        } else if (/\b(on premise|onpremise)\b/.test(qNorm) && /\b(mercado hogar|mh)\b/.test(qNorm)) {
          uA = 'ON_PREMISE';
          uB = 'MH_CON_AUTO';
        }
        if (uA && uB) {
          return {
            interpreted: true,
            confidence: 0.99,
            intent: 'COMPARE_UNIVERSES',
            entity: 'universe_compare',
            universeA: uA,
            universeB: uB,
            metric: 'volumen_hl',
            operation: 'compare_universes',
            period: 'active',
            questionText
          };
        }
      }

      // Universos Comerciales Canónicos (Mapping Centralizado)
      let matchedUniverseKey = null;
      if (/\b(mercado hogar|mh)\b.*\b(sin auto|sin autoservicio|excluyendo auto)/.test(qNorm) || /\b(sin auto|sin autoservicio)\b/.test(qNorm)) {
        matchedUniverseKey = 'MH_SIN_AUTO';
      } else if (/\b(mercado hogar|mh)\b.*\b(con auto|con autoservicio|completo)/.test(qNorm) || /\b(con auto|con autoservicio)\b/.test(qNorm)) {
        matchedUniverseKey = 'MH_CON_AUTO';
      } else if (/\b(mercado hogar|mh)\b/.test(qNorm)) {
        matchedUniverseKey = 'MH_CON_AUTO';
      } else if (/\b(autoservicio(s)?|auto servicio)\b/.test(qNorm)) {
        matchedUniverseKey = 'AUTOSERVICIO';
      } else if (/\b(on premise|on-premise|gastronomia|bares y discos)\b/.test(qNorm)) {
        matchedUniverseKey = 'ON_PREMISE';
      } else if (/\b(mayorista(s)?)\b/.test(qNorm) && !/\b(que canal|cual canal)\b/.test(qNorm)) {
        matchedUniverseKey = 'MAYORISTAS';
      } else if (/\b(clie people|people e instituciones|people \+ instituciones|people)\b/.test(qNorm) || (/\binstitucion(es)?\b/.test(qNorm) && !/\b(que canal|cual canal)\b/.test(qNorm))) {
        matchedUniverseKey = 'PEOPLE_INSTITUCIONES';
      } else if (/\baiello(s)?\b/.test(qNorm)) {
        matchedUniverseKey = 'AIELLOS';
      } else if (/\bdelfin(es)?\b/.test(qNorm)) {
        matchedUniverseKey = 'DELFINES';
      } else if (/\bcadenita(s)?\b/.test(qNorm)) {
        matchedUniverseKey = 'CADENITAS';
      }

      if (matchedUniverseKey) {
        const CUC = ChannelUniverseConfig || (typeof window !== 'undefined' && window.ArgonBI && window.ArgonBI.ChannelUniverseConfig) || (typeof require === 'function' ? require('../channelUniverseConfig.js') : null);
        const uDef = CUC ? CUC.resolveUniverse(matchedUniverseKey) : null;
        const canonicalLabel = uDef ? uDef.label : matchedUniverseKey;

        const isGetMetric = /\b(cuanto vendio|volumen|cuanto fue su venta|ventas)\b/.test(qNorm) &&
          !/\b(vs aa|contra aa|ano anterior|ano pasado|desviacion|perdio|cayo|brecha|como viene|como esta|salud)\b/.test(qNorm);

        if (isGetMetric) {
          return {
            interpreted: true,
            confidence: 0.98,
            intent: 'CHANNEL_METRIC',
            entity: 'canal',
            entityValue: canonicalLabel,
            universeKey: uDef ? uDef.key : matchedUniverseKey,
            metric: 'volumen_hl',
            operation: 'get_metric',
            comparison: 'none',
            period: 'active',
            questionText
          };
        }

        if (hasDeviation || hasAA || /\b(cuanto cayo|cuanto perdio|desviacion|diferencia|brecha)\b/.test(qNorm)) {
          return {
            interpreted: true,
            confidence: 0.98,
            intent: 'CHANNEL_VARIANCE',
            entity: 'canal',
            entityValue: canonicalLabel,
            universeKey: uDef ? uDef.key : matchedUniverseKey,
            metric: 'volumen_hl',
            operation: 'compare_metric',
            comparison: 'previous_year',
            period: 'active',
            questionText
          };
        }

        return {
          interpreted: true,
          confidence: 0.96,
          intent: 'CHANNEL_HEALTH',
          entity: 'canal',
          entityValue: canonicalLabel,
          universeKey: uDef ? uDef.key : matchedUniverseKey,
          metric: 'volumen_hl',
          operation: 'health_check',
          comparison: 'previous_year',
          period: 'active',
          questionText
        };
      }

      // Unidad de Negocio: Cervezas, UNG, Aguas, Vinos
      let matchedUnidad = null;
      if (/\bcerveza(s)?\b/.test(qNorm)) matchedUnidad = 'CERVEZAS';
      else if (/\bung\b/.test(qNorm)) matchedUnidad = 'UNG';
      else if (/\bagua(s)?\b/.test(qNorm)) matchedUnidad = 'AGUAS';
      else if (/\bvino(s)?\b/.test(qNorm)) matchedUnidad = 'VINO';

      // Caso UNG Crecimiento / Salud comercial (ej. "¿Estamos creciendo en UNG?")
      if (matchedUnidad === 'UNG' && /\b(creciendo|crece|viene|esta|crecimiento|salud|desempeno)\b/.test(qNorm)) {
        return {
          interpreted: true,
          confidence: 0.98,
          entity: 'unidad_negocio',
          entityValue: 'UNG',
          metric: 'volumen_hl',
          operation: 'health_check',
          comparison: 'previous_year',
          period: 'active',
          questionText
        };
      }

      // =========================================================================
      // CASO CRÍTICO 1: Desviación o caída de Canal específico (ej. Autoservicios vs AA)
      // "quiero saber cuanto es la desviacion de volumen versus año anterior en canal autoservicios"
      // "¿Cuánto es la desviación de volumen vs AA de Autoservicios?"
      // "¿Cuánto perdió Autoservicios contra el año pasado?"
      // "Comparame el volumen de Autoservicios con AA"
      // =========================================================================
      if (matchedChannel && (hasDeviation || hasAA || /\b(comparame|compara|cuanto cayo|cuanto perdio)\b/.test(qNorm))) {
        return {
          interpreted: true,
          confidence: 0.98,
          entity: 'canal',
          entityValue: matchedChannel,
          metric: 'volumen_hl',
          operation: 'variance_absolute',
          comparison: 'previous_year',
          period: 'active',
          filters: [],
          questionText
        };
      }

      // Consulta de volumen puro de un canal específico (ej. "¿Cuánto vendió Autoservicios?")
      if (matchedChannel && /\b(cuanto vendio|volumen|cuanto fue su venta|ventas)\b/.test(qNorm)) {
        return {
          interpreted: true,
          confidence: 0.98,
          entity: 'canal',
          entityValue: matchedChannel,
          metric: 'volumen_hl',
          operation: 'get_metric',
          comparison: 'none',
          period: 'active',
          questionText
        };
      }

      // Consulta de salud / diagnóstico (ej. "¿Autoservicios viene bien?")
      if (matchedChannel && /\b(viene bien|como viene|como esta|esta bien|buen desempeno)\b/.test(qNorm)) {
        return {
          interpreted: true,
          confidence: 0.96,
          entity: 'canal',
          entityValue: matchedChannel,
          metric: 'volumen_hl',
          operation: 'health_check',
          comparison: 'previous_year',
          questionText
        };
      }

      // =========================================================================
      // CASO ANÁLISIS MULTIPASO & DRIVERS
      // "¿Qué explica la caída de cerveza?"
      // "¿Dónde estamos perdiendo volumen?"
      // "¿Por qué cayó cerveza?"
      // =========================================================================
      if (/\b(que explica|por que cayo|donde estamos perdiendo|donde perdimos|cuales son los drivers|quien explica|que productos explican)\b/.test(qNorm)) {
        if (matchedUnidad || /\bcerveza(s)?\b/.test(qNorm)) {
          return {
            interpreted: true,
            confidence: 0.96,
            entity: 'unidad_negocio',
            entityValue: 'CERVEZAS',
            metric: 'volumen_hl',
            operation: 'analyze_drivers',
            multiStep: true,
            comparison: 'previous_year',
            subDimension: 'canal',
            questionText
          };
        }
        if (matchedChannel) {
          return {
            interpreted: true,
            confidence: 0.96,
            entity: 'canal',
            entityValue: matchedChannel,
            metric: 'volumen_hl',
            operation: 'analyze_drivers',
            multiStep: true,
            comparison: 'previous_year',
            subDimension: 'producto',
            questionText
          };
        }
        if (/\b(volumen|hl|perdida|perdiendo)\b/.test(qNorm)) {
          return {
            interpreted: true,
            confidence: 0.95,
            entity: 'general',
            entityValue: 'Total Distribuidora',
            metric: 'volumen_hl',
            operation: 'analyze_drivers',
            multiStep: true,
            comparison: 'previous_year',
            subDimension: 'canal',
            questionText
          };
        }
      }

      // =========================================================================
      // CASO RANKING DE CANALES
      // "¿Qué canal perdió más volumen?"
      // "¿Cuál fue el canal que más cayó?"
      // "¿Dónde tuvimos la mayor pérdida de HL?"
      // =========================================================================
      if (/\b(canal(es)?|donde)\b/.test(qNorm) && /\b(perdio mas|mas cayo|mayor caida|mayor perdida|peor)\b/.test(qNorm)) {
        return {
          interpreted: true,
          confidence: 0.98,
          intent: 'CHANNEL_PERFORMANCE',
          entity: 'canal',
          metric: 'volumen_hl',
          operation: 'mayor_caida',
          comparison: 'previous_year',
          params: { wantsClients: false, wantsGrowth: false },
          sort: { field: 'hlDiff', direction: 'asc' },
          limit: 1,
          questionText
        };
      }

      if (/\bcanal(es)?\b/.test(qNorm) && /\b(cliente(s)?|ccc)\b/.test(qNorm) && /\b(perdio|cayo|menor)\b/.test(qNorm)) {
        return {
          interpreted: true,
          confidence: 0.96,
          intent: 'CHANNEL_PERFORMANCE',
          entity: 'canal',
          metric: 'clientes_ccc',
          operation: 'mayor_caida_ccc',
          comparison: 'previous_year',
          params: { wantsClients: true, wantsGrowth: false },
          sort: { field: 'cccDiff', direction: 'asc' },
          limit: 1,
          questionText
        };
      }

      // =========================================================================
      // CASO OBJETIVOS & VENDEDORES
      // "¿Qué vendedor está más cerca de su objetivo?"
      // "¿Quién está por llegar a la meta?"
      // "¿Qué vendedor vendió más?"
      // =========================================================================
      const hasVendedorWord = /\b(vendedor(es)?|promotor(es)?|representante(s)?|quien(es)?|mesa)\b/.test(qNorm);
      const hasCumplimientoWord = /\b(objetivo(s)?|meta(s)?|cumplimiento|cuota(s)?)\b/.test(qNorm);
      const hasCercaWord = /\b(por alcanzar|mas cerca|cerca|por cumplir|a punto de|proximo|alcanzar su objetivo|alcanzar el objetivo|por llegar)\b/.test(qNorm);

      if (hasVendedorWord || (hasCumplimientoWord && !/\b(canal|producto|mes)\b/.test(qNorm))) {
        if (hasCumplimientoWord && (hasCercaWord || /\balcanzar|llegar\b/.test(qNorm))) {
          return {
            interpreted: true,
            confidence: 0.98,
            entity: 'vendedor',
            metric: 'cumplimiento_objetivo',
            operation: 'cerca_objetivo',
            condition: '<100%',
            sort: { field: 'cumplimiento', direction: 'desc' },
            limit: 1,
            questionText
          };
        }

        if (/\b(vendio mas|mas volumen|mayor volumen|mas vendio|volumen|hl)\b/.test(qNorm)) {
          const isCerveza = /\bcerveza(s)?\b/.test(qNorm);
          return {
            interpreted: true,
            confidence: 0.98,
            entity: 'vendedor',
            metric: 'volumen_hl',
            operation: 'ranking_desc',
            filterDimension: isCerveza ? 'business_unit' : null,
            filterValue: isCerveza ? 'CERVEZAS' : null,
            sort: { field: 'volumen', direction: 'desc' },
            limit: 1,
            questionText
          };
        }

        if (/\b(facturo|facturacion|plata|neto)\b/.test(qNorm)) {
          return {
            interpreted: true,
            confidence: 0.95,
            entity: 'vendedor',
            metric: 'facturacion',
            operation: 'ranking_desc',
            sort: { field: 'facturacion', direction: 'desc' },
            limit: 1,
            questionText
          };
        }
      }

      // =========================================================================
      // CASO MES ESPECÍFICO
      // "¿Cuál fue la facturación de septiembre?"
      // =========================================================================
      let mentionedMonthNum = null;
      let mentionedMonthName = null;
      for (const [mName, mNum] of Object.entries(MONTHS_MAP)) {
        if (new RegExp(`\\b${mName}\\b`).test(qNorm)) {
          mentionedMonthNum = mNum;
          mentionedMonthName = mName.charAt(0).toUpperCase() + mName.slice(1);
          break;
        }
      }

      if (mentionedMonthNum !== null) {
        const wantsVol = /\b(volumen|hl|hectolitros)\b/.test(qNorm);
        const wantsCCC = /\b(cliente(s)?|ccc)\b/.test(qNorm);
        return {
          interpreted: true,
          confidence: 0.96,
          intent: 'MONTH_METRIC',
          entity: 'mes',
          targetMonthNum: mentionedMonthNum,
          targetMonthName: mentionedMonthName,
          params: { monthNum: mentionedMonthNum, monthName: mentionedMonthName, wantsVol, wantsCCC },
          metric: wantsVol ? 'volumen_hl' : (wantsCCC ? 'clientes_ccc' : 'facturacion'),
          operation: 'mes_especifico',
          questionText
        };
      }

      // =========================================================================
      // CASO CLIENTES ÚNICOS / CCC
      // "¿Cuántos clientes compraron?" / "¿Cómo evolucionó el CCC?"
      // =========================================================================
      if (/\b(cliente(s)? compraron|cuantos clientes|ccc|clientes con compra|cobertura de clientes)\b/.test(qNorm)) {
        return {
          interpreted: true,
          confidence: 0.96,
          intent: 'CCC_ACTIVE',
          entity: 'cliente',
          metric: 'clientes_ccc',
          operation: 'clientes_unicos',
          comparison: hasAA ? 'previous_year' : 'none',
          questionText
        };
      }

      // Caso General: Unidad de Negocio que más creció
      if (/\bunidad(es)? de negocio\b/.test(qNorm) && /\b(crecio mas|mayor crecimiento|mejor)\b/.test(qNorm)) {
        return {
          interpreted: true,
          confidence: 0.96,
          intent: 'BU_PERFORMANCE',
          entity: 'unidad_negocio',
          metric: 'volumen_hl',
          operation: 'mayor_crecimiento',
          comparison: 'previous_year',
          questionText
        };
      }

      // Caso General: Trimestre
      if (/\btrimestre(s)?\b/.test(qNorm)) {
        const wantsWorst = /\b(peor|menor|bajo|cayo)\b/.test(qNorm);
        return {
          interpreted: true,
          confidence: 0.96,
          intent: 'QUARTER_PERFORMANCE',
          entity: 'trimestre',
          metric: 'volumen_hl',
          operation: wantsWorst ? 'peor' : 'mejor',
          questionText
        };
      }

      // Intento final de resolución general
      return {
        interpreted: true,
        confidence: 0.75,
        entity: 'general',
        metric: 'volumen_hl',
        operation: 'resumen',
        questionText
      };
    }
  }

  return AIQueryInterpreter;
});
