# Abre el panel «Ada en vivo»: muestra en ESTE PC, con datos reales, qué está haciendo Ada (peticiones, verificación por dos vías, GPU, túnel).
# Es solo lectura y solo para este equipo: escucha en 127.0.0.1 y NO sale por el túnel de Cloudflare.
# Uso:  .\scripts\panel_ada.ps1             # arranca el panel (si no estaba) y abre el navegador
#       .\scripts\panel_ada.ps1 -SinNavegador
param([switch]$SinNavegador, [int]$Puerto = 8790)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$gw = Join-Path $root "ada_gateway"
$adaRoot = if ($env:ADA_ROOT) { $env:ADA_ROOT } else { Join-Path (Split-Path -Parent $root) "Ada" }
$py = Join-Path $adaRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) { throw "No encuentro el Python de Ada ($py). Define ADA_ROOT con la carpeta de Ada." }
$pids = Join-Path $gw ".pids"
New-Item -ItemType Directory -Force -Path $pids | Out-Null
$url = "http://127.0.0.1:$Puerto"

$yaViva = $false
try { Invoke-RestMethod "$url/api/eventos?ultimos=1" -TimeoutSec 2 | Out-Null; $yaViva = $true } catch {}
if ($yaViva) {
    Write-Host "El panel ya estaba encendido."
} else {
    $env:ADA_PANEL_PUERTO = "$Puerto"      # el panel solo acepta peticiones dirigidas a este mismo equipo y puerto
    $p = Start-Process -FilePath $py -ArgumentList "-m", "uvicorn", "ada_gateway.monitor.app:app", "--host", "127.0.0.1", "--port", "$Puerto" -WorkingDirectory $root `
        -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $gw "panel.out.log") -RedirectStandardError (Join-Path $gw "panel.err.log")
    Set-Content (Join-Path $pids "monitor.pid") $p.Id
    $ok = $false
    for ($i = 0; $i -lt 40; $i++) { Start-Sleep -Milliseconds 500; try { Invoke-RestMethod "$url/api/eventos?ultimos=1" -TimeoutSec 2 | Out-Null; $ok = $true; break } catch {} }
    if (-not $ok) { throw "El panel no arrancó. Revisa $gw\panel.err.log" }
    Write-Host "Panel encendido en $url" -ForegroundColor Green
}
if (-not $SinNavegador) { Start-Process $url }
