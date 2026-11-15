# Herramientas astronómicas públicas en Papastronomy

Evaluación e integración inicial: 15 de noviembre de 2026, en `feature/sebas`, sobre `c3f45f5`. Traslado posterior a `feature/user-friendly`, sobre `7c537c3`, por instrucción explícita del usuario.

## 1. Alcance y estado inicial

Se inspeccionaron el backend FastAPI, el procesamiento de FITS y WCS, la adquisición IRSA, los catálogos, el visor JavaScript y las pruebas existentes antes de modificar código. La propuesta priorizada se presentó antes de implementar.

El proyecto ya utilizaba Astropy, PyVO, Reproject y Photutils. La función JavaScript `initAladinLite()` controlaba un canvas propio: su nombre no significaba que la biblioteca de CDS estuviese integrada. Se conserva ese visor con sus bandas SPHEREx, comparación temporal, máscaras, espectros, detecciones y mosaico.

La implementación se inició en la rama existente solicitada en el prompt, `feature/sebas`. Los cambios locales de la landing se guardaron en el stash **`Landing de feature/user-friendly antes de tarea herramientas astronomicas`** antes de cambiar de rama. Después, el usuario pidió volver a `feature/user-friendly` y publicar los cambios pendientes: se recuperó la landing y se trasladó la integración, conservando login/perfil, asistente, visor 3D y el arranque con elección de acceso/invitado. Se mantienen los stashes como respaldo. No se crearon ramas ni se hizo merge a `main`; la publicación autorizada se limita a `feature/user-friendly`.

Se preservaron los 89 archivos FITS/manifiestos que Git retiraba al volver a la rama donde `data/` no se versiona, verificando su copia con SHA-256. La caché quedó local e ignorada; no forma parte de los commits publicados.

## 2. Matriz de evaluación

Las decisiones de conservar una integración existente evitan una segunda implementación de la misma función.

