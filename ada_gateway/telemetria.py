"""Telemetría REAL de la puerta de enlace: qué pide cada compañero, cuánto tarda y qué verificó Ada.

Lo que se guarda son SOLO metadatos y un resumen del resultado, en un archivo local (`telemetria/eventos.jsonl`) que lee el panel «Ada en vivo» de este PC.
Nunca se guardan: claves, direcciones IP, cuerpos de petición, datos de los archivos ni textos generados. A cada compañero se le asigna un código corto
(HMAC de su dirección con una sal que solo existe en este PC): sirve para distinguir a una persona de otra, no para identificarla.
Si algo falla al escribir, la puerta de enlace sigue atendiendo: la telemetría nunca puede tumbar el servicio.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from contextvars import ContextVar
from pathlib import Path
from typing import Any

MAX_BYTES = int(os.getenv("GATEWAY_TELEMETRIA_MAX_BYTES", str(4_000_000)))       # al pasar de este tamaño se archiva y se empieza otro (no crece sin fin)
ARCHIVO = "eventos.jsonl"
_lock = threading.Lock()
_actual: ContextVar[dict[str, Any] | None] = ContextVar("telemetria_actual", default=None)
_sal_cache: dict[str, bytes] = {}


def carpeta() -> Path:
    return Path(os.getenv("GATEWAY_TELEMETRIA_DIR") or Path(__file__).with_name("telemetria"))


def _sal() -> bytes:
    d = carpeta()
    clave = str(d)
    if clave in _sal_cache:
        return _sal_cache[clave]
    d.mkdir(parents=True, exist_ok=True)
    f = d / ".sal"
    if not f.exists():
        f.write_bytes(secrets.token_bytes(32))
    _sal_cache[clave] = f.read_bytes()
    return _sal_cache[clave]


def cliente(ip: str | None) -> str:
    """Código corto y estable por dirección (6 hex). Sin la sal de este PC no se puede volver a la dirección."""
    try:
        return hmac.new(_sal(), (ip or "?").encode(), hashlib.sha256).hexdigest()[:6]
    except Exception:  # noqa: BLE001  (sin poder guardar la sal no se puede dar un código estable; la petición se atiende igual)
        return "------"


def registrar(evento: dict[str, Any]) -> None:
    """Añade un evento al archivo. Nunca lanza: si no se puede escribir, se descarta (la telemetría no puede tumbar el servicio)."""
    try:
        evento.setdefault("t", round(time.time(), 3))
        linea = json.dumps(evento, ensure_ascii=False, separators=(",", ":"), default=str)
        with _lock:
            d = carpeta()
            d.mkdir(parents=True, exist_ok=True)
            f = d / ARCHIVO
            if f.exists() and f.stat().st_size > MAX_BYTES:
                f.replace(d / "eventos.1.jsonl")
            with f.open("a", encoding="utf-8", newline="\n") as fh:      # siempre \n (en Windows el modo texto escribiría \r\n)
                fh.write(linea + "\n")
    except Exception:  # noqa: BLE001
        pass


# ----------------------------------------------------------------------------- notas que añaden las rutas (resumen del resultado, nunca los datos)


def abrir(nota: dict[str, Any]):
    return _actual.set(nota)


def cerrar(token) -> None:
    _actual.reset(token)


def nota(**datos: Any) -> None:
    """Las rutas llaman a esto para dejar un resumen de lo que hizo Ada en ESTA petición."""
    d = _actual.get()
    if d is not None:
        d.update(datos)


def resumen_prueba(tipo: str, compacto: dict[str, Any], completo: dict[str, Any] | None = None, **extra: Any) -> None:
    """Resumen de una prueba estadística de Ada: qué prueba, cifras clave y si sus dos vías coincidieron.
    La diferencia entre las dos vías solo viene en el resultado completo (el compacto no la trae)."""
    nota(tipo=tipo, prueba=compacto.get("test"), estadistico=compacto.get("statistic", compacto.get("posterior")), df=compacto.get("df"), p=compacto.get("p_value"),
         verificado=compacto.get("verified"), vias=compacto.get("verification_methods"), discrepancia=(completo or compacto).get("discrepancy"), n=compacto.get("n"), **extra)


def pasos(steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Pasos de limpieza de Ada tal como terminaron: cuántas filas había, cuántas quedaron y si pandas y DuckDB coincidieron."""
    return [{"id": s.get("id"), "titulo": s.get("label"), "antes": s.get("before"), "despues": s.get("after"), "verificado": s.get("verified"), "vias": s.get("methods")} for s in steps]
