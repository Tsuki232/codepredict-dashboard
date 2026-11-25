"""«IA frente a personas»: compara el código escrito por personas con el generado por tres modelos, con los resultados AGREGADOS del artefacto de
Cotroneo, Improta y Liguori (2025, ISSRE; Zenodo 10.5281/zenodo.16853222, CC BY 4.0). Los datos salen de `app/datos/ia_cotroneo2025.json`, que genera
`scripts/preparar_datos_ia.py` leyendo el zip original y comprobando su huella MD5.

Aquí solo se calculan tasas (con su intervalo de Wilson al 95 %), razones frente a las personas y la d de Cohen de la complejidad ciclomática. No se hace
ninguna prueba de hipótesis entre fuentes: el artefacto trae resultados agregados, no las 507 044 muestras, y las cuatro versiones de cada función están
emparejadas (una prueba que ignore ese emparejamiento no sería válida).
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Any

RUTA = Path(__file__).resolve().parents[1] / "datos" / "ia_cotroneo2025.json"
Z95 = 1.959963984540054          # cuantil 0,975 de la normal estándar
ORDEN = ("human", "chatgpt", "dsc", "qwen")
LENGUAJES = {"java": "Java", "python": "Python"}

LIMITES = [
    "«Defecto» aquí es una alerta de una herramienta de análisis estático (PMD en Java, Pylint en Python), agrupada por tipo de defecto ODC; no es un error reportado por un usuario, como en la base principal del proyecto.",
    "El artefacto trae solo resultados agregados. Los 507 044 ejemplos completos no se descargaron, así que no se puede hacer una prueba emparejada por función: se comparan tasas con su intervalo de confianza, no valores p.",
    "Cada ejemplo es una función con cuatro versiones (la de la persona y la de cada modelo). La base principal usa archivos de proyectos de código abierto con errores reales: las dos bases miden cosas distintas y no se mezclan en una misma tabla.",
    "Java y Python usan herramientas distintas, con reglas distintas: las cifras se comparan dentro de cada lenguaje, nunca entre lenguajes.",
    "Las funciones de IA son más cortas que las de las personas; tener menos líneas deja menos espacio para alertas y puede explicar parte de su menor complejidad. Que haya menos alertas no equivale a que el código sea correcto.",
]


@lru_cache(maxsize=1)
def cargar() -> dict[str, Any]:
    if not RUTA.is_file():
        raise FileNotFoundError("Faltan los datos de IA: ejecuta scripts/preparar_datos_ia.py (necesita el zip del artefacto en data/external/ia_cotroneo_2025/).")
    return json.loads(RUTA.read_text(encoding="utf-8"))


def wilson(k: int, n: int, z: float = Z95) -> tuple[float, float]:
    """Intervalo de Wilson para una proporción k/n (mejor que el de Wald cuando la proporción está cerca de 0 o de 1)."""
    if n <= 0 or not 0 <= k <= n:
        raise ValueError("k debe estar entre 0 y n, con n > 0.")
    p = k / n
    d = 1 + z * z / n
    centro = (p + z * z / (2 * n)) / d
    mitad = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return centro - mitad, centro + mitad


def d_de_cohen(m1: float, s1: float, n1: int, m2: float, s2: float, n2: int) -> float:
    """Diferencia de medias en unidades de la desviación combinada: (m1 − m2) / s_p, con s_p² = ((n₁−1)s₁² + (n₂−1)s₂²) / (n₁+n₂−2)."""
    sp = math.sqrt(((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / (n1 + n2 - 2))
    return (m1 - m2) / sp


def _tasa(k: int, n: int) -> dict[str, Any]:
    lo, hi = wilson(k, n)
    return {"k": int(k), "n": int(n), "tasa": k / n, "ic95": [lo, hi]}


def _pct(x: float, dec: int = 1) -> str:
    return f"{x * 100:.{dec}f}".replace(".", ",") + " %"


def _num(x: float, dec: int = 2) -> str:
    return f"{x:.{dec}f}".replace(".", ",")


def _fuente(fid: str, d: dict[str, Any], n: int, nombres: dict[str, str]) -> dict[str, Any]:
    df, vu, co = d["defectos"], d["vulnerabilidades"], d["complejidad"]
    odc_total = sum(df["odc"].values()) or 1
    return {
        "id": fid, "nombre": nombres[fid], "es_persona": fid == "human",
        "defectos": {**_tasa(df["muestras_defectuosas"], n), "alertas": df["total"], "por_muestra_defectuosa": df["total"] / df["muestras_defectuosas"]},
        "vulnerabilidades": {**_tasa(vu["funciones"], n), "problemas": vu["problemas"], "cwe_distintos": vu["cwe_distintos"]},
        "complejidad": {k: co[k] for k in ("funciones", "CCN", "NLOC", "TOKEN_COUNT")},
        "odc": [{"tipo": t, "n": c, "parte": c / odc_total} for t, c in sorted(df["odc"].items(), key=lambda kv: -kv[1])],
        "top_reglas": df["top_reglas"], "top_cwe": vu["top_cwe"],
    }


def _contra_personas(fuentes: list[dict[str, Any]]) -> None:
    """Añade a cada modelo su diferencia con las personas (puntos porcentuales, razón de tasas, d de Cohen de la complejidad ciclomática)."""
    h = next(f for f in fuentes if f["es_persona"])
    for f in fuentes:
        if f["es_persona"]:
            f["vs_personas"] = None
            continue
        c1, c0 = f["complejidad"], h["complejidad"]
        f["vs_personas"] = {
            "defectos": {"dif_pp": (f["defectos"]["tasa"] - h["defectos"]["tasa"]) * 100, "razon": f["defectos"]["tasa"] / h["defectos"]["tasa"]},
            "vulnerabilidades": {"dif_pp": (f["vulnerabilidades"]["tasa"] - h["vulnerabilidades"]["tasa"]) * 100, "razon": f["vulnerabilidades"]["tasa"] / h["vulnerabilidades"]["tasa"]},
            "ccn": {"dif": c1["CCN"]["media"] - c0["CCN"]["media"], "razon": c1["CCN"]["media"] / c0["CCN"]["media"],
                    "d_cohen": d_de_cohen(c1["CCN"]["media"], c1["CCN"]["sd"], c1["funciones"], c0["CCN"]["media"], c0["CCN"]["sd"], c0["funciones"])},
            "nloc": {"razon": c1["NLOC"]["media"] / c0["NLOC"]["media"]},
        }


def _lectura(nombre: str, fuentes: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Frases descriptivas generadas de los propios datos (quién tuvo la tasa más alta y la más baja); no afirman causas."""
    h = next(f for f in fuentes if f["es_persona"])
    out = []
    for clave, etiqueta in (("defectos", "muestras con alertas de defectos"), ("vulnerabilidades", "funciones con alertas de seguridad")):
        orden = sorted(fuentes, key=lambda f: f[clave]["tasa"])
        lo, hi = orden[0], orden[-1]
        out.append({"metrica": clave, "texto": f"{nombre} · {etiqueta}: la tasa más baja fue la de {lo['nombre']} ({_pct(lo[clave]['tasa'])}) y la más alta la de {hi['nombre']} "
                                               f"({_pct(hi[clave]['tasa'])}); las personas, {_pct(h[clave]['tasa'])}."})
    orden = sorted(fuentes, key=lambda f: f["complejidad"]["CCN"]["media"])
    lo, hi = orden[0], orden[-1]
    out.append({"metrica": "complejidad", "texto": f"{nombre} · complejidad ciclomática media por función: {lo['nombre']} {_num(lo['complejidad']['CCN']['media'])} frente a "
                                                    f"{hi['nombre']} {_num(hi['complejidad']['CCN']['media'])}; las personas, {_num(h['complejidad']['CCN']['media'])}."})
    return out