| Herramienta | Funcionalidad | Beneficio para Papastronomy | Dificultad | Decisión y justificación |
|---|---|---|---|---|
| [Astropy](https://www.astropy.org/) | FITS, WCS, unidades, tiempo y tablas | Corregir unidades espectrales y producir tablas interoperables | Baja a media | **Integrar ahora**: ampliar el uso existente, sin sustituir algoritmos de fotometría. |
| [Aladin Lite](https://cds-astro.github.io/aladin-lite/) | Navegación celeste, HiPS, catálogos y regiones | Comparar el campo SPHEREx con relevamientos externos | Media | **Integrar ahora** como panel complementario y opcional. |
| [Aladin Desktop](https://aladin.cds.unistra.fr/java/FAQ.html) | Análisis visual de imágenes y tablas en una aplicación Java | Inspección científica externa | Baja para archivos; alta para automatizarlo | **Evaluar posteriormente** una conexión directa. Ya se facilitan archivos VOTable; no se instala ni controla Java. |
| [Astroquery](https://docs.astropy.org/projects/astroquery/en/latest/) | Clientes de archivos y catálogos astronómicos | Útil si aparece un servicio no cubierto por las consultas actuales | Media | **Evaluar posteriormente**: está en requirements, pero agregar otra ruta de consulta hoy duplicaría PyVO y los respaldos existentes. |
| [Reproject](https://github.com/astropy/reproject) | Reproyección de imágenes con WCS | Alineación de imágenes para coadds y diferencias | Ya integrada | **Integrar ahora, conservando el uso existente** de `reproject_interp`. Sin cambiar su interpolación ni máscaras. |
| [Photutils](https://github.com/astropy/photutils) | Detección y fotometría | Evitar reconstruir herramientas de detección consolidadas | Ya integrada | **Integrar ahora, conservando el uso existente**. No sustituir calibración/PSF validada sin una comparación específica. |
| [Specutils](https://github.com/astropy/specutils) | Contenedores y análisis espectral | Potencial análisis avanzado de líneas y continuos | Media a alta | **Evaluar posteriormente**: primero validar respuesta espectral, incertidumbres y muestreo de las bandas; no asumir un espectro de alta resolución. |
| [PyVO](https://pyvo.readthedocs.io/en/stable/) | TAP y servicios del Virtual Observatory | Acceso IRSA y reutilización de consultas/caché | Ya integrada | **Integrar ahora, conservando el uso existente**. El exportador usa el proveedor actual. |
| [TOPCAT](https://www.star.bristol.ac.uk/mbt/topcat/sun253/sun253.html) | Inspección, selección y comparación de tablas | Examinar catálogos fuera de la aplicación | Baja | **Integrar ahora mediante interoperabilidad VOTable**, sin ejecutable embebido. |
| [STIL](https://www.star.bristol.ac.uk/mbt/stil/) | Biblioteca Java para tablas | Solapa la serialización disponible en Astropy | Alta en este backend Python | **No integrar** como dependencia. VOTable permite intercambiar datos sin Java. |
| [SAMP](https://www.ivoa.net/documents/SAMP/20120411/REC-SAMP-1.3-20120411.html) | Mensajería entre aplicaciones astronómicas | Envío directo a un escritorio con un hub local | Media a alta operativamente | **Evaluar posteriormente**: introduce un hub y permisos adicionales que el MVP no necesita. |

### Revisión de los módulos de Astropy

| Módulo y documentación oficial | Estado y decisión |
|---|---|
| [io.fits](https://docs.astropy.org/en/stable/io/fits/index.html) | Se usa para HDU, tablas WAVE-TAB y metadatos. Se mantienen las lecturas y validaciones existentes; las pruebas nuevas abren los FITS reales en modo de lectura. |
| [wcs](https://docs.astropy.org/en/stable/api/astropy.wcs.WCS.html) | Se conservan la proyección TAN y los píxeles nativos. Se corrige la interpretación de las unidades de la salida espectral numérica. |
| [coordinates](https://docs.astropy.org/en/stable/coordinates/skycoord.html) | Existe uso puntual de coordenadas astronómicas. Propagar catálogos o sustituir asociaciones requiere antes épocas e incertidumbres disponibles. No se agrega una identificación automática por proximidad. |
| [time](https://docs.astropy.org/en/stable/time/index.html) | Ya se usa para fechas/MJD. No se cambia la escala temporal ni se asigna una época observacional a un catálogo sin metadatos. |
| [units](https://docs.astropy.org/en/stable/units/quantity.html) | Se amplía su uso: valores WCS con `world_axis_units` se convierten explícitamente mediante `Quantity.to_value(u.um)`. |
| [visualization](https://docs.astropy.org/en/stable/visualization/normalization.html) | Puede aportar normalizaciones en un futuro. Se conserva la representación actual porque cambiar el contraste no corrige un problema científico identificado en este alcance. |
| [nddata](https://docs.astropy.org/en/stable/nddata/index.html) | Podría unificar datos, máscara y varianza. Migrar los contenedores actuales es una modificación transversal sin beneficio inmediato demostrado. Se difiere. |
| [stats](https://docs.astropy.org/en/stable/stats/robust.html) | Ya existe estimación robusta con `sigma_clipped_stats`. Se preserva y no se agrega otra estimación de fondo. |
| [table](https://docs.astropy.org/en/stable/table/index.html) | Se incorpora al exportador junto a `astropy.io.votable`, con unidades, UCD, nulos y metadatos de procedencia. |

## 3. Integraciones implementadas

### Aladin Lite como referencia complementaria

El panel **“Aladin Lite · referencia del cielo”** aparece debajo del resumen de catálogos del visor central. Se abre de forma explícita. La biblioteca y los relevamientos externos se cargan únicamente al abrirlo.

- Navegación celeste independiente con fondos DSS2, 2MASS y AllWISE.
- Contorno del campo de la herramienta y marca de la selección actual.
- Capas Gaia y AllWISE obtenidas de las respuestas que el explorador ya consulta. No se vuelve a consultar un catálogo desde Aladin para dibujar estas capas.
- Máximo de 500 posiciones válidas por capa, con indicación de límite y procedencia. No se presentan las listas como un censo completo.
- Sincronización con el campo al cargar la exploración y sus catálogos; el botón **“Sincronizar campo”** actualiza también una selección hecha después. Navegar en Aladin no cambia la consulta ni la medición SPHEREx.
- Descarga VOTable y enlace a Aladin en otra pestaña.
- Estados de carga, error, tiempo de espera y reintento. Un fallo del complemento no interrumpe la exploración científica.

Se fija [Aladin Lite 3.8.1](https://github.com/cds-astro/aladin-lite/releases/tag/v3.8.1), con importación ESM desde jsDelivr. El GET verificado respondió 200 y devolvió 2 392 227 bytes (aproximadamente 2.28 MiB), con CSS y WASM embebidos. Su costo se justifica por la navegación HiPS y las capas astronómicas; se difiere hasta que el usuario abre el panel. El wrapper y el puente del iframe son archivos locales. La versión fijada no ofrece una operación pública completa de destrucción del render loop; el iframe permite finalizar su contexto al cerrar, reintentar o desmontar el panel, sin modificar internals de la biblioteca.

Se eligieron los espejos HiPS de ESA que CDS enumera como alternativas. Durante la investigación, el [aviso oficial de CDS, actualizado el 9 de noviembre de 2026](https://aladin.cds.unistra.fr/), informaba degradación de servicios. Esa condición externa puede cambiar. Los fondos tienen resoluciones, bandas y fechas distintas: sirven para contexto visual, no para restar píxeles o medir cambios de flujo entre relevamientos.

### Unidades espectrales explícitas

La API numérica WCS puede normalizar ejes a SI. Extraer un número con `.value` o `pixel_to_world_values()` y rotularlo siempre como µm puede producir un error de escala.

El helper `_spectral_values_um()` evalúa el mismo píxel nativo y convierte ambos ejes de longitud a µm utilizando sus unidades declaradas. Se aplica a la lectura central, el píxel seleccionado, el espectro y la línea histórica. Rechaza unidades ausentes, incompatibles y valores no finitos en ese camino. Un WCS presente pero inválido en el píxel seleccionado no se sustituye por la banda central: se omite la medición. La exploración conserva los otros frames válidos mediante su manejo de errores por frame. No aplica equivalencias de frecuencia a anchos de longitud de onda.

Un caso sintético equivalente a 2.28 µm y ancho 0.03 µm ahora devuelve esos valores tanto si el WCS se expresa en m, nm o µm. Los WAVE-TAB reales disponibles ya devolvían µm: se verificó que sus valores se conservan. No se modificaron los datos, máscaras, incertidumbres de flujo, calibración de PSF ni algoritmos de detección.

Se conserva por compatibilidad el fallback heredado de headers `WAVELENGTH_CENTER_UM`, `WAVELENGTH_UM`, `WAVELENGTH` y `CENWAV` cuando no se puede construir el WCS espectral. Los dos últimos no declaran por sí mismos una unidad. Un WCS construido pero con valores o unidades inválidos no activa ese fallback. También permanece la estimación heredada de ancho λ/100 cuando el WCS entrega un ancho finito no positivo o se usa el fallback de headers; no es una medición nueva ni una caracterización instrumental precisa.

### VOTable para catálogos

Nuevo endpoint:

```text
GET /api/tools/catalog.vot?catalog=gaia&ra=10&dec=-20&fov=0.05
```

Acepta `gaia` o `allwise`, RA entre 0 y 360°, Dec entre −90 y 90°, y FoV mayor que 0.005° y hasta 1°. Reutiliza `query_catalog_field()` y su política de caché/respaldo. Construye la respuesta en memoria, con un máximo de 2000 filas consideradas; no genera FITS ni archivos de catálogo adicionales por la serialización.

El archivo contiene identificador, RA/Dec en grados, magnitud y movimientos en mas/año cuando están disponibles. Incluye UCD para posiciones e identificador, procedencia del backend, región solicitada, límites, filas omitidas y truncamiento. Identificadores de cadena o enteros conservan su exactitud; un identificador ausente o recibido como flotante potencialmente impreciso queda nulo. Los valores numéricos opcionales ausentes quedan enmascarados. Posiciones inválidas se omiten, nunca se reemplazan por cero.

La serialización BINARY2 conserva flags de nulos. Astropy 8 ignora al reconstruir tablas los flags de nulo de cadenas; por ello las pruebas verifican también los flags escritos y la cadena vacía, sin inventar un identificador. Las cadenas de metadatos usan INFO para evitar doble escape XML en la conversión de PARAM de Astropy.

El estado `QUERY_STATUS=OK` indica que la exportación se completó, no que el catálogo esté completo. Se informa `OVERFLOW` ante truncamiento conocido o aplicación del límite de exportación. `version` del proveedor actual se documenta como metadato del backend, no como versión científica de Gaia.

## 4. Catálogos, épocas e incertidumbres

| Referencia | Evaluación y alcance |
|---|---|
| [Gaia DR3: modelo de datos](https://gea.esac.esa.int/archive/documentation/GDR3/Gaia_archive/chap_datamodel/sec_dm_main_source_catalogue/ssec_dm_gaia_source.html) | Es valiosa para astrometría, paralaje y movimiento propio. El proveedor actual puede recurrir a un respaldo que no establece inequívocamente la misma entrega/época. La integración nueva no le asigna automáticamente 2016.0 ni propaga posiciones. Paralajes e incertidumbres no se inventan cuando no están presentes en la respuesta actual. |
| [2MASS PSC](https://irsa.ipac.caltech.edu/2MASS/download/allsky/format_psc.html) | Se integra su imagen HiPS como fondo. No se agrega una consulta PSC redundante o incompleta. Para una futura capa de fuentes deben conservarse fecha observacional, errores posicionales y flags de calidad; una designación J2000 no sustituye la fecha de observación. |
| [AllWISE: movimientos](https://irsa.ipac.caltech.edu/data/WISE/docs/release/AllWISE/expsup/sec2_6.html) | Se reutilizan las filas actuales. Su movimiento aparente puede incluir efectos de paralaje y no se interpreta como equivalente al movimiento propio Gaia. No se propagan posiciones sin un modelo y metadatos suficientes. |

Las capas y los archivos identifican filas de catálogo, no contrapartidas confirmadas de una detección SPHEREx. La respuesta actual no suministra épocas de referencia ni matrices de incertidumbre astrométrica; se declaran desconocidas. Se preservan los mecanismos existentes de asociación, pero no se amplían sus inferencias científicas. Un cruce futuro debe considerar errores, época, movimiento y ambigüedad, como explican [Astropy sobre separación y matching](https://docs.astropy.org/en/stable/coordinates/matchsep.html), [propagación](https://docs.astropy.org/en/stable/coordinates/apply_space_motion.html) y [TOPCAT sobre criterios de asociación](https://www.star.bristol.ac.uk/mbt/topcat/sun253/matchCriteria.html).

## 5. Archivos y dependencias

| Archivo | Cambio |
|---|---|
| `src/astronomical_tools.py` | Router y serialización VOTable acotada. |
| `src/main.py` | Registro del router independiente. |
| `src/pipeline.py` | Helper de unidades y uso en los consumidores espectrales. |
| `src/timeline.py` | Reutilización del helper en la medición de cada frame. |
| `static/aladin-reference/reference.js` | Componente montable, saneamiento de contexto y ciclo de vida. |
| `static/aladin-reference/reference.css` | Estilos limitados al panel nuevo. |
| `static/aladin-reference/frame.html`, `frame.js` | Contexto de Aladin aislado y puente con validación de origen/emisor. |
| `static/aladin-reference/check.cjs` | Comprobaciones del componente con API simulada. |
| `static/aladin-reference/README.md` | Contrato y uso portable del componente. |
| `static/index.html`, `static/app.js` | Contenedor, carga local y conexión con el campo/catálogos originales. |
| `tests/test_astronomical_tools.py` | Pruebas de API, máscaras, XML, límites y metadatos. |
| `tests/test_spectral_units.py` | Unidades sintéticas, consumidores y comparación FITS real. |
| `tests/check_astronomical_tools.cjs` | Aislamiento entre campos, conservación de filas y fallo opcional del frontend. |
| `.vercelignore` | Exclusión de datos, entornos, cachés de compilación, dependencias locales y secretos del envío de despliegue desde esta raíz. |
| `.gitignore` | Reglas de dependencias y archivos generados de Next.js en la raíz, para conservarlas al cambiar de rama sin borrar los archivos locales. |
| `ASTRONOMICAL_TOOLS_REPORT.md` | Este informe. |
| `README.md` | Uso del panel, enlace al informe y comandos de pruebas. Se retira la referencia a un inicializador de caché que no existe en esta rama. |

No se agregaron dependencias Python ni se cambiaron los pins de `requirements.txt`. Aladin es la dependencia nueva del navegador, fijada y diferida; requiere conexión y WebGL2. Se conservan los créditos de CDS y los proveedores de imágenes. No se instala TOPCAT, STIL o Aladin Desktop.

La validación ejecutada usa Windows, Python 3.14.7 y Astropy 8.0.2. Los requirements existentes mantienen Astropy 6.1.7 para Python 3.10–3.11 y 8.0.2 para 3.12–3.14. Se eligieron APIs disponibles en esos rangos, pero **no se ejecutó esta entrega en Astropy 6.1.7 ni en otro sistema operativo**. Pandas sigue siendo necesario para la ruta de adquisición de esta rama.

La regla [`.vercelignore`](https://vercel.com/docs/deployments/vercel-ignore) evita subir `data/` desde esta raíz. No elimina los FITS versionados ni cambia la caché. No se hizo un despliegue ni se certifica que FastAPI y sus dependencias científicas quepan o funcionen en un runtime serverless. Un proyecto Vercel con otra raíz debe aplicar exclusiones equivalentes.

## 6. Validación ejecutada

- Validación inicial en `feature/sebas`: **116 pruebas Python aprobadas**, sin skips: las 98 existentes allí y 18 nuevas. Se bloqueó la conexión externa y se registraron **0 intentos** de conexión externa. Dos fixtures históricos recibieron una declaración de unidades para esa validación.
- Validación tras el traslado a `feature/user-friendly`: **18 pruebas Python aprobadas**, sin skips ni intentos de conexión externa. Esta rama había eliminado los tests históricos; se respetó esa eliminación y se incorporaron únicamente los tests nuevos, sin reintroducir archivos borrados en su historia.
- Pasaron también los chequeos de acceso/perfil, asistente, composición y adaptador de módulos, arranque con selección de acceso, visor 3D e idiomas. La landing recuperada pasó ESLint focalizado y TypeScript sin emisión de archivos.
- Las regresiones incluyen explorar y extraer espectros de los cinco objetivos con FITS locales, además de la línea histórica y errores de API.
- Los **84 FITS reales** de los cinco objetivos mantienen centro y ancho espectral, tanto en el centro como en una posición desplazada, con `rtol=1e-12`, `atol=1e-14`. Se verificaron tamaño y fecha de modificación para comprobar lectura sin escritura.
- Los casos sintéticos prueban m/nm/µm, valores Quantity, rechazo de unidades inválidas y conservación de fotometría, incertidumbres, máscara y matrices. También comprueban que un píxel espectral inválido se descarte, que uno vecino válido siga siendo medible y que `/api/explore` conserve el frame válido cuando otro falla.
- El exportador se prueba con límites de parámetros, catálogo vacío, identificación exacta, nulos, XML/Unicode, truncamiento, cap de filas y errores 502 sin exponer el error del proveedor.
- `node --check static/app.js` y `node tests/check_astronomical_tools.cjs`: aprobados. Se evalúa el código real del explorador con DOM y consultas simulados; no constituye una prueba de renderizado WebGL.
- `node static/aladin-reference/check.cjs`: aprobado con API simulada, cubriendo carga diferida, topes, mensajes de otro origen/instancia, timeout, reintento, limpieza del iframe y restauración desde bfcache. Las esquinas del contorno TAN se comparan con resultados de Astropy cerca del polo y del cruce RA=0°, con tolerancia de `1e-8°`.
- Arranque real Uvicorn en un puerto efímero de loopback: `/api/targets` respondió 200 con cinco objetivos. Se cerró el proceso de comprobación y se confirmó el puerto libre. No se tocó el servidor del usuario en el puerto 8000.
- TestClient sobre la aplicación completa: `/`, `/api/targets`, `app.js` y los cuatro assets del complemento respondieron 200. El endpoint VOTable registrado respondió 200 con proveedor simulado; errores de proveedor y parámetros devolvieron 502 y 422 respectivamente. `start_project.py --check` aprobó.
- `git diff --check`: aprobado. Sin modificaciones de archivos existentes en `data/`.

### Rendimiento y memoria

Microbenchmark de 500 evaluaciones de un WCS WAVE-TAB real, con 10 calentamientos por caso, `perf_counter` y `tracemalloc`:

| Operación | Tiempo medio por llamada | Pico de memoria Python |
|---|---:|---:|
| Lectura central anterior, API de alto nivel | 214.85 µs | 27.91 KiB |
| Lectura numérica nativa anterior, sin conversión | 31.97 µs | 8.82 KiB |
| Helper nuevo, con unidades explícitas | 123.81 µs | 9.16 KiB |

El nuevo camino central resulta más rápido en esta medición. Frente al camino numérico anterior agrega unos 92 µs por evaluación, aproximadamente 9.4 ms para 102 evaluaciones. Esta comparación no es un benchmark de la aplicación completa. `tracemalloc` no mide RSS, memoria nativa de NumPy/WASM ni GPU.

El panel limita sus capas a 500 fuentes y el exportador considera hasta 2000 filas. Cerrar el panel retira el iframe; no mantiene una instancia oculta dibujando continuamente. No se descargaron catálogos completos.

Una serialización con 2005 filas sintéticas produjo 2000 filas, 215 315 bytes, 222.78 ms y 1534.15 KiB de pico Python con Astropy ya importado. Es una medición acotada, no una garantía de latencia ni de RSS de producción.

## 7. Uso y límites de validación

Desde PowerShell en la raíz, con el entorno ya preparado:

```powershell
.\run_project.bat --no-install
```

Abrir `http://127.0.0.1:8000/`, explorar una región y desplegar **“Aladin Lite · referencia del cielo”**. Se puede cambiar el fondo y sincronizar la selección. La descarga VOTable abre una tabla en herramientas compatibles con ese formato. No abrir el HTML como `file://`: el complemento usa assets y API del mismo servidor.

Para reproducir las verificaciones locales:

```powershell
$env:MPLCONFIGDIR = Join-Path $PWD '.matplotlib'
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
& 'C:\Program Files\nodejs\node.exe' tests\check_astronomical_tools.cjs
& 'C:\Program Files\nodejs\node.exe' static\aladin-reference\check.cjs
```

El comando Python normal ejecuta la suite; la corrida de auditoría agregó un guard de sockets para detectar cualquier conexión externa accidental. Las pruebas no descargan los FITS si faltan las muestras locales.

No se pudo validar visualmente una instancia real de Aladin/WebGL2 en un navegador en esta sesión. Las pruebas de componente usan una API simulada. La disponibilidad de módulos/servicios remotos no demuestra que cada tesela se dibuje en toda GPU o navegador. Tampoco se ejecutaron TOPCAT/Aladin Desktop: se validó el formato interoperable, no una sesión de esas aplicaciones. No había cachés JSON Gaia/AllWISE disponibles para una comparación real del exportador: sus pruebas y benchmark usan fixtures, mientras que la comparación espectral sí utiliza FITS reales.

## 8. Ganancias y próximos pasos

La ganancia científica inmediata es impedir que una magnitud espectral en SI termine mal etiquetada como µm. La ganancia de interoperabilidad es poder inspeccionar filas, unidades, nulos y procedencia en programas astronómicos públicos. La referencia HiPS agrega contexto visual sin convertirla en una medición SPHEREx ni en una confirmación de Planet X.

Orden recomendado para continuar:

1. Validar visualmente el panel con WebGL2 y fondos remotos en el navegador del equipo, incluyendo conexión interrumpida y reapertura.
2. Ampliar el contrato de catálogos con entrega exacta, época, incertidumbres, calidad y paralaje cuando corresponda. Recién entonces evaluar propagación con SkyCoord y asociación probabilística o con radios derivados de errores.
3. Agregar 2MASS PSC mediante consultas regionales IRSA con época/flags, si existe un caso de uso que necesite fuentes y no solamente la imagen de referencia.
4. Evaluar Specutils cuando estén definidas y validadas la respuesta instrumental y las incertidumbres de los espectros por bandas.
5. Probar la matriz Python/Astropy y un despliegue real antes de afirmar portabilidad completa. Incorporar SAMP sólo si el flujo de trabajo requiere enviar tablas a aplicaciones de escritorio abiertas.
