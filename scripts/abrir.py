#!/usr/bin/env python3
"""Abre CodePredict en el navegador con un solo comando. Lo llaman «Abrir CodePredict.cmd» (Windows) y «abrir_codepredict.sh» (macOS y Linux)
después de preparar el entorno; también sirve solo:  python scripts/abrir.py

Qué hace, en este orden:
  1. Comprueba que están los datos (data/raw/Unified-file.csv) y la interfaz ya compilada (frontend/dist).
  2. Si en este equipo no hay Ada (ni la carpeta ../Ada ni su API en .env), trabaja con el motor Python local y lo declara con CODEPREDICT_MOTOR=python:
     es lo que decide quien abre esta herramienta, el panel lo rotula «Motor: Python local (sin Ada)» y el manifiesto guarda «python-local».
     Con Ada presente no cambia nada: sigue mandando ella.
  3. La primera vez prepara los datos limpios con las reglas por defecto (unos segundos), para que el tablero salga completo desde el primer clic.
  4. Elige un puerto libre, arranca el servidor y abre el navegador en el tablero.

  --probar          solo comprueba y cuenta qué haría; no arranca nada
  --sin-navegador   no abre el navegador (solo imprime la dirección)
  --puerto N        usa ese puerto en vez de buscar uno libre desde el 8000
"""
from __future__ import annotations

import argparse
import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
BACKEND = RAIZ / "backend"
CSV = RAIZ / "data" / "raw" / "Unified-file.csv"
INTERFAZ = RAIZ / "frontend" / "dist" / "index.html"


def puerto_libre(desde: int = 8000, hasta: int = 8020) -> int:
    """El primer puerto libre entre `desde` y `hasta` (por si el 8000 ya lo usa otra cosa)."""
    for p in range(desde, hasta + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", p))
            except OSError:
                continue
            return p
    raise RuntimeError(f"No hay ningún puerto libre entre el {desde} y el {hasta}. Cierra otras aplicaciones e inténtalo de nuevo.")


def faltantes() -> list[str]:
    """Lo que falta para poder abrir el panel, con cómo arreglarlo (lista vacía = todo listo)."""
    out = []
    if not CSV.is_file():
        out.append(f"Falta el archivo de datos {CSV.relative_to(RAIZ)}. Descarga de nuevo el proyecto completo desde GitHub (el archivo viene incluido).")
    if not INTERFAZ.is_file():
        out.append("Falta la interfaz compilada (frontend/dist). Descarga de nuevo el proyecto completo desde GitHub; si lo estás desarrollando, ejecuta «npm install» y «npm run build» dentro de frontend.")
    return out


def hay_ada() -> bool:
    """¿Hay Ada en este equipo (carpeta ../Ada o ADA_ROOT) o su API configurada (ADA_REMOTE_URL y ADA_REMOTE_KEY)?"""
    from app.core import ada_engine, config

    return config.ada_present() or ada_engine.remote_config() is not None


def preparar_datos() -> None:
    """La primera vez deja guardados los datos limpios (reglas por defecto, motor Python) para que el tablero salga completo. No hace nada si ya existen."""
    from app.core import ada_engine, cleaning, workspace

    if workspace.read_manifest() is not None or ada_engine.preferred() != "python":
        return
    print("  Primera vez en este equipo: preparo los datos limpios con las reglas por defecto (unos segundos)...", flush=True)
    t0 = time.time()
    try:
        man = workspace.apply_cleaning(cleaning.Rules())
    except Exception as e:  # noqa: BLE001  (no impide abrir el panel: la limpieza se puede hacer a mano en «Limpieza visual»)
        print(f"  No pude preparar los datos solos ({type(e).__name__}: {e}). El panel abre igual: hazlo en «Limpieza visual» con «Guardar limpieza».", flush=True)
        return
    filas = f"{man['output']['rows']:,}".replace(",", " ")
    print(f"  Listo: {filas} archivos limpios en {time.time() - t0:.0f} s. Quedan guardados en data/work/codepredict (el CSV original no se toca).", flush=True)


def _abrir_cuando_responda(puerto: int, url: str, abrir: bool) -> None:
    """Espera a que el servidor conteste y entonces abre el navegador (en un hilo aparte, para no frenar el arranque)."""
    salud = f"http://127.0.0.1:{puerto}/api/health"
    for _ in range(240):
        try:
            with urllib.request.urlopen(salud, timeout=2):
                break
        except Exception:  # noqa: BLE001  (todavía arrancando)
            time.sleep(0.5)
    else:
        return
    if abrir:
        try:
            webbrowser.open(url)
        except Exception:  # noqa: BLE001  (sin navegador predeterminado: la dirección ya está impresa)
            pass


def main(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        try:
            flujo.reconfigure(encoding="utf-8", errors="replace")      # que las tildes se vean también en la consola de Windows
        except Exception:  # noqa: BLE001
            pass
    ap = argparse.ArgumentParser(description="Abre CodePredict en el navegador con un solo comando.")
    ap.add_argument("--probar", action="store_true")
    ap.add_argument("--sin-navegador", action="store_true")
    ap.add_argument("--puerto", type=int)
    a = ap.parse_args(argv)

    if sys.version_info < (3, 12):
        print(f"  Hace falta Python 3.12 o más nuevo y este es {sys.version.split()[0]}.")
        return 1
    problemas = faltantes()
    if problemas:
        print("  No se puede abrir todavía:")
        for p in problemas:
            print(f"   - {p}")
        return 1

    sys.path.insert(0, str(BACKEND))
    from dotenv import load_dotenv

    load_dotenv(RAIZ / ".env")                                          # lo mismo que hace el servidor, para decidir con la misma información
    ada = hay_ada()                                                     # (esto ya importó el módulo del motor, que lee su valor inicial una sola vez)
    if not ada:
        from app.core import ada_engine

        os.environ.setdefault("CODEPREDICT_MOTOR", "python")            # queda declarado también para cualquier proceso hijo
        ada_engine.set_motor("python")                                  # y se aplica YA al motor en uso: la decisión de quien abrió esta herramienta
    puerto = a.puerto or puerto_libre()
    url = f"http://127.0.0.1:{puerto}/#/tablero"

    if a.probar:
        print(f"  Python {sys.version.split()[0]} · carpeta {RAIZ}")
        print(f"  Datos y interfaz: en su sitio · Ada en este equipo: {'sí' if ada else 'no (se usará el motor Python local, rotulado en el panel)'}")
        print(f"  Abriría {url}")
        return 0

    print(f"\n  CodePredict AI · motor: {'Ada' if ada else 'Python local (sin Ada)'}", flush=True)
    from app.main import app

    preparar_datos()
    abrir = not a.sin_navegador and not os.environ.get("CODEPREDICT_SIN_NAVEGADOR")
    threading.Thread(target=_abrir_cuando_responda, args=(puerto, url, abrir), daemon=True).start()
    print(f"\n  Abriendo {url}\n  Si el navegador no se abre solo, copia esa dirección.\n  Para cerrar el panel, cierra esta ventana (o pulsa Ctrl+C).\n", flush=True)

    import uvicorn

    try:
        uvicorn.run(app, host="127.0.0.1", port=puerto, log_level="warning")
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
