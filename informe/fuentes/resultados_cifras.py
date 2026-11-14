"""Cifras de la sección de resultados (nivel archivo del Unified Bug Dataset) -> resultados_cifras.json.

Todo sale del mismo código del panel codepredict-dashboard (limpieza con doble verificación pandas/DuckDB e inferencia con Ada) y,
además, cada número clave se RECALCULA aquí con una tercera vía independiente (fórmulas a mano con numpy/fractions). Si algo no
coincide, o si cambia una afirmación cualitativa que el texto da por cierta, el script falla en lugar de escribir cifras dudosas.

Uso:  .venv\\Scripts\\python.exe reports/informe_codepredict/resultados_cifras.py
No escribe en data/raw ni guarda el conjunto limpio: solo lee el CSV y escribe el JSON de esta carpeta.
"""
from __future__ import annotations

import hashlib
import json
import math
import sys
import time
from datetime import datetime, timezone
from fractions import Fraction
from pathlib import Path

import numpy as np
from scipy import stats

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).parent
ADA = HERE.parents[1]
BACKEND = ADA.parent / "codepredict-dashboard" / "backend"
assert BACKEND.is_dir(), f"No encuentro el panel en {BACKEND}"
sys.path.insert(0, str(BACKEND))

from app.core import ada_engine, cleaning, config, inference  # noqa: E402

ALPHA, ALT = 0.05, "two-sided"          # decisión provisional del grupo: se confirma en el informe final
rules = cleaning.Rules()                  # reglas por defecto = las de la bitácora (decisiones provisionales)

ada_engine.start_loading()
t0 = time.time()
while ada_engine.status()["phase"] == "loading" and time.time() - t0 < 180:
    time.sleep(0.5)
assert ada_engine.status()["ready"], ada_engine.status()

src = config.dataset_path()
raw = cleaning.load_raw(src)
res = cleaning.run_pipeline(raw, rules, verify=True)
assert res.verified, "alguna regla no coincide entre pandas y DuckDB"
frame = res.frame
live = inference.run_live(rules, ALPHA, ALT)
impact = cleaning.policy_impact(raw, rules)
hist = cleaning.histograms(raw, frame)

# ------------------------------------------------------------------ tercera vía: fórmulas a mano
x = frame.loc[frame["defectuoso"] == 1, "McCC"].to_numpy(float)
y = frame.loc[frame["defectuoso"] == 0, "McCC"].to_numpy(float)
n1, n2 = x.size, y.size
v1, v2 = x.var(ddof=1), y.var(ddof=1)
se2 = v1 / n1 + v2 / n2
t_hand = (x.mean() - y.mean()) / math.sqrt(se2)
df_hand = se2**2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1))
tab = cleaning.table2x2(frame)
O = np.array([[tab["C_D"], tab["C_ND"]], [tab["NC_D"], tab["NC_ND"]]], float)
E = np.outer(O.sum(1), O.sum(0)) / O.sum()
chi_hand = float(((O - E) ** 2 / E).sum())
nC, nNC = O[0].sum(), O[1].sum()
p1, p2, pp = O[0, 0] / nC, O[1, 0] / nNC, (O[0, 0] + O[1, 0]) / O.sum()
z_hand = (p1 - p2) / math.sqrt(pp * (1 - pp) * (1 / nC + 1 / nNC))
post = Fraction(int(O[0, 0]), int(nC))                           # P(D|C) por conteo directo
close = lambda a, b, tol=1e-5: abs(a - b) <= tol * max(1.0, abs(a), abs(b))
W, CH, Z, B = live["welch"], live["chi_square"], live["two_proportions"], live["bayes"]
assert close(W["statistic"], t_hand) and close(W["df"], df_hand), (W["statistic"], t_hand, W["df"], df_hand)
assert close(CH["statistic"], chi_hand) and close(abs(Z["statistic"]), abs(z_hand)) and close(z_hand**2, chi_hand, 1e-9)
assert close(B["posterior"], float(post)) and live["table2x2"] == tab
assert (len(frame), int(O.sum())) == (32_509, 32_509)

# ------------------------------------------------------------------ afirmaciones cualitativas que el texto da por ciertas
a = ALPHA
assert all(t["p_value"] < a for t in (live["welch"], live["welch_log"], live["robust"], CH, Z)), "el texto dice que todas las pruebas rechazan H0"
assert live["welch"]["verified"] and live["chi_square"]["verified"] and Z["verified"] and B["verified"] and live["robust"]["verified"]
assert all(r["risk_diff"] > 0 for r in impact), "el texto dice que la diferencia es positiva en las nueve combinaciones"
assert live["welch"]["effect_size"]["interpretation"] == "pequeño" and CH["effect_size"]["interpretation"] == "pequeño"
assert live["groups"]["defectuosos"]["mean"] > live["groups"]["sin_defecto"]["mean"]
assert live["independence"]["repeated_path_rows"] == 0
assert not W["assumptions"]["normality_x"]["ok"] and not W["assumptions"]["normality_y"]["ok"]

