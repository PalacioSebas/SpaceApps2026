@echo off
cd /d "%~dp0"
echo ==================================================================
echo Iniciando Plataforma Papastronomy: SPHEREx ^& Planet X Explorer
echo Directorio activo: %CD%
echo ==================================================================

echo [0/4] Cerrando servidores viejos en el puerto 8000 y limpiando cache Python...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do (
    echo Cerrando proceso previo en puerto 8000 (PID %%a)...
    taskkill /F /PID %%a >nul 2>&1
)
if exist "src\__pycache__" rd /s /q "src\__pycache__"
if exist "__pycache__" rd /s /q "__pycache__"

if not exist ".venv" (
    echo [1/4] Creando entorno virtual Python (.venv)...
    python -m venv .venv
    call .venv\Scripts\activate.bat
    echo [2/4] Instalando dependencias cientificas y de servidor...
    python -m pip install --upgrade pip
    pip install -r requirements.txt
) else (
    call .venv\Scripts\activate.bat
)

echo [3/4] Verificando cache de los 5 objetos obligatorios de la NASA...
python setup_cache_and_inspect.py

echo [4/4] Levantando servidor limpio en http://127.0.0.1:8000 ...
python -m uvicorn src.main:app --host 127.0.0.1 --port 8000 --reload
