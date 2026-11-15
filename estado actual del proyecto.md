# Estado Actual del Proyecto — Papastronomy (SPHEREx & Planet X Explorer)

Relevamiento completo contrastando el código actual del proyecto contra los **Objectives** y **Potential Considerations** oficiales del desafío **NASA Space Apps — Planet X and SPHEREx**.

---

## ✅ 1. Lo que está COMPLETADO y sólido

- [x] **Herramienta web pública con búsqueda por coordenadas (`RA`, `Dec`)**:
  - Soporta tanto grados decimales (`133.795129`, `-7.245147`) como formato sexagesimal oficial (`08h55m10.831s`, `-07d14m42.53s`) en `static/app.js`.
- [x] **Serie de imágenes como video (Flipbook / Blink Comparator)**:
  - Reproductor en bucle con Play/Pausa, selector de velocidad (`1`, `2`, `4`, `6 fps`), barra de progreso por época y **exportación directa a video `.webm`**.
- [x] **Los 5 objetivos obligatorios probados con datos `.FITS` reales de SPHEREx**:
  - `WISE 0855`, `Barnard's Star`, `Epsilon Indi B`, `RW Aurigae` y `R Draconis` precargados en `data/cache/` y accesibles con 1 clic en la barra superior (`src/config.py`).
- [x] **Fácil actualización con nuevos datos de SPHEREx (*"New SPHEREx data is arriving fast!"*)**:
  - **Actualizado a SPHEREx Data Release 1 (`spherex_dr1`) + Quick Release 3 (`spherex_qr3`)**: `_query_spherex_sia` en `src/irsa_client.py` y `src/config.py` consultan en simultáneo `COLLECTION=spherex_dr1&COLLECTION=spherex_qr3` (combinando las épocas históricas reprocesadas en DR1 de noviembre 2026 con las épocas nuevas de QR3 de septiembre–noviembre 2026, tal como indican los notebooks oficiales de IRSA).
  - Botón **"Sincronizar nuevas entregas IRSA"** (`refresh=true`) que consulta IRSA SIA/TAP en vivo, descarga en paralelo solo las exposiciones nuevas y actualiza `manifest.json` sin pisar la caché existente (`src/irsa_client.py`).
  - Botón **"Buscar pares temporales"** (`src/temporal_search.py`) que prioriza épocas distantes en el mismo detector.
- [x] **Generación de espectros al vuelo (*"Extra kudos if your tool can generate spectra on the fly"*)**:
  - Clic en cualquier punto del visor invoca `/api/spectrum` (`src/main.py`), que ejecuta fotometría de apertura real con sustracción de fondo en anillo, propaga la extensión `VARIANCE` para las barras de error y resuelve $(\lambda, \Delta\lambda)$ píxel a píxel con el WCS espectral `key='W'` (`WCS-WAVE`) en `extract_real_spectrum_at_coord` (`src/pipeline.py`).
- [x] **Elección de Campo de Visión (*"Let users choose the field of view!"*)**:
  - Selector de presets (`1.8'`, `3.0'`, `6.0'`, `12.0'` arcmin) + entrada libre (`0.01°` a `1.0°`) + modo de **Mapa Global Continuo** que descarga recortes vecinos al arrastrar.
- [x] **Superposición de catálogos Gaia y WISE (*"overlay astronomical data from Gaia or WISE"*)**:
  - Capas interactivas de **Gaia DR3** (incluyendo vectores de movimiento propio `pmRA`/`pmDE`), **AllWISE**, e identificación automática de nombres y exoplanetas vía **SIMBAD**, **NASA Exoplanet Archive** y efemérides del Sistema Solar con `Astropy` (`query_named_objects_field` en `src/irsa_client.py`).
- [x] **Consulta por URL y modo embebible (*"including coordinates in the URL... embed it in other websites"*)**:
  - Sincroniza `?ra=...&dec=...&fov=...&temporal=1&embed=1` en la URL, con botones para copiar el link directo o el código `<iframe>`.
- [x] **Metadatos y máscaras de contaminación (*"display metadata, like contamination flags"*)**:
  - Lee el HDU `FLAGS` de SPHEREx, reporta `% de píxeles limpios`, fecha MJD/ISO, detector y $\lambda_c$, y permite superponer la máscara magenta de rayos cósmicos/saturación (`chk-flags`).

---

## 🛠️ 2. Lo que estaba "ASÍ NOMÁS" (Corregido y Verificado)

