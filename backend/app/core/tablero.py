"""Cifras descriptivas del tablero estadístico: embudo de limpieza, distribución de la complejidad (McCC) en archivos con y sin bug, riesgo por tramo,
tabla 2×2 con probabilidades (condicional, Bayes, independencia) y una nube de puntos. Todo sale del conjunto limpio y guardado, sin Ada ni ninguna IA.

La t de Welch, la permutación y la neurona viven en `analisis_t.py`; el tablero las pide aparte para no repetirlas aquí.
"""
from __future__ import annotations

import math
from functools import lru_cache
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats

from app.core import workspace
from app.core.ia_comparativa import Z95, wilson

SEMILLA = 42
# Tramos de McCC (enteros). «compleja» es McCC > 10, así que el corte 10 | 11 coincide con el umbral por defecto del proyecto.
TRAMOS: list[tuple[float, float, str]] = [
    (1, 1, "1"), (2, 2, "2"), (3, 3, "3"), (4, 4, "4"), (5, 5, "5"), (6, 7, "6–7"), (8, 9, "8–9"), (10, 10, "10"),
    (11, 15, "11–15"), (16, 20, "16–20"), (21, 30, "21–30"), (31, 50, "31–50"), (51, math.inf, "51 o más"),
]
_BORDES = np.array([t[0] for t in TRAMOS], float)
PUNTOS_NUBE = 700


def _tramo(x: np.ndarray) -> np.ndarray:
    return np.clip(np.digitize(x, _BORDES) - 1, 0, len(TRAMOS) - 1)


def _rho(a: np.ndarray, b: np.ndarray) -> float | None:
    """Spearman; None si una de las dos columnas es constante (no hay correlación que medir y NaN rompería el JSON)."""
    if np.ptp(a) == 0 or np.ptp(b) == 0:
        return None
    return float(stats.spearmanr(a, b).statistic)


def _resumen(x: np.ndarray) -> dict[str, Any]:
    q1, med, q3 = (float(v) for v in np.quantile(x, [0.25, 0.5, 0.75]))
    iqr = q3 - q1
    return {"n": int(x.size), "media": float(x.mean()), "sd": float(x.std(ddof=1)), "mediana": med, "q1": q1, "q3": q3,
            "bigote_bajo": float(x[x >= q1 - 1.5 * iqr].min()), "bigote_alto": float(x[x <= q3 + 1.5 * iqr].max()),
            "maximo": float(x.max()), "atipicos": int(np.sum(x > q3 + 1.5 * iqr))}


def _tabla(frame: pd.DataFrame, man: dict[str, Any]) -> dict[str, Any]:
    c, d = frame["compleja"].to_numpy() == 1, frame["defectuoso"].to_numpy() == 1
    n11, n10, n01, n00 = int(np.sum(c & d)), int(np.sum(c & ~d)), int(np.sum(~c & d)), int(np.sum(~c & ~d))
    n = n11 + n10 + n01 + n00
    p_d, p_c = (n11 + n01) / n, (n11 + n10) / n
    p_d_c, p_d_nc = n11 / (n11 + n10), n01 / (n01 + n00)
    p_c_d_bayes = p_d_c * p_c / p_d                                     # Bayes: P(C|D) = P(D|C)·P(C) / P(D)
    se_log_or = math.sqrt(1 / n11 + 1 / n10 + 1 / n01 + 1 / n00)
    o_r = n11 * n00 / (n10 * n01)
    t2 = man.get("table2x2") or {}
    return {
        "celdas": {"C_D": n11, "C_ND": n10, "NC_D": n01, "NC_ND": n00}, "n": n,
        "coincide_manifiesto": bool(t2) and (t2.get("C_D"), t2.get("C_ND"), t2.get("NC_D"), t2.get("NC_ND")) == (n11, n10, n01, n00),
        "p_d": p_d, "p_c": p_c, "p_d_dado_c": p_d_c, "p_d_dado_nc": p_d_nc,
        "total_probabilidad": p_d_c * p_c + p_d_nc * (1 - p_c),          # P(D) = P(D|C)P(C) + P(D|¬C)P(¬C): debe valer lo mismo que p_d
        "p_c_dado_d": p_c_d_bayes, "p_c_dado_d_directa": n11 / (n11 + n01),
        "bayes_coincide": bool(abs(p_c_d_bayes - n11 / (n11 + n01)) < 1e-12),
        "razon_de_riesgo": p_d_c / p_d_nc,
        "odds_ratio": o_r, "or_ic95": [math.exp(math.log(o_r) - Z95 * se_log_or), math.exp(math.log(o_r) + Z95 * se_log_or)],
        "dependientes": bool(abs(p_d_c - p_d) > 1e-12),                 # si P(D|C) ≠ P(D), los sucesos «compleja» y «con bug» no son independientes
    }


