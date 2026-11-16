"""API de CodePredict Dashboard: perfil, limpieza (vista previa y aplicar) e inferencia con Ada."""
from __future__ import annotations

from typing import Any, Literal

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.core import ada_engine, ada_proceso, cleaning, config, inference, notebook, proceso, workspace

router = APIRouter(prefix="/api")


# ----------------------------------------------------------------------------- asistente (Ada con modelo de lenguaje, por un túnel)


def _remoto() -> tuple[str, str] | None:
    """URL y clave de la API de Ada (la misma para el asistente y para el cálculo remoto): SOLO de variables de entorno."""
    return ada_engine.remote_config()


@router.get("/assistant/status")
async def assistant_status() -> dict[str, Any]:
    r = _remoto()
    if r is None:
        return {"configured": False, "reachable": False, "detail": "No está configurado (ADA_REMOTE_URL y ADA_REMOTE_KEY en el archivo .env)."}
    try:
        async with httpx.AsyncClient(timeout=4) as c:
            ok = (await c.get(f"{r[0]}/health")).status_code == 200
    except httpx.HTTPError:
        ok = False
    return {"configured": True, "reachable": ok, "detail": "Listo." if ok else "No responde: el PC que corre Ada puede estar apagado."}


class AssistantRequest(BaseModel):
    modo: Literal["explicar", "repaso"] = "explicar"
    resultado: dict[str, Any]


@router.post("/assistant/explain")
async def assistant_explain(req: AssistantRequest) -> dict[str, Any]:
    """Reenvía un resultado ya calculado a la puerta de enlace de Ada y devuelve su explicación. La clave no sale del servidor."""
    r = _remoto()
    if r is None:
        raise HTTPException(503, "El asistente no está configurado en este equipo (faltan ADA_REMOTE_URL y ADA_REMOTE_KEY en .env).")
    try:
        async with httpx.AsyncClient(timeout=200) as c:
            resp = await c.post(f"{r[0]}/v1/explicar", json=req.model_dump(), headers={"X-API-Key": r[1]})
    except httpx.HTTPError:
        raise HTTPException(503, "El asistente no responde: el PC que corre Ada puede estar apagado o sin túnel.") from None
    if resp.status_code == 401:
        raise HTTPException(502, "El asistente rechazó la clave: revisa ADA_REMOTE_KEY.")
    if resp.status_code != 200:
        detalle = resp.json().get("detail", "error") if resp.headers.get("content-type", "").startswith("application/json") else "error"
        raise HTTPException(resp.status_code if resp.status_code in (413, 429, 503) else 502, f"El asistente respondió: {detalle}")
    d = resp.json()
    return {k: d.get(k) for k in ("texto", "modelo", "segundos", "cifras_no_verificadas")}


# ----------------------------------------------------------------------------- cuaderno (celda por celda)


class CellRequest(BaseModel):
    cell_id: str
    rules: cleaning.Rules = cleaning.Rules()
    alpha: float = 0.05
    alternative: Literal["two-sided", "greater", "less"] = "two-sided"


@router.get("/notebook/cells")
def notebook_cells() -> dict:
    return {"cells": notebook.catalog(), **notebook.status()}


@router.post("/notebook/reset")
def notebook_reset() -> dict:
    notebook.reset()
    return notebook.status()


@router.post("/notebook/run")
def notebook_run(req: CellRequest) -> dict:
    try:
        return notebook.run_cell(req.cell_id, req.rules, req.alpha, req.alternative)
    except KeyError as e:
        raise HTTPException(404, f"No existe la celda {e}") from e
    except notebook.NotReady as e:
        raise HTTPException(409, str(e)) from e
    except workspace.NotVerified as e:      # AdaNotReady/AdaUnavailable suben al manejador de main.py (503 con code «ada_cargando» o «ada_no_disponible»)
        raise HTTPException(409, str(e)) from e
    except (ValueError, FileNotFoundError) as e:
        raise HTTPException(422, str(e)) from e


@router.get("/health")
def health() -> dict:
    ds = config.dataset_path()
    return {"status": "ok", "ada": ada_engine.status(),
            "dataset": {"path": str(ds), "exists": ds.is_file()}, "work_dir": str(config.work_dir())}


