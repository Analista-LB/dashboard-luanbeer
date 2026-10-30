# DASHBOARD LUANBEER — Gestión Comercial & Distribución
**Business Intelligence & Analítica Comercial para Distribuidora Oficial LuanBeer | Cervecería y Maltería Quilmes (CMQ)**

Aplicación web profesional de Inteligencia Comercial desarrollada para procesar, relacionar, auditar y visualizar de manera **100% local, offline y sin dependencias externas** el ecosistema analítico de **20 fuentes reales** en `1. Bases/` (19 libros de cálculo con 77 hojas y el Manual Externo de Distribuidores 2026 de 212 páginas), integrando el modelo de gobernanza del **Programa Galaxia 2026 (11.000 Puntos y 8 Pilares de Gestión)**, el **Tablero de Ventas (TACO `.xlsb`)** y el motor de **Ingesta Incremental Particionada por Período**.

---

## 1. Instrucciones de Ejecución Local

La solución ha sido construida para operar **100% offline y sin backend obligatorio**. Puede ejecutarse mediante cualquiera de los siguientes tres métodos:

### Opción A — Inicio automático en un clic (Recomendado en Windows)
Hacé doble clic en el archivo [`iniciar_servidor.bat`](file:///c:/Users/thoma/OneDrive/Desktop/Argon%20Gemini/iniciar_servidor.bat) o ejecutalo desde la terminal de PowerShell / CMD:
```bat
iniciar_servidor.bat
```
Este script inicia el servidor HTTP local [`server.js`](file:///c:/Users/thoma/OneDrive/Desktop/Argon%20Gemini/server.js) en `http://127.0.0.1:8080` (utilizando Node.js o el runtime integrado de Antigravity) y abre automáticamente el navegador predeterminado. El servidor incluye el endpoint reactivo `/api/rescan-bases` para sincronizar en caliente nuevas bases en `1. Bases/`.

### Opción B — Apertura directa mediante protocolo `file://`
Podés hacer doble clic directo en [`index.html`](file:///c:/Users/thoma/OneDrive/Desktop/Argon%20Gemini/index.html) para abrirlo en cualquier navegador moderno (Google Chrome, Microsoft Edge, Mozilla Firefox).
- **Sin bloqueos CORS:** El universo de datos reales consolidados se distribuye precompilado en [`src/data/real_data_bundle.js`](file:///c:/Users/thoma/OneDrive/Desktop/Argon%20Gemini/src/data/real_data_bundle.js) (`21.25 MB`) montado mediante etiquetas `<script>` estándar.
- **Carga dinámica en memoria:** Además, en la vista **Ingesta de Bases** podés arrastrar o seleccionar archivos `.xlsx`, `.xlsb` o `.csv` desde tu disco para inspeccionarlos y consolidarlos en memoria local con SheetJS.

### Opción C — Ejecución de la Suite Completa de Pruebas
Para ejecutar la suite automatizada de 36 pruebas unitarias, relacionales, matemáticas, de estrés y de auditoría de los 8 pilares, junto con las pruebas de evolución LuanBeer:
```powershell
$env:ELECTRON_RUN_AS_NODE="1"; & "C:\Users\thoma\AppData\Local\Programs\antigravity\Antigravity.exe" "tests/run_all_tests.js"
$env:ELECTRON_RUN_AS_NODE="1"; & "C:\Users\thoma\AppData\Local\Programs\antigravity\Antigravity.exe" "tests/test_luanbeer_evolution.js"
```
*(Si tenés `node` en el `PATH` del sistema operativo, también podés ejecutar directamente `node tests/run_all_tests.js`).*

---

## 2. Estructura del Proyecto

```text
Argon Gemini/
├── 1. Bases/                                    # 20 Fuentes comerciales reales intactas (77 hojas + Manual PDF)
│   ├── Tablero Ventas.xlsb                      # Tablero de control comercial CMQ (17.5 MB, 55 hojas BIFF12)
│   ├── Manual Distribuidores 2026.pdf           # Manual Programa Galaxia 2026 (212 páginas, 10 capítulos)
│   ├── (Actualizar) Base de Clientes.xlsx       # Maestro completo de clientes (8.071 padrón, >160 columnas)
│   ├── (Actualizar) Clientes Presencial.xlsx    # Ruteo presencial, frecuencias LU-SA y vendedores
│   ├── (Actualizar) Reporte de Clientes.xlsx    # Segmentación extendida y parámetros operativos
│   ├── (SemiFijo) DetallePersonal.xlsx          # Padrón de dotación de ventas y jerarquías (hoja ag-grid)
│   ├── (Actualizar) Activos Fijos.xlsx          # Parque de 2.000 coolers y equipos de frío
│   ├── (Actualizar) Negociaciones.xlsx          # 5 hojas de acuerdos comerciales, bonificaciones y grupos
│   ├── (Actualizar) Base Prod. y Vol..xlsx      # Ventas transaccionales de bebidas 2025-2026
│   ├── (Actualizar) Base a la fecha.xlsx        # Reconciliación transaccional + División POP
│   ├── (Actualizar) Base Obj..xlsx              # Objetivos de venta asignados por promotor y SKU
│   ├── (Actualizar) Base CNC.xlsx               # Clientes No Compradores y padrón multi-horizonte
│   ├── (Actualizar) Base Eficiencia.xlsx        # Ruteo logístico, km y costos de flete
│   ├── (Actualizar) Base MXPDV.xlsx             # Drop size y cajas por punto de venta
│   ├── (Actualizar) Base Rechazos.xlsx          # Motivos de rechazo físico y logística inversa
│   ├── (Fijo) Base Portfolio.xlsx               # Maestro de 50 columnas de productos y focos CMQ
│   ├── (Fijo) Canal MKT.xlsx                    # Estructura maestra de canales comerciales
│   ├── (Fijo) Subcanales Mkt.xlsx               # Mapeo de subcanales y segmento REF
│   ├── (Fijo) Medida Tiempo.xlsx                # Calendario comercial oficial y días hábiles
│   └── (Fijo) DetallePersonal.xlsx              # Maestro histórico de dotación comercial
├── index.html                                   # Interfaz corporativa principal (10 módulos integrados)
├── server.js                                    # Servidor HTTP estático offline (Node.js nativo)
├── iniciar_servidor.bat                         # Lanzador en 1 clic para Windows
├── vendor/                                      # Librerías locales embebidas
│   ├── xlsx.full.min.js                         # SheetJS con parche de registro binario BIFF12 0x3b
│   ├── chart.umd.min.js                         # Chart.js para visualizaciones interactivas
│   ├── jspdf.umd.min.js                         # jsPDF para exportación de informes ejecutivos
│   ├── jspdf.plugin.autotable.min.js            # AutoTable para renderizado tabular en PDF
│   └── pptxgen.bundle.js                        # PptxGenJS para presentaciones PowerPoint editables
├── src/
│   ├── app.js                                   # Controlador de interfaz, slicers, drill-down y eventos
│   ├── styles/
│   │   └── corporate.css                        # Sistema de diseño de alta densidad (Dark Corporativo)
│   ├── modules/
│   │   ├── galaxiaEngine.js                     # Motor Galaxia 2026 (11.000 pts, Escala CMQ y Tablero TACO)
│   │   ├── commercialMathEngine.js              # Motor matemático comercial verificable
│   │   ├── ingestionEngine.js                   # Ingesta binaria multifuente (.xlsx, .xlsb, .csv, multi-hoja)
│   │   ├── relationshipEngine.js                # Detección relacional, inventario 20 fuentes y huérfanos
│   │   ├── customConsolidator.js                # Consolidación dinámica, deduplicación y conversión Litros->HL
│   │   ├── insightEngine.js                     # Motor de hallazgos comerciales de 8 campos obligatorios
│   │   ├── nlqEngine.js                         # Intérprete semántico de Consultas en Lenguaje Natural
│   │   ├── persistenceEngine.js                 # Persistencia en IndexedDB, control de rollbacks y snapshots
│   │   ├── exportEngine.js                      # Exportador verificable a CSV, XLSX (8 hojas), PDF y PPTX
│   │   └── sanitizer.js                         # Sanitización XSS y normalización de textos y caracteres
│   └── data/
│       ├── real_data_bundle.js                  # Dataset columnar consolidado de las 20 fuentes reales (21 MB)
│       └── synthetic_test_bundle.js             # Lote de prueba sintético controlado (10 archivos)
├── tests/
│   └── run_all_tests.js                         # Suite de 36 pruebas automatizadas (100% exitosas)
├── docs/
│   ├── ARQUITECTURA_Y_MODELO_DE_DATOS.md        # Documentación de arquitectura técnica y modelo dimensional
│   ├── INFORME_DE_PRUEBAS_Y_CALIDAD.md          # Reporte de certificación de pruebas (36/36)
│   ├── INVENTARIO_14_FUENTES_Y_ESTRUCTURAS.md   # Inventario original de estructuras
│   ├── resultados_referencia.json               # Resultados de referencia matemática certificada
│   └── test_execution_report.json               # Log de ejecución JSON de la suite de pruebas
├── exports_verificados/                         # Informes reales generados y validados (CSV, XLSX, PDF, PPTX)
└── test_data/
    └── sinteticos_controlados/                  # Lote de prueba sintético (10 archivos + corrupto)
```

---

## 3. Módulos Disponibles en la Aplicación Web

1. **Dashboard Ejecutivo:**
   - 8 Tarjetas KPI consolidadas: Volumen HL (`33.684,65 HL`), Cumplimiento vs Objetivo, Facturación Neta (`$5.795.539.141,83`), CCC Deduplicado Real (`1.482` clientes únicos), Cobertura CNC, Precio Promedio por HL, Tasa de Rechazos Logísticos y Flete por HL.
   - 6 Gráficos analíticos interactivos y 5 tablas desglosadas por canal, unidad de negocio, trimestre, mes y preventista.
2. **Tablero de Ventas (TACO `.xlsb`):**
   - Espejo operativo del libro `Tablero Ventas.xlsb` con selector de Mesa (`Mando Integral`, `Mesa Julio`, `Mesa Gonza`).
   - Semáforos dinámicos oficiales TACO: Verde (`>=100%`), Amarillo (`80.00% – 99.99%`), Rojo (`<80.00%`).
   - Matriz de preventistas con desglose de Cerveza, UNG, Above Core, Latones 710, GMV Marketplace y CCC.
   - **Slicers Interactivos Cruzados:** Filtrado instantáneo por Mesa, Supervisor, Promotor, Tipo Preventa (Primaria / Merchand / On Premise), Canal, Subcanal, Estado de Cliente (Activo / Anulado / Plan Cerveza) y Búsqueda textual.
   - **Drill-down Jerárquico en 5 niveles:** Distribuidor $\to$ Supervisor $\to$ Promotor $\to$ Canal/Subcanal $\to$ Cliente individual.
3. **Programa Galaxia 2026 (CMQ):**
   - Scorecard oficial de **11.000 Puntos** con la ponderación oficial del Manual de Distribuidores:
     - **55% Gestión Manual (6.050 pts)** en 8 pilares auditados.
     - **40% Resultados TACO (4.400 pts)** en volumen y facturación digital.
     - **5% Bonus Galaxia (550 pts)** en proyectos especiales y digitalización BEES.
   - **Escala de Alcance CMQ:** $<70\% = 0\%$, $70\%-79\% = 50\%$, $80\%-89\% = 60\%$, $90\%-99\% = 80\%$, $100\%-104\% = 100\%$, $\ge 105\% = 110\%$.
   - **Auditoría de los 8 Pilares del Negocio:**
     - *Pilar 1 (Estructura y On Premise):* Padrón de dotación (25 colaboradores) y universo de 209 clientes On Premise activos.
     - *Pilar 2 (Frecuencias y Maestro Clientes):* Auditoría de 8.071 clientes (1.485 activos, 6.586 anulados), 92.05% de coordenadas GPS válidas y alerta de **16 clientes con exceso de frecuencia (>2 visitas semanales)**.
     - *Pilar 3 (CNC Multi-Horizonte):* Cobertura de compradores a U3M (1.337 PDVs), U6M (1.393 PDVs) y U12M (1.442 PDVs).
     - *Pilar 4 (Objetivación y Sensibilización 66/33):* Regla $\text{Peso Sugerido} = \frac{2}{3}\text{Share Real} + \frac{1}{3}\text{Share Objetivo}$ con banda $\pm 10.0\%$, detectando promotores fuera de rango.
     - *Pilar 5 (Ejecución de Mercado & Rutina Matinal SPV):* Avance del Censo Thomas (52.95% al día 12 vs meta 50%) y matriz matinal de los 4 focos diarios por preventista.
     - *Pilar 6 (Ecosistema Digital BEES & Logística D+):* Adopción de BEES (98.48% digital) y rechazos (0.44%).
     - *Pilar 7 (CAPEX Coolers & Chopp):* Parque de 2.000 coolers, stock en depósito (22.81% vs meta $\le 3\%$) y equipos en PDV con venta cero (2.97%).
     - *Pilar 8 (Revenue Management & Trade Spend):* Inversión de $\$40.859/\text{HL}$ y ranking TOP 5 Clientes por canal con historial R3 (U3M) y MMAA (mismo mes año anterior).
4. **Consultas en Lenguaje Natural (NLQ):**
   - Asistente comercial local que interpreta y responde consultas sobre ventas, marcas, canales, promotores, caída interanual, reglas de sensibilización 66/33, scores del Tablero TACO y universo On Premise, rechazando causas macroeconómicas o no verificables en los archivos.
5. **Hallazgos Comerciales Automáticos:**
   - Auditoría automática de caídas críticas, desvíos de objetivos, rechazos logísticos y enfriadores en riesgo con los 8 campos formales de gobernanza.
6. **Importación Multifuente (1 a 10 Archivos):**
   - Receptor de archivos `.xlsx`, `.xlsb` y `.csv` con validación estricta de cupo (1 a 10), exclusión de totales precalculados y alternancia inmediata entre datos reales y lote sintético.
7. **Relaciones entre Bases:**
   - Mapa relacional de las fuentes maestras y transaccionales, cardinalidades, porcentajes de match y aislamiento de claves huérfanas (`SKU 78043`, `29056`).
8. **Logística, Frío y Trade MKT:**
   - Análisis profundo de eficiencia de flota, drop size (`MXPDV`), motivos de rechazo, parque de frío y negociaciones pactadas.
9. **Auditoría del Ecosistema:**
   - Inventario técnico completo de las 20 fuentes reales en `1. Bases/` con detalle de 77 hojas y métricas de integridad.
10. **Centro de Exportaciones:**
    - Generación y descarga directa en **CSV (UTF-8 con BOM)**, **Excel `.xlsx` (8 hojas analíticas)**, **Informe PDF Ejecutivo** y **Presentación PowerPoint `.pptx` editable**.

---

## 4. Certificación de Calidad y Pruebas

La aplicación cuenta con una suite automatizada en [`tests/run_all_tests.js`](file:///c:/Users/thoma/OneDrive/Desktop/Argon%20Gemini/tests/run_all_tests.js) que valida **36 pruebas en 9 categorías**:
- **Cat 1:** Integridad de fuentes originales e inventario de 14 bases (4 pruebas).
- **Cat 2:** Ingesta multifuente, archivos corruptos y multi-hoja (6 pruebas).
- **Cat 3:** Relaciones, deduplicación de CNC y anti-duplicación de ventas (4 pruebas).
- **Cat 4:** Exactitud matemática comercial, CCC real deduplicado y trimestres (6 pruebas).
- **Cat 5:** Hallazgos comerciales con 8 campos y motor NLQ (2 pruebas).
- **Cat 6:** Persistencia en IndexedDB, rollbacks y transacciones atómicas (1 prueba).
- **Cat 7:** Sanitización XSS y servidor local (2 pruebas).
- **Cat 8:** Exportación verificable a CSV, XLSX, PDF y PPTX (4 pruebas).
- **Cat 9:** Actualización Integral 2026: Ingesta binaria BIFF12 de `Tablero Ventas.xlsb` (55 hojas), Scorecard Galaxia 11k pts, Escala CMQ, Maestro de Clientes 2026, Ruteo Presencial, Sensibilización 66/33, Coolers, Trade Spend y NLQ 2026 (7 pruebas).

**Resultado certificado:** `36 PRUEBAS EXITOSAS | 0 PRUEBAS FALLIDAS (100% PASS)`.