def comparativa(datos: dict[str, Any] | None = None) -> dict[str, Any]:
    datos = datos or cargar()
    meta = datos["meta"]
    nombres = meta["fuentes"]
    lenguajes = {}
    for lid, ld in datos["lenguajes"].items():
        fuentes = [_fuente(fid, ld["fuentes"][fid], ld["muestras"], nombres) for fid in ORDEN]
        _contra_personas(fuentes)
        tipos = sorted({o["tipo"] for f in fuentes for o in f["odc"]}, key=lambda t: -sum(o["n"] for f in fuentes for o in f["odc"] if o["tipo"] == t))
        lenguajes[lid] = {
            "id": lid, "nombre": LENGUAJES[lid], "muestras": ld["muestras"], "repositorios": ld["repositorios"],
            "herramienta_defectos": meta["herramientas"][f"defectos_{lid}"], "herramienta_seguridad": meta["herramientas"]["vulnerabilidades"],
            "fuentes": fuentes, "odc_tipos": tipos, "lectura": _lectura(LENGUAJES[lid], fuentes),
        }
    cita = f"{', '.join(meta['autores'])} ({meta['anio']}). {meta['titulo']}. {meta['congreso']}. arXiv:{meta['arxiv']}."
    return {"meta": {**{k: meta[k] for k in ("titulo", "autores", "anio", "congreso", "arxiv", "licencia", "descargado", "md5_zip", "nota")},
                     "zenodo": meta["zenodo_artefacto"], "cita": cita, "fuentes": nombres},
            "limites": LIMITES, "lenguajes": lenguajes}
