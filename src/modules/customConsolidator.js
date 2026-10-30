(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ArgonBI = root.ArgonBI || {};
    root.ArgonBI.CustomConsolidator = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Consolidates an array of inspected files (1 to 10 files) into a runnable ArgonBI bundle
   * without duplicating records, converting Litros -> HL (Litros/100), and excluding pre-aggregated sheets.
   */
  function consolidateInspectedBatch(inspectedFiles, options = {}) {
    const validFiles = (inspectedFiles || []).filter(f => f.status !== 'error' && f.sheets && f.sheets.length > 0);
    if (validFiles.length === 0) {
      throw new Error('No hay fuentes válidas para consolidar en el lote seleccionado.');
    }

    const allSheets = [];
    for (const f of validFiles) {
      for (const s of f.sheets) {
        if (s.validRowCount > 0) {
          allSheets.push({ fileName: f.fileName, sheet: s });
        }
      }
    }

    // 1. Collect Master Unidades de Negocio
    const unMap = new Map(); // cod_un -> nombre_un
    for (const { sheet } of allSheets) {
      if (sheet.classification.classification === 'Unidades de Negocio') {
        const cCod = sheet.columns.findIndex(c => /cod/i.test(c.name) || c.semanticRole === 'unidad_negocio');
        const cNom = sheet.columns.findIndex((c, i) => i !== cCod && (/nombre|desc/i.test(c.name) || c.semanticRole === 'unidad_negocio'));
        for (const r of sheet.cleanRows) {
          const cod = String(r[cCod >= 0 ? cCod : 0] || '').trim();
          const nom = String(r[cNom >= 0 ? cNom : (cCod === 0 ? 1 : 0)] || cod).trim();
          if (cod) unMap.set(cod.toUpperCase(), nom);
        }
      }
    }

    // 2. Collect Master Canales
    const canalLookup = new Map();
    const canalMaster = [];
    for (const { sheet } of allSheets) {
      if (sheet.classification.classification === 'Canales') {
        const cRaw = sheet.columns.findIndex(c => c.semanticRole === 'canal' || c.semanticRole === 'subcanal');
        const cUnif = sheet.columns.findIndex(c => c.semanticRole === 'canal_unificado' || /unificado|canal_mkt/i.test(c.name));
        const cSeg = sheet.columns.findIndex(c => c.semanticRole === 'segmento_canal');
        for (const r of sheet.cleanRows) {
          const raw = String(r[cRaw >= 0 ? cRaw : 0] || '').trim();
          const unif = String(r[cUnif >= 0 ? cUnif : 1] || raw).trim();
          const seg = String(r[cSeg >= 0 ? cSeg : 2] || unif).trim();
          if (raw && !canalLookup.has(raw.toUpperCase())) {
            const item = { canalMkt: raw, canalUnificado: unif, segmentoCanal: seg };
            canalLookup.set(raw.toUpperCase(), item);
            canalMaster.push(item);
          }
        }
      }
    }

    // 3. Collect Master Productos
    const portfolioMap = new Map();
    for (const { sheet } of allSheets) {
      if (sheet.classification.classification === 'Productos / Portfolio') {
        const cCod = sheet.columns.findIndex(c => c.semanticRole === 'cod_producto');
        const cNom = sheet.columns.findIndex(c => c.semanticRole === 'nombre_producto');
        const cUN = sheet.columns.findIndex(c => c.semanticRole === 'unidad_negocio');
        const cDiv = sheet.columns.findIndex(c => c.semanticRole === 'division');
        const cMar = sheet.columns.findIndex(c => c.semanticRole === 'marca');
        const cCal = sheet.columns.findIndex(c => c.semanticRole === 'calibre');

        for (const r of sheet.cleanRows) {
          const code = Number(r[cCod >= 0 ? cCod : 0]);
          if (isNaN(code)) continue;
          // Prevent duplicate PK in product dimension
          if (portfolioMap.has(code)) continue;
          const rawUN = cUN >= 0 && r[cUN] ? String(r[cUN]).trim() : 'GENERAL';
          const resolvedUN = unMap.get(rawUN.toUpperCase()) || rawUN;
          portfolioMap.set(code, {
            codigo: code,
            producto: cNom >= 0 && r[cNom] ? String(r[cNom]).trim() : `Producto #${code}`,
            unidadNegocio: resolvedUN,
            unidadMktp: resolvedUN,
            division: cDiv >= 0 && r[cDiv] ? String(r[cDiv]).trim() : resolvedUN,
            marca: cMar >= 0 && r[cMar] ? String(r[cMar]).trim() : 'MARCA GENERAL',
            calibre: cCal >= 0 && r[cCal] ? String(r[cCal]).trim() : 'ESTÁNDAR',
            sabor: 'REGULAR',
            familia: 'REGULAR',
            enMaestro: true
          });
        }
      }
    }

    // 4. Collect Master Clientes
    const clientesMap = new Map();
    for (const { sheet } of allSheets) {
      if (['Clientes', 'Clientes / Padrón CNC'].includes(sheet.classification.classification)) {
        const cCod = sheet.columns.findIndex(c => c.semanticRole === 'cod_cliente');
        const cNom = sheet.columns.findIndex(c => c.semanticRole === 'nombre_cliente');
        const cCan = sheet.columns.findIndex(c => c.semanticRole === 'canal');
        for (const r of sheet.cleanRows) {
          const code = Number(r[cCod >= 0 ? cCod : 0]);
          if (isNaN(code)) continue;
          if (!clientesMap.has(code)) {
            clientesMap.set(code, {
              codigo: code,
              nombre: cNom >= 0 && r[cNom] ? String(r[cNom]).trim() : `Cliente #${code}`,
              domicilio: '',
              canal: cCan >= 0 && r[cCan] ? String(r[cCan]).trim() : 'General'
            });
          }
        }
      }
    }

    // 5. Collect Sales Facts (excluding 'Indicadores Agregados'!)
    const periodosSet = new Set();
    const canalesSet = new Set();
    const salesRecords = [];
    const seenSalesComposite = new Set();
    const orphanClientKeys = new Set();
    const orphanProductKeys = new Set();
    let convertedLitersRows = 0;

    for (const { sheet } of allSheets) {
      if (sheet.classification.classification !== 'Ventas') continue;
      const cPer = sheet.columns.findIndex(c => c.semanticRole === 'periodo');
      const cCte = sheet.columns.findIndex(c => c.semanticRole === 'cod_cliente');
      const cProd = sheet.columns.findIndex(c => c.semanticRole === 'cod_producto');
      const cCan = sheet.columns.findIndex(c => c.semanticRole === 'canal');
      const cHL = sheet.columns.findIndex(c => c.semanticRole === 'volumen_hl');
      const cLit = sheet.columns.findIndex(c => c.semanticRole === 'volumen_litros');
      const cBul = sheet.columns.findIndex(c => c.semanticRole === 'bultos');
      const cNet = sheet.columns.findIndex(c => c.semanticRole === 'facturacion_neta');
      const cBon = sheet.columns.findIndex(c => c.semanticRole === 'bonificacion');
      const cVend = sheet.columns.findIndex(c => c.semanticRole === 'vendedor');
      const cSup = sheet.columns.findIndex(c => c.semanticRole === 'supervisor');
      const cCCC = sheet.columns.findIndex(c => c.semanticRole === 'ccc_flag');

      for (const r of sheet.cleanRows) {
        const per = cPer >= 0 && r[cPer] ? String(r[cPer]).trim().replace('-', '/') : '2026/01';
        const cte = cCte >= 0 && r[cCte] !== null ? Number(r[cCte]) : 0;
        const prod = cProd >= 0 && r[cProd] !== null ? Number(r[cProd]) : 0;
        const canal = cCan >= 0 && r[cCan] ? String(r[cCan]).trim() : 'General';
        const vend = cVend >= 0 && r[cVend] !== null ? Number(r[cVend]) : 1;
        const sup = cSup >= 0 && r[cSup] !== null ? Number(r[cSup]) : 100;

        // Calculate HL: if column is in Liters and no HL column is present, convert HL = Litros / 100
        let hl = 0;
        if (cHL >= 0 && r[cHL] !== null) {
          hl = Number(r[cHL]) || 0;
        } else if (cLit >= 0 && r[cLit] !== null) {
          hl = (Number(r[cLit]) || 0) / 100;
          convertedLitersRows++;
        }

        const bultos = cBul >= 0 && r[cBul] !== null ? (Number(r[cBul]) || 0) : Number((hl * 10).toFixed(2));
        const neto = cNet >= 0 && r[cNet] !== null ? (Number(r[cNet]) || 0) : 0;
        const bonif = cBon >= 0 && r[cBon] !== null ? (Number(r[cBon]) || 0) : 0;
        const ccc = cCCC >= 0 && r[cCCC] !== null ? (Number(r[cCCC]) || 0) : (hl > 0 || neto > 0 ? 1 : 0);

        const compKey = `${per}|${cte}|${prod}|${vend}|${hl.toFixed(4)}|${neto.toFixed(2)}`;
        if (seenSalesComposite.has(compKey)) continue;
        seenSalesComposite.add(compKey);

        periodosSet.add(per);
        canalesSet.add(canal);

        if (cte && !clientesMap.has(cte)) {
          orphanClientKeys.add(cte);
          clientesMap.set(cte, { codigo: cte, nombre: `Cliente #${cte} (Sin Maestro)`, domicilio: '', canal, orphan: true });
        }
        if (prod && !portfolioMap.has(prod)) {
          orphanProductKeys.add(prod);
          portfolioMap.set(prod, {
            codigo: prod,
            producto: `Producto #${prod} (Sin Maestro)`,
            unidadNegocio: 'SIN MAESTRO',
            unidadMktp: 'SIN MAESTRO',
            division: 'SIN MAESTRO',
            marca: 'SIN MAESTRO',
            calibre: 'N/A',
            sabor: 'N/A',
            familia: 'N/A',
            enMaestro: false
          });
        }

        salesRecords.push({ per, cte, prod, canal, vend, sup, ccc, bultos, hl, neto, bonif, source: 0 });
      }
    }

    // 6. Collect Objectives
    const objRecords = [];
    for (const { sheet } of allSheets) {
      if (sheet.classification.classification !== 'Objetivos') continue;
      const cPer = sheet.columns.findIndex(c => c.semanticRole === 'periodo');
      const cCan = sheet.columns.findIndex(c => c.semanticRole === 'canal');
      const cProd = sheet.columns.findIndex(c => c.semanticRole === 'cod_producto');
      const cUN = sheet.columns.findIndex(c => c.semanticRole === 'unidad_negocio');
      const cObj = sheet.columns.findIndex(c => c.semanticRole === 'objetivo_hl');

      for (const r of sheet.cleanRows) {
        const per = cPer >= 0 && r[cPer] ? String(r[cPer]).trim().replace('-', '/') : '2026/01';
        const canal = cCan >= 0 && r[cCan] ? String(r[cCan]).trim() : 'Tradicional';
        const objHL = cObj >= 0 && r[cObj] !== null ? (Number(r[cObj]) || 0) : 0;
        let prod = cProd >= 0 && r[cProd] !== null ? Number(r[cProd]) : null;
        if (!prod && cUN >= 0 && r[cUN]) {
          const rawUN = String(r[cUN]).trim();
          const resolvedUN = unMap.get(rawUN.toUpperCase()) || rawUN;
          const matchingProd = [...portfolioMap.values()].find(p => p.unidadNegocio === resolvedUN);
          prod = matchingProd ? matchingProd.codigo : 0;
        }
        periodosSet.add(per);
        canalesSet.add(canal);
        objRecords.push({ per, prod: prod || 0, canal, vend: 1, sup: 100, hl: objHL });
      }
    }

    const perDict = [...periodosSet].sort();
    const perIdxMap = new Map(perDict.map((p, i) => [p, i]));
    const canalDict = [...canalesSet].sort();
    const canalIdxMap = new Map(canalDict.map((c, i) => [c, i]));

    const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const tiempoList = perDict.map(per => {
      const anio = parseInt(per.slice(0, 4), 10);
      const mesNum = parseInt(per.slice(5, 7), 10) || 1;
      return {
        anio,
        periodo: per,
        mesNombre: monthNames[mesNum - 1] || per,
        nroMesLabel: `${String(mesNum).padStart(2, '0')} - ${monthNames[mesNum - 1] || per}`,
        mesNum,
        trimestre: `${Math.ceil(mesNum / 3)}Q`,
        aVig: anio === 2026 ? 'Año Actual' : 'A.Anterior',
        bimestre: `${Math.ceil(mesNum / 2)}B`
      };
    });

    return {
      meta: {
        generatedAt: new Date().toISOString(),
        version: '1.0.0-custom',
        totalFiles: validFiles.length,
        convertedLitersRows,
        orphanClientKeys: [...orphanClientKeys],
        orphanProductKeys: [...orphanProductKeys]
      },
      dictionaries: {
        periodos: perDict,
        canalesRaw: canalDict,
        canalesResolved: canalDict.map(c => {
          const found = canalLookup.get(c.toUpperCase());
          return found
            ? { rawCanal: c, canalMkt: found.canalMkt, canalUnificado: found.canalUnificado, segmentoCanal: found.segmentoCanal, matchType: 'exacto' }
            : { rawCanal: c, canalMkt: c, canalUnificado: c, segmentoCanal: 'GENERAL', matchType: 'directo' };
        })
      },
      masters: {
        tiempo: tiempoList,
        canalMkt: canalMaster,
        subcanalesMkt: [],
        personal: [{ codigo: 1, nombre: 'Fuerza de Venta General', cargo: 'VENDEDOR', superior: 'SUPERVISOR GENERAL' }],
        portfolio: [...portfolioMap.values()],
        clientes: [...clientesMap.values()]
      },
      salesColumnar: {
        count: salesRecords.length,
        per: salesRecords.map(s => perIdxMap.get(s.per)),
        cte: salesRecords.map(s => s.cte),
        prod: salesRecords.map(s => s.prod),
        canal: salesRecords.map(s => canalIdxMap.get(s.canal)),
        vend: salesRecords.map(s => s.vend),
        sup: salesRecords.map(s => s.sup),
        ccc: salesRecords.map(s => s.ccc),
        bultos: salesRecords.map(s => s.bultos),
        hl: salesRecords.map(s => s.hl),
        neto: salesRecords.map(s => s.neto),
        bonif: salesRecords.map(s => s.bonif),
        source: salesRecords.map(s => s.source)
      },
      objColumnar: {
        count: objRecords.length,
        rawRowCount: objRecords.length,
        per: objRecords.map(o => perIdxMap.get(o.per)),
        prod: objRecords.map(o => o.prod),
        canal: objRecords.map(o => canalIdxMap.get(o.canal)),
        vend: objRecords.map(o => o.vend),
        sup: objRecords.map(o => o.sup),
        hl: objRecords.map(o => o.hl)
      },
      cncColumnar: { count: 0, per: [], cte: [], canal: [], univ: [], act: [], cnc: [] },
      eficienciaAgg: [],
      mxpdvAgg: [],
      rechazos: [],
      activosFijos: [],
      negociaciones: { items: [], modosAtencion: [], gruposProductosCount: 0 }
    };
  }

  /**
   * Funciones reutilizables de normalización de claves (Sección 10)
   */
  function normalizeTextKey(val) {
    if (val === null || val === undefined) return '';
    return String(val)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  function normalizeClientId(val) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return Number.isFinite(val) ? Math.trunc(val) : 0;
    const s = String(val).trim().replace(/^0+(?=\d)/, '').replace(/\.0+$/, '');
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
  }

  function normalizeProductId(val) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return Number.isFinite(val) ? Math.trunc(val) : 0;
    const s = String(val).trim().replace(/^0+(?=\d)/, '').replace(/\.0+$/, '');
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
  }

  function normalizePeriod(val, fallback = null) {
    if (val === null || val === undefined || val === '') return fallback;
    const s = String(val).trim().replace(/-/g, '/');
    const m = s.match(/^(\d{4})\/(\d{1,2})$/);
    if (m) return `${m[1]}/${String(parseInt(m[2], 10)).padStart(2, '0')}`;
    const m2 = s.match(/^(\d{1,2})\/(\d{4})$/);
    if (m2) return `${m2[2]}/${String(parseInt(m2[1], 10)).padStart(2, '0')}`;
    return fallback;
  }

  function normalizeDate(val) {
    if (val === null || val === undefined || val === '') return null;
    if (val instanceof Date && !isNaN(val.getTime())) {
      return val.toISOString().slice(0, 10);
    }
    if (typeof val === 'number' && val > 25000 && val < 80000) {
      // Excel serial date
      const utcDays = Math.floor(val - 25569);
      const d = new Date(utcDays * 86400 * 1000);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    const s = String(val).trim();
    const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (iso) {
      return `${iso[1]}-${String(parseInt(iso[2], 10)).padStart(2, '0')}-${String(parseInt(iso[3], 10)).padStart(2, '0')}`;
    }
    const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmy) {
      return `${dmy[3]}-${String(parseInt(dmy[2], 10)).padStart(2, '0')}-${String(parseInt(dmy[1], 10)).padStart(2, '0')}`;
    }
    return null;
  }

  /**
   * Performs an atomic monthly partition replacement (REPLACE MONTH) on an existing bundle.
   * Replaces ONLY the sales records for the detected/target partition (e.g. '2026/10'),
   * while keeping historical closed months (2025/01..2025/12, 2026/01..2026/09) 100% intact.
   *
   * @param {Object} bundle - Target ArgonBI bundle (e.g. __ARGON_REAL_BUNDLE__)
   * @param {Array|Object} incomingData - Array of parsed record objects, raw Excel rows, OR an inspected sheet object
   * @param {Object} [options] - Options { partitionPeriod: '2026/10', sourceIndex: 1, fileName: 'Base a la Fecha MA.xlsx' }
   * @returns {Object} Result summary with updated count, pre/post diagnostic, and normalized rows
   */
  function upsertSalesPartition(bundle, incomingData, options = {}) {
    if (!bundle || !bundle.salesColumnar || !bundle.dictionaries) {
      throw new Error('Bundle inválido para upsert de partición');
    }

    // 1. Normalize incoming records into array of standardized sales items
    const rawItems = [];
    let minDate = null;
    let maxDate = null;
    const trackDate = (rawFecha) => {
      const iso = normalizeDate(rawFecha);
      if (!iso) return;
      if (!minDate || iso < minDate) minDate = iso;
      if (!maxDate || iso > maxDate) maxDate = iso;
    };

    if (Array.isArray(incomingData)) {
      for (const r of incomingData) {
        if (!r || typeof r !== 'object') continue;
        if (r.per !== undefined && r.cte !== undefined && r.prod !== undefined) {
          const per = normalizePeriod(r.per, normalizePeriod(options.partitionPeriod, null));
          const cte = normalizeClientId(r.cte);
          const prod = normalizeProductId(r.prod);
          if (!per || (cte === 0 && prod === 0)) continue;
          const hl = Number(r.hl) || 0;
          const neto = Number(r.neto) || 0;
          const bultos = r.bultos !== undefined ? (Number(r.bultos) || 0) : Number((hl * 10).toFixed(2));
          const bonif = Number(r.bonif) || 0;
          const vend = Number(r.vend) || 1;
          const sup = Number(r.sup) || ([6, 7, 8, 11].includes(vend) ? 101 : (vend === 10 ? 99 : 100));
          const ccc = r.ccc !== undefined ? (Number(r.ccc) || 0) : (hl > 0 || neto > 0 ? 1 : 0);
          const canal = r.canal ? String(r.canal).trim() : 'General';
          if (r.fecha) trackDate(r.fecha);
          rawItems.push({ per, cte, prod, canal, vend, sup, ccc, bultos, hl, neto, bonif, source: options.sourceIndex || 1 });
        } else {
          // Raw Excel object from XLSX.utils.sheet_to_json
          const rawPer = r['Año/Mes'] ?? r['Periodo'] ?? r['Período'] ?? r['AÑO/MES'] ?? r['periodo'];
          const rawCte = r['Código Cliente'] ?? r['Codigo Cliente'] ?? r['Cliente'] ?? r['Cod Cliente'] ?? r['cte'];
          const rawProd = r['Código Producto'] ?? r['Codigo Producto'] ?? r['Producto'] ?? r['Cod Producto'] ?? r['prod'];
          // Skip metadata/descriptor row (e.g. 'CARÁCTER', 'ENTERO', 'NÚMERO')
          if (typeof rawCte === 'string' && /CARACTER|CARÁCTER|ENTERO|NUMERO|NÚMERO|TEXTO/i.test(rawCte)) continue;
          if (typeof rawPer === 'string' && /CARACTER|CARÁCTER|ENTERO|FECHA/i.test(rawPer)) continue;
          const per = normalizePeriod(rawPer, normalizePeriod(options.partitionPeriod, null));
          const cte = normalizeClientId(rawCte);
          const prod = normalizeProductId(rawProd);
          if (!per || (cte === 0 && prod === 0)) continue;

          const rawHL = r['Cantidad Total en HL'] ?? r['Volumen HL'] ?? r['HL'] ?? r['hl'];
          const rawLit = r['Cantidad Total en Litros'] ?? r['Litros'] ?? r['Volumen Litros'];
          let hl = 0;
          if (rawHL !== undefined && rawHL !== null && rawHL !== '') {
            hl = Number(rawHL) || 0;
          } else if (rawLit !== undefined && rawLit !== null && rawLit !== '') {
            hl = (Number(rawLit) || 0) / 100;
          }
          const rawBul = r['Cantidad Bultos'] ?? r['Bultos'] ?? r['bultos'];
          const bultos = rawBul !== undefined && rawBul !== null && rawBul !== '' ? (Number(rawBul) || 0) : Number((hl * 10).toFixed(2));
          const neto = Number(r['Importe Neto'] ?? r['Facturacion Neta'] ?? r['Neto'] ?? r['neto'] ?? 0) || 0;
          const bonif = Number(r['Importe Bonificacion'] ?? r['Bonificacion'] ?? r['bonif'] ?? 0) || 0;
          const vend = normalizeClientId(r['Código Vendedor'] ?? r['Codigo Vendedor'] ?? r['Vendedor'] ?? r['vend']) || 1;
          const rawSup = r['Supervisor'] ?? r['Código Supervisor'] ?? r['sup'];
          const sup = normalizeClientId(rawSup) || ([6, 7, 8, 11].includes(vend) ? 101 : (vend === 10 ? 99 : 100));
          const rawCCC = r['Clientes con Compra'] ?? r['Clientes Con Compra'] ?? r['CCC'] ?? r['ccc'];
          const ccc = rawCCC !== undefined && rawCCC !== null && rawCCC !== '' ? (Number(rawCCC) || 0) : (hl > 0 || neto > 0 ? 1 : 0);
          const canal = String(r['Canal MKT'] ?? r['Canal'] ?? r['canal'] ?? 'General').trim() || 'General';
          const rawFecha = r['Fecha Comprobante'] ?? r['Fecha'] ?? r['fecha'];
          if (rawFecha) trackDate(rawFecha);

          rawItems.push({ per, cte, prod, canal, vend, sup, ccc, bultos, hl, neto, bonif, source: options.sourceIndex || 1 });
        }
      }
    } else if (incomingData && incomingData.cleanRows && incomingData.columns) {
      const sheet = incomingData;
      const cPer = sheet.columns.findIndex(c => c.semanticRole === 'periodo' || /a[ñn]o.*mes|periodo/i.test(c.name));
      const cCte = sheet.columns.findIndex(c => c.semanticRole === 'cod_cliente' || /cod.*cliente/i.test(c.name));
      const cProd = sheet.columns.findIndex(c => c.semanticRole === 'cod_producto' || /cod.*producto/i.test(c.name));
      const cCan = sheet.columns.findIndex(c => c.semanticRole === 'canal' || /canal/i.test(c.name));
      const cHL = sheet.columns.findIndex(c => c.semanticRole === 'volumen_hl' || /cantidad.*hl|\bhl\b/i.test(c.name));
      const cLit = sheet.columns.findIndex(c => c.semanticRole === 'volumen_litros');
      const cBul = sheet.columns.findIndex(c => c.semanticRole === 'bultos' || /bultos/i.test(c.name));
      const cNet = sheet.columns.findIndex(c => c.semanticRole === 'facturacion_neta' || /importe.*neto|neto/i.test(c.name));
      const cBon = sheet.columns.findIndex(c => c.semanticRole === 'bonificacion' || /bonificaci/i.test(c.name));
      const cVend = sheet.columns.findIndex(c => c.semanticRole === 'vendedor' || /vendedor/i.test(c.name));
      const cSup = sheet.columns.findIndex(c => c.semanticRole === 'supervisor' || /supervisor/i.test(c.name));
      const cCCC = sheet.columns.findIndex(c => c.semanticRole === 'ccc_flag' || /^ccc$/i.test(c.name) || /clientes\s*con\s*compra/i.test(c.name));
      const cFecha = sheet.columns.findIndex(c => c.semanticRole === 'fecha' || /fecha/i.test(c.name));

      for (const r of sheet.cleanRows) {
        const rawCteVal = cCte >= 0 ? r[cCte] : null;
        if (typeof rawCteVal === 'string' && /CARACTER|CARÁCTER|ENTERO|NUMERO|NÚMERO|TEXTO/i.test(rawCteVal)) continue;
        const per = normalizePeriod(cPer >= 0 ? r[cPer] : null, normalizePeriod(options.partitionPeriod, null));
        const cte = normalizeClientId(rawCteVal);
        const prod = normalizeProductId(cProd >= 0 ? r[cProd] : null);
        if (!per || (cte === 0 && prod === 0)) continue;

        const canal = cCan >= 0 && r[cCan] ? String(r[cCan]).trim() : 'General';
        const vend = cVend >= 0 && r[cVend] !== null ? (normalizeClientId(r[cVend]) || 1) : 1;
        const sup = cSup >= 0 && r[cSup] !== null
          ? (normalizeClientId(r[cSup]) || ([6, 7, 8, 11].includes(vend) ? 101 : (vend === 10 ? 99 : 100)))
          : ([6, 7, 8, 11].includes(vend) ? 101 : (vend === 10 ? 99 : 100));

        let hl = 0;
        if (cHL >= 0 && r[cHL] !== null && r[cHL] !== undefined && r[cHL] !== '') {
          hl = Number(r[cHL]) || 0;
        } else if (cLit >= 0 && r[cLit] !== null && r[cLit] !== undefined && r[cLit] !== '') {
          hl = (Number(r[cLit]) || 0) / 100;
        }

        const bultos = cBul >= 0 && r[cBul] !== null && r[cBul] !== undefined && r[cBul] !== '' ? (Number(r[cBul]) || 0) : Number((hl * 10).toFixed(2));
        const neto = cNet >= 0 && r[cNet] !== null ? (Number(r[cNet]) || 0) : 0;
        const bonif = cBon >= 0 && r[cBon] !== null ? (Number(r[cBon]) || 0) : 0;
        const ccc = cCCC >= 0 && r[cCCC] !== null && r[cCCC] !== undefined && r[cCCC] !== '' ? (Number(r[cCCC]) || 0) : (hl > 0 || neto > 0 ? 1 : 0);
        if (cFecha >= 0 && r[cFecha]) trackDate(r[cFecha]);

        rawItems.push({ per, cte, prod, canal, vend, sup, ccc, bultos, hl, neto, bonif, source: options.sourceIndex || 1 });
      }
    }

    // Validate before modifying bundle (atomic rollback guarantee)
    if (rawItems.length === 0) {
      return {
        success: false,
        rolledBack: true,
        message: 'No se encontraron registros válidos con período AAAA/MM para la partición mensual. Se preservaron los datos anteriores.'
      };
    }

    // Determine detected periods and target partition(s) to replace
    const allPeriodsSet = new Set(rawItems.map(it => it.per).filter(Boolean));
    const allPeriodsDetected = [...allPeriodsSet].sort();
    const explicitPeriod = normalizePeriod(options.partitionPeriod, null);

    let targetPartitions;
    let newItems;
    if (explicitPeriod && allPeriodsSet.has(explicitPeriod)) {
      targetPartitions = new Set([explicitPeriod]);
      newItems = rawItems.filter(it => it.per === explicitPeriod);
    } else if (explicitPeriod && allPeriodsSet.size === 1) {
      // Single period in file
      const filePer = allPeriodsDetected[0];
      targetPartitions = new Set([filePer]);
      newItems = rawItems;
    } else {
      targetPartitions = new Set(allPeriodsDetected);
      newItems = rawItems;
    }

    if (newItems.length === 0 || targetPartitions.size === 0) {
      return {
        success: false,
        rolledBack: true,
        message: 'Ninguna fila coincide con el período objetivo solicitado. Se preservaron los datos anteriores.'
      };
    }

    const detectedPeriod = [...targetPartitions].sort().slice(-1)[0];

    // 2. Build Pre-replace & Post-ingest Diagnostic (Sección 18)
    const cliMasterMap = new Map();
    for (const c of (bundle.masters && bundle.masters.clientes) || []) {
      const id = normalizeClientId(c.codigo);
      if (id && !cliMasterMap.has(id)) cliMasterMap.set(id, c);
    }
    const prodMasterMap = new Map();
    for (const p of (bundle.masters && bundle.masters.portfolio) || []) {
      const id = normalizeProductId(p.codigo);
      if (id && !prodMasterMap.has(id)) prodMasterMap.set(id, p);
    }

    const uniqueClients = new Set();
    const uniqueProducts = new Set();
    const unmatchedClients = new Set();
    const unmatchedProducts = new Set();
    const anuladosClients = new Set();
    let anuladosRowsCount = 0;
    let anuladosHL = 0;
    let monthTotalHL = 0;
    let activeMonthTotalHL = 0;
    let monthTotalNeto = 0;
    let duplicatesFoundCount = 0;
    const seenSig = new Set();

    for (const it of newItems) {
      monthTotalHL += it.hl;
      monthTotalNeto += it.neto;
      if (it.cte > 0) {
        uniqueClients.add(it.cte);
        const cli = cliMasterMap.get(it.cte);
        if (!cli) {
          unmatchedClients.add(it.cte);
          activeMonthTotalHL += it.hl;
        } else if (normalizeTextKey(cli.anulado) === 'SI') {
          anuladosClients.add(it.cte);
          anuladosRowsCount++;
          anuladosHL += it.hl;
        } else {
          activeMonthTotalHL += it.hl;
        }
      } else {
        activeMonthTotalHL += it.hl;
      }
      if (it.prod > 0) {
        uniqueProducts.add(it.prod);
        if (!prodMasterMap.has(it.prod)) {
          unmatchedProducts.add(it.prod);
        }
      }
      const sig = `${it.per}|${it.cte}|${it.prod}|${it.vend}|${it.hl.toFixed(4)}|${it.bultos.toFixed(2)}|${it.neto.toFixed(2)}`;
      if (seenSig.has(sig)) {
        duplicatesFoundCount++;
      } else {
        seenSig.add(sig);
      }
    }

    // 3. Extract existing records from bundle.salesColumnar, excluding records in targetPartitions
    const perDict = [...bundle.dictionaries.periodos];
    const canalDict = [...(bundle.dictionaries.canalesRaw || [])];
    const sCol = bundle.salesColumnar;
    const existingPreserved = [];
    let replacedCount = 0;

    for (let i = 0; i < sCol.count; i++) {
      const perStr = perDict[sCol.per[i]];
      if (targetPartitions.has(perStr)) {
        replacedCount++;
      } else {
        existingPreserved.push({
          per: perStr,
          cte: sCol.cte[i],
          prod: sCol.prod[i],
          canal: canalDict[sCol.canal[i]] || 'General',
          vend: sCol.vend[i],
          sup: sCol.sup[i],
          ccc: sCol.ccc[i],
          bultos: sCol.bultos[i],
          hl: sCol.hl[i],
          neto: sCol.neto[i],
          bonif: sCol.bonif ? sCol.bonif[i] : 0,
          source: sCol.source ? sCol.source[i] : 0
        });
      }
    }

    // 4. Update dictionaries if new periods or channels appear
    for (const p of targetPartitions) {
      if (!perDict.includes(p)) {
        perDict.push(p);
      }
    }
    perDict.sort();

    for (const it of newItems) {
      if (it.canal && !canalDict.includes(it.canal)) {
        canalDict.push(it.canal);
      }
    }
    canalDict.sort();

    bundle.dictionaries.periodos = perDict;
    bundle.dictionaries.canalesRaw = canalDict;

    // Update masters.tiempo if new period was added
    const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    bundle.masters.tiempo = perDict.map(per => {
      const anio = parseInt(per.slice(0, 4), 10);
      const mesNum = parseInt(per.slice(5, 7), 10) || 1;
      return {
        anio,
        periodo: per,
        mesNombre: monthNames[mesNum - 1] || per,
        nroMesLabel: `${String(mesNum).padStart(2, '0')} - ${monthNames[mesNum - 1] || per}`,
        mesNum,
        trimestre: `${Math.ceil(mesNum / 3)}Q`,
        aVig: anio === 2026 ? 'Año Actual' : 'A.Anterior',
        bimestre: `${Math.ceil(mesNum / 2)}B`
      };
    });

    // 5. Combine preserved records + new partitioned records
    const allRecords = existingPreserved.concat(newItems);
    const perIdxMap = new Map(perDict.map((p, i) => [p, i]));
    const canalIdxMap = new Map(canalDict.map((c, i) => [c, i]));

    // 6. Re-pack salesColumnar
    bundle.salesColumnar = {
      count: allRecords.length,
      per: allRecords.map(s => perIdxMap.get(s.per)),
      cte: allRecords.map(s => s.cte),
      prod: allRecords.map(s => s.prod),
      canal: allRecords.map(s => canalIdxMap.get(s.canal)),
      vend: allRecords.map(s => s.vend),
      sup: allRecords.map(s => s.sup),
      ccc: allRecords.map(s => s.ccc),
      bultos: allRecords.map(s => s.bultos),
      hl: allRecords.map(s => s.hl),
      neto: allRecords.map(s => s.neto),
      bonif: allRecords.map(s => s.bonif),
      source: allRecords.map(s => s.source)
    };

    const diagnostic = {
      timestamp: new Date().toISOString(),
      fileName: options.fileName || 'Base a la fecha MA',
      detectedPeriod,
      allPeriodsDetected,
      minDate: minDate || `${detectedPeriod.replace('/', '-')}-01`,
      maxDate: maxDate || `${detectedPeriod.replace('/', '-')}-21`,
      replacedCount,
      appendedCount: newItems.length,
      preservedHistoricalCount: existingPreserved.length,
      totalSalesRows: allRecords.length,
      monthTotalHL: Number(monthTotalHL.toFixed(2)),
      activeMonthTotalHL: Number(activeMonthTotalHL.toFixed(2)),
      monthTotalNeto: Number(monthTotalNeto.toFixed(2)),
      uniqueClientsCount: uniqueClients.size,
      uniqueProductsCount: uniqueProducts.size,
      unmatchedClientsCount: unmatchedClients.size,
      unmatchedClientsSample: [...unmatchedClients].slice(0, 10),
      unmatchedProductsCount: unmatchedProducts.size,
      unmatchedProductsSample: [...unmatchedProducts].slice(0, 10),
      anuladosDescartadosClientsCount: anuladosClients.size,
      anuladosDescartadosRowsCount: anuladosRowsCount,
      anuladosDescartadosHL: Number(anuladosHL.toFixed(2)),
      duplicatesFoundCount
    };

    // 7. Invalidate all cached indexes & relational models so CommercialMathEngine & GalaxiaEngine recalculate immediately
    delete bundle._indexed;
    delete bundle._tacoIdx;
    delete bundle._relModel;
    delete bundle._salesByClientCache;
    bundle._lastIngestionDiagnostic = diagnostic;

    const newMaxMonth2026 = Math.max(...perDict.filter(p => p.startsWith('2026/')).map(p => parseInt(p.slice(5, 7), 10)));

    return {
      success: true,
      detectedPeriod,
      partitionPeriods: [...targetPartitions],
      replacedCount,
      appendedCount: newItems.length,
      preservedHistoricalCount: existingPreserved.length,
      totalSalesRows: allRecords.length,
      newMaxMonth2026,
      diagnostic,
      normalizedRows: newItems
    };
  }

  return {
    consolidateInspectedBatch,
    upsertSalesPartition,
    normalizeClientId,
    normalizeProductId,
    normalizePeriod,
    normalizeDate,
    normalizeTextKey
  };
});

