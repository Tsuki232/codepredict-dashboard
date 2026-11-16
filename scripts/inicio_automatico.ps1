# Arranque AUTOMÁTICO del servidor de Ada al iniciar sesión en Windows, SIN Docker ni virtualización.
# Funciona con un acceso directo en la carpeta «Inicio» del usuario (sin administrador). Es totalmente reversible.
#   .\scripts\inicio_automatico.ps1                      # muestra si está activado
#   .\scripts\inicio_automatico.ps1 -Accion Instalar -SoloMostrar   # solo enseña qué haría, no cambia nada
#   .\scripts\inicio_automatico.ps1 -Accion Instalar     # lo activa
#   .\scripts\inicio_automatico.ps1 -Accion Quitar       # lo desactiva
# Al iniciar sesión arranca con -SinPrecarga (el modelo se carga en la GPU solo cuando alguien lo usa) y deja su registro en ada_gateway\inicio_automatico.log
param([ValidateSet("Estado", "Instalar", "Quitar")][string]$Accion = "Estado", [switch]$SoloMostrar)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$acceso = Join-Path ([Environment]::GetFolderPath("Startup")) "Ada servidor (CodePredict).lnk"
$objetivo = Join-Path $PSScriptRoot "start_ada_server.ps1"
$log = Join-Path $root "ada_gateway\inicio_automatico.log"
# cmd /c permite guardar la salida en un registro aunque la ventana vaya minimizada
$argumentos = "/c powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$objetivo`" -SinPrecarga > `"$log`" 2>&1"

switch ($Accion) {
    "Estado" {
        if (Test-Path $acceso) { Write-Host "Inicio automático: ACTIVADO  ($acceso)" -ForegroundColor Green } else { Write-Host "Inicio automático: desactivado" }
    }
    "Quitar" {
        if ($SoloMostrar) { Write-Host "Quitaría: $acceso"; return }
        if (Test-Path $acceso) { Remove-Item $acceso; Write-Host "Inicio automático desactivado." } else { Write-Host "No estaba activado." }
    }
    "Instalar" {
        if (-not (Test-Path (Join-Path $root "ada_gateway\.env.gateway"))) { Write-Host "Aviso: aún no existe ada_gateway\.env.gateway; ejecute antes una vez scripts\start_ada_server.ps1 (crea la clave)." -ForegroundColor Yellow }
        if ($SoloMostrar) { Write-Host "Crearía este acceso directo en la carpeta Inicio:`n  $acceso`n  cmd.exe $argumentos`n  (se ejecuta minimizado, al iniciar sesión)"; return }
        $l = (New-Object -ComObject WScript.Shell).CreateShortcut($acceso)
        $l.TargetPath = "cmd.exe"; $l.Arguments = $argumentos; $l.WorkingDirectory = $root; $l.WindowStyle = 7
        $l.Description = "Arranca el servidor de Ada (Ollama + puerta de enlace + túnel) para el asistente del panel CodePredict"
        $l.Save()
        Write-Host "Inicio automático ACTIVADO: $acceso" -ForegroundColor Green
        Write-Host "Se aplicará la próxima vez que inicie sesión. Para desactivarlo: .\scripts\inicio_automatico.ps1 -Accion Quitar"
    }
}
