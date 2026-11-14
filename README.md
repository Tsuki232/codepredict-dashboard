# CodePredict AI · Limpieza visual e inferencia

Panel del proyecto de **Estadística Inferencial y Ciencia de Datos** (tema del grupo: *t de Student*). Toma el
**Unified Bug Dataset** (nivel archivo, 43 744 filas), muestra **paso a paso y con conteos** cómo se limpia, deja que el grupo
elija las decisiones que dependen de su criterio y luego calcula la inferencia con **Ada** (motor con doble verificación).

Está construido sobre la plantilla *Estadística Data* (sistema de diseño «hoja de laboratorio», claro/oscuro, gráficas SVG propias).

## Qué hace

| Vista | Qué muestra | Cómo se comprueba |
|---|---|---|
| **Fuente y perfil** | Origen y huella SHA-256 del CSV, hallazgos de calidad (copias, rutas repetidas, valores imposibles, columnas constantes), distribución de `McCC` y `LOC` en escala log, tabla 2×2 cruda | Conteos con pandas y DuckDB |
| **Limpieza visual** | Embudo de 7 pasos con filas antes/después, histogramas antes-después con umbrales de atípicos, **las 9 combinaciones de decisiones** (rutas repetidas × atípicos) con su efecto en la tabla 2×2 y en Welch, guardado del conjunto limpio | Cada regla: filas quitadas por **pandas** (la ejecuta) y por una consulta **DuckDB** aparte; si difieren, no se guarda |
| **Cuaderno en vivo** | Estilo Colab: 14 celdas (cargar, 6 reglas, tabla 2×2, guardar, Welch, sensibilidad, χ², dos proporciones, Bayes) que se ejecutan una a una o todas desde cero. Cada celda muestra **el código real que ejecuta**, su salida, el contador `[n]`, el tiempo real y ejemplos de las filas que quitó. Reejecutar una celda deja desactualizadas las siguientes | Es el mismo código y las mismas verificaciones del panel; sin retardos artificiales |
| **Inferencia** | Welch (con hipótesis, fórmula con las cifras, IC, g de Hedges, supuestos), sensibilidad (Welch sobre log, Mann-Whitney), χ² de independencia, dos proporciones, Bayes con conteos reales, límites de las conclusiones | Ada: scipy ↔ statsmodels ↔ fórmula manual (Welch), scipy ↔ fórmula (χ², z), fracciones exactas ↔ conteo directo (Bayes) |

### Reglas de limpieza (bitácora, Paso 4)

1. **Integridad:** faltantes, negativos, `LOC < LLOC`, `LOC ≤ 0` (en este CSV: 0 filas).
2. **Duplicados exactos** (las 11 columnas iguales): 4 filas.
3. **Rutas repetidas** (`LongName`): *decisión del grupo* — dejar la primera (por defecto, **provisional**), quitar todas o conservar todas.
4. **Columnas constantes:** `CLOC` (siempre 0).
5. **Atípicos extremos:** *decisión del grupo* — por defecto **solo se señalan** (quitar los archivos más complejos puede quitar la señal que se estudia); opciones Q3 + 3·RIC y percentil 99,9.
6. **Etiquetas fijadas de antemano** (no editables en la interfaz): defectuoso = `bug > 0`, complejo = `McCC > 10`.

Con las opciones por defecto: 43 744 → 43 744 → 43 740 → **32 509** filas (= número de rutas distintas).

## Requisitos y ejecución

Este panel usa **Ada como motor**, así que en este equipo corre con el entorno de Ada (ya trae FastAPI, pandas, DuckDB, scipy y statsmodels).

```powershell
.\scripts\run.ps1          # abre http://127.0.0.1:8000
```

- Ada se busca en `..\Ada` (o en la variable `ADA_ROOT`). Tarda en cargar la primera vez (~20 s); el panel lo indica.
- El CSV de entrada se toma de la carpeta de Ada (`data/work/unified_bug_dataset/extract/…/Unified-file.csv`) o de `CODEPREDICT_DATASET`.
- El conjunto limpio y su `manifest.json` se guardan en `<ADA_ROOT>/data/work/codepredict/` (o `CODEPREDICT_WORK`). **Nunca se escribe en `data/raw/` ni se modifica el CSV original** (hay pruebas que lo verifican con huellas SHA-256).
- Sin Ada, la fuente y la limpieza funcionan; la inferencia avisa que Ada no está disponible (no hay cálculo de respaldo que simule su resultado).

