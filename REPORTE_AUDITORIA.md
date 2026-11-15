# REPORTE DE AUDITORÍA TÉCNICA

**Proyecto:** Papastronomy v2.5 — NASA Space Apps Challenge 2026 · "Planet X and SPHEREx"
**Alcance:** Auditoría de solo lectura (QA, análisis estático, pruebas, auditoría científica de datos). **Sin modificaciones de código.**
**Fecha:** 2026-11-14
**Entorno de auditoría:** Windows 10, Python (venv del proyecto), Node v24.14.0.
**Stack:** FastAPI + JS estático (vanilla) + `astropy==8.0.2` (≥3.12) / `6.1.7` (<3.12), `numpy`/`scipy`, `certifi`. Backend `src/` (12 módulos), frontend `static/` (`index.html` 677 L, `app.js` 5438 L), tests `tests/` (7 archivos, 98 casos).

> Nota metodológica: la herramienta `reducto` (MCP) no estuvo disponible durante la auditoría; se utilizó lectura directa de archivos y ejecución de diagnóstico no destructivo en el venv del proyecto. Todas las referencias `archivo:línea` fueron contrastadas contra el código real.

---

## 1. Resumen ejecutivo

El proyecto se encuentra en **buen estado general**. Es una aplicación web (FastAPI + frontend estático) que consulta y procesa cutouts FITS de SPHEREx desde NASA/IRSA, con una suite de pruebas sólida: **98/98 tests en verde** (ver §2), sintaxis válida en todos los módulos Python y en `app.js`, y un flujo de datos (consulta → caché local → pipeline FITS/WCS → análisis → API) coherente y testeado.

Los problemas reales son **moderados y acotados**: **2 hallazgos MEDIUM** (uno de gestión de excepciones con posible fuga de información, otro de seguridad por contexto SSL sin verificación como *fallback*) y **3 LOW** (CORS con credenciales, código muerto con valores científicos erróneos, y una carrera en locks de descargas). El resto son observaciones **INFO** (mantenimiento, memoria, y matices científicos). **No se detectó pérdida de datos ni vulnerabilidad crítica.**

Punto fuerte verificado: la **integridad científica de los datos** es correcta en los casos que se pudo auditar — el canal/longitud de onda se infiere correctamente vía WCS espectral (validado sobre FITS reales), la aritmética de paralaje y la fórmula de ajuste de Planck son dimensionalmente correctas, y la máscara de `FLAGS` (32-bit) es **adecuada para los datos actuales** (validado sobre los 2004 FITS cacheados).

Se documentan también varios ítems que **se investigaron y NO son bugs** (ver §3.2) para que el agente de desarrollo no re-invierta en ellos.

**Distribución de severidad (no inflada):**
- **CRITICAL:** 0
- **HIGH:** 0
- **MEDIUM:** 2 (QA-01, QA-04)
- **LOW:** 3 (QA-02, QA-03, QA-05)
- **INFO:** 7 (QA-07, QA-08, QA-09, QA-10, QA-11, QA-12, QA-13)
- **Verificado como NO bug:** 7 ítems (§3.2)

---

## 2. Estado de las pruebas

| Verificación | Resultado | Evidencia |
|---|---|---|
| Suite de tests (`unittest`, 98 casos) | **98/98 OK** en 24.4 s | Log: `C:\Users\Sebas\.lmstudio\scratchpads\ig\test_run.log`. Coherente con el claim del README ("98 tests OK"). |
| Compilación de sintaxis (`py_compile`) | **OK** en los 12 `src/*.py`, 7 `tests/*.py` y `start_project.py` | Sin errores. |
| Sintaxis frontend (`node --check static/app.js`) | **OK** | Node v24.14.0. |
| `requirements.txt` | Pins con *env-markers*: `astropy==8.0.2; python_version >= "3.12"`, `astropy==6.1.7; python_version < "3.12"`. `requirements-dev.txt` añade `httpx==0.28.1`. | Coherente. |
| CI | `.github/workflows/compatibility.yml`: matriz ubuntu+windows × Python 3.10–3.14, ejecuta el launcher `--test`. | Adecuado. |
| Diagnóstico no destructivo (WCS/longitud de onda) | `_infer_wavelength` **funciona** sobre FITS reales (2.28 µm / 3.80 µm, canales SPHEREx correctos). | Ver §3.2. |
| Diagnóstico no destructivo (FLAGS) | 2004/2004 FITS con `FLAGS` de **32-bit** (`BITPIX 32`, dtype `>i4`), ninguno con bits ≥32. Máx observado `0x10200005`. | Ver §3.2 (resuelve QA-06). |

