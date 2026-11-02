# SYSTEM CONTEXT: NASA SPACE APPS 2026 - "PLANET X AND SPHEREx"
# TEAM: PAPASTRONOMY (2 AI/Data Devs + 4 Software Systems Devs)

> **INSTRUCCIÓN PARA LA IA LOCAL / ASISTENTE DE CÓDIGO:**
> Este documento contiene toda la especificación funcional, científica y técnica del proyecto de Papastronomy para el desafío "Planet X and SPHEREx" de la NASA. Úsalo como fuente de verdad absoluta para generar código de Backend (Python/FastAPI/Astropy), modelos de detección de anomalías (Computer Vision/SciPy/Photutils) y Frontend (React/HTML/Tailwind/Plotly/Aladin Lite).

---

## 1. RESUMEN DEL PROBLEMA Y OBJETIVO DEL SOFTWARE

El telescopio espacial **SPHEREx** de la NASA mapea todo el cielo cada 6 meses en **102 bandas espectrales infrarrojas** (de 0.75 a 5.00 micrones) usando 6 detectores con Filtros Lineales Variables (LVF).
- **Problema:** Los objetos cercanos o dinámicos (asteroides, cometas, enanas marrones cercanas como WISE 0855, estrellas con alto movimiento propio o un hipotético Planeta X) cambian de posición entre imágenes tomadas en distintas fechas (épocas). Además, las estrellas variables cambian de brillo entre exposiciones.
- **Solución a construir:** Una aplicación web pública e interactiva donde el usuario ingresa coordenadas celestes (`RA`, `Dec`) y un tamaño de campo de visión (`FoV`), visualiza las imágenes de SPHEREx a través del tiempo como un video en bucle (*Flipbook / Blink Comparator*), suma o resta imágenes alineadas de distintas épocas para detectar qué se movió o varió de brillo mediante IA, superpone catálogos astronómicos (Gaia y WISE) y extrae al vuelo (*on-the-fly*) el espectro infrarrojo de 102 bandas al hacer clic sobre cualquier fuente.

---

## 2. CHECKLIST DE REQUISITOS (CORE + EXTRA KUDOS + IA)

Todo código generado debe apuntar a cumplir estos 11 puntos:

1. **[CORE] Búsqueda por Coordenadas:** Input de Ascensión Recta (`ra` en grados decimales o HMS), Declinación (`dec` en grados decimales o DMS) y Campo de Visión (`fov` en grados, por defecto `0.05`).
2. **[CORE] Visor Temporal (Flipbook / Blink Comparator):** Reproductor interactivo (Play/Pause, control de FPS, slider de fechas) que muestre en secuencia cronológica los recortes de SPHEREx de esa coordenada.
3. **[CORE] Botones de Carga Rápida para los 5 Objetos Obligatorios:** Acceso en 1 clic a `WISE 0855`, `Barnard's Star`, `Epsilon Indi B`, `RW Aurigae` y `R Draconis`.
4. **[EXTRA KUDO] Alineación y Resta de Épocas (Image Differencing):** Reproyectar imágenes de distintas fechas a una misma grilla WCS y restarlas (`diff = epoch_last - epoch_first`) para cancelar estrellas fijas y aislar objetos en movimiento o variables.
5. **[EXTRA KUDO] Suma Profunda de Épocas y 6 Detectores (Coaddition):** Promediar/sumar múltiples exposiciones alineadas para mejorar la relación señal-ruido (`SNR`) y ver objetos débiles.
6. **[EXTRA KUDO] Espectro de 102 Bandas On-The-Fly:** Al hacer clic en un píxel `(x, y)` o coordenada `(ra, dec)`, consultar la extensión `WCS-WAVE` de todas las exposiciones que cubren ese punto y graficar Flujo (`MJy/sr`) vs. Longitud de onda (`micrones`).
7. **[EXTRA KUDO] Superposición con Catálogos Gaia y WISE:** Integrar **Aladin Lite v3** sincronizado a `(ra, dec)` con capas activables de `Gaia DR3` y `AllWISE`.
8. **[EXTRA KUDO] Visualización de Contamination Flags:** Opción en la UI para superponer la máscara de bits de la extensión `FLAGS` (rayos cósmicos, píxeles saturados, artefactos).
9. **[EXTRA KUDO] Parámetros en URL Embebible:** Leer y escribir `?ra=133.7951&dec=-7.2451&fov=0.05` en la URL del navegador para compartir hallazgos o incrustar por `iframe`.
10. **[DIFERENCIAL IA - TUIA] Detector Automático de Dipolos y Variables:** Algoritmo sobre la matriz restada `diff` que detecta anomalías mayores a `4 * sigma` y las clasifica en:
    - `MOVING_DIPOLE`: Pico negativo (posición en fecha 1) cercano a un pico positivo (posición en fecha 2) -> Candidato a Planeta X / Enana Marrón / Asteroide.
    - `VARIABLE_MONOPOLE`: Pico positivo o negativo aislado sin desplazamiento espacial -> Estrella Variable.