def _raw():
    try:
        p = config.dataset_path()
        return cleaning.load_raw(p), p
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


@router.get("/dataset/profile")
def profile() -> dict:
    ada_engine.ensure_usable()               # sin Ada (y sin haber elegido Python) → 503 «ada_no_disponible» y el panel abre el modal
    if ada_engine.process_remote():          # Ada lee su copia del CSV y devuelve el perfil
        return ada_proceso.perfil()
    try:
        return proceso.perfil()
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


class EngineRequest(BaseModel):
    motor: Literal["ada", "python"]


def _engine_info() -> dict[str, Any]:
    return {"motor": ada_engine.preferred(), "proceso_en_ada_remota": ada_engine.process_remote(), "ada": ada_engine.status()}


@router.get("/engine")
def get_engine() -> dict:
    return _engine_info()


@router.post("/engine")
def set_engine(req: EngineRequest) -> dict:
    """La persona elige con qué motor trabajar: Ada (local o remota) o el motor local de Python (modal «Ada no disponible»).
    Al cambiar se descartan los resultados guardados en memoria, para no mezclar cifras de dos motores."""
    if req.motor != ada_engine.preferred():
        ada_engine.set_motor(req.motor)
        inference._cached.cache_clear()
        inference._live_cached.cache_clear()
        ada_proceso.limpiar_cache()
        notebook.reset()
    return _engine_info()


@router.get("/clean/defaults")
def defaults() -> dict:
    return cleaning.Rules().model_dump()


@router.post("/clean/preview")
def preview(rules: cleaning.Rules) -> dict:
    ada_engine.ensure_usable()
    if ada_engine.process_remote():          # Ada limpia en su equipo (cada regla verificada pandas/DuckDB) y devuelve la vista previa
        return ada_proceso.vista(rules)
    _raw()                                   # mismos errores 404/422 de siempre si falta el CSV
    return proceso.vista(rules)


@router.get("/clean/status")
def status() -> dict:
    man = workspace.read_manifest()
    return {"applied": man is not None, "manifest": man}


@router.post("/clean/apply")
def apply(rules: cleaning.Rules) -> dict:
    ada_engine.ensure_usable()
    try:
        return workspace.apply_cleaning(rules)
    except workspace.NotVerified as e:
        raise HTTPException(409, str(e)) from e
    except config.UnsafeWritePath as e:
        raise HTTPException(403, str(e)) from e
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e


class InferenceRequest(BaseModel):
    alpha: float = 0.05
    alternative: Literal["two-sided", "greater", "less"] = "two-sided"


@router.post("/inference")
def run_inference(req: InferenceRequest) -> dict:
    try:
        return inference.run(req.alpha, req.alternative)
    except FileNotFoundError as e:
        raise HTTPException(409, str(e)) from e
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


class LiveRequest(BaseModel):
    rules: cleaning.Rules = cleaning.Rules()
    alpha: float = 0.05
    alternative: Literal["two-sided", "greater", "less"] = "two-sided"


@router.post("/inference/live")
def inference_live(req: LiveRequest) -> dict:
    """Inferencia sobre las reglas de la pantalla (sin guardar). Alimenta el informe en vivo."""
    try:
        return inference.run_live(req.rules, req.alpha, req.alternative)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


@router.get("/files/{name}")
def download_file(name: str):
    """Descarga del conjunto limpio y su manifiesto. Solo estos dos nombres fijos (nunca una ruta elegida por quien pide)."""
    man = workspace.read_manifest()
    if man is None:
        raise HTTPException(404, "Todavía no hay un conjunto limpio guardado.")
    if name == "manifest.json":
        return FileResponse(workspace.manifest_path(), media_type="application/json", filename="manifest.json")
    if name == "unified_file_limpio.csv":
        p = config.assert_safe_output(config.work_dir() / workspace.CLEAN_NAME)
        if not p.is_file() or cleaning.sha256_file(p) != man["output"]["sha256"]:
            raise HTTPException(409, "El archivo limpio no coincide con su huella SHA-256: vuelve a guardarlo.")
        return FileResponse(p, media_type="text/csv", filename=workspace.CLEAN_NAME)
    raise HTTPException(404, "Archivo no disponible.")