**Características de la suite:** los tests son **offline** (se *patchea* la red). Esto es adecuado y reproducible.

**Pruebas que NO se ejecutaron (y por qué):**
- **Integración en vivo con IRSA/Gaia/AllWISE:** no se ejecutó para no depender de red externa ni de no-determinismo de servicios de terceros; la suite ya cubre la lógica con red *mockeada*. Queda como recomendación de CI con *network* opcional (§7).
- **Comportamiento CORS real y contenido del mensaje 502:** no hay test que cubra estos dos puntos específicos (ver §6 y hallazgos QA-01/QA-02).
- **Ruta de "swallow" silencioso de `prioritize_local_frames`:** sin cobertura (ver QA-11).

**Gaps de cobertura identificados** (detalle en §6): CORS, contenido/fuga del mensaje 502 genérico, ancho de `FLAGS` 64-bit (ahora resuelto como no aplicable a datos actuales), y la ruta silenciosa de `prioritize_local_frames`.

---

## 3. Errores encontrados

Convenciones de etiqueta: **[reproducido]** = se reprodujo/validó con evidencia; **[análisis estático]** = detectado por lectura de código, no ejecutado; **[requiere validación]** = sospecha que necesita más evidencia.

### 3.1 Hallazgos

#### QA-01 — Gestión de excepciones genérica que mal clasifica y fuga texto crudo
- **Severidad:** MEDIUM
- **Etiqueta:** [análisis estático]
- **Archivo:** `src/main.py`
- **Línea:** 297–299 (endpoint `/api/explore`)
- **Descripción precisa:** El bloque `except Exception as exc` captura **cualquier** excepción (FITS corrupto, `MemoryError`, bugs locales, errores de archivo) y la convierte siempre en un `HTTPException(502, ...)` con el detalle `f"Error comunicando con NASA/IPAC IRSA: {exc}"`.
- **Evidencia:**
  ```python
  # src/main.py:297-299
  except Exception as exc:
      logger.exception("Error procesando datos reales en /api/explore:")
      raise HTTPException(status_code=502, detail=f"Error comunicando con NASA/IPAC IRSA: {exc}") from exc
  ```
- **Pasos para reproducir:** provocar cualquier fallo local dentro de `/api/explore` (p. ej., un FITS corrupto en `data/cache/...` o un `MemoryError`) y observar que la respuesta HTTP es `502` con texto que atribuye el error a IRSA/rede e incluye el texto crudo de la excepción.
- **Comportamiento actual:** Todo fallo local se etiqueta como "Error comunicando con NASA/IPAC IRSA" (código 502) y el texto de la excepción (que puede incluir rutas de archivo del sistema, p. ej. `.../data/cache/.../real_....fits: ...`) se interpola en el `detail` expuesto al cliente.
- **Comportamiento esperado:** Distinguir errores de red/IRSA (502/503 con mensaje genérico seguro) de errores locales (500 con mensaje genérico); nunca exponer el texto crudo de la excepción al cliente (el detalle completo ya va al log vía `logger.exception`).
- **Causa raíz probable:** Un `except Exception` de "última línea" para no romper el endpoint, sin diferenciar el origen del fallo, y con interpolación directa de `str(exc)` en la respuesta.
- **Recomendación:** Separar los manejadores (red/IRSA → 502/503; local → 500) con mensajes genéricos fijos y estables; reservar `logger.exception` para el detalle completo; evitar interpolar `str(exc)` en el `detail` devuelto al cliente.

