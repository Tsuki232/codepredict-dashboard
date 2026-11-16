"""Guardado del conjunto limpio (solo en la carpeta de trabajo, nunca en data/raw) con su manifiesto y huellas SHA-256."""
from __future__ import annotations

import json
import platform
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd

from app.core import ada_engine, cleaning, config

CLEAN_NAME = "unified_file_limpio.csv"
MANIFEST_NAME = "manifest.json"


class NotVerified(Exception):
    """Alguna regla no coincidió entre pandas y DuckDB: no se guarda nada."""


def manifest_path() -> Path:
    return config.work_dir() / MANIFEST_NAME


def read_manifest() -> dict[str, Any] | None:
    p = manifest_path()
    if not p.is_file():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _apply_remote(rules: cleaning.Rules) -> dict[str, Any]:
    """Ada (en otro equipo) hace la limpieza verificada y devuelve el CSV; aquí solo se comprueba y se guarda en la carpeta de trabajo (nunca en data/raw)."""
    from app.core import ada_proceso

    info, csv = ada_proceso.conjunto_limpio(rules)
    src = config.dataset_path()
    same = bool(cleaning.sha256_file(src) == info["input"]["sha256"]) if src.is_file() else None
    if same is False:
        raise ada_proceso.ProcesoRemotoError(409, "El CSV que usa Ada y el de este equipo no son el mismo archivo (huellas SHA-256 distintas): no se guardó. "
                                                   "Actualiza el repositorio en uno de los dos equipos.")
    out_dir = config.assert_safe_output(config.work_dir())
    out_csv = config.assert_safe_output(out_dir / CLEAN_NAME)
    out_man = config.assert_safe_output(out_dir / MANIFEST_NAME)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_csv.write_bytes(csv)
    manifest: dict[str, Any] = {
        "created_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "rules": rules.model_dump(),        # las de este panel, no la copia que Ada devuelve (ella las valida y pasa 10 a 10.0): así el manifiesto es igual al local
        "input": {"path": f"(en el equipo de Ada) {info['input']['name']}", "sha256": info["input"]["sha256"], "rows": info["input"]["rows"], "same_as_local": same},
        "output": {"path": str(out_csv), "sha256": cleaning.sha256_file(out_csv), "rows": info["output"]["rows"], "columns": info["output"]["columns"]},
        "steps": info["steps"],
        "dropped_columns": info["dropped_columns"],
        "table2x2": info["table2x2"],
        "verification": "cada regla: pandas contra DuckDB, coincidencia exacta de filas quitadas (hecho por Ada en otro equipo)",
        "engine": "ada-remota",
        "python": platform.python_version(),
        "pandas": pd.__version__,
        "audit": {"skipped": "El registro de auditoría de Ada lo lleva el PC que corre Ada, no este equipo."},
    }
    out_man.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    load_clean.cache_clear()
    return manifest


def apply_cleaning(rules: cleaning.Rules) -> dict[str, Any]:
    if ada_engine.process_remote():
        return _apply_remote(rules)
    src = config.dataset_path()
    raw = cleaning.load_raw(src)
    res = cleaning.run_pipeline(raw, rules, verify=True)
    if not res.verified:
        bad = [s.id for s in res.steps if s.verified is False]
        raise NotVerified(f"Las reglas {bad} no coinciden entre pandas y DuckDB; no se guardó el resultado.")

    out_dir = config.assert_safe_output(config.work_dir())
    out_csv = config.assert_safe_output(out_dir / CLEAN_NAME)
    out_man = config.assert_safe_output(out_dir / MANIFEST_NAME)
    out_dir.mkdir(parents=True, exist_ok=True)
    res.frame.to_csv(out_csv, index=False, encoding="utf-8", lineterminator="\n")
    in_sha, out_sha = cleaning.sha256_file(src), cleaning.sha256_file(out_csv)

    manifest: dict[str, Any] = {
        "created_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "rules": rules.model_dump(),
        "input": {"path": str(src), "sha256": in_sha, "rows": len(raw)},
        "output": {"path": str(out_csv), "sha256": out_sha, "rows": len(res.frame), "columns": list(res.frame.columns)},
        "steps": [s.as_dict() for s in res.steps],
        "dropped_columns": res.dropped_columns,
        "table2x2": cleaning.table2x2(res.frame),
        "verification": "cada regla: pandas contra DuckDB, coincidencia exacta de filas quitadas",
        "engine": "python-local" if ada_engine.preferred() == "python" else "ada-local",
        "python": platform.python_version(),
        "pandas": pd.__version__,
    }
    audit: dict[str, Any] | None = None
    try:  # La auditoría de Ada es un registro extra: si Ada no está lista, se dice y no se bloquea la limpieza.
        ada = ada_engine.require()
        ada.assert_safe_write_path(out_csv)
        entry = ada.ledger.record_audit_event(
            "codepredict_limpieza", {"rules": manifest["rules"], "rows_in": len(raw), "rows_out": len(res.frame),
                                     "steps": [(s.id, s.before, s.after) for s in res.steps]},
            input_path=src, output_path=out_csv)
        audit = {"ledger": str(ada.ledger.DEFAULT_LEDGER_PATH), "timestamp_utc": entry["timestamp_utc"]}
    except ada_engine.AdaNotReady as e:
        audit = {"skipped": str(e)}
    except Exception as e:  # noqa: BLE001  (p. ej. la carpeta de trabajo está fuera de las rutas que Ada autoriza)
        audit = {"skipped": f"{type(e).__name__}: {e}"}
    manifest["audit"] = audit
    out_man.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    load_clean.cache_clear()
    return manifest


@lru_cache(maxsize=1)
def _load_clean(path: str, mtime_ns: int) -> pd.DataFrame:
    return pd.read_csv(path, dtype={c: "string" for c in cleaning.IDS})


def load_clean() -> tuple[pd.DataFrame, dict[str, Any]]:
    """Lee el conjunto limpio guardado; comprueba que el archivo no cambió desde que se guardó (huella)."""
    man = read_manifest()
    if man is None:
        raise FileNotFoundError("Todavía no hay un conjunto limpio guardado. Aplica la limpieza primero.")
    p = Path(man["output"]["path"])
    if not p.is_file():
        raise FileNotFoundError(f"Falta el archivo limpio: {p}")
    if cleaning.sha256_file(p) != man["output"]["sha256"]:
        raise ValueError("El archivo limpio cambió desde que se guardó (la huella SHA-256 no coincide). Vuelve a aplicar la limpieza.")
    return _load_clean(str(p), p.stat().st_mtime_ns).copy(), man


load_clean.cache_clear = _load_clean.cache_clear  # type: ignore[attr-defined]
