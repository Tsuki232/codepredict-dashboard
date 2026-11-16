@echo off
rem Apaga el tunel y la puerta de enlace de Ada (Ollama queda activo; para liberar la GPU: ollama stop ada-q).
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop_ada_server.ps1"
echo.
pause
