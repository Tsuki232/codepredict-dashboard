"""Limpieza del Unified Bug Dataset (nivel archivo), paso a paso y CONTADA.

Cada regla informa cuántas filas había antes y después, y ese número de filas quitadas se calcula por DOS vías
independientes: pandas (la que ejecuta la regla) y DuckDB (una consulta SQL escrita aparte). Si no coinciden, el paso se
marca como no verificado y no se permite guardar el resultado.

Las reglas siguen la bitácora (Paso 4). Las decisiones que dependen del criterio del grupo (qué hacer con rutas repetidas y
con atípicos) NO se esconden: se ofrecen como opciones y `policy_impact` muestra cómo cambia la tabla 2×2 con cada una.
"""
from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

import duckdb
import numpy as np
import pandas as pd
from pydantic import BaseModel
from scipy import stats

IDS = ["ID", "Name", "LongName", "Parent"]
NUM = ["McCC", "CLOC", "PDA", "PUA", "LLOC", "LOC", "bug"]
REQUIRED = ["LongName", "McCC", "LLOC", "LOC", "bug"]  # nunca se descartan
PATH_POLICIES = ("keep_all", "keep_first", "drop_all")
OUTLIER_POLICIES = ("keep", "tukey3", "p999")


class Rules(BaseModel):
    """Reglas de limpieza. Los umbrales se fijaron ANTES de abrir los datos (McCC > 10 y bug > 0): la interfaz no los edita."""

    integrity: bool = True
    drop_exact_duplicates: bool = True
    path_policy: Literal["keep_all", "keep_first", "drop_all"] = "keep_first"
    drop_constant_columns: bool = True
    outlier_policy: Literal["keep", "tukey3", "p999"] = "keep"
    mccc_threshold: float = 10
    bug_threshold: float = 0


# ----------------------------------------------------------------------------- carga


