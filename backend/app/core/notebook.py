"""Cuaderno «estilo Colab»: la misma limpieza e inferencia del panel, pero celda por celda y a la vista.

Cada celda ejecuta código REAL del proyecto (el mismo que usa el panel) y muestra ese código tal cual (`inspect.getsource`),
con su salida. El estado (el DataFrame tras cada celda) vive en el servidor, así que se puede ejecutar una celda, ver qué quitó,
volver atrás y reejecutar. Reejecutar una celda invalida las posteriores, como en Colab.

No hay retardos artificiales: lo que se ve tarda lo que tarda de verdad.
"""
from __future__ import annotations

import inspect
import threading
import time
from dataclasses import dataclass
from typing import Any, Callable

import numpy as np
import pandas as pd

from app.core import ada_engine, cleaning, config, inference, workspace
from app.core.cleaning import Rules


class NotReady(Exception):
    """Se intentó ejecutar una celda sin haber ejecutado la anterior."""


# ----------------------------------------------------------------------------- bloques de salida


def text(s: str) -> dict[str, Any]:
    return {"type": "text", "text": s}


def table(df: pd.DataFrame, title: str = "") -> dict[str, Any]:
    def cell(v: Any) -> Any:
        if pd.isna(v):
            return ""
        if isinstance(v, (int, np.integer)) and not isinstance(v, bool):
            return int(v)
        if isinstance(v, (float, np.floating)):
            return round(float(v), 4)
        return str(v)

    rows = [[cell(v) for v in r] for r in df.itertuples(index=False, name=None)]
    return {"type": "table", "title": title, "columns": [str(c) for c in df.columns], "rows": rows}


def lines(d: dict[str, Any]) -> str:
    w = max(len(k) for k in d)
    return "\n".join(f"{k.ljust(w)} : {v}" for k, v in d.items())


# ----------------------------------------------------------------------------- celdas de inferencia (cortas a propósito: se muestran tal cual)


def calc_welch(df, alpha, alternative):
    """Welch sobre McCC: archivos con bug (x) frente a sin bug (y). Lo calcula Ada."""
    x = df.loc[df["defectuoso"] == 1, "McCC"].to_numpy(float)
    y = df.loc[df["defectuoso"] == 0, "McCC"].to_numpy(float)
    res = ada_engine.require().inference.compare_two_groups(x, y, method="welch", alternative=alternative, alpha=alpha, sensitivity=False)
    return ada_engine.require().inference.compact_result(res)


def calc_robusta(df, alpha, alternative):
    """Sensibilidad: Welch sobre log(1+McCC) (Ada) y Mann-Whitney por rangos (este panel, con doble método)."""
    x = df.loc[df["defectuoso"] == 1, "McCC"].to_numpy(float)
    y = df.loc[df["defectuoso"] == 0, "McCC"].to_numpy(float)
    inf = ada_engine.require().inference
    log_res = inf.compact_result(inf.compare_two_groups(np.log1p(x), np.log1p(y), method="welch", alternative=alternative, alpha=alpha, sensitivity=False))
    return log_res, inference.robust_companion(x, y, alternative, alpha)


def calc_chi2(df, alpha):
    t = cleaning.table2x2(df)
    inf = ada_engine.require().inference
    return inf.compact_result(inf.chi_square_independence([[t["C_D"], t["C_ND"]], [t["NC_D"], t["NC_ND"]]], alpha=alpha))


def calc_dos_proporciones(df, alpha):
    t = cleaning.table2x2(df)
    inf = ada_engine.require().inference
    return inf.compact_result(inf.two_proportions([t["C_D"], t["NC_D"]], [t["C_D"] + t["C_ND"], t["NC_D"] + t["NC_ND"]], alpha=alpha))


def calc_bayes(df, rules):
    ada = ada_engine.require()
    D = {"column": "bug", "op": ">", "value": rules.bug_threshold}
    C = {"column": "McCC", "op": ">", "value": rules.mccc_threshold}
    return ada.probability.compact_probability(ada.probability.run_probability("bayes", df=df, A=D, B=C))


def _show_test(r: dict[str, Any], keys=("test", "statistic", "df", "p_value", "effect_size", "ci", "estimate", "proportions", "decision", "verified", "verification_methods", "warnings")) -> str:
    return lines({k: r[k] for k in keys if k in r and r[k] not in (None, [])})


# ----------------------------------------------------------------------------- definición de celdas


@dataclass
class Cell:
    id: str
    title: str
    about: str
    code: Callable[[], str]
    run: Callable[..., tuple[dict, list[dict]]]  # (prev_snapshot, rules, alpha, alternative) -> (snapshot, blocks)
    needs_ada: bool = False


def _src(*objs) -> str:
    return "\n\n".join(inspect.getsource(getattr(o, "__wrapped__", o)).rstrip() for o in objs)


def _with_sql(title_rule: str, src: str, sql: str) -> str:
    return f"# {title_rule}\n{src}\n\n# Verificación independiente (DuckDB): cuenta las mismas filas con SQL\nSQL = \"\"\"\n{sql}\n\"\"\""


