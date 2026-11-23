# CodePredict AI · Limpieza visual e inferencia

Panel del proyecto de **Estadística Inferencial y Ciencia de Datos** (tema del grupo: *t de Student*). Toma el
**Unified Bug Dataset** (nivel archivo, 43 744 filas), muestra **paso a paso y con conteos** cómo se limpia, deja que el grupo
elija las decisiones que dependen de su criterio y luego calcula la inferencia **en este equipo con Python, solo con la t de Student**.
**Ada** (motor con doble verificación) se usa únicamente para **perfilar y limpiar** la base de datos: en la estadística no interviene ni Ada ni ninguna IA.

Está construido sobre la plantilla *Estadística Data* (sistema de diseño «hoja de laboratorio», claro/oscuro, gráficas SVG propias).

## Qué hace

| Vista | Qué muestra | Cómo se comprueba |
|---|---|---|
| **Fuente y perfil** | Origen y huella SHA-256 del CSV, hallazgos de calidad (copias, rutas repetidas, valores imposibles, columnas constantes), distribución de `McCC` y `LOC` en escala log, tabla 2×2 cruda | Conteos con pandas y DuckDB |
| **Limpieza visual** | Embudo de 7 pasos con filas antes/después, histogramas antes-después con umbrales de atípicos, **las 9 combinaciones de decisiones** (rutas repetidas × atípicos) con su efecto en la tabla 2×2 y en Welch, guardado del conjunto limpio | Cada regla: filas quitadas por **pandas** (la ejecuta) y por una consulta **DuckDB** aparte; si difieren, no se guarda |
| **Cuaderno en vivo** | Estilo Colab: 14 celdas (cargar, 6 reglas, tabla 2×2, guardar, Welch, sensibilidad, χ², dos proporciones, Bayes) que se ejecutan una a una o todas desde cero. Cada celda muestra **el código real que ejecuta**, su salida, el contador `[n]`, el tiempo real y ejemplos de las filas que quitó. Reejecutar una celda deja desactualizadas las siguientes | Es el mismo código y las mismas verificaciones del panel; sin retardos artificiales |
| **Informe en vivo** | Un informe completo (datos, limpieza con tablas y gráficas, tabla 2×2, Welch, sensibilidad, χ², proporciones, Bayes, límites, declaración de IA y referencias) que **se recalcula solo** al cambiar las políticas de limpieza, α o la hipótesis alternativa, y se baja como **PDF** (botón «Descargar PDF» → diálogo de impresión → «Guardar como PDF»). Anexos descargables: CSV limpio, manifiesto y resultados en JSON | El texto sale de las cifras en pantalla (pruebas unitarias); la inferencia en vivo se calcula en Python (SciPy) y coincide con la del conjunto guardado (prueba) |
| **Inferencia** | **Solo la t de Student**, hecha para exponerla (ver abajo) | Fórmula a mano ↔ SciPy, prueba de permutación y neurona contrastada con Newton–Raphson |

### La vista Inferencia (t de Student, para exponer)

Es la misma prueba del informe entregado (**t de Welch**: una t de Student para dos medias sin suponer varianzas iguales), explicada en seis secciones animadas:

1. **La campana de la t.** Una distribución *continua*: la gráfica es una curva y las probabilidades son **áreas** (P(T = x) = 0). Se puede mover los grados de libertad (1–60, y los de los datos), ver las colas pesadas frente a la normal, la región de rechazo rayada y tocar la gráfica para ver P(T ≤ x).
2. **Dónde está la media de cada grupo.** Una campana t por grupo (con bug / sin bug) con su intervalo de confianza del 95 %, y la diferencia entre ellas; tabla con n, x̄, s, s/√n, gl y t crítico.
3. **La prueba paso a paso.** Hipótesis, diferencia de medias, error estándar, t, grados de libertad (Welch–Satterthwaite) y decisión, **con los números reales**, junto a la campana con la t observada; botón para «alejar» y ver dónde cae.
4. **Comprobación sin fórmulas.** Prueba de permutación: se barajan 2 000 veces las etiquetas con/sin bug (semilla fija, o una nueva) y se ve si la t real podría salir por azar. Es independiente de la fórmula de la t. Con 2 000 barajadas el menor valor p medible es 1/2 001, por eso se dice «p < 0,0005» y no «p = 0». La animación reproduce las barajadas que el servidor ya calculó.
5. **Predicción con una neurona.** Una regresión logística de una variable (log(1 + McCC) estandarizada), entrenada por descenso de gradiente (600 épocas, tasa 0,5, partición 80/20 con semilla 42), contrastada con Newton–Raphson (mismos w y b hasta 10⁻⁶) y evaluada con AUC y una tabla de calibración por tramos. Sirve para **priorizar** qué archivos revisar, no para decidir.
6. **Supuestos y límites** (normalidad de la media por el teorema central del límite, independencia, «significativo» no es «importante», asociación no es causa, datos anteriores a la IA generativa).

