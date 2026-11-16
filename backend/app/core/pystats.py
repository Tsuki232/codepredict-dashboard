"""Motor estadístico LOCAL en Python (sin Ada): lo que el panel usa cuando Ada no está disponible y la persona elige seguir con Python.

Tiene la MISMA forma que los módulos de Ada (`inference`, `probability`), así que `inference._compute` y el cuaderno no cambian. Cada resultado se calcula
por dos vías independientes (SciPy y la fórmula a mano) y `verified` solo es verdadero si coinciden. Es más pequeño que Ada a propósito: solo ofrece
lo que el panel necesita (Welch, χ² de independencia, dos proporciones y Bayes desde los datos) y no hace análisis de sensibilidad automático.
Todo resultado de este módulo lleva en `verification_methods` el aviso «motor local de Python» para que nadie lo confunda con el de Ada.
"""
from __future__ import annotations

import math
from fractions import Fraction
from types import SimpleNamespace
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats

MOTOR = "motor local de Python (SciPy + fórmulas a mano), sin Ada"
_COMPACT_KEYS = ["analysis", "test", "statistic", "df", "p_value", "alpha", "effect_size", "ci", "estimate", "rationale", "warnings", "decision", "verified",
                 "verification_methods", "n", "descriptives", "proportions", "expected_min", "cells_expected_lt_5", "statistic_name", "method_requested"]


def _arr(x: Any, name: str) -> np.ndarray:
    a = np.asarray(x, dtype=float).ravel()
    a = a[np.isfinite(a)]
    if a.size < 2:
        raise ValueError(f"{name}: se necesitan al menos 2 valores numéricos válidos (hay {a.size}).")
    return a


def _agree(a: float, b: float, tol: float = 1e-8) -> bool:
    return bool(np.isfinite(a) and np.isfinite(b) and abs(a - b) <= tol * max(1.0, abs(a), abs(b)))


def _verdict(p: float, alpha: float) -> str:
    return f"Se rechaza H0 (p = {p:.4g} < α = {alpha})." if p < alpha else f"No se rechaza H0 (p = {p:.4g} ≥ α = {alpha})."


def _interp_d(d: float) -> str:
    a = abs(d)
    return "insignificante" if a < 0.2 else "pequeño" if a < 0.5 else "mediano" if a < 0.8 else "grande"


def _normal_info(a: np.ndarray) -> tuple[bool, dict[str, Any]]:
    """Normalidad como en Ada: Shapiro-Wilk; con n ≥ 50 se tolera por el TLC si la asimetría es moderada."""
    n = a.size
    if n < 3:
        return False, {"n": int(n), "shapiro_p": None, "skew": None, "ok": False, "note": "n < 3: no evaluable"}
    p = float(stats.shapiro(a[:5000]).pvalue)
    sk = float(stats.skew(a))
    ok = p >= 0.05 or (n >= 50 and abs(sk) < 1.0)
    return ok, {"n": int(n), "shapiro_p": round(p, 6), "skew": round(sk, 4), "ok": bool(ok)}


# ----------------------------------------------------------------------------- dos grupos (Welch)


