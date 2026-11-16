"""Puente con Ada, el motor estadístico verificado (cada resultado se calcula por dos vías independientes).

Hay tres formas de trabajar y el panel muestra siempre cuál está en uso:
  · Ada LOCAL     Ada está en este equipo (carpeta ..\\Ada o ADA_ROOT): se importa en un hilo al arrancar.
  · Ada REMOTA    Ada está en otro equipo del grupo: el panel le pide TODO el proceso (perfil, limpieza, inferencia) por su API (ADA_REMOTE_URL y ADA_REMOTE_KEY).
  · Python local  La persona eligió seguir sin Ada (modal «Ada no disponible»): limpieza y estadística calculadas aquí, con doble verificación propia (pystats).
ADA_ENGINE=auto (por defecto) usa Ada local si está y, si no, Ada remota; «local» o «remote» fuerzan una de las dos (para probar).
El modo Python solo se activa por decisión explícita de la persona (`set_motor('python')`); nunca se cae a él en silencio.
"""
from __future__ import annotations

import os
import re
import sys
import threading
import time
from types import SimpleNamespace
from typing import Any

from app.core import config

_lock = threading.Lock()
_state: dict[str, Any] = {"phase": "idle", "error": None, "seconds": None, "mode": None, "note": None}
_mods: SimpleNamespace | None = None
_pref: dict[str, str] = {"motor": "ada"}      # «ada» (local o remota) o «python»; lo cambia la persona con el modal
_py_mods: SimpleNamespace | None = None


class AdaNotReady(Exception):
    """Ada todavía se está cargando: pasa sola en unos segundos (la API responde 503 con code «ada_cargando»)."""


class AdaUnavailable(AdaNotReady):
    """Ada no se puede usar: no está instalada ni configurada, no responde, rechazó la clave... (503 con code «ada_no_disponible»: el panel ofrece Python)."""


def remote_config() -> tuple[str, str] | None:
    """URL y clave de la API de Ada: SOLO de variables de entorno (el cliente web no puede elegir a dónde se conecta el servidor)."""
    url, key = os.getenv("ADA_REMOTE_URL", "").strip().rstrip("/"), os.getenv("ADA_REMOTE_KEY", "").strip()
    return (url, key) if url.startswith(("http://", "https://")) and key else None


def _want() -> str:
    want = (os.getenv("ADA_ENGINE") or "auto").strip().lower()
    return want if want in ("auto", "local", "remote") else "auto"     # vacío (como en .env.example) o mal escrito: «auto»


# ----------------------------------------------------------------------------- elección de la persona: Ada o Python


def preferred() -> str:
    return _pref["motor"]


def set_motor(motor: str) -> None:
    if motor not in ("ada", "python"):
        raise ValueError("motor debe ser 'ada' o 'python'")
    _pref["motor"] = motor


def process_remote() -> bool:
    """¿Ada hace TODO el proceso (perfil, limpieza, inferencia) en otro equipo? Solo con la API configurada y sin Python elegido."""
    if _pref["motor"] == "python" or remote_config() is None:
        return False
    return _want() == "remote" or (_want() == "auto" and not config.ada_present())


# ----------------------------------------------------------------------------- carga de Ada (local o remota)


def _load_remote(t0: float, note: str | None = None) -> None:
    global _mods
    from app.core import ada_remote

    url, key = remote_config()  # type: ignore[misc]  (el llamador ya comprobó que existe)
    _mods = ada_remote.construir(url, key, AdaUnavailable)
    _state.update(phase="ready", error=None, seconds=round(time.time() - t0, 1), mode="remote", note=note)


def _load() -> None:
    global _mods
    t0 = time.time()
    want = _want()
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
    if _pref["motor"] == "python":
        return {"phase": "ready", "ready": True, "error": None, "load_seconds": 0, "mode": "python", "motor": "python", "root": None,
                "note": "Motor local de Python (sin Ada), elegido por la persona. Cada resultado lleva su doble verificación propia."}
    return {"phase": _state["phase"], "ready": _state["phase"] == "ready", "error": _state["error"], "load_seconds": _state["seconds"], "motor": "ada",
            "mode": _state["mode"], "note": _state["note"], "root": str(config.ada_root()) if _state["mode"] == "local" else None}


def ensure_usable() -> None:
    """El proceso (perfil, limpieza, guardado) lo hace Ada. Si Ada no se puede usar (ni está en este equipo, ni hay API configurada, o falló al cargar) se avisa
    con AdaUnavailable —el panel abre el modal— en vez de seguir por la libre. Con Python elegido, o con Ada remota (ahí un fallo sale al llamarla), no estorba."""
    if _pref["motor"] == "python" or process_remote():
        return
    if _want() != "remote" and not config.ada_present() and remote_config() is None:
        raise AdaUnavailable(f"No encuentro Ada en {config.ada_root() / 'src'}. Define ADA_ROOT (o ADA_REMOTE_URL y ADA_REMOTE_KEY para usar la API de Ada).")
    start_loading()
    if _state["phase"] == "error":
        raise AdaUnavailable(re.sub(r"^\w*(Error|Exception): ", "", _state["error"] or "") or "Ada no está disponible.")


def require() -> SimpleNamespace:
    """Módulos estadísticos en uso (Ada local, Ada remota o Python local). Si Ada no se puede usar, lanza AdaUnavailable (503 «ada_no_disponible»)
    o, si solo se está cargando, AdaNotReady (503 «ada_cargando»)."""
    global _py_mods
    if _pref["motor"] == "python":
        if _py_mods is None:
            from app.core import pystats

            _py_mods = pystats.construir()
        return _py_mods
    start_loading()
    if _state["phase"] == "ready" and _mods is not None:
        return _mods
    if _state["phase"] == "error":
        raise AdaUnavailable(re.sub(r"^\w*(Error|Exception): ", "", _state["error"] or "") or "Ada no está disponible.")   # sin el nombre técnico de la excepción
    raise AdaNotReady("Ada todavía se está cargando; vuelve a intentarlo en unos segundos.")
