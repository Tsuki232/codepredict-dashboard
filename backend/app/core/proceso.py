"""El proceso de ciencia de datos de CodePredict (perfil, limpieza, conjunto limpio) como funciones SIN estado ni archivos de salida.

Las usan dos sitios y por eso están aquí, una sola vez: la API local del panel (cuando el cálculo se hace en este equipo) y la puerta de enlace de Ada
(cuando Ada hace el proceso completo para otro equipo). Así el resultado es idéntico salga de donde salga. Nada de aquí escribe en disco.
"""
from __future__ import annotations

from typing import Any

from app.core import cleaning, config

FUENTE = "Unified Bug Dataset v1.2 (Ferenc et al., 2020), nivel archivo"


def perfil() -> dict[str, Any]:
    """Perfil del CSV de entrada (sin tocarlo)."""
    p = config.dataset_path()
    raw = cleaning.load_raw(p)
    out = cleaning.profile_raw(raw, cleaning.raw_nonnumeric(p))
    out["source"] = {"path": str(p), "sha256": cleaning.sha256_file(p), "bytes": p.stat().st_size, "name": FUENTE}
    return out


def vista(rules: cleaning.Rules) -> dict[str, Any]:
    """Vista previa de la limpieza con esas reglas (cada regla verificada: pandas contra DuckDB). No guarda nada."""
    raw = cleaning.load_raw(config.dataset_path())
    res = cleaning.run_pipeline(raw, rules, verify=True)
    return {
        "rules": rules.model_dump(),
        "steps": [s.as_dict() for s in res.steps],
        "verified": res.verified,
        "rows_in": len(raw), "rows_out": len(res.frame),
        "dropped_columns": res.dropped_columns,
        "table2x2": cleaning.table2x2(res.frame),
        "quick": cleaning.quick_stats(res.frame),
        "hist": cleaning.histograms(raw, res.frame),
        "fences": res.fences,
        "impact": cleaning.policy_impact(raw, rules),
    }


def conjunto_limpio(rules: cleaning.Rules) -> tuple[dict[str, Any], bytes]:
    """El conjunto limpio ya verificado, listo para guardar: (datos del proceso, bytes del CSV). Lanza `ValueError` si alguna regla no coincide entre pandas y DuckDB."""
    src = config.dataset_path()
    raw = cleaning.load_raw(src)
    res = cleaning.run_pipeline(raw, rules, verify=True)
    if not res.verified:
        bad = [s.id for s in res.steps if s.verified is False]
        raise ValueError(f"Las reglas {bad} no coinciden entre pandas y DuckDB; no se entrega el resultado.")
    csv = res.frame.to_csv(index=False, encoding="utf-8", lineterminator="\n").encode("utf-8")   # mismos bytes que escribe el guardado local
    info = {
        "rules": rules.model_dump(),
        "input": {"name": src.name, "sha256": cleaning.sha256_file(src), "rows": len(raw)},
        "output": {"rows": len(res.frame), "columns": list(res.frame.columns)},
        "steps": [s.as_dict() for s in res.steps],
        "dropped_columns": res.dropped_columns,
        "table2x2": cleaning.table2x2(res.frame),
    }
    return info, csv
