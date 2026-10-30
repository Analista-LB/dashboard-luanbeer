# INFORME DE PRUEBAS AUTOMATIZADAS Y ASEGURAMIENTO DE CALIDAD (QA)
## Sistema de Inteligencia Comercial Multifuente — Argon High BI (Actualización 2026)

---

## 1. Resumen Ejecutivo de Ejecución

- **Script ejecutor:** [`tests/run_all_tests.js`](file:///c:/Users/thoma/OneDrive/Desktop/Argon%20Gemini/tests/run_all_tests.js)
- **Reporte JSON auditable:** [`docs/test_execution_report.json`](file:///c:/Users/thoma/OneDrive/Desktop/Argon%20Gemini/docs/test_execution_report.json)
- **Total de casos ejecutados:** `36`
- **Casos exitosos (`PASS`):** `36` (`100%`)
- **Casos fallidos (`FAIL`):** `0`
- **Integridad de las 20 fuentes reales en `1. Bases/`:** `100% intactas` (ningún archivo original fue modificado, renombrado ni eliminado).

---

## 2. Matriz Completa de las 36 Pruebas Automatizadas

| ID | Categoría | Prueba Automatizada | Estado | Verificación Matemática / Técnica |
|---|---|---|---|---|
| **1.1** | Fuentes Originales | Presencia e integridad intacta de los 14 archivos reales (`.xlsx`) | `PASS` | Comprueba existencia física y tamaño de las 9 bases `(Actualizar)` y 5 bases `(Fijo)` en `1. Bases/`. |
| **1.2** | Fuentes Originales | Inventario completo de las 14 fuentes y 18 hojas en el modelo de datos | `PASS` | Verifica las 14 entradas del inventario original con `266,096` registros transaccionales consolidados. |
| **1.3** | Fuentes Originales | Detección multi-hoja y exclusión de fila descriptora de tipos en `(Actualizar) Negociaciones.xlsx` | `PASS` | Detecta las 5 hojas, identifica la fila `0` como encabezado real y excluye la fila `1` (`FECHA`, `ENTERO`, `CARÁCTER`) mediante `excludedTypeRows`. |
| **1.4** | Fuentes Originales | Normalización de caracteres de control ASCII (`\u0002`) y columnas duplicadas en `(Actualizar) Activos Fijos.xlsx` | `PASS` | Limpia `\u0002` en series de coolers y desambigua columnas duplicadas. |
| **2.1** | Ingesta Multifuente | Carga de 1 archivo individual válido (`.xlsx`) y exclusión de fila `TOTAL GENERAL` | `PASS` | En `Ventas_2025.xlsx`, retiene las `6` transacciones reales y excluye automáticamente `TOTAL GENERAL` (`excludedSummaryRows = 1`). |
| **2.2** | Ingesta Multifuente | Carga simultánea de 10 archivos heterogéneos (`.xlsx` + `.csv`) | `PASS` | Procesa el lote completo de `10` archivos en [`test_data/sinteticos_controlados/`](file:///c:/Users/thoma/OneDrive/Desktop/Argon%20Gemini/test_data/sinteticos_controlados) sin errores. |
| **2.3** | Ingesta Multifuente | Rechazo controlado al intentar cargar más de 10 archivos simultáneos (`11` archivos) | `PASS` | Activa `BATCH_LIMIT_EXCEEDED` cuando `files.length > 10`. |
| **2.4** | Ingesta Multifuente | Lectura de archivo CSV válido (`Canales_Comerciales.csv`) y Excel multi-hoja (`Ventas_2026.xlsx`) | `PASS` | Parsea correctamente delimitadores CSV y las 2 hojas de `Ventas_2026.xlsx` (`Ventas_2026_Detalle` y `Resumen_Preagregado`). |
| **2.5** | Ingesta Multifuente | Tolerancia ante archivo corrupto (`Archivo_Corrupto.xlsx`) sin caída del sistema | `PASS` | Captura el error de formato inválido, reporta el diagnóstico y mantiene el resto del lote operativo. |
| **2.6** | Ingesta Multifuente | Manejo de columnas desconocidas, datos faltantes e inconsistentes (`Datos_Inconsistentes.xlsx`) | `PASS` | Conserva columnas no estándar (`Columna_Desconocida_XYZ`) y reporta advertencias sin bloquear la ingesta. |
| **3.1** | Relaciones e Integridad | Verificación de las 8 relaciones maestras-transaccionales en las 14 fuentes reales | `PASS` | Valida las relaciones maestras-transaccionales (match en Portfolio, Subcanales Mkt y Medida Tiempo). |
| **3.2** | Relaciones e Integridad | Reconciliación anti-duplicación entre `(Actualizar) Base Prod. y Vol.` y `(Actualizar) Base a la fecha` | `PASS` | Demuestra que `266,041` filas son idénticas al `100%` y que `Base a la fecha` añade `55` filas de `División = POP`, consolidando `266,096` filas sin duplicar. |
| **3.3** | Relaciones e Integridad | Deduplicación de claves duplicadas en `(Actualizar) Base CNC.xlsx` (`2026/09`) | `PASS` | Detecta y deduplica las `2` filas repetidas de `2026/09`, conservando `25,893` registros únicos. |
| **3.4** | Relaciones e Integridad | Detección automática de relaciones, huérfanos (`Cliente 999`), exclusión de pre-agregados y conversión `Litros -> HL` en lote sintético | `PASS` | Verifica contra referencia sintética: 50,000 L $\to$ 500 HL, exclusión de filas TOTAL GENERAL y pre-agregados. |
| **4.1** | Matemática Comercial | Exactitud de Volumen 2025 Completo, YTD 2026 y YTD 2025 Homogéneo (`HL`) | `PASS` | `2025 (12m) = 62,922.35 HL`, `2025 YTD = 44,035.71 HL`, `2026 YTD = 33,684.68 HL`, `Var YoY YTD = -10,351.03 HL (-23.51%)`. |
| **4.2** | Matemática Comercial | Exactitud de Facturación Neta y separación estricta de Bonificaciones | `PASS` | `Neto YTD 2026 = $5,828,427,215.97 (-2.83%)`, `Bonificaciones YTD 2026 = $1,376,316,317.44` separadas estrictamente. |
| **4.3** | Matemática Comercial | Cálculo de Clientes Con Compra (`CCC`) deduplicados reales (`Set` de `Código Cliente`) | `PASS` | `CCC YTD 2026 = 1,482` clientes únicos (evitando suma ingenua mensual de 9,081). |
| **4.4** | Matemática Comercial | Protección ante división por cero o base negativa (`ADYACENCIAS` y `MARKETPLACE ALIMENTOS`) | `PASS` | `ADYACENCIAS` devuelve `pct = null` por base negativa; `MARKETPLACE ALIMENTOS` devuelve `pct = null` por base cero. |
| **4.5** | Matemática Comercial | Coherencia de Trimestres (`1Q–4Q`) y Participación Interna (`100%` del total seleccionado) | `PASS` | Coherencia de series trimestrales y suma de participaciones por unidad = `100.00%`. |
| **4.6** | Matemática Comercial | Filtros combinados multidimensionales y evaluación de bases operativas (`Activos Fijos` y `Negociaciones`) | `PASS` | Filtrado dinámico multidimensional y cálculo cruzado sobre parques de frío y negociaciones. |
| **5.1** | Insights y NLQ | Generación de hallazgos comerciales con los 8 campos obligatorios de auditoría | `PASS` | Cada hallazgo contiene los 8 campos: indicador, dimensión, valor actual, comparado, variación abs, variación pct, impacto y prioridad. |
| **5.2** | Insights y NLQ | Intérprete local de Consultas en Lenguaje Natural (`NLQ`) y rechazo de causas externas | `PASS` | Responde con tablas/KPIs reales y rechaza preguntas sobre inflación o clima. |
| **6.1** | Persistencia Local | Guardado, recuperación, reemplazo sin duplicar, rollback ante fallo y separación Real/Prueba | `PASS` | Snapshots transaccionales en IndexedDB con rollback restaurable. |
| **7.1** | Interfaz y Seguridad | Sanitización contra inyección HTML/XSS en nombres de archivos, columnas y celdas | `PASS` | Sanitización exhaustiva contra etiquetas y atributos ejecutables. |
| **7.2** | Interfaz y Seguridad | Verificación del servidor HTTP local y estructura DOM completa de `index.html` | `PASS` | Respuesta 200 OK en `server.js` y presencia de todos los componentes DOM. |
| **8.1** | Exportaciones | Generación y verificación de archivo CSV con BOM UTF-8, metadatos de filtro y datos reales | `PASS` | CSV con codificación UTF-8 BOM y metadatos de gobernanza. |
| **8.2** | Exportaciones | Generación y re-lectura verificable de libro Excel (`.xlsx`) con 8 hojas comerciales | `PASS` | Libro Excel con 8 hojas re-leído y verificado con SheetJS. |
| **8.3** | Exportaciones | Generación y verificación estructural de informe ejecutivo PDF (`.pdf`) | `PASS` | Generación de PDF con cabecera `%PDF-1.4`, tabla xref y marcador `%%EOF`. |
| **8.4** | Exportaciones | Generación y verificación de presentación ejecutiva PowerPoint (`.pptx`) editable | `PASS` | Generación de contenedor OpenXML ZIP `PK` con diapositivas editables. |
| **9.1** | Actualización 2026 | Presencia e integridad de las 20 fuentes reales en `1. Bases/` (19 libros + Manual PDF) | `PASS` | Verifica las 20 fuentes intactas en `1. Bases/` con un total de 77 hojas de cálculo. |
| **9.2** | Actualización 2026 | Ingesta binaria BIFF12 de `Tablero Ventas.xlsb` (55 hojas con soporte de registro `0x3b`) | `PASS` | Decodificación íntegra de las 55 hojas de `Tablero Ventas.xlsb` (17.5 MB). |
| **9.3** | Actualización 2026 | Motor Tablero de Ventas (TACO `.xlsb`): Scores Mando Integral, Mesa Julio y Mesa Gonza | `PASS` | Mando Integral KPI 72.69%, RTO 30.37%, Total 46.77%; Mesa Julio 67.13%; Mesa Gonza 69.33%. |
| **9.4** | Actualización 2026 | Escala Oficial CMQ y Scorecard de 11.000 Puntos del Programa Galaxia 2026 | `PASS` | Verifica los 6 tramos de la escala CMQ (<70% = 0%, 70-79% = 50%, ..., >=105% = 110%) y scorecard de 11.000 pts. |
| **9.5** | Actualización 2026 | Maestro de Clientes 2026, Ruteo Presencial y Alerta de Excesos de Frecuencia | `PASS` | Auditados 8.071 clientes (1.485 activos, 6.586 anulados), 92.05% GPS, 209 On Premise y **16 clientes con >2 visitas semanales**. |
| **9.6** | Actualización 2026 | Auditoría de Pilares Galaxia: Sensibilización 66/33, Coolers Depósito y Trade Spend R3/MMAA | `PASS` | Sensibilización 66/33 (2 alertas en Vol. Total), Coolers en stock (22.81% vs meta $\le 3\%$), Trade Spend $\$40.859/\text{HL}$ y TOP 5 por canal. |
| **9.7** | Actualización 2026 | Consultas de Lenguaje Natural (`NLQ`) para Programa Galaxia 2026 y Tablero TACO | `PASS` | 4 consultas interpretadas con datos de TACO, Galaxia 11k pts, regla 66/33 y On Premise. |
