#!/usr/bin/env bash
set -e

echo "=================================================================="
echo "🌌 Iniciando Plataforma Papastronomy: SPHEREx & Planet X Explorer"
echo "=================================================================="

if [ ! -d ".venv" ]; then
  echo "[1/3] Creando entorno virtual Python (.venv)..."
  python3 -m venv .venv
fi

source .venv/bin/activate

echo "[2/3] Instalando dependencias científicas y de servidor..."
pip install --upgrade pip
pip install -r requirements.txt

echo "[3/3] Preparando caché de los 5 objetos obligatorios de la NASA..."
python setup_cache_and_inspect.py

echo "🚀 Levantando servidor en http://127.0.0.1:8000 ..."
uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload