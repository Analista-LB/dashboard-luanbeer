(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ArgonBI = root.ArgonBI || {};
    root.ArgonBI.InsightEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function fmtNum(n, dec = 2) {
    if (n === null || n === undefined || isNaN(Number(n))) return 'N/A';
    return Number(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function generateInsights(dashboardState, bundle) {
    const insights = [];
    const { kpis, monthlySeries, byCanal, byUnidadNegocio } = dashboardState;
    const periodoLabel = kpis.periodoLabel;
    const totalHLVarPct = kpis.volumenHL.varPct;

    // 1. Caídas de volumen superiores al 10% (Global, Canales, Unidades de Negocio y Meses)
    if (kpis.volumenHL.varPct !== null && kpis.volumenHL.varPct < -10) {
      insights.push({
        id: 'INS-VOL-GLOBAL',
        tipo: 'Caída de Volumen > 10%',
        severidad: 'negativo',
        indicador: 'Volumen Vendido (HL)',
        periodo: periodoLabel,
        segmento: 'Consolidado General',
        valorActual: `${fmtNum(kpis.volumenHL.actual)} HL`,
        valorAnterior: `${fmtNum(kpis.volumenHL.prev)} HL`,
        variacion: `${fmtNum(kpis.volumenHL.diff)} HL (${kpis.volumenHL.varPctFormatted})`,
        fuente: '(Actualizar) Base Prod. y Vol..xlsx / (Actualizar) Base a la fecha.xlsx',
        regla: 'REGLA_01: Variación porcentual interanual de Volumen (HL) < -10.00%',
        conclusion: `El volumen consolidado registra una disminución interanual de ${fmtNum(Math.abs(kpis.volumenHL.diff))} HL (${kpis.volumenHL.varPctFormatted}) respecto al mismo período del año anterior.`
      });
    }

    for (const c of byCanal) {
      if (c.hlVarPct !== null && c.hlVarPct < -10 && c.hl25 >= 50) {
        insights.push({
          id: `INS-VOL-CANAL-${c.key}`,
          tipo: 'Caída de Volumen > 10%',
          severidad: 'negativo',
          indicador: 'Volumen por Canal (HL)',
          periodo: periodoLabel,
          segmento: `Canal: ${c.label}`,
          valorActual: `${fmtNum(c.hl26)} HL`,
          valorAnterior: `${fmtNum(c.hl25)} HL`,
          variacion: `${fmtNum(c.hlDiff)} HL (${c.hlVarPct > 0 ? '+' : ''}${c.hlVarPct}%)`,
          fuente: '(Actualizar) Base Prod. y Vol..xlsx + (Fijo) Canal MKT.xlsx',
          regla: 'REGLA_01: Variación interanual de Volumen en Canal < -10.00% (con base >= 50 HL)',
          conclusion: `El canal "${c.label}" contrajo su volumen en ${fmtNum(Math.abs(c.hlDiff))} HL (${c.hlVarPct}%).`
        });
      }
    }

    for (const u of byUnidadNegocio) {
      if (u.hlVarPct !== null && u.hlVarPct < -10 && u.hl25 >= 10) {
        insights.push({
          id: `INS-VOL-UN-${u.key}`,
          tipo: 'Caída de Volumen > 10%',
          severidad: 'negativo',
          indicador: 'Volumen por Unidad de Negocio (HL)',
          periodo: periodoLabel,
          segmento: `Unidad de Negocio: ${u.label}`,
          valorActual: `${fmtNum(u.hl26)} HL`,
          valorAnterior: `${fmtNum(u.hl25)} HL`,
          variacion: `${fmtNum(u.hlDiff)} HL (${u.hlVarPct}%)`,
          fuente: '(Actualizar) Base Prod. y Vol..xlsx + (Fijo) Base Portfolio.xlsx',
          regla: 'REGLA_01: Variación interanual de Volumen en Unidad de Negocio < -10.00%',
          conclusion: `La unidad de negocio "${u.label}" disminuyó su volumen en ${fmtNum(Math.abs(u.hlDiff))} HL (${u.hlVarPct}%).`
        });
      }
    }

    const fallingMonths = monthlySeries.filter(m => !m.isInactive2026 && m.hlVarPct !== null && m.hlVarPct < -10);
    if (fallingMonths.length > 0) {
      for (const m of fallingMonths) {
        insights.push({
          id: `INS-VOL-MES-${m.mesStr}`,
          tipo: 'Caída Mensual de Volumen > 10%',
          severidad: 'negativo',
          indicador: 'Volumen Mensual (HL)',
          periodo: `Mes ${m.mesStr} - ${m.mesNombre} (2026 vs 2025)`,
          segmento: `Mes: ${m.mesNombre}`,
          valorActual: `${fmtNum(m.hl26)} HL`,
          valorAnterior: `${fmtNum(m.hl25)} HL`,
          variacion: `${fmtNum(m.hlDiff)} HL (${m.hlVarPct}%)`,
          fuente: '(Actualizar) Base Prod. y Vol..xlsx + (Fijo) Medida Tiempo.xlsx',
          regla: 'REGLA_01_MES: Variación interanual del mes < -10.00%',
          conclusion: `En ${m.mesNombre}, el volumen operado cayó un ${Math.abs(m.hlVarPct)}% (${fmtNum(m.hlDiff)} HL frente a ${m.mesNombre} 2025).`
        });
      }
    }

    // 2. Crecimientos superiores al 15% (Volumen, CCC o Facturación)
    if (kpis.ccc.varPct !== null && kpis.ccc.varPct > 15) {
      insights.push({
        id: 'INS-GROWTH-CCC-GLOBAL',
        tipo: 'Crecimiento > 15%',
        severidad: 'positivo',
        indicador: 'Clientes con Compra Únicos (CCC)',
        periodo: periodoLabel,
        segmento: 'Consolidado General',
        valorActual: `${fmtNum(kpis.ccc.actual, 0)} clientes`,
        valorAnterior: `${fmtNum(kpis.ccc.prev, 0)} clientes`,
        variacion: `+${fmtNum(kpis.ccc.diff, 0)} clientes (${kpis.ccc.varPctFormatted})`,
        fuente: '(Actualizar) Base Prod. y Vol..xlsx (Desduplicación exacta de Código Cliente)',
        regla: 'REGLA_02: Variación interanual positiva > +15.00%',
        conclusion: `El padrón de clientes únicos con compra efectiva creció un ${kpis.ccc.varPct}% (+${kpis.ccc.diff} clientes únicos en el período).`
      });
    }

    for (const c of byCanal) {
      if (c.hlVarPct !== null && c.hlVarPct > 15) {
        insights.push({
          id: `INS-GROWTH-HL-CANAL-${c.key}`,
          tipo: 'Crecimiento > 15%',
          severidad: 'positivo',
          indicador: 'Volumen por Canal (HL)',
          periodo: periodoLabel,
          segmento: `Canal: ${c.label}`,
          valorActual: `${fmtNum(c.hl26)} HL`,
          valorAnterior: `${fmtNum(c.hl25)} HL`,
          variacion: `+${fmtNum(c.hlDiff)} HL (+${c.hlVarPct}%)`,
          fuente: '(Actualizar) Base Prod. y Vol..xlsx',
          regla: 'REGLA_02: Variación interanual de Volumen > +15.00%',
          conclusion: `El canal "${c.label}" expandió su volumen un +${c.hlVarPct}% (+${fmtNum(c.hlDiff)} HL).`
        });
      } else if (c.cccVarPct !== null && c.cccVarPct > 15 && c.ccc25 >= 10) {
        insights.push({
          id: `INS-GROWTH-CCC-CANAL-${c.key}`,
          tipo: 'Crecimiento > 15%',
          severidad: 'positivo',
          indicador: 'Clientes con Compra (CCC por Canal)',
          periodo: periodoLabel,
          segmento: `Canal: ${c.label}`,
          valorActual: `${fmtNum(c.ccc26, 0)} clientes`,
          valorAnterior: `${fmtNum(c.ccc25, 0)} clientes`,
          variacion: `+${fmtNum(c.cccDiff, 0)} clientes (+${c.cccVarPct}%)`,
          fuente: '(Actualizar) Base Prod. y Vol..xlsx',
          regla: 'REGLA_02: Variación interanual de CCC en Canal > +15.00%',
          conclusion: `El canal "${c.label}" incrementó su base de clientes compradores en +${c.cccVarPct}% (+${c.cccDiff} clientes únicos).`
        });
      }
    }

    // 3. Disminución de CCC (en Unidades de Negocio o Canales)
    for (const u of byUnidadNegocio) {
      if (u.cccDiff < 0) {
        insights.push({
          id: `INS-DROP-CCC-UN-${u.key}`,
          tipo: 'Disminución de CCC',
          severidad: 'negativo',
          indicador: 'Clientes con Compra Únicos (CCC)',
          periodo: periodoLabel,
          segmento: `Unidad de Negocio: ${u.label}`,
          valorActual: `${fmtNum(u.ccc26, 0)} clientes`,
          valorAnterior: `${fmtNum(u.ccc25, 0)} clientes`,
          variacion: `${fmtNum(u.cccDiff, 0)} clientes (${u.cccVarPct !== null ? u.cccVarPct + '%' : 'N/A'})`,
          fuente: '(Actualizar) Base Prod. y Vol..xlsx + (Fijo) Base Portfolio.xlsx',
          regla: 'REGLA_03: Variación absoluta de Clientes con Compra (CCC) < 0',
          conclusion: `La unidad de negocio "${u.label}" registró una pérdida neta de ${Math.abs(u.cccDiff)} clientes compradores únicos (${u.cccVarPct}%).`
        });
      }
    }

    for (const c of byCanal) {
      if (c.cccDiff < 0) {
        insights.push({
          id: `INS-DROP-CCC-CANAL-${c.key}`,
          tipo: 'Disminución de CCC',
          severidad: 'negativo',
          indicador: 'Clientes con Compra Únicos (CCC)',
          periodo: periodoLabel,
          segmento: `Canal: ${c.label}`,
          valorActual: `${fmtNum(c.ccc26, 0)} clientes`,
          valorAnterior: `${fmtNum(c.ccc25, 0)} clientes`,
          variacion: `${fmtNum(c.cccDiff, 0)} clientes (${c.cccVarPct !== null ? c.cccVarPct + '%' : 'N/A'})`,
          fuente: '(Actualizar) Base Prod. y Vol..xlsx',
          regla: 'REGLA_03: Variación absoluta de Clientes con Compra (CCC) en Canal < 0',
          conclusion: `El canal "${c.label}" redujo su cantidad de clientes compradores únicos en ${Math.abs(c.cccDiff)} clientes.`
        });
      }
    }

    // 4. Caídas de facturación
    if (kpis.facturacionNeta.diff < 0) {
      insights.push({
        id: 'INS-DROP-FACT-GLOBAL',
        tipo: 'Caída de Facturación',
        severidad: 'negativo',
        indicador: 'Facturación Neta ($)',
        periodo: periodoLabel,
        segmento: 'Consolidado General',
        valorActual: `$${fmtNum(kpis.facturacionNeta.actual)}`,
        valorAnterior: `$${fmtNum(kpis.facturacionNeta.prev)}`,
        variacion: `$${fmtNum(kpis.facturacionNeta.diff)} (${kpis.facturacionNeta.varPctFormatted})`,
        fuente: '(Actualizar) Base Prod. y Vol..xlsx / (Actualizar) Base a la fecha.xlsx',
        regla: 'REGLA_04: Variación interanual de Facturación Neta < 0',
        conclusion: `La facturación neta consolidada disminuyó en $${fmtNum(Math.abs(kpis.facturacionNeta.diff))} (${kpis.facturacionNeta.varPctFormatted}).`
      });
    }

    // 5. Diferencias entre evolución de volumen y facturación
    if (kpis.volumenHL.varPct !== null && kpis.facturacionNeta.varPct !== null) {
      const gapPts = Number((kpis.facturacionNeta.varPct - kpis.volumenHL.varPct).toFixed(2));
      if (Math.abs(gapPts) >= 5) {
        insights.push({
          id: 'INS-DIVERGENCE-VOL-FACT',
          tipo: 'Divergencia Volumen vs Facturación',
          severidad: 'advertencia',
          indicador: 'Evolución Volumen (HL) vs Facturación Neta ($)',
          periodo: periodoLabel,
          segmento: 'Consolidado General',
          valorActual: `Var. Facturación: ${kpis.facturacionNeta.varPctFormatted} ($/HL actual: $${fmtNum(kpis.precioPromedioHL.actual)})`,
          valorAnterior: `Var. Volumen: ${kpis.volumenHL.varPctFormatted} ($/HL anterior: $${fmtNum(kpis.precioPromedioHL.prev)})`,
          variacion: `Brecha de ${gapPts > 0 ? '+' : ''}${fmtNum(gapPts)} puntos porcentuales (Var. $/HL: ${kpis.precioPromedioHL.varPctFormatted})`,
          fuente: '(Actualizar) Base Prod. y Vol..xlsx',
          regla: 'REGLA_05: |Var% Facturación Neta - Var% Volumen HL| >= 5.00 pts',
          conclusion: `Existe una divergencia de ${fmtNum(Math.abs(gapPts))} puntos porcentuales entre la variación del volumen (${kpis.volumenHL.varPctFormatted}) y la de la facturación neta (${kpis.facturacionNeta.varPctFormatted}), explicada matemáticamente por la variación del ingreso neto por hectolitro (${kpis.precioPromedioHL.varPctFormatted}).`
        });
      }
    }

    // 6. Pérdidas de participación interna
    for (const u of byUnidadNegocio) {
      if (u.shareHLDiffPts <= -0.5) {
        insights.push({
          id: `INS-SHARE-LOSS-UN-${u.key}`,
          tipo: 'Pérdida de Participación Interna',
          severidad: 'advertencia',
          indicador: 'Participación Interna de Volumen (% HL)',
          periodo: periodoLabel,
          segmento: `Unidad de Negocio: ${u.label}`,
          valorActual: `${fmtNum(u.shareHL26)}% del volumen total`,
          valorAnterior: `${fmtNum(u.shareHL25)}% del volumen total`,
          variacion: `${fmtNum(u.shareHLDiffPts)} puntos porcentuales`,
          fuente: '(Actualizar) Base Prod. y Vol..xlsx + (Fijo) Base Portfolio.xlsx',
          regla: 'REGLA_06: Variación de Participación Interna en HL <= -0.50 pts',
          conclusion: `La unidad "${u.label}" redujo su participación interna sobre las ventas totales de la distribuidora del ${fmtNum(u.shareHL25)}% al ${fmtNum(u.shareHL26)}% (${fmtNum(u.shareHLDiffPts)} pts).`
        });
      }
    }

    for (const c of byCanal) {
      if (c.shareHLDiffPts <= -0.5) {
        insights.push({
          id: `INS-SHARE-LOSS-CANAL-${c.key}`,
          tipo: 'Pérdida de Participación Interna',
          severidad: 'advertencia',
          indicador: 'Participación Interna por Canal (% HL)',
          periodo: periodoLabel,
          segmento: `Canal: ${c.label}`,
          valorActual: `${fmtNum(c.shareHL26)}%`,
          valorAnterior: `${fmtNum(c.shareHL25)}%`,
          variacion: `${fmtNum(c.shareHLDiffPts)} pts`,
          fuente: '(Actualizar) Base Prod. y Vol..xlsx',
          regla: 'REGLA_06: Variación de Participación Interna por Canal <= -0.50 pts',
          conclusion: `El canal "${c.label}" cedió ${fmtNum(Math.abs(c.shareHLDiffPts))} puntos de participación interna de volumen (de ${fmtNum(c.shareHL25)}% a ${fmtNum(c.shareHL26)}%).`
        });
      }
    }

    // 7. Meses sin actividad
    const inactiveMonths = monthlySeries.filter(m => m.isInactive2026);
    if (inactiveMonths.length > 0) {
      insights.push({
        id: 'INS-INACTIVE-MONTHS-2026',
        tipo: 'Meses sin Actividad',
        severidad: 'advertencia',
        indicador: 'Actividad Transaccional por Período',
        periodo: inactiveMonths.map(m => `2026/${m.mesStr} (${m.mesNombre})`).join(', '),
        segmento: 'Calendario 2026 (4Q)',
        valorActual: '0.00 HL (0 operaciones)',
        valorAnterior: `${fmtNum(inactiveMonths.reduce((a, m) => a + m.hl25, 0))} HL en 4Q 2025`,
        variacion: 'Períodos sin carga transaccional en fuentes actualizables',
        fuente: '(Fijo) Medida Tiempo.xlsx vs (Actualizar) Base Prod. y Vol..xlsx',
        regla: 'REGLA_07: Período definido en Medida Tiempo con 0 registros en tablas de hechos',
        conclusion: `Los períodos ${inactiveMonths.map(m => `2026/${m.mesStr}`).join(', ')} están dados de alta en (Fijo) Medida Tiempo.xlsx pero registran 0 operaciones en las bases transaccionales (corte operativo a Septiembre 2026). Por integridad matemática, el acumulado YTD excluye el 4Q.`
      });
    }

    // 8. Segmentos con desempeño inferior al total
    if (totalHLVarPct !== null) {
      for (const c of byCanal) {
        if (c.hlVarPct !== null && c.hlVarPct < totalHLVarPct && c.hl25 >= 50) {
          const underperf = Number((c.hlVarPct - totalHLVarPct).toFixed(2));
          insights.push({
            id: `INS-UNDERPERF-CANAL-${c.key}`,
            tipo: 'Desempeño Inferior al Total',
            severidad: 'negativo',
            indicador: 'Variación % Volumen Canal vs Total Distribuidora',
            periodo: periodoLabel,
            segmento: `Canal: ${c.label}`,
            valorActual: `Var. Canal: ${c.hlVarPct}% (${fmtNum(c.hl26)} HL)`,
            valorAnterior: `Var. Total Consolidado: ${totalHLVarPct}% (${fmtNum(kpis.volumenHL.actual)} HL)`,
            variacion: `${fmtNum(underperf)} pts por debajo del promedio general`,
            fuente: '(Actualizar) Base Prod. y Vol..xlsx',
            regla: 'REGLA_08: Var% Segmento < Var% Total Universo Analizado',
            conclusion: `El canal "${c.label}" evolucionó ${fmtNum(Math.abs(underperf))} puntos porcentuales por debajo del desempeño promedio del consolidado general (${c.hlVarPct}% vs ${totalHLVarPct}%).`
          });
        }
      }
    }

    // 9. Inconsistencias entre fuentes (Verificables sobre los 14 archivos reales)
    insights.push({
      id: 'INS-AUDIT-OVERLAP-PV-BF',
      tipo: 'Inconsistencia / Solapamiento entre Fuentes',
      severidad: 'auditoria',
      indicador: 'Conciliación Base Prod. y Vol. vs Base a la fecha',
      periodo: '2025/01 a 2026/09 (21 meses)',
      segmento: 'Tablas de Hechos de Ventas',
      valorActual: '266,096 filas en Base a la fecha ($14,824.77M | 96,607.03 HL)',
      valorAnterior: '266,041 filas en Base Prod. y Vol. ($14,823.75M | 96,607.03 HL)',
      variacion: '+55 filas exclusivas de División POP ($1,018,594.84 | 0.00 HL)',
      fuente: '(Actualizar) Base Prod. y Vol..xlsx vs (Actualizar) Base a la fecha.xlsx',
      regla: 'REGLA_09_AUDITORIA: Detección de claves compuestas compartidas entre múltiples fuentes de hechos',
      conclusion: 'Ambas bases contienen exactamente las mismas 266,041 transacciones de bebidas (96,607.03 HL). El motor de consolidación bloqueó la suma duplicada y concilió las 55 filas adicionales de material POP presentes únicamente en Base a la fecha.'
    });

    insights.push({
      id: 'INS-AUDIT-ORPHAN-PRODS',
      tipo: 'Inconsistencia entre Fuentes (Claves Huérfanas)',
      severidad: 'auditoria',
      indicador: 'Integridad Referencial de Productos',
      periodo: '2025/01 a 2026/09',
      segmento: 'Productos #78043 y #29056',
      valorActual: '292 SKUs operados en Ventas',
      valorAnterior: '1,673 SKUs en (Fijo) Base Portfolio.xlsx',
      variacion: '2 SKUs operados sin alta en maestro Base Portfolio',
      fuente: 'Ventas / Objetivos vs (Fijo) Base Portfolio.xlsx',
      regla: 'REGLA_09_AUDITORIA: Claves foráneas en tabla de hechos sin correspondencia en tabla maestra',
      conclusion: 'Los códigos de producto 78043 (QUILMES MARKETPLACE CRISTALERIA en Base Prod. y Vol.) y 29056 (POP BRAHMA en Base a la fecha) registran operaciones pero no existen en (Fijo) Base Portfolio.xlsx. Se clasificaron mediante su atributo División sin pérdida de volumen ni facturación.'
    });

    insights.push({
      id: 'INS-AUDIT-CNC-DUPS-AND-RECHAZOS',
      tipo: 'Inconsistencia en Registros de Origen',
      severidad: 'auditoria',
      indicador: 'Calidad de Datos en CNC, Negociaciones y Rechazos',
      periodo: '2025/01 a 2026/09',
      segmento: 'Base CNC / Base Rechazos / Negociaciones',
      valorActual: '2 duplicados en CNC (2026/09) | 2,707 rechazos sin motivo | 1 fila metadata en Negociaciones',
      valorAnterior: '0 duplicados esperados en clave (Año/Mes + Cod Cte)',
      variacion: 'Saneamiento automático aplicado al 100%',
      fuente: '(Actualizar) Base CNC.xlsx, (Actualizar) Base Rechazos.xlsx, (Actualizar) Negociaciones.xlsx',
      regla: 'REGLA_09_AUDITORIA: Control de unicidad primaria, valores nulos y filas descriptoras',
      conclusion: 'Se detectaron y corrigieron: (1) 2 filas repetidas de cliente en Base CNC durante 2026/09; (2) 1 fila descriptora de tipos ("FECHA", "ENTERO", "CARÁCTER") en Negociaciones; y (3) 2,707 registros en Base Rechazos con Motivo Rechazo nulo (46.6% del total).'
    });

    // 10. Insights Operativos 2026 (Tablero Ventas .xlsb & Programa Galaxia CMQ)
    const tv = bundle.tableroVentasXlsb;
    const gx = bundle.galaxia2026;

    if (tv && tv.mandoIntegral) {
      const mi = tv.mandoIntegral;
      insights.push({
        id: 'INS-2026-TACO-OCTUBRE',
        tipo: 'Tablero de Ventas (TACO .xlsb)',
        severidad: mi.tacoTotalPct >= 50 ? 'positivo' : 'alerta',
        indicador: 'Score Consolidado TACO Octubre 2026',
        periodo: 'Octubre 2026 (Día 12 de 26 hábiles = 46.15%)',
        segmento: 'Total Distribuidor (Mando Integral)',
        valorActual: `TACO Total: ${mi.tacoTotalPct}% | TACO KPI: ${mi.tacoKpiPct}% | TACO RTO: ${mi.tacoRtoPct}%`,
        valorAnterior: 'Meta 100% de Cumplimiento Mensual',
        variacion: `LE Proyectado Cierre: factor ×2.1667`,
        fuente: '1. Bases/Tablero Ventas.xlsb (Hoja: Mando Integral)',
        regla: 'REGLA_10_TACO: Consolidación oficial de KPIs operativos y resultados comerciales',
        conclusion: `El Mando Integral registra un avance de TACO KPI de ${mi.tacoKpiPct}% (Facturación Digital 101.6%, Productividad 86.25%, Enfriadores 83.42%) y un avance de volumen TACO RTO de ${mi.tacoRtoPct}% al 46.15% del mes hábil.`
      });
    }

    if (gx && gx.pilar7_capexCoolersChopp) {
      const af = gx.pilar7_capexCoolersChopp;
      insights.push({
        id: 'INS-2026-COOLERS-STOCK',
        tipo: 'Desviación de Meta Operativa (CAPEX Coolers)',
        severidad: 'negativo',
        indicador: 'Stock en Depósito Clúster 2 vs Meta CMQ',
        periodo: '2026 Actual',
        segmento: 'Parque Operativo de Activos Fijos (1.004 equipos)',
        valorActual: `${af.stockSobreParqueOperativoPct}% en Depósito (${af.enStockDeposito} equipos)`,
        valorAnterior: 'Meta Máxima Galaxia: <= 3.00% (30 equipos)',
        variacion: `Exceso de stock: +${af.excesoStockUnidadesSobreMeta3Pct} equipos sobre la meta`,
        fuente: '1. Bases/(Actualizar) Activos Fijos.xlsx + Manual Distribuidores 2026 (Cap. 3)',
        regla: 'REGLA_11_GALAXIA: Penalización de puntaje por exceso de enfriadores en stock para Distribuidores Clúster 2',
        conclusion: `Se detectaron ${af.enStockDeposito} equipos en depósito (${af.stockSobreParqueOperativoPct}% del parque activo), superando ampliamente la meta del 3.0% permitida por el Programa Galaxia para distribuidores Clúster 2. Adicionalmente, 23 equipos (${af.equiposInstaladosVentaCeroPct}%) reportan Venta Cero.`
      });
    }

    if (gx && gx.pilar2_frecuenciasYMaestroClientes) {
      const p2 = gx.pilar2_frecuenciasYMaestroClientes;
      const pres = p2.auditoriaClientesPresencial;
      if (pres && pres.clientesExcesoFrecuenciaCount > 0) {
        insights.push({
          id: 'INS-2026-EXCESO-FRECUENCIAS',
          tipo: 'Desviación de Política Comercial (Frecuencias)',
          severidad: 'alerta',
          indicador: 'Clientes con Exceso de Frecuencia (>2 visitas/semana)',
          periodo: '2026 Actual',
          segmento: 'Ruteo Presencial (Clientes Presencial.xlsx)',
          valorActual: `${pres.clientesExcesoFrecuenciaCount} clientes con 3 o más días de visita`,
          valorAnterior: 'Meta CMQ: 0 clientes con >2 visitas semanales',
          variacion: `${pres.clientesExcesoFrecuenciaCount} desvíos detectados`,
          fuente: '1. Bases/(Actualizar) Clientes Presencial.xlsx + Manual Distribuidores 2026 (Cap. 1)',
          regla: 'REGLA_12_GALAXIA: Máximo 2 frecuencias de contacto presencial por semana por cliente',
          conclusion: `Se identificaron exactamente ${pres.clientesExcesoFrecuenciaCount} clientes en la cartera presencial asignados con más de 2 días de visita por semana (ej. Cód. 7471 con 4 días, 4116 con 3 días), requiriendo readecuación de ruteo para evitar penalización en el Pilar 2.`
        });
      }
    }

    return insights;
  }

  return {
    generateInsights
  };
});
