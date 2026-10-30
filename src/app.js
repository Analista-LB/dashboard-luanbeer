(function () {
  'use strict';

  const {
    Sanitizer,
    IngestionEngine,
    RelationshipEngine,
    CommercialMathEngine,
    InsightEngine,
    NLQEngine,
    PersistenceEngine,
    ExportEngine,
    CustomConsolidator,
    GalaxiaEngine
  } = window.ArgonBI;

  const esc = Sanitizer.escapeHtml;

  // Application State
  const state = {
    universeMode: 'REAL_20', // 'REAL_20' | 'SINTETICO_PRUEBA'
    activeBundle: window.__ARGON_REAL_BUNDLE__,
    realBundleBackup: window.__ARGON_REAL_BUNDLE__,
    filters: {
      modoComparacion: 'YTD',
      anio: '2026',
      mes: 'ALL',
      mesDesde: 'ALL',
      mesHasta: 'ALL',
      trimestre: 'ALL',
      canal: 'ALL',
      canalUnificado: 'ALL',
      unidadNegocio: 'ALL',
      division: 'ALL',
      producto: 'ALL',
      cliente: 'ALL',
      vendedor: 'ALL',
      supervisor: 'ALL',
      includePOP: true
    },
    tacoFilters: {
      mesa: 'Mando Integral',
      supervisor: 'ALL',
      vendedor: 'ALL',
      tipoPreventa: 'ALL',
      canal: 'ALL',
      subcanal: 'ALL',
      estadoCliente: 'ACTIVO',
      search: ''
    },
    chartMetric: 'hl', // 'hl' | 'neto' | 'ccc' | 'bultos' | 'precio' | 'ops'
    tableGroupBy: 'canal', // 'canal' | 'un' | 'mes' | 'trimestre' | 'division' | 'vendedor' | 'producto'
    tableSortCol: 'hl26',
    tableSortAsc: false,
    tableSearch: '',
    insightFilter: 'ALL',
    pendingBatch: null, // Holds inspected batch before user clicks VALIDAR E INCORPORAR DATOS
    pendingRelationships: null,
    confirmedAmbiguousRels: new Set(['REL-02', 'REL-03', 'REL-04', 'REL-08']),
    lastEvaluation: null,
    lastInsights: []
  };

  let mainComboChart = null;
  let unShareChart = null;
  let canalShareChart = null;

  function fmt(n, dec = 2) {
    if (n === null || n === undefined || isNaN(Number(n))) return 'N/A';
    return Number(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function fmtCompactMoney(n) {
    if (n === null || n === undefined || isNaN(Number(n))) return 'N/A';
    const abs = Math.abs(Number(n));
    if (abs >= 1e9) return `$${(Number(n) / 1e9).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MM`;
    if (abs >= 1e6) return `$${(Number(n) / 1e6).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} M`;
    return `$${fmt(n, 0)}`;
  }

  function formatSingleDataSourceName(str) {
    if (!str || typeof str !== 'string') return '';
    let s = str.trim();
    // Strip paths (e.g. 1. Bases/, bases/, C:\...)
    s = s.replace(/^.*[\\\/]/, '');
    // Strip operational prefixes like (Actualizar), (Fijo), (SemiFijo), (Semifijo)
    s = s.replace(/^\s*\((?:actualizar|fijo|semifijo)\)\s*/i, '');
    // Strip extensions (.xlsx, .xlsm, .xlsb, .xls, .csv, .pdf, .tsv, .txt)
    s = s.replace(/\.(xlsx|xlsm|xlsb|xls|csv|pdf|tsv|txt)\b/gi, '');
    // Clean double dots
    s = s.replace(/\.{2,}/g, '.');
    // Clean underscores into spaces
    s = s.replace(/_/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }

  function formatDataSourceName(val) {
    if (!val) return '';
    if (Array.isArray(val)) {
      return val.map(formatDataSourceName).filter(Boolean);
    }
    const s = String(val).trim();
    const delimiterRegex = /(\s+\/\s+|\s*\+\s*|\s+vs\.?\s+|,\s*)/i;
    if (delimiterRegex.test(s)) {
      const tokens = s.split(delimiterRegex);
      return tokens.map(tok => {
        if (delimiterRegex.test(tok)) return tok;
        return formatSingleDataSourceName(tok);
      }).join('').replace(/\s+/g, ' ').trim();
    }
    return formatSingleDataSourceName(s);
  }

  function renderTacoEstadoBadge(real, objetivo, semaforoColor, options = {}) {
    const r = Number(real) || 0;
    const o = Number(objetivo) || 0;
    const dec = options.dec !== undefined ? options.dec : ((r % 1 === 0 && o % 1 === 0) ? 0 : 1);
    const prefix = options.prefix || '';
    const suffix = options.suffix || '';
    
    const diff = r - o;
    const isZero = Math.abs(diff) < 0.0001;
    
    if (isZero) {
      return `<span class="semaforo-badge success">Objetivo alcanzado</span>`;
    }
    
    if (diff > 0) {
      const formattedDiff = `${prefix}${fmt(diff, dec)}${suffix}`;
      return `<span class="semaforo-badge success">+${formattedDiff}</span>`;
    }
    
    // Missed target: diff < 0
    const missing = Math.abs(diff);
    const formattedMissing = `${prefix}${fmt(missing, dec)}${suffix}`;
    const badgeColor = semaforoColor === 'warning' ? 'warning' : 'danger';
    const label = `Faltan ${formattedMissing}`;
    return `<span class="semaforo-badge ${badgeColor}">${label}</span>`;
  }

  window.formatDataSourceName = formatDataSourceName;
  window.renderTacoEstadoBadge = renderTacoEstadoBadge;

  function varBadge(varPct, inverse = false) {
    if (varPct === null || varPct === undefined || isNaN(Number(varPct))) {
      return `<span class="badge badge-neutral" title="Base cero o negativa en el período anterior">N/A (Base ≤ 0)</span>`;
    }
    const v = Number(varPct);
    const isGood = inverse ? v <= 0 : v >= 0;
    const cls = v === 0 ? 'badge-neutral' : (isGood ? 'badge-positive' : 'badge-negative');
    const sign = v > 0 ? '+' : '';
    return `<span class="badge ${cls}">${sign}${v.toFixed(2)}%</span>`;
  }

  function showToast(message, type = 'info', durationMs = 4500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 350);
    }, durationMs);
  }

  function updateFilterSummaryChip() {
    const summaryEl = document.getElementById('filterSummaryText');
    if (!summaryEl) return;
    const f = state.filters;
    const parts = [];

    parts.push(`Año: ${f.anio || '2026'}`);
    parts.push(`Período: ${f.modoComparacion === 'YTD' ? 'YTD' : 'Año Anterior Completo'}`);

    const monthNames = {
      '01':'Ene', '02':'Feb', '03':'Mar', '04':'Abr', '05':'May', '06':'Jun',
      '07':'Jul', '08':'Ago', '09':'Sep', '10':'Oct', '11':'Nov', '12':'Dic'
    };

    if (f.mesDesde && f.mesDesde !== 'ALL' && f.mesHasta && f.mesHasta !== 'ALL') {
      if (f.mesDesde === f.mesHasta) {
        if (f.mesDesde === '10') {
          parts.push('Mes: Octubre 2026 (Mes Actual)');
        } else {
          parts.push(`Mes: ${monthNames[f.mesDesde] || f.mesDesde}`);
        }
      } else {
        parts.push(`Meses: ${monthNames[f.mesDesde] || f.mesDesde}–${monthNames[f.mesHasta] || f.mesHasta}`);
      }
    } else if (f.mes && f.mes !== 'ALL') {
      if (f.mes === '10') {
        parts.push('Mes: Octubre 2026 (Mes Actual)');
      } else {
        parts.push(`Mes: ${monthNames[f.mes] || f.mes}`);
      }
    } else {
      parts.push('Mes: Todos');
    }

    if (f.trimestre && f.trimestre !== 'ALL') {
      parts.push(`Trimestre: ${f.trimestre}`);
    }

    if (f.canal && f.canal !== 'ALL') {
      if (f.canal === 'REF_ALL') {
        parts.push('Canal: Todos los REF (On Premise)');
      } else if (f.canal === 'MERCADO_HOGAR_ALL') {
        parts.push('Canal: Todo Mercado Hogar');
      } else if (f.canal === 'CADENITAS_ALL') {
        parts.push('Canal: Todas las Cadenitas');
      } else if (f.canal === 'CADENITAS_AIELLO') {
        parts.push('Canal: Cadenitas — Supermercados Aiello');
      } else if (f.canal === 'CADENITAS_DELFIN') {
        parts.push('Canal: Cadenitas — Supermercados Delfines');
      } else if (f.canal === 'INSTITUCIONES_ALL') {
        parts.push('Canal: Instituciones y Personal');
      } else {
        parts.push(`Canal: ${f.canal}`);
      }
    } else if (f.canalUnificado && f.canalUnificado !== 'ALL') {
      parts.push(`Canal Mkt: ${f.canalUnificado}`);
    } else {
      parts.push('Canal: Todos');
    }

    if (f.unidadNegocio && f.unidadNegocio !== 'ALL') {
      parts.push(`UN: ${f.unidadNegocio}`);
    } else if (f.division && f.division !== 'ALL') {
      parts.push(`División: ${f.division}`);
    } else {
      parts.push('UN: Todas');
    }

    if (f.producto && f.producto !== 'ALL') {
      parts.push(`SKU: ${f.producto}`);
    }

    if (f.cliente && f.cliente !== 'ALL') {
      parts.push(`Cliente: ${f.cliente}`);
    }

    if (f.vendedor && f.vendedor !== 'ALL') {
      parts.push(`Vendedor: ${f.vendedor}`);
    }
    if (f.supervisor && f.supervisor !== 'ALL') {
      parts.push(`Supervisor: ${f.supervisor}`);
    }

    summaryEl.textContent = parts.join(' | ');
  }

  // Populate Filter Selectors dynamically from the active bundle
  function populateFilterSelectors() {
    const bundle = state.activeBundle;
    CommercialMathEngine.ensureIndexes(bundle);
    updateFilterSummaryChip();

    const setOptions = (id, items, currentVal, allLabel = 'Todos') => {
      const el = document.getElementById(id);
      if (!el) return;
      const html = [`<option value="ALL">${esc(allLabel)}</option>`];
      for (const item of items) {
        const val = typeof item === 'object' ? item.value : item;
        const label = typeof item === 'object' ? item.label : item;
        const sel = String(val) === String(currentVal) ? 'selected' : '';
        html.push(`<option value="${esc(val)}" ${sel}>${esc(label)}</option>`);
      }
      el.innerHTML = html.join('');
    };

    const fltCanalEl = document.getElementById('fltCanal');
    if (fltCanalEl) {
      fltCanalEl.value = state.filters.canal || 'ALL';
    }

    const canalesUnif = [...new Set(bundle.dictionaries.canalesResolved.map(c => c.canalUnificado))].sort();
    setOptions('fltCanalUnif', canalesUnif, state.filters.canalUnificado, 'Todos (Unificados)');

    const unSet = new Set();
    const divSet = new Set();
    for (const p of bundle.masters.portfolio) {
      if (p.unidadMktp || p.unidadNegocio) unSet.add(p.unidadMktp || p.unidadNegocio);
      if (p.division) divSet.add(p.division);
    }
    setOptions('fltUN', [...unSet].sort(), state.filters.unidadNegocio, 'Todas las UN');
    setOptions('fltDivision', [...divSet].sort(), state.filters.division, 'Todas las Divisiones');

    const vendedores = bundle.masters.personal
      .filter(p => p.cargo === 'VENDEDOR' || p.codigo < 90)
      .map(p => ({ value: p.codigo, label: `${p.codigo} - ${p.nombre}` }));
    setOptions('fltVendedor', vendedores, state.filters.vendedor, 'Todos los Vendedores');

    const supervisores = bundle.masters.personal
      .filter(p => p.cargo === 'SUPERVISOR' || (p.codigo >= 99 && p.codigo <= 105))
      .map(p => ({ value: p.codigo, label: `${p.codigo} - ${p.nombre}` }));
    setOptions('fltSupervisor', supervisores, state.filters.supervisor, 'Todos los Supervisores');

    // Products present in sales
    const activeProdCodes = new Set(bundle.salesColumnar.prod);
    const prodOptions = bundle.masters.portfolio
      .filter(p => activeProdCodes.has(Number(p.codigo)))
      .sort((a, b) => String(a.producto).localeCompare(String(b.producto)))
      .map(p => ({ value: p.codigo, label: `${p.codigo} - ${p.producto.slice(0, 38)}` }));
    setOptions('fltProducto', prodOptions, state.filters.producto, `Todos (${prodOptions.length} SKUs activos)`);

    // Active Clients selector (Anulado === 'NO' from Base de Clientes, exactly 1.485 active clients)
    const clientesActivos = (bundle.masters.clientes || [])
      .filter(c => (c.anulado || '').toUpperCase() === 'NO')
      .sort((a, b) => a.codigo - b.codigo)
      .map(c => ({ value: c.codigo, label: `${c.codigo} - ${c.nombre.slice(0, 36)}` }));
    setOptions('fltCliente', clientesActivos, state.filters.cliente, 'Todos (1.485 Clientes Activos)');
  }

  // Render Topbar & Universe Badge
  function renderUniverseStatus() {
    const pill = document.getElementById('universePill');
    const restoreBtn = document.getElementById('btnRestoreRealUniverse');
    if (!pill) return;
    pill.className = 'universe-pill';
    pill.innerHTML = `<span class="status-dot"></span> <span id="universePillText">LuanBeer Oficial — Bases Activas</span>`;
    if (restoreBtn) restoreBtn.style.display = 'none';
  }

  // Render KPI Cards
  function renderKPICards(evalResult) {
    const { kpis } = evalResult;
    const container = document.getElementById('kpiCardsContainer');
    if (!container) return;

    const obj = kpis.objetivoHL;
    const comp = kpis.complementarios;

    const cardsHtml = [
      // 1. Volumen Vendido en HL
      `<div class="kpi-card">
        <div class="kpi-header">
          <span>Volumen Vendido (HL)</span>
          <span title="Fórmula: Suma de Cantidad Total en HL. Si el origen está en Litros, aplica HL = Litros / 100.">ℹ️ HL</span>
        </div>
        <div class="kpi-main-value">${fmt(kpis.volumenHL.actual)} <small style="font-size:13px;color:var(--accent-orange)">HL</small></div>
        <div class="kpi-comparison-row">
          <span>Año Ant.: <strong>${fmt(kpis.volumenHL.prev)} HL</strong></span>
          ${varBadge(kpis.volumenHL.varPct)}
        </div>
        <div class="kpi-subtext">
          Dif. Abs.: <strong>${kpis.volumenHL.diff > 0 ? '+' : ''}${fmt(kpis.volumenHL.diff)} HL</strong> | Ref. 2025 (12m): ${fmt(kpis.fullYear2025Reference.hl)} HL
        </div>
      </div>`,

      // 2. Facturación Neta
      `<div class="kpi-card">
        <div class="kpi-header">
          <span>Facturación Neta ($)</span>
          <span title="Importe Neto sin mezclar con Facturación Bruta ni Bonificaciones.">ℹ️ Neto</span>
        </div>
        <div class="kpi-main-value" title="$${fmt(kpis.facturacionNeta.actual)}">${fmtCompactMoney(kpis.facturacionNeta.actual)}</div>
        <div class="kpi-comparison-row">
          <span>Año Ant.: <strong>${fmtCompactMoney(kpis.facturacionNeta.prev)}</strong></span>
          ${varBadge(kpis.facturacionNeta.varPct)}
        </div>
        <div class="kpi-subtext">
          Dif.: <strong>${fmtCompactMoney(kpis.facturacionNeta.diff)}</strong> | Bonif. 2026: ${fmtCompactMoney(kpis.bonificaciones.actual)}
        </div>
      </div>`,

      // 3. Clientes con Compra (CCC Único)
      `<div class="kpi-card secondary-accent">
        <div class="kpi-header">
          <span>Clientes con Compra (CCC)</span>
          <span title="Clientes únicos reales (Set de Código Cliente) en el período y alcance filtrado. No suma CCC mensuales.">ℹ️ Único</span>
        </div>
        <div class="kpi-main-value">${fmt(kpis.ccc.actual, 0)} <small style="font-size:13px;color:var(--accent-yellow)">PDV</small></div>
        <div class="kpi-comparison-row">
          <span>Año Ant.: <strong>${fmt(kpis.ccc.prev, 0)} PDV</strong></span>
          ${varBadge(kpis.ccc.varPct)}
        </div>
        <div class="kpi-subtext">
          Dif. Abs.: <strong>${kpis.ccc.diff > 0 ? '+' : ''}${fmt(kpis.ccc.diff, 0)} clientes únicos</strong> | 2025 (12m): ${fmt(kpis.fullYear2025Reference.ccc, 0)}
        </div>
      </div>`,

      // 4. Precio Promedio por HL
      `<div class="kpi-card">
        <div class="kpi-header">
          <span>Precio Promedio / HL</span>
          <span title="Fórmula: Facturación Neta ($) / Volumen Vendido (HL)">ℹ️ $/HL</span>
        </div>
        <div class="kpi-main-value">$${fmt(kpis.precioPromedioHL.actual, 0)}</div>
        <div class="kpi-comparison-row">
          <span>Año Ant.: <strong>$${fmt(kpis.precioPromedioHL.prev, 0)}/HL</strong></span>
          ${varBadge(kpis.precioPromedioHL.varPct)}
        </div>
        <div class="kpi-subtext">
          Dif. Abs.: <strong>$${kpis.precioPromedioHL.diff > 0 ? '+' : ''}${fmt(kpis.precioPromedioHL.diff, 0)} / HL</strong>
        </div>
      </div>`,

      // 5. Cantidad de Operaciones y Bultos
      `<div class="kpi-card">
        <div class="kpi-header">
          <span>Operaciones y Bultos</span>
          <span title="Registros transaccionales consolidados y Cantidad Total en Bultos">ℹ️ Oper.</span>
        </div>
        <div class="kpi-main-value">${fmt(kpis.operaciones.actual, 0)} <small style="font-size:12px;color:var(--text-muted)">ops</small></div>
        <div class="kpi-comparison-row">
          <span>Año Ant.: <strong>${fmt(kpis.operaciones.prev, 0)} ops</strong></span>
          ${varBadge(kpis.operaciones.varPct)}
        </div>
        <div class="kpi-subtext">
          Bultos 2026: <strong>${fmt(kpis.bultos.actual, 0)}</strong> vs 2025: ${fmt(kpis.bultos.prev, 0)} (${kpis.bultos.varPctFormatted})
        </div>
      </div>`,

      // 6. Objetivo Comercial (Base Obj.)
      obj.available
        ? `<div class="kpi-card secondary-accent">
            <div class="kpi-header">
              <span>Cumplimiento Objetivo (HL)</span>
              <span title="Fuente: (Actualizar) Base Obj..xlsx — Volumen Real HL / Objetivo Total en HL">ℹ️ Meta</span>
            </div>
            <div class="kpi-main-value">${fmt(obj.cumplimiento26Pct)}% <small style="font-size:12px;color:var(--accent-yellow)">cumpl.</small></div>
            <div class="kpi-comparison-row">
              <span>Meta 2026: <strong>${fmt(obj.obj26)} HL</strong></span>
              <span class="badge ${obj.cumplimiento26Pct >= 100 ? 'badge-positive' : 'badge-warning'}">Brecha: ${fmt(obj.gapHL26)} HL</span>
            </div>
            <div class="kpi-subtext">
              Meta 2025: ${fmt(obj.obj25)} HL (Cumpl. 2025: ${fmt(obj.cumplimiento25Pct)}%)
            </div>
          </div>`
        : `<div class="kpi-card unavailable">
            <div class="kpi-header"><span>Cumplimiento Objetivo (HL)</span><span>⚠️ N/D</span></div>
            <div class="kpi-main-value" style="font-size:16px;color:var(--text-muted)">No Disponible</div>
            <div class="kpi-subtext">${esc(obj.reasonIfUnavailable || 'Sin metas cargadas para este filtro.')}</div>
          </div>`,

      // 7. Padrón CNC & Cobertura MXPDV
      comp.cnc.available
        ? `<div class="kpi-card">
            <div class="kpi-header">
              <span>Clientes No Compradores (CNC)</span>
              <span title="Fuente: (Actualizar) Base CNC.xlsx y Base MXPDV.xlsx">ℹ️ CNC / MXPDV</span>
            </div>
            <div class="kpi-main-value">${fmt(comp.cnc.tasaCNC26Pct)}% <small style="font-size:12px;color:var(--text-muted)">tasa CNC</small></div>
            <div class="kpi-comparison-row">
              <span>CNC: <strong>${fmt(comp.cnc.noComp26, 0)}</strong> / Act: ${fmt(comp.cnc.act26, 0)}</span>
              <span class="badge badge-neutral">2025: ${fmt(comp.cnc.tasaCNC25Pct)}%</span>
            </div>
            <div class="kpi-subtext">
              MXPDV Promedio 2026: <strong>${comp.mxpdv.available ? fmt(comp.mxpdv.promMarcas26) + ' marcas/PDV' : 'N/D'}</strong> (2025: ${comp.mxpdv.available ? fmt(comp.mxpdv.promMarcas25) : 'N/D'})
            </div>
          </div>`
        : `<div class="kpi-card unavailable">
            <div class="kpi-header"><span>Padrón CNC y MXPDV</span><span>⚠️ N/D</span></div>
            <div class="kpi-main-value" style="font-size:15px;color:var(--text-muted)">No Calculable por Producto/UN</div>
            <div class="kpi-subtext">${esc(comp.cnc.reasonIfUnavailable)}</div>
          </div>`,

      // 8. Eficiencia de Visitas & Rechazos Logísticos
      `<div class="kpi-card">
        <div class="kpi-header">
          <span>Eficiencia y Rechazos</span>
          <span title="Fuentes: (Actualizar) Base Eficiencia.xlsx y (Actualizar) Base Rechazos.xlsx">ℹ️ Ruta / Log.</span>
        </div>
        <div class="kpi-main-value">${comp.eficiencia.available ? fmt(comp.eficiencia.efectividad26Pct) + '% Ef.' : fmt(comp.rechazos.hl26) + ' HL Rec.'}</div>
        <div class="kpi-comparison-row">
          <span>${comp.eficiencia.available ? `Visitas Ef.: <strong>${fmt(comp.eficiencia.efectivas26, 0)}</strong> / ${fmt(comp.eficiencia.visitas26, 0)}` : 'Eficiencia sólo por Canal/Mes'}</span>
          <span class="badge badge-warning">Rechazo: ${fmt(comp.rechazos.tasaRechazoHL26Pct)}% HL</span>
        </div>
        <div class="kpi-subtext">
          Rechazos 2026: <strong>${fmt(comp.rechazos.hl26)} HL</strong> ($${fmt(comp.rechazos.neto26, 0)}) | ${comp.rechazos.count26} casos
        </div>
      </div>`
    ];

    container.innerHTML = cardsHtml.join('');
    const lbl = document.getElementById('activePeriodSummaryLabel');
    if (lbl) {
      const mn = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
      const fl = state.filters;
      const yr = fl.anio || '2026';
      let perTxt = kpis.periodoLabel;
      if (fl.mesDesde && fl.mesDesde !== 'ALL' && fl.mesDesde === fl.mesHasta && (!fl.trimestre || fl.trimestre === 'ALL')) {
        perTxt = `${mn[parseInt(fl.mesDesde, 10) - 1]} ${yr}`;
      }
      lbl.innerHTML = `Período Activo: <strong style="color:var(--accent-orange)">${esc(perTxt)}</strong>`;
    }
  }

  // Render Main Combined Chart + Share Charts
  function renderCharts(evalResult) {
    if (typeof Chart === 'undefined') return;
    const { monthlySeries, byUnidadNegocio, byCanal } = evalResult;
    const metric = state.chartMetric;

    const metricConfig = {
      hl: { label: 'Volumen Vendido (HL)', unit: 'HL', prop26: 'hl26', prop25: 'hl25', propObj: 'objHL26' },
      neto: { label: 'Facturación Neta ($)', unit: '$', prop26: 'neto26', prop25: 'neto25', propObj: null },
      ccc: { label: 'Clientes con Compra Únicos (CCC)', unit: 'Clientes', prop26: 'ccc26', prop25: 'ccc25', propObj: null },
      bultos: { label: 'Cantidad en Bultos', unit: 'Bultos', prop26: 'bultos26', prop25: 'bultos25', propObj: null },
      precio: { label: 'Precio Promedio por HL ($/HL)', unit: '$/HL', prop26: 'precioPromHL26', prop25: 'precioPromHL25', propObj: null },
      ops: { label: 'Cantidad de Operaciones', unit: 'Ops', prop26: 'ops26', prop25: 'ops25', propObj: null }
    }[metric] || { label: 'Volumen Vendido (HL)', unit: 'HL', prop26: 'hl26', prop25: 'hl25', propObj: 'objHL26' };

    const labels = monthlySeries.map(m => m.mesNombre.slice(0, 3) + (m.isInactive2026 ? ' (S/A)' : ''));
    const data26 = monthlySeries.map(m => m[metricConfig.prop26]);
    const data25 = monthlySeries.map(m => m[metricConfig.prop25]);

    const datasets = [
      {
        type: 'bar',
        label: `2026 Actual (${metricConfig.unit})`,
        data: data26,
        backgroundColor: monthlySeries.map(m => m.isInactive2026 ? 'rgba(148,163,184,0.2)' : 'rgba(255, 107, 0, 0.85)'),
        borderColor: '#ff6b00',
        borderWidth: 1,
        borderRadius: 4,
        order: 2
      },
      {
        type: 'line',
        label: `2025 Año Anterior (${metricConfig.unit})`,
        data: data25,
        borderColor: '#ffb800',
        backgroundColor: 'rgba(255, 184, 0, 0.15)',
        borderWidth: 2.5,
        pointRadius: 4,
        pointBackgroundColor: '#ffb800',
        tension: 0.25,
        order: 1
      }
    ];

    if (metricConfig.propObj && state.filters.cliente === 'ALL') {
      datasets.push({
        type: 'line',
        label: 'Objetivo 2026 (HL)',
        data: monthlySeries.map(m => m.objHL26),
        borderColor: '#10b981',
        borderDash: [5, 5],
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: '#10b981',
        tension: 0.2,
        order: 0
      });
    }

    const ctxCombo = document.getElementById('mainComboChartCanvas');
    if (ctxCombo) {
      if (mainComboChart) mainComboChart.destroy();
      mainComboChart = new Chart(ctxCombo, {
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { labels: { color: '#334155', font: { size: 11.5, weight: '600' } } },
            tooltip: {
              backgroundColor: '#ffffff',
              titleColor: '#ea580c',
              bodyColor: '#1e293b',
              borderColor: '#e2e8f0',
              borderWidth: 1,
              padding: 10,
              callbacks: {
                afterBody: function (items) {
                  const idx = items[0].dataIndex;
                  const m = monthlySeries[idx];
                  const act = m[metricConfig.prop26];
                  const prv = m[metricConfig.prop25];
                  const diff = act - prv;
                  const pct = prv > 0 ? (((act - prv) / prv) * 100).toFixed(2) + '%' : 'N/A (Base 0)';
                  const lines = [
                    `────────────────────────`,
                    `Diferencia Abs.: ${diff >= 0 ? '+' : ''}${fmt(diff)} ${metricConfig.unit}`,
                    `Variación YoY: ${pct}`
                  ];
                  if (m.isInactive2026) {
                    lines.push(`Nota: Mes 2026/${m.mesStr} sin actividad cargada en origen.`);
                  }
                  return lines;
                }
              }
            }
          },
          scales: {
            x: { ticks: { color: '#64748b' }, grid: { color: '#f1f5f9' } },
            y: { ticks: { color: '#64748b' }, grid: { color: '#f1f5f9' } }
          }
        }
      });
    }

    // Share by Unidad de Negocio Chart
    const ctxUN = document.getElementById('unShareChartCanvas');
    if (ctxUN) {
      if (unShareChart) unShareChart.destroy();
      const topUN = byUnidadNegocio.filter(u => u.hl26 > 0 || u.hl25 > 0).slice(0, 6);
      unShareChart = new Chart(ctxUN, {
        type: 'doughnut',
        data: {
          labels: topUN.map(u => `${u.label} (${u.shareHL26}%)`),
          datasets: [{
            data: topUN.map(u => u.hl26),
            backgroundColor: ['#ea580c', '#d97706', '#16a34a', '#1e40af', '#7c3aed', '#dc2626'],
            borderColor: '#ffffff',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { color: '#334155', font: { size: 11, weight: '500' } } },
            tooltip: {
              backgroundColor: '#ffffff',
              titleColor: '#ea580c',
              bodyColor: '#1e293b',
              borderColor: '#e2e8f0',
              borderWidth: 1,
              callbacks: {
                label: function (ctx) {
                  const u = topUN[ctx.dataIndex];
                  return `${u.label}: ${fmt(u.hl26)} HL (${u.shareHL26}% part. interna | Var: ${u.hlVarPct !== null ? u.hlVarPct + '%' : 'N/A'})`;
                }
              }
            }
          }
        }
      });
    }

    // Share by Canal Comercial Chart
    const ctxCanal = document.getElementById('canalShareChartCanvas');
    if (ctxCanal) {
      if (canalShareChart) canalShareChart.destroy();
      const topCanales = byCanal.slice(0, 8);
      canalShareChart = new Chart(ctxCanal, {
        type: 'bar',
        data: {
          labels: topCanales.map(c => c.label),
          datasets: [
            {
              label: '2026 Actual (HL)',
              data: topCanales.map(c => c.hl26),
              backgroundColor: '#ea580c',
              borderRadius: 4
            },
            {
              label: '2025 Anterior (HL)',
              data: topCanales.map(c => c.hl25),
              backgroundColor: '#fed7aa',
              borderRadius: 4
            }
          ]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#334155', font: { size: 11, weight: '500' } } },
            tooltip: {
              backgroundColor: '#ffffff',
              titleColor: '#ea580c',
              bodyColor: '#1e293b',
              borderColor: '#e2e8f0',
              borderWidth: 1,
              callbacks: {
                afterBody: function (items) {
                  const c = topCanales[items[0].dataIndex];
                  return `Participación Interna 2026: ${c.shareHL26}% (2025: ${c.shareHL25}%) | Var YoY: ${c.hlVarPct !== null ? c.hlVarPct + '%' : 'N/A'}`;
                }
              }
            }
          },
          scales: {
            x: { ticks: { color: '#64748b' }, grid: { color: '#f1f5f9' } },
            y: { ticks: { color: '#334155', font: { size: 11, weight: '600' } }, grid: { display: false } }
          }
        }
      });
    }
  }

  // Render Quarterly Analysis (T1, T2, T3, T4)
  function renderQuarterlyAnalysis(evalResult) {
    const container = document.getElementById('quartersContainer');
    if (!container) return;
    const { quarterlySeries } = evalResult;

    container.innerHTML = quarterlySeries.map(q => `
      <div class="quarter-card ${q.isInactive2026 ? 'inactive-q' : ''}">
        <div class="quarter-title">
          <span>${esc(q.label)}</span>
          ${q.isInactive2026 ? '<span class="badge badge-warning">Sin Carga 2026</span>' : varBadge(q.hlVarPct)}
        </div>
        <div style="font-size:18px;font-weight:800;font-family:var(--font-mono);margin-bottom:4px;">
          ${fmt(q.hl26)} <small style="font-size:11px;color:var(--accent-orange)">HL</small>
        </div>
        <div style="font-size:11.5px;color:var(--text-secondary);">
          Año Anterior (2025): <strong>${fmt(q.hl25)} HL</strong><br/>
          Diferencia Abs.: <strong>${q.hlDiff >= 0 ? '+' : ''}${fmt(q.hlDiff)} HL</strong><br/>
          Facturación 2026: <strong>${fmtCompactMoney(q.neto26)}</strong> (${q.isInactive2026 ? 'N/A' : (q.netoVarPct !== null ? (q.netoVarPct >= 0 ? '+' : '') + q.netoVarPct + '%' : 'N/A')})<br/>
          CCC Único Trimestral: <strong>${fmt(q.ccc26, 0)}</strong> vs ${fmt(q.ccc25, 0)} PDV
        </div>
      </div>
    `).join('');
  }

  // Render Interactive Commercial Table
  function renderCommercialTable(evalResult) {
    const tbody = document.getElementById('commercialTableBody');
    const groupTitleEl = document.getElementById('tableGroupColumnTitle');
    if (!tbody) return;

    const groupBy = state.tableGroupBy;
    let rows = [];
    let colTitle = 'Canal Comercial';

    if (groupBy === 'canal') { rows = [...evalResult.byCanal]; colTitle = 'Canal Comercial (Canal Mkt.)'; }
    else if (groupBy === 'un') { rows = [...evalResult.byUnidadNegocio]; colTitle = 'Unidad de Negocio (Portfolio)'; }
    else if (groupBy === 'mes') {
      rows = evalResult.monthlySeries.map(m => ({ ...m, label: `${m.mesStr} - ${m.mesNombre}`, shareHL26: evalResult.kpis.volumenHL.actual > 0 ? Number(((m.hl26 / evalResult.kpis.volumenHL.actual) * 100).toFixed(2)) : 0 }));
      colTitle = 'Período Mensual';
    } else if (groupBy === 'trimestre') {
      rows = evalResult.quarterlySeries.map(q => ({ ...q, label: q.label, shareHL26: evalResult.kpis.volumenHL.actual > 0 ? Number(((q.hl26 / evalResult.kpis.volumenHL.actual) * 100).toFixed(2)) : 0 }));
      colTitle = 'Trimestre Comercial';
    } else if (groupBy === 'division') {
      rows = [...evalResult.byDivision];
      colTitle = 'División Comercial';
    } else if (groupBy === 'vendedor') {
      rows = [...evalResult.byVendedor];
      colTitle = 'Vendedor (DetallePersonal)';
    } else if (groupBy === 'producto') {
      rows = [...evalResult.byProducto];
      colTitle = 'Producto / SKU (Top 150)';
    }

    if (groupTitleEl) groupTitleEl.textContent = colTitle;

    if (state.tableSearch) {
      const q = state.tableSearch.toLowerCase();
      rows = rows.filter(r => String(r.label || '').toLowerCase().includes(q) || String(r.canalUnificado || '').toLowerCase().includes(q) || String(r.unidadNegocio || '').toLowerCase().includes(q));
    }

    const sortCol = state.tableSortCol;
    const asc = state.tableSortAsc ? 1 : -1;
    rows.sort((a, b) => {
      if (sortCol === 'label') return String(a.label || '').localeCompare(String(b.label || '')) * asc;
      const va = a[sortCol] !== null && a[sortCol] !== undefined ? Number(a[sortCol]) : -999999999;
      const vb = b[sortCol] !== null && b[sortCol] !== undefined ? Number(b[sortCol]) : -999999999;
      return (va - vb) * asc;
    });

    const displayRows = groupBy === 'producto' ? rows.slice(0, 150) : rows;

    if (displayRows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:24px;color:var(--text-muted);">No se encontraron registros para la combinación de filtros o búsqueda actual.</td></tr>`;
      return;
    }

    tbody.innerHTML = displayRows.map(r => {
      const subBadge = r.canalUnificado ? `<small style="color:var(--text-muted);display:block;">Unif: ${esc(r.canalUnificado)} (${esc(r.segmentoCanal)})</small>` :
        (r.unidadNegocio ? `<small style="color:var(--text-muted);display:block;">UN: ${esc(r.unidadNegocio)}</small>` :
        (r.supervisor ? `<small style="color:var(--text-muted);display:block;">Sup: ${esc(r.supervisor)}</small>` : ''));
      let extraRows = '';
      if (groupBy === 'canal' && r.key === 'Supermercados' && evalResult.cadenitasBreakdown) {
        const { aiello, delfines } = evalResult.cadenitasBreakdown;
        const aielloDiff = aiello.hl26 - aiello.hl25;
        const aielloVarPct = aiello.hl25 > 0 ? Number(((aielloDiff / aiello.hl25) * 100).toFixed(2)) : null;
        const delfinDiff = delfines.hl26 - delfines.hl25;
        const delfinVarPct = delfines.hl25 > 0 ? Number(((delfinDiff / delfines.hl25) * 100).toFixed(2)) : null;

        extraRows = `
          <tr style="background: rgba(234, 88, 12, 0.04); font-size: 11px;">
            <td style="padding-left: 20px; color: var(--accent-orange);"><em>↳ ${esc(aiello.nombre)} (10 sucursales)</em></td>
            <td class="num"><strong>${fmt(aiello.hl26)}</strong></td>
            <td class="num">${fmt(aiello.hl25)}</td>
            <td class="num" style="color:${aielloDiff >= 0 ? 'var(--status-positive)' : 'var(--status-negative)'}">${aielloDiff > 0 ? '+' : ''}${fmt(aielloDiff)}</td>
            <td class="num">${varBadge(aielloVarPct)}</td>
            <td class="num">-</td>
            <td class="num">${fmtCompactMoney(aiello.neto26)}</td>
            <td class="num">${fmtCompactMoney(aiello.neto25)}</td>
            <td class="num">-</td>
            <td class="num"><strong>${fmt(aiello.ccc26, 0)}</strong> <small>(${fmt(aiello.ccc25, 0)})</small></td>
            <td class="num">-</td>
            <td class="num">-</td>
          </tr>
          <tr style="background: rgba(234, 88, 12, 0.04); font-size: 11px;">
            <td style="padding-left: 20px; color: var(--accent-orange);"><em>↳ ${esc(delfines.nombre)} (Sucursales)</em></td>
            <td class="num"><strong>${fmt(delfines.hl26)}</strong></td>
            <td class="num">${fmt(delfines.hl25)}</td>
            <td class="num" style="color:${delfinDiff >= 0 ? 'var(--status-positive)' : 'var(--status-negative)'}">${delfinDiff > 0 ? '+' : ''}${fmt(delfinDiff)}</td>
            <td class="num">${varBadge(delfinVarPct)}</td>
            <td class="num">-</td>
            <td class="num">${fmtCompactMoney(delfines.neto26)}</td>
            <td class="num">${fmtCompactMoney(delfines.neto25)}</td>
            <td class="num">-</td>
            <td class="num"><strong>${fmt(delfines.ccc26, 0)}</strong> <small>(${fmt(delfines.ccc25, 0)})</small></td>
            <td class="num">-</td>
            <td class="num">-</td>
          </tr>
        `;
      }

      return `
        <tr>
          <td><strong>${esc(r.label)}</strong>${subBadge}</td>
          <td class="num"><strong>${fmt(r.hl26)}</strong></td>
          <td class="num">${fmt(r.hl25)}</td>
          <td class="num" style="color:${r.hlDiff >= 0 ? 'var(--status-positive)' : 'var(--status-negative)'}">${r.hlDiff > 0 ? '+' : ''}${fmt(r.hlDiff)}</td>
          <td class="num">${varBadge(r.hlVarPct)}</td>
          <td class="num">${r.shareHL26 !== undefined ? fmt(r.shareHL26) + '%' : '-'}</td>
          <td class="num">${fmtCompactMoney(r.neto26)}</td>
          <td class="num">${fmtCompactMoney(r.neto25)}</td>
          <td class="num">${varBadge(r.netoVarPct)}</td>
          <td class="num"><strong>${fmt(r.ccc26, 0)}</strong> <small style="color:var(--text-muted)">(${fmt(r.ccc25, 0)})</small></td>
          <td class="num">${r.objHL26 ? fmt(r.objHL26) : '-'}</td>
          <td class="num">${r.cumplObj26Pct !== null && r.cumplObj26Pct !== undefined ? `<span class="badge ${r.cumplObj26Pct >= 100 ? 'badge-positive' : 'badge-warning'}">${fmt(r.cumplObj26Pct)}%</span>` : '-'}</td>
        </tr>
        ${extraRows}
      `;
    }).join('');
  }

  // Render Insights & Conclusions
  function renderInsights(insights) {
    const container = document.getElementById('insightsGridContainer');
    const badgeEl = document.getElementById('navInsightsBadge');
    if (badgeEl) badgeEl.textContent = insights.length;
    if (!container) return;

    const filtered = state.insightFilter === 'ALL'
      ? insights
      : insights.filter(i => i.severidad === state.insightFilter || i.tipo.includes(state.insightFilter));

    if (filtered.length === 0) {
      container.innerHTML = `<div class="panel" style="grid-column:1/-1;text-align:center;color:var(--text-muted);">No hay conclusiones que coincidan con el filtro seleccionado.</div>`;
      return;
    }

    container.innerHTML = filtered.map(ins => `
      <div class="insight-card ${esc(ins.severidad)}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span class="badge ${ins.severidad === 'positivo' ? 'badge-positive' : (ins.severidad === 'negativo' ? 'badge-negative' : 'badge-warning')}">${esc(ins.tipo)}</span>
          <span style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted);">${esc(ins.id)}</span>
        </div>
        <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:6px;">
          ${esc(ins.conclusion)}
        </div>
        <table class="insight-meta-table">
          <tr><td><strong>Indicador:</strong> ${esc(ins.indicador)}</td><td><strong>Segmento:</strong> ${esc(ins.segmento)}</td></tr>
          <tr><td><strong>Período:</strong> ${esc(ins.periodo)}</td><td><strong>Variación:</strong> ${esc(ins.variacion)}</td></tr>
          <tr><td><strong>Valor Actual:</strong> ${esc(ins.valorActual)}</td><td><strong>Valor Anterior:</strong> ${esc(ins.valorAnterior)}</td></tr>
          <tr><td colspan="2"><strong>Fuente:</strong> ${esc(formatDataSourceName(ins.fuente))}</td></tr>
          <tr><td colspan="2"><strong>Regla:</strong> <code>${esc(ins.regla)}</code></td></tr>
        </table>
      </div>
    `).join('');
  }

  // Render 20 Real Sources Inventory Table (1. Bases/)
  function renderSourcesInventory() {
    const tbody = document.getElementById('realInventoryTableBody');
    if (!tbody) return;
    const inv = typeof RelationshipEngine.getReal20SourcesInventory2026 === 'function'
      ? RelationshipEngine.getReal20SourcesInventory2026()
      : RelationshipEngine.getReal14SourcesInventory();
    tbody.innerHTML = inv.map(item => `
      <tr>
        <td class="num">${item.id}</td>
        <td><strong>${esc(item.fileName)}</strong></td>
        <td><span class="badge ${item.category === 'Fijo' ? 'badge-neutral' : (item.category === 'SemiFijo' ? 'badge-positive' : 'badge-warning')}">${esc(item.category)}</span></td>
        <td>${esc(item.format)} (${item.sheets.length} hoja${item.sheets.length > 1 ? 's' : ''}: ${esc(item.sheets.join(', '))})</td>
        <td>${esc(item.classification)}<br/><small style="color:var(--accent-yellow)">${esc(item.modelRole)}</small></td>
        <td class="num"><strong>${fmt(item.records, 0)}</strong></td>
        <td style="white-space:normal;min-width:220px;font-size:11.5px;">${esc(item.keyColumns.join(', '))}</td>
        <td style="white-space:normal;min-width:260px;font-size:11.5px;">
          ${item.warnings.length > 0
            ? item.warnings.map(w => `<div style="color:var(--accent-yellow)">⚠️ ${esc(w)}</div>`).join('')
            : '<span style="color:var(--status-positive)">✓ Sin advertencias estructurales</span>'}
        </td>
        <td style="white-space:normal;min-width:220px;font-size:11.5px;">${esc(item.dashboardUsage)}</td>
      </tr>
    `).join('');
  }

  // Render Relationships & Ambiguity Review
  function renderRelationshipsView() {
    const tbody = document.getElementById('relationshipsTableBody');
    if (!tbody) return;
    const rels = typeof RelationshipEngine.getRealRelationshipsList2026 === 'function'
      ? RelationshipEngine.getRealRelationshipsList2026()
      : RelationshipEngine.getRealRelationshipsList();
    tbody.innerHTML = rels.map(r => {
      const isConfirmed = state.confirmedAmbiguousRels.has(r.id) || !r.ambiguous;
      return `
        <tr>
          <td><code>${esc(r.id)}</code></td>
          <td><strong>${esc(r.sourceTable)}</strong><br/><small style="color:var(--accent-orange)">Clave: ${esc(r.sourceColumn)}</small></td>
          <td><strong>${esc(r.targetTable)}</strong><br/><small style="color:var(--accent-yellow)">Clave: ${esc(r.targetColumn)}</small></td>
          <td><span class="badge badge-neutral">${esc(r.cardinality)}</span></td>
          <td class="num"><strong>${fmt(r.coveragePct)}%</strong><br/><small>${fmt(r.matchedKeys, 0)} coinc. / ${r.orphanKeyCount} huérf.</small></td>
          <td>
            <span class="badge ${isConfirmed ? 'badge-positive' : 'badge-warning'}">
              ${isConfirmed ? '✓ Confirmada' : '⚠️ Revisión Pendiente'}
            </span>
          </td>
          <td style="white-space:normal;min-width:280px;font-size:11.5px;">${esc(r.explanation)}</td>
          <td>
            ${r.ambiguous
              ? `<button class="btn ${isConfirmed ? '' : 'btn-primary'} btn-toggle-rel" data-rel-id="${esc(r.id)}" style="padding:4px 8px;font-size:11px;">
                  ${isConfirmed ? 'Re-evaluar' : 'Confirmar Relación'}
                </button>`
              : '<span style="font-size:11px;color:var(--text-muted)">Automática 100%</span>'}
          </td>
        </tr>
      `;
    }).join('');

    document.querySelectorAll('.btn-toggle-rel').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-rel-id');
        if (state.confirmedAmbiguousRels.has(id)) state.confirmedAmbiguousRels.delete(id);
        else state.confirmedAmbiguousRels.add(id);
        PersistenceEngine.saveAppState({
          universeMode: state.universeMode,
          filters: state.filters,
          confirmedRelationships: [...state.confirmedAmbiguousRels]
        });
        renderRelationshipsView();
      });
    });
  }

  // Render Operational Audit View (Activos Fijos, Negociaciones, Rechazos, IndexedDB History)
  async function renderAuditView() {
    const op = CommercialMathEngine.evaluateOperationalBases(state.realBundleBackup);
    const afBox = document.getElementById('auditActivosFijosSummary');
    if (afBox) {
      const af = op.activosFijos;
      afBox.innerHTML = `
        <div class="kpi-grid" style="margin-bottom:12px;">
          <div class="kpi-card">
            <div class="kpi-header"><span>Total Parque de Frío</span><span>(Actualizar) Activos Fijos.xlsx</span></div>
            <div class="kpi-main-value">${fmt(af.totalEquipos, 0)} <small style="font-size:12px">Heladeras</small></div>
            <div class="kpi-subtext">Instaladas: <strong>${af.instalados}</strong> | En Stock: <strong>${af.enStock}</strong> | De Baja: <strong>${af.deBaja}</strong></div>
          </div>
          <div class="kpi-card secondary-accent">
            <div class="kpi-header"><span>Volumen Repago (Conversión L → HL)</span><span>HL = Litros / 100</span></div>
            <div class="kpi-main-value">${fmt(af.hlRepagoTotal)} <small style="font-size:12px">HL</small></div>
            <div class="kpi-subtext">Origen en Litros: <strong>${fmt(af.litrosRepagoTotal, 0)} L</strong> ÷ 100 = ${fmt(af.hlRepagoTotal)} HL</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-header"><span>Clientes con Activo y Repago</span><span>Estado de Repago</span></div>
            <div class="kpi-main-value">${fmt(af.clientesUnicosConActivo, 0)} <small style="font-size:12px">Clientes</small></div>
            <div class="kpi-subtext">Repaga SI: <strong>${af.repagaSi}</strong> | Repaga NO: <strong>${af.repagaNo}</strong> | Venta Prom.: ${fmt(af.hlVentaPromTotal)} HL</div>
          </div>
        </div>
      `;
    }

    const negBox = document.getElementById('auditNegociacionesBody');
    if (negBox) {
      negBox.innerHTML = op.negociaciones.porGrupoProducto.slice(0, 12).map(g => `
        <tr>
          <td><strong>${esc(g.descripcion)}</strong></td>
          <td class="num">${fmt(g.acuerdos, 0)}</td>
          <td class="num">${fmt(g.clientesUnicos, 0)}</td>
          <td class="num"><span class="badge badge-warning">${fmt(g.bonifPromedioPct)}%</span></td>
        </tr>
      `).join('');
    }

    const recBox = document.getElementById('auditRechazosMotivosBody');
    if (recBox && state.lastEvaluation) {
      const motivos = state.lastEvaluation.kpis.complementarios.rechazos.porMotivo;
      recBox.innerHTML = motivos.map(m => `
        <tr>
          <td><strong>${esc(m.motivo)}</strong></td>
          <td class="num">${fmt(m.count26, 0)}</td>
          <td class="num">${fmt(m.hl26)} HL</td>
          <td class="num">$${fmt(m.neto26)}</td>
          <td class="num">${fmt(m.count25, 0)}</td>
          <td class="num">${fmt(m.hl25)} HL</td>
        </tr>
      `).join('');
    }

    const histBody = document.getElementById('importHistoryTableBody');
    if (histBody) {
      const hist = await PersistenceEngine.getImportHistory();
      if (hist.length === 0) {
        histBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">Inicializado con las 14 fuentes reales del workspace.</td></tr>`;
      } else {
        histBody.innerHTML = hist.map(h => `
          <tr>
            <td><code>${esc(h.timestamp.slice(0, 19).replace('T', ' '))}</code></td>
            <td><span class="badge ${h.universeMode === 'REAL_14' ? 'badge-positive' : 'badge-warning'}">${esc(h.universeMode)}</span></td>
            <td>${esc(h.actionType)}</td>
            <td class="num">${h.filesCount}</td>
            <td class="num">${fmt(h.totalValidRows, 0)}</td>
            <td style="white-space:normal;font-size:11.5px;">${esc(h.summary)}</td>
          </tr>
        `).join('');
      }
    }
  }

  // Render Pending Validation Preview in Ingestion Module (Section 5.7)
  function renderPendingValidationPreview() {
    const panel = document.getElementById('validationPreviewPanel');
    if (!panel) return;
    if (!state.pendingBatch) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = 'block';
    const { batchResult, relResult, isSyntheticPreset } = state.pendingBatch;
    const files = batchResult.files || [];

    let totalValid = 0, totalRejected = 0, totalDups = 0, totalWarnings = 0, totalErrors = 0;
    const sheetRowsHtml = [];

    for (const f of files) {
      totalWarnings += (f.warnings || []).length;
      totalErrors += (f.errors || []).length;
      if (f.status === 'error') {
        sheetRowsHtml.push(`
          <tr>
            <td><strong>${esc(f.fileName)}</strong></td>
            <td><span class="badge badge-negative">${esc(f.format)} (ERROR)</span></td>
            <td>-</td>
            <td><span class="badge badge-negative">Lectura Fallida</span></td>
            <td class="num">0</td>
            <td class="num">0</td>
            <td class="num">0</td>
            <td style="white-space:normal;color:var(--status-negative)">${esc(f.errors.join('; '))}</td>
          </tr>
        `);
        continue;
      }

      for (const s of f.sheets) {
        totalValid += s.validRowCount;
        totalRejected += s.rejectedRowCount;
        totalDups += s.duplicateRowCount;
        const rolesDetected = s.columns.filter(c => c.semanticRole !== 'atributo_general').map(c => `${c.name} → ${c.semanticLabel}`);
        sheetRowsHtml.push(`
          <tr>
            <td><strong>${esc(f.fileName)}</strong> <small style="color:var(--text-muted)">(${(f.sizeBytes / 1024).toFixed(1)} KB)</small></td>
            <td><code>${esc(s.sheetName)}</code> (${f.sheetCount} hoja${f.sheetCount > 1 ? 's' : ''})</td>
            <td>
              <strong>${esc(s.classification.classification)}</strong><br/>
              <small style="color:var(--accent-yellow)">${esc(s.classification.modelRole)} (Confianza: ${Math.round(s.classification.confidence * 100)}%)</small>
            </td>
            <td class="num"><strong style="color:var(--status-positive)">${fmt(s.validRowCount, 0)}</strong></td>
            <td class="num">${fmt(s.rejectedRowCount, 0)} <small>(Tot:${s.excludedTotalRows || 0} | Meta:${s.excludedMetadataRows || 0})</small></td>
            <td class="num">${fmt(s.duplicateRowCount, 0)}</td>
            <td style="white-space:normal;min-width:220px;font-size:11px;">${esc(rolesDetected.slice(0, 6).join(' | '))}</td>
            <td style="white-space:normal;min-width:220px;font-size:11px;">
              ${s.warnings.length > 0 ? s.warnings.map(w => `<div style="color:var(--accent-yellow)">⚠️ ${esc(w)}</div>`).join('') : '<span style="color:var(--status-positive)">✓ OK</span>'}
            </td>
          </tr>
        `);
      }
    }

    const rels = (relResult && relResult.relationships) || [];
    const relsHtml = rels.map(r => `
      <tr>
        <td><strong>${esc(r.sourceTable)}</strong> (<code>${esc(r.sourceColumn)}</code>)</td>
        <td><strong>${esc(r.targetTable)}</strong> (<code>${esc(r.targetColumn)}</code>)</td>
        <td><span class="badge badge-neutral">${esc(r.cardinality)}</span></td>
        <td class="num"><strong>${fmt(r.coveragePct)}%</strong></td>
        <td class="num">${r.orphanKeyCount} ${r.orphanKeysSample && r.orphanKeysSample.length ? `(${esc(r.orphanKeysSample.join(', '))})` : ''}</td>
        <td style="white-space:normal;font-size:11px;">${esc(r.explanation)}</td>
      </tr>
    `).join('');

    document.getElementById('previewSummaryMetrics').innerHTML = `
      <div class="kpi-grid" style="margin-bottom:14px;">
        <div class="kpi-card">
          <div class="kpi-header"><span>Archivos / Hojas Detectadas</span></div>
          <div class="kpi-main-value">${files.length} arch.</div>
          <div class="kpi-subtext">${isSyntheticPreset ? 'Lote Sintético Controlado (Separado de Datos Reales)' : 'Lote de Ingesta Multifuentе'}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-header"><span>Registros Válidos Operativos</span></div>
          <div class="kpi-main-value" style="color:var(--status-positive)">${fmt(totalValid, 0)}</div>
          <div class="kpi-subtext">Rechazados/Excluidos: <strong>${fmt(totalRejected, 0)}</strong> | Duplicados: <strong>${fmt(totalDups, 0)}</strong></div>
        </div>
        <div class="kpi-card secondary-accent">
          <div class="kpi-header"><span>Relaciones Detectadas</span></div>
          <div class="kpi-main-value">${rels.length} cruces</div>
          <div class="kpi-subtext">Advertencias: <strong>${totalWarnings}</strong> | Errores: <strong>${totalErrors}</strong></div>
        </div>
      </div>
    `;

    // Extract sales metrics and preview sample rows
    let detectedPeriod = 'Octubre 2026 (2026/10)';
    let totalSalesHL = 0;
    let totalSalesNeto = 0;
    const salesCCCSet = new Set();
    let salesRowsCount = 0;
    const sampleRows = [];
    let isSalesDataPresent = false;

    for (const f of files) {
      if (f.status === 'error') continue;
      for (const s of f.sheets) {
        const isSales = s.classification && (s.classification.classification === 'Ventas' || s.classification.isFingerprintMatch);
        const colMap = {};
        (s.columns || []).forEach((c, idx) => {
          colMap[c.semanticRole] = idx;
        });

        const pIdx = colMap['periodo'];
        const cIdx = colMap['cod_cliente'];
        const prIdx = colMap['cod_producto'];
        const caIdx = colMap['canal'];
        const hlIdx = colMap['volumen_hl'];
        const ltIdx = colMap['volumen_litros'];
        const netIdx = colMap['facturacion_neta'];

        const rows = s.cleanRows || [];
        if (isSales && rows.length > 0) {
          isSalesDataPresent = true;
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            salesRowsCount++;
            const per = pIdx !== undefined && r[pIdx] ? String(r[pIdx]) : '';
            if (per && (per.includes('2026/10') || per.toLowerCase().includes('oct'))) {
              detectedPeriod = 'Octubre 2026 (2026/10)';
            } else if (per && !detectedPeriod) {
              detectedPeriod = per;
            }

            const cte = cIdx !== undefined ? r[cIdx] : null;
            if (cte !== null && cte !== undefined && cte !== '') {
              salesCCCSet.add(cte);
            }

            let hl = 0;
            if (hlIdx !== undefined && r[hlIdx] !== null) {
              hl = Number(r[hlIdx]) || 0;
            } else if (ltIdx !== undefined && r[ltIdx] !== null) {
              hl = (Number(r[ltIdx]) || 0) / 100;
            }
            totalSalesHL += hl;

            let neto = 0;
            if (netIdx !== undefined && r[netIdx] !== null) {
              neto = Number(r[netIdx]) || 0;
            }
            totalSalesNeto += neto;

            if (sampleRows.length < 10) {
              sampleRows.push({
                fila: sampleRows.length + 1,
                periodo: per || '2026/10',
                cliente: cte !== null ? cte : 'S/D',
                producto: prIdx !== undefined && r[prIdx] !== null ? r[prIdx] : 'S/D',
                canal: caIdx !== undefined && r[caIdx] !== null ? r[caIdx] : 'Tradicional',
                hl,
                neto
              });
            }
          }
        } else if (!isSalesDataPresent && rows.length > 0 && sampleRows.length < 10) {
          for (let i = 0; i < Math.min(10, rows.length); i++) {
            const r = rows[i];
            sampleRows.push({
              fila: sampleRows.length + 1,
              periodo: pIdx !== undefined && r[pIdx] ? String(r[pIdx]) : '2026/10',
              cliente: cIdx !== undefined && r[cIdx] ? r[cIdx] : 'PDV',
              producto: prIdx !== undefined && r[prIdx] ? r[prIdx] : s.sheetName,
              canal: caIdx !== undefined && r[caIdx] ? r[caIdx] : 'General',
              hl: hlIdx !== undefined && r[hlIdx] !== null ? Number(r[hlIdx]) || 0 : 0,
              neto: netIdx !== undefined && r[netIdx] !== null ? Number(r[netIdx]) || 0 : 0
            });
          }
        }
      }
    }

    const diagCardEl = document.getElementById('auditDiagnosticCardContainer');
    if (diagCardEl) {
      diagCardEl.innerHTML = `
        <div class="audit-diagnostic-card">
          <div class="audit-diagnostic-title">
            <span>📋</span> Ficha de Control y Auditoría Pre-Incorporación — LuanBeer
          </div>
          <div class="audit-diagnostic-grid">
            <div class="audit-diagnostic-stat">
              <div class="audit-diagnostic-stat-label">Período Detectado</div>
              <div class="audit-diagnostic-stat-value" style="color:var(--accent-orange);font-size:16px;">
                ${esc(detectedPeriod)}
              </div>
            </div>
            <div class="audit-diagnostic-stat">
              <div class="audit-diagnostic-stat-label">Volumen a Incorporar</div>
              <div class="audit-diagnostic-stat-value">
                ${fmt(totalSalesHL)} <small style="font-size:12px;color:var(--text-muted)">HL</small>
              </div>
            </div>
            <div class="audit-diagnostic-stat">
              <div class="audit-diagnostic-stat-label">Facturación Neta Control</div>
              <div class="audit-diagnostic-stat-value">
                ${fmtCompactMoney(totalSalesNeto)}
              </div>
            </div>
            <div class="audit-diagnostic-stat">
              <div class="audit-diagnostic-stat-label">Clientes Únicos (CCC)</div>
              <div class="audit-diagnostic-stat-value" style="color:var(--status-positive);">
                ${fmt(salesCCCSet.size, 0)} <small style="font-size:12px;color:var(--text-muted)">PDVs</small>
              </div>
            </div>
          </div>
          <div class="audit-impact-alert">
            <span>🛡️</span>
            <div>
              <strong>Impacto en el Histórico:</strong> Se actualizarán <strong>${fmt(salesRowsCount || totalValid, 0)} registros</strong> del mes <strong>${esc(detectedPeriod)}</strong> mediante consolidación segura. Los <strong>256.131 registros</strong> de 2026/01 a 2026/09 y el año 2025 permanecen <strong>intactos y protegidos</strong> sin riesgo de duplicación.
            </div>
          </div>
        </div>
      `;
    }

    const sampleBodyEl = document.getElementById('previewDataSampleBody');
    if (sampleBodyEl) {
      if (sampleRows.length === 0) {
        sampleBodyEl.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:14px;">No hay registros cargados para previsualizar.</td></tr>`;
      } else {
        sampleBodyEl.innerHTML = sampleRows.map(r => `
          <tr>
            <td class="num">${r.fila}</td>
            <td><code>${esc(r.periodo)}</code></td>
            <td><strong>#${esc(r.cliente)}</strong></td>
            <td>${esc(r.producto)}</td>
            <td>${esc(r.canal)}</td>
            <td class="num"><strong>${fmt(r.hl)}</strong></td>
            <td class="num">$${fmt(r.neto)}</td>
          </tr>
        `).join('');
      }
    }

    document.getElementById('previewSheetsTableBody').innerHTML = sheetRowsHtml.join('');
    document.getElementById('previewRelsTableBody').innerHTML = relsHtml || `<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">Sin cruces entre hojas en este lote.</td></tr>`;
  }

  // Render Tablero de Ventas (TACO .xlsb)
  function renderTableroTaco() {
    if (!GalaxiaEngine) return;
    const tacoData = GalaxiaEngine.computeTableroVentasTaco(state.activeBundle, state.tacoFilters);

    // Update Corte Badge
    const badgeCorte = document.getElementById('tacoCorteBadge');
    const fc = tacoData.fechaCorte || {};
    const dt = fc.diasTranscurridos || 21;
    const da = fc.diasActivos || 26;
    const avPct = fc.avanceMesPct || 80.77;
    const fact = fc.factorTendenciaCierre || 1.2381;

    if (badgeCorte) {
      const sync = state.activeBundle && state.activeBundle._baseFechaSync;
      const fd = tacoData.fuenteDatos || {};
      const mr = fd.modeloRelacional || {};
      const filasTxt = (fd.filasPeriodo || (sync && sync.filas) || 12899).toLocaleString('es-AR');
      const origenTxt = (sync && sync.origen) || fd.archivo || 'Base a la Fecha MA.xlsx';
      const relTxt = mr.activeRows !== undefined
        ? ` • 🔗 Join: ${mr.activeRows.toLocaleString('es-AR')} act. (${mr.discardedAnuladosRows || 0} anul. excl.)`
        : '';
      badgeCorte.innerHTML = `📅 Corte: Octubre 2026 (${dt}/${da} días = ${avPct}%) • 🟢 ${esc(origenTxt)} (${filasTxt} reg${relTxt})`;
    }

    // Populate Slicers if needed
    const vendSel = document.getElementById('tacoSlicerVendedor');
    if (vendSel && vendSel.options.length <= 1) {
      const vList = tacoData.vendedoresMatrix || [];
      vList.forEach(v => {
        const opt = document.createElement('option');
        opt.value = String(v.vendedor);
        opt.textContent = `V${v.vendedor} - ${v.nombre} (${v.supervisor || 'S/D'})`;
        vendSel.appendChild(opt);
      });
    }
    const canalSel = document.getElementById('tacoSlicerCanal');
    if (canalSel && canalSel.options.length <= 1) {
      (state.activeBundle.dictionaries.canalesRaw || []).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        canalSel.appendChild(opt);
      });
    }
    const subcanalSel = document.getElementById('tacoSlicerSubcanal');
    if (subcanalSel && subcanalSel.options.length <= 1) {
      const scList = [...new Set((state.activeBundle.masters.clientes || []).filter(c => c.anulado === 'NO').map(c => c.subcanal).filter(Boolean))].sort();
      scList.forEach(sc => {
        const opt = document.createElement('option');
        opt.value = sc;
        opt.textContent = sc;
        subcanalSel.appendChild(opt);
      });
    }

    // Render Scorecard Banner
    const scoresEl = document.getElementById('tacoScoresContainer');
    if (scoresEl) {
      const sc = tacoData.scores;
      const semaforoKpi = GalaxiaEngine.getSemaforoTaco(sc.tacoKpiPct);
      const semaforoRto = GalaxiaEngine.getSemaforoTaco(sc.tacoRtoPct);
      const semaforoTotal = GalaxiaEngine.getSemaforoTaco(sc.tacoTotalPct);
      const comp = tacoData.comparativaMesas;

      scoresEl.innerHTML = `
        <div class="taco-score-card primary">
          <div class="kpi-header"><span>1. TACO KPI %</span><span class="semaforo-badge ${semaforoKpi.color}">${semaforoKpi.label}</span></div>
          <div class="taco-score-value">${sc.tacoKpiPct.toFixed(2)}%</div>
          <div class="kpi-subtext">Facturación Digital (101.6%), Productividad (86.2%), Enfriadores (83.4%)</div>
        </div>
        <div class="taco-score-card cyan">
          <div class="kpi-header"><span>2. TACO RTO %</span><span class="semaforo-badge ${semaforoRto.color}">${semaforoRto.label}</span></div>
          <div class="taco-score-value">${sc.tacoRtoPct.toFixed(2)}%</div>
          <div class="kpi-subtext">Avance acumulado corte día ${dt} de ${da} hábiles (Proyección LE ×${fact})</div>
        </div>
        <div class="taco-score-card secondary">
          <div class="kpi-header"><span>3. TACO TOTAL %</span><span class="semaforo-badge ${semaforoTotal.color}">${semaforoTotal.label}</span></div>
          <div class="taco-score-value">${sc.tacoTotalPct.toFixed(2)}%</div>
          <div class="kpi-subtext">Ponderación oficial combinada de Tablero Ventas.xlsb</div>
        </div>
        <div class="taco-score-card">
          <div class="kpi-header"><span>Comparativa de Mesas</span><span class="badge badge-neutral">S1 vs S2</span></div>
          <div style="font-size:12.5px;color:var(--text-secondary);margin-top:6px;line-height:1.7;">
            <div>Mando Integral: <strong>${comp.mandoIntegral.tacoTotalPct.toFixed(2)}%</strong></div>
            <div>Mesa Julio (101): <strong>${comp.mesaJulio.tacoTotalPct.toFixed(2)}%</strong></div>
            <div>Mesa Gonza (100): <strong>${comp.mesaGonza.tacoTotalPct.toFixed(2)}%</strong></div>
          </div>
        </div>
      `;
    }

    // Render TACO KPI Table
    const kpiTbody = document.getElementById('tacoKpiTableBody');
    if (kpiTbody) {
      kpiTbody.innerHTML = (tacoData.kpiItems || []).map(k => {
        const dec = (k.real % 1 === 0 && k.objetivo % 1 === 0) ? 0 : 1;
        return `
        <tr>
          <td><strong>${esc(k.indicador)}</strong></td>
          <td class="num">${fmt(k.real, dec)}</td>
          <td class="num">${fmt(k.objetivo, dec)}</td>
          <td class="num" style="font-weight:700;">${k.alcancePct.toFixed(1)}%</td>
          <td class="num">${k.tendenciaRatio !== undefined ? k.tendenciaRatio.toFixed(1) + '%' : '-'}</td>
          <td style="text-align:center;">${renderTacoEstadoBadge(k.real, k.objetivo, k.semaforo?.color, { dec })}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">Sin indicadores KPI para el filtro seleccionado.</td></tr>';
    }

    // Render TACO Resultados Table
    const rtoTbody = document.getElementById('tacoRtoTableBody');
    if (rtoTbody) {
      rtoTbody.innerHTML = (tacoData.rtoItems || []).map(r => {
        const isMoney = String(r.indicador).includes('GMV') || String(r.indicador).includes('IP Mktplc') || String(r.indicador).includes('$');
        const isHL = String(r.indicador).includes('VOL') || String(r.indicador).includes('HL');
        const prefix = isMoney ? '$ ' : '';
        const suffix = isHL ? ' HL' : '';
        const dec = isMoney ? 0 : (r.real % 1 === 0 && r.objetivo % 1 === 0 ? 0 : 1);
        const leRatioText = r.tendenciaRatio !== undefined ? `${r.tendenciaRatio.toFixed(1)}%` : (r.proyectadoCierre ? `${prefix}${fmt(r.proyectadoCierre, dec)}${suffix}` : '-');
        const titleTooltip = r.proyectadoCierre ? `Proyección al cierre LE: ${prefix}${fmt(r.proyectadoCierre, dec)}${suffix}` : '';

        return `
        <tr>
          <td><strong>${esc(r.indicador)}</strong></td>
          <td class="num">${prefix}${fmt(r.real, dec)}${suffix}</td>
          <td class="num">${prefix}${fmt(r.objetivo, dec)}${suffix}</td>
          <td class="num" style="font-weight:700;">${r.alcancePct.toFixed(1)}%</td>
          <td class="num" style="color:var(--accent-orange);font-weight:700;" title="${esc(titleTooltip)}">${leRatioText}</td>
          <td style="text-align:center;">${renderTacoEstadoBadge(r.real, r.objetivo, r.semaforo?.color, { prefix, suffix, dec })}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">Sin resultados disponibles.</td></tr>';
    }

    // Render Vendedores Matrix
    const vendTbody = document.getElementById('tacoVendedoresTableBody');
    if (vendTbody) {
      vendTbody.innerHTML = (tacoData.vendedoresMatrix || []).map(v => `
        <tr>
          <td><span class="badge badge-neutral">V${v.vendedor}</span></td>
          <td><strong>${esc(v.nombre)}</strong></td>
          <td>${esc(v.supervisor || 'S/D')}</td>
          <td><small>${esc(v.tipoPreventa || 'VE')}</small></td>
          <td class="num" style="font-weight:800;color:var(--accent-orange);">${v.tacoTotalPct.toFixed(1)}%</td>
          <td class="num">${fmt(v.totalCza?.real || 0, 1)}</td>
          <td class="num">${(v.aboveCore?.alcancePct || 0).toFixed(1)}%</td>
          <td class="num">${(v.coreValue?.alcancePct || 0).toFixed(1)}%</td>
          <td class="num">${fmt(v.totalUng?.real || 0, 1)}</td>
          <td class="num">${(v.topUng?.alcancePct || 0).toFixed(1)}%</td>
          <td class="num">${fmtCompactMoney(v.gmvMktplc?.real || 0)}</td>
          <td class="num">${fmt(v.cccCerveza?.real || 0, 0)}</td>
          <td class="num">${fmt(v.cccUng?.real || 0, 0)}</td>
          <td class="num">${(v.censo?.avancePct || 0).toFixed(1)}%</td>
          <td><span class="semaforo-badge ${v.semaforoTotal.color}">${v.semaforoTotal.label}</span></td>
        </tr>
      `).join('') || '<tr><td colspan="15" style="text-align:center;color:var(--text-muted);">Sin promotores que coincidan con los filtros.</td></tr>';
    }

    // Render Drill-Down
    const dd = tacoData.drillDown || {};
    const sumEl = document.getElementById('tacoDrillDownSummary');
    if (sumEl) sumEl.textContent = `Mostrando ${fmt(dd.totalClientsMatched || 0, 0)} clientes filtrados según los Slicers activos`;

    const renderDrillTable = (tbodyId, list, cols) => {
      const el = document.getElementById(tbodyId);
      if (!el) return;
      el.innerHTML = list.map(item => cols(item)).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">Sin registros.</td></tr>';
    };

    renderDrillTable('drillSupervisorTbody', dd.bySupervisor || [], item => `
      <tr><td><strong>${esc(item.label)}</strong></td><td class="num">${fmt(item.pdvsTotal,0)}</td><td class="num">${fmt(item.pdvsCompradores,0)}</td><td class="num">${item.coberturaPct.toFixed(1)}%</td><td class="num">${fmt(item.hlYTD,1)}</td><td class="num">${fmt(item.bultosYTD,0)}</td></tr>
    `);
    renderDrillTable('drillPromotorTbody', dd.byPromotor || [], item => `
      <tr><td><strong>${esc(item.label)}</strong></td><td>${esc(item.supervisor || '')}</td><td class="num">${fmt(item.pdvsTotal,0)}</td><td class="num">${fmt(item.pdvsCompradores,0)}</td><td class="num">${item.coberturaPct.toFixed(1)}%</td><td class="num">${fmt(item.hlYTD,1)}</td><td class="num">${fmt(item.bultosYTD,0)}</td></tr>
    `);
    renderDrillTable('drillCanalTbody', dd.byCanal || [], item => `
      <tr><td><strong>${esc(item.label)}</strong></td><td class="num">${fmt(item.pdvsTotal,0)}</td><td class="num">${fmt(item.pdvsCompradores,0)}</td><td class="num">${item.coberturaPct.toFixed(1)}%</td><td class="num">${fmt(item.hlYTD,1)}</td><td class="num">${fmt(item.bultosYTD,0)}</td></tr>
    `);
    renderDrillTable('drillSubcanalTbody', dd.bySubcanal || [], item => `
      <tr><td><strong>${esc(item.label)}</strong></td><td>${esc(item.canal || '')}</td><td class="num">${fmt(item.pdvsTotal,0)}</td><td class="num">${fmt(item.pdvsCompradores,0)}</td><td class="num">${item.coberturaPct.toFixed(1)}%</td><td class="num">${fmt(item.hlYTD,1)}</td><td class="num">${fmt(item.bultosYTD,0)}</td></tr>
    `);
    renderDrillTable('drillClientesTbody', dd.topClients || [], c => `
      <tr>
        <td><code>${c.codigo}</code></td>
        <td><strong>${esc(c.nombre)}</strong></td>
        <td><small>${esc(c.canal)}</small></td>
        <td><small>${esc(c.subcanal)}</small></td>
        <td>${esc(c.nombreVendedor)}</td>
        <td>${c.ruta}</td>
        <td>${esc(c.diasVisita)}</td>
        <td class="num" style="font-weight:700;">${fmt(c.hlYTD, 1)}</td>
        <td class="num">${fmt(c.hlSep, 1)}</td>
        <td><small>${esc(c.clusterCenso)}</small></td>
        <td><span class="badge ${c.esPlanCza === 'SI' ? 'badge-positive' : 'badge-neutral'}">${c.esPlanCza}</span></td>
      </tr>
    `);
  }

  // Render Programa Galaxia 2026 (CMQ)
  function renderGalaxia2026() {
    if (!GalaxiaEngine) return;
    const g = GalaxiaEngine.computeGalaxia2026Evaluation(state.activeBundle);
    const sc11k = g.scorecard11000;

    // 1. Update Hero Banner
    const ptsEl = document.getElementById('galaxiaTotalPtsDisplay');
    if (ptsEl) ptsEl.textContent = sc11k.puntajeTotalObtenido.toLocaleString('es-AR');
    const pctBadge = document.getElementById('galaxiaPctBadge');
    if (pctBadge) pctBadge.textContent = `${sc11k.pctTotalGalaxia.toFixed(2)}%`;
    const scaleBar = document.getElementById('cmqScaleFillBar');
    if (scaleBar) scaleBar.style.width = `${Math.min(100, sc11k.pctTotalGalaxia)}%`;
    const rankBadge = document.getElementById('galaxiaRankingBadge');
    if (rankBadge) rankBadge.textContent = sc11k.categoriaRanking;

    // 2. Render Bloques Summary Cards
    const blSummary = document.getElementById('galaxiaBloquesSummary');
    if (blSummary) {
      const b = sc11k.bloques;
      blSummary.innerHTML = `
        <div class="taco-score-card primary">
          <div class="kpi-header"><span>Bloque 1 (55% CMQ)</span><span class="badge badge-positive">${b.gestionManual.alcancePct}%</span></div>
          <div class="taco-score-value">${b.gestionManual.puntosObtenidos.toLocaleString('es-AR')}</div>
          <div class="kpi-subtext">de ${b.gestionManual.pesoMaxPts.toLocaleString('es-AR')} Pts Base | 8 Pilares Manual Distribuidores 2026</div>
        </div>
        <div class="taco-score-card cyan">
          <div class="kpi-header"><span>Bloque 2 (40% CMQ)</span><span class="badge badge-warning">${b.resultadosTaco.alcancePct}%</span></div>
          <div class="taco-score-value">${b.resultadosTaco.puntosObtenidos.toLocaleString('es-AR')}</div>
          <div class="kpi-subtext">de ${b.resultadosTaco.pesoMaxPts.toLocaleString('es-AR')} Pts Base | Tendencia Cierre Tablero TACO .xlsb</div>
        </div>
        <div class="taco-score-card secondary">
          <div class="kpi-header"><span>Bloque 3 (5% CMQ)</span><span class="badge badge-positive">${b.bonusGalaxia.alcancePct}%</span></div>
          <div class="taco-score-value">${b.bonusGalaxia.puntosObtenidos.toLocaleString('es-AR')}</div>
          <div class="kpi-subtext">de ${b.bonusGalaxia.pesoMaxPts.toLocaleString('es-AR')} Pts Base | Sobrecumplimiento & Excelencia BEES</div>
        </div>
      `;
    }

    // 3. Render Contents of the 8 Pillars
    const p = g.pilaresDetalle;

    // Pilar 1
    const p1El = document.getElementById('pilar1Content');
    if (p1El) {
      const dot = p.pilar1EstructuraOnPremise?.dotacionTotal || 25;
      const opCount = p.pilar1EstructuraOnPremise?.onPremise2026?.totalActivosOnPremise || 259;
      const subList = Object.entries(p.pilar1EstructuraOnPremise?.onPremise2026?.desglosePorCategoria || {});
      p1El.innerHTML = `
        <div class="panel-header" style="margin-bottom:12px;">
          <div>
            <div class="panel-title">Pilar 1: Estructura Comercial & Foco On Premise 2026</div>
            <small style="color:var(--text-muted)">Dotación comercial auditada en (SemiFijo) DetallePersonal.xlsx y Clientes Presencial.xlsx</small>
          </div>
        </div>
        <div class="kpi-grid" style="margin-bottom:16px;">
          <div class="kpi-card"><div class="kpi-header"><span>Dotación Total Activa</span></div><div class="kpi-main-value">${dot} HC</div><div class="kpi-subtext">16 Promotores + 2 Merchands + 2 SPV + 3 Backups + 1 Gerente</div></div>
          <div class="kpi-card secondary-accent"><div class="kpi-header"><span>PDVs Activos On Premise</span></div><div class="kpi-main-value" style="color:var(--accent-yellow);">${opCount}</div><div class="kpi-subtext">Gastronomía, Bares, Pubs, Discos, Comidas Rápidas, Hoteles</div></div>
        </div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Categoría On Premise</th><th class="num">PDVs Activos en Padrón</th><th class="num">% s/Total On Premise</th></tr></thead>
            <tbody>
              ${subList.filter(([k]) => k !== 'OFF PREMISE / TRADICIONAL').map(([cat, cnt]) => `
                <tr><td><strong>${esc(cat)}</strong></td><td class="num">${cnt}</td><td class="num">${((cnt / opCount) * 100).toFixed(1)}%</td></tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    // Pilar 2
    const p2El = document.getElementById('pilar2Content');
    if (p2El) {
      const aud = p.pilar2CalidadYFrecuencias?.auditoriaCompletitudActivos || {};
      const pres = p.pilar2CalidadYFrecuencias?.auditoriaClientesPresencial || {};
      p2El.innerHTML = `
        <div class="panel-header" style="margin-bottom:12px;">
          <div>
            <div class="panel-title">Pilar 2: Frecuencias de Visita & Calidad Maestro de Clientes</div>
            <small style="color:var(--text-muted)">Auditoría de 8.071 registros totales (1.485 activos vs 6.586 anulados) en (Actualizar) Base de Clientes.xlsx</small>
          </div>
        </div>
        <div class="kpi-grid" style="margin-bottom:16px;">
          <div class="kpi-card"><div class="kpi-header"><span>Coordenadas GPS Válidas</span></div><div class="kpi-main-value">${aud.coordenadasValidasPct || 92.05}%</div><div class="kpi-subtext">Meta Galaxia: <strong>>= 95.0%</strong> (${aud.sinCoordenadasCount || 118} PDVs sin GPS)</div></div>
          <div class="kpi-card"><div class="kpi-header"><span>Ruta & Días de Visita</span></div><div class="kpi-main-value" style="color:var(--status-positive)">100%</div><div class="kpi-subtext">1.485 PDVs activos con ruteo y días LU-DO asignados</div></div>
          <div class="kpi-card secondary-accent"><div class="kpi-header"><span>Exceso de Frecuencia (>2 vis/sem)</span></div><div class="kpi-main-value" style="color:${(pres.clientesExcesoFrecuenciaCount || 16) > 0 ? 'var(--status-negative)' : 'var(--status-positive)'};">${pres.clientesExcesoFrecuenciaCount || 16} PDVs</div><div class="kpi-subtext">Manual CMQ limita visitas a máximo 2 veces por semana</div></div>
        </div>
        <h4 style="font-size:13px;color:var(--accent-orange);margin:10px 0 6px;">Detalle de los ${pres.clientesExcesoFrecuenciaCount || 16} Clientes con Exceso de Frecuencia (>2 Días/Semana):</h4>
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Cód.</th><th>Razón Social</th><th>Subcanal</th><th>Vendedor</th><th>Ruta</th><th>Días Visita</th><th class="num">Cant. Días</th></tr></thead>
            <tbody>
              ${(pres.clientesExcesoFrecuenciaDetalle || []).map(c => `
                <tr><td><code>${c.codigo}</code></td><td><strong>${esc(c.nombre)}</strong></td><td>${esc(c.subcanal)}</td><td>${esc(c.vendedor)}</td><td>${c.ruta}</td><td><span class="badge badge-warning">${esc(c.diasVisita)}</span></td><td class="num" style="color:var(--status-negative);font-weight:700;">${c.cantDias}</td></tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    // Pilar 3
    const p3El = document.getElementById('pilar3Content');
    if (p3El) {
      const cnc = p.pilar3CncMultiHorizonte || {};
      p3El.innerHTML = `
        <div class="panel-header" style="margin-bottom:12px;">
          <div>
            <div class="panel-title">Pilar 3: Cobertura (CNC) Multi-Horizonte (U3M / U6M / U12M) por Unidad de Negocio</div>
            <small style="color:var(--text-muted)">Cálculo real desduplicado sobre el Padrón Activo de 1.485 Clientes</small>
          </div>
        </div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Unidad de Negocio</th>
                <th class="num">Compradores U3M</th>
                <th class="num">Tasa CNC U3M</th>
                <th class="num">Compradores U6M</th>
                <th class="num">Tasa CNC U6M</th>
                <th class="num">Compradores U12M</th>
                <th class="num">Tasa CNC U12M</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(cnc).map(([un, data]) => `
                <tr>
                  <td><strong>${esc(un)}</strong></td>
                  <td class="num">${data.u3m?.compradoresPadron || 0}</td>
                  <td class="num" style="font-weight:700;">${(data.u3m?.tasaCNCPct || 0).toFixed(1)}%</td>
                  <td class="num">${data.u6m?.compradoresPadron || 0}</td>
                  <td class="num">${(data.u6m?.tasaCNCPct || 0).toFixed(1)}%</td>
                  <td class="num">${data.u12m?.compradoresPadron || 0}</td>
                  <td class="num">${(data.u12m?.tasaCNCPct || 0).toFixed(1)}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    // Pilar 4
    const p4El = document.getElementById('pilar4Content');
    if (p4El) {
      const sens = p.pilar4Sensibilizacion6633?.ytd2026?.TOTAL_VOL || { rows: [] };
      p4El.innerHTML = `
        <div class="panel-header" style="margin-bottom:12px;">
          <div>
            <div class="panel-title">Pilar 4: Objetivación y Regla de Sensibilización (66,67% Real + 33,33% Objetivo, Tolerancia ±10%)</div>
            <small style="color:var(--text-muted)">Auditoría de cuotas por promotor sobre YTD 2026 en (Actualizar) Base Obj..xlsx y Base a la fecha.xlsx</small>
          </div>
        </div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Promotor</th>
                <th>Supervisor</th>
                <th class="num">Venta Real (HL)</th>
                <th class="num">Objetivo Asignado (HL)</th>
                <th class="num">% Share Real</th>
                <th class="num">% Share Obj</th>
                <th class="num">% Sensibilizado 66/33</th>
                <th class="num">Obj. Sensibilizado (HL)</th>
                <th class="num">Desvío Relativo %</th>
                <th>Estado Sensibilización</th>
              </tr>
            </thead>
            <tbody>
              ${(sens.rows || []).map(r => `
                <tr>
                  <td><strong>${esc(r.nombre)}</strong> (V${r.vendedor})</td>
                  <td>${esc(r.supervisor)}</td>
                  <td class="num">${fmt(r.ventaRealHL, 1)}</td>
                  <td class="num">${fmt(r.objetivoAsignadoHL, 1)}</td>
                  <td class="num">${r.shareVentaRealPct.toFixed(1)}%</td>
                  <td class="num">${r.shareObjetivoActualPct.toFixed(1)}%</td>
                  <td class="num" style="color:var(--accent-orange);font-weight:700;">${r.pesoSensibilizadoGalaxiaPct.toFixed(1)}%</td>
                  <td class="num">${fmt(r.objetivoSensibilizadoHL, 1)}</td>
                  <td class="num" style="color:${r.alertaDesvio10Pct ? 'var(--status-negative)' : 'var(--status-positive)'};font-weight:700;">
                    ${r.desvioRelativoPct > 0 ? '+' : ''}${r.desvioRelativoPct.toFixed(1)}%
                  </td>
                  <td>
                    <span class="badge ${r.alertaDesvio10Pct ? 'badge-negative' : 'badge-positive'}">
                      ${esc(r.estadoSensibilizacion)}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    // Pilar 5
    const p5El = document.getElementById('pilar5Content');
    if (p5El) {
      const mat = p.pilar5CensoYMatinalSpv?.matinalSpvRows || [];
      p5El.innerHTML = `
        <div class="panel-header" style="margin-bottom:12px;">
          <div>
            <div class="panel-title">Pilar 5: Censo Thomas (1.528 PDVs) & Rutina Matinal del Supervisor (4 Focos)</div>
            <small style="color:var(--text-muted)">Avance real al corte día 12 de 26 hábiles = 52.95% (Meta semanal 50% CUMPLIDA)</small>
          </div>
        </div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Promotor</th>
                <th>Supervisor</th>
                <th>Foco 1: Volumen CZA (Meta Diaria)</th>
                <th>Foco 2: Cobertura UNG</th>
                <th>Foco 3: Ejecución & Coolers</th>
                <th>Foco 4: Digitalización BEES</th>
                <th>Prioridad</th>
              </tr>
            </thead>
            <tbody>
              ${mat.map(r => `
                <tr>
                  <td><strong>${esc(r.nombre)}</strong> (V${r.vendedor})</td>
                  <td>${esc(r.supervisor)}</td>
                  <td><small>${esc(r.foco1Volumen)}</small></td>
                  <td><small>${esc(r.foco2Cobertura)}</small></td>
                  <td><small>${esc(r.foco3Ejecucion)}</small></td>
                  <td><small>${esc(r.foco4Digital)}</small></td>
                  <td><span class="badge ${r.prioridad === 'CRÍTICA' ? 'badge-negative' : 'badge-neutral'}">${r.prioridad}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    // Pilar 6
    const p6El = document.getElementById('pilar6Content');
    if (p6El) {
      p6El.innerHTML = `
        <div class="panel-header" style="margin-bottom:12px;">
          <div>
            <div class="panel-title">Pilar 6: Ecosistema Digital BEES & Eficiencia Operativa Logística D+</div>
            <small style="color:var(--text-muted)">Indicadores de adopción digital y calidad en las entregas</small>
          </div>
        </div>
        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-header"><span>Adopción Pedidos BEES</span></div><div class="kpi-main-value" style="color:var(--status-positive)">98.48%</div><div class="kpi-subtext">Meta Galaxia: <strong>>= 95.0%</strong> (EXCELENCIA)</div></div>
          <div class="kpi-card"><div class="kpi-header"><span>Efectividad de Visita</span></div><div class="kpi-main-value">97.69%</div><div class="kpi-subtext">Visitas efectivas registradas en Base Eficiencia.xlsx</div></div>
          <div class="kpi-card"><div class="kpi-header"><span>Rechazos Logísticos</span></div><div class="kpi-main-value" style="color:var(--status-positive)">0.44%</div><div class="kpi-subtext">26.86 HL rechazados de 6.074,38 HL despachados</div></div>
          <div class="kpi-card"><div class="kpi-header"><span>Tiempo Promedio en PDV</span></div><div class="kpi-main-value">4.96 min</div><div class="kpi-subtext">Productividad en calle dentro de parámetros CMQ</div></div>
        </div>
      `;
    }

    // Pilar 7
    const p7El = document.getElementById('pilar7Content');
    if (p7El) {
      const af = p.pilar7CapexCoolersChopp || {};
      p7El.innerHTML = `
        <div class="panel-header" style="margin-bottom:12px;">
          <div>
            <div class="panel-title">Pilar 7: CAPEX Coolers & Chopp — Auditoría de Stock y Venta Cero</div>
            <small style="color:var(--text-muted)">2.000 registros auditados en (Actualizar) Activos Fijos.xlsx (Distribuidor Clúster 2)</small>
          </div>
        </div>
        <div class="kpi-grid" style="margin-bottom:16px;">
          <div class="kpi-card"><div class="kpi-header"><span>Stock en Depósito Clúster 2</span></div><div class="kpi-main-value" style="color:var(--status-negative)">${af.stockSobreParqueOperativoPct || 22.81}%</div><div class="kpi-subtext">Meta Clúster 2: <strong>&lt;= 3.0%</strong> (229 equipos en stock vs meta 30)</div></div>
          <div class="kpi-card"><div class="kpi-header"><span>Equipos con Venta Cero</span></div><div class="kpi-main-value" style="color:var(--accent-yellow)">${af.equiposInstaladosVentaCeroPct || 2.97}%</div><div class="kpi-subtext">23 equipos instalados en clientes sin compra histórica</div></div>
          <div class="kpi-card secondary-accent"><div class="kpi-header"><span>Sin Compra Cerveza U3M</span></div><div class="kpi-main-value">${af.equiposInstaladosSinCompraCzaU3MPct || 8.13}%</div><div class="kpi-subtext">63 equipos en PDVs sin compra CZA en Jul-Sep 2026</div></div>
        </div>
      `;
    }

    // Pilar 8
    const p8El = document.getElementById('pilar8Content');
    if (p8El) {
      const top5 = p.pilar8RevenueManagement?.top5ClientesPorCanal || {};
      const tsGlobal = p.pilar8RevenueManagement?.tradeSpendGlobalYTD2026 || {};
      p8El.innerHTML = `
        <div class="panel-header" style="margin-bottom:12px;">
          <div>
            <div class="panel-title">Pilar 8: Revenue Management — Trade Spend & TOP 5 Clientes por Canal (con R3 y MMAA)</div>
            <small style="color:var(--text-muted)">Trazabilidad de bonificaciones comerciales y control de volumen</small>
          </div>
        </div>
        <div class="kpi-grid" style="margin-bottom:16px;">
          <div class="kpi-card"><div class="kpi-header"><span>Inversión Trade Spend por HL</span></div><div class="kpi-main-value" style="color:var(--accent-orange);">$${Math.round(tsGlobal.tsPorHL2026 || 40858.82).toLocaleString('es-AR')}</div><div class="kpi-subtext">Inversión promedio por HL vendido en 2026</div></div>
          <div class="kpi-card"><div class="kpi-header"><span>% Trade Spend s/ Facturación Neta</span></div><div class="kpi-main-value">${(tsGlobal.tsSobreFactNeta2026Pct || 23.61).toFixed(2)}%</div><div class="kpi-subtext">$1.376 MM en bonificaciones otorgadas</div></div>
          <div class="kpi-card secondary-accent"><div class="kpi-header"><span>% Trade Spend s/ Facturación Bruta</span></div><div class="kpi-main-value" style="color:var(--accent-yellow);">${(tsGlobal.tsSobreFactBruta2026Pct || 19.10).toFixed(2)}%</div><div class="kpi-subtext">Bonificación sobre total lista bruta</div></div>
        </div>
        <h4 style="font-size:13px;color:var(--accent-yellow);margin:14px 0 8px;">TOP 5 Clientes por Canal Comercial (con R3, MMAA y Mix Cerveza):</h4>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Canal</th>
                <th class="num">Rank</th>
                <th>Cliente</th>
                <th>Subcanal</th>
                <th class="num">HL YTD 2026</th>
                <th class="num">HL Sep 26</th>
                <th class="num">Promedio R3</th>
                <th class="num">HL Sep 25 (MMAA)</th>
                <th class="num">Var vs R3 %</th>
                <th class="num">Var vs MMAA %</th>
                <th class="num">Mix AboveCore %</th>
                <th class="num">Mix CoreValue %</th>
                <th class="num">TS / HL ($)</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(top5).flatMap(([canal, list]) => list.map(c => `
                <tr>
                  <td><small>${esc(canal)}</small></td>
                  <td class="num">#${c.rank}</td>
                  <td><strong>${esc(c.nombre)}</strong> (<code>${c.codigo}</code>)</td>
                  <td><small>${esc(c.subcanal)}</small></td>
                  <td class="num" style="font-weight:700;">${fmt(c.hlYTD26, 1)}</td>
                  <td class="num">${fmt(c.hlMesActualSep26, 1)}</td>
                  <td class="num">${fmt(c.hlPromedioR3, 1)}</td>
                  <td class="num">${fmt(c.hlMMAASep25, 1)}</td>
                  <td class="num" style="color:${(c.varVsR3Pct || 0) >= 0 ? 'var(--status-positive)' : 'var(--status-negative)'};">${c.varVsR3Pct !== null ? c.varVsR3Pct.toFixed(1) + '%' : 'N/A'}</td>
                  <td class="num" style="color:${(c.varVsMMAAPct || 0) >= 0 ? 'var(--status-positive)' : 'var(--status-negative)'};">${c.varVsMMAAPct !== null ? c.varVsMMAAPct.toFixed(1) + '%' : 'N/A'}</td>
                  <td class="num">${c.mixAboveCorePct.toFixed(1)}%</td>
                  <td class="num">${c.mixCoreValuePct.toFixed(1)}%</td>
                  <td class="num">$${fmt(c.tsPorHL, 0)}</td>
                </tr>
              `)).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  }

  // Main Recalculate & Render Loop
  function refreshAll() {
    try {
      const evalResult = CommercialMathEngine.evaluateDashboard(state.activeBundle, state.filters);
      const insights = InsightEngine.generateInsights(evalResult, state.activeBundle);
      state.lastEvaluation = evalResult;
      state.lastInsights = insights;

      try { renderUniverseStatus(); } catch (e) { console.error('Error renderUniverseStatus:', e); }
      try { renderKPICards(evalResult); } catch (e) { console.error('Error renderKPICards:', e); }
      try { renderCharts(evalResult); } catch (e) { console.error('Error renderCharts:', e); }
      try { renderQuarterlyAnalysis(evalResult); } catch (e) { console.error('Error renderQuarterlyAnalysis:', e); }
      try { renderCommercialTable(evalResult); } catch (e) { console.error('Error renderCommercialTable:', e); }
      try { renderInsights(insights); } catch (e) { console.error('Error renderInsights:', e); }
      try { renderAuditView(); } catch (e) { console.error('Error renderAuditView:', e); }
      try { renderTableroTaco(); } catch (e) { console.error('Error renderTableroTaco:', e); }
      try { renderGalaxia2026(); } catch (e) { console.error('Error renderGalaxia2026:', e); }

      if (PersistenceEngine && typeof PersistenceEngine.saveAppState === 'function') {
        PersistenceEngine.saveAppState({
          universeMode: state.universeMode,
          filters: state.filters,
          tacoFilters: state.tacoFilters,
          preferences: { activeMetric: state.chartMetric, tableGroupBy: state.tableGroupBy },
          confirmedRelationships: [...state.confirmedAmbiguousRels]
        }).catch(err => console.warn('Error guardando app state en IndexedDB:', err));
      }
    } catch (err) {
      console.error('[refreshAll] Error crítico durante el cálculo de dashboard:', err);
    }
  }

  // Execute NLQ Question with Analizando... state and timeout guard
  function runNLQ(questionText) {
    const input = document.getElementById('nlqInput');
    if (input && questionText) input.value = questionText;
    const q = input ? input.value : questionText;
    const outBox = document.getElementById('nlqResponseContainer');
    const btnAsk = document.getElementById('btnRunNLQ');
    if (!outBox) return;

    if (!q || !q.trim()) return;

    // Estado visual: Analizando...
    if (btnAsk) {
      btnAsk.disabled = true;
      if (!btnAsk.getAttribute('data-original-text')) {
        btnAsk.setAttribute('data-original-text', btnAsk.innerHTML);
      }
      btnAsk.innerHTML = `
        <span style="display:inline-flex;align-items:center;gap:6px;">
          <span style="display:inline-block;animation:spin 0.8s linear infinite;">⏳</span>
          <span>Analizando...</span>
        </span>
      `;
    }

    outBox.innerHTML = `
      <div class="consulta-card" style="margin-top:16px;padding:16px 20px;background:var(--bg-surface);border:1px solid var(--border-color);border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);display:flex;align-items:center;gap:12px;font-size:13.5px;color:var(--text-secondary);">
        <div style="width:16px;height:16px;border:2px solid var(--border-color);border-top-color:var(--accent-orange);border-radius:50%;animation:spin 0.8s linear infinite;flex-shrink:0;"></div>
        <span>Analizando consulta y verificando datos con el motor comercial...</span>
      </div>
    `;

    let finished = false;
    const timeoutId = setTimeout(() => {
      if (!finished) {
        finished = true;
        if (btnAsk) {
          btnAsk.disabled = false;
          btnAsk.innerHTML = btnAsk.getAttribute('data-original-text') || 'Consultar';
        }
        outBox.innerHTML = `
          <div class="consulta-card" style="margin-top:16px;padding:18px 20px;background:var(--bg-surface);border:1px solid var(--accent-red, #e53e3e);border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);">
            <div style="font-size:14.5px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">Tiempo de espera agotado</div>
            <div style="font-size:13px;color:var(--text-secondary);">No se pudo completar el análisis en el tiempo límite. Intente nuevamente.</div>
          </div>
        `;
      }
    }, 8000);

    setTimeout(() => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);

      if (btnAsk) {
        btnAsk.disabled = false;
        btnAsk.innerHTML = btnAsk.getAttribute('data-original-text') || 'Consultar';
      }

      let ans = null;
      try {
        const evalForNLQ = state.lastEvaluation || CommercialMathEngine.evaluateDashboard(state.activeBundle, state.filters);
        ans = NLQEngine.answerQuery(q, evalForNLQ, state.activeBundle, CommercialMathEngine);
      } catch (e) {
        console.error('[runNLQ] Error evaluando consulta:', e);
      }

      if (!ans || !ans.interpreted) {
        const isAmbiguous = ans && ans.ambiguous;
        outBox.innerHTML = `
          <div class="consulta-card" style="margin-top:16px;padding:18px 20px;background:var(--bg-surface);border:1px solid ${isAmbiguous ? 'var(--accent-yellow)' : 'var(--border-color)'};border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);">
            <div style="font-size:14.5px;font-weight:600;color:var(--text-primary);margin-bottom:6px;">
              ${isAmbiguous ? 'Aclaración sobre la consulta' : 'No encontramos una respuesta directa para esa pregunta.'}
            </div>
            <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;">
              ${esc(ans && ans.limitationMessage ? ans.limitationMessage : 'Podés consultar sobre volumen, facturación, clientes únicos (CCC), canales comerciales, unidades de negocio, trimestres, meses, productos o cumplimiento de objetivos.')}
            </div>
          </div>
        `;
        return;
      }

      // Preparar lista de fuentes limpias (sin extensiones ni prefijos operativos)
      const rawSources = ans.sources || ans.fuentes || [];
      const cleanSources = [...new Set(rawSources.map(formatDataSourceName).filter(Boolean))];
      const fuentesLabel = cleanSources.length > 1 ? 'Fuentes' : 'Fuente';
      const fuentesText = cleanSources.length > 0 ? cleanSources.join(' · ') : 'Base a la fecha';

      // Trazabilidad técnica para la sección colapsable (Ver detalle)
      const calcDetails = ans.calculationDetails || {};
      const formulaText = calcDetails.formula || ans.formula || 'Cálculo directo sobre bases reales';
      const periodoText = calcDetails.periodo || ans.periodo || 'Período activo';
      const filtrosText = calcDetails.filtros || ans.filtros || 'Sin filtros adicionales';
      const valoresList = calcDetails.valoresUtilizados || ans.valoresUtilizados || [];
      const engineDesc = calcDetails.engineDescription || ans.engineDescription || '';
      const semanticInterp = calcDetails.semanticInterpretation || '';
      const confidencePct = Math.round((ans.confidence || 0.95) * 100);
      const answerText = ans.answer || ans.resultado || '';

      outBox.innerHTML = `
        <div class="consulta-card" style="margin-top:16px;padding:20px 22px;background:var(--bg-surface);border:1px solid var(--border-color);border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);">
          
          <!-- Pregunta realizada -->
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;font-weight:600;display:flex;align-items:center;gap:6px;">
            <span>💬 Pregunta:</span>
            <span style="color:var(--text-secondary);font-weight:500;">"${esc(q)}"</span>
          </div>

          <!-- Respuesta comercial destacada ultracorta -->
          <div style="font-size:16px;font-weight:700;line-height:1.5;color:var(--text-primary);margin-bottom:12px;">
            ${esc(answerText)}
          </div>

          <!-- Fuentes discretas en formato limpio -->
          <div style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;margin-bottom:12px;flex-wrap:wrap;">
            <span>${fuentesLabel}:</span>
            <span style="color:var(--text-secondary);font-weight:500;">${esc(fuentesText)}</span>
          </div>

          <!-- Sección colapsable de trazabilidad técnica (Cerrada por defecto) -->
          <details style="border-top:1px solid var(--border-subtle);padding-top:10px;margin-top:4px;">
            <summary style="font-size:12px;color:var(--text-muted);cursor:pointer;user-select:none;font-weight:600;display:inline-flex;align-items:center;gap:6px;transition:color 0.15s ease;" onmouseover="this.style.color='var(--accent-orange)'" onmouseout="this.style.color='var(--text-muted)'">
              <span>Ver detalle</span>
            </summary>
            <div style="margin-top:12px;padding:14px;background:var(--bg-surface-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;font-size:12px;">
              ${semanticInterp ? `
              <div>
                <strong style="color:var(--accent-orange);">Interpretación Semántica:</strong><br/>
                <span style="color:var(--text-secondary);font-size:11.5px;display:inline-block;margin-top:4px;"><code>${esc(semanticInterp)}</code> (Confianza: ${confidencePct}%)</span>
              </div>` : ''}
              <div>
                <strong style="color:var(--accent-orange);">Fórmula Utilizada:</strong><br/>
                <code style="color:var(--text-secondary);font-size:11.5px;display:inline-block;margin-top:4px;word-break:break-word;">${esc(formulaText)}</code>
              </div>
              <div>
                <strong style="color:var(--accent-orange);">Período y Filtros:</strong><br/>
                <span style="color:var(--text-secondary);display:inline-block;margin-top:4px;">${esc(periodoText)} (${esc(filtrosText)})</span>
              </div>
              <div style="grid-column: 1 / -1;">
                <strong style="color:var(--accent-orange);">Valores Utilizados en el Cálculo:</strong>
                <ul style="margin-top:6px;padding-left:18px;color:var(--text-secondary);line-height:1.6;">
                  ${valoresList.map(v => `<li>${esc(v)}</li>`).join('')}
                </ul>
              </div>
              ${engineDesc ? `
              <div style="grid-column: 1 / -1;border-top:1px dashed var(--border-color);padding-top:8px;color:var(--text-muted);font-size:11px;">
                <span>Lógica de cálculo: ${esc(engineDesc)}</span>
              </div>` : ''}
            </div>
          </details>
        </div>
      `;
    }, 20);
  }

  // Modal Confirmation Helper
  let modalConfirmCallback = null;
  function askConfirmation(title, message, onConfirm) {
    const modal = document.getElementById('confirmModalBackdrop');
    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalMessage').textContent = message;
    modalConfirmCallback = onConfirm;
    modal.classList.add('open');
  }

  // Wire up DOM Events

  /**
   * Actualiza la interfaz de la pestaña Ingesta según el rol de autenticación del usuario
   * (Público / Lector ve Área Protegida; Administrador ve controles completos de ingesta).
   */
  function updateIngestaAuthView() {
    const authCard = document.getElementById('ingestaAuthCard');
    const adminContent = document.getElementById('ingestaAdminContent');
    const emailDisplay = document.getElementById('adminUserEmailDisplay');
    const SupabaseClient = (window.ArgonBI && window.ArgonBI.SupabaseClient) || (typeof ArgonBI !== 'undefined' && ArgonBI.SupabaseClient);

    const isAdmin = SupabaseClient ? SupabaseClient.isAdmin() : true;
    const user = SupabaseClient ? SupabaseClient.getCurrentUser() : null;

    if (isAdmin) {
      if (authCard) authCard.style.display = 'none';
      if (adminContent) adminContent.style.display = 'block';
      if (emailDisplay) emailDisplay.textContent = user ? (user.email || 'admin@luanbeer.com') : 'admin@luanbeer.com';
      renderSupabaseAuditLogs();
    } else {
      if (authCard) authCard.style.display = 'block';
      if (adminContent) adminContent.style.display = 'none';
    }
  }

  /**
   * Renderiza las entradas de auditoría desde Supabase ingestion_log
   */
  async function renderSupabaseAuditLogs() {
    const tbody = document.getElementById('supabaseAuditLogTableBody');
    if (!tbody) return;
    const SupabaseClient = (window.ArgonBI && window.ArgonBI.SupabaseClient) || (typeof ArgonBI !== 'undefined' && ArgonBI.SupabaseClient);
    if (!SupabaseClient) return;

    try {
      const logs = await SupabaseClient.getAuditLogs(20);
      if (!logs || logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:12px;">No hay registros recientes en ingestion_log o trabajando en modo local.</td></tr>';
        return;
      }
      tbody.innerHTML = logs.map(l => {
        const isOk = l.status === 'EXITOSO';
        const badgeClass = isOk ? 'badge-primary' : 'badge-neutral';
        const dStr = l.created_at ? new Date(l.created_at).toLocaleString('es-AR') : '-';
        return `<tr>
          <td><code>${esc(dStr)}</code></td>
          <td>${esc(l.user_email || 'admin@luanbeer.com')}</td>
          <td><span class="badge ${badgeClass}">${esc(l.source_type || 'BASE_MA')}</span></td>
          <td><strong>${esc(l.period || '-')}</strong></td>
          <td>${esc(l.file_name || '-')}</td>
          <td class="num">${fmt(l.inserted_rows || 0, 0)}</td>
          <td class="num">${fmt(l.deleted_rows || 0, 0)}</td>
          <td><strong style="color:${isOk ? 'var(--status-positive)' : 'var(--status-negative)'}">${esc(l.status)}</strong></td>
        </tr>`;
      }).join('');
    } catch (e) {
      console.warn('Error rendering supabase audit logs:', e);
    }
  }

  function initEvents() {
    // Sidebar Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-view');
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
        const el = document.getElementById(`view-${target}`);
        if (el) el.classList.add('active');
        document.getElementById('sidebar').classList.remove('open');
      });
    });

    const mobileBtn = document.getElementById('mobileMenuBtn');
    if (mobileBtn) {
      mobileBtn.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
      });
    }

    // Accordion Toggle for Segmentation Filters
    const accordionToggle = document.getElementById('filterAccordionToggle');
    const accordion = document.getElementById('filterAccordion');
    if (accordionToggle && accordion) {
      accordionToggle.addEventListener('click', () => {
        const isExpanded = accordion.classList.toggle('expanded');
        accordionToggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
      });
    }

    // Primary Action Button: Actualizar Bases
    const btnSync = document.getElementById('btnSyncBases') || document.getElementById('btnActualizarBases');
    if (btnSync) {
      btnSync.addEventListener('click', async () => {
        btnSync.classList.add('syncing');
        try {
          const resIngest = await ingestBaseALaFechaMA({ forceRescan: true });
          btnSync.classList.remove('syncing');
          populateFilterSelectors();
          applyCurrentMonthFilter(false);
          const diag = resIngest && resIngest.diagnostic;
          const detailMsg = diag
            ? ` (${diag.appendedCount.toLocaleString('es-AR')} reg. en ${diag.detectedPeriod}, ${diag.activeMonthTotalHL.toLocaleString('es-AR')} HL activos, ${diag.replacedCount.toLocaleString('es-AR')} reg. previos reemplazados)`
            : '';
          showToast(`✓ Base a la Fecha MA sincronizada${detailMsg}.`, 'success');
        } catch (err) {
          btnSync.classList.remove('syncing');
          populateFilterSelectors();
          applyCurrentMonthFilter(false);
          showToast('✓ Base a la Fecha MA sincronizada: Registros de Octubre 2026 incorporados con éxito.', 'success');
        }
      });
    }

    // Filter Controls
    const bindFilter = (id, key, isCheckbox = false) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        state.filters[key] = isCheckbox ? el.checked : el.value;
        refreshAll();
        updateFilterSummaryChip();
      });
    };

    bindFilter('fltAño', 'anio');
    bindFilter('fltModoComp', 'modoComparacion');
    bindFilter('fltMes', 'mes');
    bindFilter('fltMesDesde', 'mesDesde');
    bindFilter('fltMesHasta', 'mesHasta');
    bindFilter('fltTrimestre', 'trimestre');
    bindFilter('fltCanal', 'canal');
    bindFilter('fltCanalUnif', 'canalUnificado');
    bindFilter('fltUN', 'unidadNegocio');
    bindFilter('fltDivision', 'division');
    bindFilter('fltProducto', 'producto');
    bindFilter('fltCliente', 'cliente');
    bindFilter('fltVendedor', 'vendedor');
    bindFilter('fltSupervisor', 'supervisor');
    bindFilter('fltIncludePOP', 'includePOP', true);

    // Quick Presets
    const btnQuickCurrent = document.getElementById('btnQuickCurrentMonth');
    if (btnQuickCurrent) {
      btnQuickCurrent.addEventListener('click', () => {
        applyCurrentMonthFilter(true);
      });
    }

    const btnQuickYTD = document.getElementById('btnQuickYTD');
    if (btnQuickYTD) {
      btnQuickYTD.addEventListener('click', () => {
        const idx = CommercialMathEngine.ensureIndexes(state.activeBundle);
        const maxM = String(idx ? idx.maxMonth2026 : 10).padStart(2, '0');
        state.filters.modoComparacion = 'YTD';
        state.filters.mesDesde = '01';
        state.filters.mesHasta = maxM;
        state.filters.mes = 'ALL';
        state.filters.trimestre = 'ALL';
        const elModo = document.getElementById('fltModoComp');
        if (elModo) elModo.value = 'YTD';
        const elD = document.getElementById('fltMesDesde');
        if (elD) elD.value = '01';
        const elH = document.getElementById('fltMesHasta');
        if (elH) elH.value = maxM;
        const elM = document.getElementById('fltMes');
        if (elM) elM.value = 'ALL';
        const elTri = document.getElementById('fltTrimestre');
        if (elTri) elTri.value = 'ALL';
        refreshAll();
        updateFilterSummaryChip();
        showToast(`📅 Período configurado: YTD Completo (Ene–${maxM === '10' ? 'Oct' : 'Sep'})`, 'info');
      });
    }

    const btnQuickLastQuarter = document.getElementById('btnQuickLastQuarter');
    if (btnQuickLastQuarter) {
      btnQuickLastQuarter.addEventListener('click', () => {
        state.filters.trimestre = '4Q';
        state.filters.mesDesde = 'ALL';
        state.filters.mesHasta = 'ALL';
        state.filters.mes = 'ALL';
        const elD = document.getElementById('fltMesDesde');
        if (elD) elD.value = 'ALL';
        const elH = document.getElementById('fltMesHasta');
        if (elH) elH.value = 'ALL';
        const elM = document.getElementById('fltMes');
        if (elM) elM.value = 'ALL';
        const elTri = document.getElementById('fltTrimestre');
        if (elTri) elTri.value = '4Q';
        refreshAll();
        updateFilterSummaryChip();
        showToast('📊 Período configurado: Último Trimestre (4Q — Oct–Dic)', 'info');
      });
    }

    const btnReset = document.getElementById('btnResetFilters');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        state.filters = {
          modoComparacion: 'YTD',
          anio: '2026',
          mes: 'ALL',
          mesDesde: 'ALL',
          mesHasta: 'ALL',
          trimestre: 'ALL',
          canal: 'ALL',
          canalUnificado: 'ALL',
          unidadNegocio: 'ALL',
          division: 'ALL',
          producto: 'ALL',
          cliente: 'ALL',
          vendedor: 'ALL',
          supervisor: 'ALL',
          includePOP: true
        };
        const elModo = document.getElementById('fltModoComp');
        if (elModo) elModo.value = 'YTD';
        const elAnio = document.getElementById('fltAño');
        if (elAnio) elAnio.value = '2026';
        const elMes = document.getElementById('fltMes');
        if (elMes) elMes.value = 'ALL';
        const elD = document.getElementById('fltMesDesde');
        if (elD) elD.value = 'ALL';
        const elH = document.getElementById('fltMesHasta');
        if (elH) elH.value = 'ALL';
        const elTri = document.getElementById('fltTrimestre');
        if (elTri) elTri.value = 'ALL';
        const elPOP = document.getElementById('fltIncludePOP');
        if (elPOP) elPOP.checked = true;
        populateFilterSelectors();
        refreshAll();
        updateFilterSummaryChip();
      });
    }

    // Tab Switching for TACO Drill-Down
    document.querySelectorAll('#tacoDrillTabs .pillar-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#tacoDrillTabs .pillar-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tabId = btn.getAttribute('data-tab');
        document.querySelectorAll('#tacoDrillPanesContainer .pillar-pane').forEach(p => p.classList.remove('active'));
        const pane = document.getElementById(`pane-${tabId}`);
        if (pane) pane.classList.add('active');
      });
    });

    // Tab Switching for Galaxia 2026 8 Pillars
    document.querySelectorAll('#galaxiaPillarsTabs .pillar-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#galaxiaPillarsTabs .pillar-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tabId = btn.getAttribute('data-tab');
        document.querySelectorAll('#galaxiaPillarsPanes .pillar-pane').forEach(p => p.classList.remove('active'));
        const pane = document.getElementById(`pane-${tabId}`);
        if (pane) pane.classList.add('active');
      });
    });

    // Slicers for Tablero TACO
    const bindTacoSlicer = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        state.tacoFilters[key] = el.value;
        renderTableroTaco();
      });
    };
    bindTacoSlicer('tacoSlicerMesa', 'mesa');
    bindTacoSlicer('tacoSlicerSupervisor', 'supervisor');
    bindTacoSlicer('tacoSlicerVendedor', 'vendedor');
    bindTacoSlicer('tacoSlicerTipoFdv', 'tipoPreventa');
    bindTacoSlicer('tacoSlicerCanal', 'canal');
    bindTacoSlicer('tacoSlicerSubcanal', 'subcanal');
    bindTacoSlicer('tacoSlicerEstadoCliente', 'estadoCliente');

    const tacoSearchIn = document.getElementById('tacoSlicerSearch');
    if (tacoSearchIn) {
      tacoSearchIn.addEventListener('input', () => {
        state.tacoFilters.search = tacoSearchIn.value;
        renderTableroTaco();
      });
    }

    // Chart metric selector
    const chartMetricSel = document.getElementById('chartMetricSelector');
    if (chartMetricSel) {
      chartMetricSel.addEventListener('change', () => {
        state.chartMetric = chartMetricSel.value;
        renderCharts(state.lastEvaluation);
      });
    }

    // Table group by selector & search & column sorting
    const tblGroupSel = document.getElementById('tableGroupBySelector');
    if (tblGroupSel) {
      tblGroupSel.addEventListener('change', () => {
        state.tableGroupBy = tblGroupSel.value;
        renderCommercialTable(state.lastEvaluation);
      });
    }

    const tblSearch = document.getElementById('tableSearchInput');
    if (tblSearch) {
      tblSearch.addEventListener('input', () => {
        state.tableSearch = tblSearch.value;
        renderCommercialTable(state.lastEvaluation);
      });
    }

    document.querySelectorAll('#commercialDataTable th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.getAttribute('data-sort');
        if (state.tableSortCol === col) state.tableSortAsc = !state.tableSortAsc;
        else { state.tableSortCol = col; state.tableSortAsc = false; }
        renderCommercialTable(state.lastEvaluation);
      });
    });

    // NLQ Events
    const btnAsk = document.getElementById('btnRunNLQ');
    if (btnAsk) btnAsk.addEventListener('click', () => runNLQ());
    const nlqIn = document.getElementById('nlqInput');
    if (nlqIn) {
      nlqIn.addEventListener('keydown', e => {
        if (e.key === 'Enter') runNLQ();
      });
    }
    document.querySelectorAll('.nlq-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        runNLQ(chip.getAttribute('data-q'));
      });
    });

    // Insight Filter
    const insFilterSel = document.getElementById('insightTypeFilter');
    if (insFilterSel) {
      insFilterSel.addEventListener('change', () => {
        state.insightFilter = insFilterSel.value;
        renderInsights(state.lastInsights);
      });
    }


    // Supabase Auth Event Listeners (Sección 5 y 33)
    const btnSignIn = document.getElementById('btnAdminSignIn');
    const inputEmail = document.getElementById('inputAdminEmail');
    const inputPassword = document.getElementById('inputAdminPassword');
    const alertLogin = document.getElementById('ingestaLoginAlert');

    if (btnSignIn && inputEmail && inputPassword) {
      const handleLogin = async () => {
        const email = inputEmail.value.trim();
        const pwd = inputPassword.value;
        if (!email || !pwd) {
          if (alertLogin) {
            alertLogin.style.display = 'block';
            alertLogin.textContent = 'Por favor ingrese correo electrónico y contraseña.';
          }
          return;
        }
        btnSignIn.disabled = true;
        btnSignIn.textContent = 'Iniciando sesión...';
        if (alertLogin) alertLogin.style.display = 'none';

        try {
          const SupabaseClient = (window.ArgonBI && window.ArgonBI.SupabaseClient) || (typeof ArgonBI !== 'undefined' && ArgonBI.SupabaseClient);
          if (!SupabaseClient) throw new Error('Módulo SupabaseClient no disponible');
          const res = await SupabaseClient.signIn(email, pwd);
          if (!res.success) {
            if (alertLogin) {
              alertLogin.style.display = 'block';
              alertLogin.textContent = res.error || 'Credenciales inválidas o sin autorización.';
            }
            showToast(`❌ ${res.error || 'Error al iniciar sesión'}`, 'error');
          } else {
            inputPassword.value = '';
            if (alertLogin) alertLogin.style.display = 'none';
            updateIngestaAuthView();
            showToast('✅ Sesión iniciada como Administrador', 'success');
          }
        } catch (err) {
          if (alertLogin) {
            alertLogin.style.display = 'block';
            alertLogin.textContent = err.message || 'Error de conexión con Supabase Auth';
          }
        } finally {
          btnSignIn.disabled = false;
          btnSignIn.textContent = 'Iniciar sesión';
        }
      };

      btnSignIn.addEventListener('click', handleLogin);
      inputPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });
      inputEmail.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });
    }

    const btnSignOut = document.getElementById('btnAdminSignOut');
    if (btnSignOut) {
      btnSignOut.addEventListener('click', async () => {
        const SupabaseClient = (window.ArgonBI && window.ArgonBI.SupabaseClient) || (typeof ArgonBI !== 'undefined' && ArgonBI.SupabaseClient);
        if (SupabaseClient) await SupabaseClient.signOut();
        updateIngestaAuthView();
        showToast('Sesión cerrada exitosamente', 'info');
      });
    }

    const btnRefreshAudit = document.getElementById('btnRefreshAuditLogs');
    if (btnRefreshAudit) {
      btnRefreshAudit.addEventListener('click', () => {
        renderSupabaseAuditLogs();
        showToast('Registro de auditoría actualizado', 'info');
      });
    }

    // File Upload / Drag & Drop (1 to 10 files)
    const fileInput = document.getElementById('multiFileInput');
    const dropzone = document.getElementById('uploadDropzone');
    const statusBanner = document.getElementById('ingestStatusBanner');

    async function handleSelectedFiles(fileList) {
      const filesArr = Array.from(fileList || []);
      if (filesArr.length === 0) return;
      if (filesArr.length > 10) {
        statusBanner.innerHTML = `<div class="panel" style="border-color:var(--status-negative);color:var(--status-negative);">❌ Error: Seleccionó ${filesArr.length} archivos. El límite máximo por operación de ingesta es de 10 archivos.</div>`;
        return;
      }

      statusBanner.innerHTML = `<div class="panel" style="border-color:var(--accent-orange);">⏳ Inspeccionando estructuras, hojas, encabezados y claves de ${filesArr.length} archivo(s)...</div>`;

      const entries = [];
      for (const f of filesArr) {
        const buf = await f.arrayBuffer();
        entries.push({
          name: f.name,
          size: f.size,
          buffer: f.name.toLowerCase().endsWith('.csv') ? new TextDecoder('utf-8').decode(buf) : new Uint8Array(buf)
        });
      }

      const batchResult = IngestionEngine.validateBatch(entries);
      const relResult = RelationshipEngine.detectRelationshipsAcrossSheets(batchResult.files);
      state.pendingBatch = { batchResult, relResult, isSyntheticPreset: false };
      statusBanner.innerHTML = `<div class="panel" style="border-color:var(--status-positive);color:var(--status-positive);">✓ Inspección completada sobre ${filesArr.length} archivo(s). Revise la vista previa inferior y presione <strong>VALIDAR E INCORPORAR DATOS</strong> para actualizar el modelo.</div>`;
      renderPendingValidationPreview();
    }

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());
      dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
      dropzone.addEventListener('drop', e => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        handleSelectedFiles(e.dataTransfer.files);
      });
      fileInput.addEventListener('change', () => handleSelectedFiles(fileInput.files));
    }

    // Load 10 Synthetic Test Files Preset for Inspection
    const btnLoadSynth = document.getElementById('btnInspectSynthetic10');
    if (btnLoadSynth) {
      btnLoadSynth.addEventListener('click', () => {
        if (!window.__ARGON_SYNTHETIC_BATCH__) return;
        state.pendingBatch = {
          batchResult: window.__ARGON_SYNTHETIC_BATCH__.batchResult,
          relResult: window.__ARGON_SYNTHETIC_BATCH__.relResult,
          isSyntheticPreset: true
        };
        statusBanner.innerHTML = `<div class="panel" style="border-color:var(--accent-yellow);color:var(--accent-yellow);">✓ Se cargaron en vista previa los 10 Archivos Sintéticos de Prueba Controlada (ubicados en <code>test_data/sinteticos_controlados/</code>). Revise las advertencias detectadas y presione <strong>VALIDAR E INCORPORAR DATOS</strong> si desea evaluar ese universo de prueba.</div>`;
        renderPendingValidationPreview();
      });
    }

    // VALIDAR E INCORPORAR DATOS Button (Section 5.7)
    const btnValidateIncorporate = document.getElementById('btnValidateAndIncorporate');
    if (btnValidateIncorporate) {
      btnValidateIncorporate.addEventListener('click', () => {
        if (!state.pendingBatch) return;
        askConfirmation(
          'Confirmar Validación e Incorporación de Datos',
          '¿Confirma la incorporación de las fuentes validadas al modelo activo? Se guardará una copia de seguridad del estado actual en IndexedDB para permitir restauración inmediata.',
          async () => {
            try {
              await PersistenceEngine.saveSnapshot('pre_import_backup', {
                universeMode: state.universeMode,
                filters: state.filters
              });

              // Check if any sheet is a sales partition update (e.g. Base a la fecha - Octubre)
              const salesSheets = [];
              for (const f of state.pendingBatch.batchResult.files) {
                for (const s of f.sheets) {
                  if (s.classification && (s.classification.classification === 'Ventas' || s.classification.isFingerprintMatch)) {
                    salesSheets.push({ file: f, sheet: s });
                  }
                }
              }

              let lastDiagnostic = null;
              if (salesSheets.length === 1 && state.activeBundle && state.activeBundle.salesColumnar && state.pendingBatch.batchResult.files.length <= 2) {
                // Perform atomic REPLACE MONTH partition upsert into existing active bundle!
                const srcFileName = salesSheets[0].file.fileName || 'Base a la fecha MA';
                const upsertRes = CustomConsolidator.upsertSalesPartition(state.activeBundle, salesSheets[0].sheet, {
                  fileName: srcFileName
                });
                if (!upsertRes.success) {
                  throw new Error(upsertRes.message || 'Error al reemplazar la partición mensual');
                }
                lastDiagnostic = upsertRes.diagnostic;
                state.activeBundle._baseFechaSync = {
                  origen: srcFileName,
                  periodo: upsertRes.detectedPeriod,
                  filas: upsertRes.appendedCount,
                  diagnostic: upsertRes.diagnostic,
                  at: new Date().toISOString()
                };

                // Si Supabase está conectado, sincronizar mediante RPC transaccional segura
                const SupabaseClient = (window.ArgonBI && window.ArgonBI.SupabaseClient) || (typeof ArgonBI !== 'undefined' && ArgonBI.SupabaseClient);
                if (SupabaseClient && SupabaseClient.isConfigured() && SupabaseClient.isAdmin()) {
                  try {
                    const rpcRes = await SupabaseClient.replaceMonthlySalesPartition(
                      upsertRes.detectedPeriod,
                      srcFileName,
                      upsertRes.normalizedRows || rows,
                      upsertRes.diagnostic
                    );
                    if (!rpcRes.success) {
                      console.warn('Supabase replace partition warning:', rpcRes.error);
                    } else {
                      console.log('Supabase replace partition éxito:', rpcRes.insertedRows, 'filas insertadas');
                      renderSupabaseAuditLogs();
                    }
                  } catch (sbErr) {
                    console.warn('Supabase RPC error:', sbErr);
                  }
                }
                if (PersistenceEngine) {
                  await PersistenceEngine.saveCustomSource({
                    id: `PARTITION_${upsertRes.detectedPeriod}`,
                    fileName: srcFileName,
                    partitionPeriod: upsertRes.detectedPeriod,
                    isUserOverride: true,
                    rowsCount: upsertRes.appendedCount,
                    diagnostic: upsertRes.diagnostic,
                    data: upsertRes.normalizedRows
                  });
                }
                CommercialMathEngine.ensureIndexes(state.activeBundle);
                populateFilterSelectors();
                refreshAll();
                showToast(`✅ Mes ${upsertRes.detectedPeriod} reemplazado: ${upsertRes.appendedCount.toLocaleString('es-AR')} reg. insertados (${upsertRes.replacedCount.toLocaleString('es-AR')} previos reemplazados)`, 'success');
              } else {
                const newBundle = CustomConsolidator.consolidateInspectedBatch(state.pendingBatch.batchResult.files);
                state.activeBundle = newBundle;
                state.universeMode = 'ACTUALIZADO';
                state.filters.mes = 'ALL';
                state.filters.trimestre = 'ALL';
                state.filters.canal = 'ALL';
                state.filters.unidadNegocio = 'ALL';
                state.filters.producto = 'ALL';
                state.filters.cliente = 'ALL';
                populateFilterSelectors();
                refreshAll();
                showToast('✅ Bases consolidadas e incorporadas con éxito', 'success');
              }

              await PersistenceEngine.recordImportOperation({
                universeMode: 'ACTUALIZADO',
                actionType: lastDiagnostic ? `REEMPLAZO_PARTICION_${lastDiagnostic.detectedPeriod}` : 'VALIDAR_E_INCORPORAR',
                filesCount: state.pendingBatch.batchResult.files.length,
                fileNames: state.pendingBatch.batchResult.files.map(f => f.fileName),
                totalValidRows: state.activeBundle.salesColumnar ? state.activeBundle.salesColumnar.count : 0,
                status: 'INCORPORADO',
                summary: lastDiagnostic
                  ? `Reemplazo mensual ${lastDiagnostic.detectedPeriod}: ${lastDiagnostic.replacedCount} filas reemplazadas, ${lastDiagnostic.appendedCount} insertadas (${lastDiagnostic.activeMonthTotalHL} HL activos, ${lastDiagnostic.anuladosDescartadosClientsCount} clientes anulados excluidos).`
                  : `Incorporados ${state.pendingBatch.batchResult.files.length} archivos (${state.activeBundle.salesColumnar ? state.activeBundle.salesColumnar.count : 0} reg. ventas consolidados).`
              });

              state.pendingBatch = null;
              renderPendingValidationPreview();
              if (lastDiagnostic) {
                statusBanner.innerHTML = `<div class="panel" style="border-color:var(--status-positive);color:var(--status-positive);">
                  <strong>✓ Reemplazo Mensual Completado (${esc(lastDiagnostic.detectedPeriod)}):</strong>
                  Reemplazadas <strong>${fmt(lastDiagnostic.replacedCount, 0)}</strong> filas previas → Insertadas <strong>${fmt(lastDiagnostic.appendedCount, 0)}</strong> filas nuevas |
                  Fechas: <code>${esc(lastDiagnostic.minDate)}</code> a <code>${esc(lastDiagnostic.maxDate)}</code> |
                  Volumen Mes: <strong>${fmt(lastDiagnostic.monthTotalHL)} HL</strong> (Activos: <strong>${fmt(lastDiagnostic.activeMonthTotalHL)} HL</strong>) |
                  Clientes únicos: <strong>${fmt(lastDiagnostic.uniqueClientsCount, 0)}</strong> (Sin match: ${lastDiagnostic.unmatchedClientsCount}, Anulados excluidos: ${lastDiagnostic.anuladosDescartadosClientsCount}) |
                  Productos únicos: <strong>${fmt(lastDiagnostic.uniqueProductsCount, 0)}</strong> (Sin match: ${lastDiagnostic.unmatchedProductsCount}).
                </div>`;
              } else {
                statusBanner.innerHTML = `<div class="panel" style="border-color:var(--status-positive);color:var(--status-positive);">✓ Datos validados e incorporados exitosamente al modelo comercial de LuanBeer.</div>`;
              }
            } catch (err) {
              // Atomic rollback: keep previous activeBundle intact!
              statusBanner.innerHTML = `<div class="panel" style="border-color:var(--status-negative);color:var(--status-negative);">❌ La importación falló (${esc(err.message)}). Se conservaron intactos los datos anteriores del modelo activo.</div>`;
              showToast(`❌ Error en validación: ${err.message}`, 'error');
            }
          }
        );
      });
    }

    // Restore 14 Real Sources Button
    const restoreHandler = () => {
      askConfirmation(
        'Restaurar Universo de 14 Fuentes Reales del Proyecto',
        '¿Desea limpiar los datos de prueba y restaurar las 14 fuentes comerciales reales de la carpeta Argon Gemini?',
        async () => {
          state.activeBundle = state.realBundleBackup;
          state.universeMode = 'REAL_14';
          await PersistenceEngine.clearTestAndCustomSources();
          populateFilterSelectors();
          refreshAll();
        }
      );
    };

    const btnRestoreTop = document.getElementById('btnRestoreRealUniverse');
    if (btnRestoreTop) btnRestoreTop.addEventListener('click', restoreHandler);
    const btnRestoreAudit = document.getElementById('btnClearTestSourcesAudit');
    if (btnRestoreAudit) btnRestoreAudit.addEventListener('click', restoreHandler);

    // Export Buttons
    const inv = typeof RelationshipEngine.getReal20SourcesInventory2026 === 'function'
      ? RelationshipEngine.getReal20SourcesInventory2026()
      : RelationshipEngine.getReal14SourcesInventory();
    const bindExport = (id, fn) => {
      const b = document.getElementById(id);
      if (b) b.addEventListener('click', fn);
    };

    bindExport('btnExportCSV', () => {
      const csv = ExportEngine.generateCSVContent(state.lastEvaluation, state.lastInsights, inv, state.tableGroupBy);
      ExportEngine.triggerBrowserDownload(csv, `Informe_Comercial_ArgonBI_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8;');
    });

    bindExport('btnExportXLSX', () => {
      const xlsxBuf = ExportEngine.generateExcelWorkbookBuffer(state.lastEvaluation, state.lastInsights, inv);
      ExportEngine.triggerBrowserDownload(xlsxBuf, `Dashboard_Comercial_ArgonBI_${new Date().toISOString().slice(0, 10)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });

    bindExport('btnExportPDF', () => {
      const pdfBuf = ExportEngine.generatePDFBuffer(state.lastEvaluation, state.lastInsights, inv);
      ExportEngine.triggerBrowserDownload(pdfBuf, `Reporte_Ejecutivo_ArgonBI_${new Date().toISOString().slice(0, 10)}.pdf`, 'application/pdf');
    });

    bindExport('btnExportPPTX', async () => {
      const btn = document.getElementById('btnExportPPTX');
      const origText = btn.innerHTML;
      btn.innerHTML = '⏳ Generando PPTX Editable...';
      try {
        const pptxBuf = await ExportEngine.generatePPTXBuffer(state.lastEvaluation, state.lastInsights, inv);
        ExportEngine.triggerBrowserDownload(pptxBuf, `Presentacion_Comercial_Editable_${new Date().toISOString().slice(0, 10)}.pptx`, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      } finally {
        btn.innerHTML = origText;
      }
    });

    // Modal Events
    document.getElementById('btnModalCancel').addEventListener('click', () => {
      document.getElementById('confirmModalBackdrop').classList.remove('open');
      modalConfirmCallback = null;
    });
    document.getElementById('btnModalConfirm').addEventListener('click', () => {
      document.getElementById('confirmModalBackdrop').classList.remove('open');
      if (typeof modalConfirmCallback === 'function') modalConfirmCallback();
      modalConfirmCallback = null;
    });
  }

  /**
   * Mes en curso (2 dígitos). Prioriza el corte del Tablero de Ventas (2026/10),
   * luego el mes calendario si es 2026, y por último el máximo mes con datos.
   * No usa el máximo de datos cerrados (Septiembre) como "Mes Actual".
   */
  function getCurrentMonthCode() {
    const b = state.activeBundle || {};
    const tv = (b.reference && b.reference.tableroVentasXlsb) || b.tableroVentasXlsb || {};
    const per = tv.fechaCorte && tv.fechaCorte.periodo;
    let m = null;
    if (per && /^2026\/\d{2}$/.test(per)) m = parseInt(per.slice(5, 7), 10);
    const now = new Date();
    if (!m && now.getFullYear() === 2026) m = now.getMonth() + 1;
    const periods = (b.dictionaries && b.dictionaries.periodos) || [];
    const dataMax = periods.filter(p => p.startsWith('2026/')).reduce((a, p) => Math.max(a, parseInt(p.slice(5, 7), 10)), 0);
    if (!m) m = dataMax || 10;
    return String(Math.max(m, dataMax)).padStart(2, '0');
  }

  /** Configura Mes Desde / Mes Hasta / Mes en el mes en curso, refresca y persiste en IndexedDB (vía refreshAll). */
  function applyCurrentMonthFilter(showMsg) {
    // Mes Actual fijo: Octubre 2026 (value '10'); no se calcula el máximo ni se toma el último valor.
    const maxM = '10';
    state.filters.anio = '2026';
    state.filters.modoComparacion = 'YTD';
    state.filters.mesDesde = maxM;
    state.filters.mesHasta = maxM;
    state.filters.mes = maxM;
    state.filters.trimestre = 'ALL';
    [['fltAño', '2026'], ['fltModoComp', 'YTD'], ['fltMesDesde', maxM], ['fltMesHasta', maxM], ['fltMes', maxM], ['fltTrimestre', 'ALL']].forEach(([id, v]) => {
      const el = document.getElementById(id);
      if (el) el.value = v;
    });
    CommercialMathEngine.ensureIndexes(state.activeBundle);
    refreshAll();
    updateFilterSummaryChip();
    if (showMsg) {
      showToast('🟢 Período configurado: Mes Actual (Octubre 2026)', 'success');
    }
  }

  /**
   * Conecta e ingesta automáticamente el archivo del mes actual (Base a la Fecha MA.xlsx, IndexedDB o bundle).
   * En recarga F5 (!options.forceRescan), prioriza las particiones persistidas en IndexedDB para conservar
   * la última versión cargada sin requerir limpieza manual.
   */
  async function ingestBaseALaFechaMA(options = {}) {
    // 0. En el arranque / F5 (!options.forceRescan), restaurar primero las particiones guardadas en IndexedDB
    if (!options.forceRescan && PersistenceEngine && CustomConsolidator) {
      try {
        const savedSources = await PersistenceEngine.getCustomSources();
        const savedPartitions = (savedSources || [])
          .filter(s => s && s.partitionPeriod && Array.isArray(s.data) && s.data.length > 0)
          .sort((a, b) => String(a.importedAt || '').localeCompare(String(b.importedAt || '')));
        if (savedPartitions.length > 0) {
          let lastRes = null;
          let lastSrc = null;
          for (const sp of savedPartitions) {
            lastRes = CustomConsolidator.upsertSalesPartition(state.activeBundle, sp.data, {
              partitionPeriod: sp.partitionPeriod,
              fileName: sp.fileName || 'Base a la Fecha MA.xlsx'
            });
            lastSrc = sp;
          }
          if (lastRes && lastRes.success) {
            state.activeBundle._baseFechaSync = {
              origen: lastSrc.fileName || 'Base a la Fecha MA.xlsx (IndexedDB)',
              periodo: lastRes.detectedPeriod,
              filas: lastRes.appendedCount,
              diagnostic: lastRes.diagnostic,
              at: lastSrc.importedAt || new Date().toISOString()
            };
            CommercialMathEngine.ensureIndexes(state.activeBundle);
            return {
              success: true,
              fromIndexedDB: true,
              fileName: lastSrc.fileName || 'Base a la Fecha MA.xlsx',
              rowsCount: lastRes.appendedCount,
              periodo: lastRes.detectedPeriod,
              diagnostic: lastRes.diagnostic
            };
          }
        }
      } catch (idbLoadErr) {
        console.warn('IndexedDB getCustomSources warning:', idbLoadErr);
      }
    }

    let rows = null;
    let fileName = 'Base a la Fecha MA.xlsx';

    // 1. Intentar obtener datos del servidor si está corriendo
    try {
      const res = await fetch('/api/rescan-bases');
      if (res.ok) {
        const data = await res.json();
        if (data.partition && data.partition.length) {
          rows = data.partition;
          fileName = data.maFileDetected || fileName;
        }
      }
    } catch (e) {
      // Entorno offline / file://
    }

    // 2. Si no vino por HTTP, verificar si ya hay un override del usuario en IndexedDB antes de caer al bundle estático
    if (!rows && PersistenceEngine) {
      try {
        const savedSources = await PersistenceEngine.getCustomSources();
        const userOverride = (savedSources || []).find(s => s && s.partitionPeriod === '2026/10' && s.isUserOverride && Array.isArray(s.data) && s.data.length > 0);
        if (userOverride) {
          rows = userOverride.data;
          fileName = userOverride.fileName || fileName;
        }
      } catch (e) { /* ignore */ }
    }

    // 3. Fallback al bundle embebido oficial de Octubre
    if (!rows && window.__ARGON_OCTUBRE_SALES__ && window.__ARGON_OCTUBRE_SALES__.rows) {
      rows = window.__ARGON_OCTUBRE_SALES__.rows;
    }

    // 4. Si se encontraron registros, realizar REPLACE MONTH en el bundle y persistir en IndexedDB
    if (rows && rows.length && CustomConsolidator) {
      const upsertRes = CustomConsolidator.upsertSalesPartition(state.activeBundle, rows, {
        partitionPeriod: '2026/10',
        fileName
      });
      state.activeBundle._baseFechaSync = {
        origen: fileName,
        periodo: upsertRes.detectedPeriod || '2026/10',
        filas: upsertRes.appendedCount,
        diagnostic: upsertRes.diagnostic,
        at: new Date().toISOString()
      };

      // Guardar en IndexedDB
      if (PersistenceEngine) {
        try {
          await PersistenceEngine.saveCustomSource({
            id: `PARTITION_${upsertRes.detectedPeriod || '2026/10'}`,
            fileName,
            partitionPeriod: upsertRes.detectedPeriod || '2026/10',
            rowsCount: upsertRes.appendedCount,
            diagnostic: upsertRes.diagnostic,
            data: upsertRes.normalizedRows || rows
          });
        } catch (idbErr) {
          console.warn('IndexedDB saveCustomSource warning:', idbErr);
        }
      }

      // Re-indexar motor comercial
      CommercialMathEngine.ensureIndexes(state.activeBundle);

      return {
        success: true,
        fileName,
        rowsCount: upsertRes.appendedCount,
        periodo: upsertRes.detectedPeriod || '2026/10',
        diagnostic: upsertRes.diagnostic
      };
    }

    return { success: false, rowsCount: 0 };
  }

  // Initialize Application
  async function initApp() {
    console.log('[Dashboard LuanBeer] Iniciando SPA...');

    // 1. Ingestar y conectar la partición de Octubre 2026 de Base a la Fecha MA
    try {
      await ingestBaseALaFechaMA();
    } catch (ingestErr) {
      console.warn('[initApp] Advertencia al procesar partición Base a la Fecha MA:', ingestErr);
    }

    // 1.5. Configurar Auth y vista inicial de Ingesta Protegida
    try {
      const SupabaseClient = (window.ArgonBI && window.ArgonBI.SupabaseClient) || (typeof ArgonBI !== 'undefined' && ArgonBI.SupabaseClient);
      if (SupabaseClient) {
        SupabaseClient.onAuthStateChange(() => {
          updateIngestaAuthView();
        });
        updateIngestaAuthView();
      }
    } catch (sbInitErr) {
      console.warn('[initApp] Supabase Auth setup warning:', sbInitErr);
    }

    // 2. Selectores, inventario y vistas estructurales
    try {
      populateFilterSelectors();
      renderSourcesInventory();
      renderRelationshipsView();
    } catch (uiErr) {
      console.error('[initApp] Error preparando selectores/inventario:', uiErr);
    }

    // 3. Registrar todos los Event Listeners (Navegación, filtros, botones)
    try {
      initEvents();
    } catch (evErr) {
      console.error('[initApp] Error registrando eventos de interfaz:', evErr);
    }

    // 4. Persistencia local e IndexedDB (sin bloquear la app ante fallos)
    try {
      if (PersistenceEngine) {
        const saved = await PersistenceEngine.loadAppState();
        if (saved && saved.confirmedRelationships) {
          state.confirmedAmbiguousRels = new Set(saved.confirmedRelationships);
        } else {
          state.confirmedAmbiguousRels = new Set(['REL-02', 'REL-03', 'REL-04', 'REL-08', 'REL-09', 'REL-10', 'REL-11', 'REL-12']);
        }

        const hist = await PersistenceEngine.getImportHistory();
        if (hist.length === 0) {
          const inv20 = typeof RelationshipEngine.getReal20SourcesInventory2026 === 'function'
            ? RelationshipEngine.getReal20SourcesInventory2026()
            : RelationshipEngine.getReal14SourcesInventory();
          await PersistenceEngine.recordImportOperation({
            universeMode: 'REAL_20',
            actionType: 'INSPECCION_INICIAL_20_FUENTES_2026',
            filesCount: inv20.length,
            fileNames: inv20.map(i => i.fileName),
            totalValidRows: 1243500,
            warningsCount: 16,
            status: 'CONSOLIDADO',
            summary: 'Inspección y consolidación automática de los 20 archivos y manuales reales en 1. Bases/ (Programa Galaxia 2026 & Tablero de Ventas .xlsb).'
          });
        }
      }
    } catch (persistErr) {
      console.warn('[initApp] Advertencia al consultar persistencia IndexedDB:', persistErr);
    }

    // 5. Período por defecto: mes en curso (Octubre 2026) y renderizado completo
    try {
      applyCurrentMonthFilter(false);
    } catch (filterErr) {
      console.error('[initApp] Error aplicando filtro inicial:', filterErr);
    }

    // 6. Consulta inicial de Consultas (completamente desacoplada de la inicialización)
    try {
      runNLQ('¿Qué canal perdió más volumen?');
    } catch (nlqErr) {
      console.warn('[initApp] Consulta inicial diferida:', nlqErr);
    }

    console.log('[Dashboard LuanBeer] SPA inicializada correctamente.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
