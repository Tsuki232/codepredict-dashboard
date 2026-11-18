@echo off
rem Apaga el tunel y la puerta de enlace de Ada y descarga el modelo de la GPU (Ollama queda encendido, sin usar VRAM).
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop_ada_server.ps1"
echo Liberando la GPU...
ollama stop ada-q >nul 2>&1
echo.
pause
