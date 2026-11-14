"""Rutas y ajustes del proyecto. Todo se puede cambiar con variables de entorno (o con un archivo .env en la raíz).

    ADA_ROOT            carpeta del repositorio de Ada (motor estadístico verificado). Por defecto, ../Ada junto a este proyecto.
    CODEPREDICT_DATASET CSV de entrada (Unified-file.csv). Por defecto, el que dejó el perfilado de la bitácora dentro de Ada.
    CODEPREDICT_WORK    carpeta de salida. Por defecto, <ADA_ROOT>/data/work/codepredict (nunca data/raw).
"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]  # raíz del proyecto (contiene backend/ y frontend/)

_UNIFIED = Path("data") / "work" / "unified_bug_dataset" / "extract" / "UnifiedBugDataset-1.2" / "Unified-file.csv"


def ada_root() -> Path:
    env = os.getenv("ADA_ROOT")
    if env:
        return Path(env).expanduser().resolve()
    for cand in (ROOT.parent / "Ada", Path(r"G:\programas\Ada")):
        if (cand / "src" / "ada").is_dir():
            return cand.resolve()
    return (ROOT.parent / "Ada").resolve()


def dataset_path() -> Path:
    env = os.getenv("CODEPREDICT_DATASET")
    return Path(env).expanduser().resolve() if env else (ada_root() / _UNIFIED).resolve()


def work_dir() -> Path:
    env = os.getenv("CODEPREDICT_WORK")
    return Path(env).expanduser().resolve() if env else (ada_root() / "data" / "work" / "codepredict").resolve()


class UnsafeWritePath(Exception):
    """Se intentó escribir donde no se debe (por ejemplo, dentro de data/raw)."""


def assert_safe_output(target: Path) -> Path:
    """Garantiza que una escritura no toque datos crudos: ninguna carpeta del camino puede llamarse `raw`
    y el destino debe estar dentro de la carpeta de trabajo. (Si Ada está cargada, además se valida con la suya.)"""
    resolved = Path(target).resolve()
    if "raw" in {p.name.lower() for p in resolved.parents} or resolved.name.lower() == "raw":
        raise UnsafeWritePath(f"Los datos crudos son de solo lectura: {resolved}")
    base = work_dir()
    if resolved != base and base not in resolved.parents:
        raise UnsafeWritePath(f"Solo se escribe dentro de {base}; destino pedido: {resolved}")
    return resolved