assert 0.5 < pr_ok if (pr_ok := live["probabilities"]["p_c_given_d"]) else False, "el texto dice «algo más de la mitad» (P(C|D))"
assert pr_ok < 0.56
assert W["assumptions"]["levene_p"] < 0.001, "el texto dice que Levene da p < .001"
assert CH["expected_min"] > 5, "el texto dice que se cumple el supuesto de esperados > 5"
assert W["ci"]["low"] > 0 and live["robust"]["ci"]["low"] > 0.5 and Z["ci"]["low"] > 0, "el texto dice que ningún intervalo incluye el valor de «sin efecto»"
assert live["groups"]["defectuosos"]["median"] > live["groups"]["sin_defecto"]["median"]
assert res.steps[1].removed == 0 and res.steps[5].removed == 0 and res.steps[2].removed == 4, "la Tabla 1 dice: sin inválidos, atípicos conservados"

# ------------------------------------------------------------------ salida
g = live["groups"]
pr = live["probabilities"]
steps = [{"label": s.label, "before": s.before, "after": s.after, "removed": s.removed, "verified": s.verified} for s in res.steps]
h_cohen = float(Z["effect_size"]["interpretation"].split("=")[1])
out = {
    "meta": {
        "fecha_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "alfa": a, "alternativa": ALT,
        "csv_sha256": cleaning.sha256_file(src), "csv_bytes": src.stat().st_size, "reglas": rules.model_dump(),
        "ada_listo": ada_engine.status()["ready"], "n_bruto": len(raw), "n_final": len(frame),
    },
    "steps": steps,
    "impact": [{"rutas": r["path_policy"], "atipicos": r["outlier_policy"], "sel": r["selected"], "n": r["n"], "p_c": r["p_d_given_c"],
                "p_nc": r["p_d_given_nc"], "pp": r["risk_diff"] * 100, "t": r.get("welch_t")} for r in impact],
    "impact_pp_min": min(r["risk_diff"] for r in impact) * 100, "impact_pp_max": max(r["risk_diff"] for r in impact) * 100,
    "fences": {c: res.fences[c] for c in ("McCC", "LOC")},
    "atip_tukey": res.steps[5].detail.get("se_quitarian_tukey3"), "atip_p999": res.steps[5].detail.get("se_quitarian_p999"),
    "grupos": g, "tabla": tab,
    "tot": {"C": int(nC), "NC": int(nNC), "D": int(O[:, 0].sum()), "N": int(O[:, 1].sum()), "n": int(O.sum())},
    "esperados": {"C_D": E[0, 0], "C_ND": E[0, 1], "NC_D": E[1, 0], "NC_ND": E[1, 1]},
    "prob": {**pr, "p_nd": 1 - pr["p_d"], "pct_c_d": 100 * pr["p_d_given_c"], "pct_nc_d": 100 * pr["p_d_given_nc"], "pp": 100 * pr["risk_diff"],
             "pct_d": 100 * pr["p_d"], "pct_c": 100 * pr["p_c"], "pct_c_given_d": 100 * pr["p_c_given_d"]},
    "welch": {"t": W["statistic"], "df": W["df"], "p": W["p_value"], "g": W["effect_size"]["value"], "g_txt": W["effect_size"]["interpretation"],
              "dif": W["estimate"], "lo": W["ci"]["low"], "hi": W["ci"]["high"], "nivel": 100 * W["ci"]["level"],
              "levene_p": W["assumptions"]["levene_p"], "skew_x": W["assumptions"]["normality_x"]["skew"], "skew_y": W["assumptions"]["normality_y"]["skew"],
              "t_mano": t_hand, "df_mano": df_hand, "metodos": W["verification_methods"]},
    "welch_log": {"t": live["welch_log"]["statistic"], "df": live["welch_log"]["df"], "p": live["welch_log"]["p_value"], "g": live["welch_log"]["effect_size"]["value"],
                  "dif": live["welch_log"]["estimate"]},
    "robusta": {"u": live["robust"]["statistic"], "p": live["robust"]["p_value"], "ps": live["robust"]["effect_size"]["value"],
                "lo": live["robust"]["ci"]["low"], "hi": live["robust"]["ci"]["high"], "ps_pct": 100 * live["robust"]["effect_size"]["value"]},
    "chi": {"x2": CH["statistic"], "gl": CH["df"], "p": CH["p_value"], "v": CH["effect_size"]["value"], "min_esp": CH["expected_min"], "x2_mano": chi_hand},
    "z": {"z": abs(Z["statistic"]), "p": Z["p_value"], "or": Z["effect_size"]["value"], "h": h_cohen, "dif": Z["estimate"], "dif_pp": 100 * Z["estimate"],
          "lo": Z["ci"]["low"], "hi": Z["ci"]["high"], "z_mano": abs(z_hand)},
    "bayes": {"prior": B["prior"], "post": B["posterior"], "c_d": B["p_C_given_D"], "c_nd": B["p_C_given_notD"], "c": B["p_C"], "dc": B["counts"]["DC"], "cc": B["counts"]["C"],
              "pct_prior": 100 * B["prior"], "pct_post": 100 * B["posterior"], "frac": f"{post.numerator}/{post.denominator}"},
    "hist": {"McCC": hist["McCC"], "grupos": live["hist"]},
}
(HERE / "resultados_cifras.json").write_text(json.dumps(out, ensure_ascii=False, indent=1, default=float), encoding="utf-8")
print("OK resultados_cifras.json | filas", out["meta"]["n_bruto"], "->", out["meta"]["n_final"], "| t =", round(W["statistic"], 4), "(a mano", round(t_hand, 4), ")",
      "| chi2 =", round(CH["statistic"], 2), "| P(D|C) =", round(B["posterior"], 4))
