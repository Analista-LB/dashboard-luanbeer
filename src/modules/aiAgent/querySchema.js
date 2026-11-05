(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ArgonBI = root.ArgonBI || {};
    root.ArgonBI.AIQuerySchema = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const INTENTS = {
    CONCEPTUAL_DEFINITION: 'conceptual_definition',
    GET_METRIC: 'get_metric',
    COMPARE_METRIC: 'compare_metric',
    COMPARE_ENTITIES: 'compare_entities',
    RANK_DIMENSION: 'rank_dimension',
    ANALYZE_DRIVERS: 'analyze_drivers',
    HEALTH_CHECK: 'health_check',
    CLIENT_CHURN: 'client_churn',
    PERIOD_PERFORMANCE: 'period_performance',
    EXECUTIVE_SUMMARY: 'executive_summary',
    CLARIFY_AMBIGUITY: 'clarify_ambiguity',
    UNVERIFIABLE_EXTERNAL: 'unverifiable_external',
    UNKNOWN: 'unknown'
  };

  const METRICS = {
    VOLUMEN_HL: 'volumen_hl',
    FACTURACION: 'facturacion',
    CLIENTES_CCC: 'clientes_ccc',
    CUMPLIMIENTO_OBJETIVO: 'cumplimiento_objetivo',
    PRECIO_PROMEDIO: 'precio_promedio',
    BULTOS: 'bultos',
    BONIFICACIONES: 'bonificaciones',
    RECHAZOS: 'rechazos',
    ACTIVOS_FIJOS: 'activos_fijos',
    CNC: 'cnc',
    DROP_SIZE: 'drop_size'
  };

  const DIMENSIONS = {
    GENERAL: 'general',
    CANAL: 'canal',
    UNIDAD_NEGOCIO: 'unidad_negocio',
    DIVISION: 'division',
    VENDEDOR: 'vendedor',
    SUPERVISOR: 'supervisor',
    PRODUCTO: 'producto',
    MARCA: 'marca',
    CLIENTE: 'cliente',
    MES: 'mes',
    TRIMESTRE: 'trimestre'
  };

  const COMPARISONS = {
    NONE: 'none',
    PREVIOUS_YEAR: 'previous_year',
    TARGET: 'target',
    PREVIOUS_MONTH: 'previous_month',
    ENTITY_VS_ENTITY: 'entity_vs_entity'
  };

  const PERIODS = {
    YTD: 'ytd',
    ACTIVE: 'active',
    MONTH_SPECIFIC: 'month_specific',
    QUARTER_SPECIFIC: 'quarter_specific',
    FULL_YEAR: 'full_year'
  };

  const CONCEPTUAL_GLOSSARY = {
    ytd: {
      id: 'ytd',
      title: 'YTD (Year To Date / Acumulado Año a la Fecha)',
      aliases: ['ytd', 'year to date', 'acumulado anual', 'acumulado a la fecha', 'año a la fecha', 'acumulado del año'],
      definition: 'YTD (Year To Date) es el acumulado comercial desde enero hasta el mes de corte del período actual, comparado homogéneamente contra los mismos meses del año anterior (AA).',
      contextType: 'ytd_summary'
    },
    ccc: {
      id: 'ccc',
      title: 'CCC (Clientes Con Compra)',
      aliases: ['ccc', 'clientes con compra', 'cobertura ccc', 'clientes compradores', 'clientes unicos con compra'],
      definition: 'CCC significa Clientes Con Compra: la cantidad de clientes únicos del padrón que registraron al menos una operación de compra efectiva (volumen > 0) en el período seleccionado.',
      contextType: 'ccc_summary'
    },
    aa: {
      id: 'aa',
      title: 'AA (Año Anterior)',
      aliases: ['aa', 'año anterior', 'ano anterior', 'interanual', 'yoy', 'year over year'],
      definition: 'AA significa Año Anterior: corresponde exactamente al mismo período (mes, trimestre o acumulado YTD) del ejercicio previo (2025 frente a 2026) para medir variaciones interanuales.',
      contextType: 'ytd_summary'
    },
    hl: {
      id: 'hl',
      title: 'HL (Hectolitros)',
      aliases: ['hl', 'hectolitro', 'hectolitros', 'unidad hl'],
      definition: 'HL significa Hectolitros (1 HL = 100 litros), la unidad estándar de volumen físico utilizada para consolidar todos los calibres y envases de bebidas.',
      contextType: 'ytd_summary'
    },
    bultos: {
      id: 'bultos',
      title: 'Bultos (Cajas / Packs)',
      aliases: ['bulto', 'bultos', 'cajones', 'packs fisicos'],
      definition: 'Los Bultos representan la cantidad de cajas, packs o unidades logísticas físicas facturadas antes de su conversión a hectolitros según la capacidad de cada SKU.',
      contextType: 'bultos_summary'
    },
    facturacion: {
      id: 'facturacion',
      title: 'Facturación Neta ($)',
      aliases: ['facturacion neta', 'venta neta', 'importe neto', 'que es facturacion', 'que es el neto'],
      definition: 'La Facturación Neta es el ingreso comercial en pesos ($) neto de impuestos y deducciones/bonificaciones comerciales.',
      contextType: 'facturacion_summary'
    },
    bonificaciones: {
      id: 'bonificaciones',
      title: 'Bonificaciones Comerciales',
      aliases: ['bonificacion', 'bonificaciones', 'descuentos comerciales'],
      definition: 'Las Bonificaciones representan la inversión comercial otorgada en descuentos de precio o mercadería bonificada sobre la venta bruta.',
      contextType: 'bonif_summary'
    },
    precio_promedio: {
      id: 'precio_promedio',
      title: 'Precio Promedio por HL ($/HL)',
      aliases: ['precio promedio', 'precio por hl', '$/hl', 'valor por hl'],
      definition: 'El Precio Promedio por HL ($/HL) se calcula dividiendo la Facturación Neta ($) por el Volumen total (HL), reflejando la realización de precio y el mix de productos.',
      contextType: 'precio_summary'
    },
    drop_size: {
      id: 'drop_size',
      title: 'Drop Size (HL por Cliente)',
      aliases: ['drop size', 'dropsize', 'volumen por cliente', 'hl por cliente', 'ticket promedio hl'],
      definition: 'El Drop Size es el volumen promedio adquirido por cada cliente comprador activo (Volumen HL / CCC), clave para distinguir si una variación responde a cobertura o a tamaño de pedido.',
      contextType: 'ccc_summary'
    },
    on_premise: {
      id: 'on_premise',
      title: 'On Premise / Refrigerados (REF)',
      aliases: ['on premise', 'on-premise', 'refrigerados', 'universo ref', 'que es ref'],
      definition: 'On Premise (Refrigerados / REF) es el universo de consumo en el punto de venta: agrupa Bares y Nocturno (REF Nocturno, Disco/Pub, KA Nocturno), Gastronómico (REF Gastronómico, Comida, KA Gastronómico), Entretenimiento y Bebida.',
      contextType: 'on_premise_summary'
    },
    mercado_hogar: {
      id: 'mercado_hogar',
      title: 'Mercado Hogar',
      aliases: ['mercado hogar', 'consumo hogareno', 'cercania y hogar'],
      definition: 'Mercado Hogar es el universo comercial de consumo doméstico y cercanía, integrado por los canales Tradicional (almacenes/despensas), Kioscos/Maxikioscos y Autoservicios.',
      contextType: 'mercado_hogar_summary'
    },
    cadenitas: {
      id: 'cadenitas',
      title: 'Cadenitas (Supermercados Regionales)',
      aliases: ['cadenitas', 'cadenas regionales', 'que son las cadenitas'],
      definition: 'Cadenitas es el canal de cadenas regionales de supermercados de San Luis, integrado por Supermercados Aiello (10 sucursales) y Supermercados Delfines (3 sucursales).',
      contextType: 'cadenitas_summary'
    },
    aiellos: {
      id: 'aiellos',
      title: 'Supermercados Aiello',
      aliases: ['que es aiello', 'que es aiellos', 'quien es aiello'],
      definition: 'Supermercados Aiello es la principal cadena regional dentro del canal Cadenitas en San Luis, operando con 10 sucursales activas.',
      contextType: 'cadenitas_summary'
    },
    delfines: {
      id: 'delfines',
      title: 'Supermercados Delfines',
      aliases: ['que es delfines', 'que es supermercados delfines'],
      definition: 'Supermercados Delfines es una cadena regional de supermercados integrante del canal Cadenitas, con 3 sucursales activas.',
      contextType: 'cadenitas_summary'
    },
    un: {
      id: 'un',
      title: 'UN (Unidad de Negocio / Unidad MKTP)',
      aliases: ['que es un', 'que significa un', 'unidad de negocio', 'unidades de negocio', 'unidad mktp'],
      definition: 'UN (Unidad de Negocio) es la clasificación del portafolio comercial en Cervezas (CERVEZAS), Gaseosas y No Alcohólicos (UNG), Aguas y Sodas (AGUAS), Vinos (VINO) y Marketplace/POP.',
      contextType: 'un_summary'
    },
    ung: {
      id: 'ung',
      title: 'UNG (Unidad de Negocio Gaseosas / No Alcohólicos)',
      aliases: ['que es ung', 'que significa ung', 'unidad de negocio gaseosas'],
      definition: 'UNG es la Unidad de Negocio de Gaseosas y Bebidas No Alcohólicas (línea Pepsi, 7Up, Mirinda, Paso de los Toros, H2Oh!, Gatorade y energizantes).',
      contextType: 'ung_summary'
    },
    objetivo: {
      id: 'objetivo',
      title: 'Objetivo Comercial y Cumplimiento (% Obj)',
      aliases: ['que es el objetivo', 'cumplimiento de objetivo', 'como se calcula el cumplimiento'],
      definition: 'El Objetivo es la meta de volumen (HL) fijada para el período; el Cumplimiento (% Obj) mide el porcentaje alcanzado mediante (Volumen Real / Objetivo) × 100.',
      contextType: 'objetivo_summary'
    },
    cnc: {
      id: 'cnc',
      title: 'CNC (Clientes No Compradores)',
      aliases: ['cnc', 'clientes no compradores', 'que es cnc', 'que significa cnc'],
      definition: 'CNC significa Clientes No Compradores: cuentas activas del padrón comercial que no registraron facturación ni volumen durante el período evaluado.',
      contextType: 'cnc_summary'
    },
    rechazos: {
      id: 'rechazos',
      title: 'Rechazos Logísticos',
      aliases: ['que son los rechazos', 'tasa de rechazo', 'que es rechazo'],
      definition: 'Los Rechazos miden los pedidos o bultos devueltos en la entrega logística y su incidencia porcentual sobre el volumen total comercializado.',
      contextType: 'rechazos_summary'
    },
    activos_fijos: {
      id: 'activos_fijos',
      title: 'Activos Fijos y Repago',
      aliases: ['activos fijos', 'repago de frio', 'comodato', 'que son activos fijos'],
      definition: 'Activos Fijos controla el parque de equipos de frío (heladeras y choperas) entregados en comodato y verifica si el cliente alcanza el volumen en HL exigido para su repago.',
      contextType: 'activos_summary'
    },
    taco: {
      id: 'taco',
      title: 'TACO (Tablero de Control Operativo)',
      aliases: ['que es taco', 'que significa taco', 'tablero taco'],
      definition: 'TACO es el Tablero de Control Operativo del dashboard, diseñado para el seguimiento diario y mensual de preventistas, supervisores, cobertura, efectividad de visita y objetivos.',
      contextType: 'ytd_summary'
    },
    mando_integral: {
      id: 'mando_integral',
      title: 'Mando Integral (CMI)',
      aliases: ['mando integral', 'cuadro de mando integral', 'que es cmi'],
      definition: 'El Mando Integral consolida los KPIs ejecutivos del negocio (Volumen HL, Facturación Neta, Cobertura CCC, Precio/HL y Cumplimiento de Objetivos) con su variación vs AA.',
      contextType: 'ytd_summary'
    },
    galaxia: {
      id: 'galaxia',
      title: 'Galaxia 2026',
      aliases: ['que es galaxia', 'programa galaxia', 'galaxia 2026'],
      definition: 'Galaxia 2026 es el programa de ejecución comercial y desarrollo de clientes por universo (On Premise y Mercado Hogar) con metas específicas de cobertura y palancas de crecimiento.',
      contextType: 'on_premise_summary'
    },
    sensibilizacion: {
      id: 'sensibilizacion',
      title: 'Sensibilización 66/33',
      aliases: ['sensibilizacion', '66/33', 'que es sensibilizacion'],
      definition: 'Sensibilización 66/33 es el modelo de proyección comercial del tablero para simular el cierre de volumen y cumplimiento ponderando la tendencia operativa.',
      contextType: 'objetivo_summary'
    },
    trimestres: {
      id: 'trimestres',
      title: 'Trimestres Comerciales (T1, T2, T3, T4)',
      aliases: ['que es un trimestre', 'trimestres del tablero', 'que es 1q', 'que es t1'],
      definition: 'Los trimestres agrupan el año comercial en bloques de 3 meses: T1/1Q (Ene–Mar), T2/2Q (Abr–Jun), T3/3Q (Jul–Sep) y T4/4Q (Oct–Dic).',
      contextType: 'quarter_summary'
    }
  };

  function createEmptyQuerySpec() {
    return {
      intent: INTENTS.UNKNOWN,
      metric: METRICS.VOLUMEN_HL,
      entity: DIMENSIONS.GENERAL,
      entityValue: null,
      canalFilter: null,
      dimension: null,
      period: PERIODS.YTD,
      monthNum: null,
      monthStr: null,
      monthName: null,
      quarter: null,
      comparison: COMPARISONS.NONE,
      direction: 'best', // 'best' | 'worst'
      limit: 1,
      subFilters: {},
      compareEntities: null, // { entityA, entityB }
      conceptId: null,
      confidence: 0,
      isFollowUp: false,
      ambiguityReason: null,
      externalCauseDetected: null,
      rawQuery: '',
      normalizedQuery: ''
    };
  }

  return {
    INTENTS,
    METRICS,
    DIMENSIONS,
    COMPARISONS,
    PERIODS,
    CONCEPTUAL_GLOSSARY,
    createEmptyQuerySpec
  };
});
