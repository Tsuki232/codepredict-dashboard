"""Carga perezosa del MOTOR de Ada (estadística verificada y laboratorio del péndulo) dentro de la puerta de enlace.

Importar Ada tarda (en un disco lento, ~20 s la primera vez): se hace en un hilo al arrancar y las rutas responden 503 «cargando» mientras tanto.
Solo se importan las partes que la API expone; nunca el agente completo ni sus herramientas.
Ada se busca en ADA_ROOT o, si no está definida, en la carpeta «Ada» junto a este repositorio.
"""
from __future__ import annotations

import os
import sys
import threading
from pathlib import Path
from types import SimpleNamespace
from typing import Any

_lock = threading.Lock()
_estado: dict[str, Any] = {"fase": "inactivo", "error": None, "ns": None}


def ada_src() -> Path:
    raiz = os.getenv("ADA_ROOT")
    base = Path(raiz).expanduser() if raiz else Path(__file__).resolve().parents[2] / "Ada"
    return (base / "src").resolve()


def _cargar() -> None:
    try:
        src = ada_src()
        if not (src / "ada").is_dir():
            raise FileNotFoundError(f"No encuentro Ada en {src}. Define ADA_ROOT.")
        if str(src) not in sys.path:
            sys.path.insert(0, str(src))
        from ada.pendulum import http_service as pendulo
        from ada.stats import inference, probability

        proceso, proceso_error = None, None
        try:   # el proceso completo de CodePredict (perfil, limpieza, inferencia): si falla, las rutas de estadística y del péndulo siguen funcionando
            backend = Path(__file__).resolve().parents[1] / "backend"
            if str(backend) not in sys.path:
                sys.path.insert(0, str(backend))
            os.environ["ADA_ENGINE"] = "local"     # dentro de la puerta de enlace el motor es SIEMPRE el Ada de este equipo (nunca otra API ni Python)
            for k in ("ADA_REMOTE_URL", "ADA_REMOTE_KEY"):
                os.environ.pop(k, None)
            from app.core import ada_engine, cleaning, inference as inferencia, proceso as proc

            ada_engine.start_loading()
            proceso = SimpleNamespace(cleaning=cleaning, inference=inferencia, proceso=proc, ada_engine=ada_engine)
        except Exception as e:  # noqa: BLE001
            proceso_error = f"{type(e).__name__}: {e}"
        _estado.update(ns=SimpleNamespace(inference=inference, probability=probability, pendulo=pendulo, codepredict=proceso, codepredict_error=proceso_error),
                       fase="listo", error=None)
    except Exception as e:  # noqa: BLE001  (se informa tal cual; no se oculta)
        _estado.update(fase="error", error=f"{type(e).__name__}: {e}")


def iniciar() -> None:
    """Empieza a cargar Ada en segundo plano (idempotente)."""
    with _lock:
        if _estado["fase"] != "inactivo":
            return
        _estado["fase"] = "cargando"
    threading.Thread(target=_cargar, name="ada-motor", daemon=True).start()


def estado() -> dict[str, Any]:
    return {"fase": _estado["fase"], "error": _estado["error"]}


class MotorNoListo(Exception):
    pass


def motor() -> SimpleNamespace:
    """Módulos de Ada listos para usar, o lanza MotorNoListo (la API lo traduce a 503)."""
    iniciar()
    if _estado["fase"] == "listo":
        return _estado["ns"]
    raise MotorNoListo(_estado["error"] or "Ada se está cargando; vuelve a intentarlo en unos segundos.")
