"""Puente con Ada, el motor estadístico verificado (cada resultado se calcula por dos vías independientes).

Importar Ada tarda (en un disco lento, ~20 s la primera vez), así que se carga en un hilo al arrancar y los
endpoints preguntan `status()`. Si Ada no está, la limpieza funciona igual; la inferencia avisa con claridad.
"""
from __future__ import annotations

import sys
import threading
import time
from types import SimpleNamespace
from typing import Any

from app.core import config

_lock = threading.Lock()
_state: dict[str, Any] = {"phase": "idle", "error": None, "seconds": None}
_mods: SimpleNamespace | None = None


def _load() -> None:
    global _mods
    t0 = time.time()
    try:
        src = config.ada_root() / "src"
        if not (src / "ada").is_dir():
            raise FileNotFoundError(f"No encuentro Ada en {src}. Define ADA_ROOT.")
        if str(src) not in sys.path:
            sys.path.insert(0, str(src))
        from ada.audit import ledger
        from ada.config import assert_safe_write_path
        from ada.stats import inference, probability

        _mods = SimpleNamespace(inference=inference, probability=probability, ledger=ledger, assert_safe_write_path=assert_safe_write_path)
        _state.update(phase="ready", error=None, seconds=round(time.time() - t0, 1))
    except Exception as e:  # noqa: BLE001  (se informa tal cual al usuario; no se oculta)
        _state.update(phase="error", error=f"{type(e).__name__}: {e}", seconds=round(time.time() - t0, 1))


def start_loading() -> None:
    """Inicia la carga en segundo plano (idempotente)."""
    with _lock:
        if _state["phase"] != "idle":
            return
        _state["phase"] = "loading"
    threading.Thread(target=_load, name="ada-loader", daemon=True).start()


def status() -> dict[str, Any]:
    return {"phase": _state["phase"], "ready": _state["phase"] == "ready", "error": _state["error"], "load_seconds": _state["seconds"],
            "root": str(config.ada_root())}


def require() -> SimpleNamespace:
    """Devuelve los módulos de Ada o lanza AdaNotReady (que la API traduce a 503)."""
    start_loading()
    if _state["phase"] == "ready" and _mods is not None:
        return _mods
    raise AdaNotReady(_state["error"] or "Ada todavía se está cargando; vuelve a intentarlo en unos segundos.")


class AdaNotReady(Exception):
    pass