def sha256_file(path: str | Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with Path(path).open("rb") as fh:
        while block := fh.read(chunk):
            h.update(block)
    return h.hexdigest()


@lru_cache(maxsize=2)
def _load_cached(path: str, mtime_ns: int) -> tuple[pd.DataFrame, dict[str, int]]:
    text = pd.read_csv(path, dtype=str, keep_default_na=True)
    missing_cols = [c for c in IDS + NUM if c not in text.columns]
    if missing_cols:
        raise ValueError(f"Faltan columnas en el CSV: {missing_cols}. Se esperaban {IDS + NUM}.")
    df = pd.DataFrame({c: text[c].astype("string") for c in IDS})
    nonnumeric: dict[str, int] = {}
    for c in NUM:
        num = pd.to_numeric(text[c], errors="coerce")
        nonnumeric[c] = int((num.isna() & text[c].notna()).sum())  # había texto que no es número
        df[c] = num
    return df, nonnumeric


def load_raw(path: str | Path) -> pd.DataFrame:
    """Lee el CSV sin modificarlo en disco. Devuelve una copia (la caché no se contamina)."""
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(f"No existe el CSV de entrada: {p}")
    return _load_cached(str(p), p.stat().st_mtime_ns)[0].copy()


def raw_nonnumeric(path: str | Path) -> dict[str, int]:
    p = Path(path)
    return dict(_load_cached(str(p), p.stat().st_mtime_ns)[1])


# ----------------------------------------------------------------------------- verificación con DuckDB


class _Duck:
    """Segunda vía de cálculo: SQL sobre el mismo DataFrame (los NaN de pandas son NULL en DuckDB)."""

    def __init__(self) -> None:
        self.con = duckdb.connect(":memory:")

    def q(self, df: pd.DataFrame, sql: str) -> Any:
        self.con.register("t", df)
        try:
            return self.con.execute(sql).fetchall()[0][0]
        finally:
            self.con.unregister("t")

    def close(self) -> None:
        self.con.close()


def _quote(c: str) -> str:
    return '"' + c.replace('"', '""') + '"'


# ----------------------------------------------------------------------------- tabla 2×2 y estadísticos rápidos


def table2x2(df: pd.DataFrame) -> dict[str, int]:
    """Filas: C (McCC > umbral) / no C. Columnas: D (bug > umbral) / no D."""
    d, c = df["defectuoso"] == 1, df["compleja"] == 1
    return {"C_D": int((c & d).sum()), "C_ND": int((c & ~d).sum()), "NC_D": int((~c & d).sum()), "NC_ND": int((~c & ~d).sum())}


def quick_stats(df: pd.DataFrame) -> dict[str, Any]:
    """Vista rápida para comparar políticas (scipy). El resultado OFICIAL lo calcula Ada con doble verificación."""
    t = table2x2(df)
    nC, nNC = t["C_D"] + t["C_ND"], t["NC_D"] + t["NC_ND"]
    pC = t["C_D"] / nC if nC else math.nan
    pNC = t["NC_D"] / nNC if nNC else math.nan
    x = df.loc[df["defectuoso"] == 1, "McCC"].to_numpy(float)
    y = df.loc[df["defectuoso"] == 0, "McCC"].to_numpy(float)
    out: dict[str, Any] = {"n": int(len(df)), "table": t, "p_d_given_c": pC, "p_d_given_nc": pNC, "risk_diff": pC - pNC,
                           "mean_mccc_bug": float(x.mean()) if x.size else None, "mean_mccc_ok": float(y.mean()) if y.size else None}
    if x.size > 1 and y.size > 1:
        r = stats.ttest_ind(x, y, equal_var=False)
        out.update(welch_t=float(r.statistic), welch_p=float(r.pvalue))
    return out


# ----------------------------------------------------------------------------- reglas


@dataclass
class Step:
    id: str
    label: str
    before: int
    after: int
    detail: dict[str, Any] = field(default_factory=dict)
    verified: bool | None = None
    methods: list[str] = field(default_factory=list)

    @property
    def removed(self) -> int:
        return self.before - self.after

    def as_dict(self) -> dict[str, Any]:
        return {"id": self.id, "label": self.label, "before": self.before, "after": self.after, "removed": self.removed,
                "detail": self.detail, "verified": self.verified, "methods": self.methods}


@dataclass
class Result:
    frame: pd.DataFrame
    steps: list[Step]
    dropped_columns: list[str]
    fences: dict[str, dict[str, float]]

    @property
    def verified(self) -> bool:
        return all(s.verified is not False for s in self.steps)


def integrity_masks(df: pd.DataFrame) -> dict[str, pd.Series]:
    num = df[NUM]
    return {
        "faltantes": num.isna().any(axis=1),
        "negativos": (num < 0).any(axis=1),
        "loc_menor_que_lloc": df["LOC"] < df["LLOC"],
        "loc_no_positivo": df["LOC"] <= 0,
    }


def _integrity_sql() -> str:
    miss = " OR ".join(f"{_quote(c)} IS NULL" for c in NUM)
    neg = " OR ".join(f"{_quote(c)} < 0" for c in NUM)
    return f"SELECT count(*) FROM t WHERE {miss} OR {neg} OR \"LOC\" < \"LLOC\" OR \"LOC\" <= 0"


def fences_of(df: pd.DataFrame) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for c in ("McCC", "LOC"):
        q1, q3, p999 = (float(v) for v in df[c].quantile([0.25, 0.75, 0.999]))
        out[c] = {"q1": q1, "q3": q3, "tukey3_upper": q3 + 3 * (q3 - q1), "p999_upper": p999}
    return out


def _fence_sql_check(duck: _Duck, df: pd.DataFrame, fences: dict[str, dict[str, float]]) -> bool:
    for c, f in fences.items():
        q1, q3, p = (duck.q(df, f"SELECT quantile_cont({_quote(c)}, {pr}) FROM t") for pr in (0.25, 0.75, 0.999))
        if not (math.isclose(q1, f["q1"], rel_tol=1e-9, abs_tol=1e-9) and math.isclose(q3, f["q3"], rel_tol=1e-9, abs_tol=1e-9)
                and math.isclose(p, f["p999_upper"], rel_tol=1e-9, abs_tol=1e-9)):
            return False
    return True


def _outlier_mask(df: pd.DataFrame, fences: dict[str, dict[str, float]], key: str) -> pd.Series:
    return (df["McCC"] > fences["McCC"][key]) | (df["LOC"] > fences["LOC"][key])


def run_pipeline(raw: pd.DataFrame, rules: Rules, verify: bool = True) -> Result:
    """Aplica las reglas en orden. `verify=False` salta DuckDB (para recorrer muchas combinaciones con rapidez)."""
    duck = _Duck() if verify else None
    try:
        return _run(raw, rules, duck)
    finally:
        if duck:
            duck.close()


def _check(step: Step, duck: _Duck | None, pandas_removed: int, df: pd.DataFrame, sql_removed: str, extra: str = "") -> None:
    step.methods = ["pandas (máscara booleana)"]
    if duck is None:
        return
    got = int(duck.q(df, sql_removed))
    step.verified = got == pandas_removed
    step.methods.append("DuckDB (consulta SQL)" + (f" · {extra}" if extra else ""))
    step.detail["sql_removed"] = got


def rule_integrity(df: pd.DataFrame) -> pd.Series:
    """Filas inválidas: con datos faltantes, negativos, LOC < LLOC o LOC <= 0."""
    return pd.concat(integrity_masks(df), axis=1).any(axis=1)


def rule_exact_duplicates(df: pd.DataFrame) -> pd.Series:
    """Copias exactas: las 11 columnas iguales a una fila anterior (se conserva la primera)."""
    return df.duplicated(keep="first")


def rule_paths(df: pd.DataFrame, policy: str) -> tuple[pd.Series, str]:
    """Rutas repetidas (LongName). Devuelve la máscara de filas a quitar y la consulta SQL equivalente."""
    if policy == "keep_first":      # una fila por archivo: la primera aparición
        return df.duplicated(subset=["LongName"], keep="first"), "SELECT count(*) - count(DISTINCT coalesce(\"LongName\", '<NULL>')) FROM t"
    if policy == "drop_all":        # se descarta toda ruta que aparezca más de una vez
        return df.duplicated(subset=["LongName"], keep=False), (
            "SELECT count(*) FROM (SELECT count(*) OVER (PARTITION BY coalesce(\"LongName\", '<NULL>')) AS c FROM t) WHERE c > 1")
    return pd.Series(False, index=df.index), "SELECT 0"


def rule_outliers(df: pd.DataFrame, fences: dict[str, dict[str, float]], key: str) -> pd.Series:
    """Atípicos extremos: McCC o LOC por encima del umbral (key = 'tukey3_upper' o 'p999_upper')."""
    return (df["McCC"] > fences["McCC"][key]) | (df["LOC"] > fences["LOC"][key])


PATH_LABELS = {"keep_all": "Rutas repetidas: se conservan todas", "keep_first": "Rutas repetidas: se deja la primera aparición",
               "drop_all": "Rutas repetidas: se quitan todas las filas de esas rutas"}


def step_integrity(df, rules, duck, ctx):
    if not rules.integrity:
        return df, None
    masks = integrity_masks(df)
    bad = rule_integrity(df)
    st = Step("integridad", "Integridad (faltantes, negativos, LOC < LLOC, LOC ≤ 0)", len(df), int((~bad).sum()), {k: int(m.sum()) for k, m in masks.items()})
    _check(st, duck, int(bad.sum()), df, _integrity_sql())
    ctx["removed"] = df[bad]
    return df[~bad], st


def step_duplicates(df, rules, duck, ctx):
    if not rules.drop_exact_duplicates:
        return df, None
    dup = rule_exact_duplicates(df)
    st = Step("duplicados", "Duplicados exactos (las 11 columnas iguales)", len(df), int((~dup).sum()))
    _check(st, duck, int(dup.sum()), df, "SELECT count(*) - (SELECT count(*) FROM (SELECT DISTINCT * FROM t)) FROM t")
    ctx["removed"] = df[dup]
    return df[~dup], st


def step_paths(df, rules, duck, ctx):
    rep_all = df.duplicated(subset=["LongName"], keep=False)
    sizes = df.loc[rep_all].groupby("LongName").size()
    info = {"filas_en_rutas_repetidas": int(rep_all.sum()), "rutas_repetidas": int(df.loc[rep_all, "LongName"].nunique()),
            "veces_max": int(sizes.max()) if len(sizes) else 1, "politica": rules.path_policy}
    drop, sql = rule_paths(df, rules.path_policy)
    st = Step("rutas", PATH_LABELS[rules.path_policy], len(df), int((~drop).sum()), info)
    _check(st, duck, int(drop.sum()), df, sql)
    ctx["removed"] = df[drop]
    return df[~drop], st


def step_constants(df, rules, duck, ctx):
    if not rules.drop_constant_columns:
        return df, None
    const = [c for c in NUM if c not in REQUIRED and df[c].nunique(dropna=False) == 1]
    st = Step("constantes", "Columnas constantes (no aportan información)", len(df), len(df),
              {"columnas": {c: float(df[c].iloc[0]) for c in const} if len(df) else {}})
    st.methods = ["pandas (nunique)"]
    if duck:
        sql_const = [c for c in NUM if c not in REQUIRED and int(duck.q(df, f"SELECT count(DISTINCT {_quote(c)}) FROM t")) == 1
                     and int(duck.q(df, f"SELECT count(*) FROM t WHERE {_quote(c)} IS NULL")) == 0]
        st.verified = sorted(sql_const) == sorted(const)
        st.methods.append("DuckDB (COUNT DISTINCT)")
    ctx["dropped"] = const
    ctx["removed"] = df.iloc[0:0]
    return df.drop(columns=const), st


def step_outliers(df, rules, duck, ctx):
    fences = fences_of(df) if len(df) else {}
    ctx["fences"] = fences
    flagged = {k: int(rule_outliers(df, fences, k).sum()) for k in ("tukey3_upper", "p999_upper")} if fences else {}
    if rules.outlier_policy != "keep" and fences:
        key = "tukey3_upper" if rules.outlier_policy == "tukey3" else "p999_upper"
        out = rule_outliers(df, fences, key)
        by_col = {c: int((df[c] > fences[c][key]).sum()) for c in ("McCC", "LOC")}
        st = Step("atipicos", "Atípicos extremos " + ("(> Q3 + 3·RIC)" if key == "tukey3_upper" else "(> percentil 99,9)"),
                  len(df), int((~out).sum()), {"umbral_mccc": fences["McCC"][key], "umbral_loc": fences["LOC"][key], "por_columna": by_col,
                                               "politica": rules.outlier_policy})
        sql = f"SELECT count(*) FROM t WHERE \"McCC\" > {fences['McCC'][key]!r} OR \"LOC\" > {fences['LOC'][key]!r}"
        _check(st, duck, int(out.sum()), df, sql)
        if duck and st.verified:
            st.verified = _fence_sql_check(duck, df, fences)
            st.methods[-1] += " · cuantiles con quantile_cont"
        ctx["removed"] = df[out]
        return df[~out], st
    st = Step("atipicos", "Atípicos extremos: se conservan (solo se señalan)", len(df), len(df),
              {"politica": "keep", "se_quitarian_tukey3": flagged.get("tukey3_upper"), "se_quitarian_p999": flagged.get("p999_upper"),
               "umbral_tukey3_mccc": fences.get("McCC", {}).get("tukey3_upper"), "umbral_tukey3_loc": fences.get("LOC", {}).get("tukey3_upper")})
    st.methods = ["pandas (cuantiles)"]
    if duck and fences:
        st.verified = _fence_sql_check(duck, df, fences)
        st.methods.append("DuckDB (quantile_cont)")
    ctx["removed"] = df.iloc[0:0]
    return df, st


def step_labels(df, rules, duck, ctx):
    df = df.copy()
    df["defectuoso"] = (df["bug"] > rules.bug_threshold).astype("int8")
    df["compleja"] = (df["McCC"] > rules.mccc_threshold).astype("int8")
    st = Step("etiquetas", f"Etiquetas fijadas de antemano: defectuoso = bug > {rules.bug_threshold:g}; compleja = McCC > {rules.mccc_threshold:g}",
              len(df), len(df), {"defectuosos": int(df["defectuoso"].sum()), "complejas": int(df["compleja"].sum())})
    st.methods = ["pandas"]
    if duck:
        sd = int(duck.q(df, f"SELECT count(*) FROM t WHERE \"bug\" > {rules.bug_threshold!r}"))
        sc = int(duck.q(df, f"SELECT count(*) FROM t WHERE \"McCC\" > {rules.mccc_threshold!r}"))
        st.verified = sd == st.detail["defectuosos"] and sc == st.detail["complejas"]
        st.methods.append("DuckDB (COUNT con filtro)")
    ctx["removed"] = df.iloc[0:0]
    return df, st


# Orden de los pasos: el cuaderno y la tubería usan exactamente estas mismas funciones.
STEP_FUNCS = {"integridad": step_integrity, "duplicados": step_duplicates, "rutas": step_paths,
              "constantes": step_constants, "atipicos": step_outliers, "etiquetas": step_labels}


def _run(raw: pd.DataFrame, rules: Rules, duck: _Duck | None) -> Result:
    df = raw.copy()
    n_raw = len(df)
    steps = [Step("carga", "Filas leídas del CSV", n_raw, n_raw, {"columnas": list(df.columns)}, True if duck else None, ["conteo directo"])]
    ctx: dict = {"dropped": [], "fences": {}}
    for fn in STEP_FUNCS.values():
        df, st = fn(df, rules, duck, ctx)
        if st is not None:
            steps.append(st)
    return Result(df, steps, ctx["dropped"], ctx["fences"])


# ----------------------------------------------------------------------------- resúmenes para la interfaz


def _r(x: Any, nd: int = 6) -> Any:
    if isinstance(x, (np.floating, float)):
        return None if not math.isfinite(float(x)) else round(float(x), nd)
    if isinstance(x, (np.integer,)):
        return int(x)
    return x


def column_profile(df: pd.DataFrame) -> list[dict[str, Any]]:
    rows = []
    for c in IDS + NUM:
        s = df[c]
        row: dict[str, Any] = {"name": c, "kind": "numérica" if c in NUM else "texto", "missing": int(s.isna().sum()), "unique": int(s.nunique(dropna=True))}
        if c in NUM:
            q = s.quantile([0.25, 0.5, 0.75])
            row.update(min=_r(s.min()), q1=_r(q.iloc[0]), median=_r(q.iloc[1]), mean=_r(s.mean()), q3=_r(q.iloc[2]), max=_r(s.max()),
                       sd=_r(s.std(ddof=1)), zeros=int((s == 0).sum()), skew=_r(s.skew()))
        rows.append(row)
    return rows


def log_hist(arrays: dict[str, np.ndarray], bins: int = 40, hi: float | None = None) -> dict[str, Any]:
    """Histograma en escala logarítmica (las métricas de código son muy asimétricas). Devuelve bordes y conteos por serie."""
    top = max(hi or max((float(a.max()) for a in arrays.values() if a.size), default=10.0), 100.0)
    # Las métricas son enteros: del 1 al 10 cada valor tiene su propia barra (si no, los cortes logarítmicos dejan barras vacías);
    # desde 10 los cortes son logarítmicos. El último corte se fija en el máximo exacto para que ningún dato quede fuera.
    high = np.logspace(1, math.log10(top), max(bins - 9, 5) + 1)[1:]
    high[-1] = top
    edges = np.concatenate([np.arange(1, 11, dtype=float), high])
    return {"edges": [_r(e, 4) for e in edges],
            "counts": {k: np.histogram(np.clip(a, 1, None), edges)[0].astype(int).tolist() for k, a in arrays.items()}}


def histograms(raw: pd.DataFrame, final: pd.DataFrame) -> dict[str, Any]:
    out = {}
    for c in ("McCC", "LOC"):
        a = raw[c].dropna().to_numpy(float)
        b = final[c].dropna().to_numpy(float) if c in final else np.array([])
        out[c] = log_hist({"antes": a, "despues": b}, hi=float(a.max()) if a.size else None)
    return out


def profile_raw(raw: pd.DataFrame, nonnumeric: dict[str, int]) -> dict[str, Any]:
    n = len(raw)
    masks = integrity_masks(raw)
    rep_all = raw.duplicated(subset=["LongName"], keep=False)
    sizes = raw.loc[rep_all].groupby("LongName").size()
    base = raw.copy()
    base["defectuoso"] = (base["bug"] > 0).astype("int8")
    base["compleja"] = (base["McCC"] > 10).astype("int8")
    metrics = [c for c in NUM]
    return {
        "rows": n, "columns": len(raw.columns),
        "column_profile": column_profile(raw),
        "exact_duplicates": int(raw.duplicated(keep="first").sum()),
        "unique_paths": int(raw["LongName"].nunique()),
        "rows_with_repeated_path": int(raw.duplicated(subset=["LongName"], keep="first").sum()),
        "rows_in_repeated_paths": int(rep_all.sum()),
        "paths_repeated": int(raw.loc[rep_all, "LongName"].nunique()),
        "repetition_histogram": {str(k): int(v) for k, v in sizes.value_counts().sort_index().items()},
        "duplicated_ids": int(raw["ID"].duplicated(keep="first").sum()),
        "integrity": {k: int(m.sum()) for k, m in masks.items()} | {"no_numericos": int(sum(nonnumeric.values()))},
        "constant_columns": [c for c in metrics if c not in REQUIRED and raw[c].nunique(dropna=False) == 1],
        "table2x2_raw": table2x2(base),
        "hist": {c: log_hist({"antes": raw[c].dropna().to_numpy(float)}) for c in ("McCC", "LOC")},
    }


def policy_impact(raw: pd.DataFrame, rules: Rules) -> list[dict[str, Any]]:
    """Cómo cambian n, la tabla 2×2 y la diferencia de proporciones con cada combinación de política (sin verificación; es una vista)."""
    rows = []
    for pp in PATH_POLICIES:
        for op in OUTLIER_POLICIES:
            r = run_pipeline(raw, rules.model_copy(update={"path_policy": pp, "outlier_policy": op}), verify=False)
            q = quick_stats(r.frame)
            rows.append({"path_policy": pp, "outlier_policy": op, "selected": pp == rules.path_policy and op == rules.outlier_policy, **q})
    return rows
