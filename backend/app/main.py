"""Punto de entrada. `uvicorn app.main:app` sirve la API y el dashboard (si está compilado)."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
DIST = ROOT / "frontend" / "dist"

from app.adapters.api.routes import router  # noqa: E402  (después de cargar .env: las rutas leen variables de entorno)
from app.core import ada_engine  # noqa: E402


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ada_engine.start_loading()  # importar Ada tarda; se hace en segundo plano
    yield


app = FastAPI(title="CodePredict Dashboard — API", version="0.1.0", lifespan=lifespan)


@app.middleware("http")
async def api_key_guard(request: Request, call_next):
    """Si API_KEY está definida (p. ej. al publicar por tunnel), exige X-API-Key en /api/*."""
    key = os.getenv("API_KEY", "")
    path = request.url.path
    if key and path.startswith("/api/") and path != "/api/health":
        if request.headers.get("x-api-key") != key:
            return JSONResponse({"detail": "API key inválida"}, status_code=401)
    return await call_next(request)


app.include_router(router)

if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404)
        dist_root = DIST.resolve()
        candidate = (dist_root / full_path).resolve()
        if candidate.is_relative_to(dist_root) and candidate.is_file():
            return FileResponse(candidate)
        # index.html nunca se guarda en caché: así cada compilación nueva (con otros nombres de archivo) se ve al recargar
        return FileResponse(dist_root / "index.html", headers={"Cache-Control": "no-cache"})
