# Papastronomy · SPHEREx & Planet X Discovery Platform (v2.5)
**NASA Space Apps Challenge 2026 · Challenge: "Planet X and SPHEREx"**  
**Equipo:** Papastronomy (Inteligencia Artificial + Ingeniería en Sistemas)

Para continuar el desarrollo desde otra PC o una nueva conversación con Codex, leer [Contexto y continuidad del MVP](docs/CONTEXTO_CODEX.md).

### Aprendé en 3D

La navegación y el asistente incluyen un visor educativo con dos objetos: una enana marrón y una estrella joven con disco de polvo. Permite rotación, inclinación del disco, zoom, animación, paletas artísticas visible/infrarroja y explicaciones simples o técnicas. Se abre en otra pestaña para conservar las observaciones. Son ilustraciones genéricas, sin reconstruir WISE 0855, Epsilon Indi B o RW Aurigae ni producir mediciones científicas.

El módulo es independiente y portable: copiar la carpeta [static/learn-3d](static/learn-3d/README.md) para integrarlo en otra versión. Con la app iniciada se accede desde `http://127.0.0.1:8000/static/learn-3d/index.html`.

Para abrir directamente la estrella, usar `http://127.0.0.1:8000/static/learn-3d/index.html?object=young-star`. También se puede preguntar al asistente **¿Qué es una estrella joven con disco?** y pulsar **Explorar la estrella en 3D**.

---

## Acceso demo y perfil personalizable

En la primera visita podés entrar con un perfil **Principiante**, **Explorador** o **Avanzado**, o continuar como invitado. El perfil aplica valores iniciales para los recortes, FPS y capas del visor; **todos los controles siguen disponibles** y los cambios manuales tienen prioridad sobre el nivel elegido.

En **Mi perfil** se editan alias, experiencia, intereses y nivel de explicación. Las preferencias se guardan por cuenta demo en el mismo navegador, se recuperan al volver y se pueden restablecer con **Restaurar configuración del perfil**. El formulario ahora permite elegir directamente la cantidad de **Recortes**. Los enlaces compartidos y el modo embebido continúan funcionando.

La navegación superior separa **Explorador** y **Asistente**. El asistente ocupa una sección propia con guías rápidas, contexto del campo, preguntas de seguimiento y un chat de respuestas integradas (*built-in answers*). Cambiar de sección conserva la conversación y las observaciones sin volver a descargarlas. Explica el detector y el candidato seleccionado usando el estado actual de la app, adapta el detalle al perfil y prepara ajustes editables. Usa reglas locales, sin un LLM ni llamadas a una API de IA. El chat recuerda el último tema dentro de la misma conversación, aclara preguntas ambiguas y adapta las sugerencias a los datos disponibles. Ofrece accesos al detector y al espectro, y muestra el detalle de las respuestas en un desplegable. Las respuestas incluyen fuentes numeradas: datos de la consulta, diagnósticos, fotometría o guías del método; la explicación general de SPHEREx enlaza las referencias oficiales de NASA e IRSA. Las propuestas conservan las preferencias manuales y se aplican solo al pulsar su botón; el campo y las coordenadas se mantienen.

Es un acceso de demostración, sin contraseñas ni autenticación de cuentas reales. El perfil se configura mediante reglas y preferencias locales. El recorrido y el alcance están en [PERFILES_DEMO.md](docs/PERFILES_DEMO.md).

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

Los visores muestran el norte arriba y el este a la izquierda. Cada exposición conserva sus píxeles válidos y sus huecos: no se reconstruyen núcleos saturados ni se rellenan bordes. La grilla común de 128 × 128 no agrega resolución a los FITS originales; el visor indica las dimensiones nativas de cada recorte. El contexto local es la mediana, independiente del flipbook. Los recortes sin píxeles válidos siguen accesibles en el selector, con un aviso, y se omiten de la secuencia automática. Las marcas conservan las coordenadas del catálogo; diferencias de época o movimiento propio pueden producir desplazamientos reales. Un relevamiento externo que falla muestra su estado de carga, sin sustituirse silenciosamente por SPHEREx.

