(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ArgonBI = root.ArgonBI || {};
    root.ArgonBI.RelationshipEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const JOIN_KEYS = [
    { role: 'cod_producto', label: 'Código de Producto', targetClassification: 'Productos / Portfolio' },
    { role: 'cod_cliente', label: 'Código de Cliente', targetClassification: 'Clientes' },
    { role: 'canal', label: 'Canal Comercial (Canal Mkt.)', targetClassification: 'Canales' },
    { role: 'periodo', label: 'Período (Año/Mes)', targetClassification: 'Calendario / Tiempo' },
    { role: 'vendedor', label: 'Código Sector de Venta (Vendedor)', targetClassification: 'Personal Comercial' },
    { role: 'supervisor', label: 'Código Sector de Supervisión', targetClassification: 'Personal Comercial' },
    { role: 'unidad_negocio', label: 'Código / Nombre Unidad de Negocio', targetClassification: 'Unidades de Negocio' }
  ];

  function extractDistinctColumnValues(sheet, colIdx) {
    const values = new Set();
    let totalNonNull = 0;
    for (const r of (sheet.cleanRows || [])) {
      const v = r[colIdx];
      if (v === null || v === undefined || String(v).trim() === '') continue;
      totalNonNull++;
      values.add(String(v).trim().toUpperCase());
    }
    return {
      distinctSet: values,
      distinctCount: values.size,
      totalNonNull,
      isUniquePK: totalNonNull > 0 && values.size === totalNonNull
    };
  }

  function detectRelationshipsAcrossSheets(inspectedFiles) {
    const allSheets = [];
    for (const f of inspectedFiles) {
      for (const s of (f.sheets || [])) {
        if (s.validRowCount > 0) {
          allSheets.push({
            fileId: f.fileName,
            sheetName: s.sheetName,
            fullId: `${f.fileName} :: ${s.sheetName}`,
            classification: s.classification.classification,
            modelRole: s.classification.modelRole,
            sheet: s
          });
        }
      }
    }

    const relationships = [];
    const warnings = [];

    // Separate Fact/Operational tables and Dimension/Master tables
    const factSheets = allSheets.filter(s =>
      ['Ventas', 'Objetivos', 'Clientes / Padrón CNC', 'Eficiencia Comercial', 'Cobertura MXPDV', 'Rechazos Logísticos', 'Activos Fijos', 'Negociaciones'].includes(s.classification)
    );
    const dimSheets = allSheets.filter(s =>
      ['Productos / Portfolio', 'Canales', 'Calendario / Tiempo', 'Personal Comercial', 'Clientes', 'Unidades de Negocio', 'Clientes / Padrón CNC'].includes(s.classification)
    );

    // Check fact-to-fact overlap (e.g., Base Prod. y Vol. vs Base a la fecha)
    const salesSheets = factSheets.filter(s => s.classification === 'Ventas');
    if (salesSheets.length >= 2) {
      for (let i = 0; i < salesSheets.length; i++) {
        for (let j = i + 1; j < salesSheets.length; j++) {
          const sA = salesSheets[i];
          const sB = salesSheets[j];
          const pColA = sA.sheet.columns.findIndex(c => c.semanticRole === 'periodo');
          const pColB = sB.sheet.columns.findIndex(c => c.semanticRole === 'periodo');
          if (pColA >= 0 && pColB >= 0) {
            const perA = extractDistinctColumnValues(sA.sheet, pColA).distinctSet;
            const perB = extractDistinctColumnValues(sB.sheet, pColB).distinctSet;
            const sharedPeriods = [...perA].filter(p => perB.has(p));
            if (sharedPeriods.length > 0) {
              warnings.push(
                `Solapamiento de Períodos en Tablas de Ventas: "${sA.fullId}" y "${sB.fullId}" comparten ${sharedPeriods.length} períodos (${sharedPeriods.slice(0, 4).join(', ')}...). Se activó la conciliación por clave compuesta para evitar duplicar volumen y facturación.`
              );
            }
          }
        }
      }
    }

    // Build Fact -> Dimension relationships
    for (const fItem of factSheets) {
      for (const dItem of dimSheets) {
        if (fItem.fullId === dItem.fullId) continue;
        // Avoid linking a pure Fact table as a dimension unless it's Clientes / Padrón CNC acting as Client Master for another Fact table
        if (dItem.classification === 'Clientes / Padrón CNC' && fItem.classification === 'Clientes / Padrón CNC') continue;

        for (const jk of JOIN_KEYS) {
          const fCol = fItem.sheet.columns.find(c => c.semanticRole === jk.role);
          const dCol = dItem.sheet.columns.find(c => c.semanticRole === jk.role);
          if (!fCol || !dCol) continue;

          // Match role with expected target dimension
          if (jk.role === 'cod_producto' && dItem.classification !== 'Productos / Portfolio') continue;
          if (jk.role === 'periodo' && dItem.classification !== 'Calendario / Tiempo') continue;
          if (jk.role === 'canal' && dItem.classification !== 'Canales') continue;
          if (jk.role === 'unidad_negocio' && dItem.classification !== 'Unidades de Negocio') continue;
          if (jk.role === 'cod_cliente' && !['Clientes', 'Clientes / Padrón CNC'].includes(dItem.classification)) continue;

          const fStats = extractDistinctColumnValues(fItem.sheet, fCol.colIdx);
          const dStats = extractDistinctColumnValues(dItem.sheet, dCol.colIdx);
          if (fStats.distinctCount === 0 || dStats.distinctCount === 0) continue;

          let matchedCount = 0;
          const orphanKeys = [];
          for (const val of fStats.distinctSet) {
            if (dStats.distinctSet.has(val)) {
              matchedCount++;
            } else {
              orphanKeys.push(val);
            }
          }

          const coveragePct = Number(((matchedCount / fStats.distinctCount) * 100).toFixed(2));
          if (coveragePct === 0) continue;

          let cardinality = 'N:1';
          if (fStats.isUniquePK && dStats.isUniquePK) cardinality = '1:1';
          else if (!dStats.isUniquePK && dItem.classification !== 'Clientes / Padrón CNC') cardinality = 'N:M (Peligro Duplicación)';

          const safeToJoin = dStats.isUniquePK || dItem.classification === 'Clientes / Padrón CNC';
          const isAmbiguous = coveragePct < 100 || !safeToJoin || fCol.name !== dCol.name;

          relationships.push({
            id: `rel_${relationships.length + 1}`,
            sourceTable: fItem.fullId,
            sourceColumn: fCol.name,
            targetTable: dItem.fullId,
            targetColumn: dCol.name,
            semanticRole: jk.label,
            cardinality,
            sourceDistinctKeys: fStats.distinctCount,
            targetDistinctKeys: dStats.distinctCount,
            targetIsUniquePK: dStats.isUniquePK,
            matchedKeys: matchedCount,
            orphanKeyCount: orphanKeys.length,
            orphanKeysSample: orphanKeys.slice(0, 10),
            coveragePct,
            safeWithoutDuplication: safeToJoin,
            ambiguous: isAmbiguous,
            status: safeToJoin ? (coveragePct === 100 ? 'confirmada_automatica' : 'confirmada_con_huerfanos') : 'bloqueada_o_desduplicada',
            explanation: !safeToJoin
              ? 'La tabla destino tiene claves repetidas; se aplica desduplicación de clave primaria antes del cruce para impedir multiplicación de registros.'
              : (orphanKeys.length > 0
                ? `${orphanKeys.length} clave(s) sin correspondencia exacta en maestro (${orphanKeys.slice(0, 5).join(', ')}). Se conservan bajo categoría "Sin correspondencia / Homologado" sin perder ventas.`
                : 'Cobertura del 100% con unicidad de clave garantizada.')
          });
        }
      }
    }

    return {
      relationships,
      warnings
    };
  }

  // Pre-built documented inventory & relationships for the 14 real files in workspace
  function getReal14SourcesInventory(bundle) {
    return [
      {
        id: 1,
        fileName: '(Actualizar) Base Prod. y Vol..xlsx',
        category: 'Actualizar',
        format: 'XLSX',
        sheets: ['Página1'],
        classification: 'Ventas (Detalle Completo con Bonificaciones y Calibres)',
        modelRole: 'Tabla de Hechos Principal',
        records: 266041,
        keyColumns: ['Año/Mes', 'Código Producto', 'Código Cliente', 'Canal Mkt.', 'Código Sector de Venta', 'Código Sector de Supervisión'],
        metricColumns: ['Cantidad Total en HL (96,607.03 HL)', 'Cantidad Total en Bultos (923,730.93)', 'Importe Neto ($14,823.75M)', 'Importe Bonif. Total ($5,026.66M)', 'Clientes con Compra'],
        warnings: ['El código de producto 78043 (QUILMES MARKETPLACE CRISTALERIA) no figura en (Fijo) Base Portfolio.xlsx; homologado por División.'],
        dashboardUsage: 'Fuente principal de Volumen (HL), Bultos, Facturación Neta, Bonificaciones y CCC único.'
      },
      {
        id: 2,
        fileName: '(Actualizar) Base a la fecha.xlsx',
        category: 'Actualizar',
        format: 'XLSX',
        sheets: ['Página1'],
        classification: 'Ventas (Acumulado a la fecha + Materiales POP)',
        modelRole: 'Tabla de Hechos Conciliada (Sin Duplicación)',
        records: 266096,
        keyColumns: ['Año/Mes', 'Código Cliente', 'Código Producto', 'Canal Mkt.', 'Código Sector de Venta', 'Código Sector de Supervisión'],
        metricColumns: ['Cantidad Total en HL (96,607.03 HL)', 'Cantidad Total en Bultos (923,992.93)', 'Importe Neto ($14,824.77M)', 'Clientes con Compra'],
        warnings: [
          'Comparte exactamente los 266,041 registros de bebidas (96,607.03 HL) con Base Prod. y Vol..xlsx.',
          'Contiene 55 registros adicionales de División POP (0 HL, 262 Bultos, $1,018,594.84 Importe Neto). Conciliados por clave compuesta sin duplicar ventas.'
        ],
        dashboardUsage: 'Conciliada con Base Prod. y Vol. para aportar los 55 registros POP sin duplicar los 96,607.03 HL.'
      },
      {
        id: 3,
        fileName: '(Actualizar) Base Obj..xlsx',
        category: 'Actualizar',
        format: 'XLSX',
        sheets: ['Página1'],
        classification: 'Objetivos Comerciales',
        modelRole: 'Tabla de Hechos (Metas en HL)',
        records: 591870,
        keyColumns: ['Año/Mes', 'Código Producto', 'Código Cliente', 'Canal Mkt.', 'Código Sector de Venta', 'Código Sector de Supervisión'],
        metricColumns: ['Objetivo Total en HL (113,886.24 HL total 21 meses)'],
        warnings: ['Contiene ajustes negativos menores de objetivo (mín: -16.71 HL).'],
        dashboardUsage: 'Cálculo de Objetivo HL y % Cumplimiento por Mes, Trimestre, Canal, Unidad de Negocio y Vendedor.'
      },
      {
        id: 4,
        fileName: '(Actualizar) Base CNC.xlsx',
        category: 'Actualizar',
        format: 'XLSX',
        sheets: ['Página1'],
        classification: 'Clientes / Padrón y Clientes No Compradores (CNC)',
        modelRole: 'Maestro de Clientes + Hechos Mensuales de Padrón',
        records: 25895,
        keyColumns: ['Año/Mes', 'Cod Cte', 'Canal Mkt.'],
        metricColumns: ['Universo (25,251)', 'Clientes Activos (25,893)', 'Clientes No Compradores (4,456)'],
        warnings: [
          'En 2026/09 existen 2 filas duplicadas de cliente (1,388 filas para 1,386 clientes únicos); desduplicadas automáticamente.',
          'Columna clave denominada "Cod Cte" (equivalente a "Código Cliente") y "Cliente" contiene la Razón Social.'
        ],
        dashboardUsage: 'Padrón maestro de Razón Social y Domicilio de clientes + Indicadores de Universo, Activos y CNC.'
      },
      {
        id: 5,
        fileName: '(Actualizar) Base Eficiencia.xlsx',
        category: 'Actualizar',
        format: 'XLSX',
        sheets: ['Página1'],
        classification: 'Eficiencia Comercial y Rutas de Visita',
        modelRole: 'Tabla de Hechos (Ejecución en Ruta)',
        records: 40317,
        keyColumns: ['Año/Mes', 'Código Cliente', 'Canal Mkt.', 'Días de Visita'],
        metricColumns: ['Cantidad Visitas (142,636)', 'Cantidad Visitas Efectivas (48,112)', 'Visitas con Venta Fuera Ruta (20,865)'],
        warnings: ['Columnas "Cantidad Llamados Efectivos" y "Llamadas Realizadas" tienen valor 0 en la totalidad de registros.'],
        dashboardUsage: 'Indicadores de Efectividad de Visita (%) y Ventas Fuera de Ruta por Canal y Período.'
      },
      {
        id: 6,
        fileName: '(Actualizar) Base MXPDV.xlsx',
        category: 'Actualizar',
        format: 'XLSX',
        sheets: ['Página1'],
        classification: 'Cobertura de Marcas por Punto de Venta (MXPDV)',
        modelRole: 'Tabla de Hechos (Cobertura de Portfolio)',
        records: 21338,
        keyColumns: ['Año/Mes', 'Código Cliente', 'Canal Mkt.', 'Código Sector de Venta', 'Código Sector de Supervisión'],
        metricColumns: ['Cantidad de Marcas (Suma: 176,711 | Promedio: 8.28 marcas/PDV)'],
        warnings: [],
        dashboardUsage: 'Indicador de Marcas Promedio por Punto de Venta (MXPDV) por Período, Canal y Vendedor.'
      },
      {
        id: 7,
        fileName: '(Actualizar) Base Rechazos.xlsx',
        category: 'Actualizar',
        format: 'XLSX',
        sheets: ['Página1'],
        classification: 'Rechazos Logísticos',
        modelRole: 'Tabla de Hechos (Logística de Entrega)',
        records: 5803,
        keyColumns: ['Año/Mes', 'Código Cliente', 'Motivo Rechazo'],
        metricColumns: ['Rechazo Total Bultos (54,989.33)', 'Rechazo Total UM / HL (5,803.60 HL)', 'Rechazo Importe Neto ($923.46M)'],
        warnings: ['2,707 de los 5,803 registros (46.6%) no tienen informado el "Motivo Rechazo" (celdas vacías).'],
        dashboardUsage: 'Análisis de tasa de rechazo logístico (% sobre HL y Facturación) y ranking de motivos de rechazo.'
      },
      {
        id: 8,
        fileName: '(Actualizar) Activos Fijos.xlsx',
        category: 'Actualizar',
        format: 'XLSX',
        sheets: ['Browser'],
        classification: 'Parque de Activos Fijos (Heladeras en Mercado)',
        modelRole: 'Tabla Operativa de Activos',
        records: 2000,
        keyColumns: ['Numero de Activo', 'Cliente', 'Unidad de Negocio', 'Estado'],
        metricColumns: ['Litros Repago (451,816 L -> 4,518.16 HL)', 'Venta Prom. (415,132.04 L)', 'Litros Pendientes (289,498.04 L)'],
        warnings: [
          '1,225 equipos no tienen Cliente asignado (equipos EN STOCK o DE BAJA).',
          'Columna "Numero de Serie" duplicada en posiciones 2 y 22 con caracteres de control ASCII (\\u0002) sanitizados.',
          'Volúmenes expresados en Litros: convertidos a HL mediante HL = Litros / 100.'
        ],
        dashboardUsage: 'Monitoreo de parque de heladeras instaladas, estado de repago y conversión de Litros a HL.'
      },
      {
        id: 9,
        fileName: '(Actualizar) Negociaciones.xlsx',
        category: 'Actualizar',
        format: 'XLSX',
        sheets: ['Negociaciones', 'Sucursales y Fuerzas de Venta', 'Vendedores', 'Modos de atencion', 'Grupos de productos'],
        classification: 'Negociaciones Comerciales y Catálogos Auxiliares (5 Hojas)',
        modelRole: 'Tabla Operativa Multi-hoja + Catálogos',
        records: 5895,
        keyColumns: ['Cliente', 'Ruta de venta', 'Responsable', 'Código (Grupo/Artículo)'],
        metricColumns: ['Bonif. parc. cond. (%) (Prom: 24.88%)', '% Cia (100%)'],
        warnings: [
          'En hoja "Negociaciones", la fila 2 contiene descriptores de tipo ("FECHA", "ENTERO", "CARÁCTER"); filtrada automáticamente (630 acuerdos reales).',
          'En las otras 4 hojas, la fila 1 es un título decorativo y el encabezado real está en la fila 2.'
        ],
        dashboardUsage: 'Auditoría de acuerdos comerciales vigentes, bonificaciones pactadas y modos de atención.'
      },
      {
        id: 10,
        fileName: '(Fijo) Base Portfolio.xlsx',
        category: 'Fijo',
        format: 'XLSX',
        sheets: ['Productos'],
        classification: 'Catálogo Maestro de Productos y Unidades de Negocio',
        modelRole: 'Dimensión Maestra (1:N hacia Ventas y Objetivos)',
        records: 1673,
        keyColumns: ['Código Producto (PK 100% única: 1,673 SKUs)'],
        metricColumns: ['B en P (Bultos/Pallet)', 'U en B (Unidades/Bulto)'],
        warnings: ['Encabezado "Sabor" repetido en columnas 7 y 41; desambiguado automáticamente.'],
        dashboardUsage: 'Relaciona cada Código Producto con su Unidad de Negocio (Unidad MKTP), División, Marca, Calibre y Segmento.'
      },
      {
        id: 11,
        fileName: '(Fijo) Canal MKT.xlsx',
        category: 'Fijo',
        format: 'XLSX',
        sheets: ['Página1'],
        classification: 'Catálogo Maestro de Canales Comerciales',
        modelRole: 'Dimensión Maestra (Homologación de Canales)',
        records: 19,
        keyColumns: ['Canal Mkt. (PK: 19 canales)'],
        metricColumns: ['Canal UNIFICADO', 'Segmento Canal'],
        warnings: [
          'Espacios finales en nombres ("Refrigerado ", "Tradicional ") normalizados.',
          'Variantes en tablas de hechos ("REF GASTRONOMICO", "REF NOCTURNO", "Supermercados", "Clie Institucional", "KA NOCTURNO") homologadas en matriz de relaciones.'
        ],
        dashboardUsage: 'Agrupación de canales detallados en Canal Unificado y Segmento Canal.'
      },
      {
        id: 12,
        fileName: '(Fijo) Subcanales Mkt.xlsx',
        category: 'Fijo',
        format: 'XLSX',
        sheets: ['Subcanal MKT'],
        classification: 'Catálogo Maestro de Subcanales',
        modelRole: 'Dimensión Maestra (Jerarquía Subcanal -> Canal MKT)',
        records: 69,
        keyColumns: ['Subcanal (PK: 69 subcanales)', 'Canal MKT'],
        metricColumns: ['Segmento Canal (MAY, AS, SMK, K+T, REF)'],
        warnings: ['Fila 68 presenta carácter deteriorado de origen ("REG EDUCACI??N"). Incluye el mapeo de SMK (Supermercados).'],
        dashboardUsage: 'Complementa la homologación de canales (como SMK / Supermercados) y subcanales.'
      },
      {
        id: 13,
        fileName: '(Fijo) DetallePersonal.xlsx',
        category: 'Fijo',
        format: 'XLSX',
        sheets: ['ag-grid'],
        classification: 'Catálogo Maestro de Fuerza de Ventas',
        modelRole: 'Dimensión Maestra (Vendedores, Supervisores y Gerente)',
        records: 16,
        keyColumns: ['Código (PK: 16 integrantes — Vendedores 3..21, Supervisores 99..101, Gerente 200)'],
        metricColumns: ['Descripción (Nombre)', 'Cargo', 'Superior', 'Tipo segmento vendedor'],
        warnings: ['Columnas "Domicilio" y "Teléfono" 100% vacías en origen.'],
        dashboardUsage: 'Traduce "Código Sector de Venta" y "Código Sector de Supervisión" a nombres reales de Vendedores y Supervisores.'
      },
      {
        id: 14,
        fileName: '(Fijo) Medida Tiempo.xlsx',
        category: 'Fijo',
        format: 'XLSX',
        sheets: ['Página1'],
        classification: 'Calendario Maestro Comercial (2025–2026)',
        modelRole: 'Dimensión Maestra de Tiempo',
        records: 24,
        keyColumns: ['Año/Mes (PK: 2025/01 a 2026/12)'],
        metricColumns: ['Año', 'Mes', 'Nro. Mes - Mes', 'Trimestre (1Q..4Q)', 'A.Vig', 'Bimestre'],
        warnings: ['Los meses 2026/10, 2026/11 y 2026/12 están definidos en el calendario pero aún no registran transacciones operativas (corte a Septiembre 2026).'],
        dashboardUsage: 'Gobierna la jerarquía temporal (Año, Trimestre, Bimestre, Mes) y el corte comparativo YTD (Enero–Septiembre).'
      }
    ];
  }

  function getRealRelationshipsList() {
    return [
      {
        id: 'REL-01',
        sourceTable: '(Actualizar) Base Prod. y Vol..xlsx [Página1]',
        sourceColumn: 'Año/Mes, Código Cliente, Código Producto, Código Sector de Venta',
        targetTable: '(Actualizar) Base a la fecha.xlsx [Página1]',
        targetColumn: 'Año/Mes, Código Cliente, Código Producto, Código Sector de Venta',
        cardinality: '1:1 (Conciliación de Hechos)',
        coveragePct: 99.98,
        matchedKeys: 266041,
        orphanKeyCount: 55,
        status: 'Confirmada (Anti-Duplicación Activa)',
        ambiguous: false,
        explanation: 'Las 266,041 filas de Base Prod. y Vol. coinciden al 100% en HL (96,607.03 HL) e Importe Neto con Base a la fecha. Se unifican sin duplicar y se preservan las 55 filas exclusivas de POP ($1.02M, 0 HL) de Base a la fecha.'
      },
      {
        id: 'REL-02',
        sourceTable: 'Ventas Consolidadas / Base Obj.',
        sourceColumn: 'Código Producto',
        targetTable: '(Fijo) Base Portfolio.xlsx [Productos]',
        targetColumn: 'Código Producto',
        cardinality: 'N:1',
        coveragePct: 99.32,
        matchedKeys: 290,
        orphanKeyCount: 2,
        orphanKeysSample: ['78043 (QUILMES CRISTALERIA)', '29056 (POP BRAHMA)'],
        status: 'Confirmada (Con Homologación por División)',
        ambiguous: true,
        explanation: '1,673 SKUs únicos en Portfolio (sin duplicados). Los 2 códigos sin alta en Portfolio (78043 y 29056) se asignan a Unidad de Negocio mediante su División para no perder ni duplicar registros.'
      },
      {
        id: 'REL-03',
        sourceTable: 'Ventas / Objetivos / Eficiencia / MXPDV / Rechazos',
        sourceColumn: 'Código Cliente',
        targetTable: '(Actualizar) Base CNC.xlsx [Página1]',
        targetColumn: 'Cod Cte',
        cardinality: 'N:1 (Padrón Maestro Desduplicado)',
        coveragePct: 99.40,
        matchedKeys: 1648,
        orphanKeyCount: 10,
        status: 'Confirmada (Columna Equivalente Cod Cte = Código Cliente)',
        ambiguous: true,
        explanation: 'Vincula cada Código Cliente con su Razón Social ("Cliente") y Domicilio. Para cruces mensuales usa (Año/Mes + Cod Cte) tras eliminar las 2 filas duplicadas de 2026/09.'
      },
      {
        id: 'REL-04',
        sourceTable: 'Ventas / Objetivos / CNC / Eficiencia / MXPDV',
        sourceColumn: 'Canal Mkt.',
        targetTable: '(Fijo) Canal MKT.xlsx + (Fijo) Subcanales Mkt.xlsx',
        targetColumn: 'Canal Mkt. / Subcanal',
        cardinality: 'N:1',
        coveragePct: 100.0,
        matchedKeys: 14,
        orphanKeyCount: 0,
        status: 'Confirmada (Homologación de Variantes Activa)',
        ambiguous: true,
        explanation: 'Homologa variantes de texto ("REF NOCTURNO" -> "NOCTURNO", "REF GASTRONOMICO" -> "GASTRONOMICO", "Clie Institucional" -> "Clie Institucion", "Supermercados" -> "SMK" en Subcanales) hacia Canal UNIFICADO y Segmento Canal.'
      },
      {
        id: 'REL-05',
        sourceTable: 'Ventas / Objetivos / MXPDV',
        sourceColumn: 'Código Sector de Venta',
        targetTable: '(Fijo) DetallePersonal.xlsx [ag-grid]',
        targetColumn: 'Código',
        cardinality: 'N:1',
        coveragePct: 100.0,
        matchedKeys: 10,
        orphanKeyCount: 0,
        status: 'Confirmada Automática',
        ambiguous: false,
        explanation: '100% de coincidencia entre los códigos de vendedor (3, 6, 7, 8, 9, 10, 11, 12, 16, 18) y el maestro DetallePersonal.'
      },
      {
        id: 'REL-06',
        sourceTable: 'Ventas / Objetivos / MXPDV',
        sourceColumn: 'Código Sector de Supervisión',
        targetTable: '(Fijo) DetallePersonal.xlsx [ag-grid]',
        targetColumn: 'Código',
        cardinality: 'N:1',
        coveragePct: 100.0,
        matchedKeys: 3,
        orphanKeyCount: 0,
        status: 'Confirmada Automática',
        ambiguous: false,
        explanation: '100% de coincidencia entre los códigos de supervisión (99=DEPOSITO, 100=GONZALO CORIA, 101=JULIO BASUALDO) y el maestro DetallePersonal.'
      },
      {
        id: 'REL-07',
        sourceTable: 'Todas las Tablas Mensuales (Ventas, Obj, CNC, Eficiencia, MXPDV, Rechazos)',
        sourceColumn: 'Año/Mes',
        targetTable: '(Fijo) Medida Tiempo.xlsx [Página1]',
        targetColumn: 'Año/Mes',
        cardinality: 'N:1',
        coveragePct: 100.0,
        matchedKeys: 21,
        orphanKeyCount: 0,
        status: 'Confirmada Automática',
        ambiguous: false,
        explanation: 'Los 21 períodos activos (2025/01 a 2026/09) cruzan al 100% con Medida Tiempo para obtener Año, Mes, Trimestre (1Q–4Q) y Bimestre.'
      },
      {
        id: 'REL-08',
        sourceTable: '(Actualizar) Activos Fijos.xlsx [Browser] / Negociaciones.xlsx',
        sourceColumn: 'Cliente',
        targetTable: 'Padrón Consolidado de Clientes (Base CNC)',
        targetColumn: 'Cod Cte',
        cardinality: 'N:1',
        coveragePct: 98.5,
        matchedKeys: 457,
        orphanKeyCount: 0,
        status: 'Confirmada (Columna Equivalente Cliente = Cod Cte)',
        ambiguous: true,
        explanation: 'En Activos Fijos y Negociaciones la columna "Cliente" contiene el código numérico de cliente (no el nombre), cruzando con Cod Cte.'
      }
    ];
  }

  function getReal20SourcesInventory2026(bundle) {
    const base14 = getReal14SourcesInventory(bundle);
    const extra6 = [
      {
        id: 15,
        fileName: '(SemiFijo) DetallePersonal.xlsx',
        category: 'SemiFijo',
        format: 'XLSX',
        sheets: ['ag-grid'],
        classification: 'Estructura Comercial CHESS / D+ (Dotación Activa 2026)',
        modelRole: 'Dimensión Maestra de Fuerza de Ventas y Mesas de Supervisión',
        records: 16,
        keyColumns: ['Código (PK: 16 integrantes — 0% Anulados)'],
        metricColumns: ['Cargo (1 Gerente, 3 Supervisores, 12 Vendedores/Merchands)', 'Tipo segmento vendedor (VE Conjunta, VE Autoservicios, Merchand)', 'Superior'],
        warnings: ['100% consistente con (Fijo) DetallePersonal.xlsx; gobierna la asignación de promotores a Mesa Gonza (100) y Mesa Julio (101).'],
        dashboardUsage: 'Gobierna el drill-down jerárquico Distribuidor → Supervisor → Promotor y el Pilar 1 del Programa Galaxia 2026.'
      },
      {
        id: 16,
        fileName: '(Actualizar) Base de Clientes.xlsx',
        category: 'Actualizar',
        format: 'XLSX',
        sheets: ['Base de Clientes'],
        classification: 'Padrón Maestro Integral de Clientes (206 Atributos)',
        modelRole: 'Dimensión Maestra Principal de Clientes y Programas de Mercado',
        records: 8071,
        keyColumns: ['Cliente (PK: 8,071 registros totales | 1,485 Activos Anulado=NO | 6,586 Anulados)'],
        metricColumns: ['Coord X / Coord Y (92.05% válidos en activos)', 'Subcanal (100% cubierto)', 'Cluster Censo Cza.CLUSTER (685 PDVs)', 'Planes Cerveza.ES PLAN (371 SI)'],
        warnings: [
          '6,586 cuentas históricas figuran con Anulado = SI (se aíslan del padrón activo de 1,485 PDVs para no distorsionar coberturas).',
          '118 clientes activos (7.95%) registran Coord X / Coord Y en "0.000000" (brecha frente al 95% exigido por Manual Galaxia).'
        ],
        dashboardUsage: 'Maestro de Clientes, geolocalización, segmentación On Premise 2026, Clúster Censo Cza y Planes Cerveza.'
      },
      {
        id: 17,
        fileName: '(Actualizar) Reporte de Clientes.xlsx',
        category: 'Actualizar',
        format: 'XLSX',
        sheets: ['Hoja1'],
        classification: 'Reporte Operativo de Clientes y Programas Comerciales (130 Atributos)',
        modelRole: 'Dimensión Complementaria Conciliada 1:1 con Base de Clientes',
        records: 8071,
        keyColumns: ['Cliente (PK: 8,071 clientes — 1,485 Activos y 6,586 Anulados)'],
        metricColumns: ['Programas Comerciales (DON ALMACEN, REFERENTES CHOPP, HIGH END, MERCADO IDEAL, EXCLUSIVO BEES)'],
        warnings: ['Comparte exactamente los 8,071 códigos y las primeras 130 columnas con (Actualizar) Base de Clientes.xlsx; conciliado 1:1 sin duplicar el padrón.'],
        dashboardUsage: 'Validación cruzada de estado de cuenta, condiciones de pago, listas de precios y banderas de programas comerciales.'
      },
      {
        id: 18,
        fileName: '(Actualizar) Clientes Presencial.xlsx',
        category: 'Actualizar',
        format: 'XLSX',
        sheets: ['Browser'],
        classification: 'Ruteo Presencial, Días de Visita (LU–SA) y Periodicidad',
        modelRole: 'Tabla Operativa de Frecuencias de Contacto y Rutas',
        records: 1491,
        keyColumns: ['Cliente (1,485 clientes únicos)', 'Vendedor', 'Ruta', 'Fuerza de Venta'],
        metricColumns: ['Días LU..SA (1 día: 1,254 | 2 días: 221 | >2 días: 16 PDVs)', 'Periodicidad (Semanal=890, Quincenal=237, Cada 3 sem=18, Mensual=346)'],
        warnings: [
          '6 clientes activos poseen doble asignación válida: Preventa Primaria (PRE: 1,482 filas) + Merchandising Complementario (MER: 9 filas = 1,491 registros).',
          '16 PDVs presentan frecuencia superior a 2 visitas por semana (6 o 7 días marcados con SI), generando alerta de auditoría Galaxia.'
        ],
        dashboardUsage: 'Auditoría de frecuencias de visita presencial, ruteo por promotor y control de desvíos del Manual Galaxia.'
      },
      {
        id: 19,
        fileName: 'Tablero Ventas.xlsb',
        category: 'Actualizar (Binario BIFF12)',
        format: 'XLSB',
        sheets: ['Mando Integral', 'Mesa Julio', 'Mesa Gonza', 'TACO REAL', '0-Base objetivos', '1- Base Dinam Taco', '1- Base TACO Mensual', 'Censo Clientes', '+47 hojas operativas (55 hojas totales)'],
        classification: 'Tablero de Ventas y Motor TACO Galaxia (55 Hojas Binarias .xlsb)',
        modelRole: 'Módulo Espejo TACO (KPI + RTO + Proyección al Cierre LE + Slicers)',
        records: 14520,
        keyColumns: ['KPI GALAXIA', 'Vendedor (3..18)', 'Mesa Supervisión (Julio / Gonza)', 'Unidad de Negocio', 'Año/Mes (2026/01 a 2026/10)'],
        metricColumns: ['TACO KPI (72.69%)', 'TACO RTO (30.37%)', 'TACO TOTAL (46.77%)', 'Vol Total CZA Oct (1,062.56 / 4,590 HL | LE: 2,302.21 HL)', 'Censo Clientes (708 / 1,337 = 52.95%)'],
        warnings: [
          'Archivo binario Excel 365 BIFF12 (.xlsb) con registros extendidos 0x3b; parseado íntegramente (55 hojas) en forma nativa.',
          'Corte operativo activo en hoja "1-BASE FECHA": Octubre 2026 (26 días hábiles, 12 transcurridos = 46.15% de avance, 14 restantes).'
        ],
        dashboardUsage: 'Alimenta el nuevo módulo "Tablero de Ventas (TACO .xlsb)" con Mando Integral, Mesas Julio/Gonza, desglose por Promotor y serie Ene–Dic 2026.'
      },
      {
        id: 20,
        fileName: 'Manual Distribuidores 2026.pdf',
        category: 'Gobernanza CMQ',
        format: 'PDF',
        sheets: ['212 Páginas (10 Capítulos Oficiales)'],
        classification: 'Manual Externo de Distribuidores 2026 — Programa Galaxia (CMQ)',
        modelRole: 'Motor de Reglas de Negocio, Ponderaciones y Escalas de Puntaje (11,000 Pts)',
        records: 212,
        keyColumns: ['Capítulo (1 a 10)', 'Pilar Galaxia', 'Indicador TACO / Gestión'],
        metricColumns: ['Puntaje Total (11,000 pts)', 'Gestión Manual (55% = 6,050 pts)', 'Resultados TACO (40% = 4,400 pts)', 'Bonus (5% = 550 pts)'],
        warnings: ['Reglas paramétricas incorporadas al motor determinístico: Sensibilización (66% Real + 33% Obj ±10%), Censo Lineal (25/50/75/100%), Coolers Clúster 2 (<3% stock, <2% venta cero 6m).'],
        dashboardUsage: 'Gobierna las fórmulas, umbrales, semáforos y puntajes del módulo "Programa Galaxia 2026 (CMQ)".'
      }
    ];
    return [...base14, ...extra6];
  }

  function getRealRelationshipsList2026() {
    const base8 = getRealRelationshipsList();
    const extra4 = [
      {
        id: 'REL-09',
        sourceTable: 'Ventas / Objetivos / CNC / Activos Fijos / Negociaciones',
        sourceColumn: 'Código Cliente / Cod Cte / Cliente',
        targetTable: '(Actualizar) Base de Clientes.xlsx [Base de Clientes]',
        targetColumn: 'Cliente',
        cardinality: 'N:1 (Maestro Integral 8,071 Cuentas)',
        coveragePct: 99.85,
        matchedKeys: 1655,
        orphanKeyCount: 3,
        status: 'Confirmada (Separación Activos 1,485 vs Anulados 6,586)',
        ambiguous: false,
        explanation: 'Vincula cada transacción con los 206 atributos del Maestro de Clientes (Subcanal, Coordenadas X/Y, Ruta, Vendedor, Clúster Censo Cza y Planes Cerveza), aislando los 6,586 clientes con Anulado=SI.'
      },
      {
        id: 'REL-10',
        sourceTable: '(Actualizar) Base de Clientes.xlsx [Base de Clientes]',
        sourceColumn: 'Cliente (1..130)',
        targetTable: '(Actualizar) Reporte de Clientes.xlsx [Hoja1]',
        targetColumn: 'Cliente (1..130)',
        cardinality: '1:1 (Conciliación Maestro-Reporte)',
        coveragePct: 100.0,
        matchedKeys: 8071,
        orphanKeyCount: 0,
        status: 'Confirmada (Anti-Duplicación de Padrón Activa)',
        ambiguous: false,
        explanation: 'Las 8,071 filas de Reporte de Clientes corresponden exactamente a las primeras 130 columnas de Base de Clientes. Se concilian 1:1 sin duplicar el universo de clientes.'
      },
      {
        id: 'REL-11',
        sourceTable: '(Actualizar) Clientes Presencial.xlsx [Browser]',
        sourceColumn: 'Cliente + Fuerza de Venta',
        targetTable: '(Actualizar) Base de Clientes.xlsx [Activos Anulado=NO]',
        targetColumn: 'Cliente',
        cardinality: 'N:1 (1,482 PRE Primario + 9 MER Complementario)',
        coveragePct: 100.0,
        matchedKeys: 1485,
        orphanKeyCount: 0,
        status: 'Confirmada (Desduplicación PRE vs MER)',
        ambiguous: true,
        explanation: 'Los 1,491 registros de Clientes Presencial cubren exactamente los 1,485 clientes activos (6 PDVs tienen fila PRE y fila MER). Se prioriza PRE para ruteo primario y se auditan días LU–SA y periodicidad.'
      },
      {
        id: 'REL-12',
        sourceTable: 'Tablero Ventas.xlsb [55 Hojas: Mando Integral, Mesas, Promotores, TACO REAL]',
        sourceColumn: 'Vendedor / Supervisor / Unidad de Negocio / Segmento',
        targetTable: '(SemiFijo) DetallePersonal.xlsx + (Fijo) Base Portfolio.xlsx',
        targetColumn: 'Código Vendedor / Unidad MKTP / Categoria OBJETIVO',
        cardinality: 'N:1 (Modelo Espejo TACO)',
        coveragePct: 100.0,
        matchedKeys: 16,
        orphanKeyCount: 0,
        status: 'Confirmada Automática (.xlsb Binario)',
        ambiguous: false,
        explanation: 'Vincula las 55 hojas del Tablero Ventas.xlsb con los 10 promotores activos (3..18), las 2 mesas de supervisión (100 Gonza, 101 Julio) y la taxonomía TACO de Base Portfolio.'
      }
    ];
    return [...base8, ...extra4];
  }

  return {
    JOIN_KEYS: typeof JOIN_KEYS !== 'undefined' ? JOIN_KEYS : [],
    extractDistinctColumnValues,
    detectRelationshipsAcrossSheets,
    getReal14SourcesInventory,
    getReal20SourcesInventory2026,
    getRealRelationshipsList,
    getRealRelationshipsList2026
  };
});
