# Papastronomy · SPHEREx & Planet X Explorer

Prototipo de exploración de imágenes infrarrojas para el proyecto NASA Space Apps 2026 del equipo Papastronomy. Permite consultar una región del cielo, recorrer sus exposiciones FITS, medir un espectro por posición y buscar candidatos a variación.

## Ejecutar

Se recomienda **CPython 3.12**. El lanzador admite 3.10–3.14 y usa dependencias compatibles con el intérprete del entorno virtual. Python 3.9 o anteriores no se admiten; el backend ya utiliza sintaxis de Python 3.10.

| Sistema | Iniciar | Comprobar sin instalar | Preparar y ejecutar pruebas |
| --- | --- | --- | --- |
| Linux / Bash | `bash run_project.sh` | `bash run_project.sh --check` | `bash run_project.sh --test` |
| Windows / CMD o doble clic | `run_project.bat` | `run_project.bat --check` | `run_project.bat --test` |
| Windows / PowerShell | `.\run_project.bat` | `.\run_project.bat --check` | `.\run_project.bat --test` |

Abrir **http://127.0.0.1:8000**. Ambos scripts llaman a `start_project.py`, funcionan desde otras carpetas y aceptan rutas con espacios. Conservan un entorno `.venv` compatible si ya existe; si falta, buscan primero Python 3.12 y después otra versión admitida. En Windows se usa `py` si está disponible y se admite `python` en PATH como alternativa.

El lanzador instala paquetes solo en el entorno virtual. No actualiza el Python del sistema, no fuerza Python 3.14 y no elimina entornos existentes. Si `.venv` pertenece a otro sistema operativo, está roto o utiliza un Python no compatible, se detiene con instrucciones. No se debe copiar un entorno virtual entre Windows y Linux.

Para elegir un intérprete al crear un entorno nuevo:

```bash
# Linux: ruta al Python deseado y entorno separado, sin borrar el anterior
PAPASTRONOMY_PYTHON=/usr/bin/python3.12 bash run_project.sh --venv .venv-linux
```

```bat
rem Windows CMD: usar una ruta real de tu equipo
set "PAPASTRONOMY_PYTHON=C:\Python312\python.exe"
run_project.bat --venv .venv-windows
```

Si se elige una carpeta de entorno que ya existe, se conserva su intérprete. `--setup-only` instala sin iniciar, `--no-install` reutiliza dependencias ya instaladas y `--port 8001` cambia el puerto. Para escuchar desde otras máquinas de la red se puede pasar `--host 0.0.0.0` explícitamente. Ctrl+C detiene el servidor.

`requirements.txt` mantiene el conjunto actual para Python 3.12–3.14 y selecciona otro conjunto fijado para 3.10–3.11 mediante marcadores de versión. No hace falta que cada integrante edite el archivo. Los entornos y la caché de Matplotlib no se versionan. Tampoco se descarga toda la caché astronómica al iniciar.

**Validación local:** instalación, 72 pruebas y arranque HTTP comprobados en Linux x64 con Python 3.10, 3.11, 3.12 y 3.14. La resolución de dependencias para Windows x64 pasó en esas mismas versiones, exigiendo wheels para las bibliotecas científicas principales. Eso no sustituye una ejecución en Windows. El workflow [compatibility.yml](.github/workflows/compatibility.yml) ejecuta los lanzadores y las pruebas en Windows/Linux con Python 3.10–3.14; antes del merge deben revisarse sus resultados. Python 3.13 está incluido en CI, pero no se ejecutó localmente en esta revisión.

La caché incluida contiene observaciones de WISE 0855, Barnard's Star, Epsilon Indi B, RW Aurigae y R Draconis. Para preparar o inspeccionar datos explícitamente:

```bash
.venv/bin/python setup_cache_and_inspect.py
```

Este último script puede descargar archivos y limpiar archivos sintéticos antiguos `epoch_*.fits`; no hace falta ejecutarlo para usar los objetivos ya precargados. No implementa opciones `--force-refresh` ni `--list-cached-targets`.

## Uso