Rutas: `GET /api/tstudent` (α y alternativa), `/api/tstudent/permutacion`, `/api/tstudent/neurona`. Todo se calcula con NumPy y SciPy; las respuestas se guardan en memoria por huella SHA-256 del conjunto limpio. Requieren que la limpieza esté guardada.

### Reglas de limpieza (bitácora, Paso 4)

1. **Integridad:** faltantes, negativos, `LOC < LLOC`, `LOC ≤ 0` (en este CSV: 0 filas).
2. **Duplicados exactos** (las 11 columnas iguales): 4 filas.
3. **Rutas repetidas** (`LongName`): *decisión del grupo* — dejar la primera (por defecto, **provisional**), quitar todas o conservar todas.
4. **Columnas constantes:** `CLOC` (siempre 0).
5. **Atípicos extremos:** *decisión del grupo* — por defecto **solo se señalan** (quitar los archivos más complejos puede quitar la señal que se estudia); opciones Q3 + 3·RIC y percentil 99,9.
6. **Etiquetas fijadas de antemano** (no editables en la interfaz): defectuoso = `bug > 0`, complejo = `McCC > 10`.

Con las opciones por defecto: 43 744 → 43 744 → 43 740 → **32 509** filas (= número de rutas distintas).

## Informe

La carpeta [`informe/`](informe/LEEME.md) tiene la **sección de resultados** lista para pegar en el informe del grupo, en Word y en PDF, con sus figuras y cifras.

**Qué falta para completar el informe:** ver [`informe/PENDIENTE.txt`](informe/PENDIENTE.txt) (decisiones del grupo, discusión y conclusiones, el modelo predictivo que aún no existe, armado final y referencias por verificar).

## Ada: solo perfila y limpia

La puerta de enlace de Ada (`ada_gateway/`) sigue ofreciendo, por un túnel y con clave, el cálculo de perfil y limpieza, y rutas estadísticas para otros proyectos del grupo. **El panel ya no usa
ninguna ruta de lenguaje ni estadística de Ada**: la vista *Inferencia* no tiene asistente de IA. Cómo arrancar la puerta de enlace y configurarla: [`docs/ASISTENTE.md`](docs/ASISTENTE.md).

### Ada hace el perfil y la limpieza (y qué pasa si no está)

Si en tu equipo no está la carpeta de Ada pero tienes `ADA_REMOTE_URL` y `ADA_REMOTE_KEY` en el `.env`, **Ada hace el perfil y la limpieza en el PC del grupo que la corre**: lee el CSV de su copia,
calcula el perfil y limpia con cada regla verificada (pandas contra DuckDB). El panel solo manda las reglas de limpieza y muestra lo que recibe; si guardas la limpieza, el CSV limpio llega con su
tamaño y su huella SHA-256 comprobados y se guarda en **este** equipo (nunca en `data/raw`). Con el conjunto completo (43 744 filas → 32 509) todo es idéntico a hacerlo en local: perfil, vista previa y CSV limpio (mismo SHA-256).
La barra lateral dice «Ada: lista (API remota)». Si el CSV de Ada y el de este equipo no son el mismo archivo (huella distinta), el panel lo dice y no guarda nada.

**Si Ada no está disponible** (PC apagado, sin túnel, clave mala, servidor de Ada desactualizado), el panel abre un aviso: *«Ada no está disponible»*, con tres opciones: **usar el motor Python de este equipo**,
reintentar con Ada, o cerrar. Nunca cambia de motor en silencio.

- **Motor Python local:** la limpieza se calcula en este equipo (pandas y DuckDB), cada resultado por dos vías independientes. Lo que **no** tiene: el análisis de sensibilidad automático de Ada y su registro de auditoría.
  Todo resultado se rotula «Python local» y dice «sin Ada» en su sello de verificación. La barra lateral muestra «Motor: Python local (sin Ada)» y un botón **Volver a Ada**.
