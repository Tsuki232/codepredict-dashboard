"""Ada hace TODO el proceso en otro equipo: cliente de las rutas /v1/codepredict/* de la puerta de enlace de Ada.

El panel solo manda las reglas de limpieza y recibe el resultado ya calculado (perfil, limpieza verificada, inferencia). El CSV lo lee Ada de su propia copia.
La clave va solo en la cabecera `X-API-Key` y nunca aparece en un mensaje de error. Si Ada no responde se lanza `AdaUnavailable` y el panel ofrece seguir con Python.
"""
from __future__ import annotations

import base64
import gzip
import hashlib
from functools import lru_cache
from typing import Any

import httpx

from app.core import ada_engine, cleaning, config

TIMEOUT_S = 240.0          # la limpieza verificada de 43 744 filas y la inferencia completa tardan segundos; el tope es para no colgar el panel


class ProcesoRemotoError(Exception):
    """Ada respondió, pero rechazó la petición (datos inválidos, conjunto no verificado, archivo ausente): se repite tal cual al usuario."""

    def __init__(self, status: int, mensaje: str):
        super().__init__(mensaje)
        self.status, self.mensaje = status, mensaje


def _llamar(metodo: str, ruta: str, cuerpo: dict[str, Any] | None = None) -> dict[str, Any]:
    cfg = ada_engine.remote_config()
    if cfg is None:
        raise ada_engine.AdaUnavailable("Falta ADA_REMOTE_URL y ADA_REMOTE_KEY en el archivo .env.")
    url, clave = cfg
    try:
        with httpx.Client(timeout=TIMEOUT_S) as c:
            r = c.request(metodo, f"{url}{ruta}", json=cuerpo, headers={"X-API-Key": clave})
    except httpx.HTTPError:
        raise ada_engine.AdaUnavailable("Ada remota no responde: el PC que corre Ada puede estar apagado o sin túnel.") from None
    if r.status_code == 200:
        try:
            return r.json()
        except ValueError:
            raise ada_engine.AdaUnavailable("Esa dirección respondió algo que no es la API de Ada; revisa ADA_REMOTE_URL.") from None
    try:
        detalle = str(r.json().get("detail", "error"))
    except (ValueError, AttributeError):
        detalle = "error"
    if r.status_code == 401:
        raise ada_engine.AdaUnavailable("Ada remota rechazó la clave: revisa ADA_REMOTE_KEY en el archivo .env.")
    if r.status_code in (404, 405) and detalle == "Not Found":        # la ruta no existe: el servidor de Ada es de una versión anterior (un 404 «de verdad» trae otro texto)
        raise ada_engine.AdaUnavailable("El servidor de Ada es de una versión anterior y no ofrece el proceso completo: actualiza y reinicia el servidor de Ada (scripts/start_ada_server.ps1).")
    if 520 <= r.status_code <= 530:         # Cloudflare contesta él mismo cuando el túnel está caído: 530 (error 1033) si el PC de Ada está apagado, 521–524 si no responde
        raise ada_engine.AdaUnavailable("Ada remota no responde: el PC que corre Ada puede estar apagado o sin túnel.")
    if r.status_code in (429, 502, 503, 504):
        raise ada_engine.AdaUnavailable(f"Ada remota está ocupada o cargándose ({r.status_code}): {detalle}")
    raise ProcesoRemotoError(r.status_code, f"Ada remota respondió: {detalle}")


def perfil() -> dict[str, Any]:
    d = _llamar("GET", "/v1/codepredict/perfil")
    src = d.get("source") or {}
    try:                                   # ¿es el mismo CSV que tiene este equipo? (si no, los números no son comparables con los de aquí)
        local = config.dataset_path()
        src["same_as_local"] = bool(local.is_file() and cleaning.sha256_file(local) == src.get("sha256"))
    except OSError:
        src["same_as_local"] = None
    src["computed_by"] = "ada-remota"
    d["source"] = src
    return d


def vista(rules: cleaning.Rules) -> dict[str, Any]:
    return _llamar("POST", "/v1/codepredict/limpieza", rules.model_dump())


@lru_cache(maxsize=16)
def _inferencia(rules_json: str, alpha: float, alternative: str) -> dict[str, Any]:
    rules = cleaning.Rules.model_validate_json(rules_json)
    return _llamar("POST", "/v1/codepredict/inferencia", {"rules": rules.model_dump(), "alpha": alpha, "alternative": alternative})


def inferencia(rules: cleaning.Rules, alpha: float, alternative: str) -> dict[str, Any]:
    """Limpieza + inferencia completas hechas por Ada con esas reglas. La respuesta se completa con lo que solo este equipo sabe (su conjunto guardado)."""
    from app.core import workspace

    d = {**_inferencia(rules.model_dump_json(), float(alpha), alternative)}
    meta = {**d.get("meta", {})}
    man = workspace.read_manifest()
    meta["matches_saved"] = bool(man and man["rules"] == rules.model_dump())
    meta["ada"] = ada_engine.status()
    meta["source"] = f"{meta.get('source', 'vista en vivo')} · calculada por Ada en otro equipo"
    d["meta"] = meta
    return d


def conjunto_limpio(rules: cleaning.Rules) -> tuple[dict[str, Any], bytes]:
    """El conjunto limpio hecho por Ada: (datos del proceso, bytes del CSV). Se comprueba tamaño y huella SHA-256 antes de entregarlo."""
    d = _llamar("POST", "/v1/codepredict/limpio", rules.model_dump())
    try:
        csv = gzip.decompress(base64.b64decode(d["csv_gzip_base64"]))
    except (KeyError, ValueError, OSError):
        raise ProcesoRemotoError(502, "Ada remota devolvió el conjunto limpio en un formato que no entiendo.") from None
    if len(csv) != d.get("csv_bytes") or hashlib.sha256(csv).hexdigest() != d.get("csv_sha256"):
        raise ProcesoRemotoError(502, "El conjunto limpio llegó dañado (no coincide su tamaño o su huella SHA-256): no se guardó.")
    return d["info"], csv


def limpiar_cache() -> None:
    _inferencia.cache_clear()