1. Elegir un objetivo precargado o ingresar RA, Dec y FoV en grados.
2. Reproducir las exposiciones, elegir una manualmente o activar las máscaras de calidad.
3. Seleccionar una posición para medir su brillo superficial y longitud de onda en cada FITS con cobertura válida.
4. Consultar las posiciones de Gaia DR3 y AllWISE en el panel de contexto. Los errores de red se muestran como falta de disponibilidad.
5. Para buscar movimiento, usar **Buscar pares temporales**: consulta fechas antiguas y recientes de SPHEREx y amplía la muestra hasta 24 recortes. Puede tardar unos minutos.
6. Compartir la URL con `?ra=...&dec=...&fov=...`; `&temporal=1` conserva el modo temporal.

«Hasta 102 recortes» aumenta el límite de archivos solicitados; **no garantiza 102 bandas distintas**. Cada exposición tiene una fecha y una cobertura espectral propias.

## Arquitectura

```text
static/index.html + app.js     Canvas, controles y espectro con Plotly
             │
         src/main.py          FastAPI y caché de respuestas
             ├── irsa_client.py   IRSA TAP/IBE, descargas y consultas CDS
             ├── cache_utils.py   Rutas de manifiestos portables
             ├── pipeline.py      FITS, máscaras, WCS, reproyección y fotometría
             ├── analysis.py      Selección de exposiciones comparables
             ├── difference.py    PSF común, referencias fotométricas y calidad
             ├── temporal_search.py  Adquisición de observaciones separadas en el tiempo
             ├── ai_detector.py   Picos, dipolos y descripción de color
             └── schemas.py       Contrato de respuestas

data/cache/<región>/           FITS originales y manifest.json
```

No hay un modelo de aprendizaje automático entrenado: la detección usa estadística robusta y reglas geométricas. El panel de contexto es Canvas propio; no utiliza Aladin Lite. Las posiciones de los catálogos provienen de consultas reales a IRSA TAP, con CDS VizieR como respaldo. La respuesta identifica el servicio utilizado. Los cruces puntuales consultan Gaia DR3 / AllWISE.

## Procesamiento e interpretación

- Se enmascaran los píxeles contaminados y no finitos. Los bits informativos 12 y 21 se excluyen de la máscara de rechazo actual.
- Las imágenes se reproyectan a un WCS TAN común de 128 × 128 píxeles. Esa grilla no aumenta la resolución del detector: algunos recortes incluidos tienen 29 × 29 píxeles nativos.
- La mediana y la resta temporal utilizan un subconjunto del mismo detector con longitudes de onda evaluadas en el centro celeste solicitado y separadas como máximo por media banda. Para la resta se iguala aproximadamente la PSF y se ajusta el brillo relativo con al menos tres fuentes de referencia consistentes. Se priorizan grupos con mayor intervalo temporal y se prueban hasta ocho alternativas si falla la calibración. Se comparan mitades temporales sin dividir una fecha entre ambas.
- Los candidatos a dipolo requieren núcleos conectados de al menos tres píxeles, forma compacta y balance entre los lóbulos. Esto reduce asociaciones de ruido independiente; no elimina los falsos positivos por ruido correlacionado o errores sistemáticos.
- Sin dos fechas comparables, PSF conocida, referencias suficientes o cobertura común, la resta y las detecciones se deshabilitan y se explica el motivo. El flipbook puede recorrer bandas distintas: un cambio de aspecto por sí solo no demuestra variabilidad temporal.
- Los datos con unidades de brillo superficial compatibles se normalizan a MJy/sr; la varianza recibe el cuadrado del factor de conversión. Los espectros excluyen archivos con unidades desconocidas o cuentas instrumentales.
- La selección espectral evalúa el WCS espacial con distorsión y el WCS espectral en el píxel nativo elegido. Mide brillo superficial medio en una apertura, resta un fondo local y estima su incertidumbre.
- Las franjas H₂O, CH₄ y CO son referencias. Las reglas de color no estiman una confianza estadística, una temperatura ni confirman moléculas.
- Las imágenes de diferencia y mediana se calculan sobre matrices científicas en el backend; no sobre PNG contrastados.
- Si IRSA falla, solo se reutiliza la caché original de la misma región. Los manifiestos antiguos marcados `IRSA_SPHEREX_CACHE_FALLBACK` se excluyen porque modificaban la astrometría de otras regiones. Los archivos se conservan.

