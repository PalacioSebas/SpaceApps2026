@echo off
echo ==================================================================
echo Iniciando Plataforma Papastronomy: SPHEREx ^& Planet X Explorer
echo ==================================================================

if not exist ".venv" (
    echo [1/3] Creando entorno virtual Python (.venv)...
    python -m venv .venv
)

call .venv\Scripts\activate.bat

echo [2/3] Instalando dependencias cientificas y de servidor...
python -m pip install --upgrade pip
pip install -r requirements.txt

echo [3/3] Preparando cache de los 5 objetos obligatorios de la NASA...
python setup_cache_and_inspect.py

echo Levantando servidor en http://127.0.0.1:8000 ...
uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload