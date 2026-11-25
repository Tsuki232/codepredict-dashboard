#!/usr/bin/env bash
# Abre CodePredict con un solo comando en macOS o Linux (en macOS también sirve «Abrir CodePredict.command», con doble clic).
# Lo único que puede faltar es Python 3.12 o más nuevo; lo demás se prepara solo, dentro de la carpeta .venv de este proyecto.
cd "$(dirname "$0")" || exit 1
export PYTHONUTF8=1

buscar_python() {
  for c in python3.13 python3.12 python3 python; do
    if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3,12) else 1)' 2>/dev/null; then
      echo "$c"; return 0
    fi
  done
  return 1
}

echo
echo "  =============================================="
echo "    CodePredict AI - preparando todo para abrir"
echo "  =============================================="
echo

PY="$(buscar_python)" || {
  echo "  No encuentro Python 3.12 o más nuevo en este equipo, y sin él no puedo abrir el panel."
  echo "    macOS:           brew install python@3.12      (o https://www.python.org/downloads/)"
  echo "    Ubuntu/Debian:   sudo apt install python3.12 python3.12-venv"
  echo "  Instálalo y vuelve a abrir este archivo."
  exit 1
}

if [ "$1" = "--probar" ]; then
  echo "  Python encontrado: $PY ($("$PY" --version))"
  echo "  Carpeta del proyecto: $(pwd)"
  exit 0
fi

if [ ! -x .venv/bin/python ]; then
  echo "  Primera vez: preparo un entorno propio dentro de esta carpeta (no toca nada del resto del equipo)."
  "$PY" -m venv .venv || { echo "  No pude crear el entorno. En Ubuntu/Debian instala también python3-venv."; exit 1; }
fi

if ! cmp -s backend/requirements.txt .venv/requirements-instalado.txt 2>/dev/null; then
  echo "  Instalando los paquetes que necesita (pandas, SciPy, DuckDB...)."
  echo "  Solo la primera vez: necesita internet y tarda unos minutos."
  echo
  .venv/bin/python -m pip install --disable-pip-version-check --quiet -r backend/requirements.txt \
    && cp backend/requirements.txt .venv/requirements-instalado.txt \
    || { echo "  No se pudieron instalar los paquetes. Revisa tu conexión a internet y vuelve a intentarlo."; exit 1; }
fi

exec .venv/bin/python scripts/abrir.py "$@"