@lru_cache(maxsize=4)
def _tablero(sha: str) -> dict[str, Any]:
    frame, man = workspace.load_clean()
    x, d = frame["McCC"].to_numpy(float), frame["defectuoso"].to_numpy(int)
    con, sin = x[d == 1], x[d == 0]
    if con.size < 2 or sin.size < 2:
        raise ValueError("Cada grupo necesita al menos 2 archivos: revisa las reglas de limpieza.")
    idx_t = _tramo(x)

    histograma, riesgo = [], []
    for i, (lo, hi, etiqueta) in enumerate(TRAMOS):
        en = idx_t == i
        n_con, n_sin = int(np.sum(en & (d == 1))), int(np.sum(en & (d == 0)))
        histograma.append({"tramo": etiqueta, "desde": lo, "hasta": None if math.isinf(hi) else hi, "con_bug": n_con, "sin_bug": n_sin,
                           "parte_con_bug": n_con / con.size, "parte_sin_bug": n_sin / sin.size})
        n = n_con + n_sin
        if n:
            lo_ic, hi_ic = wilson(n_con, n)
            riesgo.append({"tramo": etiqueta, "n": n, "con_bug": n_con, "tasa": n_con / n, "ic95": [lo_ic, hi_ic]})

    rng = np.random.default_rng(SEMILLA)
    sel = np.sort(rng.choice(len(frame), size=min(PUNTOS_NUBE, len(frame)), replace=False))
    loc = frame["LOC"].to_numpy(float)
    pasos = [{"id": s["id"], "etiqueta": s["label"], "antes": int(s["before"]), "despues": int(s["after"]), "quitadas": int(s["removed"])} for s in man["steps"]]
    return {
        "meta": {"sha256": man["output"]["sha256"], "filas": int(len(frame)), "creado": man["created_utc"], "umbral_compleja": man["rules"]["mccc_threshold"],
                 "filas_originales": int(man["input"]["rows"])},
        "kpis": {"filas": int(len(frame)), "con_bug": int(d.sum()), "tasa_bug": float(d.mean()), "media_mccc": float(x.mean()), "mediana_mccc": float(np.median(x)),
                 "maximo_mccc": float(x.max()), "complejas": int(frame["compleja"].sum()), "tasa_compleja": float(frame["compleja"].mean())},
        "embudo": pasos,
        "cajas": {"con_bug": _resumen(con), "sin_bug": _resumen(sin)},
        "histograma": histograma, "riesgo": riesgo,
        "tabla": _tabla(frame, man),
        "correlacion": {"mccc_loc": _rho(x, loc), "mccc_bug": _rho(x, d.astype(float)),
                        "nota": "Spearman (por rangos). McCC y LOC son casi redundantes: el modelo con una sola variable ya usa casi toda la información."},
        "nube": {"semilla": SEMILLA, "n": int(sel.size), "de": int(len(frame)), "puntos": [{"mccc": float(x[i]), "loc": float(loc[i]), "bug": int(d[i])} for i in sel]},
    }


def tablero() -> dict[str, Any]:
    man = workspace.read_manifest()
    if man is None:
        raise FileNotFoundError("Todavía no hay un conjunto limpio guardado. Aplica la limpieza primero.")
    workspace.load_clean()           # comprueba la huella del archivo antes de usar la caché
    return _tablero(man["output"]["sha256"])


def limpiar_cache() -> None:
    _tablero.cache_clear()
