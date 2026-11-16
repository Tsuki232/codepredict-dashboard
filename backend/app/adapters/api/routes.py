"""API de CodePredict Dashboard: perfil, limpieza (vista previa y aplicar) e inferencia con Ada."""
from __future__ import annotations

from typing import Any, Literal

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.core import ada_engine, cleaning, config, inference, notebook, workspace

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
    except ada_engine.AdaNotReady as e:
        raise HTTPException(503, str(e)) from e
    except workspace.NotVerified as e:
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
    raw, p = _raw()
    out = cleaning.profile_raw(raw, cleaning.raw_nonnumeric(p))
    out["source"] = {"path": str(p), "sha256": cleaning.sha256_file(p), "bytes": p.stat().st_size,
                     "name": "Unified Bug Dataset v1.2 (Ferenc et al., 2020), nivel archivo"}
    return out


@router.get("/clean/defaults")
def defaults() -> dict:
    return cleaning.Rules().model_dump()


@router.post("/clean/preview")
def preview(rules: cleaning.Rules) -> dict:
    raw, _ = _raw()
    res = cleaning.run_pipeline(raw, rules, verify=True)
    return {
        "rules": rules.model_dump(),
        "steps": [s.as_dict() for s in res.steps],
        "verified": res.verified,
        "rows_in": len(raw), "rows_out": len(res.frame),
        "dropped_columns": res.dropped_columns,
        "table2x2": cleaning.table2x2(res.frame),
        "quick": cleaning.quick_stats(res.frame),
        "hist": cleaning.histograms(raw, res.frame),
        "fences": res.fences,
        "impact": cleaning.policy_impact(raw, rules),
    }


@router.get("/clean/status")
def status() -> dict:
    man = workspace.read_manifest()
    return {"applied": man is not None, "manifest": man}


@router.post("/clean/apply")
def apply(rules: cleaning.Rules) -> dict:
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
    except ada_engine.AdaNotReady as e:
        raise HTTPException(503, str(e)) from e
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
    except ada_engine.AdaNotReady as e:
        raise HTTPException(503, str(e)) from e
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
