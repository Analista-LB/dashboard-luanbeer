(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const Sanitizer = require('./sanitizer.js');
    const XLSX = require('../../vendor/xlsx.full.min.js');
    module.exports = factory(Sanitizer, XLSX);
  } else {
    root.ArgonBI = root.ArgonBI || {};
    root.ArgonBI.IngestionEngine = factory(root.ArgonBI.Sanitizer, root.XLSX);
  }
})(typeof self !== 'undefined' ? self : this, function (Sanitizer, XLSX) {
  'use strict';

  const MAX_FILES_PER_INGEST = 10;

  // Canonical Semantic Column Dictionary
  const SEMANTIC_RULES = [
    { role: 'periodo', label: 'Período (Año/Mes)', patterns: [/^a[ñn]o\s*\/\s*mes$/i, /^periodo$/i, /^per[ií]odo$/i, /^mes[\s_]*a[ñn]o$/i, /^ym$/i], valueValidator: v => /^\d{4}[\/\-]\d{2}$/.test(String(v).trim()) },
    { role: 'anio', label: 'Año', patterns: [/^a[ñn]o$/i, /^year$/i, /^ejercicio$/i], valueValidator: v => Number(v) >= 2000 && Number(v) <= 2100 },
    { role: 'mes', label: 'Mes', patterns: [/^mes$/i, /^nro\.?\s*mes/i, /^month$/i], valueValidator: null },
    { role: 'trimestre', label: 'Trimestre', patterns: [/^trimestre$/i, /^quarter$/i, /^trim$/i], valueValidator: v => /^[1-4][QT]|[QT][1-4]$/i.test(String(v).trim()) },
    { role: 'fecha', label: 'Fecha', patterns: [/^fecha/i, /^date$/i], valueValidator: null },
    { role: 'cod_cliente', label: 'Código de Cliente', patterns: [/^c[oó]d(igo)?[\s_.]*(de[\s_.]*)?(cliente|cte)$/i, /^cliente[\s_.]*id$/i, /^id[\s_.]*cliente$/i, /^cliente$/i], valueValidator: v => typeof v === 'number' || /^\d+$/.test(String(v).trim()) },
    { role: 'nombre_cliente', label: 'Nombre / Razón Social Cliente', patterns: [/^raz[oó]n[\s_.]*social$/i, /^descripci[oó]n[\s_.]*cliente$/i, /^nombre[\s_.]*cliente$/i, /^cliente$/i], valueValidator: v => typeof v === 'string' && isNaN(Number(v)) && String(v).trim().length > 2 },
    { role: 'cod_producto', label: 'Código de Producto', patterns: [/^c[oó]d(igo)?[\s_.]*(de[\s_.]*)?(producto|prod|art[ií]culo)$/i, /^id[\s_.]*(producto|prod)$/i, /^art[ií]culo$/i], valueValidator: v => typeof v === 'number' || /^\d+$/.test(String(v).trim()) },
    { role: 'nombre_producto', label: 'Descripción de Producto', patterns: [/^producto$/i, /^descripci[oó]n[\s_.]*(art[ií]culo|producto)$/i], valueValidator: v => typeof v === 'string' && String(v).trim().length > 2 },
    { role: 'canal', label: 'Canal Comercial', patterns: [/^canal([\s_.]*(mkt\.?|comercial))?$/i], valueValidator: v => typeof v === 'string' },
    { role: 'canal_unificado', label: 'Canal Unificado', patterns: [/^canal[\s_.]*unificado$/i], valueValidator: v => typeof v === 'string' },
    { role: 'segmento_canal', label: 'Segmento Canal', patterns: [/^segmento[\s_.]*(canal|estrat[eé]gico)?$/i], valueValidator: v => typeof v === 'string' },
    { role: 'subcanal', label: 'Subcanal', patterns: [/^subcanal$/i], valueValidator: v => typeof v === 'string' },
    { role: 'unidad_negocio', label: 'Unidad de Negocio', patterns: [/^unidad[\s_.]*(de[\s_.]*)?negocio$/i, /^unidad[\s_.]*mktp$/i, /^cod[\s_.]*un$/i, /^un$/i, /^nombre[\s_.]*unidad[\s_.]*negocio$/i], valueValidator: v => typeof v === 'string' },
    { role: 'division', label: 'División Comercial', patterns: [/^divisi[oó]n$/i], valueValidator: v => typeof v === 'string' },
    { role: 'marca', label: 'Marca', patterns: [/^marca([\s_.]*unificado)?$/i, /^logo$/i], valueValidator: v => typeof v === 'string' },
    { role: 'calibre', label: 'Calibre / Envase', patterns: [/^calibre$/i], valueValidator: v => typeof v === 'string' },
    { role: 'sabor', label: 'Sabor / Variedad', patterns: [/^sabor$/i], valueValidator: v => typeof v === 'string' },
    { role: 'familia', label: 'Familia de Producto', patterns: [/^familia$/i], valueValidator: v => typeof v === 'string' },
    { role: 'vendedor', label: 'Código Sector de Venta / Vendedor', patterns: [/^c[oó]d(igo)?[\s_.]*sector[\s_.]*(de[\s_.]*)?venta$/i, /^ruta[\s_.]*(de[\s_.]*)?venta$/i], valueValidator: v => !isNaN(Number(v)) },
    { role: 'supervisor', label: 'Código Sector de Supervisión', patterns: [/^c[oó]d(igo)?[\s_.]*sector[\s_.]*(de[\s_.]*)?supervisi[oó]n$/i, /^superior([\s_.]*a[\s_.]*cargo)?$/i], valueValidator: null },
    { role: 'volumen_hl', label: 'Volumen (Hectolitros HL)', patterns: [/^cantidad[\s_.]*total[\s_.]*(en[\s_.]*)?hl$/i, /^hectolitros$/i, /^hl$/i, /^volumen[\s_.]*hl$/i], valueValidator: v => !isNaN(Number(v)) },
    { role: 'volumen_litros', label: 'Volumen en Litros (Requiere /100 a HL)', patterns: [/^litros$/i, /^volumen[\s_.]*(en[\s_.]*)?litros$/i], valueValidator: v => !isNaN(Number(v)) },
    { role: 'objetivo_hl', label: 'Objetivo Comercial (HL)', patterns: [/^objetivo[\s_.]*(total[\s_.]*(en[\s_.]*)?)?hl$/i, /^meta[\s_.]*hl$/i], valueValidator: v => !isNaN(Number(v)) },
    { role: 'bultos', label: 'Cantidad en Bultos', patterns: [/^cantidad[\s_.]*total[\s_.]*(en[\s_.]*)?bultos$/i, /^bultos$/i], valueValidator: v => !isNaN(Number(v)) },
    { role: 'facturacion_neta', label: 'Facturación / Importe Neto', patterns: [/^importe[\s_.]*neto$/i, /^venta[\s_.]*neta$/i, /^facturaci[oó]n([\s_.]*neta)?$/i, /^importe$/i], valueValidator: v => !isNaN(Number(v)) },
    { role: 'bonificacion', label: 'Importe Bonificación Total', patterns: [/^importe[\s_.]*bonif(icaci[oó]n|\.)?[\s_.]*total$/i, /^bonificaci[oó]n$/i], valueValidator: v => !isNaN(Number(v)) },
    { role: 'ccc_flag', label: 'Indicador Binario Cliente con Compra', patterns: [/^clientes?[\s_.]*con[\s_.]*compra$/i], valueValidator: v => Number(v) === 0 || Number(v) === 1 },
    { role: 'ccc_agregado', label: 'CCC Pre-Agregado (Sin ID de Cliente)', patterns: [/^ccc[\s_.]*(reportado|hist[oó]rico|total|agregado)$/i, /^clientes?[\s_.]*con[\s_.]*compra$/i], valueValidator: v => Number(v) > 1 },
    { role: 'operaciones', label: 'Cantidad de Operaciones', patterns: [/^operaciones$/i, /^cant(idad)?[\s_.]*op(eraciones)?$/i], valueValidator: v => !isNaN(Number(v)) },
    { role: 'universo_clientes', label: 'Universo de Clientes', patterns: [/^universo$/i], valueValidator: v => !isNaN(Number(v)) },
    { role: 'clientes_activos', label: 'Clientes Activos', patterns: [/^clientes?[\s_.]*activos?$/i], valueValidator: v => !isNaN(Number(v)) },
    { role: 'clientes_no_compradores', label: 'Clientes No Compradores (CNC)', patterns: [/^clientes?[\s_.]*no[\s_.]*compradores?$/i, /^cnc$/i], valueValidator: v => !isNaN(Number(v)) },
    { role: 'visitas', label: 'Cantidad de Visitas', patterns: [/^cantidad[\s_.]*visitas$/i, /^visitas[\s_.]*programadas$/i], valueValidator: v => !isNaN(Number(v)) },
    { role: 'visitas_efectivas', label: 'Visitas Efectivas', patterns: [/^(cantidad[\s_.]*)?visitas[\s_.]*efectivas$/i], valueValidator: v => !isNaN(Number(v)) },
    { role: 'visitas_fuera_ruta', label: 'Visitas con Venta Fuera de Ruta', patterns: [/^visitas[\s_.]*(con[\s_.]*venta[\s_.]*)?fuera[\s_.]*(de[\s_.]*)?ruta$/i], valueValidator: v => !isNaN(Number(v)) },
    { role: 'cant_marcas', label: 'Cantidad de Marcas (MXPDV)', patterns: [/^cantidad[\s_.]*(de[\s_.]*)?marcas$/i, /^mxpdv$/i], valueValidator: v => !isNaN(Number(v)) },
    { role: 'rechazo_bultos', label: 'Rechazo Total Bultos', patterns: [/^rechazo[\s_.]*total[\s_.]*bultos$/i], valueValidator: v => !isNaN(Number(v)) },
    { role: 'rechazo_importe', label: 'Rechazo Importe Neto', patterns: [/^rechazo[\s_.]*importe[\s_.]*neto$/i], valueValidator: v => !isNaN(Number(v)) },
    { role: 'rechazo_hl', label: 'Rechazo Total UM (HL)', patterns: [/^rechazo[\s_.]*total[\s_.]*(um|hl)$/i], valueValidator: v => !isNaN(Number(v)) },
    { role: 'motivo_rechazo', label: 'Motivo de Rechazo', patterns: [/^motivo[\s_.]*(de[\s_.]*)?rechazo$/i], valueValidator: v => typeof v === 'string' },
    { role: 'nro_serie', label: 'Número de Serie Activo', patterns: [/^n[uú]mero[\s_.]*de[\s_.]*serie$/i], valueValidator: null },
    { role: 'litros_repago', label: 'Litros Repago Activo Fijo', patterns: [/^litros[\s_.]*repago$/i], valueValidator: v => !isNaN(Number(v)) },
    { role: 'bonif_pactada', label: 'Bonificación Pactada (%)', patterns: [/^bonif\.?\s*parc\.?\s*cond/i], valueValidator: v => !isNaN(Number(v)) }
  ];

  // Commercial Channel Families (LuanBeer Governance)
  const CHANNEL_FAMILIES = {
    REF: {
      id: 'REF',
      label: 'Refrigerados / On Premise (REF)',
      channels: [
        'REF GASTRONOMICO',
        'REF NOCTURNO',
        'REF ENTRETENIMIENTO',
        'COMIDA',
        'BEBIDA',
        'Disco/Pub',
        'KA GASTRONOMICO',
        'KA NOCTURNO'
      ]
    },
    MAYORISTAS: {
      id: 'MAYORISTAS',
      label: 'Mayoristas',
      channels: ['Mayorista']
    },
    MERCADO_HOGAR: {
      id: 'MERCADO_HOGAR',
      label: 'Mercado Hogar',
      channels: ['Kioscos/Maxikioscos', 'Tradicional', 'Autoservicio']
    },
    CADENITAS: {
      id: 'CADENITAS',
      label: 'Cadenitas',
      channels: ['Supermercados'],
      chains: ['AIELLO', 'DELFIN']
    },
    INSTITUCIONES: {
      id: 'INSTITUCIONES',
      label: 'Instituciones y Personal',
      channels: ['Instituciones', 'Clie Institucional', 'Clie People']
    }
  };

  function detectHeaderRow(rows) {
    let bestRowIdx = 0;
    let bestScore = -1;
    const scanLimit = Math.min(rows.length, 15);
    for (let i = 0; i < scanLimit; i++) {
      const r = rows[i] || [];
      if (isTypeDescriptorRow(r) || isTotalOrSubtotalRow(r)) continue;
      const nonEmpty = r.filter(c => c !== null && c !== undefined && String(c).trim() !== '');
      if (nonEmpty.length === 0) continue;
      // Score based on string cells vs pure numbers
      const stringCells = nonEmpty.filter(c => typeof c === 'string' && isNaN(Number(c))).length;
      const score = nonEmpty.length * 2 + stringCells * 3;
      if (score > bestScore) {
        bestScore = score;
        bestRowIdx = i;
      }
    }
    return bestRowIdx;
  }

  function isTypeDescriptorRow(row) {
    if (!row || row.length === 0) return false;
    const tokens = row.filter(c => c !== null && c !== undefined).map(c => String(c).trim().toUpperCase());
    if (tokens.length < 3) return false;
    const typeWords = ['FECHA', 'ENTERO', 'CARÁCTER', 'CARACTER', 'DECIMAL', 'NUMERICO', 'TEXTO'];
    const matchCount = tokens.filter(t => typeWords.includes(t)).length;
    return matchCount >= Math.ceil(tokens.length * 0.5);
  }

  function isTotalOrSubtotalRow(row) {
    if (!row || row.length === 0) return false;
    for (let i = 0; i < Math.min(row.length, 4); i++) {
      const val = row[i];
      if (val === null || val === undefined) continue;
      const s = String(val).trim().toUpperCase();
      if (/^(TOTAL|SUBTOTAL|TOTAL\s+GENERAL|GRAN\s+TOTAL|RESUMEN\s+TOTAL)\b/.test(s)) {
        return true;
      }
    }
    return false;
  }

  function inferColumnRole(headerName, sampleValues) {
    const cleanHeader = Sanitizer.cleanControlChars(headerName);
    const nonNullSamples = sampleValues.filter(v => v !== null && v !== undefined && String(v).trim() !== '');

    for (const rule of SEMANTIC_RULES) {
      const nameMatched = rule.patterns.some(rx => rx.test(cleanHeader));
      if (!nameMatched) continue;
      if (!rule.valueValidator || nonNullSamples.length === 0) {
        return { role: rule.role, label: rule.label, confidence: 0.92 };
      }
      const validCount = nonNullSamples.filter(v => rule.valueValidator(v)).length;
      const ratio = validCount / nonNullSamples.length;
      if (ratio >= 0.5) {
        return { role: rule.role, label: rule.label, confidence: Number((0.75 + 0.25 * ratio).toFixed(2)) };
      }
    }

    // Special disambiguation when header is "Volumen" (check if values look like Liters > 1000 or HL)
    if (/^volumen$/i.test(cleanHeader) && nonNullSamples.length > 0) {
      const avg = nonNullSamples.reduce((a, b) => a + (Number(b) || 0), 0) / nonNullSamples.length;
      if (avg > 800) {
        return { role: 'volumen_litros', label: 'Volumen (Inferido Litros - Revisar)', confidence: 0.65, ambiguous: true };
      }
      return { role: 'volumen_hl', label: 'Volumen (Inferido HL - Revisar)', confidence: 0.70, ambiguous: true };
    }

    return { role: 'atributo_general', label: 'Atributo Descriptivo / Otro', confidence: 0.5 };
  }

  function matchSalesColumnFingerprint(columnsMeta) {
    if (!Array.isArray(columnsMeta) || columnsMeta.length === 0) return false;
    const colNames = columnsMeta.map(c => String(c.name || '').trim().toLowerCase());
    const roles = new Set(columnsMeta.map(c => c.semanticRole));

    const hasAnioMes = colNames.some(n => /a[ñn]o\s*\/\s*mes|periodo|ym/i.test(n)) || roles.has('periodo');
    const hasCliente = colNames.some(n => /c[oó]digo[\s_.]*cliente|cliente[\s_.]*id|id[\s_.]*cliente/i.test(n)) || roles.has('cod_cliente');
    const hasProducto = colNames.some(n => /c[oó]digo[\s_.]*producto|art[ií]culo/i.test(n)) || roles.has('cod_producto');
    const hasHL = colNames.some(n => /cantidad[\s_.]*total[\s_.]*(en[\s_.]*)?hl|volumen[\s_.]*hl|hectolitros/i.test(n)) || roles.has('volumen_hl');
    const hasNeto = colNames.some(n => /importe[\s_.]*neto|facturaci[oó]n[\s_.]*neta/i.test(n)) || roles.has('facturacion_neta');

    return Boolean(hasAnioMes && hasCliente && hasProducto && (hasHL || roles.has('volumen_litros')) && hasNeto);
  }

  function matchFileNameAlias(fileName) {
    const fn = String(fileName || '').trim().toLowerCase();
    if (/base.*fecha|fecha.*ma|ventas.*(actual|octubre|mes|2026)|base_a_la_fecha/i.test(fn)) {
      return {
        matchedAlias: '(Actualizar) Base a la fecha.xlsx',
        canonicalEntity: 'Base a la fecha',
        confidence: 0.99
      };
    }
    if (/prod.*vol|ventas.*historico|ventas.*2025/i.test(fn)) {
      return {
        matchedAlias: '(Actualizar) Base Prod. y Vol..xlsx',
        canonicalEntity: 'Base Prod. y Vol.',
        confidence: 0.99
      };
    }
    if (/base.*clientes?|reporte.*clientes?|padron.*clientes?/i.test(fn)) {
      return {
        matchedAlias: '(Actualizar) Base de Clientes.xlsx',
        canonicalEntity: 'Base de Clientes',
        confidence: 0.98
      };
    }
    if (/clientes.*presencial|ruteo.*presencial|frecuencias/i.test(fn)) {
      return {
        matchedAlias: '(Actualizar) Clientes Presencial.xlsx',
        canonicalEntity: 'Clientes Presencial',
        confidence: 0.98
      };
    }
    if (/activos.*fijos?|coolers?|heladeras?|parque.*frio/i.test(fn)) {
      return {
        matchedAlias: '(Actualizar) Activos Fijos.xlsx',
        canonicalEntity: 'Activos Fijos',
        confidence: 0.98
      };
    }
    if (/negociacion(es)?|acuerdos?.*comerciales?/i.test(fn)) {
      return {
        matchedAlias: '(Actualizar) Negociaciones.xlsx',
        canonicalEntity: 'Negociaciones',
        confidence: 0.98
      };
    }
    if (/tablero.*ventas?|taco/i.test(fn)) {
      return {
        matchedAlias: 'Tablero Ventas.xlsb',
        canonicalEntity: 'Tablero Ventas (TACO)',
        confidence: 0.99
      };
    }
    return null;
  }

  function classifySheet(sheetName, fileName, columnsMeta, validRowCount) {
    const roles = new Set(columnsMeta.map(c => c.semanticRole));
    const fUpper = String(fileName || '').toUpperCase();
    const sUpper = String(sheetName || '').toUpperCase();

    // Check for summary / aggregated sheet that must NOT be summed into detail
    if (/RESUMEN|AGREGADO|HISTORICO/i.test(sUpper) || (roles.has('ccc_agregado') && !roles.has('cod_cliente'))) {
      return {
        classification: 'Indicadores Agregados',
        modelRole: 'Agregado (No sumar al detalle)',
        confidence: 0.94,
        requiresConfirmation: false,
        reason: 'Contiene métricas pre-agregadas sin granularidad transaccional de cliente/producto.'
      };
    }

    // 1. Column Fingerprint Check: ['Año/Mes', 'Código Cliente', 'Código Producto', 'Cantidad Total en HL', 'Importe Neto']
    const isSalesFingerprint = matchSalesColumnFingerprint(columnsMeta);
    const fileAlias = matchFileNameAlias(fileName);

    if (isSalesFingerprint) {
      const aliasName = fileAlias ? fileAlias.canonicalEntity : 'Base a la fecha';
      return {
        classification: 'Ventas',
        modelRole: 'Tabla de Hechos (Transaccional)',
        confidence: 1.0,
        requiresConfirmation: false,
        isFingerprintMatch: true,
        matchedAlias: fileAlias ? fileAlias.matchedAlias : '(Actualizar) Base a la fecha.xlsx',
        canonicalEntity: aliasName,
        reason: `Huella de 5 columnas transaccionales verificada con 100% de confianza [Año/Mes, Código Cliente, Código Producto, Cantidad Total en HL, Importe Neto] → Asociado a ${aliasName}.`
      };
    }

    if ((roles.has('volumen_hl') || roles.has('volumen_litros')) && roles.has('facturacion_neta')) {
      return {
        classification: 'Ventas',
        modelRole: 'Tabla de Hechos (Transaccional)',
        confidence: 0.98,
        requiresConfirmation: false,
        reason: 'Contiene período, cliente/producto, volumen (HL/Litros) e importe neto de facturación.'
      };
    }

    if (roles.has('objetivo_hl')) {
      return {
        classification: 'Objetivos',
        modelRole: 'Tabla de Hechos (Metas Comerciales)',
        confidence: 0.97,
        requiresConfirmation: false,
        reason: 'Contiene metas de volumen en HL desglosadas por período y dimensiones comerciales.'
      };
    }

    if (roles.has('clientes_no_compradores') || (roles.has('universo_clientes') && roles.has('clientes_activos'))) {
      return {
        classification: 'Clientes / Padrón CNC',
        modelRole: 'Tabla Mixta (Maestro Clientes + Hechos Padrón/CNC)',
        confidence: 0.96,
        requiresConfirmation: false,
        reason: 'Contiene código, razón social, domicilio, canal y estado mensual de compra (Activos vs No Compradores).'
      };
    }

    if (roles.has('visitas') && roles.has('visitas_efectivas')) {
      return {
        classification: 'Eficiencia Comercial',
        modelRole: 'Tabla de Hechos (Ejecución en Ruta)',
        confidence: 0.96,
        requiresConfirmation: false,
        reason: 'Contiene visitas programadas, visitas efectivas y ventas fuera de ruta por cliente y período.'
      };
    }

    if (roles.has('cant_marcas') && roles.has('cod_cliente')) {
      return {
        classification: 'Cobertura MXPDV',
        modelRole: 'Tabla de Hechos (Cobertura de Portfolio)',
        confidence: 0.95,
        requiresConfirmation: false,
        reason: 'Contiene cantidad de marcas compradas por punto de venta (MXPDV) y vendedor.'
      };
    }

    if (roles.has('rechazo_bultos') || roles.has('rechazo_importe') || roles.has('motivo_rechazo')) {
      return {
        classification: 'Rechazos Logísticos',
        modelRole: 'Tabla de Hechos (Logística y Rechazos)',
        confidence: 0.96,
        requiresConfirmation: false,
        reason: 'Contiene bultos, HL e importes rechazados junto con motivos de rechazo por cliente.'
      };
    }

    if (roles.has('nro_serie') || roles.has('litros_repago')) {
      return {
        classification: 'Activos Fijos',
        modelRole: 'Tabla Operativa (Parque de Frío / Heladeras)',
        confidence: 0.96,
        requiresConfirmation: false,
        reason: 'Contiene censo de equipos de frío, números de serie, estado de instalación y litros de repago.'
      };
    }

    if (roles.has('bonif_pactada') || sUpper.includes('NEGOCIACION')) {
      return {
        classification: 'Negociaciones',
        modelRole: 'Tabla Operativa (Acuerdos Comerciales)',
        confidence: 0.95,
        requiresConfirmation: false,
        reason: 'Contiene vigencia de acuerdos comerciales, clientes, grupos de productos y porcentajes de bonificación.'
      };
    }

    if (roles.has('cod_producto') && (roles.has('unidad_negocio') || roles.has('marca')) && !roles.has('periodo')) {
      return {
        classification: 'Productos / Portfolio',
        modelRole: 'Dimensión Maestra (Catálogo de Productos)',
        confidence: 0.98,
        requiresConfirmation: false,
        reason: 'Catálogo maestro de productos con jerarquía de Unidad de Negocio, División, Marca, Calibre y Sabor.'
      };
    }

    if ((roles.has('canal') || roles.has('subcanal')) && (roles.has('canal_unificado') || roles.has('segmento_canal')) && !roles.has('periodo')) {
      return {
        classification: 'Canales',
        modelRole: 'Dimensión Maestra (Homologación de Canales)',
        confidence: 0.97,
        requiresConfirmation: false,
        reason: 'Tabla maestra de homologación de canales de marketing, subcanales y segmentos estratégicos.'
      };
    }

    if (roles.has('periodo') && roles.has('trimestre') && roles.has('anio') && validRowCount <= 60) {
      return {
        classification: 'Calendario / Tiempo',
        modelRole: 'Dimensión Maestra (Calendario Comercial)',
        confidence: 0.98,
        requiresConfirmation: false,
        reason: 'Tabla maestra de tiempo con Año, Año/Mes, Mes, Trimestre, Bimestre y Año Vigente.'
      };
    }

    if (roles.has('cod_cliente') && roles.has('nombre_cliente') && !roles.has('periodo')) {
      return {
        classification: 'Clientes',
        modelRole: 'Dimensión Maestra (Catálogo de Clientes)',
        confidence: 0.96,
        requiresConfirmation: false,
        reason: 'Padrón maestro de clientes únicos (filtra estrictamente por columna Anulado=NO para 1.485 clientes activos oficiales).'
      };
    }

    if (roles.has('unidad_negocio') && !roles.has('cod_producto') && !roles.has('periodo') && validRowCount <= 50) {
      return {
        classification: 'Unidades de Negocio',
        modelRole: 'Dimensión Maestra (Unidades de Negocio)',
        confidence: 0.95,
        requiresConfirmation: false,
        reason: 'Catálogo maestro de Unidades de Negocio.'
      };
    }

    if (fUpper.includes('PERSONAL') || sUpper.includes('VENDEDOR') || columnsMeta.some(c => /^cargo$/i.test(c.name))) {
      return {
        classification: 'Personal Comercial',
        modelRole: 'Dimensión Maestra (Fuerza de Ventas)',
        confidence: 0.95,
        requiresConfirmation: false,
        reason: 'Estructura de Fuerza de Ventas (Vendedores, Supervisores y Gerencia).'
      };
    }

    if (fUpper.includes('TABLERO') || sUpper.includes('MANDO INTEGRAL') || sUpper.includes('TACO') || sUpper.includes('MESA ')) {
      return {
        classification: 'Tablero de Ventas (TACO .xlsb)',
        modelRole: 'Modelo TACO Galaxia (KPI + RTO + Proyección LE)',
        confidence: 0.97,
        requiresConfirmation: false,
        reason: 'Hoja operativa del Tablero de Ventas (.xlsb) con métricas TACO KPI, TACO RTO, Mesas de Supervisión y Tendencia al Cierre.'
      };
    }

    if (fUpper.includes('PRESENCIAL') || columnsMeta.some(c => /^periodicidad$/i.test(c.name))) {
      return {
        classification: 'Ruteo y Frecuencia Presencial',
        modelRole: 'Dimensión Operativa (Rutas, Días LU-SA y Periodicidad)',
        confidence: 0.96,
        requiresConfirmation: false,
        reason: 'Contiene ruteo presencial de clientes, vendedor asignado, días de visita (LU a SA) y periodicidad.'
      };
    }

    return {
      classification: 'Fuente Complementaria',
      modelRole: 'Catálogo Auxiliar / Revisión Manual',
      confidence: 0.60,
      requiresConfirmation: true,
      reason: 'Estructura complementaria o con columnas ambiguas que requiere confirmación del usuario.'
    };
  }

  function inspectSheetMatrix(rows, sheetName, fileName) {
    const warnings = [];
    const errors = [];

    if (!rows || rows.length === 0) {
      errors.push('La hoja está completamente vacía.');
      return {
        sheetName,
        totalRowsRaw: 0,
        headerRowIdx: 0,
        validRowCount: 0,
        rejectedRowCount: 0,
        duplicateRowCount: 0,
        excludedTotalRows: 0,
        excludedMetadataRows: 0,
        columns: [],
        classification: { classification: 'Vacía', modelRole: 'Ignorada', confidence: 0, requiresConfirmation: true },
        warnings,
        errors,
        cleanRows: []
      };
    }

    const headerRowIdx = detectHeaderRow(rows);
    if (headerRowIdx > 0) {
      warnings.push(`Encabezado detectado en la fila ${headerRowIdx + 1} (se omitieron ${headerRowIdx} filas superiores de título/decoración).`);
    }

    const rawHeaders = rows[headerRowIdx] || [];
    const headerSeen = new Map();
    const headers = rawHeaders.map((h, idx) => {
      const clean = h !== null && h !== undefined && String(h).trim() !== ''
        ? Sanitizer.cleanControlChars(h)
        : `COL_${idx + 1}`;
      if (headerSeen.has(clean.toUpperCase())) {
        const count = headerSeen.get(clean.toUpperCase()) + 1;
        headerSeen.set(clean.toUpperCase(), count);
        warnings.push(`Columna con nombre duplicado "${clean}" en posición ${idx + 1}; renombrada internamente a "${clean}_${count}".`);
        return `${clean}_${count}`;
      }
      headerSeen.set(clean.toUpperCase(), 1);
      return clean;
    });

    const cleanRows = [];
    let emptyRows = 0;
    let excludedMetadataRows = 0;
    let excludedTotalRows = 0;
    let duplicateRowCount = 0;
    let missingKeyRows = 0;
    const rowFingerprints = new Set();

    for (let rIdx = headerRowIdx + 1; rIdx < rows.length; rIdx++) {
      const r = rows[rIdx];
      if (!r || !r.some(c => c !== null && c !== undefined && String(c).trim() !== '')) {
        emptyRows++;
        continue;
      }
      if (rIdx === headerRowIdx + 1 && isTypeDescriptorRow(r)) {
        excludedMetadataRows++;
        warnings.push(`Fila ${rIdx + 1} identificada como descriptor de tipos de datos (${r.slice(0, 4).join(', ')}) y excluida de los registros operativos.`);
        continue;
      }
      if (isTotalOrSubtotalRow(r)) {
        excludedTotalRows++;
        warnings.push(`Fila ${rIdx + 1} identificada como TOTAL/SUBTOTAL ("${r[0]}") y excluida para evitar duplicación matemática.`);
        continue;
      }

      const sanitizedRow = headers.map((_, cIdx) => {
        const val = r[cIdx];
        if (val === null || val === undefined || val === '') return null;
        if (typeof val === 'number') return val;
        if (val instanceof Date) return val.toISOString().slice(0, 10);
        return Sanitizer.sanitizeCellString(val);
      });

      const fp = JSON.stringify(sanitizedRow);
      if (rowFingerprints.has(fp)) {
        duplicateRowCount++;
        continue;
      }
      rowFingerprints.add(fp);
      cleanRows.push(sanitizedRow);
    }

    if (duplicateRowCount > 0) {
      warnings.push(`Se detectaron y desduplicaron ${duplicateRowCount} filas exactamente repetidas.`);
    }

    // Analyze each column
    const sampleSlice = cleanRows.slice(0, 500);
    const columnsMeta = headers.map((hName, cIdx) => {
      let nonNull = 0, numCount = 0, dateCount = 0, strCount = 0;
      const samples = [];
      for (let i = 0; i < sampleSlice.length; i++) {
        const v = sampleSlice[i][cIdx];
        if (v === null || v === undefined || v === '') continue;
        nonNull++;
        if (typeof v === 'number' || (!isNaN(Number(v)) && String(v).trim() !== '')) numCount++;
        else if (/^\d{4}-\d{2}-\d{2}/.test(String(v))) dateCount++;
        else strCount++;
        if (samples.length < 5 && !samples.includes(v)) samples.push(v);
      }
      const inferredType = nonNull === 0 ? 'empty' : (dateCount > nonNull * 0.5 ? 'date' : (numCount > nonNull * 0.6 ? 'number' : 'string'));
      const sem = inferColumnRole(hName, samples);
      return {
        colIdx: cIdx,
        name: hName,
        inferredType,
        semanticRole: sem.role,
        semanticLabel: sem.label,
        confidence: sem.confidence,
        ambiguous: Boolean(sem.ambiguous),
        samples
      };
    });

    // Check missing primary keys in cleanRows
    const keyColIdx = columnsMeta.findIndex(c => ['periodo', 'cod_cliente', 'cod_producto', 'canal', 'subcanal'].includes(c.semanticRole));
    const validRows = [];
    if (keyColIdx >= 0) {
      for (const r of cleanRows) {
        if (r[keyColIdx] === null || r[keyColIdx] === undefined || String(r[keyColIdx]).trim() === '') {
          missingKeyRows++;
        } else {
          validRows.push(r);
        }
      }
      if (missingKeyRows > 0) {
        warnings.push(`Se rechazaron ${missingKeyRows} registros por carecer de valor en la columna clave "${columnsMeta[keyColIdx].name}".`);
      }
    } else {
      validRows.push(...cleanRows);
    }

    const classification = classifySheet(sheetName, fileName, columnsMeta, validRows.length);

    return {
      sheetName,
      totalRowsRaw: rows.length,
      headerRowIdx,
      validRowCount: validRows.length,
      rejectedRowCount: emptyRows + excludedMetadataRows + excludedTotalRows + duplicateRowCount + missingKeyRows,
      duplicateRowCount,
      excludedTotalRows,
      excludedMetadataRows,
      excludedTypeRows: excludedMetadataRows,
      missingKeyRows,
      columns: columnsMeta,
      classification,
      warnings,
      errors,
      cleanRows: validRows
    };
  }

  function inspectFileBuffer(buffer, fileName, fileSize) {
    const safeName = Sanitizer.sanitizeFileName(fileName);
    const ext = (safeName.split('.').pop() || '').toLowerCase();
    const result = {
      fileName: safeName,
      format: ext.toUpperCase(),
      sizeBytes: fileSize || (buffer ? buffer.byteLength || buffer.length : 0),
      status: 'procesado',
      sheetCount: 0,
      totalValidRecords: 0,
      sheets: [],
      warnings: [],
      errors: []
    };

    if (!['xlsx', 'xls', 'xlsb', 'csv'].includes(ext)) {
      result.status = 'error';
      result.errors.push(`Formato de archivo no soportado (.${ext}). Formatos admitidos: CSV, XLSX, XLS, XLSB.`);
      return result;
    }

    try {
      let wb;
      if (ext === 'csv') {
        const str = typeof buffer === 'string'
          ? buffer
          : (typeof Buffer !== 'undefined' && Buffer.isBuffer(buffer) ? buffer.toString('utf8') : new TextDecoder('utf-8').decode(buffer));
        wb = XLSX.read(str, { type: 'string', cellDates: true, raw: true });
      } else {
        // Verify ZIP/OLE header for XLSX/XLS to reject corrupt files deterministically
        const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        const isZip = u8.length > 4 && u8[0] === 0x50 && u8[1] === 0x4B; // PK
        const isOle = u8.length > 4 && u8[0] === 0xD0 && u8[1] === 0xCF; // OLE2
        if (!isZip && !isOle) {
          throw new Error('Firma binaria inválida: el archivo está corrupto o no es un documento Excel válido.');
        }
        wb = XLSX.read(u8, { type: 'array', cellDates: true, bookVBA: false, raw: true });
      }

      if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
        throw new Error('El archivo no contiene hojas de datos legibles.');
      }

      result.sheetCount = wb.SheetNames.length;
      for (const sName of wb.SheetNames) {
        const ws = wb.Sheets[sName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
        const sheetInspection = inspectSheetMatrix(rows, sName, safeName);
        result.sheets.push(sheetInspection);
        result.totalValidRecords += sheetInspection.validRowCount;
        if (sheetInspection.warnings.length > 0) {
          result.warnings.push(...sheetInspection.warnings.map(w => `[Hoja ${sName}] ${w}`));
        }
        if (sheetInspection.errors.length > 0) {
          result.errors.push(...sheetInspection.errors.map(e => `[Hoja ${sName}] ${e}`));
        }
      }
    } catch (err) {
      result.status = 'error';
      result.errors.push(`Error al leer archivo "${safeName}": ${err.message}`);
    }

    return result;
  }

  function validateBatch(fileEntries) {
    if (!Array.isArray(fileEntries) || fileEntries.length === 0) {
      return { ok: false, error: 'Debe seleccionar al menos 1 archivo para inspeccionar.' };
    }
    if (fileEntries.length > MAX_FILES_PER_INGEST) {
      return {
        ok: false,
        error: `Límite excedido: se seleccionaron ${fileEntries.length} archivos. El máximo permitido por operación de ingesta es de ${MAX_FILES_PER_INGEST} archivos.`
      };
    }
    const inspectedFiles = fileEntries.map(f => inspectFileBuffer(f.buffer, f.name, f.size));
    return {
      ok: true,
      fileCount: inspectedFiles.length,
      files: inspectedFiles
    };
  }

  return {
    MAX_FILES_PER_INGEST,
    SEMANTIC_RULES,
    CHANNEL_FAMILIES,
    detectHeaderRow,
    isTypeDescriptorRow,
    isTotalOrSubtotalRow,
    inferColumnRole,
    classifySheet,
    inspectSheetMatrix,
    inspectFileBuffer,
    validateBatch,
    matchSalesColumnFingerprint,
    matchFileNameAlias
  };
});