def _run_load(prev, rules, alpha, alternative):
    p = config.dataset_path()
    raw = cleaning.load_raw(p)
    sha = cleaning.sha256_file(p)
    blocks = [text(lines({"archivo": p.name, "filas × columnas": f"{raw.shape[0]} × {raw.shape[1]}", "tamaño": f"{p.stat().st_size / 1e6:.2f} MB",
                          "sha256": sha, "nota": "el CSV original NO se modifica: todo ocurre en memoria"})),
              table(raw.head(8), "raw.head(8)"), text("raw.dtypes\n" + raw.dtypes.astype(str).to_string())]
    return {"df": raw, "dropped": [], "fences": {}, "steps": []}, blocks


def _run_step(step_id: str):
    def run(prev, rules, alpha, alternative):
        ctx: dict[str, Any] = {"dropped": list(prev["dropped"]), "fences": prev["fences"]}
        duck = cleaning._Duck()
        try:
            df, st = cleaning.STEP_FUNCS[step_id](prev["df"], rules, duck, ctx)
        finally:
            duck.close()
        if st is None:
            return dict(prev), [text("Regla desactivada en el panel: esta celda no cambia nada.")]
        blocks: list[dict] = [{"type": "step", "step": st.as_dict()}]
        rem = ctx.get("removed")
        if rem is not None and len(rem):
            cols = [c for c in ("ID", "LongName", "McCC", "LOC", "bug") if c in rem.columns]
            blocks.append(table(rem[cols].head(6), f"Filas quitadas (se muestran {min(6, len(rem))} de {len(rem)})"))
        snap = {"df": df, "dropped": ctx["dropped"], "fences": ctx["fences"], "steps": prev["steps"] + [st.as_dict()]}
        return snap, blocks
    return run


def _run_table(prev, rules, alpha, alternative):
    t = cleaning.table2x2(prev["df"])
    q = cleaning.quick_stats(prev["df"])
    grid = pd.DataFrame([[t["C_D"], t["C_ND"], t["C_D"] + t["C_ND"]], [t["NC_D"], t["NC_ND"], t["NC_D"] + t["NC_ND"]]],
                        index=["McCC > 10 (C)", "McCC ≤ 10 (no C)"], columns=["con bug (D)", "sin bug (no D)", "total"]).reset_index(names=" ")
    return dict(prev), [table(grid, "Tabla 2×2 con las reglas elegidas"),
                        text(f"P(D | C)    = {q['p_d_given_c']:.4f}\nP(D | no C) = {q['p_d_given_nc']:.4f}\ndiferencia  = {q['risk_diff']:.4f}")]


def _run_save(prev, rules, alpha, alternative):
    man = workspace.apply_cleaning(rules)
    return dict(prev), [text(lines({"guardado en": man["output"]["path"], "filas": man["output"]["rows"], "columnas": len(man["output"]["columns"]),
                                    "sha256 entrada": man["input"]["sha256"], "sha256 salida": man["output"]["sha256"],
                                    "auditoría de Ada": man["audit"], "nota": "no se escribe nunca en data/raw"}))]


def _run_welch(prev, rules, alpha, alternative):
    r = calc_welch(prev["df"], alpha, alternative)
    return dict(prev), [text(_show_test(r))]


def _run_robusta(prev, rules, alpha, alternative):
    log_res, rob = calc_robusta(prev["df"], alpha, alternative)
    return dict(prev), [text("# Welch sobre log(1 + McCC)  (Ada)\n" + _show_test(log_res)),
                        text("# Mann-Whitney por rangos  (este panel: scipy + fórmula de rangos)\n" + _show_test(rob))]


def _run_chi2(prev, rules, alpha, alternative):
    return dict(prev), [text(_show_test(calc_chi2(prev["df"], alpha), keys=("test", "statistic", "df", "p_value", "effect_size", "expected_min", "decision", "verified", "verification_methods", "warnings")))]


def _run_two(prev, rules, alpha, alternative):
    return dict(prev), [text(_show_test(calc_dos_proporciones(prev["df"], alpha)))]


def _run_bayes(prev, rules, alpha, alternative):
    r = calc_bayes(prev["df"], rules)
    return dict(prev), [text(lines({k: r[k] for k in ("events", "prior", "p_C_given_D", "p_C_given_notD", "p_C", "posterior", "formula", "decision", "verified", "verification_methods", "warnings") if k in r}))]


def _step_cell(sid: str, title: str, about: str, code: Callable[[], str]) -> Cell:
    return Cell(sid, title, about, code, _run_step(sid))