- [x] **1. Panel de diagnóstico espectral con ajuste físico de Planck y bandas moleculares (`src/ai_detector.py`)**:
   - **Antes**: `classify_spectrum_molecules` devolvía siempre `confidence: None`, `effective_temp_k_est: None` y `detected_molecules: []`.
   - **Ahora**: Cuando hay mediciones significativas ($\text{SNR} > 3$) en el infrarrojo cercano y medio, ajusta por cuadrados mínimos ponderados una curva de cuerpo negro de Planck $B_\nu(\lambda, T)$ entre $220\text{ K}$ y $9500\text{ K}$ para estimar `effective_temp_k_est`, calcula `confidence` en función del SNR, cantidad de canales y calidad del ajuste ($R^2$), y evalúa caídas de flujo o cobertura en las ventanas de $\text{H}_2\text{O}$ ($2.6\text{–}3.3\,\mu\text{m}$), $\text{CH}_4$ ($3.2\text{–}3.6\,\mu\text{m}$) y $\text{CO}$ ($4.5\text{–}4.9\,\mu\text{m}$). Para señales débiles o centros saturados conserva `None` / `[]` sin inventar datos.
- [x] **2. Suma / Apilado SNR separado por cada uno de los 6 detectores (`D1` a `D6`) (`src/main.py`, `src/schemas.py`, `static/app.js`)**:
   - **Antes**: Solo se calculaba un único `coadd` sobre el par de resta.
   - **Ahora**: `/api/explore` agrupa todas las exposiciones alineadas por detector (`D1` a `D6`), calcula la mediana por píxel de cada arreglo (`detector_coadds`) y las expone en el selector `#select-band` (`Suma SNR Detector D1`, `D2`, etc.) mostrando rango espectral $\lambda_{\min}\text{–}\lambda_{\max}$, cantidad de recortes combinados y porcentaje de píxeles limpios.
- [x] **3. Modo "Par temporal comparable (Blink A/B)" en el Flipbook (`static/app.js`)**:
   - **Antes**: En `Secuencia automática` el Flipbook ciclaba por todas las longitudes de onda, mezclando variación temporal real con el cambio de filtro lineal (LVF).
   - **Ahora**: El selector `#select-band` incorpora la opción **`Par temporal comparable (Blink A/B)`** (que también se activa automáticamente al pulsar *"Comparar en Flipbook"* en cualquier anomalía IA), ciclando exclusivamente por `analysis_frame_indices` (mismo detector y longitud de onda comparable).
- [x] **4. Relevamientos astronómicos reales de fondo en el visor de contexto (`static/index.html`, `static/app.js`)**:
   - **Antes**: El visor central solo tenía el fondo local de SPHEREx debajo de los puntos de catálogo.
   - **Ahora**: Incluye el selector `#select-context-survey` para conmutar en vivo la imagen de fondo en proyección gnomónica `TAN` entre **SPHEREx IR (Local)**, **AllWISE Color (CDS HiPS)**, **2MASS JHK (CDS HiPS)** y **DSS2 Óptico (CDS HiPS)** mediante el servicio oficial `hips2fits` del CDS (Estrasburgo), manteniendo superpuestos los catálogos Gaia DR3, vectores de movimiento propio y AllWISE.
- [x] **5. Bugs técnicos resueltos (`src/main.py`, `tests/test_catalogs.py`, `tests/test_regressions.py`)**:
   - **Cache-busting**: `serve_frontend` en `src/main.py` ahora reemplaza dinámicamente `/static/app.js?v=...` mediante expresión regular sin importar el número de versión en `static/index.html`.
   - **Suite de tests**: Actualizado `test_irsa_generic_column_names_are_parsed_in_select_order` en `tests/test_catalogs.py` y agregados tests de regresión para `detector_coadds`, ajuste de Planck/moléculas y cache-busting (76 tests ejecutados en total, **100% OK**).

---

## ✅ 3. Lo que FALTABA implementar (Completado)

- [x] **Selección manual de épocas arbitrarias ($t_A$ vs $t_B$) para suma, resta y blink libre (`static/index.html`, `static/app.js`)**:
   - Selectores `#select-epoch-a` y `#select-epoch-b` con tres operaciones directas sobre cualquier par de recortes cargados:
     - **Restar ($B - A$)** (`#btn-manual-diff`): resta píxel a píxel con mapa divergente azul/negro/rojo.
     - **Sumar ($A + B$)** (`#btn-manual-sum`): promedia ambas épocas para reforzar la relación señal-ruido.
     - **Blink $A \leftrightarrow B$** (`#btn-manual-blink`): alterna el reproductor exclusivamente entre las dos épocas elegidas.

