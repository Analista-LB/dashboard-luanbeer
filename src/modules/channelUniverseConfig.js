(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ArgonBI = root.ArgonBI || {};
    root.ArgonBI.ChannelUniverseConfig = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * CANONICAL COMMERCIAL CHANNEL UNIVERSES — LUANBEER BI
   * Single Source of Truth for all commercial channels across:
   *  - Filter selectors (index.html / app.js)
   *  - Commercial Math Engine (commercialMathEngine.js)
   *  - Natural Language Queries & AI Agent (nlqEngine.js / aiAgent)
   *  - Executive Reports and Dashboards
   */

  const CHANNEL_UNIVERSES = {
    ALL: {
      key: 'ALL',
      order: 0,
      label: 'Todos los Canales',
      description: 'Universo total de ventas sin filtrado por canal.',
      isUniverse: true,
      rawChannels: null, // null means all
      clientSetFilter: null,
      aliases: ['todos', 'todos los canales', 'total', 'global', 'toda la distribuidora']
    },
    ON_PREMISE: {
      key: 'ON_PREMISE',
      order: 1,
      label: 'On Premise',
      description: 'Locales de consumo en el lugar (Gastronomía, Bares, Discos, Entretenimiento y KA Refrigerados).',
      isUniverse: true,
      rawChannels: [
        'REF GASTRONOMICO',
        'REF NOCTURNO',
        'REF ENTRETENIMIENTO',
        'COMIDA',
        'BEBIDA',
        'Disco/Pub',
        'KA GASTRONOMICO',
        'KA NOCTURNO'
      ],
      prefixMatch: 'REF ',
      canalUnificado: 'Refrigerado',
      clientSetFilter: null,
      aliases: [
        'on premise',
        'onpremise',
        'on-premise',
        'refrigerado',
        'refrigerados',
        'gastronomia',
        'gastronomico',
        'bares y discos',
        'bares',
        'nocturno',
        'ref',
        'ref_all'
      ]
    },
    MAYORISTAS: {
      key: 'MAYORISTAS',
      order: 2,
      label: 'Mayoristas',
      description: 'Canal mayorista directo y distribuidores zonales.',
      isUniverse: true,
      rawChannels: ['Mayorista'],
      canalUnificado: 'Mayoristas',
      clientSetFilter: null,
      aliases: ['mayorista', 'mayoristas', 'canal mayorista']
    },
    MH_SIN_AUTO: {
      key: 'MH_SIN_AUTO',
      order: 3,
      label: 'Mercado Hogar — Sin Autoservicio',
      description: 'Mercado Hogar tradicional y cercanía excluyendo estrictamente Autoservicios.',
      isUniverse: true,
      rawChannels: ['Tradicional', 'Kioscos/Maxikioscos'],
      canalUnificado: 'Tradicional',
      clientSetFilter: null,
      aliases: [
        'mh sin auto',
        'mh sin autoservicio',
        'mercado hogar sin autoservicio',
        'mercado hogar sin auto',
        'mercado hogar sin autoservicios',
        'tradicional y kioscos',
        'kioscos y tradicional'
      ]
    },
    MH_CON_AUTO: {
      key: 'MH_CON_AUTO',
      order: 4,
      label: 'Mercado Hogar — Con Autoservicio',
      description: 'Mercado Hogar consolidado completo: Unión de MH Sin Auto + Autoservicio.',
      isUniverse: true,
      rawChannels: ['Tradicional', 'Kioscos/Maxikioscos', 'Autoservicio'],
      canalUnificado: null,
      clientSetFilter: null,
      aliases: [
        'mh con auto',
        'mh con autoservicio',
        'mercado hogar con autoservicio',
        'mercado hogar con auto',
        'mercado hogar con autoservicios',
        'mercado hogar completo',
        'mercado hogar',
        'mercado hogar all',
        'mercado_hogar_all',
        'todo mercado hogar'
      ]
    },
    AUTOSERVICIO: {
      key: 'AUTOSERVICIO',
      order: 5,
      label: 'Autoservicio',
      description: 'Autoservicios independientes y medianos para análisis individual detallado.',
      isUniverse: true,
      rawChannels: ['Autoservicio'],
      canalUnificado: 'Autoservicios',
      clientSetFilter: null,
      aliases: [
        'autoservicio',
        'autoservicios',
        'auto',
        'canal autoservicio',
        'canal autoservicios',
        'as'
      ]
    },
    PEOPLE_INSTITUCIONES: {
      key: 'PEOPLE_INSTITUCIONES',
      order: 6,
      label: 'Clie People + Instituciones',
      description: 'Personal de la empresa y clientes institucionales unificados.',
      isUniverse: true,
      rawChannels: ['Clie People', 'Clie Institucional', 'Instituciones'],
      canalUnificado: null,
      clientSetFilter: null,
      aliases: [
        'clie people + instituciones',
        'clie people instituciones',
        'people instituciones',
        'people + instituciones',
        'instituciones y personal',
        'personal e instituciones',
        'instituciones_all',
        'instituciones',
        'clie people',
        'clie institucional'
      ]
    },
    CADENITAS: {
      key: 'CADENITAS',
      order: 7,
      label: 'Cadenitas',
      description: 'Supermercados y cadenas comerciales regionales (CADENITAS SMK).',
      isUniverse: true,
      rawChannels: ['Supermercados'],
      canalUnificado: 'Supermercados',
      clientSetFilter: 'cadenitasCteSet',
      aliases: [
        'cadenitas',
        'todas las cadenitas',
        'cadenita',
        'cadenitas_all',
        'cadenitas all',
        'supermercados',
        'supermercados cadenitas',
        'smk'
      ]
    },
    AIELLOS: {
      key: 'AIELLOS',
      order: 8,
      label: 'Aiellos',
      description: 'Cadenita regional Supermercados Aiello (10 sucursales activas en San Luis).',
      isUniverse: true,
      rawChannels: null,
      canalUnificado: null,
      clientSetFilter: 'aielloCteSet',
      aliases: [
        'aiello',
        'aiellos',
        'supermercados aiello',
        'cadenitas aiello',
        'cadenitas_aiello',
        'cadenitas — supermercados aiello'
      ]
    },
    DELFINES: {
      key: 'DELFINES',
      order: 9,
      label: 'Delfines',
      description: 'Cadenita regional Supermercados Delfines (sucursales activas).',
      isUniverse: true,
      rawChannels: null,
      canalUnificado: null,
      clientSetFilter: 'delfinCteSet',
      aliases: [
        'delfin',
        'delfines',
        'supermercados delfin',
        'supermercados delfines',
        'cadenitas delfin',
        'cadenitas_delfin',
        'cadenitas — supermercados delfines'
      ]
    }
  };

  const ORDERED_KEYS = [
    'ALL',
    'ON_PREMISE',
    'MAYORISTAS',
    'MH_SIN_AUTO',
    'MH_CON_AUTO',
    'AUTOSERVICIO',
    'PEOPLE_INSTITUCIONES',
    'CADENITAS',
    'AIELLOS',
    'DELFINES'
  ];

  const ORDERED_OPTIONS = ORDERED_KEYS.map(k => ({
    key: k,
    value: CHANNEL_UNIVERSES[k].label, // Canonical label as value in selector
    canonicalKey: k,
    order: CHANNEL_UNIVERSES[k].order,
    label: CHANNEL_UNIVERSES[k].label
  }));

  // Helper normalizer
  function normalizeStr(s) {
    if (!s) return '';
    return String(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/—|–|-/g, ' ')
      .replace(/[^\w\s+]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Build fast alias lookup map
  const ALIAS_LOOKUP = new Map();
  for (const [key, u] of Object.entries(CHANNEL_UNIVERSES)) {
    ALIAS_LOOKUP.set(normalizeStr(key), u);
    ALIAS_LOOKUP.set(normalizeStr(u.label), u);
    for (const alias of u.aliases) {
      ALIAS_LOOKUP.set(normalizeStr(alias), u);
    }
  }

  // Legacy mappings for backward compatibility
  ALIAS_LOOKUP.set('ref_all', CHANNEL_UNIVERSES.ON_PREMISE);
  ALIAS_LOOKUP.set('mercado_hogar_all', CHANNEL_UNIVERSES.MH_CON_AUTO);
  ALIAS_LOOKUP.set('instituciones_all', CHANNEL_UNIVERSES.PEOPLE_INSTITUCIONES);
  ALIAS_LOOKUP.set('cadenitas_all', CHANNEL_UNIVERSES.CADENITAS);
  ALIAS_LOOKUP.set('cadenitas_aiello', CHANNEL_UNIVERSES.AIELLOS);
  ALIAS_LOOKUP.set('cadenitas_delfin', CHANNEL_UNIVERSES.DELFINES);

  /**
   * Resolves any input (key, canonical label, legacy key or user alias) to the canonical universe definition.
   * If not found, returns null.
   */
  function resolveUniverse(input) {
    if (!input || input === 'ALL' || input === 'Todos los Canales') return CHANNEL_UNIVERSES.ALL;
    const norm = normalizeStr(input);
    if (ALIAS_LOOKUP.has(norm)) {
      return ALIAS_LOOKUP.get(norm);
    }
    // Check direct key match uppercase
    const upper = String(input).toUpperCase().replace(/[\s—–-]+/g, '_');
    if (CHANNEL_UNIVERSES[upper]) return CHANNEL_UNIVERSES[upper];
    return null;
  }

  /**
   * Evaluates if a given transaction (rawCanal, cteCode) matches the specified universe.
   * @param {string|object} universeOrKey - Canonical key, label, alias or universe object
   * @param {string} rawCanal - Channel name from raw dictionary (e.g. 'Autoservicio', 'Tradicional')
   * @param {number|string} cteCode - Client code
   * @param {object} idx - Indexes from CommercialMathEngine (containing aielloCteSet, delfinCteSet, cadenitasCteSet)
   * @returns {boolean}
   */
  function matchesUniverse(universeOrKey, rawCanal, cteCode, idx) {
    const universe = typeof universeOrKey === 'object' && universeOrKey.key
      ? universeOrKey
      : resolveUniverse(universeOrKey);

    if (!universe || universe.key === 'ALL') return true;

    // Specific Client Set Filters (Aiellos, Delfines)
    if (universe.key === 'AIELLOS') {
      return Boolean(cteCode && idx && idx.aielloCteSet && idx.aielloCteSet.has(Number(cteCode)));
    }
    if (universe.key === 'DELFINES') {
      return Boolean(cteCode && idx && idx.delfinCteSet && idx.delfinCteSet.has(Number(cteCode)));
    }

    // Cadenitas
    if (universe.key === 'CADENITAS') {
      if (rawCanal === 'Supermercados') return true;
      if (cteCode && idx && idx.cadenitasCteSet && idx.cadenitasCteSet.has(Number(cteCode))) return true;
      return false;
    }

    // Raw Channels Set match
    if (universe.rawChannels && universe.rawChannels.length > 0) {
      if (universe.rawChannels.includes(rawCanal)) return true;
      if (universe.prefixMatch && rawCanal && rawCanal.startsWith(universe.prefixMatch)) return true;
      return false;
    }

    return false;
  }

  return {
    CHANNEL_UNIVERSES,
    CANAL_UNIVERSOS: CHANNEL_UNIVERSES, // Alias in Spanish
    ORDERED_KEYS,
    ORDERED_OPTIONS,
    normalizeStr,
    resolveUniverse,
    matchesUniverse
  };
});
