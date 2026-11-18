"""Lecturas REALES del estado de este PC y de Ada: GPU, Ollama, túnel, puerta de enlace, CPU y memoria. Solo lectura: no cambia nada en el sistema."""
from __future__ import annotations

import os
import subprocess
import time
from typing import Any

import httpx
import psutil

OLLAMA_API = os.getenv("OLLAMA_API", "http://127.0.0.1:11434").rstrip("/")
PUERTA_URL = os.getenv("GATEWAY_URL", "http://127.0.0.1:8787").rstrip("/")
_SIN_VENTANA = getattr(subprocess, "CREATE_NO_WINDOW", 0)       # en Windows, que nvidia-smi no abra una ventana negra cada 2 s

psutil.cpu_percent(None)       # la primera lectura siempre da 0: se descarta aquí


def limites() -> dict[str, int]:
    """Cupos por minuto de la puerta de enlace (mismas variables y valores por defecto que ella)."""
    return {"explicar": int(os.getenv("GATEWAY_RATE_PER_MIN", "10")), "stats": int(os.getenv("GATEWAY_RATE_STATS_PER_MIN", "120")),
            "pendulo": int(os.getenv("GATEWAY_RATE_PENDULUM_PER_MIN", "240")), "cp": int(os.getenv("GATEWAY_RATE_CODEPREDICT_PER_MIN", "60")),
            "cp_limpio": int(os.getenv("GATEWAY_RATE_CODEPREDICT_LIMPIO_PER_MIN", "10"))}


def gpu() -> dict[str, Any] | None:
    try:
        r = subprocess.run(["nvidia-smi", "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,power.limit,clocks.sm",
                            "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=4, creationflags=_SIN_VENTANA)
        p = [x.strip() for x in r.stdout.strip().splitlines()[0].split(",")]
        return {"nombre": p[0], "uso": float(p[1]), "vram_usada_mb": float(p[2]), "vram_total_mb": float(p[3]), "temp_c": float(p[4]),
                "potencia_w": float(p[5]), "potencia_max_w": float(p[6]), "reloj_mhz": float(p[7])}
    except Exception:  # noqa: BLE001  (sin GPU NVIDIA o sin nvidia-smi: el panel lo dice, no lo inventa)
        return None


def ollama() -> dict[str, Any]:
    """Modelos que Ollama tiene cargados ahora mismo en la GPU."""
    try:
        r = httpx.get(f"{OLLAMA_API}/api/ps", timeout=1.5)
        modelos = [{"nombre": m.get("name"), "vram_mb": round((m.get("size_vram") or 0) / 1e6), "hasta": m.get("expires_at")} for m in r.json().get("models", [])]
        return {"activo": True, "modelos": modelos}
    except Exception:  # noqa: BLE001
        return {"activo": False, "modelos": []}


def puerta() -> dict[str, Any]:
    try:
        r = httpx.get(f"{PUERTA_URL}/ada/health", timeout=1.5)
        return {"activa": r.status_code == 200, "motor": r.json().get("motor")}
    except Exception:  # noqa: BLE001
        return {"activa": False, "motor": None}


def procesos() -> dict[str, Any]:
    """Procesos que forman Ada en este PC: el túnel (cloudflared), la puerta de enlace (uvicorn) y Ollama."""
    buscados: dict[str, Any] = {"tunel": None, "puerta": None, "ollama": None}
    for p in psutil.process_iter(["pid", "name", "cmdline", "create_time", "memory_info"]):
        try:
            nombre = (p.info["name"] or "").lower()
            cmd = " ".join(p.info["cmdline"] or [])
            clave = ("tunel" if nombre.startswith("cloudflared") else "ollama" if nombre.startswith("ollama") and "app" not in nombre
                     else "puerta" if "ada_gateway.gateway:app" in cmd else None)
            if clave is None:
                continue
            mem = (p.info["memory_info"].rss if p.info["memory_info"] else 0) / 1e6
            if buscados[clave] is None or mem > buscados[clave]["mem_mb"]:        # el lanzador de Python y el proceso real comparten comando: se toma el real (el que más pesa)
                buscados[clave] = {"pid": p.info["pid"], "desde": p.info["create_time"], "mem_mb": round(mem)}
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return buscados


def pc() -> dict[str, Any]:
    m = psutil.virtual_memory()
    return {"cpu": psutil.cpu_percent(None), "ram_usada_mb": round(m.used / 1e6), "ram_total_mb": round(m.total / 1e6)}


def estado() -> dict[str, Any]:
    """Foto del estado de Ada y de este PC en este instante."""
    proc = procesos()
    return {"t": round(time.time(), 3), "puerta": {**puerta(), "proceso": proc["puerta"]}, "tunel": {"activo": proc["tunel"] is not None, "proceso": proc["tunel"]},
            "ollama": {**ollama(), "proceso": proc["ollama"]}, "gpu": gpu(), "pc": pc(), "limites": limites()}