---

## 🚀 4. Nuevas funcionalidades diferenciales implementadas

- [x] **1. Modo "Falso Color Infrarrojo RGB" (SPHEREx 3-Band Color Composite) (`#mode-rgb` en `static/index.html`, `buildThreeBandRgbCanvas` en `static/app.js`)**:
   - Combina 3 rangos espectrales de SPHEREx en una sola imagen tricromática: **Azul** = NIR corto ($<1.65\,\mu\text{m}$), **Verde** = NIR medio ($1.65\text{–}3.0\,\mu\text{m}$), **Rojo** = MIR ($\ge 3.0\,\mu\text{m}$). Los objetos ultrafríos (**WISE 0855**, **Epsilon Indi B**) o con discos de polvo (**RW Aurigae**) resaltan en tonos rojizos/ámbar frente a las estrellas calientes azuladas.
- [x] **2. Curva de Luz Temporal $F(t)$ junto al Espectro $F(\lambda)$ (`#btn-plot-spectrum` / `#btn-plot-lightcurve`, `renderSpectrumOrLightCurve` en `static/app.js`)**:
   - Conmutador interactivo en el panel inferior que permite alternar el gráfico Plotly entre **Espectro $F(\lambda)$** (flujo vs longitud de onda con bandas moleculares) y **Curva de Luz Temporal $F(t)$** (flujo vs fecha UTC agrupado por detector `D1`–`D6` con barras de error).
   - **Actualización 2026-11-14:** la *Curva de Luz $F(t)$* unía en una misma línea exposiciones de longitudes de onda distintas (el filtro LVF cambia de color con la posición), por lo que un cambio de color podía leerse como un cambio en el tiempo. Fue **reemplazada por la pestaña «Línea histórica»** (ver sección 5).
- [x] **3. Objetos que cambian: movimiento y brillo en todas las fechas (`src/motion.py`, `/api/changes`, panel derecho de `static/index.html`)** — *rediseño 2026-11-14*:
   - Reemplaza a la resta de dos momentos como método principal: cada estrella se sigue en todas las fechas SPHEREx, con astrometría relativa (estrellas fijas como referencia), recta posición–tiempo (μ en `″/año` ± σ, dirección, χ² reducido) y brillo comparado solo en la misma banda.
   - Tarjetas en lenguaje claro: nombre, frase («Se mueve unos 9,1″ por año hacia el norte»), miniaturas antes/después en la misma escala, línea de catálogo (Gaia DR3 propagado a la época SPHEREx / catálogo oficial, siempre separado de lo medido), pastilla de confianza (alta / media / baja) y «Detalles» con los datos técnicos.
   - La hipótesis exploratoria de distancia (UA) solo se muestra para objetos que se mueven sin correspondencia en Gaia, dentro de «Detalles» y con la aclaración de que no es una detección ni confirmación de un Planeta X.
   - La línea histórica usa la misma medición del objeto (`field_object_id`): los dos paneles no se contradicen.
   - Validación con datos reales de IRSA: Barnard's Star 9,1 ± 1,5″/año (Gaia DR3 10,4), Epsilon Indi B 4,3 ± 0,5″/año (Gaia DR3 4,7), R Draconis «cambió de brillo» (Mira) y cinco campos de control sin falsas alarmas. WISE 0855 es demasiado débil para SPHEREx en una exposición: el panel lo informa en lugar de inventar un movimiento.
   - El visor muestra solo fechas SPHEREx (fecha grande, flecha de movimiento y número de tarjeta, leyenda). Las décadas (DSS2 / 2MASS / AllWISE) quedan únicamente en la línea histórica; la resta ΔI, Mediana, RGB, épocas A/B y Shift & Stack están agrupadas en «Herramientas avanzadas».
- [x] **4. Descarga científica en 1 clic (`Exportar CSV` + `Exportar PNG`) (`#btn-export-csv`, `#btn-export-png` en `static/index.html` y `static/app.js`)**:
   - **Exportar PNG**: descarga el lienzo astronómico actual (`Flipbook`, `Resta ΔI`, `Mediana`, `Falso Color RGB`, `Resta/Suma Manual A±B`, `Shift & Stack`) con sus anotaciones.
   - **Exportar CSV**: descarga la tabla fotométrica completa medida en el punto seleccionado (`ra_deg, dec_deg, wavelength_um, bandwidth_um, flux_mjy_sr, flux_uncertainty_mjy_sr, obs_time, detector`).
- [x] **5. Superación Tecnológica de WiseView (`http://byw.tools/wiseview`) (`static/index.html`, `static/app.js`, `src/irsa_client.py`)**:
   - **Óptica en Vivo en Cliente (`0 ms` / `60 FPS`)**: Controles instantáneos sobre los `Float32Array` en memoria sin reconsultar al backend: **Invertir Píxeles (Negativo Blanco/Negro)** (`#chk-invert`, sincronizado con `&invert=1` en la URL igual que el modo por defecto de WiseView), **Stretch Continuo Asinh ↔ Lineal** (`#slider-stretch`) y **Ganancia / Contraste** (`#slider-contrast`).
   - **Shift & Stack (Apilado por Movimiento Propio `pmRA`, `pmDec`) + Auto-Track** (en «Herramientas avanzadas»): Permite ingresar cualquier vector $(\mu_{\alpha^*}, \mu_\delta)$ en `mas/año` (`#input-shift-pmra`, `#input-shift-pmdec`, `#btn-shift-stack`) o pulsar **Auto-Track** (`#btn-autotrack-dipole`) para usar el movimiento medido del objeto seleccionado en «Objetos que cambian» (respaldo: marca ΔI o la estrella Gaia más rápida del campo), desplazando bilinealmente cada época y apilándolas en el sistema de reposo del objeto en movimiento para amplificar su SNR por $\sim\sqrt{N}$.
   - **Respaldo JSON Ultrarrápido para Gaia DR3 + Enlace Cruzado a WiseView**: Incorpora en `src/irsa_client.py` (`_wiseview_gaia_json_table`) el endpoint JSON de baja latencia de Gaia DR3 (`WISEVIEW_GAIA_TAP_JSON_URL`) como respaldo adicional sin overhead XML/VOTable, y agrega el botón **Comparar en WiseView ↗** (`#btn-open-wiseview`) que abre la coordenada, FoV y vector `pmRA/pmDec` actuales directamente en WiseView para contrastar las 2 bandas WISE (2010–2024) frente a las 102 bandas SPHEREx (2025–2026).

---

## 🕰️ 5. Línea Histórica del lugar seleccionado (*"quickly see how they change over time"*)

- [x] **Pestaña «Línea histórica» en el panel inferior (`static/index.html`, `static/app.js`, `src/timeline.py`, `GET /api/timeline`)**:
   - **Titular en lenguaje claro** con su estado: *Se movió*, *Se mudó de lugar*, *Cambió su brillo*, *Posible cambio*, *Sin cambios*, *Señal muy débil* o *Faltan fechas*. Los datos técnicos (MJy/sr, MJD, λ, detector, σ) quedan en subtítulos y tooltips.
   - **Tira de miniaturas con mira fija**: primero los hitos históricos **DSS2 (~1984–2000)**, **2MASS (1997–2001)** y **AllWISE (2010–2011)** vía CDS `hips2fits`, rotulados *"otro telescopio · solo posición"*; después una miniatura por visita de **SPHEREx**, norte arriba y con escala de brillo común por detector.
   - **Curva de brillo sincronizada** (pasar el mouse o hacer clic resalta la miniatura y viceversa; el clic lleva el visor principal a esa fecha), con selector de detector / color infrarrojo.
   - **Solo compara la misma banda**: serie estricta con $\Delta\lambda/\lambda \le 3\,\%$; si no alcanza, respaldo con longitudes de onda cercanas del mismo detector, rotulado *"Estimación aproximada"* y sin afirmar cambios.
   - **Astros de alto movimiento propio**: campo histórico adaptativo con la trayectoria prevista, posición esperada en cada relevamiento y botón **«Ir a su posición actual»**; en la posición actual la apertura acompaña al objeto.
   - **Indicador siempre visible**: aun en la pestaña *Espectro*, un botón resume la línea histórica del punto (*"Línea histórica · Sin cambios: …"*).
   - **Compartir y exportar**: parámetro `&timeline=1` en la URL y **Exportar CSV** con la serie de brillo y las posiciones por visita.
   - **DSS1 (~1950)** no se agregó: el CDS no publica un HiPS de DSS1/POSS-I (solo `CDS/P/DSS2/*`).