CELLS: list[Cell] = [
    Cell("cargar", "Cargar el CSV (sin modificarlo)", "Lee el archivo crudo en memoria y calcula su huella SHA-256.",
         lambda: _src(cleaning.load_raw, cleaning._load_cached) + "\n\nraw = load_raw(ruta_del_csv)\nraw.head(8)", _run_load),
    _step_cell("integridad", "1 · Integridad", "Filas con datos faltantes, valores negativos, LOC < LLOC o LOC ≤ 0.",
               lambda: _with_sql("Regla (pandas)", _src(cleaning.integrity_masks, cleaning.rule_integrity), cleaning._integrity_sql())),
    _step_cell("duplicados", "2 · Duplicados exactos", "Filas idénticas en las 11 columnas a otra anterior.",
               lambda: _with_sql("Regla (pandas)", _src(cleaning.rule_exact_duplicates), "SELECT count(*) - (SELECT count(*) FROM (SELECT DISTINCT * FROM t)) FROM t")),
    _step_cell("rutas", "3 · Rutas repetidas", "Un mismo archivo en varias filas rompe la independencia. La política la elige el grupo (panel Limpieza).",
               lambda: "# Regla (pandas) + su consulta equivalente en SQL\n" + _src(cleaning.rule_paths)),
    _step_cell("constantes", "4 · Columnas constantes", "Columnas que valen siempre lo mismo no aportan información.",
               lambda: _src(cleaning.step_constants)),
    _step_cell("atipicos", "5 · Atípicos extremos", "Por defecto solo se señalan; la política la elige el grupo.",
               lambda: _src(cleaning.fences_of, cleaning.rule_outliers)),
    _step_cell("etiquetas", "6 · Etiquetas fijadas de antemano", "defectuoso = bug > 0 · compleja = McCC > 10 (umbrales fijados antes de abrir los datos).",
               lambda: _src(cleaning.step_labels)),
    Cell("tabla", "Tabla 2×2", "Conteos con los que trabajan χ², las proporciones y Bayes.", lambda: _src(cleaning.table2x2), _run_table),
    Cell("guardar", "Guardar el conjunto limpio", "Escribe el CSV limpio y su manifiesto con huellas SHA-256 en la carpeta de trabajo, y registra la operación en la bitácora de Ada.",
         lambda: _src(workspace.apply_cleaning), _run_save),
    Cell("welch", "Prueba t de Welch (Ada)", "Compara la media de McCC entre archivos con y sin bug. Ada la verifica con scipy, statsmodels y la fórmula manual.",
         lambda: _src(calc_welch), _run_welch, needs_ada=True),
    Cell("robusta", "¿Cambia la conclusión? (sensibilidad)", "McCC es muy asimétrica: se repite con log(1+McCC) y con un contraste por rangos.",
         lambda: _src(calc_robusta, inference.robust_companion), _run_robusta, needs_ada=True),
    Cell("chi2", "Chi-cuadrado de independencia (Ada)", "¿Son independientes «ser complejo» y «tener bug»?",
         lambda: _src(calc_chi2), _run_chi2, needs_ada=True),
    Cell("dosprop", "Dos proporciones (Ada)", "P(bug | complejo) frente a P(bug | no complejo).",
         lambda: _src(calc_dos_proporciones), _run_two, needs_ada=True),
    Cell("bayes", "Teorema de Bayes (Ada)", "P(bug | complejo) con los conteos reales, comprobado contra el conteo directo.",
         lambda: _src(calc_bayes), _run_bayes, needs_ada=True),
]
ORDER = [c.id for c in CELLS]
BY_ID = {c.id: c for c in CELLS}

_lock = threading.Lock()
_state: dict[str, Any] = {"snap": {}, "done": {}, "count": 0}


def catalog() -> list[dict[str, Any]]:
    return [{"id": c.id, "title": c.title, "about": c.about, "code": c.code(), "needs_ada": c.needs_ada} for c in CELLS]


def reset() -> None:
    with _lock:
        _state.update(snap={}, done={}, count=0)


def status() -> dict[str, Any]:
    with _lock:
        return {"done": dict(_state["done"]), "count": _state["count"]}


def run_cell(cell_id: str, rules: Rules, alpha: float = 0.05, alternative: str = "two-sided") -> dict[str, Any]:
    if cell_id not in BY_ID:
        raise KeyError(cell_id)
    with _lock:
        i = ORDER.index(cell_id)
        if i > 0 and ORDER[i - 1] not in _state["done"]:
            raise NotReady(f"Ejecuta antes la celda «{BY_ID[ORDER[i - 1]].title}».")
        prev = _state["snap"].get(ORDER[i - 1], {}) if i > 0 else {}
        later = ORDER[i + 1:]
        invalidated = [c for c in later if c in _state["done"]]
        for c in later:
            _state["done"].pop(c, None)
            _state["snap"].pop(c, None)
        t0 = time.perf_counter()
        snap, blocks = BY_ID[cell_id].run(prev, rules, alpha, alternative)
        seconds = time.perf_counter() - t0
        _state["count"] += 1
        _state["done"][cell_id] = _state["count"]
        _state["snap"][cell_id] = snap
        return {"cell_id": cell_id, "execution_count": _state["count"], "seconds": round(seconds, 3), "blocks": blocks, "invalidated": invalidated}
