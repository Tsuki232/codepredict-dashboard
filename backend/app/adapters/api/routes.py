"""API de CodePredict Dashboard: perfil y limpieza (con Ada) e inferencia con la t de Student (en este equipo, con Python, sin Ada)."""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.core import ada_engine, ada_proceso, analisis_t, cleaning, config, inference, notebook, proceso, tstudent, workspace

router = APIRouter(prefix="/api")


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


# ----------------------------------------------------------------------------- t de Student (sin Ada ni ninguna IA: código propio y corto)


def _t(fn, *args):
    try:
        return fn(*args)
    except FileNotFoundError as e:
        raise HTTPException(409, str(e)) from e
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


@router.get("/tstudent")
def tstudent_welch(alpha: float = 0.05, alternativa: Literal["two-sided", "greater", "less"] = "two-sided") -> dict:
    """La t de Welch paso a paso sobre el conjunto limpio y guardado, con la comprobación contra SciPy."""
    return _t(analisis_t.welch, alpha, alternativa)


@router.get("/tstudent/permutacion")
def tstudent_permutacion(repeticiones: int = 2000, semilla: int = tstudent.SEMILLA) -> dict:
    """Comprobación sin fórmulas: baraja las etiquetas con bug / sin bug y mira cuántas veces sale una t tan grande."""
    return _t(analisis_t.permutacion, repeticiones, semilla)


@router.get("/tstudent/neurona")
def tstudent_neurona() -> dict:
    """Una sola neurona (regresión logística) que estima la probabilidad de bug según la complejidad, comprobada por dos vías."""
    return _t(analisis_t.neurona)


# ----------------------------------------------------------------------------- t de Student (sin Ada ni ninguna IA: código propio y corto)


def _t(fn, *args):
    try:
        return fn(*args)
    except FileNotFoundError as e:
        raise HTTPException(409, str(e)) from e
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


@router.get("/tstudent")
def tstudent_welch(alpha: float = 0.05, alternativa: Literal["two-sided", "greater", "less"] = "two-sided") -> dict:
    """La t de Welch paso a paso sobre el conjunto limpio y guardado, con la comprobación contra SciPy."""
    return _t(analisis_t.welch, alpha, alternativa)


@router.get("/tstudent/permutacion")
def tstudent_permutacion(repeticiones: int = 2000, semilla: int = tstudent.SEMILLA) -> dict:
    """Comprobación sin fórmulas: baraja las etiquetas con bug / sin bug y mira cuántas veces sale una t tan grande."""
    return _t(analisis_t.permutacion, repeticiones, semilla)


@router.get("/tstudent/neurona")
def tstudent_neurona() -> dict:
    """Una sola neurona (regresión logística) que estima la probabilidad de bug según la complejidad, comprobada por dos vías."""
    return _t(analisis_t.neurona)


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