#### QA-04 — Contexto SSL sin verificación como *fallback* (riesgo MITM)
- **Severidad:** MEDIUM (seguridad)
- **Etiqueta:** [análisis estático]
- **Archivo:** `src/irsa_client.py`
- **Líneas:** 53–58 (`_build_ssl_context`), 61, 64–74 (`_urlopen_with_ssl_fallback`)
- **Descripción precisa:** Se reemplaza `ssl._create_default_https_context` por una función que, al fallar, devuelve `ssl._create_unverified_context()`, y `_urlopen_with_ssl_fallback` reintenta las conexiones que fallan por certificado usando un contexto **sin verificación**.
- **Evidencia:**
  ```python
  # src/irsa_client.py:53-61
  def _build_ssl_context() -> ssl.SSLContext:
      """Usa el bundle CA de certifi ... (irsa.ipac.caltech.edu)."""
      try:
          return ssl.create_default_context(cafile=certifi.where())
      except Exception:
          return ssl._create_unverified_context()
  ssl._create_default_https_context = _build_ssl_context

  # src/irsa_client.py:64-74
  def _urlopen_with_ssl_fallback(req, timeout):
      try:
          return urllib.request.urlopen(req, timeout=timeout)
      except urllib.error.URLError as exc:
          reason = getattr(exc, "reason", None)
          if "CERTIFICATE_VERIFY_FAILED" in str(exc) or isinstance(reason, ssl.SSLError):
              return urllib.request.urlopen(req, timeout=timeout, context=ssl._create_unverified_context())
          raise
      except ssl.SSLError:
          return urllib.request.urlopen(req, timeout=timeout, context=ssl._create_unverified_context())
  ```
- **Pasos para reproducir:** forzar un fallo de verificación de certificado (p. ej., CA ausente/corrupto localmente) y observar que la petición se reintentó **sin verificar** el certificado del servidor (un MITM podría entregar un certificado inválido sin que se detecte).
- **Comportamiento actual:** Ante fallos de CA locales (documentado como tradeoff Windows), el cliente acepta **cualquier** certificado del servidor, permitiendo intercepción.
- **Comportamiento esperado:** Verificar siempre el certificado; si la CA local falla, fallar de forma visible (o usar un *pinning* de certificado conocido de `irsa.ipac.caltech.edu`) en lugar de desactivar la verificación.
- **Causa raíz probable:** Workaround para problemas de almacén de CAs en Windows que degradó la seguridad como condición de fallback.
- **Recomendación:** Mantener la verificación; si hace falta un CA alternativo, entregar el bundle `certifi`/CA del dominio de forma explícita y **no** recurrir a `_create_unverified_context()`. Considerar *certificate pinning* contra `irsa.ipac.caltech.edu`. Registrar en el log cada uso del fallback para auditoría.

#### QA-02 — CORS con comodín + credenciales
- **Severidad:** LOW
- **Etiqueta:** [análisis estático]
- **Archivo:** `src/main.py`
- **Líneas:** 74–80 (específicamente 76–77)
- **Descripción precisa:** `CORSMiddleware` con `allow_origins=["*"]` y `allow_credentials=True`.
- **Evidencia:**
  ```python
  # src/main.py:74-80
  app.add_middleware(
      CORSMiddleware,
      allow_origins=["*"],
      allow_credentials=True,
      allow_methods=["*"],
      allow_headers=["*"],
  )
  ```
- **Pasos para reproducir:** inspeccionar las cabeceras CORS de una respuesta de la API con un `Origin` arbitrario; con credenciales el middleware refleja el origen (no emite `*`), lo que habilita peticiones cross-origin credenciales desde **cualquier** sitio.
- **Comportamiento actual:** Cualquier origen puede hacer peticiones cross-origin con credenciales hacia la API.
- **Comportamiento esperado:** En una API pública/stateless sin autenticación, o bien `allow_credentials=False` (y se puede usar `*`), o una lista blanca explícita de orígenes si se quieren permitir credenciales.
- **Causa raíz probable:** Configuración de conveniencia sin revisar el efecto de la combinación comodín+credenciales.
- **Recomendación:** Si no se usan credenciales ni auth, poner `allow_credentials=False`. Si se necesitan, listar orígenes concretos. Impacto práctico bajo hoy (API pública sin datos sensibles), pero es una mala combinación que conviene corregir.

#### QA-03 — `BAND_WAVELENGTH_UM` es código muerto y con bandas SPHEREx erróneas
- **Severidad:** LOW
- **Etiqueta:** [análisis estático]
- **Archivo:** `src/irsa_client.py`
- **Líneas:** 522–534
- **Descripción precisa:** El diccionario `BAND_WAVELENGTH_UM` **no está referenciado en ninguna parte** del proyecto (src, tests, static) y sus 6 entradas "SPHEREx" (bandas "1".."6") no corresponden a los **4 canales** reales de SPHEREx (C1 1.12–1.28, C2 1.62–1.76, C3 2.29–2.50, C4 3.59–4.00 µm).
- **Evidencia:**
  ```python
  # src/irsa_client.py:522-528 (fragmento)
  BAND_WAVELENGTH_UM: Dict[str, Tuple[float, float]] = {
      "1": (1.10, 0.03),
      "2": (1.55, 0.04),
      "3": (2.15, 0.05),
      "4": (3.10, 0.08),
      "5": (4.10, 0.10),
      "6": (4.65, 0.11),
      ...
  ```
  Búsqueda de referencias: **0 usos** en todo el repositorio. (Nota: la longitud de onda efectiva en el flujo real se obtiene por el camino WCS espectral de `pipeline._infer_wavelength`, **no** por esta tabla — ver §3.2 y §5.)
- **Pasos para reproducir:** buscar referencias a `BAND_WAVELENGTH_UM` en `src/`, `tests/` y `static/`; no hay ninguna.
- **Comportamiento actual:** Tabla inerte; sin impacto funcional hoy.
- **Comportamiento esperado:** O bien usarse como fuente única de verdad de bandas, o eliminarse para evitar confusión científica (6 "bandas" que no existen en SPHEREx).
- **Causa raíz probable:** Residuo de un diseño anterior (tabla de bandas) sustituido por inferencia por WCS.
- **Recomendación:** Eliminar o reutilizar. Si se mantiene, corregir a los 4 canales reales de SPHEREx y documentar. Riesgo principal de **confusión científica** para quien mantenga el código.

#### QA-05 — Locks de descargas no atómicos (posible duplicación)
- **Severidad:** LOW
- **Etiqueta:** [análisis estático]
- **Archivo:** `src/temporal_search.py`
- **Líneas:** 21 (definición de `_LOCKS`), 71 (`with _LOCKS.setdefault(name, threading.Lock()):`)
- **Descripción precisa:** `_LOCKS.setdefault(name, threading.Lock())` **crea el `Lock` fuera del bloqueo** y no es atómico: dos hilos pueden evaluar `setdefault` a la vez, crear dos locks distintos y ambos avanzar, descargando el mismo target dos veces.
- **Evidencia:** patrón `dict.setdefault(key, threading.Lock())` sin una sección crítica previa (línea 71).
- **Pasos para reproducir:** lanzar N peticiones concurrentes para el mismo `name` (target) con caché vacía; observar la posibilidad de descargas/doble procesamiento.
- **Comportamiento actual:** Posible trabajo duplicado y consumo extra de red/CDN bajo concurrencia.
- **Comportamiento esperado:** Un único hilo por `name` a la vez (deduplicación).
- **Causa raíz probable:** Uso de `setdefault` con valor por defecto de construcción no protegido (el clásico *lock-creation race*).
- **Recomendación:** Proteger la creación del lock con un lock global (p. ej., `_LOCKS_GUARD`) o usar un registro de locks atómico; en `concurrent.futures`/`Lock` por clave con sección crítica inicial.

#### QA-07 — Caches no acotadas (memoria) y sin lock
- **Severidad:** INFO
- **Etiqueta:** [análisis estático]
- **Archivo:** `src/ai_detector.py`
- **Líneas:** 24 (`_XMATCH_CACHE`), 29–39 (`_crossmatch_cached`)
- **Descripción precisa:** `_XMATCH_CACHE` es un `dict` no acotado y se accede/scribe sin lock. Carrera benigna (overwrites idempotentes) pero crecimiento de memoria sin límite si el conjunto de queries es grande.
- **Comportamiento actual:** Memoria crece con el número de queries de crossmatch.
- **Comportamiento esperado:** Cache acotada (p. ej., `LRU`) y acceso coherente.
- **Recomendación:** Limitar tamaño (LRU/TTL) y, si se quiere consistencia estricta, proteger con lock.

#### QA-08 — "Caché vecina" puede devolver región ligeramente distinta
- **Severidad:** INFO
- **Etiqueta:** [análisis estático]
- **Archivo:** `src/irsa_client.py`
- **Líneas:** 490–496
- **Descripción precisa:** Fallback que reutiliza resultados de una región vecina: se filtra el resultado caché con radio `max(r_rad, radius) * 1.25` y luego los sources con `radius * 1.05`. Puede devolver datos de una **región ligeramente distinta** a la solicitada, sin que el cliente lo sepa.
- **Evidencia:**
  ```python
  # src/irsa_client.py:490-495 (fragmento)
  if float(np.hypot(dra_c, ddec_c)) <= max(r_rad, radius) * 1.25:
      ...
      if float(np.hypot(s_dra, s_ddec)) <= radius * 1.05:
          filtered.append(src)
  ```
- **Comportamiento actual:** Posible "aproximación espacial" no declarada al cliente.
- **Comportamiento esperado:** Que el cliente sepa si recibe el resultado exacto o una aproximación (campo en la respuesta o log).
- **Recomendación:** Marcar en la respuesta (`"approx": true` / `region_used`) y/o registrar en log; es un matiz de integridad de datos, no un fallo.

#### QA-09 — Ventanas de bandas moleculares solapadas (H₂O/CH₄)
- **Severidad:** INFO
- **Etiqueta:** [análisis estático]
- **Archivo:** `src/ai_detector.py`
- **Líneas:** 347–365 (H₂O línea 349: 2.6–3.3 µm; CH₄ línea 350: 3.2–3.6 µm; CO línea 351: 4.5–4.9 µm)
- **Descripción precisa:** Las ventanas de H₂O (2.6–3.3 µm) y CH₄ (3.2–3.6 µm) **se solapan** en 3.2–3.3 µm, por lo que una sola medición puede atribuirse a **ambas** moléculas.
- **Comportamiento actual:** Posible doble atribución molecular.
- **Comportamiento esperado:** Atribución inequívoca o aviso de solape.
- **Recomendación:** Documentar el solape; opcionalmente priorizar por amplitud/centro o marcar "ambiguo". Es una **caveat científica**, no un bug.

#### QA-10 — Diccionario de locks "in-flight" crece sin límite
- **Severidad:** INFO
- **Etiqueta:** [análisis estático]
- **Archivo:** `src/irsa_client.py`
- **Líneas:** 395 (definición), 514–516 (`setdefault`)
- **Descripción precisa:** `_CATALOG_INFLIGHT_LOCKS` se crea con `setdefault` y **nunca se limpia**: una entrada por cada catalog/target observado, crecimiento sin límite.
- **Comportamiento actual:** Memoria crece con la variedad de targets/cátalogs.
- **Comportamiento esperado:** Limpiar la entrada al finalizar la operación.
- **Recomendación:** `pop` del lock al terminar el bloque `with` (con cuidado de no eliminarlo si otro hilo espera; usar un lock de registro o TTL).