def compare_two_groups(x: Any, y: Any, *, paired: bool = False, alternative: str = "two-sided", alpha: float = 0.05, method: str = "welch",
                       sensitivity: bool = False, **_ignored: Any) -> dict[str, Any]:
    if alternative not in {"two-sided", "greater", "less"}:
        raise ValueError("alternative debe ser 'two-sided', 'greater' o 'less'.")
    if method != "welch" or paired:
        raise ValueError("El motor local de Python solo ofrece la t de Welch para grupos independientes; para otras pruebas hace falta Ada.")
    x, y = _arr(x, "grupo x"), _arr(y, "grupo y")
    n1, n2 = x.size, y.size
    okx, ix = _normal_info(x)
    oky, iy = _normal_info(y)
    lev = stats.levene(x, y, center="median")

    res = stats.ttest_ind(x, y, equal_var=False, alternative=alternative)                           # vía 1: SciPy
    t, p = float(res.statistic), float(res.pvalue)
    v1, v2 = x.var(ddof=1), y.var(ddof=1)                                                           # vía 2: fórmula de Welch–Satterthwaite a mano
    se2 = v1 / n1 + v2 / n2
    man_t = (x.mean() - y.mean()) / math.sqrt(se2)
    man_df = se2**2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1))
    man_p = {"two-sided": 2 * stats.t.sf(abs(man_t), man_df), "greater": stats.t.sf(man_t, man_df), "less": stats.t.cdf(man_t, man_df)}[alternative]
    sp_df = getattr(res, "df", None)
    verified = _agree(t, float(man_t)) and _agree(p, float(man_p)) and (sp_df is None or _agree(float(sp_df), float(man_df)))

    a_ci = alpha if alternative == "two-sided" else 2 * alpha                                       # como Ada: IC bilateral de nivel 1-2α en pruebas de una cola
    q = float(stats.t.ppf(1 - a_ci / 2, man_df))
    diff = float(x.mean() - y.mean())
    lo, hi = diff - q * math.sqrt(se2), diff + q * math.sqrt(se2)
    d = diff / math.sqrt((v1 + v2) / 2)
    g = d * (1 - 3 / (4 * (n1 + n2) - 9))

    warnings: list[str] = []
    if not (okx and oky):
        bad = ", ".join(n for n, ok in (("x", okx), ("y", oky)) if not ok)
        warnings.append(f"Normalidad dudosa en {bad} (Shapiro p={ix['shapiro_p']} y {iy['shapiro_p']}): se calculó la t de Welch. El motor local no hace análisis de sensibilidad; "
                        "contrasta con la prueba por rangos de la columna «robust» o usa Ada.")
    if min(n1, n2) < 15:
        warnings.append(f"Muestras pequeñas (n1={n1}, n2={n2}): la potencia es baja y los supuestos son difíciles de comprobar.")
    return {
        "analysis": "two_groups", "paired": False, "alternative": alternative, "alpha": alpha, "method_requested": "welch",
        "assumptions": {"normality_x": ix, "normality_y": iy, "levene_p": round(float(lev.pvalue), 6), "equal_variances": bool(lev.pvalue >= 0.05)},
        "test": "t de Welch", "statistic": t, "df": float(man_df), "p_value": p,
        "effect_size": {"name": "g de Hedges", "value": float(g), "interpretation": _interp_d(g)},
        "ci": {"level": 1 - alpha, "of": "diferencia de medias (x - y)", "low": float(lo), "high": float(hi)}, "estimate": diff,
        "verification_methods": ["scipy.stats.ttest_ind", "fórmula manual (Welch-Satterthwaite)", MOTOR], "discrepancy": abs(p - float(man_p)),
        "rationale": ["Prueba pedida por el panel: t de Welch (no exige varianzas iguales)."], "warnings": warnings, "verified": bool(verified),
        "decision": _verdict(p, alpha), "n": [int(n1), int(n2)],
        "descriptives": {"x": {"mean": float(x.mean()), "sd": float(math.sqrt(v1)), "median": float(np.median(x))},
                         "y": {"mean": float(y.mean()), "sd": float(math.sqrt(v2)), "median": float(np.median(y))}},
    }


# ----------------------------------------------------------------------------- tablas y proporciones


