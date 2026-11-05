# Validación de detección automática de dipolos · 2026-11-05

El detector identifica movimiento en escenas controladas, incluida la ruta de lectura FITS, reproyección, calibración y API. La interfaz muestra los lóbulos y permite seleccionar el candidato. En la caché original de los cinco objetivos no se encontraron entradas suficientes para habilitar la detección. Una búsqueda temporal posterior sí consiguió un grupo comparable en el campo de Barnard’s Star y produjo un candidato; se detalla más abajo. No se confirmó ningún dipolo astronómico real en esta revisión.

El componente llamado «IA» implementa picos estadísticos y emparejamiento geométrico; no es un modelo entrenado.

## Pruebas controladas

La primera validación agregó ocho pruebas específicas y dejó 44 pruebas aprobadas. La etapa posterior incorporó el filtro morfológico y la búsqueda temporal; la suite actual tiene **62 pruebas aprobadas**.

| Caso | Resultado |
| --- | --- |
| Fuente desplazada de (72, 52) a (80, 52) | Un `MOVING_DIPOLE`, con ambos lóbulos en las posiciones esperadas y desplazamiento de 8 px. |
| Invertir el orden temporal | Se invierten los lóbulos positivo y negativo. |
| Aumento o disminución aislados de brillo | `VARIABLE_MONOPOLE` en el fondo controlado. |
| Lóbulos separados más de 22 px | No se emparejan como dipolo. |
| Lóbulo negativo enmascarado | No se forma un dipolo. |
| Cambio de PSF, ganancia y fondo | La calibración conserva el movimiento y suprime el residuo de la fuente estática probada. Pueden quedar picos aislados de ruido. |
| Dos FITS sintéticos procesados por `/api/explore` | El detector se ejecuta automáticamente y devuelve el dipolo esperado. |

La escena FITS utiliza referencias estáticas, una fuente móvil, ruido, distintas anchuras de PSF, ganancia y fondo. Los archivos se escriben en directorios temporales y no se agregan a `data/cache/`. El movimiento propio de 22,5 arcsec/año de esa escena es un valor artificial conocido para verificar escala y tiempo; no es una medición de un objetivo real.

La comprobación en Chrome usó esa respuesta sintética, identificada como `CONTROLLED_SYNTHETIC_FITS`. Se verificaron los marcadores, el modo Resta y la selección por teclado, sin errores de JavaScript. Las consultas de catálogos y espectro se simularon durante esta prueba de interfaz; no forman parte de esa validación.

## Datos reales incluidos

Se comprobaron dos conjuntos por objetivo: los diez archivos declarados en su manifiesto y todos los FITS `real*.fits` de su carpeta. No se descargaron observaciones ni se modificaron los originales. Para la inspección ampliada se proporcionaron a la API los archivos adicionales con sus metadatos de cabecera, sin alterar el manifiesto.

Con los diez recortes que carga cada botón, los cinco objetivos devuelven `difference_available=false`, estado `insufficient_epochs`, y el detector no se invoca. Predominan exposiciones de distintas bandas que no se pueden interpretar como un par temporal comparable.

| Objetivo | FITS locales inspeccionados | Resultado del conjunto ampliado |
| --- | ---: | --- |
| WISE 0855 | 16 | Sin dos épocas con bandas comparables. |
| Barnard's Star | 16 | Sin dos épocas con bandas comparables. |
| Epsilon Indi B | 16 | Sin dos épocas con bandas comparables. |
| RW Aurigae | 16 | Sin dos épocas con bandas comparables. |
| R Draconis | 20 | Se selecciona un par, pero faltan tres referencias fotométricas utilizables; estado `insufficient_references`. |

Por tanto, «0 anomalías» en estos conjuntos no demuestra que se buscó movimiento y no se encontró: la resta no está disponible y la detección se omite. La interfaz muestra el motivo en `analysis_note`.

## Falsos positivos y límites

Un ensayo adicional generó 100 imágenes de 128 × 128 con ruido gaussiano independiente de desviación 1, usando semillas 0–99 y umbral 4σ. En 2 imágenes apareció al menos un candidato a dipolo sin fuente real. Al agregar una única fuente que cambia de brillo, de amplitud 30 y sigma espacial 1 en (64, 64), aparecieron candidatos a dipolo en 10 de 100 imágenes, aunque no había movimiento. El detector se evaluó directamente sobre esas diferencias, sin consultas de catálogos.

Estos resultados describen ese ensayo artificial; **no estiman la tasa de falsos positivos de observaciones reales**. El emparejamiento evaluado en esa primera etapa se basaba en proximidad de picos de signo opuesto y puede asociar ruido o variabilidad con movimiento. En esa versión, un par muy desequilibrado en amplitud también podía recibir la etiqueta de dipolo.

Para validar la función científicamente faltan pares reales comparables, cobertura suficiente para calibrar, pruebas con fuentes de movimiento conocido y filtros de morfología/consistencia de lóbulos con umbrales evaluados. La PSF gaussiana aproximada y el ruido correlacionado siguen siendo limitaciones. No se relajaron los criterios de calidad para forzar detecciones en la caché existente.

## Actualización: filtro y adquisición temporal

