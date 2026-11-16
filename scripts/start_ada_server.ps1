# Arranca el SERVIDOR de Ada para el asistente: Ollama (con los modelos de Ada) + puerta de enlace + túnel rápido de Cloudflare.
# Uso (en el PC con la GPU):   .\scripts\start_ada_server.ps1            # con túnel (si cloudflared está disponible)
#                              .\scripts\start_ada_server.ps1 -SinTunel  # solo local (127.0.0.1:8787), para probar
# No toca ninguna cuenta de Cloudflare: el «túnel rápido» (trycloudflare.com) no usa cuenta ni token.
param([switch]$SinTunel, [int]$Puerto = 8787)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$gw = Join-Path $root "ada_gateway"
$adaRoot = if ($env:ADA_ROOT) { $env:ADA_ROOT } else { Join-Path (Split-Path -Parent $root) "Ada" }
$py = Join-Path $adaRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) { throw "No encuentro el Python de Ada ($py). Define ADA_ROOT con la carpeta de Ada." }
$pids = Join-Path $gw ".pids"
New-Item -ItemType Directory -Force -Path $pids | Out-Null

# 1) Clave de la API (se genera una vez y se guarda; NO se sube a git)
$keyFile = Join-Path $gw ".env.gateway"
if (-not (Test-Path $keyFile)) {
    $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    $k = [Convert]::ToBase64String($b).TrimEnd("=").Replace("+", "-").Replace("/", "_")
    Set-Content -Path $keyFile -Value "GATEWAY_API_KEY=$k" -Encoding ascii
    Write-Host "Clave nueva guardada en $keyFile (no la subas a git)." -ForegroundColor Yellow
}
$key = ((Get-Content $keyFile | Where-Object { $_ -like "GATEWAY_API_KEY=*" } | Select-Object -First 1) -split "=", 2)[1].Trim()
if (-not $key) { throw "El archivo $keyFile no tiene GATEWAY_API_KEY." }

# 2) Ollama con los modelos de Ada (reutiliza el script de Ada: carpeta de modelos, caché, KEEP_ALIVE)
& (Join-Path $adaRoot "scripts\start_ollama.ps1")

# 3) Puerta de enlace: solo en 127.0.0.1 (nunca expuesta directamente; el túnel apunta aquí)
$yaViva = $false
try { Invoke-RestMethod "http://127.0.0.1:$Puerto/health" -TimeoutSec 2 | Out-Null; $yaViva = $true } catch {}
if ($yaViva) {
    Write-Host "La puerta de enlace ya está activa en 127.0.0.1:$Puerto."
} else {
    $env:GATEWAY_API_KEY = $key
    $p = Start-Process -FilePath $py -ArgumentList "-m", "uvicorn", "ada_gateway.gateway:app", "--host", "127.0.0.1", "--port", "$Puerto" -WorkingDirectory $root `
        -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $gw "gateway.out.log") -RedirectStandardError (Join-Path $gw "gateway.err.log")
    Set-Content (Join-Path $pids "gateway.pid") $p.Id
    $ok = $false
    for ($i = 0; $i -lt 30; $i++) { Start-Sleep -Milliseconds 500; try { Invoke-RestMethod "http://127.0.0.1:$Puerto/health" -TimeoutSec 2 | Out-Null; $ok = $true; break } catch {} }
    if (-not $ok) { throw "La puerta de enlace no arrancó. Revisa $gw\gateway.err.log" }
    Write-Host "Puerta de enlace lista en 127.0.0.1:$Puerto."
}

# 4) Precarga del modelo en la GPU (así la primera respuesta del grupo no espera la carga)
try {
    Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/generate" -Method Post -ContentType "application/json" -TimeoutSec 300 `
        -Body (@{ model = "ada-q"; prompt = ""; keep_alive = "30m" } | ConvertTo-Json) | Out-Null
    Write-Host "Modelo ada-q cargado en la GPU."
} catch { Write-Host "Aviso: no pude precargar ada-q ($($_.Exception.Message)). Se cargará en la primera petición." -ForegroundColor Yellow }