def chi_square_independence(table: Any, *, alpha: float = 0.05) -> dict[str, Any]:
    t = np.asarray(table, dtype=float)
    if t.ndim != 2 or min(t.shape) < 2 or (t < 0).any():
        raise ValueError("La tabla debe ser una matriz r x c (r,c >= 2) de conteos no negativos.")
    n = t.sum()
    if n == 0 or (t.sum(1) == 0).any() or (t.sum(0) == 0).any():
        raise ValueError("La tabla tiene una fila o columna sin datos: no se puede contrastar independencia.")
    exp = np.outer(t.sum(1), t.sum(0)) / n
    chi2, p, dof, _ = stats.chi2_contingency(t, correction=False)                                   # vía 1: SciPy
    manual = float(((t - exp) ** 2 / exp).sum())                                                    # vía 2: Σ(O-E)²/E
    manual_p = float(stats.chi2.sf(manual, dof))
    verified = _agree(float(chi2), manual) and _agree(float(p), manual_p)
    v = math.sqrt(manual / (n * (min(t.shape) - 1)))
    low_exp = int((exp < 5).sum())
    out: dict[str, Any] = {"analysis": "chi_square", "alpha": alpha, "n": int(n), "expected_min": float(exp.min()), "cells_expected_lt_5": low_exp, "warnings": [], "rationale": []}
    if t.shape == (2, 2) and (exp < 5).any():
        orr, pf = stats.fisher_exact(t)
        out.update(test="Prueba exacta de Fisher", statistic=float(orr), statistic_name="razón de momios", df=None, p_value=float(pf),
                   effect_size={"name": "V de Cramér (phi)", "value": v, "interpretation": "pequeño" if v < 0.3 else "mediano" if v < 0.5 else "grande"}, verified=bool(verified),
                   verification_methods=["scipy.stats.fisher_exact", "chi-cuadrado manual (solo contraste de consistencia)", MOTOR], discrepancy=abs(float(p) - manual_p))
        out["rationale"].append(f"Tabla 2x2 con frecuencias esperadas < 5 (mínimo {exp.min():.2f}) -> Fisher exacta en lugar de chi-cuadrado.")
        p_used = float(pf)
    else:
        out.update(test="Chi-cuadrado de independencia", statistic=float(chi2), df=int(dof), p_value=float(p),
                   effect_size={"name": "V de Cramér", "value": v, "interpretation": "pequeño" if v < 0.3 else "mediano" if v < 0.5 else "grande"}, verified=bool(verified),
                   verification_methods=["scipy.stats.chi2_contingency", "fórmula manual Σ(O-E)²/E", MOTOR], discrepancy=abs(float(p) - manual_p))
        out["rationale"].append("Frecuencias esperadas suficientes -> chi-cuadrado de Pearson.")
        if low_exp:
            out["warnings"].append(f"{low_exp} celdas con frecuencia esperada < 5: la aproximación chi-cuadrado puede no ser fiable.")
        p_used = float(p)
    out["expected"] = exp.round(3).tolist()
    out["decision"] = _verdict(p_used, alpha)
    return out


def _wilson(k: int, n: int, z: float) -> tuple[float, float]:
    p = k / n
    centro = (p + z * z / (2 * n)) / (1 + z * z / n)
    medio = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return centro - medio, centro + medio


def two_proportions(successes: list[int], nobs: list[int], *, alpha: float = 0.05) -> dict[str, Any]:
    (a, b), (n1, n2) = successes, nobs
    if not (0 <= a <= n1 and 0 <= b <= n2 and n1 > 0 and n2 > 0):
        raise ValueError("Éxitos fuera de rango (0 <= éxitos <= n).")
    p1, p2 = a / n1, b / n2
    pp = (a + b) / (n1 + n2)
    if not 0 < pp < 1:
        raise ValueError("Todas las observaciones son iguales (0 % o 100 % de éxitos): no hay variación que contrastar.")
    z = (p1 - p2) / math.sqrt(pp * (1 - pp) * (1 / n1 + 1 / n2))                                    # vía 1: z con proporción conjunta
    p = float(2 * stats.norm.sf(abs(z)))
    chi2, p_chi, _, _ = stats.chi2_contingency(np.array([[a, n1 - a], [b, n2 - b]], dtype=float), correction=False)   # vía 2: en una 2x2, z² = χ²
    verified = _agree(z * z, float(chi2)) and _agree(p, float(p_chi))
    zc = float(stats.norm.ppf(1 - alpha / 2))
    l1, u1 = _wilson(a, n1, zc)
    l2, u2 = _wilson(b, n2, zc)
    diff = p1 - p2
    lo, hi = diff - math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2), diff + math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2)      # Newcombe
    odds = (a * (n2 - b)) / max(b * (n1 - a), 1e-12)
    small = min(n1 * pp, n1 * (1 - pp), n2 * pp, n2 * (1 - pp)) < 5
    return {"analysis": "two_proportions", "test": "z de dos proporciones", "statistic": float(z), "df": None, "p_value": p, "alpha": alpha,
            "estimate": diff, "proportions": [p1, p2], "ci": {"level": 1 - alpha, "of": "diferencia de proporciones (Newcombe)", "low": float(lo), "high": float(hi)},
            "effect_size": {"name": "razón de momios", "value": float(odds), "interpretation": f"h de Cohen = {abs(2 * math.asin(math.sqrt(p1)) - 2 * math.asin(math.sqrt(p2))):.3f}"},
            "verified": bool(verified), "verification_methods": ["z manual con proporción conjunta", "chi-cuadrado de la 2x2 (z² = χ²)", MOTOR],
            "discrepancy": abs(p - float(p_chi)), "rationale": ["Dos proporciones independientes -> z con proporción conjunta bajo H0."],
            "warnings": (["Frecuencias esperadas < 5: usa la prueba exacta de Fisher (chi_square con tabla 2x2)."] if small else []), "decision": _verdict(p, alpha)}


