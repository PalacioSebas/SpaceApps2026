# Papastronomy · SPHEREx & Planet X Discovery Platform (v2.4)
**NASA Space Apps Challenge 2026 · Challenge: "Planet X and SPHEREx"**  
**Equipo:** Papastronomy (Inteligencia Artificial + Ingeniería en Sistemas)

---

## 1. Resumen Ejecutivo

El telescopio espacial **SPHEREx** de la NASA cartografía la totalidad del cielo cada 6 meses en **102 bandas espectrales infrarrojas** ($0.75\ \mu\text{m}$ a $5.00\ \mu\text{m}$) mediante Filtros Lineales Variables (LVF) distribuidos en 6 detectores (`D1` a `D6`). En ese volumen de datos, los objetos cercanos con alto movimiento propio (enanas marrones ultra-frías como **WISE 0855**, estrellas cercanas como **Barnard's Star**, objetos transneptunianos o un hipotético **Planeta X**) se desplazan entre épocas, mientras que las estrellas variables (**RW Aurigae**, **R Draconis**) experimentan variaciones significativas de flujo infrarrojo.

**Papastronomy SPHEREx Explorer (v2.4)** es una plataforma web científica que permite explorar cualquier coordenada celeste `(RA, Dec, FoV)` sobre recortes `.FITS` reales de **NASA/IPAC IRSA**:

- **Plano Infinito Sincronizado (Bajo Demanda):** Por defecto se carga únicamente la sección solicitada por el usuario para optimizar recursos; mediante el botón **`Activar Mapa Global Continuo`**, se habilita la descarga anticipada de sectores vecinos ($96\times 96\ \text{px}$ centrales libres de bordes sobre recortes de $128\times 128\ \text{px}$) y paquetes extendidos de estrellas (`3x FoV`) al arrastrar cualquiera de los dos visores.
- **Alineación WCS Estándar y Normalización Fotométrica:** Reproyección astrométrica exacta con Norte arriba y Este a la izquierda (`CDELT1 < 0`, `CDELT2 > 0`), igualación de fondo por mediana y dispersión robusta ($\text{MAD}\,\sigma$) e *inpainting* de huecos de rayos cósmicos para transiciones continuas entre sectores.
- **Resta Temporal Calibrada ($\Delta I$) y Detección IA:** Selección automática de grupos multi-fecha comparables en el mismo detector y sub-banda, igualación de PSF gaussiana, ajuste fotométrico relativo resistente a estrellas variables y detección automática ($>4\sigma$) de **Astros en Movimiento (`MOVING_DIPOLE`)** y **Estrellas Variables (`VARIABLE_MONOPOLE`)**.
- **Identificación y Nombrado Automático de Astros:** Cruce simultáneo con **SIMBAD (CDS)**, **Gaia DR3**, **AllWISE**, **NASA Exoplanet Archive** y efemérides planetarias del Sistema Solar (`astropy.coordinates.get_body`), con explicaciones en lenguaje claro y etiquetas interactivas al pasar el cursor.
- **Espectro Infrarrojo de 102 Bandas y Diagnóstico Molecular IA:** Extracción fotométrica en vivo evaluando el WCS espectral 2D (`WCS-WAVE`) en el píxel nativo de cada exposición y detección automática de bandas de absorción/emisión de $\text{H}_2\text{O}$, $\text{CH}_4$, $\text{CO}$, $\text{CO}_2$ y $\text{PAH}$.

---

## 2. Estado de Funcionalidades Actuales (v2.4)

| Módulo / Capacidad | Estado | Implementación en el Proyecto |
| :--- | :---: | :--- |
| **Búsqueda por Coordenadas y FoV** | Operativo | Entrada de `RA` ($0^\circ\text{–}360^\circ$), `Dec` ($-90^\circ\text{–}+90^\circ$) y `FoV` ($0.005^\circ\text{–}1.0^\circ$). |
| **5 Casos Oficiales de la NASA** | Operativo | Carga en `< 1.0 s` desde caché real FITS para **WISE 0855**, **Barnard's Star**, **Epsilon Indi B**, **RW Aurigae** y **R Draconis**. |
| **Plano Infinito Sincronizado** | Operativo | Mosaico continuo en ambos lienzos con arrastre/zoom acoplados y cola de precarga en segundo plano. |
| **Reproductor Multi-Época (Flipbook)** | Operativo | Animación de 1 a 6 FPS, control por época, selector de banda individual y carga bajo demanda de hasta 102 recortes. |
| **Resta Temporal Calibrada ($\Delta I$)** | Operativo | Igualación de PSF (`src/difference.py`), escalado fotométrico en anillo/apertura tolerante a máscaras `NaN` y paleta divergente `RdBu_r`. |
| **Mediana Profunda (`Coadd`)** | Operativo | Combinación mediana de exposiciones comparables con curado visual de píxeles afectados por rayos cósmicos. |
| **Detección IA en $\Delta I$** | Operativo | Clasificación de dipolos de movimiento y monopolos variables (`src/ai_detector.py`), con botones de salto directo a Resta y Flipbook. |
| **Identificación de Estrellas y Planetas** | Operativo | Endpoint `/api/objects` que unifica SIMBAD, Gaia DR3, AllWISE, sistemas exoplanetarios y planetas del Sistema Solar. |
| **Espectro 102 Bandas On-The-Fly** | Operativo | Endpoint `/api/spectrum` con fotometría de apertura real en `MJy/sr`, gráfico interactivo Plotly.js y asistente molecular IA. |
| **Banderas de Contaminación (`FLAGS`)** | Operativo | Limpieza de píxeles anómalos en el pipeline científico y capa visual conmutable de rayos cósmicos y saturación. |
| **URL Parametrizada Embebible** | Operativo | Sincronización automática de `?ra=...&dec=...&fov=...&temporal=1` en el navegador y copiado rápido al portapapeles. |

> Para una revisión detallada de qué aspectos del desafío oficial de la NASA ya están cubiertos y qué mejoras adicionales se proponen, consultar [`EVALUACION_OBJETIVOS_NASA.md`](file:///c:/Users/Sebas/OneDrive/Desktop/Nasa/EVALUACION_OBJETIVOS_NASA.md).

---

## 3. Arquitectura del Sistema

```text
+-----------------------------------------------------------------------------------+
|                               FRONTEND (static/)                                  |
|  - static/index.html    : Interfaz principal de 3 paneles + panel espectral       |
|  - static/app.js        : Visor sincronizado, Mapa Global conmutable, Resta/IA,   |
|                           Catálogos y Espectro interactivo Plotly.js              |
+-----------------------------------------+-----------------------------------------+
                                          |
                                  HTTP / JSON API
                                          |
+-----------------------------------------v-----------------------------------------+
|                               BACKEND (FastAPI - src/)                            |
|  - src/main.py            : Endpoints REST y caché en memoria de exploraciones    |
|  - src/irsa_client.py     : Consultas ADQL TAP / SIA a NASA IRSA, CDS VizieR,     |
|                             SIMBAD y NASA Exoplanet Archive + caché incremental   |
|  - src/temporal_search.py : Muestreo multi-época maximizando baseline temporal    |
|  - src/analysis.py        : Agrupación de exposiciones por detector y sub-banda   |
|  - src/pipeline.py        : Lectura FITS (IMAGE/FLAGS/VARIANCE/WCS-WAVE),         |
|                             reproyección WCS común y extracción espectral         |
|  - src/difference.py      : Igualación gaussiana de PSF y fotometría relativa     |
|  - src/ai_detector.py     : Detección >4 sigma de dipolos/monopolos y moléculas   |
|  - src/schemas.py         : Contratos de datos Pydantic v2                        |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
                         data/cache/ (Recortes .FITS Reales)
                         |-- wise_0855/
                         |-- barnards_star/
                         |-- epsilon_indi_b/
                         |-- rw_aurigae/
                         |-- r_draconis/
                         +-- coord_*/ (Regiones exploradas dinámicamente)
```

### Endpoints Principales de la API

1. **`GET /api/targets`**: Devuelve los 5 objetivos obligatorios de la NASA con sus coordenadas ICRS y descripciones.
2. **`GET /api/explore`**: Descarga o recupera de caché los recortes `.FITS` reales de la coordenada `(ra, dec, fov)`, selecciona el mejor grupo temporal comparable, calcula la mediana (`coadd`) y la resta calibrada ($\Delta I$), y ejecuta el detector IA de anomalías.
3. **`GET /api/spectrum`**: Evalúa el espectro infrarrojo real (`0.75` a `5.00 µm`) sobre todos los recortes `.FITS` disponibles en la región para el punto seleccionado `(ra, dec)` y devuelve el diagnóstico químico molecular.
4. **`GET /api/catalog`**: Consulta fuentes astrométricas y fotométricas de **Gaia DR3** o **AllWISE** en el campo de visión solicitado (vía IRSA TAP con respaldo automático en CDS VizieR).
5. **`GET /api/objects`**: Identifica y nombra estrellas, enanas marrones, galaxias, estrellas con exoplanetas confirmados y planetas del Sistema Solar dentro del campo.
6. **`GET /api/crossmatch`**: Realiza el cruce puntual de una coordenada `(ra, dec)` con SIMBAD, Gaia DR3 y AllWISE.

---

## 4. Estructura del Repositorio

```text
Nasa/
├── src/
│   ├── __init__.py
│   ├── main.py                  # Aplicación FastAPI y rutas HTTP
│   ├── config.py                # Parámetros globales, detectores y 5 casos NASA
│   ├── schemas.py               # Modelos Pydantic de entrada/salida
│   ├── irsa_client.py           # Cliente NASA/IPAC IRSA + CDS + caché local
│   ├── temporal_search.py       # Búsqueda específica de pares multi-época
│   ├── analysis.py              # Selección científica de bandas comparables
│   ├── pipeline.py              # Procesamiento FITS, reproyección WCS y espectros
│   ├── difference.py            # Calibración PSF, fotometría relativa y resta Delta I
│   ├── ai_detector.py           # Detector IA de dipolos/variables y clasificador espectral
│   └── cache_utils.py           # Resolución multiplataforma de rutas en manifest.json
├── static/
│   ├── index.html               # Interfaz principal de la aplicación web
│   └── app.js                   # Cliente interactivo v2.4 (Visor sincronizado + IA + Plotly)
├── tests/
│   ├── test_catalogs.py         # Pruebas de catálogos, designación IAU y caché incremental
│   ├── test_difference.py       # Pruebas de calibración fotométrica e igualación PSF
│   ├── test_dipoles.py          # Pruebas de detección de dipolos y monopolos variables
│   ├── test_regressions.py      # Pruebas de regresión científica, API y 5 objetivos NASA
│   └── test_temporal_search.py  # Pruebas de selección y adquisición de pares temporales
├── data/
│   └── cache/                   # Caché local de recortes FITS reales y catálogos JSON
├── setup_cache_and_inspect.py   # Inicializador y verificador de caché real de IRSA
├── EVALUACION_OBJETIVOS_NASA.md # Evaluación de objetivos cubiertos y mejoras propuestas
├── AGENTS.md                    # Reglas de exploración del grafo de código con Reducto
├── requirements.txt             # Dependencias de Python
├── run_project.bat              # Script de arranque rápido en Windows
└── run_project.sh               # Script de arranque rápido en Linux/macOS
```

---

## 5. Instalación, Inicialización de Caché y Ejecución

### Requisitos
- **Python:** 3.10 o superior (recomendado 3.11 / 3.12).
- **Entorno virtual:** `.venv` en la raíz del proyecto.

### 1. Crear el entorno virtual e instalar dependencias
```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Verificar o poblar la caché de recortes `.FITS` reales
El script [`setup_cache_and_inspect.py`](file:///c:/Users/Sebas/OneDrive/Desktop/Nasa/setup_cache_and_inspect.py) redirige automáticamente su ejecución al `.venv` del proyecto, verifica cuáles de los 5 objetivos de la NASA ya están en `data/cache/`, reconstruye u ordena `manifest.json` priorizando pares temporales comparables si hace falta, y descarga desde IRSA únicamente los objetivos faltantes:
```powershell
py .\setup_cache_and_inspect.py
```

### 3. Iniciar el servidor web
```powershell
.\.venv\Scripts\python.exe -m uvicorn src.main:app --reload --host 127.0.0.1 --port 8000
```
Luego abrir en el navegador:
```text
http://127.0.0.1:8000
```

---

## 6. Pruebas Automatizadas y Rendimiento

### Ejecución de la suite de tests (74 tests unitarios y de integración)
```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```
La suite verifica:
- Calibración fotométrica relativa e igualación de PSF ante cambios de ganancia y fondo (`tests/test_difference.py`).
- Separación entre dipolos en movimiento (`MOVING_DIPOLE`) y monopolos variables (`VARIABLE_MONOPOLE`) sin falsos positivos por artefactos lineales o píxeles calientes (`tests/test_dipoles.py`).
- Selección de líneas de base temporales y exclusión de restas entre detectores o longitudes de onda incompatibles (`tests/test_temporal_search.py` y `tests/test_regressions.py`).
- Funcionamiento 100% offline de los 5 casos oficiales de la NASA con resta temporal disponible (`difference_available = True`) y detecciones IA verificadas (`tests/test_regressions.py`).

### Métricas de Rendimiento Actuales (v2.4)
| Operación | Tiempo Medido | Detalle |
| :--- | :--- | :--- |
| `/api/explore` en los 5 objetivos en caché (`max_epochs=10`) | `0.83 s – 0.98 s` | Incluye lectura FITS, reproyección WCS, resta calibrada $\Delta I$ y detección IA. |
| `/api/explore` repetido (caché en memoria `_EXPLORE_CACHE`) | `< 0.01 s` | Respuesta inmediata al alternar entre regiones ya visitadas. |
| `/api/spectrum` sobre recortes en caché | `0.02 s – 0.15 s` | Reutiliza cabeceras y matrices FITS cacheadas en memoria (`_FRAME_CACHE`). |
| `/api/catalog` y `/api/objects` en caché de disco | `< 0.02 s` | Lectura directa de `catalog_gaia.json`, `catalog_allwise.json` y `named_objects.json`. |

---

## 7. Créditos y Fuentes de Datos

- **NASA/IPAC Infrared Science Archive (IRSA):** Recortes `.FITS` reales de la misión **SPHEREx** (`spherex.obscore`) y catálogos **AllWISE** / **Gaia DR3** + **NASA Exoplanet Archive**.
- **Centre de Données astronomiques de Strasbourg (CDS):** Servicios **SIMBAD** y **VizieR** para identificación de objetos astronómicos y respaldo de catálogos.
- **Astropy, Reproject y Photutils:** Procesamiento de WCS, reproyección astrométrica, efemérides del Sistema Solar y detección fotométrica de fuentes.
