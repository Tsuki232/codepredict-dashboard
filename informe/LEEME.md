# Sección de resultados del informe

Archivos para pegar en el informe del grupo:

- `CodePredict_AI_Seccion_Resultados.docx` — versión en **Word** (editable; las 3 ecuaciones van como imagen, para editarlas use Insertar › Ecuación).
- `CodePredict_AI_Seccion_Resultados.pdf` — la misma sección en PDF (APA 7, 11 páginas, sin portada).
- `figuras/` — las 4 figuras en PNG (300 dpi) por si se quieren insertar aparte.
- `resultados_cifras.json` — todas las cifras de la sección, con las reglas y la huella SHA-256 del CSV usado.

**Qué es y qué no es.** Es un borrador de la parte de *Resultados*: describe lo que dicen los números. No incluye discusión ni conclusiones; eso lo redacta el grupo.
Las decisiones de limpieza (rutas repetidas: dejar la primera; atípicos: conservarlos), α = .05 y la hipótesis de dos colas son **provisionales** hasta que el grupo las confirme.
Tres referencias (Delacre et al., 2017; McCabe, 1976; Welch, 1947) se escribieron de memoria: verificar sus DOI antes de entregar.

**De dónde salen las cifras.** `resultados_cifras.py` usa el mismo código del panel (limpieza con doble verificación pandas/DuckDB e inferencia con Ada) y recalcula a mano las cifras principales; si el texto deja de ser cierto con otros datos o reglas, falla en lugar de escribir cifras dudosas.

**Regenerar.** Los archivos de `fuentes/` son copias de los que se ejecutan en el repositorio de Ada (`reports/informe_codepredict/`, donde están además `build.py` y el estilo APA del PDF):
`resultados_cifras.py` → `resultados_figuras.py` → `build.py --resultados` (PDF) → `exportar_word.py` (Word). Necesitan Ada y Microsoft Edge; no se pueden ejecutar solos desde esta carpeta.