# ----------------------------------------------------------------------------- Bayes desde los datos

_OPS = {">": np.greater, ">=": np.greater_equal, "<": np.less, "<=": np.less_equal, "==": np.equal}


def _mask_pandas(df: pd.DataFrame, ev: dict[str, Any]) -> pd.Series:
    s, op, v = df[ev["column"]], ev["op"], ev["value"]
    return {">": s > v, ">=": s >= v, "<": s < v, "<=": s <= v, "==": s == v, "!=": (s != v) & s.notna()}[op].fillna(False)


def _mask_numpy(df: pd.DataFrame, ev: dict[str, Any]) -> np.ndarray:
    col = df[ev["column"]].to_numpy(dtype=float)
    if ev["op"] == "!=":
        return (col != ev["value"]) & ~np.isnan(col)
    return _OPS[ev["op"]](col, ev["value"]) & ~np.isnan(col)


def _bayes(df: pd.DataFrame, D: dict[str, Any], C: dict[str, Any]) -> dict[str, Any]:
    for ev in (D, C):
        if ev.get("op") not in {*_OPS, "!="} or "column" not in ev or "value" not in ev:
            raise ValueError("El motor local solo admite eventos simples «columna op valor» con op en >, >=, <, <=, ==, !=.")
        if ev["column"] not in df.columns:
            raise ValueError(f"No existe la columna {ev['column']!r}.")
    n = int(len(df))
    md, mc = _mask_pandas(df, D), _mask_pandas(df, C)                                               # vía 1: máscaras de pandas
    a = {"D": int(md.sum()), "DC": int((md & mc).sum()), "nDC": int((~md & mc).sum()), "nD": int((~md).sum()), "C": int(mc.sum())}
    nd, nc = _mask_numpy(df, D), _mask_numpy(df, C)                                                 # vía 2: conteo con NumPy
    b = {"D": int(nd.sum()), "DC": int((nd & nc).sum()), "nDC": int((~nd & nc).sum()), "nD": int((~nd).sum()), "C": int(nc.sum())}
    if a["D"] == 0 or a["nD"] == 0 or a["C"] == 0:
        raise ValueError("Bayes necesita que D, no-D y C ocurran al menos una vez en los datos.")
    pD, pCgD, pCgnD = Fraction(a["D"], n), Fraction(a["DC"], a["D"]), Fraction(a["nDC"], a["nD"])
    pC = pCgD * pD + pCgnD * (1 - pD)                                                               # probabilidad total
    posterior = pCgD * pD / pC                                                                      # Bayes con fracciones exactas
    direct = Fraction(a["DC"], a["C"])

    def describe(e: dict[str, Any]) -> str:                                                         # mismo texto que Ada
        return f"{e['column']} {e['op']} {e.get('value')}"

    out = {"analysis": "probability", "test": "Teorema de Bayes (desde los datos)", "n": n, "warnings": ["Estimacion empirica: describe ESTA muestra; no es una probabilidad poblacional ni una relacion causal."],
           "rationale": [], "events": {"D": describe(D), "C": describe(C)}, "posterior": float(posterior), "prior": float(pD), "p_C_given_D": float(pCgD), "p_C_given_notD": float(pCgnD),
           "p_C": float(pC), "direct_conditional": float(direct),
           "formula": f"P(D|C) = P(C|D)P(D) / P(C) = {float(pCgD):.4g}·{float(pD):.4g} / {float(pC):.4g} = {float(posterior):.6g}   (conteo directo: {a['DC']}/{a['C']})",
           "decision": f"P(D | C) = {float(posterior):.4g} frente a P(D) = {float(pD):.4g}.", "counts": a}
    if a["DC"] < 5:
        out["warnings"].append(f"Solo {a['DC']} filas cumplen D y C a la vez: estimacion inestable.")
    out["verified"] = bool(a == b and posterior == direct)
    out["discrepancy"] = float(sum(abs(a[k] - b[k]) for k in a))
    out["verification_methods"] = ["pandas (máscaras booleanas)", "NumPy (conteo de casillas)", "conteo directo n(D∩C)/n(C) = Bayes (identidad exacta)", MOTOR]
    if a != b:
        out["warnings"].append(f"Los dos métodos DISCREPAN en las cuentas: pandas={a} numpy={b}. No uses este resultado.")
    return out