11. **[DIFERENCIAL IA - TUIA] Asistente de Bandas Moleculares:** En el gráfico espectral, marcar bandas de absorción clave (`H2O` en 1.4, 1.9, 3.0 um; `CH4` en 1.6, 3.3 um; `CO` en 4.6 um) e inferir el tipo de objeto.

---

## 3. DICCIONARIO DE LOS 5 OBJETOS DE PRUEBA OBLIGATORIOS

Usar esta constante directamente en Python y JavaScript:

```json
{
  "MANDATORY_TARGETS": [
    {
      "id": "wise_0855",
      "name": "WISE 0855",
      "category": "MOVING_OBJECT",
      "description": "Enana marron subestelar mas fria y rapida conocida cerca del Sistema Solar",
      "ra_hms": "08h55m10.831s",
      "dec_dms": "-07d14m42.53s",
      "ra_deg": 133.795129,
      "dec_deg": -7.245147,
      "default_fov": 0.05
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
      "default_fov": 0.05
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
      "default_fov": 0.05
    },
    {
      "id": "rw_aurigae",
      "name": "RW Aurigae",
      "category": "VARIABLE_STAR",
      "description": "Estrella joven T Tauri con fuertes variaciones de luminosidad entre epocas",
      "ra_hms": "05h07m49.56s",
      "dec_dms": "+30d24m05.1s",
      "ra_deg": 76.956500,
      "dec_deg": 30.401417,
      "default_fov": 0.05
    },
    {
      "id": "r_draconis",
      "name": "R Draconis",
      "category": "VARIABLE_STAR",
      "description": "Gigante roja variable tipo Mira con cambios drasticos en el infrarrojo",
      "ra_hms": "16h32m40.23s",
      "dec_dms": "+66d45m17.9s",
      "ra_deg": 248.167625,
      "dec_deg": 66.754972,
      "default_fov": 0.05
    }
  ]
}
```

---

## 4. ARQUITECTURA DE DATOS DE SPHEREx EN NASA/IPAC IRSA

### 4.1. Endpoints y URLs Oficiales de Datos Abiertos
- **TAP Server (Consultas ADQL/SQL con `pyvo`):** `https://irsa.ipac.caltech.edu/TAP`
- **Tablas TAP de SPHEREx:** `spherex.artifact` (archivos) y `spherex.plane` (metadatos espaciales y temporales).
- **Patron de URL para Recortes (Cutouts rapidos sin bajar la imagen entera de 2040x2040):**
  `https://irsa.ipac.caltech.edu/{artifact_uri}?center={ra_deg},{dec_deg}d&size={fov_deg}`
- **Directorio HTTP directo:** `https://irsa.ipac.caltech.edu/ibe/data/spherex/`
- **Bucket AWS S3 Publico (sin credenciales):** `s3://nasa-irsa-spherex/` (Indice web: `https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com/index.html`)
- **Documentacion oficial:**
  - Acceso a datos: `https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/`
  - Cutout Tool: `https://irsa.ipac.caltech.edu/data/SPHEREx/docs/cutout_tool.html`
  - Tutorial 1 (Intro): `https://caltech-ipac.github.io/irsa-tutorials/spherex-intro/`
  - Tutorial 2 (Cutouts en el tiempo): `https://caltech-ipac.github.io/irsa-tutorials/spherex-cutouts/`
  - Tutorial 3 (Source Discovery, Resta y Espectro): `https://caltech-ipac.github.io/irsa-tutorials/spherex-source-discovery-tool-demo/`

