@echo off
rem Arranca el servidor de Ada (Ollama + puerta de enlace + tunel). Doble clic, o desde una consola.
rem Para solo probar en local, sin tunel:  iniciar_ada.cmd -SinTunel
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_ada_server.ps1" %*
echo.
pause