- [x] **Más cobertura temporal por defecto**: el visor carga **20 exposiciones** (antes 10) y el presupuesto de descargas nuevas de IRSA baja a **20 s** (antes 30 s). La línea histórica usa además **todos** los recortes ya guardados en la caché de la región (hasta 84, elegidos por separación temporal dentro de cada detector).
- [x] **Resultados reales verificados (2026-11-14)**:
   - `Barnard's Star` en su posición actual (RA 269.44612°, Dec +4.77001°, descargada en vivo de IRSA): 10 fechas entre ago-2025 y sep-2026 · **corrimiento medido por SPHEREx 10,0″ (4,0σ) ≈ 9,1″/año**, frente a 10,4″/año de catálogo · brillo estable.
   - `Barnard's Star`, `WISE 0855` y `Epsilon Indi B` en sus coordenadas oficiales: *"ya no está en este punto: se mudó"* (4,6′, 1,6′ y 2,0′ respectivamente) con botón a la posición actual.
   - `RW Aurigae` y `R Draconis`: *"No se ven cambios medibles"*; se aclara que las fechas disponibles abarcan solo 7 días y, en R Draconis, que el centro está saturado y se mide el resplandor.

### ⚠️ Limitaciones conocidas de la línea histórica

- **Coordenadas oficiales de los 3 astros veloces**: corresponden a épocas 2000–2014, por lo que hoy el astro cae fuera (o al borde) del recorte de 3′ centrado en ellas. No se modificaron las coordenadas ni la caché de los 5 objetivos; la línea histórica lo explica y lleva a la posición actual.
- **WISE 0855** es demasiado débil para las exposiciones individuales de SPHEREx: en su posición actual informa *"señal muy débil"* (no se inventa una detección).
- **RW Aurigae / R Draconis**: la caché cubre ~7 días; para ver su variabilidad real (R Draconis tiene un período de ~245 días) hay que sumar fechas con «Buscar pares temporales» / «Sincronizar nuevas entregas IRSA».
- **Precisión fotométrica**: ~8 % por exposición (medida sobre estrellas del campo de RW Aurigae); cambios menores a ~8–10 % no se informan.
- **Fechas de los relevamientos históricos**: son rangos aproximados (los mosaicos combinan placas de varias fechas).

---

## 🧪 6. Estado de Verificación Integral (2026-11-14)

- **Suite de pruebas automatizadas (`python -m unittest discover -s tests -t tests`)**: **122 tests ejecutados, 0 fallos, 0 errores (OK)**.
  - Incluye pruebas de fotometría diferencial (`test_difference.py`), verificación de dipolos/monopolos (`test_dipoles.py`), selección temporal (`test_temporal_search.py`), catálogos en vivo y cachés (`test_catalogs.py`), lanzador multiplataforma (`test_launcher.py`), regresiones de API/física (`test_regressions.py`), línea histórica (`test_timeline.py`) y objetos que cambian (`test_motion.py`, 21 tests).
- **Sintaxis Frontend (`node --check static/app.js`)**: **OK (sin errores de sintaxis)**.
- **Lanzador multiplataforma (`python start_project.py --check`)**: **OK (`Python 3.12.0 | win32`)**.
- **Verificación de extremo a extremo sobre los 5 objetivos oficiales NASA (`/api/explore` + `/api/spectrum`)**:
  - `wise_0855`: Coadds por detector `['D1', 'D2', 'D3', 'D4', 'D5', 'D6']` · Sin cambios medibles en el campo (WISE 0855 es demasiado débil para SPHEREx en una exposición; el panel lo aclara) · Diagnóstico espectral con `Muestreo CH₄ (3.2–3.6 µm)`.
  - `barnards_star`: Coadds por detector `['D1', 'D2', 'D3', 'D4', 'D5', 'D6']` · En su posición actual: «Se mueve» 9,1 ± 1,5″/año, coincide con Gaia DR3 (10,4″/año) · Diagnóstico estelar NIR.
  - `epsilon_indi_b`: Coadds por detector `['D1', 'D2', 'D3', 'D4', 'D5']` · Fuente fría con flujo dominante en IR medio (`T_eq ≈ 1060 K`, `confianza = 0.70`).
  - `rw_aurigae`: Coadds por detector `['D1', 'D2', 'D4', 'D5']` · Exceso infrarrojo circumestelar T Tauri (`T_eq ≈ 1970 K`, `confianza = 0.95`).
  - `r_draconis`: Coadds por detector `['D3', 'D6']` · Variable tipo Mira con envoltura fría (`T_eq ≈ 1600 K` en la fuente detectada; `None` si se consulta el píxel central saturado/enmascarado).