### 4.2. Estructura Interna de cada Archivo `.FITS` de SPHEREx
Cuando se abre un archivo o cutout de SPHEREx con `astropy.io.fits.open(url)`, el objeto `HDUList` contiene estas extensiones clave:
1. `hdulist['IMAGE']`: Matriz 2D `float32` con el brillo superficial calibrado en unidades de `MJy/sr`. Contiene en su `header` la proyeccion celeste `WCS` estandar y la clave `W` para la proyeccion espectral.
2. `hdulist['FLAGS']`: Matriz 2D `int/uint` con mascara de bits de contaminacion (pixeles muertos, saturacion, rayos cosmicos). Los pixeles donde `(flags & bitmask) != 0` deben enmascararse como `NaN` antes de restar imagenes o medir fotometria.
3. `hdulist['VARIANCE']`: Matriz 2D con la varianza del ruido por pixel.
4. `hdulist['ZODI']`: Modelo de fondo de luz zodiacal.
5. `hdulist['PSF']`: Funcion de dispersion de punto (Point Spread Function).
6. `hdulist['WCS-WAVE']`: Tabla de busqueda (lookup table) que usa `WCS(header=hdulist['IMAGE'].header, fobj=hdulist, key='W')` para transformar cualquier coordenada de pixel `(x, y)` en `(wavelength_um, bandwidth_um)`.

---

## 5. PATRONES DE CODIGO PYTHON (BACKEND CIENTIFICO E IA)

Dependencias de Python requeridas:
`pip install fastapi uvicorn numpy scipy matplotlib pillow astropy astroquery pyvo reproject sep photutils scikit-image`

### 5.1. Consulta TAP de Recortes Ordenados por Fecha
```python
import pyvo

def query_spherex_cutouts(ra_deg: float, dec_deg: float, fov_deg: float = 0.05):
    service = pyvo.dal.TAPService("https://irsa.ipac.caltech.edu/TAP")
    query = f"""
    SELECT
        'https://irsa.ipac.caltech.edu/' || a.uri || '?center={ra_deg},{dec_deg}d&size={fov_deg}' AS cutout_url,
        p.time_bounds_lower AS obs_time,
        p.energy_bandpassname AS detector_band
    FROM spherex.artifact a
    JOIN spherex.plane p ON a.planeid = p.planeid
    WHERE 1 = CONTAINS(POINT('ICRS', {ra_deg}, {dec_deg}), p.poly)
    ORDER BY p.time_bounds_lower ASC
    """
    results = service.search(query)
    return results.to_table().to_pandas().to_dict(orient="records")
```

### 5.2. Limpieza de FLAGS, Sustraccion de Fondo y Reproyeccion WCS
```python
import numpy as np
import sep
from astropy.io import fits
from astropy.wcs import WCS
from reproject import reproject_interp

def load_and_clean_fits(url_or_path: str):
    hdul = fits.open(url_or_path)
    img = hdul["IMAGE"].data.astype(np.float64)
    flags = hdul["FLAGS"].data
    header = hdul["IMAGE"].header
    wcs_sky = WCS(header)

    # Enmascarar pixeles contaminados (ejemplo: cualquier flag severo != 0)
    bad_mask = flags > 0
    median_val = np.nanmedian(img[~bad_mask]) if np.any(~bad_mask) else 0.0
    img_clean = np.where(bad_mask, median_val, img)

    # Restar fondo local con SEP
    img_c = np.ascontiguousarray(img_clean)
    bkg = sep.Background(img_c)
    img_sub = img_c - bkg.back()

    return img_sub, flags, wcs_sky, header, hdul

def align_coadd_and_diff(hdul_list_data, target_wcs, shape_out):
    aligned_epochs = []
    for img_sub, wcs_sky in hdul_list_data:
        reproj_img, _ = reproject_interp((img_sub, wcs_sky), target_wcs, shape_out=shape_out)
        aligned_epochs.append(reproj_img)

    stack = np.array(aligned_epochs)
    coadd_img = np.nanmean(stack, axis=0)
    # Resta entre el promedio de las ultimas exposiciones y las primeras
    n = len(aligned_epochs)
    half = max(1, n // 2)
    early_mean = np.nanmean(stack[:half], axis=0)
    late_mean = np.nanmean(stack[-half:], axis=0)
    diff_img = late_mean - early_mean

    return aligned_epochs, coadd_img, diff_img
```

