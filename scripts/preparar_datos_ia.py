"""Extrae los resultados agregados del artefacto de Cotroneo, Improta y Liguori (2025) a un JSON pequeño que usa el sistema.

Artefacto: «Human-Written vs. AI-Generated Code: A Large-Scale Study of Defects, Vulnerabilities, and Complexity» (ISSRE 2025),
Zenodo 10.5281/zenodo.16853222, licencia CC BY 4.0. El zip (68 MB) NO se sube a git: vive en data/external/ (ignorado).

Uso:  python scripts/preparar_datos_ia.py [ruta_al_zip]
Escribe backend/app/datos/ia_cotroneo2025.json. Solo lee texto del zip (no extrae ni ejecuta nada de lo que trae).
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
ZIP = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ / "data" / "external" / "ia_cotroneo_2025" / "Human_vs_AI_Code_Quality_Artifact.zip"
SALIDA = RAIZ / "backend" / "app" / "datos" / "ia_cotroneo2025.json"
MD5_PUBLICADO = "52e11ee0b6c5aefebab5c375d49231e4"
FUENTES = ("human", "chatgpt", "dsc", "qwen")


def _bloque(texto: str, encabezado: str) -> list[tuple[str, int]]:
    """Líneas «  - Nombre: n» que siguen a un encabezado, hasta la primera línea que ya no lo es."""
    i = texto.find(encabezado)
    if i < 0:
        return []
    out: list[tuple[str, int]] = []
    for ln in texto[i + len(encabezado):].splitlines()[1:]:
        m = re.match(r"^\s*-\s*(.+?):\s*(\d+)\s*$", ln)
        if m:
            out.append((m.group(1), int(m.group(2))))
        elif out:
            break
    return out


def _defectos(t: str) -> dict:
    g = lambda pat: re.search(pat, t)  # noqa: E731
    return dict(
        total=int(g(r"Total number of defects:\s*(\d+)").group(1)),
        muestras_defectuosas=int(g(r"Total number of defective samples:\s*(\d+)").group(1)),
        por_muestra=float(g(r"Average number of defects per sample:\s*([\d.]+)").group(1)),
        odc=dict(_bloque(t, "Total defects divided per ODC Defect Type:")),
        top_reglas=[dict(regla=a, n=b) for a, b in _bloque(t, "Top 10 defects:")])


def _seguridad(t: str) -> dict:
    g = lambda pat: re.search(pat, t)  # noqa: E731
    top: list[dict] = []
    i = t.find("Top 10 CWEs")
    for ln in t[i:].splitlines()[1:]:
        m = re.match(r"^\s*\d+\.\s*(CWE-\d+)(?::\s*(.+?))?:\s*(\d+)\s*$", ln)
        if m:
            top.append(dict(cwe=m.group(1), nombre=m.group(2), n=int(m.group(3))))
        elif top:
            break
    return dict(
        funciones=int(g(r"Total (?:defective|vulnerable) functions \(excluding errors\):\s*(\d+)").group(1)),
        problemas=int(g(r"Total issues .*?:\s*(\d+)").group(1)),
        cwe_distintos=int(g(r"Final Unified CWE Set \(without duplicates\):\s*(\d+)").group(1)),
        top_cwe=top)


def _complejidad(t: str) -> dict:
    out: dict = {}
    for bloque in re.split(r"(?m)^(?=Stats for |Aggregated Stats)", t):
        m = re.match(r"Stats for (\w+?)_code \((\d+) functions\):", bloque)
        if not m:
            continue
        d: dict = {"funciones": int(m.group(2))}
        for nombre, media, mn, mx, sd in re.findall(
                r"(?m)^\s*(NLOC|CCN|TOKEN_COUNT|FUNCTION_NAME_LENGTH)\s*\|\s*Avg:\s*([\d.]+)\s*\|\s*Min:\s*(\d+)\s*\|\s*Max:\s*(\d+)\s*\|\s*Std:\s*([\d.]+)", bloque):
            d[nombre] = dict(media=float(media), min=int(mn), max=int(mx), sd=float(sd))
        out[m.group(1).lower()] = d
    return out


def main() -> None:
    md5 = hashlib.md5(ZIP.read_bytes()).hexdigest()
    assert md5 == MD5_PUBLICADO, f"la huella MD5 del zip ({md5}) no coincide con la publicada en Zenodo"
    z = zipfile.ZipFile(ZIP)
    leer = lambda ruta: z.read(ruta).decode("utf-8", "replace")  # noqa: E731
    nombres = z.namelist()
    readme = leer("README.txt")
    m = re.search(r"Python dataset \(.*?\) contains ([\d,]+) samples, while the Java dataset \(.*?\) contains ([\d,]+) samples", readme)
    muestras = {"python": int(m.group(1).replace(",", "")), "java": int(m.group(2).replace(",", ""))}
    lenguajes = {}
    for leng in ("java", "python"):
        fuentes: dict = {k: {} for k in FUENTES}
        for ruta in nombres:
            r = re.fullmatch(rf"6_Results/{leng}/defects/(?:Java|Python)_(\w+)\.txt", ruta, re.I)
            if r and r.group(1).lower() in FUENTES:
                fuentes[r.group(1).lower()]["defectos"] = _defectos(leer(ruta))
            r = re.fullmatch(rf"6_Results/{leng}/vulnerabilities/(?:Java|Python)_Security_(\w+)\.txt", ruta, re.I)
            if r and r.group(1).lower() in FUENTES:
                fuentes[r.group(1).lower()]["vulnerabilidades"] = _seguridad(leer(ruta))
        comp = _complejidad(leer(f"6_Results/{leng}/complexity/{leng.capitalize()}_COMPLEXITY.txt"))
        for k in FUENTES:
            fuentes[k]["complejidad"] = comp[k]
        stats = leer(f"6_Results/{leng}/complexity/{leng.capitalize()}_dataset_stats.txt")
        lenguajes[leng] = dict(
            muestras=muestras[leng], repositorios=int(re.search(r"repositories:\s*(\d+)", stats).group(1)),
            tokens_docstring=float(re.search(r"docstring length \(in tokens\):\s*([\d.]+)", stats).group(1)), fuentes=fuentes)
        for k in FUENTES:
            assert set(fuentes[k]) == {"defectos", "vulnerabilidades", "complejidad"}, f"falta algo en {leng}/{k}: {set(fuentes[k])}"
    datos = dict(
        meta=dict(
            titulo="Human-Written vs. AI-Generated Code: A Large-Scale Study of Defects, Vulnerabilities, and Complexity",
            autores=["Domenico Cotroneo", "Cristina Improta", "Pietro Liguori"], anio=2025, congreso="ISSRE 2025", arxiv="2508.21634",
            zenodo_artefacto="10.5281/zenodo.16853222", zenodo_datos_completos="https://zenodo.org/records/15423067", licencia="CC BY 4.0",
            md5_zip=md5, descargado="2026-11-23",
            fuentes={"human": "Personas (GitHub)", "chatgpt": "ChatGPT (gpt-3.5-turbo)", "dsc": "DeepSeek-Coder 33B", "qwen": "Qwen2.5-Coder 32B"},
            herramientas=dict(defectos_java="PMD", defectos_python="Pylint", vulnerabilidades="Semgrep", complejidad="Lizard (CCN y NLOC)"),
            nota="Los defectos son alertas de análisis estático agrupadas por tipo de defecto ODC, no errores reportados. Cada muestra tiene las cuatro versiones (personas y tres IA)."),
        lenguajes=lenguajes)
    # comprobaciones contra lo ya leído a mano en los archivos originales
    assert lenguajes["java"]["fuentes"]["human"]["defectos"]["muestras_defectuosas"] == 76049 and lenguajes["java"]["muestras"] == 221795
    assert lenguajes["java"]["fuentes"]["human"]["defectos"]["total"] == 202129
    assert abs(lenguajes["java"]["fuentes"]["human"]["complejidad"]["CCN"]["media"] - 3.48) < 1e-9
    assert lenguajes["python"]["muestras"] == 285249 and lenguajes["java"]["fuentes"]["human"]["vulnerabilidades"]["funciones"] == 6660
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"escrito {SALIDA.relative_to(RAIZ)} ({SALIDA.stat().st_size / 1024:.0f} KB) · MD5 del zip verificado")
    for leng, d in lenguajes.items():
        for k in FUENTES:
            f = d["fuentes"][k]
            print(f"  {leng:6s} {k:8s} defectuosas {f['defectos']['muestras_defectuosas'] / d['muestras'] * 100:5.2f} %  "
                  f"vulnerables {f['vulnerabilidades']['funciones'] / d['muestras'] * 100:5.2f} %  CCN {f['complejidad']['CCN']['media']:.2f}  "
                  f"ODC {len(f['defectos']['odc'])} tipos · reglas {len(f['defectos']['top_reglas'])} · CWE {len(f['vulnerabilidades']['top_cwe'])}")


if __name__ == "__main__":
    main()
