"""
Configuración centralizada de la Versión 2.0 (100% APIs Reales NASA/IPAC IRSA + CDS Gaia/WISE).
"""

from pathlib import Path
from typing import Dict, List, Any

BASE_DIR: Path = Path(__file__).resolve().parent.parent
DATA_DIR: Path = BASE_DIR / "data"
CACHE_DIR: Path = DATA_DIR / "cache"
STATIC_DIR: Path = BASE_DIR / "static"

CACHE_DIR.mkdir(parents=True, exist_ok=True)
STATIC_DIR.mkdir(parents=True, exist_ok=True)

# Endpoints Oficiales de Datos Abiertos de NASA/IPAC IRSA y CDS
IRSA_TAP_URL: str = "https://irsa.ipac.caltech.edu/TAP"
IRSA_BASE_URL: str = "https://irsa.ipac.caltech.edu/"
IRSA_SIA_SPHEREX_URL: str = "https://irsa.ipac.caltech.edu/SIA?COLLECTION=spherex_qr2&"
CDS_TAP_URL: str = "https://tapvizier.cds.unistra.fr/TAPVizieR/tap"

DEFAULT_FOV_DEG: float = 0.05
DEFAULT_CUTOUT_PIXELS: int = 128

# Diccionario de los 5 Objetos de Prueba Obligatorios (Coordenadas ICRS Oficiales)
MANDATORY_TARGETS: List[Dict[str, Any]] = [
    {
        "id": "wise_0855",
        "name": "WISE 0855",
        "category": "MOVING_OBJECT",
        "description": "Enana marrón subestelar más fría y rápida conocida cerca del Sistema Solar",
        "ra_hms": "08h55m10.831s",
        "dec_dms": "-07d14m42.53s",
        "ra_deg": 133.795129,
        "dec_deg": -7.245147,
        "default_fov": 0.05,
    },
    {
        "id": "barnards_star",
        "name": "Barnard's Star",
        "category": "MOVING_OBJECT",
        "description": "Enana roja con el mayor movimiento propio conocido respecto al Sol",
        "ra_hms": "17h57m48.498s",
        "dec_dms": "+04d41m36.11s",
        "ra_deg": 269.452075,
        "dec_deg": 4.693364,
        "default_fov": 0.05,
    },
    {
        "id": "epsilon_indi_b",
        "name": "Epsilon Indi B",
        "category": "MOVING_OBJECT",
        "description": "Sistema binario de enanas marrones (T1 + T6) con alto movimiento propio",
        "ra_hms": "22h04m10.52s",
        "dec_dms": "-56d46m57.7s",
        "ra_deg": 331.043833,
        "dec_deg": -56.782694,
        "default_fov": 0.05,
    },
    {
        "id": "rw_aurigae",
        "name": "RW Aurigae",
        "category": "VARIABLE_STAR",
        "description": "Estrella joven T Tauri con fuertes variaciones de luminosidad entre épocas",
        "ra_hms": "05h07m49.56s",
        "dec_dms": "+30d24m05.1s",
        "ra_deg": 76.956500,
        "dec_deg": 30.401417,
        "default_fov": 0.05,
    },
    {
        "id": "r_draconis",
        "name": "R Draconis",
        "category": "VARIABLE_STAR",
        "description": "Gigante roja variable tipo Mira con cambios drásticos en el infrarrojo",
        "ra_hms": "16h32m40.23s",
        "dec_dms": "+66d45m17.9s",
        "ra_deg": 248.167625,
        "dec_deg": 66.754972,
        "default_fov": 0.05,
    },
]

REFERENCE_MOLECULES: List[Dict[str, Any]] = [
    {
        "name": "H2O",
        "label": "Vapor de Agua (H₂O)",
        "color": "rgba(56, 189, 248, 0.22)",
        "border_color": "#38bdf8",
        "ranges_um": [[1.35, 1.45], [1.80, 1.95], [2.65, 3.05]],
    },
    {
        "name": "CH4",
        "label": "Metano (CH₄)",
        "color": "rgba(16, 185, 129, 0.22)",
        "border_color": "#10b981",
        "ranges_um": [[1.60, 1.70], [3.20, 3.45]],
    },
    {
        "name": "CO",
        "label": "Monóxido de Carbono (CO)",
        "color": "rgba(245, 158, 11, 0.22)",
        "border_color": "#f59e0b",
        "ranges_um": [[4.50, 4.80]],
    },
]


def find_mandatory_target_by_coords(ra_deg: float, dec_deg: float, tol_deg: float = 0.08) -> Dict[str, Any] | None:
    """Devuelve el objeto obligatorio si las coordenadas están dentro del radio de tolerancia."""
    for target in MANDATORY_TARGETS:
        if abs(target["ra_deg"] - ra_deg) <= tol_deg and abs(target["dec_deg"] - dec_deg) <= tol_deg:
            return target
    return None