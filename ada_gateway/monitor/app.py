"""Panel «Ada en vivo»: muestra en este PC, con datos REALES, qué está haciendo Ada.

Lee la telemetría que escribe la puerta de enlace (`telemetria/eventos.jsonl`) y mide el PC (GPU, Ollama, túnel). Es solo lectura y solo para este equipo:
  · escucha únicamente en 127.0.0.1 (lo arranca scripts/panel_ada.ps1) y NO está expuesto por el túnel de Cloudflare;
  · rechaza cualquier petición cuyo encabezado Host no sea este mismo equipo (así una página web ajena no puede leerlo);
  · solo acepta GET: no hay forma de cambiar nada desde aquí.
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from ada_gateway import telemetria
from ada_gateway.monitor import sistema

ESTATICOS = Path(__file__).with_name("static")
PUERTO = int(os.getenv("ADA_PANEL_PUERTO", "8790"))
HOSTS = {f"127.0.0.1:{PUERTO}", f"localhost:{PUERTO}", f"[::1]:{PUERTO}"}
MAX_HISTORIAL = 3000

app = FastAPI(title="Ada en vivo", docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def _solo_este_pc(request: Request, call_next):
    host = (request.headers.get("host") or "").lower()
    if host not in HOSTS:
        return JSONResponse({"detail": "Este panel solo responde en este mismo equipo (127.0.0.1)."}, status_code=403)
    if request.method not in ("GET", "HEAD"):
        return JSONResponse({"detail": "Este panel es de solo lectura."}, status_code=405)
    resp = await call_next(request)
    resp.headers["Cache-Control"] = "no-store"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "no-referrer"
    return resp


# ----------------------------------------------------------------------------- lectura de la telemetría


def _lineas(f: Path) -> list[bytes]:
    try:
        return f.read_bytes().splitlines()
    except OSError:
        return []


def _parse(lineas: list[bytes]) -> list[dict[str, Any]]:
    out = []
    for l in lineas:
        try:
            ev = json.loads(l)
            if isinstance(ev, dict) and "e" in ev:
                out.append(ev)
        except ValueError:
            continue            # una línea a medio escribir o dañada no tumba el panel
    return out


def historial(ultimos: int = 800) -> tuple[list[dict[str, Any]], int]:
    """Los últimos eventos y la posición (bytes) hasta donde se leyó, para seguir desde ahí sin huecos ni repetidos."""
    d = telemetria.carpeta()
    actual = d / telemetria.ARCHIVO
    try:
        datos = actual.read_bytes()
    except OSError:
        datos = b""
    corte = datos.rfind(b"\n") + 1                       # solo líneas completas
    posicion, lineas = corte, datos[:corte].splitlines()
    if len(lineas) < ultimos:                            # el archivo se acaba de archivar: se completa con el anterior
        lineas = _lineas(d / "eventos.1.jsonl")[-(ultimos - len(lineas)):] + lineas
    return _parse(lineas[-min(ultimos, MAX_HISTORIAL):]), posicion


def nuevos(archivo: Path, posicion: int) -> tuple[list[dict[str, Any]], int]:
    """Eventos añadidos desde `posicion`. Si el archivo se archivó (quedó más corto), se vuelve a empezar desde el principio."""
    try:
        tam = archivo.stat().st_size
    except OSError:
        return [], 0
    if tam < posicion:
        posicion = 0
    if tam == posicion:
        return [], posicion
    with archivo.open("rb") as fh:
        fh.seek(posicion)
        trozo = fh.read()
    corte = trozo.rfind(b"\n") + 1
    return _parse(trozo[:corte].splitlines()), posicion + corte


# ----------------------------------------------------------------------------- rutas


@app.get("/", include_in_schema=False)
def pagina() -> FileResponse:
    return FileResponse(ESTATICOS / "index.html", media_type="text/html; charset=utf-8")


@app.get("/api/estado")
def estado() -> dict[str, Any]:
    return sistema.estado()


@app.get("/api/eventos")
def eventos(ultimos: int = 800) -> dict[str, Any]:
    ev, pos = historial(max(1, min(ultimos, MAX_HISTORIAL)))
    return {"ahora": round(time.time(), 3), "posicion": pos, "eventos": ev}


@app.get("/api/flujo")
async def flujo(request: Request, desde: int | None = None) -> StreamingResponse:
    """Flujo en vivo (Server-Sent Events): cada evento nuevo y el estado del PC cada 2 s. `desde` = posición devuelta por /api/eventos."""
    archivo = telemetria.carpeta() / telemetria.ARCHIVO

    async def generar():
        posicion = desde if desde is not None else (archivo.stat().st_size if archivo.exists() else 0)
        proximo_estado, proximo_latido = 0.0, 0.0
        yield "retry: 2000\n\n"
        while not await request.is_disconnected():
            evs, posicion = nuevos(archivo, posicion)
            for ev in evs:
                yield f"event: evento\ndata: {json.dumps(ev, ensure_ascii=False, separators=(',', ':'))}\n\n"
            ahora = time.monotonic()
            if ahora >= proximo_estado:
                proximo_estado = ahora + 2
                est = await run_in_threadpool(sistema.estado)
                yield f"event: estado\ndata: {json.dumps(est, ensure_ascii=False, separators=(',', ':'))}\n\n"
            elif ahora >= proximo_latido:
                proximo_latido = ahora + 15
                yield ": latido\n\n"
            await asyncio.sleep(0.25)

    return StreamingResponse(generar(), media_type="text/event-stream", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


app.mount("/static", StaticFiles(directory=ESTATICOS), name="static")