#### QA-11 — `prioritize_local_frames` traga excepciones en silencio
- **Severidad:** INFO
- **Etiqueta:** [análisis estático]
- **Archivo:** `src/irsa_client.py`
- **Líneas:** 979 (`try:` externo), 1022–1023 (`except Exception: pass`)
- **Descripción precisa:** El bloque interno `except Exception: pass` **silencia** cualquier fallo de `align_coadd_and_diff` (u otra operación de alineación/diferencia) y continúa con el grupo por defecto, sin log.
- **Comportamiento actual:** Un error real de alineación pasa desapercibido; se elige un frame "subóptimo" sin rastro.
- **Comportamiento esperado:** Registrar el fallo (aunque se degrade con elegancia) para poder diagnosticar.
- **Recomendación:** Reemplazar `pass` por `logger.debug/warning` con contexto; mantener el fallback pero dejando huella.

#### QA-12 — Tie-break de `rank_analysis_groups` (subtil, determinista)
- **Severidad:** INFO
- **Etiqueta:** [análisis estático]
- **Archivo:** `src/analysis.py`
- **Líneas:** 18–41 (orden en línea 41)
- **Descripción precisa:** `sorted(..., key=lambda g: (score(g), tuple(-i for i in g)), reverse=True)`. El desempate por `tuple(-i for i in g)` es **determinista** pero poco autoevidente; puede sorprender al leer.
- **Comportamiento actual:** Orden estable y reproducible.
- **Comportamiento esperado:** Misma salida (es solo claridad de criterio).
- **Recomendación:** Opcional: comentar el criterio de desempate para manteneribilidad. No es un error.

#### QA-13 — `crpix` no entero para `npix` par (convención correcta)
- **Severidad:** INFO
- **Etiqueta:** [análisis estático]
- **Archivo:** `src/pipeline.py`
- **Línea:** 67 (`crpix = [(npix+1)/2.0, ...]`)
- **Descripción precisa:** Con `npix=128` (par), `crpix = 64.5`. Esto es la **convención WCS correcta** para el centro de un arreglo de tamaño par (entre los píxeles 64 y 65).
- **Comportamiento actual:** `CRPIX = 64.5` (válido en WCS).
- **Comportamiento esperado:** Igual (es correcto).
- **Recomendación:** Ninguna funcional; si se prefiere enteros, `crpix = npix/2 + 1` es equivalente. **Cosmético.**

### 3.2 Verificado como NO bug (no re-investigar)

Estos ítems se investigaron con evidencia y **no constituyen errores**; se listan para que el agente de desarrollo no re-invierta:

1. **`_infer_wavelength` (rama espectral) — FUNCIONA.** `src/pipeline.py:94–122` (`spectral_wcs.pixel_to_world` en línea 104). Validado sobre FITS reales del proyecto: devuelve **2.28 µm / 3.80 µm**, canales SPHEREx correctos. La hipótesis anterior de "SkyCoord TypeError → código muerto" era **incorrecta** (el bug estaba en el guion de diagnóstico, no en el proyecto).
2. **`record["detector_band"]` en `temporal_search`** — los registros SIA **sí** establecen esa clave; no es un `KeyError`.
3. **Aritmética de paralaje (`ai_detector`)** — dimensionalmente correcta.
4. **Fórmula de ajuste de Planck** — forma correcta de `B_ν(λ,T)`.
5. **`neg_peaks` no ordenado** — solo estético, no afecta resultados.
6. **Alias `astropy.fits` de primer nivel** — fue retirado en `astropy 8.0.2`, **pero** el proyecto usa `from astropy.io import fits` en todo; **no es un bug del proyecto** (a lo sumo una nota INFO de mantener el import correcto).
7. **Ancho de la máscara `BAD_FLAG_MASK` (32-bit) — ADECUADA.** `src/pipeline.py:48` (`0xFFDFEF3F`) y aplicada en línea 157. **Validado sobre los 2004 FITS cacheados:** todos con `FLAGS` de **32-bit** (`BITPIX 32`, dtype `>i4`), ninguno con bits ≥32 (máx observado `0x10200005`). Por tanto la máscara cubre el ancho real de los datos actuales. **Riesgo latente** solo si SPHEREx/IRSA cambiara el ancho de `FLAGS` a 64-bit en una versión futura (ver §4).

