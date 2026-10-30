(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const XLSX = require('../../vendor/xlsx.full.min.js');
    module.exports = factory(XLSX, null, null);
  } else {
    root.ArgonBI = root.ArgonBI || {};
    root.ArgonBI.ExportEngine = factory(root.XLSX, root.jspdf, root.PptxGenJS);
  }
})(typeof self !== 'undefined' ? self : this, function (XLSX, jspdfLib, PptxGenJSLib) {
  'use strict';

  function fmt(n, dec = 2) {
    if (n === null || n === undefined || isNaN(Number(n))) return 'N/A';
    return Number(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function buildFilterSummaryText(filters) {
    const f = filters || {};
    return [
      `Modo Comparación: ${f.modoComparacion || 'YTD'}`,
      `Mes: ${f.mes || 'ALL'}`,
      `Trimestre: ${f.trimestre || 'ALL'}`,
      `Canal: ${f.canal || 'ALL'}`,
      `Canal Unificado: ${f.canalUnificado || 'ALL'}`,
      `Unidad de Negocio: ${f.unidadNegocio || 'ALL'}`,
      `División: ${f.division || 'ALL'}`,
      `Producto: ${f.producto || 'ALL'}`,
      `Cliente: ${f.cliente || 'ALL'}`,
      `Vendedor: ${f.vendedor || 'ALL'}`,
      `Supervisor: ${f.supervisor || 'ALL'}`,
      `Incluir POP: ${f.includePOP !== false ? 'Sí' : 'No'}`
    ].join(' | ');
  }

  // 1. CSV Export (UTF-8 with BOM)
  function generateCSVContent(dashboardState, insights, inventory, groupKey = 'canal') {
    const { filters, kpis, monthlySeries, quarterlySeries, byCanal, byUnidadNegocio, byDivision, byProducto } = dashboardState;
    const lines = [];
    const esc = val => {
      if (val === null || val === undefined) return '""';
      const s = String(val).replace(/"/g, '""');
      return `"${s}"`;
    };

    lines.push([esc('SISTEMA DE INTELIGENCIA COMERCIAL MULTIFUENTE — ARGON HIGH BI')].join(';'));
    lines.push([esc('Período Analizado'), esc(kpis.periodoLabel)].join(';'));
    lines.push([esc('Filtros Activos'), esc(buildFilterSummaryText(filters))].join(';'));
    lines.push([esc('Fuentes Utilizadas'), esc((inventory || []).map(i => i.fileName).join(', '))].join(';'));
    lines.push([esc('Fecha de Exportación'), esc(new Date().toISOString())].join(';'));
    lines.push('');

    lines.push([esc('INDICADOR PRINCIPAL'), esc('ACTUAL (2026)'), esc('AÑO ANTERIOR (2025)'), esc('DIFERENCIA ABSOLUTA'), esc('VARIACIÓN %')].join(';'));
    lines.push([esc('Volumen Vendido (HL)'), kpis.volumenHL.actual, kpis.volumenHL.prev, kpis.volumenHL.diff, esc(kpis.volumenHL.varPctFormatted)].join(';'));
    lines.push([esc('Cantidad en Bultos'), kpis.bultos.actual, kpis.bultos.prev, kpis.bultos.diff, esc(kpis.bultos.varPctFormatted)].join(';'));
    lines.push([esc('Facturación Neta ($)'), kpis.facturacionNeta.actual, kpis.facturacionNeta.prev, kpis.facturacionNeta.diff, esc(kpis.facturacionNeta.varPctFormatted)].join(';'));
    lines.push([esc('Bonificaciones ($)'), kpis.bonificaciones.actual, kpis.bonificaciones.prev, kpis.bonificaciones.diff, esc(kpis.bonificaciones.varPctFormatted)].join(';'));
    lines.push([esc('Clientes con Compra Únicos (CCC)'), kpis.ccc.actual, kpis.ccc.prev, kpis.ccc.diff, esc(kpis.ccc.varPctFormatted)].join(';'));
    lines.push([esc('Cantidad de Operaciones'), kpis.operaciones.actual, kpis.operaciones.prev, kpis.operaciones.diff, esc(kpis.operaciones.varPctFormatted)].join(';'));
    lines.push([esc('Precio Promedio por HL ($/HL)'), kpis.precioPromedioHL.actual, kpis.precioPromedioHL.prev, kpis.precioPromedioHL.diff, esc(kpis.precioPromedioHL.varPctFormatted)].join(';'));
    lines.push('');

    let groupList = byCanal;
    let groupTitle = 'Canal Comercial';
    if (groupKey === 'un') { groupList = byUnidadNegocio; groupTitle = 'Unidad de Negocio'; }
    else if (groupKey === 'mes') { groupList = monthlySeries; groupTitle = 'Mes'; }
    else if (groupKey === 'trimestre') { groupList = quarterlySeries; groupTitle = 'Trimestre'; }
    else if (groupKey === 'division') { groupList = byDivision; groupTitle = 'División'; }
    else if (groupKey === 'producto') { groupList = byProducto.slice(0, 100); groupTitle = 'Producto'; }

    lines.push([esc(`DESGLOSE POR ${groupTitle.toUpperCase()}`), esc('VOLUMEN 2026 (HL)'), esc('VOLUMEN 2025 (HL)'), esc('DIF HL'), esc('VAR % HL'), esc('FACTURACIÓN 2026 ($)'), esc('FACTURACIÓN 2025 ($)'), esc('VAR % FACT'), esc('CCC 2026'), esc('CCC 2025'), esc('PARTICIPACIÓN % HL 2026'), esc('OBJETIVO 2026 (HL)'), esc('CUMPLIMIENTO %')].join(';'));

    for (const row of groupList) {
      const name = row.label || row.mesNombre || row.quarter;
      lines.push([
        esc(name),
        row.hl26,
        row.hl25,
        row.hlDiff,
        row.hlVarPct !== null ? row.hlVarPct : esc('N/A'),
        row.neto26,
        row.neto25,
        row.netoVarPct !== null ? row.netoVarPct : esc('N/A'),
        row.ccc26,
        row.ccc25,
        row.shareHL26 !== undefined ? row.shareHL26 : esc('N/A'),
        row.objHL26 !== undefined ? row.objHL26 : 0,
        row.cumplObj26Pct !== null && row.cumplObj26Pct !== undefined ? row.cumplObj26Pct : esc('N/A')
      ].join(';'));
    }

    return '\uFEFF' + lines.join('\r\n');
  }

  // 2. Multi-sheet Excel (.xlsx) Export
  function generateExcelWorkbookBuffer(dashboardState, insights, inventory) {
    const { filters, kpis, monthlySeries, quarterlySeries, byCanal, byUnidadNegocio, byProducto } = dashboardState;
    const wb = XLSX.utils.book_new();

    // Sheet 1: KPIs y Metadatos
    const wsKpisData = [
      ['INFORME COMERCIAL EJECUTIVO — DISTRIBUIDORA DE BEBIDAS (ARGON BI)'],
      ['Período Analizado', kpis.periodoLabel],
      ['Filtros Activos', buildFilterSummaryText(filters)],
      ['Fuentes Utilizadas (14 Archivos Reales)', (inventory || []).map(i => i.fileName).join(', ')],
      ['Fecha de Generación', new Date().toISOString()],
      [],
      ['Indicador Principal', 'Valor Actual (2026)', 'Año Anterior (2025)', 'Diferencia Absoluta', 'Variación %', 'Año Completo 2025 (12m)'],
      ['Volumen Vendido (HL)', kpis.volumenHL.actual, kpis.volumenHL.prev, kpis.volumenHL.diff, kpis.volumenHL.varPctFormatted, kpis.fullYear2025Reference.hl],
      ['Cantidad en Bultos', kpis.bultos.actual, kpis.bultos.prev, kpis.bultos.diff, kpis.bultos.varPctFormatted, ''],
      ['Facturación Neta ($)', kpis.facturacionNeta.actual, kpis.facturacionNeta.prev, kpis.facturacionNeta.diff, kpis.facturacionNeta.varPctFormatted, kpis.fullYear2025Reference.neto],
      ['Bonificaciones Totales ($)', kpis.bonificaciones.actual, kpis.bonificaciones.prev, kpis.bonificaciones.diff, kpis.bonificaciones.varPctFormatted, ''],
      ['Clientes con Compra Únicos (CCC)', kpis.ccc.actual, kpis.ccc.prev, kpis.ccc.diff, kpis.ccc.varPctFormatted, kpis.fullYear2025Reference.ccc],
      ['Cantidad de Operaciones', kpis.operaciones.actual, kpis.operaciones.prev, kpis.operaciones.diff, kpis.operaciones.varPctFormatted, ''],
      ['Precio Promedio por HL ($/HL)', kpis.precioPromedioHL.actual, kpis.precioPromedioHL.prev, kpis.precioPromedioHL.diff, kpis.precioPromedioHL.varPctFormatted, ''],
      ['Objetivo Comercial (HL)', kpis.objetivoHL.obj26, kpis.objetivoHL.obj25, kpis.objetivoHL.gapHL26, kpis.objetivoHL.cumplimiento26Pct !== null ? `${kpis.objetivoHL.cumplimiento26Pct}% cumpl.` : 'N/A', kpis.fullYear2025Reference.objHL]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsKpisData), 'Resumen_KPIs');

    // Sheet 2: Evolución Mensual
    const wsMonthlyData = [
      ['Mes Nro', 'Mes', 'Trimestre', 'Volumen 2026 (HL)', 'Volumen 2025 (HL)', 'Dif HL', 'Var % HL', 'Facturación 2026 ($)', 'Facturación 2025 ($)', 'Var % Fact.', 'CCC Único 2026', 'CCC Único 2025', 'Objetivo 2026 (HL)', 'Cumplimiento %'],
      ...monthlySeries.map(m => [
        m.mesStr, m.mesNombre, m.trimestre, m.hl26, m.hl25, m.hlDiff, m.hlVarPct, m.neto26, m.neto25, m.netoVarPct, m.ccc26, m.ccc25, m.objHL26, m.cumplObj26Pct
      ])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsMonthlyData), 'Evolucion_Mensual');

    // Sheet 3: Análisis Trimestral
    const wsQuarterlyData = [
      ['Trimestre', 'Descripción', 'Volumen 2026 (HL)', 'Volumen 2025 (HL)', 'Dif HL', 'Var % HL', 'Facturación 2026 ($)', 'Facturación 2025 ($)', 'Dif Fact ($)', 'Var % Fact.', 'CCC Único 2026', 'CCC Único 2025', 'Objetivo 2026 (HL)', 'Cumplimiento %'],
      ...quarterlySeries.map(q => [
        q.quarter, q.label, q.hl26, q.hl25, q.hlDiff, q.hlVarPct, q.neto26, q.neto25, q.netoDiff, q.netoVarPct, q.ccc26, q.ccc25, q.objHL26, q.cumplObj26Pct
      ])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsQuarterlyData), 'Analisis_Trimestral');

    // Sheet 4: Participación por Canal
    const wsCanalData = [
      ['Canal Mkt.', 'Canal Unificado', 'Segmento', 'Volumen 2026 (HL)', 'Volumen 2025 (HL)', 'Dif HL', 'Var % HL', 'Part. Interna HL 2026 (%)', 'Part. Interna HL 2025 (%)', 'Dif Part. (pts)', 'Facturación 2026 ($)', 'CCC Único 2026', 'CCC Único 2025', 'Objetivo 2026 (HL)', 'Cumplimiento %'],
      ...byCanal.map(c => [
        c.label, c.canalUnificado, c.segmentoCanal, c.hl26, c.hl25, c.hlDiff, c.hlVarPct, c.shareHL26, c.shareHL25, c.shareHLDiffPts, c.neto26, c.ccc26, c.ccc25, c.objHL26, c.cumplObj26Pct
      ])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsCanalData), 'Canales_Comerciales');

    // Sheet 5: Participación por Unidad de Negocio
    const wsUNData = [
      ['Unidad de Negocio', 'Volumen 2026 (HL)', 'Volumen 2025 (HL)', 'Dif HL', 'Var % HL', 'Part. Interna HL 2026 (%)', 'Part. Interna HL 2025 (%)', 'Dif Part. (pts)', 'Facturación 2026 ($)', 'Facturación 2025 ($)', 'Var % Fact.', 'CCC Único 2026', 'CCC Único 2025', 'Objetivo 2026 (HL)', 'Cumplimiento %'],
      ...byUnidadNegocio.map(u => [
        u.label, u.hl26, u.hl25, u.hlDiff, u.hlVarPct, u.shareHL26, u.shareHL25, u.shareHLDiffPts, u.neto26, u.neto25, u.netoVarPct, u.ccc26, u.ccc25, u.objHL26, u.cumplObj26Pct
      ])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsUNData), 'Unidades_Negocio');

    // Sheet 6: Top Productos
    const wsProdData = [
      ['Código', 'Producto', 'Unidad de Negocio', 'División', 'Marca', 'Volumen 2026 (HL)', 'Volumen 2025 (HL)', 'Dif HL', 'Var % HL', 'Facturación 2026 ($)', 'CCC Único 2026'],
      ...byProducto.slice(0, 150).map(p => [
        p.key, p.label, p.unidadNegocio, p.division, p.marca, p.hl26, p.hl25, p.hlDiff, p.hlVarPct, p.neto26, p.ccc26
      ])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsProdData), 'Top_Productos');

    // Sheet 7: Conclusiones Verificables
    const wsInsightsData = [
      ['ID', 'Tipo', 'Indicador Analizado', 'Período', 'Segmento', 'Valor Actual', 'Valor Anterior', 'Variación', 'Fuente de Datos', 'Regla Aplicada', 'Conclusión Verificable'],
      ...(insights || []).map(ins => [
        ins.id, ins.tipo, ins.indicador, ins.periodo, ins.segmento, ins.valorActual, ins.valorAnterior, ins.variacion, ins.fuente, ins.regla, ins.conclusion
      ])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsInsightsData), 'Conclusiones');

    // Sheet 8: Inventario de Fuentes
    if (inventory && inventory.length > 0) {
      const wsInvData = [
        ['#', 'Archivo Original', 'Categoría', 'Formato', 'Hojas', 'Clasificación', 'Rol en el Modelo', 'Registros Válidos', 'Uso en Dashboard'],
        ...inventory.map(inv => [
          inv.id, inv.fileName, inv.category, inv.format, (inv.sheets || []).join(', '), inv.classification, inv.modelRole, inv.records, inv.dashboardUsage
        ])
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsInvData), 'Inventario_Fuentes');
    }

    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  }

  // 3. Corporate PDF Report (.pdf)
  function generatePDFBuffer(dashboardState, insights, inventory) {
    const { filters, kpis, quarterlySeries, byCanal, byUnidadNegocio } = dashboardState;
    const jsPDFClass = (jspdfLib && jspdfLib.jsPDF) || (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF);

    if (jsPDFClass) {
      const doc = new jsPDFClass({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      // Dark header bar
      doc.setFillColor(18, 18, 20);
      doc.rect(0, 0, 842, 68, 'F');
      doc.setFillColor(255, 107, 0);
      doc.rect(0, 65, 842, 3, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.text('ARGON HIGH BI — INFORME EJECUTIVO DE INTELIGENCIA COMERCIAL', 36, 28);
      doc.setFontSize(9);
      doc.setTextColor(210, 210, 210);
      doc.text(`Período: ${kpis.periodoLabel} | Fecha: ${new Date().toISOString().slice(0, 10)}`, 36, 44);
      doc.text(`Filtros: ${buildFilterSummaryText(filters).slice(0, 125)}`, 36, 56);

      if (typeof doc.autoTable === 'function') {
        doc.autoTable({
          startY: 82,
          head: [['Indicador Principal', 'Actual (2026)', 'Año Anterior (2025)', 'Diferencia Abs.', 'Variación %', 'Ref. 2025 (12m)']],
          body: [
            ['Volumen Vendido (HL)', `${fmt(kpis.volumenHL.actual)} HL`, `${fmt(kpis.volumenHL.prev)} HL`, `${fmt(kpis.volumenHL.diff)} HL`, kpis.volumenHL.varPctFormatted, `${fmt(kpis.fullYear2025Reference.hl)} HL`],
            ['Facturación Neta ($)', `$${fmt(kpis.facturacionNeta.actual)}`, `$${fmt(kpis.facturacionNeta.prev)}`, `$${fmt(kpis.facturacionNeta.diff)}`, kpis.facturacionNeta.varPctFormatted, `$${fmt(kpis.fullYear2025Reference.neto)}`],
            ['Clientes con Compra Únicos (CCC)', `${fmt(kpis.ccc.actual, 0)}`, `${fmt(kpis.ccc.prev, 0)}`, `${fmt(kpis.ccc.diff, 0)}`, kpis.ccc.varPctFormatted, `${fmt(kpis.fullYear2025Reference.ccc, 0)}`],
            ['Cantidad en Bultos', `${fmt(kpis.bultos.actual)}`, `${fmt(kpis.bultos.prev)}`, `${fmt(kpis.bultos.diff)}`, kpis.bultos.varPctFormatted, '-'],
            ['Operaciones Comerciales', `${fmt(kpis.operaciones.actual, 0)}`, `${fmt(kpis.operaciones.prev, 0)}`, `${fmt(kpis.operaciones.diff, 0)}`, kpis.operaciones.varPctFormatted, '-'],
            ['Precio Promedio por HL ($/HL)', `$${fmt(kpis.precioPromedioHL.actual)}`, `$${fmt(kpis.precioPromedioHL.prev)}`, `$${fmt(kpis.precioPromedioHL.diff)}`, kpis.precioPromedioHL.varPctFormatted, '-'],
            ['Objetivo Comercial (HL)', `${fmt(kpis.objetivoHL.obj26)} HL`, `${fmt(kpis.objetivoHL.obj25)} HL`, `${fmt(kpis.objetivoHL.gapHL26)} HL`, kpis.objetivoHL.cumplimiento26Pct !== null ? `${kpis.objetivoHL.cumplimiento26Pct}% cumpl.` : 'N/A', `${fmt(kpis.fullYear2025Reference.objHL)} HL`]
          ],
          theme: 'grid',
          headStyles: { fillColor: [255, 107, 0], textColor: 255, fontSize: 8.5 },
          bodyStyles: { fontSize: 8 }
        });

        doc.autoTable({
          startY: doc.lastAutoTable.finalY + 14,
          head: [['Trimestre', 'Volumen 2026 (HL)', 'Volumen 2025 (HL)', 'Dif. HL', 'Var % HL', 'Facturación 2026 ($)', 'CCC Único 2026', 'Cumplimiento Obj %']],
          body: quarterlySeries.map(q => [
            q.label, `${fmt(q.hl26)} HL`, `${fmt(q.hl25)} HL`, `${fmt(q.hlDiff)} HL`, q.isInactive2026 ? 'Sin actividad' : `${q.hlVarPct}%`, `$${fmt(q.neto26)}`, `${q.ccc26}`, q.cumplObj26Pct !== null ? `${q.cumplObj26Pct}%` : 'N/A'
          ]),
          theme: 'grid',
          headStyles: { fillColor: [38, 38, 44], textColor: [255, 184, 0], fontSize: 8.5 },
          bodyStyles: { fontSize: 8 }
        });

        doc.addPage();
        doc.setFillColor(18, 18, 20);
        doc.rect(0, 0, 842, 46, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(13);
        doc.text('PARTICIPACIÓN POR UNIDAD DE NEGOCIO, CANALES Y CONCLUSIONES VERIFICABLES', 36, 28);

        doc.autoTable({
          startY: 60,
          head: [['Unidad de Negocio', 'HL 2026', 'HL 2025', 'Dif HL', 'Var % HL', 'Part. Interna 2026 %', 'Facturación 2026 ($)', 'CCC 2026']],
          body: byUnidadNegocio.map(u => [
            u.label, fmt(u.hl26), fmt(u.hl25), fmt(u.hlDiff), u.hlVarPct !== null ? `${u.hlVarPct}%` : 'N/A', `${u.shareHL26}%`, `$${fmt(u.neto26)}`, `${u.ccc26}`
          ]),
          theme: 'grid',
          headStyles: { fillColor: [255, 107, 0], textColor: 255, fontSize: 8 },
          bodyStyles: { fontSize: 7.5 }
        });

        doc.autoTable({
          startY: doc.lastAutoTable.finalY + 14,
          head: [['Indicador', 'Segmento', 'Actual', 'Anterior', 'Variación', 'Regla / Fuente']],
          body: (insights || []).slice(0, 10).map(ins => [
            ins.indicador, ins.segmento, ins.valorActual, ins.valorAnterior, ins.variacion, `${ins.regla} (${ins.fuente})`
          ]),
          theme: 'grid',
          headStyles: { fillColor: [38, 38, 44], textColor: [255, 184, 0], fontSize: 8 },
          bodyStyles: { fontSize: 7 }
        });
      }

      const arrBuf = doc.output('arraybuffer');
      return new Uint8Array(arrBuf);
    }

    // Valid deterministic PDF 1.4 generator for headless Node environment verification
    const textLines = [
      'ARGON HIGH BI - INFORME COMERCIAL EJECUTIVO',
      `Periodo: ${kpis.periodoLabel}`,
      `Filtros: ${buildFilterSummaryText(filters)}`,
      `Fuentes: ${(inventory || []).length} archivos comerciales reales`,
      `Volumen 2026: ${fmt(kpis.volumenHL.actual)} HL vs 2025: ${fmt(kpis.volumenHL.prev)} HL (${kpis.volumenHL.varPctFormatted})`,
      `Facturacion Neta 2026: $${fmt(kpis.facturacionNeta.actual)} vs 2025: $${fmt(kpis.facturacionNeta.prev)} (${kpis.facturacionNeta.varPctFormatted})`,
      `Clientes con Compra Unicos (CCC) 2026: ${kpis.ccc.actual} vs 2025: ${kpis.ccc.prev} (${kpis.ccc.varPctFormatted})`,
      ...quarterlySeries.map(q => `Trimestre ${q.quarter}: 2026=${fmt(q.hl26)} HL | 2025=${fmt(q.hl25)} HL | Var=${q.hlVarPct}%`),
      ...byUnidadNegocio.map(u => `UN ${u.label}: ${fmt(u.hl26)} HL (${u.shareHL26}% part. interna)`),
      ...(insights || []).slice(0, 6).map(i => `Conclusion [${i.id}]: ${i.segmento} -> ${i.variacion}`)
    ];
    const streamContent = [
      'BT',
      '/F1 10 Tf',
      '40 780 Td',
      '14 TL',
      ...textLines.map(l => `(${l.replace(/[()\\]/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')}) Tj T*`),
      'ET'
    ].join('\n');

    const objects = [
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
      '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
      '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
      `5 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`
    ];

    let pdf = '%PDF-1.4\n';
    const offsets = [];
    for (const obj of objects) {
      offsets.push(pdf.length);
      pdf += obj;
    }
    const xrefStart = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) {
      pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
    return new TextEncoder().encode(pdf);
  }

  // 4. Editable PowerPoint (.pptx) Export
  async function generatePPTXBuffer(dashboardState, insights, inventory) {
    const { filters, kpis, quarterlySeries, byCanal, byUnidadNegocio } = dashboardState;
    let PptxClass = PptxGenJSLib || (typeof window !== 'undefined' && window.PptxGenJS);
    if (!PptxClass && typeof require === 'function') {
      try {
        const fs = require('fs');
        const path = require('path');
        const vm = require('vm');
        const bundlePath = path.resolve(__dirname, '..', '..', 'vendor', 'pptxgen.bundle.js');
        const code = fs.readFileSync(bundlePath, 'utf8');
        const sandbox = {
          window: {},
          self: {},
          global: {},
          Buffer,
          Uint8Array,
          Uint16Array,
          Uint32Array,
          Int32Array,
          ArrayBuffer,
          DataView,
          Promise,
          setTimeout,
          clearTimeout,
          setInterval,
          clearInterval,
          setImmediate: typeof setImmediate !== 'undefined' ? setImmediate : (fn => setTimeout(fn, 0)),
          clearImmediate: typeof clearImmediate !== 'undefined' ? clearImmediate : clearTimeout,
          console,
          Math,
          Date,
          RegExp,
          Object,
          Array,
          String,
          Number,
          Boolean,
          Error,
          TypeError,
          RangeError,
          Symbol,
          JSON,
          encodeURIComponent,
          decodeURIComponent
        };
        sandbox.window = sandbox;
        sandbox.self = sandbox;
        sandbox.global = sandbox;
        vm.runInNewContext(code, sandbox);
        PptxClass = sandbox.PptxGenJS;
        if (typeof window !== 'undefined') window.PptxGenJS = PptxClass;
      } catch (_) {}
    }

    if (PptxClass) {
      const pptx = new PptxClass();
      pptx.layout = 'LAYOUT_WIDE';
      pptx.author = 'Argon High BI';
      pptx.company = 'Distribuidora Comercial de Bebidas';
      pptx.title = `Informe Comercial Ejecutivo - ${kpis.periodoLabel}`;

      // Slide 1: Portada y KPIs Principales Editables
      const slide1 = pptx.addSlide();
      slide1.background = { color: '0D0E12' };
      slide1.addText('INFORME DE INTELIGENCIA COMERCIAL — ARGON HIGH BI', {
        x: 0.5, y: 0.4, w: 12.3, h: 0.6, fontSize: 22, bold: true, color: 'FF6B00', fontFace: 'Arial'
      });
      slide1.addText(`Período: ${kpis.periodoLabel}  |  Fuentes Reales Procesadas: ${(inventory || []).length} archivos`, {
        x: 0.5, y: 1.0, w: 12.3, h: 0.35, fontSize: 12, color: 'E2E8F0', fontFace: 'Arial'
      });
      slide1.addText(`Filtros Activos: ${buildFilterSummaryText(filters)}`, {
        x: 0.5, y: 1.35, w: 12.3, h: 0.35, fontSize: 10, color: '94A3B8', fontFace: 'Arial'
      });

      const kpiRows = [
        [
          { text: 'Indicador Comercial', options: { bold: true, fill: 'FF6B00', color: 'FFFFFF' } },
          { text: 'Actual (2026)', options: { bold: true, fill: 'FF6B00', color: 'FFFFFF' } },
          { text: 'Anterior (2025)', options: { bold: true, fill: 'FF6B00', color: 'FFFFFF' } },
          { text: 'Diferencia Abs.', options: { bold: true, fill: 'FF6B00', color: 'FFFFFF' } },
          { text: 'Variación %', options: { bold: true, fill: 'FF6B00', color: 'FFFFFF' } },
          { text: 'Ref. 2025 (12m)', options: { bold: true, fill: 'FF6B00', color: 'FFFFFF' } }
        ],
        ['Volumen Vendido (HL)', `${fmt(kpis.volumenHL.actual)} HL`, `${fmt(kpis.volumenHL.prev)} HL`, `${fmt(kpis.volumenHL.diff)} HL`, kpis.volumenHL.varPctFormatted, `${fmt(kpis.fullYear2025Reference.hl)} HL`],
        ['Facturación Neta ($)', `$${fmt(kpis.facturacionNeta.actual)}`, `$${fmt(kpis.facturacionNeta.prev)}`, `$${fmt(kpis.facturacionNeta.diff)}`, kpis.facturacionNeta.varPctFormatted, `$${fmt(kpis.fullYear2025Reference.neto)}`],
        ['Clientes con Compra Únicos (CCC)', `${fmt(kpis.ccc.actual, 0)}`, `${fmt(kpis.ccc.prev, 0)}`, `${fmt(kpis.ccc.diff, 0)}`, kpis.ccc.varPctFormatted, `${fmt(kpis.fullYear2025Reference.ccc, 0)}`],
        ['Cantidad de Operaciones', `${fmt(kpis.operaciones.actual, 0)}`, `${fmt(kpis.operaciones.prev, 0)}`, `${fmt(kpis.operaciones.diff, 0)}`, kpis.operaciones.varPctFormatted, '-'],
        ['Precio Promedio por HL ($/HL)', `$${fmt(kpis.precioPromedioHL.actual)}`, `$${fmt(kpis.precioPromedioHL.prev)}`, `$${fmt(kpis.precioPromedioHL.diff)}`, kpis.precioPromedioHL.varPctFormatted, '-'],
        ['Objetivo Comercial (HL)', `${fmt(kpis.objetivoHL.obj26)} HL`, `${fmt(kpis.objetivoHL.obj25)} HL`, `${fmt(kpis.objetivoHL.gapHL26)} HL`, kpis.objetivoHL.cumplimiento26Pct !== null ? `${kpis.objetivoHL.cumplimiento26Pct}% cumpl.` : 'N/A', `${fmt(kpis.fullYear2025Reference.objHL)} HL`]
      ];
      slide1.addTable(kpiRows, {
        x: 0.5, y: 1.9, w: 12.3, fontSize: 11, color: 'F8FAFC', fill: '181A20', border: { pt: 1, color: '2D3139' }
      });

      // Slide 2: Análisis Trimestral y Unidades de Negocio (Tablas Editables)
      const slide2 = pptx.addSlide();
      slide2.background = { color: '0D0E12' };
      slide2.addText('DESEMPEÑO TRIMESTRAL Y PARTICIPACIÓN POR UNIDAD DE NEGOCIO', {
        x: 0.5, y: 0.4, w: 12.3, h: 0.5, fontSize: 18, bold: true, color: 'FFB800', fontFace: 'Arial'
      });

      const qTable = [
        [
          { text: 'Trimestre', options: { bold: true, fill: '262932', color: 'FFB800' } },
          { text: 'HL 2026', options: { bold: true, fill: '262932', color: 'FFB800' } },
          { text: 'HL 2025', options: { bold: true, fill: '262932', color: 'FFB800' } },
          { text: 'Dif. HL', options: { bold: true, fill: '262932', color: 'FFB800' } },
          { text: 'Var % HL', options: { bold: true, fill: '262932', color: 'FFB800' } },
          { text: 'Facturación 2026', options: { bold: true, fill: '262932', color: 'FFB800' } },
          { text: 'CCC 2026', options: { bold: true, fill: '262932', color: 'FFB800' } }
        ],
        ...quarterlySeries.map(q => [
          q.label, `${fmt(q.hl26)} HL`, `${fmt(q.hl25)} HL`, `${fmt(q.hlDiff)} HL`, q.isInactive2026 ? 'Sin actividad' : `${q.hlVarPct}%`, `$${fmt(q.neto26)}`, `${q.ccc26}`
        ])
      ];
      slide2.addTable(qTable, { x: 0.5, y: 1.0, w: 12.3, fontSize: 10, color: 'F8FAFC', fill: '181A20', border: { pt: 1, color: '2D3139' } });

      const unTable = [
        [
          { text: 'Unidad de Negocio', options: { bold: true, fill: 'FF6B00', color: 'FFFFFF' } },
          { text: 'HL 2026', options: { bold: true, fill: 'FF6B00', color: 'FFFFFF' } },
          { text: 'HL 2025', options: { bold: true, fill: 'FF6B00', color: 'FFFFFF' } },
          { text: 'Var % HL', options: { bold: true, fill: 'FF6B00', color: 'FFFFFF' } },
          { text: 'Part. Interna %', options: { bold: true, fill: 'FF6B00', color: 'FFFFFF' } },
          { text: 'Facturación 2026 ($)', options: { bold: true, fill: 'FF6B00', color: 'FFFFFF' } },
          { text: 'CCC Único 2026', options: { bold: true, fill: 'FF6B00', color: 'FFFFFF' } }
        ],
        ...byUnidadNegocio.slice(0, 7).map(u => [
          u.label, `${fmt(u.hl26)}`, `${fmt(u.hl25)}`, u.hlVarPct !== null ? `${u.hlVarPct}%` : 'N/A', `${u.shareHL26}%`, `$${fmt(u.neto26)}`, `${u.ccc26}`
        ])
      ];
      slide2.addTable(unTable, { x: 0.5, y: 3.4, w: 12.3, fontSize: 10, color: 'F8FAFC', fill: '181A20', border: { pt: 1, color: '2D3139' } });

      // Slide 3: Canales Comerciales y Conclusiones Verificables
      const slide3 = pptx.addSlide();
      slide3.background = { color: '0D0E12' };
      slide3.addText('CANALES COMERCIALES Y HALLAZGOS VERIFICABLES DE AUDITORÍA', {
        x: 0.5, y: 0.4, w: 12.3, h: 0.5, fontSize: 18, bold: true, color: 'FF6B00', fontFace: 'Arial'
      });

      const cTable = [
        [
          { text: 'Canal Comercial', options: { bold: true, fill: '262932', color: 'FFB800' } },
          { text: 'Canal Unificado', options: { bold: true, fill: '262932', color: 'FFB800' } },
          { text: 'HL 2026', options: { bold: true, fill: '262932', color: 'FFB800' } },
          { text: 'HL 2025', options: { bold: true, fill: '262932', color: 'FFB800' } },
          { text: 'Var % HL', options: { bold: true, fill: '262932', color: 'FFB800' } },
          { text: 'Part. %', options: { bold: true, fill: '262932', color: 'FFB800' } },
          { text: 'CCC 2026', options: { bold: true, fill: '262932', color: 'FFB800' } }
        ],
        ...byCanal.slice(0, 7).map(c => [
          c.label, c.canalUnificado || '', `${fmt(c.hl26)}`, `${fmt(c.hl25)}`, c.hlVarPct !== null ? `${c.hlVarPct}%` : 'N/A', `${c.shareHL26}%`, `${c.ccc26}`
        ])
      ];
      slide3.addTable(cTable, { x: 0.5, y: 1.0, w: 12.3, fontSize: 9.5, color: 'F8FAFC', fill: '181A20', border: { pt: 1, color: '2D3139' } });

      const insightText = (insights || []).slice(0, 5).map(ins => `• [${ins.tipo}] ${ins.segmento}: ${ins.variacion} — ${ins.conclusion}`).join('\n');
      slide3.addText(insightText, {
        x: 0.5, y: 4.5, w: 12.3, h: 2.5, fontSize: 10.5, color: 'E2E8F0', fill: '181A20', fontFace: 'Arial', valign: 'top'
      });

      const out = await pptx.write({ outputType: 'uint8array' });
      return out instanceof Uint8Array ? out : new Uint8Array(out);
    }

    throw new Error('PptxGenJS no está disponible en el entorno actual.');
  }

  function triggerBrowserDownload(data, fileName, mimeType) {
    if (typeof document === 'undefined') return false;
    const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 250);
    return true;
  }

  return {
    buildFilterSummaryText,
    generateCSVContent,
    generateExcelWorkbookBuffer,
    generatePDFBuffer,
    generatePPTXBuffer,
    triggerBrowserDownload
  };
});