Desarrollo con recarga: `uvicorn app.main:app --reload --app-dir backend` y, en `frontend/`, `npm run dev` (puerto 5173, con proxy a la API).

### Pruebas

```powershell
cd backend;  ..\..\Ada\.venv\Scripts\python.exe -m pytest -q     # 27 pruebas (incluye el cuaderno)
cd frontend; npm test                                              # 29 pruebas (contraste de colores y formato de cifras)
```

Las pruebas de backend usan 10 filas inventadas con trampas conocidas (copia exacta, ruta repetida, `LOC < LLOC`, atípico) y una tabla 2×2 de 100 archivos, **con todos los resultados calculados a mano** (χ² = 50/3, z = √(50/3), P(D|C) = 0,6, Welch recalculado con la fórmula de Welch–Satterthwaite).

## Estructura

```
backend/app/core/cleaning.py      reglas de limpieza, doble verificación pandas/DuckDB, perfil, impacto de políticas
backend/app/core/workspace.py     guardado del limpio + manifest + huellas + auditoría de Ada
backend/app/core/inference.py     inferencia con Ada (+ comprobación robusta por rangos)
backend/app/core/ada_engine.py    carga de Ada en segundo plano
backend/app/adapters/api/routes.py  API: /api/dataset/profile, /api/clean/*, /api/inference
frontend/src/views/               Fuente, Limpieza, Inferencia
frontend/src/features/charts/     LogHistogram, Funnel, Table2x2, Interval (SVG propio)
```

## Límites honestos

- **Sensibilidad de Ada:** el análisis robusto automático de Ada (bootstrap n₁×n₂ y 20 000 permutaciones) no escala a decenas de miles de filas. Se añadió a Ada la opción `sensitivity=False` (por defecto sigue igual) y la comparación robusta (Mann-Whitney por rangos, con P(X>Y) e IC bootstrap) la calcula **este panel**, no Ada; la interfaz lo dice y la verifica por dos vías (scipy y fórmula de rangos).
- **Independencia:** tras «dejar la primera ruta» no quedan rutas repetidas, pero un mismo proyecto aporta muchos archivos; los p-valores siguen siendo optimistas. Con n ≈ 32 mil casi todo sale «significativo»: importa el tamaño del efecto.
- **Decisiones del grupo:** las dos decisiones de limpieza están marcadas como provisionales; la vista de impacto muestra qué cambia con cada una.
- Es **asociación**, no causalidad, y solo código Java de este conjunto.

## Declaración de uso de IA

Este panel (código, pruebas y textos de la interfaz) fue generado con asistencia de **Claude Code (Anthropic)** a petición de Diego López, a partir de la plantilla *Estadística Data* y usando **Ada** (motor estadístico de Diego López) para el cálculo. Los resultados numéricos los producen scripts verificados, no la IA «a mano». Conforme a la regla del curso, **el grupo debe poder explicar cada línea y cada decisión**, y la parte analítica (hipótesis, interpretación, decisiones de limpieza, conclusiones del informe) se redacta y defiende por el grupo; este panel es una herramienta de apoyo, no el informe.

## Referencias

- Ferenc, R., Tóth, Z., Ladányi, G., Siket, I., & Gyimóthy, T. (2020). *Unified Bug Dataset* (v1.2) [Conjunto de datos]. Zenodo. https://doi.org/10.5281/zenodo.3693686
- Shepperd, M., Song, Q., Sun, Z., & Mair, C. (2013). Data quality: Some comments on the NASA software defect datasets. *IEEE Transactions on Software Engineering, 39*(9), 1208–1215. https://doi.org/10.1109/TSE.2013.11
- McCabe, T. J. (1976). A complexity measure. *IEEE Transactions on Software Engineering, SE-2*(4), 308–320.
