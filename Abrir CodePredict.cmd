@echo off
rem Abre CodePredict con un doble clic. No usa PowerShell (muchos equipos tienen bloqueados los scripts .ps1).
rem Lo unico que puede pedirte: instalar Python 3.12 (una sola vez, con winget y sin administrador) si todavia no lo tienes.
chcp 65001 >nul
setlocal EnableExtensions
title CodePredict AI
cd /d "%~dp0"
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"

echo.
echo   ==============================================
echo     CodePredict AI - preparando todo para abrir
echo   ==============================================
echo.

call :buscar_python
if not defined PYCMD call :instalar_python
if not defined PYCMD goto :error

if /i "%~1"=="--probar" (
  echo   Python encontrado: %PYCMD%
  %PYCMD% --version
  echo   Carpeta del proyecto: %~dp0
  exit /b 0
)

set "VENV=%~dp0.venv"
if not exist "%VENV%\Scripts\python.exe" (
  echo   Primera vez: preparo un entorno propio dentro de esta carpeta ^(no toca nada del resto del equipo^).
  %PYCMD% -m venv "%VENV%"
  if errorlevel 1 goto :error
)
set "VPY=%VENV%\Scripts\python.exe"

fc /b "%~dp0backend\requirements.txt" "%VENV%\requirements-instalado.txt" >nul 2>nul
if errorlevel 1 (
  echo   Instalando los paquetes que necesita ^(pandas, SciPy, DuckDB...^).
  echo   Solo la primera vez: necesita internet y tarda unos minutos. No cierres esta ventana.
  echo.
  "%VPY%" -m pip install --disable-pip-version-check --quiet -r "%~dp0backend\requirements.txt"
  if errorlevel 1 goto :error
  copy /y "%~dp0backend\requirements.txt" "%VENV%\requirements-instalado.txt" >nul
)

"%VPY%" "%~dp0scripts\abrir.py" %*
if errorlevel 1 goto :error
exit /b 0

:error
echo.
echo   No se pudo abrir CodePredict. Lee el mensaje de arriba.
echo   Si no lo entiendes, mandale una foto de esta ventana a quien te paso el proyecto.
echo.
pause
exit /b 1

:buscar_python
set "PYCMD="
for %%C in ("py -3.13" "py -3.12" "py -3" "python" "python3") do (
  if not defined PYCMD (
    %%~C -c "import sys; sys.exit(0 if sys.version_info >= (3,12) else 1)" >nul 2>nul
    if not errorlevel 1 set "PYCMD=%%~C"
  )
)
if defined PYCMD exit /b 0
for %%P in ("%LOCALAPPDATA%\Programs\Python\Python313\python.exe" "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" "%ProgramFiles%\Python313\python.exe" "%ProgramFiles%\Python312\python.exe") do (
  if not defined PYCMD if exist "%%~P" (
    "%%~P" -c "import sys; sys.exit(0 if sys.version_info >= (3,12) else 1)" >nul 2>nul
    if not errorlevel 1 set "PYCMD="%%~P""
  )
)
exit /b 0

:instalar_python
echo   No encuentro Python 3.12 o mas nuevo en este equipo, y sin el no puedo abrir el panel.
echo.
where winget >nul 2>nul
if errorlevel 1 (
  echo   Instalalo desde https://www.python.org/downloads/ ^(en el instalador marca "Add python.exe to PATH"^)
  echo   y despues vuelve a abrir este archivo. Abro esa pagina por ti.
  start "" "https://www.python.org/downloads/"
  exit /b 0
)
echo   Puedo instalarlo ahora con winget, el instalador de Windows ^(no pide administrador; ocupa unos 100 MB^).
choice /c SN /n /m "  Instalar Python 3.12 ahora? [S/N] "
if errorlevel 2 exit /b 0
winget install -e --id Python.Python.3.12 --scope user --silent --accept-package-agreements --accept-source-agreements
call :buscar_python
if not defined PYCMD (
  echo.
  echo   Python quedo instalado, pero esta ventana todavia no lo ve. Cierrala y vuelve a abrir este archivo.
)
exit /b 0
