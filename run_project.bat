@echo off
cd /d "%~dp0"
echo ==================================================================
echo Iniciando Plataforma Papastronomy: SPHEREx ^& Planet X Explorer
echo Directorio activo: %CD%
echo ==================================================================

if not exist ".venv\Scripts\python.exe" (
    echo [1/3] Creando entorno virtual Python .venv...
    py -3.14 -m venv .venv
    if errorlevel 1 (
        echo No se pudo crear el entorno. Verifica que Python 3.14 este instalado.
        exit /b 1
    )
)

echo [2/3] Instalando dependencias compatibles con Python 3.14...
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 exit /b 1

echo [3/3] Levantando servidor en http://127.0.0.1:8000 ...
set "MPLCONFIGDIR=%CD%\.matplotlib"
if not exist "%MPLCONFIGDIR%" mkdir "%MPLCONFIGDIR%"
.venv\Scripts\python.exe -m uvicorn src.main:app --host 127.0.0.1 --port 8000 --reload