---

## 4. Problemas potenciales

Situaciones sospechosas que necesitan investigación/validación adicional (no confirmadas como errores):

- **Ancho de `FLAGS` a futuro (relacionado con §3.2.7).** Hoy los 2004 FITS son 32-bit, por lo que `BAD_FLAG_MASK` (32-bit) es correcta. **Requiere validación** solo si NASA/IRSA publica en el futuro un `FLAGS` de 64-bit; en ese caso los bits ≥32 no se enmascararían. *Acción sugerida:* al detectar `BITPIX 64`, extender la máscara o emitir warning. (Hoy: **no es un bug**.)
- **Impacto real del fallback SSL (QA-04).** Es un tradeoff documentado para CAs de Windows. El riesgo MITM es real pero depende del entorno de despliegue. *Requiere validación* de en qué entornos se activa el fallback con frecuencia (medir con métricas/logs).
- **Uso del fallback "caché vecina" (QA-08).** Frecuencia y magnitud de la desviación regional. *Requiere validación* con datos de producción (qué % de respuestas usa el fallback y con qué desviación).
- **Crecimiento de memoria de los caches no acotados (QA-07, QA-10).** Depende del volumen/variación de targets. *Requiere validación* de carga real antes de decidir límites.

---

## 5. Problemas de integración

- **Contrato frontend ↔ backend (longitud de onda).** El frontend puede asumir que la longitud de onda proviene de una "banda"; en realidad se infiere por **WCS espectral** (`pipeline._infer_wavelength`, validado). La tabla `BAND_WAVELENGTH_UM` (QA-03) **no** alimenta ese camino. Riesgo: quien integre por "banda" obtendría valores distintos a los reales. *Acción:* documentar la fuente de verdad (WCS) y alinear/retirar la tabla.
- **Código muerto como fuente de verdad fantasma (QA-03).** `BAND_WAVELENGTH_UM` con 6 "bandas" SPHEREx inexistentes puede llevar a un desarrollador a "conectarla" al flujo, introduciendo valores científicos erróneos. Es el riesgo de integración más concreto de la lista.
- **Mensajes de error (QA-01).** El cliente/frontend no puede distinguir "fallo de IRSA" de "fallo local" porque ambos devuelven el mismo 502 con el mismo prefijo. Afecta al debug y a la UX de errores.
- **CORS (QA-02).** Si el frontend se sirve de un origen distinto al de la API, la combinación comodín+credenciales es la que permite esa integración hoy; al corregirla (ver §7) debe mantenerse compatible con el despliegue real.
- **Atribución de región (QA-08).** El cliente no recibe señal de si los datos son exactos o una "caché vecina"; integración que asume exactitud espacial podría verse afectada.
- **Coherencia de unidades/épocas.** No se detectó inconsistencia de unidades (µm consistentes) ni de épocas en los caminos auditados; los FITS cacheados conservan `manifest.json` con `ra/dec/fov/tap_query/frames[]`. *(Nota de auditoría científica: la inferencia por WCS y la máscara de FLAGS son consistentes con los datos reales.)*

---

## 6. Cobertura de testing

**Cubierto (98 tests, todos en verde):**
- WCS y transformaciones espaciales (inferencia de longitud de onda, `crpix/ctype`).
- Fotometría y diferencia de imágenes.
- Dipoles/monopolos (análisis de señal).
- Búsqueda temporal / `temporal_search`.
- Timeline.
- Integridad de caché y `manifest.json`.
- Errores de API (casos de error testeados con red mockeada).

