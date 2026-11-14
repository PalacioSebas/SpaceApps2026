# Optimización · 2026-11-14

## Alcance

Revisión de la rama `feature/refactor`, desde `02521bf`, para reducir instalación, memoria y transferencia sin cambiar los cálculos científicos ni los límites de Python del lanzador.

Al iniciar la revisión, el árbol local ocupaba aproximadamente 4,5 GB: `.git` 3 GB, datos 668 MB y `.venv` 898 MB. El frontend ocupaba unos 200 KB y `src` menos de 1 MB, incluyendo bytecode. El historial y los FITS ya versionados no se modificaron. Reducir el historial requeriría un trabajo coordinado aparte con el equipo.

El `.gitignore` excluye cachés nuevas, descargas incompletas, entornos, builds, logs y reportes de herramientas. Conserva las plantillas `.env.example`, `.env.sample` y `.env.template`, las configuraciones compartidas y los fixtures fuera de `data/cache`. Ignorar archivos no los borra del disco ni los retira del seguimiento existente. La caché de demostración aún contiene **89 archivos versionados, unos 406 MiB**: retirarla requiere adaptar primero la prueba de los cinco objetivos y su preparación en CI. Los objetos que ya están en el remoto no se envían otra vez si no cambian.

## Cambios

- **Dependencias:** se retiraron Pandas, Matplotlib, scikit-image y Astroquery del conjunto directo. Se recorre la tabla Astropy de TAP sin convertirla a un DataFrame. Las paletas PNG se calculan con NumPy/Pillow. En el entorno original, esos cuatro paquetes sumaban aproximadamente 163 MiB de archivos propios, sin contar sus dependencias transitivas.
- **Arranque:** Uvicorn inicia sin `--reload` por defecto, evitando el proceso de vigilancia y sus recursos. La recarga automática sigue disponible al pasar `--reload` explícitamente en desarrollo.
- **Memoria del backend:** LRU con presupuesto de datos retenidos: FITS 64 MiB, reproyecciones 16 MiB y respuestas 16 MiB. Las respuestas caducan a los cinco minutos. Las entradas demasiado grandes se procesan sin retenerse. El tamaño y el timestamp en nanosegundos invalidan las lecturas y reproyecciones cuando cambia un FITS.
- **Transferencia:** gzip de JSON/JavaScript cuando el cliente lo admite, con nivel 5. El JavaScript admite ETag/Last-Modified y respuestas 304; el HTML conserva el versionado por fecha para recibir los cambios.
- **Navegador:** Plotly Basic 2.32.0 conserva las trazas scatter usadas por los espectros/curvas de luz. Los eventos frecuentes de zoom/arrastre se agrupan con `requestAnimationFrame`. La caché de relevamientos conserva seis imágenes y cancela las pendientes que expulsa. Después de decodificar, se eliminan las copias base64 de los objetos de metadatos. El mosaico conserva un objetivo de 32 sectores y libera los más lejanos: se protegen el origen, la selección activa, las descargas en curso y el campo visible con un borde vecino; esa protección puede superar temporalmente el objetivo. Un sector expulsado se vuelve a solicitar al regresar a él.
- **Correcciones de la comprobación final:** la cabecera se desplaza con la página en pantallas menores a 1024 px para permitir interactuar con el visor. La exportación WebM pausa el temporizador correcto, libera las pistas del stream al terminar y restaura la reproducción anterior; pausar el flipbook limpia también su referencia al temporizador.
- **Distribución:** `scripts/create_light_bundle.py` genera un ZIP de fuentes, recursos, documentación y pruebas sin `.git`, entornos, secretos de la raíz ni datos descargados. `dist/` está ignorado por Git.

