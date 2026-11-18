@echo off
rem Abre el panel "Ada en vivo" (solo para este PC): lo enciende si hace falta y abre el navegador. Doble clic.
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0panel_ada.ps1" %*
if errorlevel 1 pause