La detección sigue siendo **preliminar**: la igualación usa una aproximación gaussiana del ancho `PSF_FWHM`, y la escala fotométrica se ajusta por referencias del campo. Quedan pendientes la ePSF espacial, la covarianza y la validación con fuentes de propiedades conocidas. No debe interpretarse como una confirmación de movimiento o descubrimiento.

## API

Documentación interactiva: http://127.0.0.1:8000/docs

| Ruta | Función |
| --- | --- |
| `GET /api/targets` | Objetivos precargados |
| `GET /api/explore?ra=...&dec=...&fov=...&max_epochs=10` | Imágenes, productos y candidatos |
| `GET /api/spectrum?ra=...&dec=...&center_ra=...&center_dec=...` | Medición puntual sobre los FITS de la región |
| `GET /api/catalog?catalog=gaia&ra=...&dec=...&fov=...` | Hasta 2000 fuentes reales del campo; también `allwise` |
| `GET /api/crossmatch?ra=...&dec=...&radius=14` | Contraparte próxima en un radio en segundos de arco |

`refresh=true` en `/api/explore` fuerza una consulta nueva. El campo `target_info.analysis_frame_indices` identifica los recortes usados en los productos; `difference_available` y `analysis_note` explican la disponibilidad de la resta. `difference_quality` incluye estado, PSF común en arcsec, tiempo entre las medias de las mitades, cobertura válida y factores/offsets de calibración por exposición. `temporal_search=true` en `/api/explore` o `/api/spectrum` utiliza el conjunto temporal, con límite de 32 archivos por petición; el botón solicita 24. Las descargas temporales quedan en `data/cache/temporal_*/`, excluido de Git. Las descargas parciales recientes se reutilizan durante diez minutos; pulsar el botón fuerza una nueva consulta de metadatos y reutiliza los FITS ya disponibles.

## Pruebas

```bash
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m unittest discover -s tests -v
```

En Windows se usa `.venv\Scripts\python.exe` en lugar de `.venv/bin/python`. También se puede ejecutar directamente `run_project.bat --test` o `bash run_project.sh --test`.

**72 pruebas de regresión**, incluidas escenas controladas con cambios de PSF, ganancia, fondo, variabilidad y movimiento conocido. La ruta FITS → API verifica la detección automática de un dipolo. También se comprueba el respaldo de catálogos, las columnas genéricas de IRSA y las unidades de flujo/varianza. Las pruebas cubren rutas Windows/Linux, rechazo de caché trasladada, tiempos menores a un día, selección de bandas, productos numéricos, máscaras transparentes, fotometría puntual y errores HTTP. También prueban los cinco objetivos con la caché incluida y la consulta remota de imágenes bloqueada mediante mocks.

Las imágenes precargadas se procesan sin conexión. La interfaz utiliza Tailwind y Plotly desde CDN, y las consultas nuevas a IRSA/CDS necesitan internet: no es una aplicación web completamente offline.

## Referencias y revisión

- [IRSA: recortes SPHEREx por detector y fecha](https://caltech-ipac.github.io/irsa-tutorials/spherex-cutouts/).
- [IRSA: extracción y visualización de fuentes](https://caltech-ipac.github.io/irsa-tutorials/spherex-source-discovery-tool-demo/).
- [Revisión técnica del 5 de noviembre de 2026](docs/REVISION_2026-11-05.md), con correcciones y pendientes.
- [Compatibilidad de arranque y Python](docs/COMPATIBILIDAD.md), con alcance de pruebas y comprobaciones previas al merge.
- [Validación específica de dipolos](docs/VALIDACION_DIPOLOS.md): pruebas controladas, disponibilidad en la caché real y falsos positivos observados.

Los documentos de planificación originales se mantienen como contexto del objetivo del proyecto; no equivalen a una lista de funciones verificadas.
