"""Inferencia sobre el conjunto limpio GUARDADO, calculada por Ada (cada prueba con doble verificación independiente).

Hipótesis de trabajo (la decide el grupo; aquí solo se calculan):
  · Welch:    media de McCC en archivos defectuosos (bug > 0) frente a no defectuosos.
  · χ² y z de dos proporciones: relación entre «compleja» (McCC > 10) y «defectuoso» en la tabla 2×2.
  · Bayes:    P(defectuoso | compleja) a partir de los conteos de ESTA muestra.

Ada recibe aquí todas las filas. Su análisis de sensibilidad automático (bootstrap n₁×n₂, 20 000 permutaciones) no escala a decenas de
miles de filas, así que se desactiva (`sensitivity=False`) y la comprobación robusta la hace este módulo con métodos de rangos O(n log n),
etiquetada como tal: NO la hace Ada.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats

from app.core import ada_engine, cleaning, config, workspace

N_BOOT_ROBUST = 1000
SEED = 42


def _jsonable(o: Any) -> Any:
    if isinstance(o, dict):
        return {str(k): _jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_jsonable(v) for v in o]
    if isinstance(o, (np.floating, float)):
        return float(o) if math.isfinite(float(o)) else None
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.bool_):
        return bool(o)
    return o


def _group_stats(a: np.ndarray) -> dict[str, float | int]:
    return {"n": int(a.size), "mean": float(a.mean()), "sd": float(a.std(ddof=1)), "median": float(np.median(a)),
            "q1": float(np.quantile(a, 0.25)), "q3": float(np.quantile(a, 0.75)), "max": float(a.max())}


def _prob_superiority(x: np.ndarray, y: np.ndarray) -> float:
    """P(X>Y) + ½·P(X=Y) por rangos promedio (O(n log n)): (R₁ − n₁(n₁+1)/2) / (n₁n₂)."""
    n1, n2 = x.size, y.size
    r = stats.rankdata(np.concatenate([x, y]))
    return float((r[:n1].sum() - n1 * (n1 + 1) / 2) / (n1 * n2))


def robust_companion(x: np.ndarray, y: np.ndarray, alternative: str, alpha: float) -> dict[str, Any]:
    """Mann-Whitney asintótico + probabilidad de superioridad con IC bootstrap. Doble método: scipy (U) y fórmula de rangos."""
    n1, n2 = x.size, y.size
    mw = stats.mannwhitneyu(x, y, alternative=alternative, method="asymptotic")
    ph_rank = _prob_superiority(x, y)
    ph_u = float(mw.statistic / (n1 * n2))
    rng = np.random.default_rng(SEED)
    boots = np.empty(N_BOOT_ROBUST)
    for i in range(N_BOOT_ROBUST):
        boots[i] = _prob_superiority(x[rng.integers(0, n1, n1)], y[rng.integers(0, n2, n2)])
    lo, hi = np.percentile(boots, [alpha / 2 * 100, (1 - alpha / 2) * 100])
    p = float(mw.pvalue)
    return {
        "test": "U de Mann-Whitney (asintótica, con corrección por empates)", "statistic": float(mw.statistic), "p_value": p,
        "effect_size": {"name": "probabilidad de superioridad P(X>Y)+½P(X=Y)", "value": ph_rank,
                        "interpretation": "0.5 = sin efecto"},
        "ci": {"level": 1 - alpha, "of": f"P(X>Y) (bootstrap percentil, {N_BOOT_ROBUST} remuestreos, semilla {SEED})", "low": float(lo), "high": float(hi)},
        "verified": bool(math.isclose(ph_rank, ph_u, rel_tol=1e-12, abs_tol=1e-12)),
        "verification_methods": ["scipy.stats.mannwhitneyu (U / n₁n₂)", "fórmula de rangos promedio (R₁ − n₁(n₁+1)/2)/(n₁n₂)"],
        "discrepancy": abs(ph_rank - ph_u), "decision": _decision(p, alpha),
        "computed_by": "dashboard (no Ada): la sensibilidad automática de Ada no escala a este tamaño",
    }


def _decision(p: float, alpha: float) -> str:
    return f"Se rechaza H0 (p = {p:.4g} < α = {alpha})." if p < alpha else f"No se rechaza H0 (p = {p:.4g} ≥ α = {alpha})."


def _ada_two_groups(inf, x: np.ndarray, y: np.ndarray, alternative: str, alpha: float) -> dict[str, Any]:
    res = inf.compare_two_groups(x, y, method="welch", alternative=alternative, alpha=alpha, sensitivity=False)
    out = inf.compact_result(res)
    out["assumptions"] = res.get("assumptions")
    out["discrepancy"] = res.get("discrepancy")
    out["method_requested"] = res.get("method_requested")
    return out


@lru_cache(maxsize=8)
def _cached(sha: str, alpha: float, alternative: str) -> dict[str, Any]:
    frame, man = workspace.load_clean()
    return _compute(frame, man["rules"], alpha, alternative,
                    {"sha256": man["output"]["sha256"], "created_utc": man["created_utc"], "source": "guardado"})


def _compute(frame: pd.DataFrame, rules: dict[str, Any], alpha: float, alternative: str, meta_extra: dict[str, Any]) -> dict[str, Any]:
    """Toda la inferencia sobre un DataFrame ya etiquetado (`defectuoso`, `compleja`). Sirve igual para el conjunto guardado y para la vista en vivo."""
    ada = ada_engine.require()
    inf, prob = ada.inference, ada.probability
    x = frame.loc[frame["defectuoso"] == 1, "McCC"].to_numpy(float)
    y = frame.loc[frame["defectuoso"] == 0, "McCC"].to_numpy(float)
    if x.size < 2 or y.size < 2:
        raise ValueError("Cada grupo necesita al menos 2 archivos: revisa las reglas de limpieza.")

    tab = cleaning.table2x2(frame)
    n_c, n_nc = tab["C_D"] + tab["C_ND"], tab["NC_D"] + tab["NC_ND"]
    n_d, n = tab["C_D"] + tab["NC_D"], len(frame)
    matrix = [[tab["C_D"], tab["C_ND"]], [tab["NC_D"], tab["NC_ND"]]]

    welch = _ada_two_groups(inf, x, y, alternative, alpha)
    welch_log = _ada_two_groups(inf, np.log1p(x), np.log1p(y), alternative, alpha)
    robust = robust_companion(x, y, alternative, alpha)
    chi = inf.compact_result(inf.chi_square_independence(matrix, alpha=alpha))
    two_p = inf.compact_result(inf.two_proportions([tab["C_D"], tab["NC_D"]], [n_c, n_nc], alpha=alpha))
    ev_d = {"column": "bug", "op": ">", "value": rules["bug_threshold"]}
    ev_c = {"column": "McCC", "op": ">", "value": rules["mccc_threshold"]}
    bayes = prob.compact_probability(prob.run_probability("bayes", df=frame, A=ev_d, B=ev_c))

    p_d_c, p_d_nc = tab["C_D"] / n_c, tab["NC_D"] / n_nc
    repeated = int(frame.duplicated(subset=["LongName"], keep="first").sum())
    hist = cleaning.log_hist({"defectuosos": x, "sin_defecto": y})
    out = {
        "meta": {"alpha": alpha, "alternative": alternative, "rows": n, "rules": rules, "ada": ada_engine.status(), **meta_extra},
        "groups": {"defectuosos": _group_stats(x), "sin_defecto": _group_stats(y)},
        "table2x2": tab,
        "probabilities": {"p_d": n_d / n, "p_c": n_c / n, "p_d_given_c": p_d_c, "p_d_given_nc": p_d_nc, "p_c_given_d": tab["C_D"] / n_d,
                          "risk_diff": p_d_c - p_d_nc, "risk_ratio": p_d_c / p_d_nc if p_d_nc else None},
        "welch": welch, "welch_log": welch_log, "robust": robust,
        "chi_square": chi, "two_proportions": two_p, "bayes": bayes,
        "independence": {"repeated_path_rows": repeated, "note": (
            "No quedan rutas repetidas: las filas son archivos distintos (aun así, un mismo proyecto aporta muchos archivos)." if repeated == 0 else
            f"Quedan {repeated} filas con ruta repetida: las observaciones no son independientes y los p-valores son optimistas.")},
        "hist": hist,
    }
    return _jsonable(out)


def run(alpha: float = 0.05, alternative: str = "two-sided") -> dict[str, Any]:
    if alternative not in ("two-sided", "greater", "less"):
        raise ValueError("alternative debe ser two-sided, greater o less")
    if not 0 < alpha < 1:
        raise ValueError("alpha debe estar en (0, 1)")
    man = workspace.read_manifest()
    if man is None:
        raise FileNotFoundError("Todavía no hay un conjunto limpio guardado. Aplica la limpieza primero.")
    workspace.load_clean()  # comprueba la huella antes de usar la caché
    return _cached(man["output"]["sha256"], float(alpha), alternative)


@lru_cache(maxsize=16)
def _live_cached(rules_json: str, source_key: str, alpha: float, alternative: str) -> dict[str, Any]:
    rules = cleaning.Rules.model_validate_json(rules_json)
    raw = cleaning.load_raw(config.dataset_path())
    res = cleaning.run_pipeline(raw, rules, verify=True)
    if not res.verified:
        raise ValueError("Alguna regla no coincide entre pandas y DuckDB: no se calcula la inferencia.")
    created = datetime.now(timezone.utc).isoformat(timespec="seconds")
    out = _compute(res.frame, rules.model_dump(), alpha, alternative, {"sha256": None, "created_utc": created, "source": "vista en vivo (sin guardar)"})
    man = workspace.read_manifest()
    out["meta"]["matches_saved"] = bool(man and man["rules"] == rules.model_dump())
    return out


def run_live(rules: cleaning.Rules, alpha: float = 0.05, alternative: str = "two-sided") -> dict[str, Any]:
    """Inferencia sobre las reglas que hay EN PANTALLA (sin guardar nada): es lo que alimenta el informe en vivo."""
    if alternative not in ("two-sided", "greater", "less"):
        raise ValueError("alternative debe ser two-sided, greater o less")
    if not 0 < alpha < 1:
        raise ValueError("alpha debe estar en (0, 1)")
    if ada_engine.process_remote():     # Ada hace la limpieza y la inferencia completas en su equipo; aquí solo se muestran
        from app.core import ada_proceso

        return ada_proceso.inferencia(rules, alpha, alternative)
    p = config.dataset_path()
    # La clave incluye la huella rápida del archivo (tamaño y fecha) para no usar resultados de otro CSV.
    return _live_cached(rules.model_dump_json(), f"{p}:{p.stat().st_size}:{p.stat().st_mtime_ns}", float(alpha), alternative)