### 5.3. Detector IA de Dipolos (Movimiento) y Monopolos (Estrellas Variables)
```python
from photutils.detection import find_peaks
from scipy.spatial.distance import cdist

def detect_anomalies_on_diff(diff_img: np.ndarray, target_wcs: WCS, threshold_sigma: float = 4.0):
    clean_diff = np.nan_to_num(diff_img, nan=0.0)
    sigma = np.std(clean_diff)
    if sigma == 0:
        return []

    pos_peaks = find_peaks(clean_diff, threshold=threshold_sigma * sigma, box_size=5)
    neg_peaks = find_peaks(-clean_diff, threshold=threshold_sigma * sigma, box_size=5)

    pos_coords = np.array([[r["x_peak"], r["y_peak"], r["peak_value"]] for r in pos_peaks]) if pos_peaks else np.empty((0, 3))
    neg_coords = np.array([[r["x_peak"], r["y_peak"], r["peak_value"]] for r in neg_peaks]) if neg_peaks else np.empty((0, 3))

    detections = []
    used_neg = set()

    for i, (px, py, pval) in enumerate(pos_coords):
        matched_dipole = False
        if len(neg_coords) > 0:
            dists = cdist([[px, py]], neg_coords[:, :2])[0]
            min_idx = int(np.argmin(dists))
            # Si hay un pico negativo entre 1.5 y 15 pixeles, es un objeto que se movio (Dipolo)
            if 1.5 <= dists[min_idx] <= 15.0 and min_idx not in used_neg:
                used_neg.add(min_idx)
                matched_dipole = True
                sky = target_wcs.pixel_to_world(px, py)
                detections.append({
                    "type": "MOVING_DIPOLE",
                    "x_pix": float(px),
                    "y_pix": float(py),
                    "ra": float(sky.ra.deg),
                    "dec": float(sky.dec.deg),
                    "snr_score": round(float(pval / sigma), 2),
                    "shift_pixels": round(float(dists[min_idx]), 2),
                    "description": "Dipolo positivo-negativo: Objeto en movimiento (Enana Marron / Asteroide / Planeta X)"
                })
        if not matched_dipole:
            sky = target_wcs.pixel_to_world(px, py)
            detections.append({
                "type": "VARIABLE_MONOPOLE",
                "x_pix": float(px),
                "y_pix": float(py),
                "ra": float(sky.ra.deg),
                "dec": float(sky.dec.deg),
                "snr_score": round(float(pval / sigma), 2),
                "shift_pixels": 0.0,
                "description": "Variacion de flujo sin desplazamiento: Candidato a Estrella Variable"
            })

    return sorted(detections, key=lambda d: d["snr_score"], reverse=True)[:10]
```

### 5.4. Extraccion de Espectro de 102 Bandas On-The-Fly
```python
from astropy.coordinates import SkyCoord

def extract_spectrum_at_coord(ra_deg: float, dec_deg: float, open_hdulists: list):
    target_coord = SkyCoord(ra=ra_deg, dec=dec_deg, unit="deg", frame="icrs")
    spectrum_points = []

    for hdul, obs_time in open_hdulists:
        header = hdul["IMAGE"].header
        img = hdul["IMAGE"].data
        wcs_sky = WCS(header)
        x, y = wcs_sky.world_to_pixel(target_coord)
        ix, iy = int(round(float(x))), int(round(float(y)))

        if 2 <= ix < img.shape[1] - 2 and 2 <= iy < img.shape[0] - 2:
            # Fotometria de apertura rapida en caja de 3x3 alrededor del punto
            flux_val = float(np.nanmean(img[iy-1:iy+2, ix-1:ix+2]))
            wcs_wave = WCS(header=header, fobj=hdul, key="W")
            wavelength_um, bandwidth_um = wcs_wave.pixel_to_world_values(x, y)
            spectrum_points.append({
                "wavelength_um": round(float(wavelength_um), 4),
                "bandwidth_um": round(float(bandwidth_um), 4),
                "flux_mjy_sr": round(flux_val, 4),
                "obs_time": str(obs_time)
            })

    return sorted(spectrum_points, key=lambda s: s["wavelength_um"])
```

### 5.5. Conversion de Matriz FITS a PNG Base64 con Estiramiento Astronomico
```python
import io
import base64
from PIL import Image
from astropy.visualization import ZScaleInterval, AsinhStretch, ImageNormalize

def matrix_to_base64_png(matrix: np.ndarray, cmap_mode: str = "grayscale") -> str:
    arr = np.nan_to_num(matrix, nan=0.0)
    norm = ImageNormalize(arr, interval=ZScaleInterval(), stretch=AsinhStretch())
    scaled = np.clip(norm(arr), 0.0, 1.0)
    uint8_img = (scaled * 255).astype(np.uint8)
    # Invertir eje Y para convencion astronomica (Norte arriba)
    uint8_img = np.flipud(uint8_img)
    pil_img = Image.fromarray(uint8_img)
    buf = io.BytesIO()
    pil_img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64}"
```