| Módulo / Capacidad | Estado | Implementación en el Proyecto |
| :--- | :---: | :--- |
| **Búsqueda por Coordenadas (Decimal y HMS/DMS) y FoV** | ✅ Operativo | Entrada de `RA` ($0^\circ\text{–}360^\circ$ o `08h55m10.831s`), `Dec` ($-90^\circ\text{–}+90^\circ$ o `-07d14m42.53s`) y `FoV` ($0.005^\circ\text{–}1.0^\circ$). |
| **5 Objetivos Oficiales de Prueba de la NASA** | ✅ Operativo | Carga en `~1.0 s` desde caché real FITS para **WISE 0855**, **Barnard's Star**, **Epsilon Indi B**, **RW Aurigae** y **R Draconis**. |
| **Sincronización en Vivo con SPHEREx DR1 + QR3** | ✅ Operativo | Consulta simultánea a `spherex_dr1` y `spherex_qr3` en IRSA SIA + respaldo TAP `spherex.artifact`/`spherex.plane` y botón de actualización incremental (`refresh=true`). |
| **Reproductor Flipbook + Par Temporal (Blink A/B)** | ✅ Operativo | Animación de 1 a 6 FPS, modo dedicado **Par temporal comparable (Blink A/B)** sobre `analysis_frame_indices` y exportación de video `.webm`. |
| **Mediana por detector (`D1` a `D6`)** | ✅ Operativo | Apilado mediano independiente por detector (`detector_coadds`), con rango de longitudes de onda y porcentaje de píxeles válidos. |
| **Comparación manual de recortes A/B** | ✅ Operativo | Resta y promedio visuales de los PNG estirados, y Blink A/B. Estas vistas no miden diferencias de flujo; para eso se utiliza la resta temporal calibrada del backend. |
| **Falso color infrarrojo RGB** | ✅ Operativo | Tres rangos: azul <1.65 µm, verde 1.65–3.0 µm y rojo ≥3.0 µm. Requiere recortes en los tres rangos y cobertura válida en cada canal. Se combinan vistas estiradas; el color no permite medir temperatura. |
| **Ajustes de imagen** | ✅ Operativo | Inversión (`#chk-invert`, `&invert=1`), curva adicional y ganancia de brillo sobre vistas PNG. Por defecto, los píxeles de cada exposición se conservan exactamente como los entrega el backend. Las mediciones usan los FITS originales. |
| **Shift & Stack y Auto-Track** | ✅ Vista previa | Desplazamiento bilineal y promedio visual de PNG según fechas reales y movimiento propio, o trayectoria del dipolo. Conserva los huecos y los límites de cobertura; no calcula flujo ni una ganancia de SNR. Incluye enlace a WiseView. |
| **Resta Temporal Calibrada ($\Delta I$) + IA Astrométrica** | ✅ Operativo | Igualación de PSF (`src/difference.py`), detección $>4\sigma$ (`src/ai_detector.py`) y estimador dual **Movimiento Propio ($\mu$) vs. Distancia Planeta X (`UA`)**. |
| **Fondos Multi-Misión (AllWISE / 2MASS / DSS2) + Gaia DR3** | ✅ Operativo | Selector de relevamiento de fondo vía CDS `hips2fits` + superposición de **Gaia DR3** (con respaldo JSON rápido vía AWS API Gateway), **AllWISE**, **SIMBAD** y exoplanetas. |
| **Espectro 102 Bandas $F(\lambda)$ + Curva de Luz $F(t)$** | ✅ Operativo | Conmutador interactivo entre espectro infrarrojo y serie temporal por detector, con ajuste de cuerpo negro de Planck ($T_{\text{eff}}$) y bandas de $\text{H}_2\text{O}$, $\text{CH}_4$, $\text{CO}$. |
| **FLAGS y cobertura** | ✅ Operativo | Enmascarado científico de bits anómalos (preservando `MP_SOURCE` y `MP_FULLSAMPLE`). Damero para píxeles no válidos o sin cobertura; capa magenta de FLAGS sobre exposiciones individuales. |
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
El lanzador multiplataforma [`start_project.py`](start_project.py) (invocado también por `run_project.bat` en Windows o `./run_project.sh` en Linux/macOS) detecta automáticamente una versión compatible de Python, crea el entorno virtual `.venv` si no existe, instala las dependencias y levanta el servidor en `http://127.0.0.1:8000`. El servidor arranca sin el proceso adicional de vigilancia de archivos. Para desarrollo con recarga automática se puede añadir `--reload`.

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
.\.venv\Scripts\python.exe -m uvicorn src.main:app --reload --host 127.0.0.1 --port 8000
```

---

## 6. Pruebas Automatizadas y Rendimiento

### Ejecución de la suite de tests (90 tests unitarios y de integración)
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
- Límites LRU por memoria, caducidad, invalidación de FITS modificados, caché HTTP y compresión sin cambios en las respuestas (`tests/test_performance.py`).
- Integridad de PNG: conservación de cobertura, huecos saturados y orientación (`tests/test_performance.py`).
- Regresiones JavaScript sin npm: `node scripts/check_frontend.cjs`, `node scripts/check_profiles.cjs`, `node scripts/check_images.cjs` y `node scripts/check_assistant.cjs` (píxeles, cobertura, canales RGB, A/B, apilado, coordenadas y relevamientos externos).

### Optimización e instalación liviana

Se eliminaron del conjunto de dependencias directas **Pandas, Matplotlib, scikit-image y Astroquery**. El cliente TAP recorre las tablas Astropy directamente y los PNG usan NumPy/Pillow. Los cálculos científicos conservan NumPy, SciPy, Astropy, Reproject y Photutils. Instalar los requisitos nuevos en un entorno viejo no desinstala automáticamente los paquetes sobrantes.

Para crear un entorno reducido sin reemplazar el existente:

```bash
# Linux
bash run_project.sh --venv .venv-light --setup-only
bash run_project.sh --venv .venv-light --no-install
```

```bat
rem Windows
run_project.bat --venv .venv-light --setup-only
run_project.bat --venv .venv-light --no-install
```

La API comprime JSON y JavaScript cuando el cliente admite gzip. El JavaScript permite revalidación con ETag/Last-Modified, y la interfaz carga Plotly Basic para los espectros y curvas de luz. El arrastre agrupa los repintados por frame y retiene como máximo seis imágenes de relevamientos externos. El mosaico libera sectores alejados con un objetivo de 32 en memoria, protegiendo el campo visible, sus vecinos y la selección; los metadatos dejan de retener los PNG base64 después de decodificarlos.

Las cachés usan LRU y presupuestos configurables antes de iniciar:

| Variable de entorno | Predeterminado | Alcance |
| --- | --- | --- |
| `PAPASTRONOMY_FITS_CACHE_MB` | 64 MiB | Buffers y estructuras Python de FITS leídos. |
| `PAPASTRONOMY_REPROJECT_CACHE_MB` | 16 MiB | Imágenes y máscaras reproyectadas. |
| `PAPASTRONOMY_RESPONSE_CACHE_MB` | 16 MiB | Respuestas de exploración; caducan a los cinco minutos. |

Se admiten enteros no negativos; `0` desactiva la caché correspondiente. Estos presupuestos contabilizan los datos retenidos, **no el consumo total del proceso** ni todas las estructuras nativas de WCS. Una entrada mayor al presupuesto se procesa sin guardarse. Los FITS y las reproyecciones se invalidan al cambiar tamaño o fecha de modificación del archivo.

Para distribuir solo el código y los recursos, sin `.git`, entornos ni FITS:

```bash
python scripts/create_light_bundle.py
```

Genera `dist/papastronomy-light.zip`. Esta distribución necesita internet para obtener datos astronómicos; la caché se prepara al consultar los cinco objetivos desde la interfaz. La suite completa incluye pruebas con esos FITS y requiere prepararlos antes de ejecutarse en una instalación sin datos.

Las mediciones, el alcance de las pruebas y los comandos para repetirlas están en [OPTIMIZACION.md](docs/OPTIMIZACION.md). El `.gitignore` excluye archivos generados nuevos; los FITS de demostración ya versionados siguen en Git porque las pruebas los necesitan. El historial mantiene su tamaño; el paquete liviano permite distribuir las fuentes sin incluirlo.

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