def run_probability(operation: str, *, df: pd.DataFrame | None = None, A: dict | None = None, B: dict | None = None, **_ignored: Any) -> dict[str, Any]:
    if operation != "bayes" or df is None or A is None or B is None:
        raise ValueError("El motor local de Python solo ofrece el teorema de Bayes desde los datos (operation='bayes').")
    return _bayes(df, A, B)


# ----------------------------------------------------------------------------- formato compacto (igual que Ada)


def _rnd(o: Any) -> Any:
    if isinstance(o, float):
        return float(f"{o:.6g}") if math.isfinite(o) else None
    if isinstance(o, dict):
        return {k: _rnd(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_rnd(v) for v in o]
    return o


def _direction(res: dict[str, Any]) -> str | None:
    if res.get("analysis") != "two_groups":
        return None
    d = res.get("descriptives") or {}
    for stat, label in (("mean", "media"), ("median", "mediana")):
        try:
            a, b = float(d["x"][stat]), float(d["y"][stat])
        except (KeyError, TypeError, ValueError):
            continue
        if a == b:
            return f"La {label} de x y la de y son iguales ({a:.4g})."
        hi, lo = ("y", "x") if b > a else ("x", "y")
        return f"La {label} de {hi} ({max(a, b):.4g}) es MAYOR que la de {lo} ({min(a, b):.4g}); x - y = {a - b:.4g}."
    return None


def compact_result(res: dict[str, Any]) -> dict[str, Any]:
    out = _rnd({k: res[k] for k in _COMPACT_KEYS if k in res})
    note = _direction(res)
    if note:
        out["direction"] = note
    return out


def compact_probability(res: dict[str, Any]) -> dict[str, Any]:
    return _rnd({k: v for k, v in res.items() if k not in {"resolved", "dataset_sha256"}})


def construir() -> SimpleNamespace:
    """Módulos con la misma forma que los de Ada. Sin `ledger`: la auditoría de Ada solo existe cuando Ada está en este equipo."""
    inference = SimpleNamespace(compare_two_groups=compare_two_groups, chi_square_independence=chi_square_independence, two_proportions=two_proportions,
                                compact_result=compact_result)
    probability = SimpleNamespace(run_probability=run_probability, compact_probability=compact_probability)
    from app.core import ada_engine

    def sin_auditoria(_ruta: Any) -> None:       # workspace.apply_cleaning captura AdaNotReady y anota «skipped» en el manifiesto
        raise ada_engine.AdaNotReady("Con el motor local de Python no se escribe la auditoría de Ada (solo existe cuando Ada está en este equipo).")

    return SimpleNamespace(inference=inference, probability=probability, ledger=None, assert_safe_write_path=sin_auditoria)