---

## 6. CONTRATO API REST (FASTAPI BACKEND <-> FRONTEND)

### Endpoint 1: `GET /api/explore?ra={float}&dec={float}&fov={float}`
Devuelve las épocas alineadas en base64, la suma profunda (`coadd`), la resta (`diff`) y las detecciones de la IA.
```json
{
  "target_info": {
    "ra": 133.7951,
    "dec": -7.2451,
    "fov": 0.05,
    "total_frames": 10
  },
  "epochs": [
    {
      "index": 0,
      "obs_time": "2025-11-10T04:12:00",
      "detector": "det1",
      "image_base64": "data:image/png;base64,...",
      "flags_base64": "data:image/png;base64,...",
      "clean_pixels_pct": 98.7
    }
  ],
  "coadd_image_base64": "data:image/png;base64,...",
  "diff_image_base64": "data:image/png;base64,...",
  "ai_detections": [
    {
      "type": "MOVING_DIPOLE",
      "x_pix": 64.0,
      "y_pix": 64.0,
      "ra": 133.7952,
      "dec": -7.2450,
      "snr_score": 14.5,
      "shift_pixels": 4.2,
      "description": "Dipolo positivo-negativo: Objeto en movimiento"
    }
  ]
}
```

### Endpoint 2: `GET /api/spectrum?ra={float}&dec={float}`
Devuelve la curva espectral infrarroja y las bandas moleculares de referencia.
```json
{
  "ra": 133.7952,
  "dec": -7.2450,
  "spectrum": [
    {"wavelength_um": 0.85, "bandwidth_um": 0.02, "flux_mjy_sr": 0.42, "obs_time": "2025-11-10"},
    {"wavelength_um": 1.58, "bandwidth_um": 0.03, "flux_mjy_sr": 3.91, "obs_time": "2025-11-12"}
  ],
  "reference_molecules": [
    {"name": "H2O", "ranges_um": [[1.35, 1.45], [1.80, 1.95], [2.65, 3.05]]},
    {"name": "CH4", "ranges_um": [[1.60, 1.70], [3.20, 3.45]]},
    {"name": "CO", "ranges_um": [[4.50, 4.80]]}
  ]
}
```

---

## 7. ESPECIFICACION DEL FRONTEND E INTEGRACION DE ALADIN LITE V3

### 7.1. Snippet Oficial para Incrustar Aladin Lite v3 con Gaia DR3 y AllWISE
Incluir en el `<head>` o cargar dinámicamente:
`<script type="text/javascript" src="https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.js" charset="utf-8"></script>`

Inicialización en JavaScript sincronizada con `(ra, dec, fov)`:
```javascript
let aladinInstance = null;

A.init.then(() => {
  aladinInstance = A.aladin('#aladin-lite-div', {
    survey: 'P/allWISE/color',
    fov: 0.05,
    target: '133.7951 -7.2451',
    showReticle: true,
    showZoomControl: true
  });

  // Superponer catalogo Gaia DR3
  const gaiaCat = A.catalogHiPS('https://hips.cds.unistra.fr/HiPSCatService/I/355/gaiadr3', {
    onClick: 'showTable',
    name: 'Gaia DR3',
    color: '#38bdf8',
    sourceSize: 8
  });
  aladinInstance.addCatalog(gaiaCat);

  // Superponer catalogo AllWISE
  const wiseCat = A.catalogHiPS('https://hips.cds.unistra.fr/HiPSCatService/II/328/allwise', {
    onClick: 'showTable',
    name: 'AllWISE',
    color: '#f59e0b',
    sourceSize: 8
  });
  aladinInstance.addCatalog(wiseCat);
});

function updateAladinTarget(ra, dec, fov) {
  if (aladinInstance) {
    aladinInstance.gotoRaDec(ra, dec);
    aladinInstance.setFoV(fov);
  }
}
```

### 7.2. Sincronizacion de URL (Requisito Embebible)
```javascript
function syncUrlParams(ra, dec, fov) {
  const url = new URL(window.location);
  url.searchParams.set('ra', ra);
  url.searchParams.set('dec', dec);
  url.searchParams.set('fov', fov);
  window.history.replaceState({}, '', url);
}

function getInitialParamsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    ra: parseFloat(params.get('ra')) || 133.795129,
    dec: parseFloat(params.get('dec')) || -7.245147,
    fov: parseFloat(params.get('fov')) || 0.05
  };
}
```