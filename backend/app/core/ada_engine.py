"""Puente con Ada, el motor estadístico verificado (cada resultado se calcula por dos vías independientes).

Importar Ada tarda (en un disco lento, ~20 s la primera vez), así que se carga en un hilo al arrancar y los
endpoints preguntan `status()`. Si Ada no está, la limpieza funciona igual; la inferencia avisa con claridad.
"""
from __future__ import annotations

import os
import sys
import threading
import time
from types import SimpleNamespace
from typing import Any

from app.core import config

_lock = threading.Lock()
_state: dict[str, Any] = {"phase": "idle", "error": None, "seconds": None, "mode": None, "note": None}
_mods: SimpleNamespace | None = None


def remote_config() -> tuple[str, str] | None:
    """URL y clave de la API de Ada: SOLO de variables de entorno (el cliente web no puede elegir a dónde se conecta el servidor)."""
    url, key = os.getenv("ADA_REMOTE_URL", "").strip().rstrip("/"), os.getenv("ADA_REMOTE_KEY", "").strip()
    return (url, key) if url.startswith(("http://", "https://")) and key else None


def _load_remote(t0: float, note: str | None = None) -> None:
    global _mods
    from app.core import ada_remote

    url, key = remote_config()  # type: ignore[misc]  (el llamador ya comprobó que existe)
    _mods = ada_remote.construir(url, key, AdaNotReady)
    _state.update(phase="ready", error=None, seconds=round(time.time() - t0, 1), mode="remote", note=note)


def _load() -> None:
    """ADA_ENGINE=auto (por defecto): Ada local si está en este equipo; si no, la API remota (si hay ADA_REMOTE_URL y ADA_REMOTE_KEY).
    ADA_ENGINE=local o remote fuerza una de las dos (para probar)."""
    global _mods
    t0 = time.time()
    want = (os.getenv("ADA_ENGINE") or "auto").strip().lower()
    if want not in ("auto", "local", "remote"):  # vacío (como en .env.example) o con un error de escritura: se comporta como «auto»
        want = "auto"
    remote = remote_config()
    try:
        if want == "remote" or (want != "local" and not config.ada_present() and remote):
            if not remote:
                raise RuntimeError("ADA_ENGINE=remote necesita ADA_REMOTE_URL y ADA_REMOTE_KEY en el archivo .env.")
            _load_remote(t0)
            return
        src = config.ada_root() / "src"
        if not (src / "ada").is_dir():
            raise FileNotFoundError(f"No encuentro Ada en {src}. Define ADA_ROOT (o ADA_REMOTE_URL y ADA_REMOTE_KEY para usar la API de Ada).")
        if str(src) not in sys.path:
            sys.path.insert(0, str(src))
        from ada.audit import ledger
        from ada.config import assert_safe_write_path
        from ada.stats import inference, probability

        _mods = SimpleNamespace(inference=inference, probability=probability, ledger=ledger, assert_safe_write_path=assert_safe_write_path)
        _state.update(phase="ready", error=None, seconds=round(time.time() - t0, 1), mode="local", note=None)
    except Exception as e:  # noqa: BLE001  (se informa tal cual al usuario; no se oculta)
        if want == "auto" and remote and _state["mode"] is None:  # Ada local falló al importar: se usa la API, y se dice
            _load_remote(t0, note=f"Ada local no cargó ({type(e).__name__}: {e}); se usa la API remota.")
            return
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
            "mode": _state["mode"], "note": _state["note"], "root": str(config.ada_root()) if _state["mode"] != "remote" else None}


def require() -> SimpleNamespace:
    """Devuelve los módulos de Ada o lanza AdaNotReady (que la API traduce a 503)."""
    start_loading()
    if _state["phase"] == "ready" and _mods is not None:
        return _mods
    raise AdaNotReady(_state["error"] or "Ada todavía se está cargando; vuelve a intentarlo en unos segundos.")


class AdaNotReady(Exception):
    pass
