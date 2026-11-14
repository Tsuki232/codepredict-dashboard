# Unified Bug Dataset v1.2 — solo el archivo que usa el panel

- **Archivo incluido:** `Unified-file.csv` (nivel archivo: 43 744 filas × 11 columnas, 7 163 994 bytes).
- **SHA-256 de este CSV:** `03c4a2733b93988d03454d4ac3cbb77ab54e02c14aea25c53c8f8f6b88617c1b`
- **Fuente:** Zenodo, https://zenodo.org/records/3693686 (DOI 10.5281/zenodo.3693686). Está dentro de `UnifiedBugDataset-1.2.zip` como `UnifiedBugDataset-1.2/Unified-file.csv`; se copió sin modificarlo (el SHA-256 coincide con el del miembro del ZIP original).
- **ZIP original:** 1 014 131 877 bytes; MD5 publicado en Zenodo `d7e7783fc365001003addac9ecb5e60d`. Contiene además los datos a nivel de clase y los de origen, que este panel no usa y por eso no se incluyen aquí.
- **Licencia (según la ficha de Zenodo):** Creative Commons Attribution 4.0 International (CC BY 4.0). Se permite redistribuir con atribución; la cita obligatoria está abajo. El resto del repositorio no hereda esa licencia.
- **Cita:** Ferenc, R., Tóth, Z., Ladányi, G., Siket, I., & Gyimóthy, T. (2020). *Unified Bug Dataset* (v1.2) [Conjunto de datos]. Zenodo. https://doi.org/10.5281/zenodo.3693686

**Regla del proyecto:** este archivo es de solo lectura. El panel nunca lo modifica ni escribe en `data/raw/`: la limpieza escribe en `data/work/codepredict/` (ignorado por git). Una prueba automática comprueba que su huella coincide con la de arriba.