**Gaps identificados (falta probar):**
- **CORS:** no hay test que verifique las cabeceras/combos (relacionado con QA-02).
- **Mensaje 502 genérico:** no se prueba el **contenido** ni la posible **fuga** del texto de la excepción (QA-01).
- **`prioritize_local_frames`:** no se prueba la ruta de "swallow" silencioso (QA-11).
- **Ancho de `FLAGS`:** no hay test para `FLAGS` de 64-bit (hoy no aplica, ver §3.2.7).
- **Caches no acotados (QA-07/QA-10):** no hay test de límite de memoria.
- **Fallback "caché vecina" (QA-08):** no se verifica el comportamiento de aproximación regional.
- **Integración en vivo:** solo se cubre con red mockeada (diseño correcto); falta CI opcional con red real.

---

## 7. Recomendaciones

Ordenadas por prioridad (qué corregir primero y por qué):

1. **QA-01 (MEDIUM) — primero.** Es el hallazgo de mayor impacto funcional/seguridad: mal clasifica errores y expone texto crudo (posibles rutas de sistema). Corrección baja en coste (separar excepciones + mensaje genérico) y mejora debug, seguridad y UX. Añadir test de contenido del 502.
2. **QA-04 (MEDIUM, seguridad) — segundo.** Riesgo MITM por `_create_unverified_context()` como fallback. Preferible pinning de certificado de `irsa.ipac.caltech.edu` o CA explícito; registrar uso del fallback.
3. **QA-03 (LOW) — tercero.** Retirar o corregir `BAND_WAVELENGTH_UM` (código muerto con valores científicos erróneos); riesgo de que un desarrollador la "conecte" al flujo (riesgo de integración).
4. **QA-02 (LOW) — cuarto.** Alinear CORS: `allow_credentials=False` (si no se usan credenciales) o lista blanca de orígenes.
5. **QA-05 (LOW) — quinto.** Hacer atómica la creación de locks por `name` para evitar descargas duplicadas.
6. **QA-11, QA-07, QA-10 (INFO) — sexto.** Dejar huella (logs) en el "swallow" silencioso; acotar/limpiar caches y locks in-flight.
7. **QA-08, QA-09 (INFO) — séptimo.** Documentar/señalar aproximación regional y solape de bandas (caveats científicos).
8. **QA-12, QA-13 (INFO) — octavo.** Comentarios/claridad (cosmético), sin cambio de comportamiento.
9. **CI/robustez — transversal:** añadir los tests de §6 (CORS, 502, FLAGS 64-bit, `prioritize_local_frames`) y considerar CI opcional con red real.

---

## 8. Conclusión

El proyecto está en **buen estado de salud**. Su punto más fuerte es la **suite de pruebas** (98/98 en verde, sintaxis válida en todo el stack, CI razonable). La **integridad científica de los datos** es correcta en los caminos auditados: la longitud de onda se infiere correctamente por WCS (validado sobre FITS reales), la aritmética de paralaje y el ajuste de Planck son correctos, y la máscara de `FLAGS` es adecuada para los datos actuales (validada sobre los 2004 FITS cacheados).

Los problemas reales son **moderados y acotados**: dos **MEDIUM** (gestión de excepciones con posible fuga de información —QA-01— y contexto SSL sin verificación como fallback —QA-04—) y tres **LOW** (CORS con credenciales, código muerto con valores erróneos, y una carrera de locks). El resto son observaciones de **mantenimiento y matices científicos (INFO)**. **No se encontró pérdida de datos, ni vulnerabilidad crítica, ni funcionalidad rota.**

La corrección recomendada (QA-01 y QA-04 primero, luego los LOW, luego los INFO) es de **bajo esfuerzo** y no requiere reescribir el proyecto. Tras aplicarlas y cerrar los gaps de cobertura de §6, el software quedará en un estado sólido y mantenable para el agente de desarrollo.

---

*Informe generado por auditoría de solo lectura (QA / análisis estático / pruebas). Sin modificaciones de código. Todas las referencias `archivo:línea` contrastadas contra el código real; resultados de ejecución diferenciados entre [reproducido] / [análisis estático] / [requiere validación].*
