# Papastronomy · SPHEREx & Planet X Discovery Platform (v2.5)
**NASA Space Apps Challenge 2026 · Challenge: "Planet X and SPHEREx"**  
**Equipo:** Papastronomy (Inteligencia Artificial + Ingeniería en Sistemas)

---

## 1. Resumen Ejecutivo

El telescopio espacial **SPHEREx** de la NASA cartografía la totalidad del cielo cada 6 meses en **102 bandas espectrales infrarrojas** ($0.75\ \mu\text{m}$ a $5.00\ \mu\text{m}$) mediante Filtros Lineales Variables (LVF) distribuidos en 6 detectores (`D1` a `D6`). En ese volumen de datos, los objetos cercanos con alto movimiento propio (enanas marrones ultra-frías como **WISE 0855**, estrellas cercanas como **Barnard's Star**, objetos transneptunianos o un hipotético **Planeta X**) se desplazan entre épocas, mientras que las estrellas variables (**RW Aurigae**, **R Draconis**) experimentan variaciones drásticas de flujo infrarrojo.

**Papastronomy SPHEREx Explorer (v2.5)** es una plataforma web científica e interactiva que permite a cualquier usuario explorar parches del cielo por coordenadas `(RA, Dec, FoV)` en grados decimales o sexagesimales (`HMS`/`DMS`) sobre recortes `.FITS` reales de **NASA/IPAC IRSA** (**SPHEREx Data Release 1 `DR1` + Quick Release 3 `QR3`**):

- **Integración Directa con SPHEREx DR1 + QR3 (Noviembre 2026):** Consultas espaciales indexadas vía SIA (`COLLECTION=spherex_dr1&COLLECTION=spherex_qr3`) y TAP (`spherex.artifact` + `spherex.plane`) siguiendo los *SPHEREx Tutorial Notebooks* oficiales de Caltech/IPAC, combinando las imágenes históricas reprocesadas en **DR1** con las épocas más recientes de **QR3** como un conjunto fotométricamente uniforme.
- **Reproductor Multi-Época (Flipbook / Blink Comparator) y Exportación a Video `.webm`:** Animación fluida de 1 a 6 FPS, modo **Par Temporal Comparable (Blink A/B)** sobre el mismo detector y longitud de onda, **Suma SNR por Detector (`D1` a `D6`)** y operaciones manuales entre dos épocas arbitrarias ($B - A$, $A + B$ y $\text{Blink } A \leftrightarrow B$).
- **Falso Color Infrarrojo RGB (3 Bandas SPHEREx):** Síntesis tricromática en vivo combinando el infrarrojo cercano corto ($< 1.65\ \mu\text{m}$ en azul), infrarrojo cercano medio ($1.65\text{–}3.0\ \mu\text{m}$ en verde) e infrarrojo medio ($\ge 3.0\ \mu\text{m}$ en rojo) para resaltar al instante enanas marrones ultrafrías y discos circumestelares.
- **Resta Temporal Calibrada ($\Delta I$), Detección IA y Estimador Astrométrico Planeta X:** Igualación gaussiana de PSF, ajuste fotométrico relativo resistente a estrellas variables y detección automática ($>4\sigma$) de **Astros en Movimiento (`MOVING_DIPOLE`)** y **Estrellas Variables (`VARIABLE_MONOPOLE`)**, desglosando en cada dipolo tanto el movimiento propio lineal ($\mu$ en `″/año`, hipótesis estrella cercana / enana marrón) como la distancia heliocéntrica equivalente por paralaje ($d$ en `UA`, hipótesis Planeta X / TNO).
- **Visor de Contexto Astronómico Multi-Misión:** Superposición interactiva de catálogos **Gaia DR3** (con vectores de movimiento propio), **AllWISE**, **SIMBAD**, **NASA Exoplanet Archive** y efemérides del Sistema Solar sobre fondos conmutables en proyección gnomónica `TAN` (**SPHEREx IR Local**, **AllWISE Color**, **2MASS JHK** y **DSS2 Óptico** vía CDS `hips2fits`).
- **Espectro Infrarrojo $F(\lambda)$ y Curva de Luz Temporal $F(t)$ al Vuelo:** Extracción fotométrica de apertura real en `MJy/sr` con propagación de `VARIANCE` y evaluación del WCS espectral 2D (`WCS-WAVE`, `key='W'` con `sip=None`), acompañada de ajuste físico de temperatura de color de Planck ($T_{\text{eff}}$), detección de bandas moleculares ($\text{H}_2\text{O}$, $\text{CH}_4$, $\text{CO}$) y exportación científica en 1 clic a **CSV** y **PNG**.

---

## 2. Estado de Funcionalidades Actuales (v2.5)

| Módulo / Capacidad | Estado | Implementación en el Proyecto |
| :--- | :---: | :--- |
| **Búsqueda por Coordenadas (Decimal y HMS/DMS) y FoV** | ✅ Operativo | Entrada de `RA` ($0^\circ\text{–}360^\circ$ o `08h55m10.831s`), `Dec` ($-90^\circ\text{–}+90^\circ$ o `-07d14m42.53s`) y `FoV` ($0.005^\circ\text{–}1.0^\circ$). |
| **5 Objetivos Oficiales de Prueba de la NASA** | ✅ Operativo | Carga en `~1.0 s` desde caché real FITS para **WISE 0855**, **Barnard's Star**, **Epsilon Indi B**, **RW Aurigae** y **R Draconis**. |
| **Sincronización en Vivo con SPHEREx DR1 + QR3** | ✅ Operativo | Consulta simultánea a `spherex_dr1` y `spherex_qr3` en IRSA SIA + respaldo TAP `spherex.artifact`/`spherex.plane` y botón de actualización incremental (`refresh=true`). |
| **Reproductor Flipbook + Par Temporal (Blink A/B)** | ✅ Operativo | Animación de 1 a 6 FPS, modo dedicado **Par temporal comparable (Blink A/B)** sobre `analysis_frame_indices` y exportación de video `.webm`. |
| **Suma SNR por Detector (`D1` a `D6`)** | ✅ Operativo | Apilado mediano independiente por cada uno de los 6 detectores de SPHEREx (`detector_coadds`) con rango $\lambda_{\min}\text{–}\lambda_{\max}$ y métricas de limpieza. |
| **Operaciones Manuales entre Épocas ($t_A$ vs $t_B$)** | ✅ Operativo | Selectores de Época A y Época B con botones para **Restar ($B - A$)**, **Sumar ($A + B$)** y **Blink $A \leftrightarrow B$**. |
| **Modo Falso Color Infrarrojo RGB (3 Bandas)** | ✅ Operativo | Composición tricromática infrarroja (`Azul < 1.65 µm`, `Verde 1.65–3.0 µm`, `Rojo ≥ 3.0 µm`) renderizada en el navegador. |
| **Óptica en Vivo (0 ms · 60 FPS) estilo WiseView** | ✅ Operativo | Inversión de píxeles en negativo blanco/negro (`#chk-invert` / `&invert=1`), linealidad de transferencia continua `Asinh ↔ Lineal` (`#slider-stretch`) y ganancia radiométrica (`#slider-contrast`) en tiempo real sobre matrices `Float32Array` sin recargar del servidor. |
| **Shift & Stack (`pmRA`, `pmDec`) + Auto-Track Dipolo IA** | ✅ Operativo | Apilado en movimiento (`computeShiftAndStackCanvas`) que desplaza bilinealmente cada época según $(\mu_{\alpha^*}, \mu_\delta)$ en `mas/año` para amplificar el SNR ($\sim\sqrt{N}$) de objetos móviles, con botón **Auto-Track Dipolo IA** (`#btn-autotrack-dipole`) y enlace directo **Comparar en WiseView ↗** (`#btn-open-wiseview`). |
| **Resta Temporal Calibrada ($\Delta I$) + IA Astrométrica** | ✅ Operativo | Igualación de PSF (`src/difference.py`), detección $>4\sigma$ (`src/ai_detector.py`) y estimador dual **Movimiento Propio ($\mu$) vs. Distancia Planeta X (`UA`)**. |
| **Fondos Multi-Misión (AllWISE / 2MASS / DSS2) + Gaia DR3** | ✅ Operativo | Selector de relevamiento de fondo vía CDS `hips2fits` + superposición de **Gaia DR3** (con respaldo JSON rápido vía AWS API Gateway), **AllWISE**, **SIMBAD** y exoplanetas. |
| **Espectro 102 Bandas $F(\lambda)$ + Curva de Luz $F(t)$** | ✅ Operativo | Conmutador interactivo entre espectro infrarrojo y serie temporal por detector, con ajuste de cuerpo negro de Planck ($T_{\text{eff}}$) y bandas de $\text{H}_2\text{O}$, $\text{CH}_4$, $\text{CO}$. |
| **Banderas de Contaminación (`FLAGS`) y Metadatos** | ✅ Operativo | Enmascarado científico de bits anómalos (preservando `MP_SOURCE` y `MP_FULLSAMPLE`), lectura de `VERSION` del `PrimaryHDU` y capa magenta conmutable. |
| **URL Parametrizada Embebible + Exportación CSV/PNG** | ✅ Operativo | Sincronización `?ra=...&dec=...&fov=...&temporal=1&embed=1`, generador de `<iframe>` y descarga directa de imagen anotada `.png` y fotometría `.csv`. |

> Para el detalle completo del checklist contra los objetivos del challenge, consultar [`estado actual del proyecto.md`](file:///c:/Users/Sebas/OneDrive/Desktop/Nasa/estado%20actual%20del%20proyecto.md).

---

## 3. Arquitectura del Sistema

```text
+-----------------------------------------------------------------------------------+
|                               FRONTEND (static/)                                  |
|  - static/index.html    : Interfaz de 3 paneles + selectores A/B, RGB, HiPS,      |
|                           Espectro F(lambda) / Curva de Luz F(t) y exportación    |
|  - static/app.js        : Visor sincronizado, Falso Color RGB, Resta/Suma A/B,    |
|                           Relevamientos CDS HiPS2FITS, Catálogos y Plotly.js      |
+-----------------------------------------+-----------------------------------------+
                                          |
                                  HTTP / JSON API
                                          |
+-----------------------------------------v-----------------------------------------+
|                               BACKEND (FastAPI - src/)                            |
|  - src/main.py            : Endpoints REST, coadds por detector D1..D6 y caché    |
|  - src/irsa_client.py     : Consultas SIA (spherex_dr1 + spherex_qr3) y TAP       |
|                             a NASA IRSA, Gaia DR3, AllWISE, SIMBAD y Exoplanets   |
|  - src/temporal_search.py : Muestreo multi-época maximizando baseline temporal    |
|  - src/analysis.py        : Agrupación de exposiciones por detector y sub-banda   |
|  - src/pipeline.py        : Lectura FITS (PRIMARY/IMAGE/FLAGS/VARIANCE/WCS-WAVE), |
|                             reproyección WCS común y fotometría de apertura       |
|  - src/difference.py      : Igualación gaussiana de PSF y fotometría relativa     |
|  - src/ai_detector.py     : Detección >4 sigma de dipolos/monopolos, estimador    |
|                             Planeta X (UA) y ajuste espectral de Planck (T_eff)   |
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
2. **`GET /api/explore`**: Descarga o recupera de caché los recortes `.FITS` reales de la coordenada `(ra, dec, fov)`, selecciona el mejor grupo temporal comparable, calcula la mediana global (`coadd`), los apilados SNR por detector (`detector_coadds` para `D1`–`D6`), la resta calibrada ($\Delta I$) y ejecuta el detector IA con estimación astrométrica.
3. **`GET /api/spectrum`**: Evalúa el espectro infrarrojo real (`0.75` a `5.00 µm`) sobre todos los recortes `.FITS` disponibles en la región para el punto seleccionado `(ra, dec)` y devuelve el diagnóstico físico (temperatura efectiva de Planck $T_{\text{eff}}$, nivel de confianza y bandas moleculares).
4. **`GET /api/catalog`**: Consulta fuentes astrométricas y fotométricas de **Gaia DR3** o **AllWISE** en el campo de visión solicitado (vía IRSA TAP con respaldo automático en CDS VizieR y ARI Gaia).
5. **`GET /api/objects`**: Identifica y nombra estrellas, enanas marrones, galaxias, estrellas con exoplanetas confirmados y planetas del Sistema Solar dentro del campo.
6. **`GET /api/crossmatch`**: Realiza el cruce puntual de una coordenada `(ra, dec)` con SIMBAD, Gaia DR3 y AllWISE.

---

## 4. Estructura del Repositorio

```text
Nasa/
├── src/
│   ├── __init__.py
│   ├── main.py                  # Aplicación FastAPI, coadds D1..D6 y rutas HTTP
│   ├── config.py                # Endpoints IRSA (DR1+QR3), detectores y 5 casos NASA
│   ├── schemas.py               # Modelos Pydantic de entrada/salida
│   ├── irsa_client.py           # Cliente NASA/IPAC IRSA (SIA DR1+QR3 / TAP) + CDS + caché
│   ├── temporal_search.py       # Búsqueda específica de pares multi-época
│   ├── analysis.py              # Selección científica de bandas comparables
│   ├── pipeline.py              # Procesamiento FITS, reproyección WCS y espectros
│   ├── difference.py            # Calibración PSF, fotometría relativa y resta Delta I
│   ├── ai_detector.py           # Detector IA de dipolos/variables, Planeta X y Planck
│   └── cache_utils.py           # Resolución multiplataforma de rutas en manifest.json
├── static/
│   ├── index.html               # Interfaz principal de la aplicación web
│   └── app.js                   # Cliente interactivo v2.5 (Visor + RGB + A/B + Plotly)
├── tests/
│   ├── test_catalogs.py         # Pruebas de catálogos, designación IAU y caché incremental
│   ├── test_difference.py       # Pruebas de calibración fotométrica e igualación PSF
│   ├── test_dipoles.py          # Pruebas de detección de dipolos y monopolos variables
│   ├── test_launcher.py         # Pruebas de compatibilidad multiplataforma del lanzador
│   ├── test_regressions.py      # Pruebas de regresión científica, API, DR1+QR3 y 5 objetivos
│   └── test_temporal_search.py  # Pruebas de selección y adquisición de pares temporales
├── data/
│   └── cache/                   # Caché local de recortes FITS reales y catálogos JSON
├── start_project.py             # Lanzador multiplataforma con autoverificación de entorno
├── setup_cache_and_inspect.py   # Inicializador y verificador de caché real de IRSA
├── estado actual del proyecto.md# Checklist actualizado contra los objetivos de la NASA
├── AGENTS.md                    # Reglas de exploración del grafo de código con Reducto
├── requirements.txt             # Dependencias de Python
├── run_project.bat              # Script de arranque rápido en Windows
└── run_project.sh               # Script de arranque rápido en Linux/macOS
```

---

## 5. Instalación, Arranque Rápido y Ejecución

### Requisitos
- **Python:** 3.10 a 3.14 (compatible con Windows, Linux y macOS).

### Opción A: Arranque automático en 1 paso (Recomendado)
El lanzador multiplataforma [`start_project.py`](file:///c:/Users/Sebas/OneDrive/Desktop/Nasa/start_project.py) (invocado también por `run_project.bat` en Windows o `./run_project.sh` en Linux/macOS) detecta automáticamente una versión compatible de Python, crea el entorno virtual `.venv` si no existe, instala las dependencias, verifica la caché de recortes `.FITS` y levanta el servidor en `http://127.0.0.1:8000`:

```powershell
# En Windows:
.\run_project.bat
# o directamente con Python:
python start_project.py
```

```bash
# En Linux / macOS:
./run_project.sh
```

### Opción B: Ejecución manual paso a paso
```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
py .\setup_cache_and_inspect.py
.\.venv\Scripts\python.exe -m uvicorn src.main:app --reload --host 127.0.0.1 --port 8000
```

---

## 6. Pruebas Automatizadas y Rendimiento

### Ejecución de la suite de tests (79 tests unitarios y de integración)
```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```
La suite verifica:
- Consultas SIA combinadas al conjunto uniforme **`spherex_dr1` + `spherex_qr3`** y respaldo TAP (`tests/test_regressions.py`).
- Calibración fotométrica relativa e igualación de PSF ante cambios de ganancia y fondo (`tests/test_difference.py`).
- Separación entre dipolos en movimiento (`MOVING_DIPOLE`) y monopolos variables (`VARIABLE_MONOPOLE`), incluyendo cálculo de desplazamiento en arcsec y distancia heliocéntrica en UA (`tests/test_dipoles.py` y `tests/test_regressions.py`).
- Selección de líneas de base temporales y exclusión de restas entre detectores o longitudes de onda incompatibles (`tests/test_temporal_search.py`).
- Funcionamiento 100% offline de los 5 casos oficiales de la NASA con apilados por detector (`detector_coadds`), resta temporal disponible y ajuste espectral de Planck (`tests/test_regressions.py`).
- Compatibilidad multiplataforma del lanzador automático (`tests/test_launcher.py`).

---

## 7. Créditos, DOIs y Reconocimiento Oficial NASA SPHEREx

- **NASA/IPAC Infrared Science Archive (IRSA) — SPHEREx Data Release 1 (DR1) & Quick Releases (QR2/QR3):**
  - **SPHEREx DR1 Spectral Images:** `DOI: 10.26131/IRSA678` · **All-Sky Cube:** `DOI: 10.26131/IRSA679`
  - **SPHEREx QR3 Spectral Images:** `DOI: 10.26131/IRSA662` · **QR2 Spectral Images:** `DOI: 10.26131/IRSA652`
  - **Tutorials & Methodology:** [Caltech/IPAC IRSA SPHEREx Tutorial Notebooks](https://caltech-ipac.github.io/irsa-tutorials/spherex/)
  - **Inspiración de Interfaz Multi-Época:** [WiseView](http://byw.tools/wiseview) & [Backyard Worlds: Planet 9](http://backyardworlds.org/)
- **Catálogos Astronómicos y Relevamientos Complementarios:**
  - **ESA / DPAC Gaia Data Release 3 (DR3)** (`I/355/gaiadr3` / `gaia_dr3_source`)
  - **NASA/IPAC AllWISE & NEOWISE-R** y **NASA Exoplanet Archive**
  - **Centre de Données astronomiques de Strasbourg (CDS):** SIMBAD, VizieR y servicio `hips2fits` (AllWISE, 2MASS, DSS2)
- **Reconocimiento Oficial de la Misión SPHEREx (NASA / JPL / Caltech):**
  > *"This publication makes use of data products from the Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet Propulsion Laboratory and the California Institute of Technology, and is funded by the National Aeronautics and Space Administration."*
  - Referencias de la misión: Crill et al. (2025), Bock et al. (2026), Akeson et al. (2026), Korngut et al. (2026).
