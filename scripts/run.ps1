# Arranca backend + dashboard en http://127.0.0.1:8000
# Usa el entorno de Ada (trae FastAPI, pandas, DuckDB, scipy y statsmodels). Ada se busca en ..\Ada o en $env:ADA_ROOT.
$root = Split-Path -Parent $PSScriptRoot
$adaRoot = if ($env:ADA_ROOT) { $env:ADA_ROOT } else { Join-Path (Split-Path -Parent $root) 'Ada' }
$py = Join-Path $adaRoot '.venv\Scripts\python.exe'

if (-not (Test-Path "$root\frontend\dist")) {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Write-Host "Falta Node.js 20+ (https://nodejs.org)." -ForegroundColor Yellow; exit 1 }
  Push-Location "$root\frontend"; npm install --ignore-scripts; npm run build; Pop-Location
}
if (Test-Path $py) {
  & $py -m uvicorn app.main:app --app-dir "$root\backend" --host 127.0.0.1 --port 8000
} elseif (Get-Command uv -ErrorAction SilentlyContinue) {
  Write-Host "No encuentro el entorno de Ada ($py): se usa uv. Ada hara el proceso por su API si en .env estan ADA_REMOTE_URL y ADA_REMOTE_KEY; si no, el panel ofrecera el motor Python local." -ForegroundColor Yellow
  Push-Location "$root\backend"; $env:PYTHONPATH = "."; uv run uvicorn app.main:app --host 127.0.0.1 --port 8000; Pop-Location
} else {
  Write-Host "No encuentro Python con las dependencias. Define ADA_ROOT o instala uv." -ForegroundColor Yellow; exit 1
}
