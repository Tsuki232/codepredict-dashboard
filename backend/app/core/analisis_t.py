"""Une el conjunto limpio y guardado con la t de Student (tstudent.py). Sin Ada ni ninguna IA: solo código propio, corto y verificable.

Cada resultado se guarda en caché con la huella SHA-256 del conjunto limpio, así que cambia solo si cambia el conjunto (o α, la hipótesis, la semilla…).
"""
from __future__ import annotations

from functools import lru_cache
from typing import Any

import numpy as np
import pandas as pd

from app.core import tstudent, workspace

REPETICIONES_MIN, REPETICIONES_MAX = 200, 10_000


def _grupos(frame: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    x = frame.loc[frame["defectuoso"] == 1, "McCC"].to_numpy(float)
    y = frame.loc[frame["defectuoso"] == 0, "McCC"].to_numpy(float)
    if x.size < 2 or y.size < 2:
        raise ValueError("Cada grupo necesita al menos 2 archivos: revisa las reglas de limpieza.")
    return x, y


def _meta(frame: pd.DataFrame, man: dict[str, Any]) -> dict[str, Any]:
    return {"sha256": man["output"]["sha256"], "filas": int(len(frame)), "reglas": man["rules"], "creado": man["created_utc"]}


@lru_cache(maxsize=16)
def _welch(sha: str, alpha: float, alternativa: str) -> dict[str, Any]:
    frame, man = workspace.load_clean()
    x, y = _grupos(frame)
    return {**tstudent.welch(x, y, alpha, alternativa), "meta": _meta(frame, man)}


def welch(alpha: float = 0.05, alternativa: str = "two-sided") -> dict[str, Any]:
    man = workspace.read_manifest()
    if man is None:
        raise FileNotFoundError("Todavía no hay un conjunto limpio guardado. Aplica la limpieza primero.")
    workspace.load_clean()     # comprueba la huella del archivo antes de usar la caché
    return _welch(man["output"]["sha256"], float(alpha), alternativa)


@lru_cache(maxsize=8)
def _permutacion(sha: str, repeticiones: int, semilla: int) -> dict[str, Any]:
    frame, man = workspace.load_clean()
    x, y = _grupos(frame)
    return {**tstudent.permutacion(x, y, repeticiones, semilla), "meta": _meta(frame, man)}


def permutacion(repeticiones: int = 2000, semilla: int = tstudent.SEMILLA) -> dict[str, Any]:
    if not REPETICIONES_MIN <= repeticiones <= REPETICIONES_MAX:
        raise ValueError(f"repeticiones debe estar entre {REPETICIONES_MIN} y {REPETICIONES_MAX}.")
    man = workspace.read_manifest()
    if man is None:
        raise FileNotFoundError("Todavía no hay un conjunto limpio guardado. Aplica la limpieza primero.")
    workspace.load_clean()
    return _permutacion(man["output"]["sha256"], int(repeticiones), int(semilla))


@lru_cache(maxsize=4)
def _neurona(sha: str) -> dict[str, Any]:
    frame, man = workspace.load_clean()
    return {**tstudent.neurona(frame["McCC"].to_numpy(float), frame["defectuoso"].to_numpy(float)), "meta": _meta(frame, man)}


def neurona() -> dict[str, Any]:
    man = workspace.read_manifest()
    if man is None:
        raise FileNotFoundError("Todavía no hay un conjunto limpio guardado. Aplica la limpieza primero.")
    workspace.load_clean()
    return _neurona(man["output"]["sha256"])


def limpiar_cache() -> None:
    _welch.cache_clear()
    _permutacion.cache_clear()
    _neurona.cache_clear()