Se agregó el botón **Buscar pares temporales**, que consulta hasta 128 registros antiguos y 128 recientes de SPHEREx, siguiendo las tablas y el criterio de cobertura del [tutorial oficial de IRSA](https://caltech-ipac.github.io/irsa-tutorials/spherex-cutouts/). Prioriza extremos e instantes intermedios por detector y solicita hasta 24 recortes desde la interfaz, con un máximo de 32 por petición a la API. La compatibilidad espectral se comprueba después sobre los FITS descargados, usando la longitud de onda del centro celeste solicitado.

La adquisición usa una carpeta `temporal_*` separada de la caché original, nombres únicos y publicación atómica del manifiesto. Reutiliza FITS por URL en nuevas búsquedas. Si la red o el presupuesto de 75 segundos deja una descarga parcial, se indica en la respuesta; se puede reutilizar esa muestra durante diez minutos sin repetir consultas en cada carga de la página. El botón permite reconsultar los metadatos explícitamente. Las carpetas temporales están excluidas de Git.

La selección compara grupos espectrales solapados, prioriza mayor tiempo útil y prueba hasta ocho alternativas de calibración sobre las mismas imágenes alineadas. No se relajan los requisitos de PSF, fotometría o cobertura para forzar una resta.

El filtro de dipolos ahora exige, para cada lóbulo:

- Un núcleo conectado de al menos tres píxeles, por encima de 2σ o del 20 % del pico.
- Forma compacta, con relación de ejes no mayor a 3; se rechazan núcleos lineales y vecindades enmascaradas.
- Balance de flujo entre núcleos de al menos 0,25 y relación entre anchuras de al menos 0,5.

Los emparejamientos se priorizan por consistencia de flujo y anchura, además de distancia. Los parámetros medidos se incluyen en cada candidato. Son criterios operativos preliminares: pueden perder movimientos reales muy poco muestreados o con fuertes cambios de brillo. El balance corresponde al núcleo recortado, no al flujo total de la fuente.

### Comparación controlada del filtro

Se repitió el ensayo anterior y se añadió una segunda tanda de semillas 100–199. Cada celda corresponde a 100 campos. En las filas sin movimiento se cuenta la presencia de al menos un dipolo falso; en la fila con movimiento se exige recuperar los dos lóbulos inyectados dentro de un píxel.

| Escena | Semillas 0–99, antes → después | Semillas 100–199, antes → después |
| --- | --- | --- |
| Ruido gaussiano independiente | 2 → 0 | 2 → 0 |
| Fuente que solo cambia de brillo + ruido | 10 → 0 | 7 → 0 |
| Movimiento conocido, amplitud 20 y separación 8 px | 99 → 100 | 99 → 100 |
| Ruido correlacionado mediante suavizado gaussiano de sigma 1 | 1 → 1 | 3 → 3 |

**El ruido correlacionado sigue siendo una limitación.** Estos ensayos evalúan el detector sobre diferencias artificiales; no certifican una tasa de falsos positivos para observaciones reales ni una significación estadística de sus candidatos.

### Ejecución sobre observaciones reales nuevas

Se solicitaron recortes de RA=269,452075°, Dec=4,693364°, FoV=0,12°. La consulta encontró fechas de agosto de 2025 a septiembre de 2026. Las descargas fueron parciales por el límite de tiempo: quedaron 23 exposiciones en el manifiesto validado. Los archivos originales anteriores se conservaron.

El procesamiento eligió tres exposiciones de **SPHEREx-D2**, con centros espectrales aproximadamente 1,4827, 1,4977 y 1,4977 µm. El intervalo entre las medias temporales es **1,0146 años**. Los ajustes usaron siete y cuatro referencias, respectivamente, y dejaron **65,27 % de cobertura común**. La resta y el detector se ejecutaron efectivamente sobre esos FITS reales.

El resultado incluyó **un candidato a dipolo de 2 px**, además de candidatos monopolares. No se confirmó la identidad de esa fuente, ni que su residuo sea movimiento astrofísico. En particular, **no se identificó como Barnard’s Star**. La proyección, el movimiento propio catalogado, la PSF espacial y los residuos fotométricos requieren una revisión específica. El valor `snr_score` es una relación con el MAD del campo, no una significación calibrada con covarianzas.

La evidencia resumida, incluidas las URLs de los tres recortes usados, está en [validacion_temporal_barnard.json](validacion_temporal_barnard.json). La página puede abrir ese campo con:

```text
http://127.0.0.1:8000/?ra=269.452075&dec=4.693364&fov=0.12&temporal=1
```

Se verificó en Chrome la carga desde la caché real, la resta, la tarjeta del candidato, su selección y el espectro extraído del mismo conjunto. La vista móvil no desbordó y no hubo errores de JavaScript. Para probar el botón de actualización se interceptó su respuesta de descarga; se comprobaron los parámetros `temporal_search=true` y `refresh=true`. Los catálogos y cruces externos no se ejercitaron en esta prueba de interfaz.

## Repetir las pruebas

```bash
.venv/bin/python -m unittest discover -s tests -p 'test_dipoles.py' -v
.venv/bin/python -m unittest discover -s tests -v
```
