#!/usr/bin/env bash
# Arranca backend + dashboard en http://127.0.0.1:8000 (usa el entorno de Ada si existe: ADA_ROOT o ../Ada)
root="$(cd "$(dirname "$0")/.." && pwd)"
ada="${ADA_ROOT:-$(dirname "$root")/Ada}"
[ -d "$root/frontend/dist" ] || (cd "$root/frontend" && npm install --ignore-scripts && npm run build)
for py in "$ada/.venv/Scripts/python.exe" "$ada/.venv/bin/python"; do
  if [ -x "$py" ]; then exec "$py" -m uvicorn app.main:app --app-dir "$root/backend" --host 127.0.0.1 --port 8000; fi
done
echo "No encuentro el entorno de Ada: se usa uv. Ada hará el proceso por su API si .env tiene ADA_REMOTE_URL y ADA_REMOTE_KEY; si no, el panel ofrecerá el motor Python local." >&2
cd "$root/backend" && PYTHONPATH=. uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