- **La estadística nunca depende de Ada:** la t de Student, el Informe en vivo y las celdas de inferencia del Cuaderno se calculan siempre en este equipo (NumPy y SciPy), con Ada encendida o apagada.
- `ADA_ENGINE=auto|local|remote` elige el motor de la limpieza: Ada en este equipo, la API o (con el aviso) Python local. Por defecto: Ada local si está la carpeta de Ada y, si no, la API.

## Datos

Este repositorio incluye **solo el archivo que usa el panel**: `data/raw/Unified-file.csv` (nivel archivo, 43 744 filas, 7 MB), tomado sin modificar del
[Unified Bug Dataset v1.2](https://doi.org/10.5281/zenodo.3693686) (Ferenc et al., 2020; licencia CC BY 4.0). Su origen, cita y huella SHA-256 están en
[`data/raw/SOURCE.md`](data/raw/SOURCE.md) y una prueba automática comprueba que el archivo no cambió. El ZIP completo (1 GB, con datos a nivel de clase y de origen) no se incluye:
si lo necesitas, bájalo de Zenodo.

**Para usarlo no hay que configurar nada:** clonas, ejecutas `.\scripts\run.ps1` y el panel lee ese CSV. Para analizar otro archivo con las mismas 11 columnas, crea un `.env` en la raíz con
`CODEPREDICT_DATASET=C:\ruta\al\otro.csv`.

## Requisitos y ejecución

Este panel usa **Ada para perfilar y limpiar**; la estadística la hace Python (NumPy y SciPy). En este equipo corre con el entorno de Ada (ya trae FastAPI, pandas, DuckDB, scipy y statsmodels).

```powershell
.\scripts\run.ps1          # abre http://127.0.0.1:8000
```

- Ada se busca en `..\Ada` (o en la variable `ADA_ROOT`). Tarda en cargar la primera vez (~20 s); el panel lo indica.
- El CSV de entrada es `data/raw/Unified-file.csv` (incluido en este repositorio, ver «Datos»); se puede cambiar con `CODEPREDICT_DATASET`.
- El conjunto limpio y su `manifest.json` se guardan en `data/work/codepredict/` de este repositorio (ignorado por git) o, si Ada está presente, en la carpeta de trabajo de Ada; también se puede cambiar con `CODEPREDICT_WORK`. **Nunca se escribe en `data/raw/` ni se modifica el CSV original** (hay pruebas que lo verifican con huellas SHA-256).
- Sin Ada en el equipo y sin la API configurada, el panel avisa «Ada no está disponible» y ofrece el motor Python local para la limpieza (ver arriba); nunca simula un resultado de Ada.
- **Equipo sin Ada (lo normal para los compañeros):** instala Python 3.12+ con `uv` y Node.js 20+, copia `.env.example` a `.env`, rellena `ADA_REMOTE_URL` y `ADA_REMOTE_KEY`, y ejecuta
  `.\scripts\install.ps1` (instala todo y compila) y después `.\scripts\run.ps1`. Con la API, la limpieza sale de Ada en otro PC (ese PC debe estar encendido) o, si eliges Python local, de este equipo; **la t de Student siempre sale de este equipo**.

Desarrollo con recarga: `uvicorn app.main:app --reload --app-dir backend` y, en `frontend/`, `npm run dev` (puerto 5173, con proxy a la API).

### Pruebas

```powershell
cd backend;  ..\..\Ada\.venv\Scripts\python.exe -m pytest -q     # 96 pruebas (cuaderno, inferencia en vivo, t de Student, CSV real, motor Python local contra Ada y Ada remota por la puerta de enlace real)
cd frontend; npm test                                              # 55 pruebas (contraste de colores, cifras, distribución t contra SciPy, texto del informe y aviso «Ada no disponible»)
# puerta de enlace de Ada (en la raíz):  ..\Ada\.venv\Scripts\python.exe -m pytest -q ada_gateway/tests    # 68 pruebas
cd ada_gateway\monitor; node --test                                # 8 pruebas del panel «Ada en vivo»
```

Las pruebas de backend usan 10 filas inventadas con trampas conocidas (copia exacta, ruta repetida, `LOC < LLOC`, atípico) y una tabla 2×2 de 100 archivos, **con todos los resultados calculados a mano** (χ² = 50/3, z = √(50/3), P(D|C) = 0,6, Welch recalculado con la fórmula de Welch–Satterthwaite). Las de la t de Student comprueban la fórmula a mano, los intervalos, las tres alternativas, la t clásica, la reproducibilidad de la permutación y la neurona contra la curva generada y contra scikit-learn.

## Estructura

```
backend/app/core/cleaning.py      reglas de limpieza, doble verificación pandas/DuckDB, perfil, impacto de políticas
backend/app/core/workspace.py     guardado del limpio + manifest + huellas + auditoría de Ada
backend/app/core/tstudent.py      t de Welch, permutación y neurona (NumPy y SciPy, sin Ada)
backend/app/core/analisis_t.py    t de Student sobre el conjunto limpio guardado (con caché por huella)
backend/app/core/pystats.py       motor estadístico local del Informe y el Cuaderno (Welch, χ², Fisher, proporciones, Bayes)
backend/app/core/inference.py     inferencia en vivo del Informe (+ comprobación robusta por rangos), en Python local
backend/app/core/ada_engine.py    motor de limpieza: Ada local, Ada remota o Python local (con aviso)
backend/app/adapters/api/routes.py  API: /api/dataset/profile, /api/clean/*, /api/tstudent*, /api/inference
frontend/src/views/               Fuente, Limpieza, Cuaderno, Inferencia, Informe
frontend/src/features/tstudent/   campana, medias, prueba paso a paso, permutación y neurona (SVG propio y animado)
frontend/src/features/charts/     LogHistogram, Funnel, Table2x2, Interval (SVG propio)
frontend/src/lib/tdist.ts         densidad y probabilidades de la t (verificadas contra SciPy)
```

## Límites honestos

- **Sensibilidad de Ada:** el análisis robusto automático de Ada (bootstrap n₁×n₂ y 20 000 permutaciones) no escala a decenas de miles de filas. Se añadió a Ada la opción `sensitivity=False` (por defecto sigue igual) y la comparación robusta (Mann-Whitney por rangos, con P(X>Y) e IC bootstrap) la calcula **este panel**, no Ada; la interfaz lo dice y la verifica por dos vías (scipy y fórmula de rangos).
- **Independencia:** tras «dejar la primera ruta» no quedan rutas repetidas, pero un mismo proyecto aporta muchos archivos; los p-valores siguen siendo optimistas. Con n ≈ 32 mil casi todo sale «significativo»: importa el tamaño del efecto.
- **Decisiones del grupo:** las dos decisiones de limpieza están marcadas como provisionales; la vista de impacto muestra qué cambia con cada una.
- **La neurona** usa una sola variable (la complejidad): sirve para priorizar, no para decidir, y no prueba causa.
- Es **asociación**, no causalidad, y solo código Java anterior a la IA generativa (no es código generado por IA).

## Declaración de uso de IA

Este panel (código, pruebas y textos de la interfaz) fue generado con asistencia de **Claude Code (Anthropic)** a petición de Diego López, a partir de la plantilla *Estadística Data*. **Ada** (motor de Diego López) se usa solo para perfilar y limpiar la base de datos; la estadística (t de Student, permutación, neurona, informe) se calcula en este equipo con Python (NumPy y SciPy), sin Ada ni ningún modelo de IA. Los resultados numéricos los producen scripts verificados, no la IA «a mano». Conforme a la regla del curso, **el grupo debe poder explicar cada línea y cada decisión**, y la parte analítica (hipótesis, interpretación, decisiones de limpieza, conclusiones del informe) se redacta y defiende por el grupo; este panel es una herramienta de apoyo, no el informe.

## Referencias

- Ferenc, R., Tóth, Z., Ladányi, G., Siket, I., & Gyimóthy, T. (2020). *Unified Bug Dataset* (v1.2) [Conjunto de datos]. Zenodo. https://doi.org/10.5281/zenodo.3693686
- Shepperd, M., Song, Q., Sun, Z., & Mair, C. (2013). Data quality: Some comments on the NASA software defect datasets. *IEEE Transactions on Software Engineering, 39*(9), 1208–1215. https://doi.org/10.1109/TSE.2013.11
- McCabe, T. J. (1976). A complexity measure. *IEEE Transactions on Software Engineering, SE-2*(4), 308–320.
