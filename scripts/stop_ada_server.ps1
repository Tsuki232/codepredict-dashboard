# Apaga el túnel y la puerta de enlace que arrancó start_ada_server.ps1. NO apaga Ollama (lo usa también Ada).
# Solo detiene los procesos cuyos PID guardó el script de arranque y que, además, siguen siendo del programa esperado.
$root = Split-Path -Parent $PSScriptRoot
$pids = Join-Path $root "ada_gateway\.pids"
foreach ($par in @(@("tunnel", "cloudflared"), @("gateway", "python"))) {
    $f = Join-Path $pids "$($par[0]).pid"
    if (-not (Test-Path $f)) { continue }
    $id = [int](Get-Content $f)
    $p = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -like "$($par[1])*") {
        Stop-Process -Id $id -Force
        Write-Host "Detenido: $($par[0]) (PID $id)."
    } else {
        Write-Host "$($par[0]): el PID $id ya no corresponde a $($par[1]); no se toca."
    }
    Remove-Item $f -ErrorAction SilentlyContinue
}
Write-Host "Listo. Ollama sigue activo; si quiere liberar la GPU: ollama stop ada-q"