# 5) Túnel rápido de Cloudflare (sin cuenta). La dirección CAMBIA cada vez que se reinicia.
if ($SinTunel) { Write-Host "`nModo local: sin túnel. Prueba con http://127.0.0.1:$Puerto"; exit 0 }
$cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cf -and (Test-Path (Join-Path $gw "cloudflared.exe"))) { $cf = Join-Path $gw "cloudflared.exe" }
if (-not $cf) {
    Write-Host "`nFalta cloudflared (programa del túnel). Colóquelo como $gw\cloudflared.exe o instálelo, y vuelva a ejecutar este script." -ForegroundColor Yellow
    Write-Host "Mientras tanto, la puerta de enlace funciona en local: http://127.0.0.1:$Puerto"
    exit 0
}
$log = Join-Path $gw "tunnel.err.log"
function Leer-Env($nombre) { $l = Get-Content $keyFile | Where-Object { $_ -like "$nombre=*" } | Select-Object -First 1; if ($l) { ($l -split "=", 2)[1].Trim() } }
$tokTunel = Leer-Env "CLOUDFLARE_TUNNEL_TOKEN"; $urlFija = Leer-Env "ADA_PUBLIC_URL"
$pidT = Join-Path $pids "tunnel.pid"
$yaTunel = $false
if (Test-Path $pidT) { $pp = Get-Process -Id ([int](Get-Content $pidT)) -ErrorAction SilentlyContinue; if ($pp -and $pp.ProcessName -like "cloudflared*") { $yaTunel = $true } }

if ($tokTunel -and $urlFija) {
    # Túnel CON NOMBRE (dirección fija): el token va por variable de entorno, nunca por la línea de comandos
    if ($yaTunel) { Write-Host "El túnel ya estaba conectado." } else {
        $env:TUNNEL_TOKEN = $tokTunel
        $t = Start-Process -FilePath $cf -ArgumentList "tunnel", "--no-autoupdate", "run" -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $gw "tunnel.out.log") -RedirectStandardError $log
        Remove-Item Env:\TUNNEL_TOKEN
        Set-Content $pidT $t.Id
        $ok = $false
        for ($i = 0; $i -lt 40 -and -not $ok; $i++) { Start-Sleep -Milliseconds 500; if ((Test-Path $log) -and (Select-String -Path $log -Pattern "Registered tunnel connection" -Quiet)) { $ok = $true } }
        if (-not $ok) { throw "El túnel no se conectó. Revisa $log" }
    }
    $url = $urlFija
    Write-Host "`n=== LISTO ===" -ForegroundColor Green
    Write-Host "Dirección pública FIJA: $url"
} else {
    Remove-Item $log -ErrorAction SilentlyContinue
    $t = Start-Process -FilePath $cf -ArgumentList "tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:$Puerto" -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $gw "tunnel.out.log") -RedirectStandardError $log
    Set-Content $pidT $t.Id
    $url = $null
    for ($i = 0; $i -lt 60 -and -not $url; $i++) {
        Start-Sleep -Milliseconds 500
        if (Test-Path $log) { $m = Select-String -Path $log -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -First 1; if ($m) { $url = $m.Matches[0].Value } }
    }
    if (-not $url) { throw "El túnel no dio una dirección. Revisa $log" }
    Write-Host "`n=== LISTO ===" -ForegroundColor Green
    Write-Host "Dirección pública (cambia en cada arranque): $url"
}
Write-Host "Cada compañero pone en el archivo .env de SU copia del panel:"
Write-Host "    ADA_REMOTE_URL=$url"
Write-Host "    ADA_REMOTE_KEY=<la clave que está en $keyFile>   (compártala solo por un canal privado)"
Write-Host "Para apagar todo:  .\scripts\stop_ada_server.ps1"