La [documentación de la distribución Plotly 2.32.0](https://github.com/plotly/plotly.js/blob/v2.32.0/dist/README.md#plotlyjs-basic) publica aproximadamente 3,5 MB para el paquete completo minificado frente a 991,4 KB para Basic, y 1 MB frente a 331,6 KB con gzip. Estas cifras corresponden a esa biblioteca; no al peso total de la página. Tailwind continúa cargándose desde CDN.

## Medición local

Linux x64, CPython 3.12. Comparación de tres ejecuciones por versión, alternadas en procesos nuevos, con el mismo intérprete y dependencias instaladas. La versión anterior se exportó desde `02521bf`; ambas usaron los mismos FITS. Se muestran medianas. La medición bloquea la adquisición remota y usa diez recortes locales de WISE 0855, además de 30 PNG sintéticos de 128 × 128. No es una medida de latencia de IRSA ni de todos los campos posibles.

| Métrica | Antes | Después |
| --- | ---: | ---: |
| Importar backend | 1,097 s | 0,913 s |
| Pico RSS del proceso de medición | 155,45 MiB | 146,25 MiB |
| Generar 30 PNG | 0,133 s | 0,130 s |
| Procesar el campo por primera vez | 0,684 s | 0,718 s |
| Resolver la misma consulta desde caché | 0,183 ms | 0,180 ms |

El arranque mejoró aproximadamente un 17 %. El procesamiento inicial del campo quedó unos 34 ms por encima en esta muestra; no se observó una aceleración de esa operación. La gestión de caché añade contabilidad a cambio de limitar los datos retenidos. Las cifras de RSS no representan una prueba de carga ni garantizan el máximo de memoria de una petición grande.

El JSON de la muestra ocupó **150.468 bytes**; comprimido con gzip nivel 5, **102.994 bytes** (aproximadamente un 32 % menos). El benchmark calcula el cuerpo comprimido; las pruebas HTTP verifican además la negociación y la conservación del contenido.

Un entorno temporal nuevo, instalado desde `requirements-dev.txt`, ocupó aproximadamente **459 MB**, con los cuatro paquetes retirados ausentes. El `.venv` original se conservó y contiene herramientas adicionales, como Playwright: comparar sus 898 MB directamente con el entorno limpio no atribuye toda la diferencia a estos cambios.

El ZIP de fuentes ocupa aproximadamente **140 KB**; su tamaño varía con la documentación. No contiene los FITS de demostración: requiere internet para obtenerlos al consultar los objetivos desde la interfaz. En Linux, los scripts `.sh` incluidos se pueden ejecutar con `bash` aunque el descompresor no conserve el permiso de ejecución.

Los PNG de ciencia y FLAGS de la escena controlada fueron idénticos. La paleta divergente cambia como máximo un nivel de 255 por canal al interpolar con NumPy. Esto solo afecta la visualización; las matrices y la detección se calculan antes de colorear.

## Configuración y reproducción

Los presupuestos se configuran con `PAPASTRONOMY_FITS_CACHE_MB`, `PAPASTRONOMY_REPROJECT_CACHE_MB` y `PAPASTRONOMY_RESPONSE_CACHE_MB`. Aceptan enteros no negativos; `0` desactiva la caché correspondiente. Son estimaciones de buffers/estructuras Python retenidos, no límites de RSS: los temporales de cálculo y parte de las estructuras nativas de WCS quedan fuera de esa contabilidad. Cada proceso tiene su propia caché.

Con el entorno activo y los FITS precargados disponibles:

```bash
python scripts/benchmark_project.py
python -m unittest discover -s tests -v
```

La comprobación del frontend solo necesita Node, sin dependencias npm:

```bash
node scripts/check_frontend.cjs
```

Para generar el paquete distribuible:

```bash
python scripts/create_light_bundle.py
```

Para probar una instalación limpia sin reemplazar el entorno existente, usar `bash run_project.sh --venv .venv-light --setup-only` o `run_project.bat --venv .venv-light --setup-only` en Windows. Los posteriores arranques deben conservar `--venv .venv-light`; se puede añadir `--no-install` si las dependencias ya están preparadas.

## Validación y límites

La suite cubre calibración, dipolos, catálogos, cinco objetivos reales, adquisición temporal y arranque. Las nuevas regresiones verifican expulsión LRU, entradas sobredimensionadas, caducidad, buffers compartidos, cambios de FITS, lectura de tablas sin Pandas, colores/transparencia, gzip, respuestas 304 y recarga de desarrollo opcional. Se ejecuta también una comprobación Node de repintado, cancelación, liberación de payloads y sectores, y conservación de metadatos.

### Resultado de la comprobación previa a subir

| Comprobación | Resultado |
| --- | --- |
| Linux, Python 3.10.22, entorno nuevo | 88 pruebas aprobadas. |
| Linux, Python 3.12.3, entorno reducido | 88 pruebas aprobadas mediante el `.sh` real desde otra carpeta. |
| Linux, Python 3.14.10, entorno nuevo | 88 pruebas aprobadas. |
| Dependencias y frontend | `pip check`, sintaxis Python/Bash/JavaScript, finales de línea `.bat`/`.sh` y comprobaciones Node correctos. |
| Servidor real | Arranque mediante `.sh` con el entorno reducido; página, objetivos, exploración y espectros respondieron HTTP 200. |
| Chrome de escritorio | Cinco objetivos, flipbook, mediana, RGB, selección de bandas, FLAGS, inversión, operaciones A/B, Shift & Stack, espectro, curva de luz y enlaces compartidos comprobados. Sin errores JavaScript en el recorrido. |
| Exportaciones | Descargas PNG, CSV y WebM válidas; se comprobó la liberación del stream y la reanudación de la animación. |
| Móvil y embebido | Pantalla de 390 px sin desborde horizontal, clic sobre el visor y modo `embed=1` correctos. |
| Campos temporales locales | Epsilon Indi: 24 recortes, resta deshabilitada por condiciones insuficientes. Campo de Barnard: 23 recortes, resta gaussiana disponible y seis candidatos; selección de tarjeta y visualización correctas. |
| Consulta remota real | IRSA SIA devolvió dos registros; se descargó, validó y procesó un FITS de 42 × 42 píxeles en una carpeta temporal. Gaia y AllWISE respondieron desde IRSA TAP, con 42 y 67 fuentes en el campo de WISE 0855 consultado. |
| Errores de servicios remotos | Se simuló indisponibilidad de catálogos en el navegador y se comprobaron sus estados de error; las consultas reales se verificaron por separado. |

Los candidatos del campo temporal no equivalen a objetos identificados ni a movimiento confirmado. Las cifras de catálogo describen ese cono y esa consulta, no una cantidad fija garantizada por el servicio. Las pruebas remotas usaron archivos y cachés temporales, sin reemplazar los datos locales.

Windows y Python 3.11/3.13 conservan la matriz de CI existente; sus resultados requieren una ejecución en GitHub. El recorrido funcional se ejecutó en Chrome, pero no constituye una prueba de carga concurrente ni una medición de FPS en todos los navegadores. Una distribución sin caché debe preparar los FITS antes de ejecutar la suite completa.
