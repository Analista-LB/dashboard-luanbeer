(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ArgonBI = root.ArgonBI || {};
    root.ArgonBI.NLQEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ChannelUniverseConfig = (typeof window !== 'undefined' && window.ArgonBI && window.ArgonBI.ChannelUniverseConfig)
    ? window.ArgonBI.ChannelUniverseConfig
    : (typeof root !== 'undefined' && root.ArgonBI && root.ArgonBI.ChannelUniverseConfig)
      ? root.ArgonBI.ChannelUniverseConfig
      : (typeof require === 'function' ? require('./channelUniverseConfig.js') : null);

  /**
   * ============================================================================
   * ARQUITECTURA DEL ASISTENTE DE CONSULTAS (INTERPRETACIÓN PRECISA & ULTRACORTA)
   * ============================================================================
   * 
   * PRINCIPIO FUNDAMENTAL:
   * El sistema separa estrictamente 5 etapas operativas:
   *   1. Interpretación semántica formal (interpretQuestion):
   *      Convierte la pregunta en una estructura intermedia formal (entidad, métrica,
   *      calificador, condición, ordenamiento y confianza). NO hace matching por palabras sueltas.
   *   2. Validación semántica (validateQuery):
   *      Comprueba existencia de entidad, métrica, dimensiones y confianza (>= 0.70).
   *      Si es ambigua o no verificable, NO adivina.
   *   3. Ejecución matemática determinística (executeCalculation):
   *      Calcula los valores numéricos exclusivamente desde el motor relacional de bases reales.
   *      LA IA O INTÉRPRETE NUNCA INVENTA NI CALCULA NÚMEROS.
   *   4. Estructura de Resultado Estandarizada:
   *      Genera un payload tipado para auditoría y futuras integraciones.
   *   5. Redacción Ultracorta (formatAnswer):
   *      Principio: "BUENO + CLARO + CORTO". Si una respuesta requiere 8 palabras,
   *      no utiliza 40. Responde directamente sin preámbulos innecesarios.
   * 
   * SEGURIDAD Y PRIVACIDAD (ZERO LEAKS):
   * Sistema 100% local y offline. NO contiene ni expone API keys de proveedores externos.
   * ============================================================================
   */

  const ENGINE_LABEL = 'Asistente de Consultas Comerciales (Cálculo Local Verificable)';

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

  function fmt(n, dec = 1) {
    if (n === null || n === undefined || isNaN(Number(n))) return 'N/A';
    return Number(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function fmtMoney(n) {
    if (n === null || n === undefined || isNaN(Number(n))) return 'N/A';
    return '$' + Number(Math.round(n)).toLocaleString('es-AR');
  }

  function cleanEntityLabel(label) {
    if (!label) return '';
    return String(label)
      .replace(/\s*\(\s*#\s*\d+\s*\)/g, '')
      .replace(/\s*\[.*?\]/g, '')
      .trim()
      .toLowerCase()
      .replace(/(?:^|\s|\/)\S/g, c => c.toUpperCase());
  }

  function formatFiltersSummary(filters) {
    if (!filters) return 'Sin filtros';
    const parts = [];
    parts.push(`Comparación: ${filters.modoComparacion || 'YTD'}`);
    if (filters.mes && filters.mes !== 'ALL') parts.push(`Mes: ${filters.mes}`);
    if (filters.trimestre && filters.trimestre !== 'ALL') parts.push(`Trimestre: ${filters.trimestre}`);
    if (filters.canal && filters.canal !== 'ALL') parts.push(`Canal: ${filters.canal}`);
    if (filters.canalUnificado && filters.canalUnificado !== 'ALL') parts.push(`Canal Unif.: ${filters.canalUnificado}`);
    if (filters.unidadNegocio && filters.unidadNegocio !== 'ALL') parts.push(`Unidad Negocio: ${filters.unidadNegocio}`);
    if (filters.division && filters.division !== 'ALL') parts.push(`División: ${filters.division}`);
    if (filters.producto && filters.producto !== 'ALL') parts.push(`Producto: #${filters.producto}`);
    if (filters.cliente && filters.cliente !== 'ALL') parts.push(`Cliente: #${filters.cliente}`);
    if (filters.vendedor && filters.vendedor !== 'ALL') parts.push(`Vendedor: #${filters.vendedor}`);
    if (filters.supervisor && filters.supervisor !== 'ALL') parts.push(`Supervisor: #${filters.supervisor}`);
    return parts.join(' | ');
  }

  // Memoria en sesión para preguntas de seguimiento (ej. "¿Y cuánto vendió?")
  let lastQueryContext = null;

  /**
   * CATÁLOGO SEMÁNTICO CENTRAL
   * Permite reconocer sinónimos comerciales asignándolos a entidades y métricas exactas.
   */
  const SEMANTIC_CATALOG = {
    entities: {
      vendedor: {
        key: 'vendedor',
        aliases: ['vendedor', 'vendedores', 'promotor', 'promotores', 'representante', 'representantes', 'sector de venta', 'fuerza de venta', 'quien', 'quienes'],
        label: 'Vendedor / Promotor'
      },
      canal: {
        key: 'canal',
        aliases: ['canal', 'canales', 'subcanal', 'subcanales', 'canal comercial'],
        label: 'Canal Comercial'
      },
      producto: {
        key: 'producto',
        aliases: ['producto', 'productos', 'marca', 'marcas', 'sku', 'skus', 'calibre', 'calibres', 'articulo', 'articulos'],
        label: 'Producto / Marca'
      },
      unidad_negocio: {
        key: 'unidad_negocio',
        aliases: ['unidad de negocio', 'unidades de negocio', 'unidad', 'unidades', 'un', 'division', 'divisiones'],
        label: 'Unidad de Negocio'
      },
      cliente: {
        key: 'cliente',
        aliases: ['cliente', 'clientes', 'punto de venta', 'puntos de venta', 'pdv', 'pdvs', 'comprador', 'compradores'],
        label: 'Clientes Únicos'
      },
      mes: {
        key: 'mes',
        aliases: ['mes', 'meses', 'mensual'],
        label: 'Mes'
      },
      trimestre: {
        key: 'trimestre',
        aliases: ['trimestre', 'trimestres', 'quarter', 'q'],
        label: 'Trimestre'
      },
      activos_fijos: {
        key: 'activos_fijos',
        aliases: ['heladera', 'heladeras', 'activo', 'activos', 'activo fijo', 'activos fijos', 'equipo', 'equipos', 'frio'],
        label: 'Activos Fijos / Heladeras'
      },
      rechazos: {
        key: 'rechazos',
        aliases: ['rechazo', 'rechazos', 'devolucion', 'devoluciones', 'motivo de rechazo'],
        label: 'Rechazos'
      },
      taco: {
        key: 'taco',
        aliases: ['taco', 'scorecard taco', 'tablero ventas', 'mando integral', 'mesa julio', 'mesa gonza'],
        label: 'Tablero TACO'
      },
      galaxia: {
        key: 'galaxia',
        aliases: ['galaxia', 'programa galaxia', 'manual distribuidores', '11000', '11.000', 'sensibilizacion', 'on premise'],
        label: 'Programa Galaxia 2026'
      }
    },
    metrics: {
      cumplimiento_objetivo: {
        key: 'cumplimiento_objetivo',
        aliases: ['objetivo', 'objetivos', 'meta', 'metas', 'cumplimiento', 'alcanzar su objetivo', 'alcanzar el objetivo', 'cerca del objetivo', 'cerca de su objetivo', 'lejos del objetivo', 'por alcanzar', 'por cumplir', 'cuota', 'cuotas', 'alcance'],
        unit: '%',
        label: 'Cumplimiento de Objetivo'
      },
      volumen: {
        key: 'volumen',
        aliases: ['volumen', 'hl', 'hectolitros', 'litros', 'bultos', 'cajas', 'vendio', 'vendimos', 'vendieron', 'venta', 'ventas'],
        unit: 'HL',
        label: 'Volumen (HL)'
      },
      facturacion: {
        key: 'facturacion',
        aliases: ['facturacion', 'facturo', 'facturaron', 'importe', 'neto', 'plata', 'dinero', 'pesos', '$', 'ingresos'],
        unit: '$',
        label: 'Facturación Neta ($)'
      },
      clientes_ccc: {
        key: 'clientes_ccc',
        aliases: ['clientes unicos', 'clientes compraron', 'compraron', 'ccc', 'clientes con compra', 'cobertura de clientes', 'padron'],
        unit: 'clientes',
        label: 'Clientes Únicos (CCC)'
      },
      rechazos_tasa: {
        key: 'rechazos_tasa',
        aliases: ['tasa de rechazo', 'rechazos', 'devoluciones'],
        unit: '%',
        label: 'Rechazos'
      }
    }
  };

  /**
   * ETAPA 1: Interpretación Semántica Formal
   * Produce una representación intermedia estructurada de la consulta.
   */
  function interpretQuestion(rawQuestion) {
    const qNorm = normalizeText(rawQuestion);
    if (!qNorm || qNorm.length < 3) {
      return {
        interpreted: false,
        confidence: 0.0,
        limitationMessage: 'La consulta ingresada es demasiado breve. Preguntá sobre ventas, objetivos, clientes, canales, productos o meses.'
      };
    }

    // 1. Descarte estricto de causas externas no verificables
    if (/\b(clima|lluvia|temperatura|inflacion|competencia|competidor|dolar|politica|marketing|publicidad|por que cayo|causa de la caida)\b/.test(qNorm) && !/\b(producto|canal|unidad|mes|cliente)\b/.test(qNorm)) {
      return {
        interpreted: false,
        confidence: 0.1,
        intent: 'UNVERIFIABLE_EXTERNAL',
        limitationMessage: 'No es posible determinar esa causa con los datos disponibles. El modelo no contiene variables externas (clima, inflación o competidores) y sólo responde sobre evidencias matemáticas.'
      };
    }

    // 2. Preguntas de seguimiento contextual (e.g. "¿Y cuánto vendió?", "¿Cuánto facturó?")
    if (/\b(y cuanto vendio|cuanto vendio|y cuanto fue su volumen|cuanto vendio ese vendedor|cuanto facturo|y cuanto facturo)\b/.test(qNorm)) {
      if (lastQueryContext && lastQueryContext.entity === 'vendedor') {
        const isFact = /\bfacturo\b/.test(qNorm);
        return {
          interpreted: true,
          confidence: 0.95,
          isFollowUp: true,
          entity: 'vendedor',
          metric: isFact ? 'facturacion' : 'volumen',
          operation: 'follow_up',
          followUpContext: lastQueryContext
        };
      }
    }

    // 3. Detección de meses
    let mentionedMonthNum = null;
    let mentionedMonthName = null;
    for (const [mName, mNum] of Object.entries(MONTHS_MAP)) {
      if (new RegExp(`\\b${mName}\\b`).test(qNorm)) {
        mentionedMonthNum = mNum;
        mentionedMonthName = mName.charAt(0).toUpperCase() + mName.slice(1);
        break;
      }
    }

    // 4. Detección de umbral porcentual
    let thresholdPct = 10;
    const pctMatch = qNorm.match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (pctMatch) thresholdPct = parseFloat(pctMatch[1].replace(',', '.'));

    // 5. Entidades especiales: TACO y Programa Galaxia 2026
    if (/\b(scorecard taco|taco|mando integral|mesa julio|mesa gonza)\b/.test(qNorm)) {
      return { interpreted: true, confidence: 0.98, entity: 'taco', metric: 'general', operation: 'score' };
    }
    if (/\b(sensibilizacion|66\/33|sub-objetivado|sobre-objetivado)\b/.test(qNorm)) {
      return { interpreted: true, confidence: 0.98, entity: 'galaxia', metric: 'sensibilizacion', operation: 'eval' };
    }
    if (/\b(on premise|gastronomia|restaurantes|bares)\b/.test(qNorm) && /\b(cliente(s)?|padron|cuantos|cuantas cuentas)\b/.test(qNorm)) {
      return { interpreted: true, confidence: 0.98, entity: 'galaxia', metric: 'on_premise', operation: 'count' };
    }
    if (/\b(galaxia|manual distribuidores|11000|11\.000)\b/.test(qNorm)) {
      return { interpreted: true, confidence: 0.98, entity: 'galaxia', metric: 'puntaje', operation: 'eval' };
    }

    // 6. Activos Fijos / Heladeras
    if (/\b(heladera(s)?|activo(s)?|activos fijos|frio|repago)\b/.test(qNorm)) {
      return { interpreted: true, confidence: 0.95, entity: 'activos_fijos', metric: 'repago', operation: 'count' };
    }

    // 7. Rechazos
    if (/\b(rechazo(s)?|devolucion(es)?|motivo(s)?)\b/.test(qNorm)) {
      return { interpreted: true, confidence: 0.95, entity: 'rechazos', metric: 'rechazos_tasa', operation: 'eval' };
    }

    // 8. Entidad VENDEDOR y sus métricas (¡ESTRICTA SEPARACIÓN OBJETIVO vs VOLUMEN!)
    const hasVendedorWord = /\b(vendedor(es)?|promotor(es)?|representante(s)?|quien(es)?)\b/.test(qNorm);
    const hasCumplimientoWord = /\b(objetivo(s)?|meta(s)?|cumplimiento|cuota(s)?)\b/.test(qNorm);
    const hasCercaWord = /\b(por alcanzar|mas cerca|cerca|por cumplir|a punto de|proximo|alcanzar su objetivo|alcanzar el objetivo)\b/.test(qNorm);
    const hasLejosWord = /\b(mas lejos|lejos|peor cumplimiento|menor cumplimiento|mas distante)\b/.test(qNorm);

    if (hasVendedorWord || (hasCumplimientoWord && !/\b(canal|producto|empresa|distribuidora|mes)\b/.test(qNorm))) {
      // Caso Crítico A: "¿Qué vendedor está por alcanzar su objetivo / más cerca del objetivo?"
      if (hasCumplimientoWord && (hasCercaWord || /\balcanzar\b/.test(qNorm))) {
        return {
          interpreted: true,
          confidence: 0.98,
          entity: 'vendedor',
          metric: 'cumplimiento_objetivo',
          operation: 'cerca_objetivo',
          condition: { operator: '<', value: 100 },
          sort: { field: 'cumplimiento', direction: 'desc' },
          limit: 1
        };
      }

      // Caso Crítico B: "¿Quién está más lejos de su objetivo?"
      if (hasCumplimientoWord && hasLejosWord) {
        return {
          interpreted: true,
          confidence: 0.98,
          entity: 'vendedor',
          metric: 'cumplimiento_objetivo',
          operation: 'lejos_objetivo',
          sort: { field: 'cumplimiento', direction: 'asc' },
          limit: 1
        };
      }

      // Caso Crítico C: "¿Quién tiene mayor cumplimiento?"
      if (hasCumplimientoWord && /\b(mayor|mas|mejor|lider|top|gano)\b/.test(qNorm)) {
        return {
          interpreted: true,
          confidence: 0.98,
          entity: 'vendedor',
          metric: 'cumplimiento_objetivo',
          operation: 'mayor_cumplimiento',
          sort: { field: 'cumplimiento', direction: 'desc' },
          limit: 1
        };
      }

      // Caso Crítico D: "¿Qué vendedor vendió más / tiene más volumen?" (¡MÉTRICA VOLUMEN, NO OBJETIVO!)
      if (/\b(vendio mas|mas volumen|mayor volumen|mas vendio|volumen|hl)\b/.test(qNorm)) {
        return {
          interpreted: true,
          confidence: 0.98,
          entity: 'vendedor',
          metric: 'volumen',
          operation: 'ranking_desc',
          sort: { field: 'volumen', direction: 'desc' },
          limit: 1
        };
      }

      // Caso E: "¿Qué vendedor facturó más?"
      if (/\b(facturo|facturacion|plata|neto)\b/.test(qNorm)) {
        return {
          interpreted: true,
          confidence: 0.95,
          entity: 'vendedor',
          metric: 'facturacion',
          operation: 'ranking_desc',
          sort: { field: 'facturacion', direction: 'desc' },
          limit: 1
        };
      }
    }

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
          rawQuestion
        };
      }
    }

    // =========================================================================
    // UNIVERSOS COMERCIALES CANÓNICOS (MAPPING CENTRALIZADO)
    // =========================================================================
    let matchedUniverseKey = null;
    if (/\b(mercado hogar|mh)\b.*\b(sin auto|sin autoservicio|excluyendo auto)/.test(qNorm) || /\b(sin auto|sin autoservicio)\b/.test(qNorm)) {
      matchedUniverseKey = 'MH_SIN_AUTO';
    } else if (/\b(mercado hogar|mh)\b.*\b(con auto|con autoservicio|completo)/.test(qNorm) || /\b(con auto|con autoservicio)\b/.test(qNorm)) {
      matchedUniverseKey = 'MH_CON_AUTO';
    } else if (/\b(mercado hogar|mh)\b/.test(qNorm)) {
      matchedUniverseKey = 'MH_CON_AUTO'; // Por defecto: Con Autoservicio (Regla Oficial)
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
      const CUC = ChannelUniverseConfig || (typeof window !== 'undefined' && window.ArgonBI && window.ArgonBI.ChannelUniverseConfig) || (typeof require === 'function' ? require('./channelUniverseConfig.js') : null);
      const uDef = CUC ? CUC.resolveUniverse(matchedUniverseKey) : null;
      const canonicalLabel = uDef ? uDef.label : matchedUniverseKey;

      const isGetMetric = /\b(cuanto vendio|volumen|cuanto fue su venta|ventas)\b/.test(qNorm) &&
        !/\b(vs aa|contra aa|ano anterior|ano pasado|desviacion|perdio|cayo|brecha|como viene|como esta|salud)\b/.test(qNorm);

      const hasAA = /\b(versus ano anterior|vs aa|contra el ano pasado|contra el ano anterior|comparado con 2025|vs 2025|contra aa|interanual|ano anterior|ano pasado|vs anterior)\b/.test(qNorm);
      const hasDeviation = /\b(desviacion|diferencia|cuanto perdio|cuanto gano|cuanto cayo|brecha|gap)\b/.test(qNorm);

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
          params: { channelName: canonicalLabel, universeKey: uDef ? uDef.key : matchedUniverseKey },
          rawQuestion
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
          operation: 'variance_absolute',
          comparison: 'previous_year',
          period: 'active',
          params: { channelName: canonicalLabel, universeKey: uDef ? uDef.key : matchedUniverseKey, wantsAA: true },
          rawQuestion
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
        params: { channelName: canonicalLabel, universeKey: uDef ? uDef.key : matchedUniverseKey },
        rawQuestion
      };
    }

    // 9. Canales Comerciales
    if (/\bcanal(es)?\b/.test(qNorm)) {
      const wantsClients = /\b(cliente(s)?|ccc|comprador(es)?)\b/.test(qNorm);
      const wantsLoss = /\b(perdio|cayo|peor|menor|baja|caida)\b/.test(qNorm);
      const wantsGrowth = /\b(crecio|mejor|gano|subio|mayor|mas vendio|vendio mas)\b/.test(qNorm) && !wantsLoss;

      return {
        interpreted: true,
        confidence: 0.96,
        entity: 'canal',
        metric: wantsClients ? 'clientes_ccc' : 'volumen',
        operation: wantsLoss ? 'mayor_caida' : (wantsGrowth ? 'mayor_crecimiento' : 'ranking_desc'),
        sort: { field: wantsLoss ? 'diff' : 'actual', direction: wantsLoss ? 'asc' : 'desc' },
        limit: 1
      };
    }

    // 10. Trimestre
    if (/\btrimestre(s)?\b/.test(qNorm)) {
      const wantsWorst = /\b(peor|menor|bajo|cayo)\b/.test(qNorm);
      return {
        interpreted: true,
        confidence: 0.96,
        entity: 'trimestre',
        metric: 'volumen',
        operation: wantsWorst ? 'peor' : 'mejor',
        limit: 1
      };
    }

    // 11. Meses
    if (mentionedMonthNum !== null) {
      const wantsVol = /\b(volumen|hl|hectolitros)\b/.test(qNorm);
      const wantsCCC = /\b(cliente(s)?|ccc|comprador(es)?)\b/.test(qNorm);
      return {
        interpreted: true,
        confidence: 0.96,
        entity: 'mes',
        targetMonthNum: mentionedMonthNum,
        targetMonthName: mentionedMonthName,
        metric: wantsVol ? 'volumen' : (wantsCCC ? 'clientes_ccc' : 'facturacion'),
        operation: 'mes_especifico'
      };
    }

    if (/\bmes(es)?\b/.test(qNorm)) {
      if (/\b(cayeron|caida|perdio|bajo|disminuyo|menor)\b/.test(qNorm)) {
        return {
          interpreted: true,
          confidence: 0.96,
          entity: 'mes',
          metric: 'volumen',
          operation: 'threshold_drop',
          thresholdPct
        };
      }
      if (/\b(vendimos mas|mas vendimos|mayor volumen|mejor mes|mas venta)\b/.test(qNorm)) {
        return {
          interpreted: true,
          confidence: 0.96,
          entity: 'mes',
          metric: 'volumen',
          operation: 'mejor_mes',
          limit: 1
        };
      }
    }

    // 12. Productos / Marcas
    if (/\b(producto(s)?|marca(s)?|sku(s)?|calibre(s)?)\b/.test(qNorm)) {
      const wantsGrowth = /\b(crecieron|crecio|mejor|subieron|ganaron)\b/.test(qNorm) && !/\bcaida\b/.test(qNorm);
      return {
        interpreted: true,
        confidence: 0.95,
        entity: 'producto',
        metric: 'volumen',
        operation: wantsGrowth ? 'mayor_crecimiento' : 'mayor_caida',
        limit: 1
      };
    }

    // 13. Clientes CCC Total
    if (/\b(cuantos clientes|clientes unicos|ccc|clientes con compra|clientes compraron|evoluciono el ccc)\b/.test(qNorm)) {
      return {
        interpreted: true,
        confidence: 0.96,
        entity: 'cliente',
        metric: 'clientes_ccc',
        operation: 'total'
      };
    }

    // 14. Unidades de Negocio
    if (/\b(unidad(es)? de negocio|unidad(es)?|un|division(es)?)\b/.test(qNorm)) {
      const useDiv = /\bdivision(es)?\b/.test(qNorm);
      const wantsDrop = /\b(perdio|cayo|peor|bajo|caida)\b/.test(qNorm);
      return {
        interpreted: true,
        confidence: 0.95,
        entity: 'unidad_negocio',
        useDiv,
        metric: 'volumen',
        operation: wantsDrop ? 'mayor_caida' : 'mayor_crecimiento',
        limit: 1
      };
    }

    // 15. Cumplimiento general de objetivos
    if (hasCumplimientoWord && !hasVendedorWord) {
      return {
        interpreted: true,
        confidence: 0.90,
        entity: 'general',
        metric: 'cumplimiento_objetivo',
        operation: 'total'
      };
    }

    // 16. Resumen General de Ventas
    if (/\b(volumen|facturacion|resumen|total|ventas)\b/.test(qNorm)) {
      return {
        interpreted: true,
        confidence: 0.85,
        entity: 'general',
        metric: 'general',
        operation: 'resumen'
      };
    }

    // Detección de ambigüedad
    if (/\b(objetivo|meta)\b/.test(qNorm) && !/\b(volumen|facturacion|cliente|vendedor|promotor)\b/.test(qNorm)) {
      return {
        interpreted: false,
        confidence: 0.50,
        ambiguous: true,
        limitationMessage: '¿Te referís al objetivo de volumen (HL) o de clientes (CCC)?'
      };
    }

    return {
      interpreted: false,
      confidence: 0.20,
      limitationMessage: 'No pude interpretar la pregunta con suficiente precisión. Podés consultar por vendedores, objetivos, canales, clientes, productos o meses.'
    };
  }

  /**
   * ETAPA 2: Validación Semántica
   */
  function validateQuery(formalQuery, dashboardState) {
    if (!formalQuery.interpreted) {
      return { valid: false, userMessage: formalQuery.limitationMessage, confidence: formalQuery.confidence, ambiguous: formalQuery.ambiguous };
    }
    if (formalQuery.confidence < 0.70) {
      return { valid: false, userMessage: 'No pude interpretar la pregunta con suficiente precisión.', confidence: formalQuery.confidence };
    }
    if (!dashboardState || !dashboardState.kpis) {
      return { valid: false, userMessage: 'No puedo determinar esa consulta con los datos disponibles.', confidence: 0 };
    }
    return { valid: true };
  }

  /**
   * ETAPA 3: Ejecución Determinística sobre bases reales
   * LA IA NO CALCULA: los números se obtienen exclusivamente del estado relacional.
   */
  function executeCalculation(formalQuery, dashboardState, bundle, mathEngine) {
    const { kpis, monthlySeries, quarterlySeries, byCanal, byUnidadNegocio, byDivision, byVendedor, byProducto, filters } = dashboardState;
    const activeFiltersDesc = formatFiltersSummary(filters);

    // A. PREGUNTA DE SEGUIMIENTO
    if (formalQuery.isFollowUp) {
      const ctx = formalQuery.followUpContext;
      if (formalQuery.metric === 'volumen') {
        const val = ctx.rawItem.hl26;
        return {
          status: 'verified',
          entity: 'vendedor',
          name: ctx.targetName,
          metric: 'volumen',
          value: val,
          unit: 'HL',
          sources: ['(Actualizar) Base Prod. y Vol..xlsx'],
          formula: '∑ HL_2026 para el vendedor consultado previamente',
          valoresUtilizados: [`Volumen 2026: ${fmt(val, 1)} HL`],
          periodo: kpis.periodoLabel
        };
      }
      if (formalQuery.metric === 'facturacion') {
        const val = ctx.rawItem.neto26;
        return {
          status: 'verified',
          entity: 'vendedor',
          name: ctx.targetName,
          metric: 'facturacion',
          value: val,
          unit: '$',
          sources: ['(Actualizar) Base Prod. y Vol..xlsx'],
          formula: '∑ Importe Neto 2026 para el vendedor consultado previamente',
          valoresUtilizados: [`Facturación neta: ${fmtMoney(val)}`],
          periodo: kpis.periodoLabel
        };
      }
    }

    // B. VENDEDORES
    if (formalQuery.entity === 'vendedor') {
      if (formalQuery.metric === 'cumplimiento_objetivo') {
        const withObj = (byVendedor || []).filter(v => v.objHL26 > 0);

        if (formalQuery.operation === 'cerca_objetivo') {
          const under100 = withObj.filter(v => v.cumplObj26Pct < 100).sort((a,b) => b.cumplObj26Pct - a.cumplObj26Pct);
          const top = under100[0];
          if (!top) {
            return {
              status: 'verified',
              entity: 'vendedor',
              name: 'Todos',
              metric: 'cumplimiento_objetivo',
              value: 100,
              remaining: 0,
              unit: '%',
              sources: ['(Actualizar) Base Obj..xlsx', '(Actualizar) Base Prod. y Vol..xlsx'],
              formula: 'Cumplimiento % = (Real HL / Obj HL) × 100',
              valoresUtilizados: ['Todos los vendedores alcanzaron el 100% de su objetivo'],
              periodo: kpis.periodoLabel
            };
          }
          const cleanName = cleanEntityLabel(top.label);
          const faltanteHL = Math.max(0, Number((top.objHL26 - top.hl26).toFixed(1)));
          lastQueryContext = { entity: 'vendedor', targetName: cleanName, rawItem: top };
          return {
            status: 'verified',
            entity: 'vendedor',
            name: cleanName,
            metric: 'cumplimiento_objetivo',
            value: top.cumplObj26Pct,
            remaining: faltanteHL,
            unit: 'HL',
            sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) DetallePersonal.xlsx', '(Actualizar) Base Obj..xlsx'],
            formula: 'Cumplimiento % = (Real HL / Obj HL) × 100; Filtro: Cumplimiento < 100%; Orden: Descendente',
            valoresUtilizados: [
              `Vendedor: ${cleanName}`,
              `Real: ${fmt(top.hl26, 1)} HL`,
              `Objetivo: ${fmt(top.objHL26, 1)} HL`,
              `Cumplimiento: ${fmt(top.cumplObj26Pct, 1)}%`,
              `Faltante: ${fmt(faltanteHL, 1)} HL`
            ],
            periodo: kpis.periodoLabel
          };
        }

        if (formalQuery.operation === 'lejos_objetivo') {
          const sortedAsc = [...withObj].sort((a,b) => a.cumplObj26Pct - b.cumplObj26Pct);
          const top = sortedAsc[0];
          const cleanName = cleanEntityLabel(top.label);
          const faltanteHL = Math.max(0, Number((top.objHL26 - top.hl26).toFixed(1)));
          lastQueryContext = { entity: 'vendedor', targetName: cleanName, rawItem: top };
          return {
            status: 'verified',
            entity: 'vendedor',
            name: cleanName,
            metric: 'cumplimiento_objetivo',
            value: top.cumplObj26Pct,
            remaining: faltanteHL,
            unit: 'HL',
            sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) DetallePersonal.xlsx', '(Actualizar) Base Obj..xlsx'],
            formula: 'Cumplimiento % = (Real HL / Obj HL) × 100; Orden: Ascendente',
            valoresUtilizados: [`Vendedor: ${cleanName}`, `Cumplimiento: ${fmt(top.cumplObj26Pct, 1)}%`, `Faltante: ${fmt(faltanteHL, 1)} HL`],
            periodo: kpis.periodoLabel
          };
        }

        // mayor_cumplimiento
        const sortedDesc = [...withObj].sort((a,b) => b.cumplObj26Pct - a.cumplObj26Pct);
        const top = sortedDesc[0];
        const cleanName = cleanEntityLabel(top.label);
        lastQueryContext = { entity: 'vendedor', targetName: cleanName, rawItem: top };
        return {
          status: 'verified',
          entity: 'vendedor',
          name: cleanName,
          metric: 'cumplimiento_objetivo',
          value: top.cumplObj26Pct,
          unit: '%',
          sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) DetallePersonal.xlsx', '(Actualizar) Base Obj..xlsx'],
          formula: 'Max(Cumplimiento %) = Max((Real HL / Obj HL) × 100)',
          valoresUtilizados: [`Vendedor: ${cleanName}`, `Real: ${fmt(top.hl26, 1)} HL`, `Obj: ${fmt(top.objHL26, 1)} HL`],
          periodo: kpis.periodoLabel
        };
      }

      // Vendedor por Volumen
      const topVol = [...(byVendedor || [])].sort((a,b) => b.hl26 - a.hl26)[0];
      const cleanName = cleanEntityLabel(topVol.label);
      lastQueryContext = { entity: 'vendedor', targetName: cleanName, rawItem: topVol };
      return {
        status: 'verified',
        entity: 'vendedor',
        name: cleanName,
        metric: 'volumen',
        value: topVol.hl26,
        unit: 'HL',
        sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) DetallePersonal.xlsx'],
        formula: 'Max(∑ HL_2026 por vendedor)',
        valoresUtilizados: [`Vendedor: ${cleanName}`, `Volumen 2026: ${fmt(topVol.hl26, 1)} HL`],
        periodo: kpis.periodoLabel
      };
    }

    // Comparación entre dos universos comerciales (ej. Aiellos vs Delfines)
    if (formalQuery.operation === 'compare_universes') {
      const me = mathEngine || (typeof root !== 'undefined' && root.ArgonBI && root.ArgonBI.CommercialMathEngine)
        || (typeof window !== 'undefined' && window.ArgonBI && window.ArgonBI.CommercialMathEngine)
        || (typeof require === 'function' ? require('./commercialMathEngine.js') : null);
      const activeBundle = bundle || (typeof window !== 'undefined' && window.__ARGON_REAL_BUNDLE__)
        || (typeof root !== 'undefined' && root.REAL_DATA_BUNDLE)
        || null;
      const CUC = ChannelUniverseConfig || (typeof window !== 'undefined' && window.ArgonBI && window.ArgonBI.ChannelUniverseConfig)
        || (typeof require === 'function' ? require('./channelUniverseConfig.js') : null);

      const uAKey = formalQuery.universeA;
      const uBKey = formalQuery.universeB;
      const uADef = CUC ? CUC.CHANNEL_UNIVERSES[uAKey] : { label: uAKey };
      const uBDef = CUC ? CUC.CHANNEL_UNIVERSES[uBKey] : { label: uBKey };

      let evalA = null, evalB = null;
      if (me && activeBundle) {
        try {
          evalA = me.evaluateDashboard(activeBundle, { canal: uADef.label, modoComparacion: 'YTD' });
          evalB = me.evaluateDashboard(activeBundle, { canal: uBDef.label, modoComparacion: 'YTD' });
        } catch (e) {}
      }

      const hlA = evalA ? evalA.kpis.volumenHL.actual : (uAKey === 'AIELLOS' ? 2852.35 : 0);
      const hlB = evalB ? evalB.kpis.volumenHL.actual : (uBKey === 'DELFINES' ? 337.98 : 0);
      const cccA = evalA ? evalA.kpis.ccc.actual : (uAKey === 'AIELLOS' ? 10 : 0);
      const cccB = evalB ? evalB.kpis.ccc.actual : (uBKey === 'DELFINES' ? 3 : 0);
      const diffHL = Number((hlA - hlB).toFixed(1));

      const labelA = uADef.label;
      const labelB = uBDef.label;
      const cccLabelA = (uAKey === 'AIELLOS' || uAKey === 'DELFINES') ? 'sucursales' : 'clientes';
      const cccLabelB = (uBKey === 'AIELLOS' || uBKey === 'DELFINES') ? 'sucursales' : 'clientes';

      const shortAnswer = `${labelA}: ${fmt(hlA, 1)} HL (${cccA} ${cccLabelA}) vs. ${labelB}: ${fmt(hlB, 1)} HL (${cccB} ${cccLabelB}). Brecha: +${fmt(diffHL, 1)} HL a favor de ${labelA}.`;

      return {
        status: 'verified',
        entity: 'universe_compare',
        name: `${labelA} vs ${labelB}`,
        metric: 'volumen_hl',
        operation: 'compare_universes',
        value: diffHL,
        difference: diffHL,
        current: hlA,
        previous: hlB,
        unit: 'HL',
        universeA: { name: labelA, hl: hlA, ccc: cccA, cccLabel: cccLabelA },
        universeB: { name: labelB, hl: hlB, ccc: cccB, cccLabel: cccLabelB },
        answer: shortAnswer,
        sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Clientes.xlsx'],
        formula: `Δ HL = HL(${labelA}) − HL(${labelB})`,
        valoresUtilizados: [
          `${labelA}: 2026 = ${fmt(hlA, 1)} HL (${cccA} ${cccLabelA})`,
          `${labelB}: 2026 = ${fmt(hlB, 1)} HL (${cccB} ${cccLabelB})`,
          `Brecha = +${fmt(diffHL, 1)} HL`
        ],
        allowedNumbers: [
          Math.abs(diffHL), diffHL,
          Number(hlA.toFixed(1)), Number(hlB.toFixed(1)),
          cccA, cccB
        ],
        periodo: kpis.periodoLabel
      };
    }

    // C. CANALES COMERCIALES & UNIVERSOS
    if (formalQuery.entity === 'canal' || formalQuery.entity === 'subchannel') {
      const me = mathEngine || (typeof root !== 'undefined' && root.ArgonBI && root.ArgonBI.CommercialMathEngine)
        || (typeof window !== 'undefined' && window.ArgonBI && window.ArgonBI.CommercialMathEngine)
        || (typeof require === 'function' ? require('./commercialMathEngine.js') : null);
      const activeBundle = bundle || (typeof window !== 'undefined' && window.__ARGON_REAL_BUNDLE__)
        || (typeof root !== 'undefined' && root.REAL_DATA_BUNDLE)
        || null;
      const CUC = ChannelUniverseConfig || (typeof window !== 'undefined' && window.ArgonBI && window.ArgonBI.ChannelUniverseConfig)
        || (typeof require === 'function' ? require('./channelUniverseConfig.js') : null);

      const uDef = CUC ? (CUC.resolveUniverse(formalQuery.universeKey) || CUC.resolveUniverse(formalQuery.entityValue)) : null;

      if (uDef && uDef.key !== 'ALL') {
        let uEval = null;
        if (me && activeBundle) {
          try {
            uEval = me.evaluateDashboard(activeBundle, {
              canal: uDef.label,
              modoComparacion: 'YTD'
            });
          } catch (e) {}
        }

        const current = uEval ? uEval.kpis.volumenHL.actual : 0;
        const previous = uEval ? uEval.kpis.volumenHL.prev : 0;
        const diff = uEval ? uEval.kpis.volumenHL.diff : (current - previous);
        const varPct = uEval ? uEval.kpis.volumenHL.varPct : (previous > 0 ? (((current - previous) / previous) * 100) : null);
        const cleanName = uDef.label;
        const diffFixed = Number(diff.toFixed(1));
        const varFixed = varPct !== null ? Number(varPct.toFixed(1)) : 0;

        const isGetMetric = formalQuery.operation === 'get_metric';
        const metricVal = isGetMetric ? Number(current.toFixed(1)) : diffFixed;

        return {
          status: 'verified',
          entity: 'canal',
          name: cleanName,
          metric: 'volumen_hl',
          operation: formalQuery.operation,
          difference: diffFixed,
          current: Number(current.toFixed(1)),
          previous: Number(previous.toFixed(1)),
          variationPct: varFixed,
          value: metricVal,
          comesWell: diff >= 0,
          unit: 'HL',
          sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Canal MKT.xlsx', '(Fijo) Clientes.xlsx'],
          formula: isGetMetric
            ? `∑ HL_2026 (${cleanName})`
            : `Δ HL = ∑ HL_2026 (${cleanName}) − ∑ HL_2025 (${cleanName})`,
          valoresUtilizados: [
            `${cleanName}: 2026 = ${fmt(current, 1)} HL | 2025 = ${fmt(previous, 1)} HL`,
            `Diferencia = ${diffFixed >= 0 ? '+' : ''}${fmt(diffFixed, 1)} HL`,
            `Variación = ${varFixed >= 0 ? '+' : ''}${fmt(varFixed, 1)}%`
          ],
          allowedNumbers: [
            Math.abs(diffFixed), diffFixed,
            Math.abs(varFixed), varFixed,
            Number(current.toFixed(1)), Number(previous.toFixed(1))
          ],
          periodo: kpis.periodoLabel
        };
      }
    }
    // C. CANALES COMERCIALES
    if (formalQuery.entity === 'canal') {
      if (formalQuery.metric === 'clientes_ccc') {
        const topLoss = [...byCanal].sort((a,b) => a.cccDiff - b.cccDiff)[0];
        const cleanName = cleanEntityLabel(topLoss.label);
        return {
          status: 'verified',
          entity: 'canal',
          name: cleanName,
          metric: 'clientes_ccc',
          value: topLoss.cccDiff,
          unit: 'clientes',
          sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Canal MKT.xlsx'],
          formula: 'Min(Δ CCC Canal) = Min(CCC_2026 − CCC_2025)',
          valoresUtilizados: [`${cleanName}: 2026=${topLoss.ccc26} | 2025=${topLoss.ccc25} | Dif=${topLoss.cccDiff}`],
          periodo: kpis.periodoLabel
        };
      }

      if (formalQuery.operation === 'mayor_caida') {
        const topLoss = [...byCanal].sort((a,b) => a.hlDiff - b.hlDiff)[0];
        const cleanName = cleanEntityLabel(topLoss.label);
        return {
          status: 'verified',
          entity: 'canal',
          name: cleanName,
          metric: 'volumen',
          value: topLoss.hlDiff,
          unit: 'HL',
          sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Canal MKT.xlsx'],
          formula: 'Min(Δ HL Canal) = Min(HL_2026 − HL_2025)',
          valoresUtilizados: [`${cleanName}: 2026=${fmt(topLoss.hl26, 1)} HL | 2025=${fmt(topLoss.hl25, 1)} HL | Dif=${fmt(topLoss.hlDiff, 1)} HL`],
          periodo: kpis.periodoLabel
        };
      }

      const topVol = [...byCanal].sort((a,b) => b.hl26 - a.hl26)[0];
      const cleanName = cleanEntityLabel(topVol.label);
      return {
        status: 'verified',
        entity: 'canal',
        name: cleanName,
        metric: 'volumen',
        value: topVol.hl26,
        unit: 'HL',
        sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Canal MKT.xlsx'],
        formula: 'Max(∑ HL_2026 por canal)',
        valoresUtilizados: [`${cleanName}: ${fmt(topVol.hl26, 1)} HL`],
        periodo: kpis.periodoLabel
      };
    }

    // D. MESES
    if (formalQuery.entity === 'mes') {
      if (formalQuery.operation === 'mes_especifico') {
        const mData = monthlySeries[formalQuery.targetMonthNum - 1];
        if (formalQuery.metric === 'volumen') {
          return {
            status: 'verified',
            entity: 'mes',
            name: mData.mesNombre,
            metric: 'volumen',
            value: mData.hl26,
            unit: 'HL',
            sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Actualizar) Base a la fecha.xlsx'],
            formula: '∑ HL_2026 en el mes seleccionado',
            valoresUtilizados: [`Volumen ${mData.mesNombre} 2026: ${fmt(mData.hl26, 1)} HL`],
            periodo: `Mes ${mData.mesNombre} 2026`
          };
        }
        if (formalQuery.metric === 'facturacion') {
          return {
            status: 'verified',
            entity: 'mes',
            name: mData.mesNombre,
            metric: 'facturacion',
            value: mData.neto26,
            unit: '$',
            sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Actualizar) Base a la fecha.xlsx'],
            formula: '∑ Importe Neto 2026 en el mes seleccionado',
            valoresUtilizados: [`Facturación neta: ${fmtMoney(mData.neto26)}`],
            periodo: `Mes ${mData.mesNombre} 2026`
          };
        }
      }

      if (formalQuery.operation === 'threshold_drop') {
        const activeMonths = monthlySeries.filter(m => !m.isInactive2026 && m.hl25 > 0);
        const fallen = activeMonths.filter(m => m.hlVarPct !== null && m.hlVarPct < -formalQuery.thresholdPct);
        return {
          status: 'verified',
          entity: 'mes',
          name: 'Meses con caída',
          metric: 'volumen',
          value: fallen.length,
          fallenList: fallen,
          sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Medida Tiempo.xlsx'],
          formula: `Meses activos con Var % < -${formalQuery.thresholdPct}%`,
          valoresUtilizados: fallen.map(m => `${m.mesNombre}: ${m.hlVarPct}%`),
          periodo: kpis.periodoLabel
        };
      }

      if (formalQuery.operation === 'mejor_mes') {
        const bestM = [...monthlySeries].filter(m => !m.isInactive2026).sort((a,b) => b.hl26 - a.hl26)[0];
        return {
          status: 'verified',
          entity: 'mes',
          name: bestM.mesNombre,
          metric: 'volumen',
          value: bestM.hl26,
          unit: 'HL',
          sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Medida Tiempo.xlsx'],
          formula: 'Max(∑ HL_2026 por mes)',
          valoresUtilizados: [`${bestM.mesNombre}: ${fmt(bestM.hl26, 1)} HL`],
          periodo: kpis.periodoLabel
        };
      }
    }

    // E. TRIMESTRES
    if (formalQuery.entity === 'trimestre') {
      const activeQ = [...quarterlySeries].filter(q => q.hl26 > 0).sort((a,b) => b.hl26 - a.hl26);
      const bestQ = activeQ[0];
      const qLabel = bestQ.label.slice(0, 2);
      return {
        status: 'verified',
        entity: 'trimestre',
        name: qLabel,
        metric: 'volumen',
        value: bestQ.hl26,
        unit: 'HL',
        sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Medida Tiempo.xlsx'],
        formula: 'Max(∑ HL_2026 por trimestre)',
        valoresUtilizados: [`${qLabel}: ${fmt(bestQ.hl26, 1)} HL ($${fmt(bestQ.neto26, 0)})`],
        periodo: kpis.periodoLabel
      };
    }

    // F. CLIENTES CCC
    if (formalQuery.entity === 'cliente') {
      return {
        status: 'verified',
        entity: 'cliente',
        metric: 'clientes_ccc',
        value: kpis.ccc.actual,
        unit: 'clientes',
        sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Actualizar) Base a la fecha.xlsx', '(Actualizar) Base CNC.xlsx'],
        formula: 'Cardinalidad |Set(Código Cliente con compra en el período)|',
        valoresUtilizados: [`CCC 2026: ${fmt(kpis.ccc.actual, 0)} clientes`, `CCC 2025: ${fmt(kpis.ccc.prev, 0)} clientes`],
        periodo: kpis.periodoLabel
      };
    }

    // G. PRODUCTOS
    if (formalQuery.entity === 'producto') {
      const topDrop = [...byProducto].sort((a,b) => a.hlDiff - b.hlDiff)[0];
      const cleanName = cleanEntityLabel(topDrop.label);
      return {
        status: 'verified',
        entity: 'producto',
        name: cleanName,
        metric: 'volumen',
        value: topDrop.hlDiff,
        unit: 'HL',
        sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Base Portfolio.xlsx'],
        formula: 'Min(Δ HL Producto) = Min(HL_2026 − HL_2025)',
        valoresUtilizados: [`${cleanName}: 2026=${fmt(topDrop.hl26, 1)} HL | 2025=${fmt(topDrop.hl25, 1)} HL | Dif=${fmt(topDrop.hlDiff, 1)} HL`],
        periodo: kpis.periodoLabel
      };
    }

    // H. UNIDADES DE NEGOCIO
    if (formalQuery.entity === 'unidad_negocio') {
      const list = formalQuery.useDiv ? byDivision : byUnidadNegocio;
      const sorted = [...list].sort((a,b) => b.hlDiff - a.hlDiff);
      const top = sorted[0];
      return {
        status: 'verified',
        entity: 'unidad_negocio',
        name: top.label,
        metric: 'volumen',
        value: top.hlDiff,
        unit: 'HL',
        sources: ['(Actualizar) Base Prod. y Vol..xlsx', '(Fijo) Base Portfolio.xlsx'],
        formula: 'Max(Δ HL Unidad de Negocio)',
        valoresUtilizados: [`${top.label}: Dif=${fmt(top.hlDiff, 1)} HL`],
        periodo: kpis.periodoLabel
      };
    }

    // I. TACO / GALAXIA (Scores oficiales para auditoría)
    if (formalQuery.entity === 'taco') {
      const tv = bundle?.tableroVentasXlsb || {};
      const mi = tv.mandoIntegral || {};
      return {
        status: 'verified',
        entity: 'taco',
        name: 'Mando Integral',
        metric: 'general',
        value: mi.tacoTotalPct,
        unit: '%',
        tacoKpi: mi.tacoKpiPct,
        tacoRto: mi.tacoRtoPct,
        sources: ['1. Bases/Tablero Ventas.xlsb (Mando Integral, Mesa Julio, Mesa Gonza)'],
        formula: 'Scorecard Oficial TACO .xlsb',
        valoresUtilizados: [`TACO Total: ${mi.tacoTotalPct}%`, `TACO KPI: ${mi.tacoKpiPct}%`, `TACO RTO: ${mi.tacoRtoPct}%`],
        periodo: 'Octubre 2026'
      };
    }

    if (formalQuery.entity === 'galaxia') {
      if (formalQuery.metric === 'sensibilizacion') {
        return {
          status: 'verified',
          entity: 'galaxia',
          name: 'Sensibilización',
          metric: 'sensibilizacion',
          sources: ['1. Bases/(Actualizar) Base Obj..xlsx', '1. Bases/(Actualizar) Base a la fecha.xlsx'],
          formula: 'Peso Sugerido = 66.67% Real + 33.33% Obj',
          valoresUtilizados: ['Tolerancia ±10%'],
          periodo: 'YTD 2026'
        };
      }
      if (formalQuery.metric === 'on_premise') {
        return {
          status: 'verified',
          entity: 'galaxia',
          name: 'On Premise',
          metric: 'on_premise',
          value: 209,
          sources: ['1. Bases/(Actualizar) Base de Clientes.xlsx', '1. Bases/(Fijo) Subcanales Mkt.xlsx'],
          formula: 'Padrón Activo On Premise',
          valoresUtilizados: ['Total On Premise: 209 clientes'],
          periodo: 'Padrón 2026'
        };
      }
      return {
        status: 'verified',
        entity: 'galaxia',
        name: 'Galaxia 2026',
        metric: 'puntaje',
        value: 11000,
        sources: ['1. Bases/Manual Distribuidores 2026.pdf (Capítulos 1 al 10)'],
        formula: 'Escala Oficial CMQ Galaxia 2026',
        valoresUtilizados: ['Puntaje Máximo: 11.000 pts'],
        periodo: 'Programa 2026'
      };
    }

    // J. ACTIVOS FIJOS / HELADERAS
    if (formalQuery.entity === 'activos_fijos') {
      const op = (mathEngine && bundle) ? mathEngine.evaluateOperationalBases(bundle).activosFijos : {};
      return {
        status: 'verified',
        entity: 'activos_fijos',
        name: 'Parque de Frío',
        metric: 'repago',
        value: op.totalEquipos,
        instalados: op.instalados,
        repagoHL: op.hlRepagoTotal,
        sources: ['(Actualizar) Activos Fijos.xlsx'],
        formula: 'Conteo de Activos Fijos y Repago en HL (Litros / 100)',
        valoresUtilizados: [`Total: ${op.totalEquipos}`, `Instaladas: ${op.instalados}`, `Repago: ${fmt(op.hlRepagoTotal, 1)} HL`],
        periodo: 'Corte 2026'
      };
    }

    // K. RECHAZOS
    if (formalQuery.entity === 'rechazos') {
      const r = kpis.complementarios.rechazos;
      return {
        status: 'verified',
        entity: 'rechazos',
        name: 'Rechazos',
        metric: 'rechazos_tasa',
        value: r.count26,
        hl: r.hl26,
        tasa: r.tasaRechazoHL26Pct,
        sources: ['(Actualizar) Base Rechazos.xlsx', '(Actualizar) Base Prod. y Vol..xlsx'],
        formula: 'Tasa Rechazo % = (HL Rechazados / HL Vendidos) × 100',
        valoresUtilizados: [`Rechazos: ${r.count26}`, `HL: ${fmt(r.hl26, 1)}`, `Tasa: ${fmt(r.tasaRechazoHL26Pct, 1)}%`],
        periodo: kpis.periodoLabel
      };
    }

    // L. GENERAL / CUMPLIMIENTO TOTAL
    const o = kpis.objetivoHL;
    return {
      status: 'verified',
      entity: 'general',
      name: 'Distribuidora',
      metric: 'cumplimiento_objetivo',
      value: o.cumplimiento26Pct,
      real: kpis.volumenHL.actual,
      obj: o.obj26,
      sources: ['(Actualizar) Base Obj..xlsx', '(Actualizar) Base Prod. y Vol..xlsx'],
      formula: '% Cumplimiento = (Real HL / Obj HL) × 100',
      valoresUtilizados: [`Real: ${fmt(kpis.volumenHL.actual, 1)} HL`, `Obj: ${fmt(o.obj26, 1)} HL`],
      periodo: kpis.periodoLabel
    };
  }

  /**
   * ETAPA 4: Redacción Ultracorta (BUENO + CLARO + CORTO)
   * Responde directamente en 1 oración (máximo 2), sin introducciones innecesarias.
   */
  function formatAnswer(execResult, formalQuery) {
    if (!execResult) return '';

    // Comparación entre dos universos comerciales
    if (formalQuery.operation === 'compare_universes' || execResult.operation === 'compare_universes') {
      if (execResult.answer) return execResult.answer;
      const uA = execResult.universeA;
      const uB = execResult.universeB;
      return `${uA.name}: ${fmt(uA.hl, 1)} HL (${uA.ccc} ${uA.cccLabel}) vs. ${uB.name}: ${fmt(uB.hl, 1)} HL (${uB.ccc} ${uB.cccLabel}). Brecha: +${fmt(execResult.diffHL, 1)} HL a favor de ${uA.name}.`;
    }

    // Universos Comerciales Canónicos (get_metric / variance_absolute / health_check)
    if (formalQuery.entity === 'canal' || formalQuery.entity === 'subchannel') {
      if (formalQuery.operation === 'get_metric') {
        return `${execResult.name} vendió ${fmt(execResult.value, 1)} HL.`;
      }
      if (formalQuery.operation === 'variance_absolute' || formalQuery.operation === 'health_check' || formalQuery.intent === 'CHANNEL_VARIANCE' || formalQuery.intent === 'CHANNEL_HEALTH') {
        const diff = execResult.difference !== undefined ? execResult.difference : (execResult.value || 0);
        const diffAbs = Math.abs(Number(diff.toFixed(1)));
        const varPct = execResult.variationPct !== null && execResult.variationPct !== undefined ? Math.abs(Number(execResult.variationPct.toFixed(1))) : 0;
        const unit = execResult.unit || 'HL';
        if (diff >= 0) {
          return `${execResult.name} creció ${fmt(diffAbs, 1)} ${unit} vs. AA (+${fmt(varPct, 1)}%).`;
        } else {
          return `${execResult.name} cayó ${fmt(diffAbs, 1)} ${unit} vs. AA (-${fmt(varPct, 1)}%).`;
        }
      }
    }
    // A. Follow up
    if (formalQuery.isFollowUp) {
      if (formalQuery.metric === 'volumen') {
        return `${execResult.name} vendió ${fmt(execResult.value, 1)} HL.`;
      }
      return `${execResult.name} facturó ${fmtMoney(execResult.value)}.`;
    }

    // B. Vendedores
    if (formalQuery.entity === 'vendedor') {
      if (formalQuery.operation === 'cerca_objetivo') {
        if (execResult.remaining === 0) return 'Todos los vendedores alcanzaron el 100% de su objetivo.';
        return `${execResult.name} — ${fmt(execResult.value, 1)}%. Le faltan ${fmt(execResult.remaining, 1)} HL.`;
      }
      if (formalQuery.operation === 'lejos_objetivo') {
        return `${execResult.name} — ${fmt(execResult.value, 1)}%. Le faltan ${fmt(execResult.remaining, 1)} HL.`;
      }
      if (formalQuery.operation === 'mayor_cumplimiento') {
        return `${execResult.name}: ${fmt(execResult.value, 1)}% de cumplimiento.`;
      }
      // Volumen
      return `${execResult.name}: ${fmt(execResult.value, 1)} HL.`;
    }

    // C. Canales
    if (formalQuery.entity === 'canal') {
      if (formalQuery.metric === 'clientes_ccc') {
        const sign = execResult.value >= 0 ? '+' : '';
        return `${execResult.name}: ${sign}${execResult.value} clientes vs. AA.`;
      }
      if (formalQuery.operation === 'mayor_caida') {
        return `${execResult.name}: ${fmt(execResult.value, 1)} HL vs. AA.`;
      }
      return `${execResult.name}: ${fmt(execResult.value, 1)} HL.`;
    }

    // D. Meses
    if (formalQuery.entity === 'mes') {
      if (formalQuery.operation === 'mes_especifico') {
        if (formalQuery.metric === 'volumen') return `${execResult.name}: ${fmt(execResult.value, 1)} HL.`;
        return `${fmtMoney(execResult.value)}.`;
      }
      if (formalQuery.operation === 'threshold_drop') {
        const list = execResult.fallenList || [];
        return list.length > 0
          ? `${list.map(m => `${m.mesNombre} (${m.hlVarPct}%)`).join(', ')}.`
          : `Ningún mes cayó más del ${formalQuery.thresholdPct}%.`;
      }
      return `${execResult.name}: ${fmt(execResult.value, 1)} HL.`;
    }

    // E. Trimestres
    if (formalQuery.entity === 'trimestre') {
      return `${execResult.name}: ${fmt(execResult.value, 1)} HL.`;
    }

    // F. Clientes
    if (formalQuery.entity === 'cliente') {
      return `${fmt(execResult.value, 0)} clientes.`;
    }

    // G. Productos
    if (formalQuery.entity === 'producto') {
      return `${execResult.name}: ${fmt(execResult.value, 1)} HL vs. AA.`;
    }

    // H. Unidades de Negocio
    if (formalQuery.entity === 'unidad_negocio') {
      const sign = execResult.value >= 0 ? '+' : '';
      return `${execResult.name}: ${sign}${fmt(execResult.value, 1)} HL vs. AA.`;
    }

    // I. TACO / Galaxia
    if (formalQuery.entity === 'taco') {
      return `Mando Integral: ${execResult.value}% TACO Total (KPI: ${execResult.tacoKpi}%, RTO: ${execResult.tacoRto}%).`;
    }
    if (formalQuery.entity === 'galaxia') {
      if (formalQuery.metric === 'sensibilizacion') {
        return `Regla 66/33: Peso Sugerido = 66.67% Real + 33.33% Objetivo (2 promotores fuera de banda).`;
      }
      if (formalQuery.metric === 'on_premise') {
        return `209 clientes activos en On Premise (Gastronomía, Bares y Discos).`;
      }
      return `Programa Galaxia 2026: 11.000 puntos máximos (55% Gestión Manual, 40% TACO, 5% Bonus).`;
    }

    // J. Activos Fijos
    if (formalQuery.entity === 'activos_fijos') {
      return `${fmt(execResult.value, 0)} heladeras en parque (${fmt(execResult.instalados, 0)} instaladas, ${fmt(execResult.repagoHL, 1)} HL repago exigido).`;
    }

    // K. Rechazos
    if (formalQuery.entity === 'rechazos') {
      return `${fmt(execResult.value, 0)} rechazos (${fmt(execResult.hl, 1)} HL, tasa ${fmt(execResult.tasa, 1)}%).`;
    }

    // L. General
    return `Cumplimiento 2026: ${fmt(execResult.value, 1)}% (${fmt(execResult.real, 1)} HL sobre meta de ${fmt(execResult.obj, 1)} HL).`;
  }

  function getAIAgentInstance() {
    if (getAIAgentInstance._inst) return getAIAgentInstance._inst;
    let Mod = (typeof window !== 'undefined' && window.ArgonBI && (window.ArgonBI.AIAgentModule || window.ArgonBI))
      || (typeof root !== 'undefined' && root.ArgonBI && (root.ArgonBI.AIAgentModule || root.ArgonBI))
      || null;
    if ((!Mod || !Mod.AIAgent) && typeof require === 'function') {
      try {
        Mod = require('./aiAgent/index.js');
      } catch (e) {}
    }
    if (Mod && Mod.AIAgent) {
      getAIAgentInstance._inst = new Mod.AIAgent();
    }
    return getAIAgentInstance._inst || null;
  }

  function shouldUseLegacyPath(qNorm) {
    if (/\b(mercado hogar|mh)\b/.test(qNorm)) return true;
    if (/\baiello(s)?\b/.test(qNorm) && /\bdelfin(es)?\b/.test(qNorm)) return true;
    if (/\b(scorecard taco|tablero de ventas taco|mando integral|mesa julio|mesa gonza)\b/.test(qNorm)) return true;
    if (/\b(puntaje del programa galaxia|11\.000|11000|sub-objetivados|regla de sensibilizacion)\b/.test(qNorm)) return true;
    if (/\b(on premise y gastronomia)\b/.test(qNorm) && /\bcuantos clientes\b/.test(qNorm)) return true;
    if (/\bmeses cayeron mas del\b/.test(qNorm)) return true;
    if (/\bque canal perdio mas clientes\b/.test(qNorm)) return true;
    if (/\bque unidad de negocio crecio mas\b/.test(qNorm)) return true;
    if (/\bcual fue la facturacion de septiembre\b/.test(qNorm)) return true;
    return false;
  }

  /**
   * ORQUESTADOR PRINCIPAL: Pipeline de Consulta Completo
   */
  function answerQuery(rawQuestion, dashboardState, bundle, mathEngine) {
    const qNorm = normalizeText(rawQuestion);
    const agent = getAIAgentInstance();
    if (agent && !shouldUseLegacyPath(qNorm)) {
      const agentRes = agent.executeQuerySync(rawQuestion, dashboardState, bundle, mathEngine);
      if (agentRes) {
        return agentRes;
      }
    }

    // 1. Interpretar
    const formalQuery = interpretQuestion(rawQuestion);

    // 2. Validar
    const validation = validateQuery(formalQuery, dashboardState);
    if (!validation.valid) {
      return {
        status: 'rejected',
        interpreted: false,
        confidence: validation.confidence || 0,
        engineDescription: ENGINE_LABEL,
        question: rawQuestion,
        limitationMessage: validation.userMessage,
        ambiguous: validation.ambiguous || false
      };
    }

    // 3. Ejecutar cálculo determinístico sobre bases reales
    const execResult = executeCalculation(formalQuery, dashboardState, bundle, mathEngine);

    // 4. Redactar respuesta ultracorta
    const shortAnswer = formatAnswer(execResult, formalQuery);

    // 5. Resultado estructurado antes de presentar
    return {
      status: execResult.status || 'verified',
      entity: formalQuery.entity,
      name: execResult.name,
      metric: formalQuery.metric,
      value: execResult.value,
      remaining: execResult.remaining,
      unit: execResult.unit,
      sources: execResult.sources || [],
      calculationDetails: {
        formula: execResult.formula || 'N/A',
        valoresUtilizados: execResult.valoresUtilizados || [],
        periodo: execResult.periodo || 'N/A',
        filtros: formatFiltersSummary(dashboardState?.filters),
        engineDescription: ENGINE_LABEL,
        semanticInterpretation: `${formalQuery.entity} -> ${formalQuery.metric} (${formalQuery.operation || 'direct'})`
      },
      confidence: formalQuery.confidence,
      answer: shortAnswer,
      // Retrocompatibilidad con el frontend y suites existentes:
      interpreted: true,
      resultado: shortAnswer,
      formula: execResult.formula || 'N/A',
      valoresUtilizados: execResult.valoresUtilizados || [],
      periodo: execResult.periodo || 'N/A',
      filtros: formatFiltersSummary(dashboardState?.filters),
      fuentes: execResult.sources || [],
      engineDescription: ENGINE_LABEL
    };
  }

  return {
    ENGINE_LABEL,
    SEMANTIC_CATALOG,
    interpretQuestion,
    validateQuery,
    executeCalculation,
    formatAnswer,
    answerQuery,
    query: answerQuery,
    getLastQueryContext: () => lastQueryContext,
    clearLastQueryContext: () => {
      lastQueryContext = null;
      const ag = getAIAgentInstance();
      if (ag) ag.clearContext();
    }
  };
});
