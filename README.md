# 🌌 Papastronomy · SPHEREx & Planet X Discovery Platform
**NASA Space Apps Challenge 2026 · Challenge: "Planet X and SPHEREx" (Nivel Avanzado)**  
**Equipo:** Papastronomy (3 integrantes TUIA - Inteligencia Artificial + 3 integrantes Ingeniería en Sistemas)

---

## 1. Resumen Ejecutivo (Pitch para el Jurado de la NASA)
El telescopio espacial **SPHEREx** de la NASA cartografía la totalidad del cielo cada 6 meses en **102 bandas espectrales infrarrojas** ($0.75\ \mu\text{m}$ a $5.00\ \mu\text{m}$) mediante Filtros Lineales Variables (LVF). Entre más de mil millones de fuentes, los objetos cercanos (enanas marrones ultra-frías como **WISE 0855**, estrellas con alto movimiento propio como **Barnard's Star**, objetos transneptunianos o un hipotético **Planeta X**) cambian de posición entre épocas, mientras que las estrellas variables (**RW Aurigae**, **R Draconis**) experimentan cambios drásticos de flujo infrarrojo.

**Papastronomy SPHEREx Explorer** es una plataforma web pública de código abierto que permite a científicos y ciudadanos explorar cualquier coordenada celeste `(RA, Dec, FoV)`, visualizar secuencias temporales alineadas geométricamente (*Blink Comparator*), restar épocas para cancelar las estrellas estáticas, detectar automáticamente dipolos en movimiento y monopolos variables con Inteligencia Artificial, cruzar fuentes en vivo con **Gaia DR3** y **AllWISE**, y extraer con un solo clic el espectro infrarrojo completo de 102 bandas junto con su diagnóstico químico molecular ($\text{H}_2\text{O}$, $\text{CH}_4$, $\text{CO}$).

---

## 2. Cumplimiento del Checklist Oficial (Core + Extra Kudos + IA)

| Requisito / Kudo | Estado | Implementación Técnica en el Proyecto |
| :--- | :---: | :--- |
| **[CORE] Búsqueda por Coordenadas y FoV** | ✅ | Entrada interactiva de Ascensión Recta (`RA`), Declinación (`Dec`) y `FoV` en grados decimales. |
| **[CORE] Reproductor Temporal (Flipbook)** | ✅ | Visor HTML5 Canvas con controles Play/Pause, selector de velocidad (1 a 6 FPS) y deslizador por época. |
| **[CORE] 5 Objetos de Prueba Obligatorios** | ✅ | Botones de carga instantánea (`<0.1s`) para **WISE 0855**, **Barnard's Star**, **Epsilon Indi B**, **RW Aurigae** y **R Draconis**. |
| **[EXTRA KUDO] Alineación WCS y Resta ($\Delta I$)** | ✅ | Reproyección inter-época mediante `reproject.reproject_interp` y sustracción $\Delta I = I_{\text{tardía}} - I_{\text{temprana}}$. |
| **[EXTRA KUDO] Suma Profunda SNR (Coaddition)** | ✅ | Apilado promedio libre de NaNs de todas las exposiciones y los 6 detectores para revelar fuentes débiles. |
| **[EXTRA KUDO] Espectro 102 Bandas On-The-Fly** | ✅ | Fotometría de apertura al hacer clic + consulta a extensión `WCS-WAVE` (`key='W'`) de $0.75$ a $5.00\ \mu\text{m}$. |
| **[EXTRA KUDO] Catálogos Gaia DR3 y AllWISE** | ✅ | Integración sincronizada de **Aladin Lite v3** con capas conmutables de **Gaia DR3** y **AllWISE**. |
| **[EXTRA KUDO] Banderas de Contaminación (`FLAGS`)** | ✅ | Limpieza automática con mediana local + superposición visual en el visor de rayos cósmicos y saturación. |
| **[EXTRA KUDO] URL Parametrizada Embebible** | ✅ | Sincronización bidireccional de `?ra=...&dec=...&fov=...` lista para compartir hallazgos o incrustar vía `<iframe>`. |
| **[DIFERENCIAL TUIA] Detector IA Dipolos/Variables** | ✅ | Detección $>4\sigma$ (`photutils` + `scipy.spatial.distance.cdist`) que separa `MOVING_DIPOLE` de `VARIABLE_MONOPOLE`. |
| **[DIFERENCIAL TUIA] Asistente Molecular IA** | ✅ | Inferencia astrofísica automática evaluando bandas de absorción de $\text{H}_2\text{O}$, $\text{CH}_4$ y $\text{CO}$. |

---

## 🔬 Arquitectura Técnica

El sistema sigue una arquitectura **FastAPI backend → AstroML pipeline → AI detection → Frontend** con caché FITS local para reproducibilidad offline:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                FRONTEND (static/)                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────────┐  │
│  │ index.html   │───▶│ app.js       │───▶│ Aladin Lite v3 + Flipbook    │  │
│  └──────────────┘    └──────────────┘    └──────────────────────────────┘  │
│         ▲                        ▲                       ▲                 │
│         │                        │                       │                 │
│         │                        │                       │                 │
└─────────┼────────────────────────┼────────────────────────┼─────────────────┘
          │                        │                        │
    HTTP / API REST           Carga FITS              Renderizado
    (FastAPI)                Cache Local             Canvas + Plotly
          │                        │                       │
          ▼                        ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND (src/)                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐   │
│  │ main.py     │  │ irsa_client │  │ pipeline.py │  │ ai_detector.py   │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └──────────────────┘   │
│         │                │                │               │                 │
│         ▼                ▼                ▼               ▼                 │
│  Rutas API    Consulta      Reproyección  Detección       Clasificación   │
│              IRSA TAP      WCS          AI (4σ)     Molecular           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │
                            data/cache/ (FITS FITS)
                            ├── wise_0855/ (14 épocas)
                            ├── barnards_star/
                            ├── epsilon_indi_b/
                            ├── rw_aurigae/
                            └── r_draconis/
```

### Flujo de Ejecución Completo:

1. **Inicio:** El backend carga 8 epochs desde `data/cache/{target}/` y construye una grilla WCS común con `build_common_target_wcs()`.
2. **Exploración del cielo:** El usuario selecciona coordenadas `(RA, Dec)` o presiona un botón de objetivo predefinido.
3. **Carga de datos:** El sistema carga archivos FITS correspondientes desde la caché local o consulta IRSA TAP en vivo si es necesario.
4. **Procesamiento científico:**
   - Limpieza con máscaras FLAGS y NaNs
   - Reproyección a grilla común (0.05° FoV)
   - Coaddition y diferencia temporal ($\Delta I$)
5. **Detección AI:** Identificación de anomalías $>4\sigma$ usando `photutils.detection.find_peaks` con masking de ruido cósmico.
6. **Cruces de catálogos:** Para cada detección, consulta a Gaia DR3 y AllWISE para obtener identificaciones astrométricas.
7. **Visualización:** Renderizado de imágenes en base64 y espectros con Plotly.js superpuestos sobre Aladin Lite.

---

## ⚠️ Notas Importantes

### Directorio `src fake/` - Código Duplicado con Mejoras Parciales

**Estado actual:** El proyecto contiene dos directorios de código fuente:
- **`src/`**: Versión principal (producción) utilizada por `main.py`
- **`src fake/`**: Versión experimental con mejoras de robustez pero **NO UTILIZADA POR EL SISTEMA ACTUAL**

**Diferencias críticas identificadas:**
| Archivo | src/config.py | src fake/config.py | Impacto |
|---------|---------------|---------------------|---------|
| `DEFAULT_CUTOUT_PIXELS` | 128 píxeles | 96 píxeles | **ERROR**: ~25% menos de detalle espacial en cutouts |
| `ARCSEC_PER_PIXEL` | No definido | Definido = 3.6 arcsec/pixel | Compatible (derivación automática posible) |

**Mejoras en src fake/ai_detector.py:**
- ✅ Aplica máscara de 6 píxeles en bordes para evitar artefactos de reproyección
- ❌ Perde funcionalidad de cruces con catálogos externos

**Recomendación:** Consultar informe `informes/AUDITORIA.md` para detalles completos sobre diferencias. El directorio duplicado puede causar confusión y bugs silenciosos si se importan de ambas rutas.

---

## 🌐 Fuentes de Datos Externas

El sistema consulta las siguientes APIs astronómicas públicas:

| Servicio | URL | Uso en el Proyecto |
|----------|-----|-------------------|
| **NASA/IPAC IRSA TAP** | https://irsa.ipac.caltech.edu/TAP | Consulta ADQL para cutouts SPHEREx (offline si no hay cache) |
| **CDS VizieR HiPSCat** | https://hips.cds.unistra.fr/HiPSCatService/I/355/gaiadr3 | Cruces astrométricos con Gaia DR3 |
| **CDS AllWISE** | https://hips.cds.unistra.fr/HiPSCatService/II/328/allwise | Cruces fotométricos con WISE |

**Nota:** Todas las APIs son públicas y no requieren autenticación. El sistema funciona offline completamente si `data/cache/` está pre-cargado.

---

## 🛠️ Depuración y Troubleshooting

### Problemas Comunes y Soluciones:

#### 1. "No se encontraron archivos FITS para las coordenadas"
**Causa:** Cache local no cargada o archivo corrupto  
**Solución:** Ejecutar `run_project.sh` que llama a `setup_cache_and_inspect.py` para descargar archivos IRSA en vivo.

```bash
# Verificar qué objetivos tienen cache
python setup_cache_and_inspect.py --list-cached-targets

# Forzar recarga de cache completo
python setup_cache_and_inspect.py --force-refresh
```

#### 2. "Consulta TAP a IRSA falló"
**Causa:** Servicio IRSA temporalmente indisponible  
**Solución:** El sistema usa automáticamente fallback a cache local. Verificar logs para confirmación:
```bash
# Buscar mensajes en console:
python -c "from src.irsa_client import obtain_fits_for_coordinates; print(obtain_fits_for_coordinates(133.79, -7.24))"

# Si falla completamente, el sistema usará generación sintética (SYNTHETIC_FALLBACK)
```

#### 3. Imágenes no se renderizan en frontend
**Causa:** Base64 strings demasiado grandes o corruptos  
**Solución:** Verificar que `matrix_to_base64_png()` convierta correctamente la matriz NumPy a string codificado. Ajustar compresión con Pillow si es necesario.

#### 4. Detección AI no encuentra anomalías
**Causa:** Umbral sigma muy conservador o datos de cache corruptos  
**Solución:** Verificar logs de `ai_detector.py` para ver valores MAD calculados y umbral aplicado. Ajustar `threshold_sigma` en config si es necesario (actual: 4.0).

---

## 📊 Métricas de Rendimiento Actual

| Métrica | Valor | Observación |
|---------|-------|-------------|
| Tiempo de inicialización (cache) | ~10-30 segundos | Depende de tamaño de cache local |
| Tiempo por llamada API `/api/explore` | ~10-15 segundos | Incluye reproyección 8 épocas (~6.4s) + AI detection (~2s) |
| Throughput del servidor API | ~4-6 req/min | Puede mejorar con caching de reproyecciones WCS |
| Umbral de detección AI | 4σ (MAD) | Conservador para evitar falsos positivos |
| Tamaño de cutouts FITS | 128x128 píxeles | Resoluciones altas (~3.6 arcsec/pixel) |

**Oportunidades de mejora:** Implementación de caching inteligente para reproyecciones WCS podría reducir tiempos a ~5-8 segundos (45% más rápido). Ver `informes/PLAN_MEJORAS.md` para detalles técnicos.

---

## 📁 Estructura del Proyecto

```
Nasa/
├── src/                          # Backend principal (FastAPI)
│   ├── __init__.py
│   ├── config.py                 # Configuración de corteouts y objetivos obligatorios
│   ├── irsa_client.py            # Cliente TAP IRSA + fallback a cache local
│   ├── pipeline.py               # Reproyección WCS, coaddition, differencing
│   ├── ai_detector.py            # Detección de anomalías >4σ + clasificación molecular
│   └── schemas.py                # Pydantic models para respuestas API
│
├── data/
│   └── cache/                    # Archivos FITS de corteouts SPHEREx
│       ├── wise_0855/            # 14 épocas + manifest.json
│       ├── barnards_star/
│       ├── epsilon_indi_b/
│       ├── rw_aurigae/
│       └── r_draconis/
│
├── static/                       # Frontend (HTML/CSS/JS)
│   ├── index.html               # Página principal con Aladin Lite
│   ├── app.js                   # Lógica frontend + visualización Canvas
│   ├── styles.css               # Estilos TailwindCDN
│   └── logo.png                 # Logo del proyecto
│
├── informes/                     # 🔵 REPORTES DE AUDITORÍA (NUEVO)
│   ├── AUDITORIA.md             # Inventario completo, arquitectura, diagnóstico
│   ├── PLAN_MEJORAS.md          # Mejoras priorizadas con soluciones
│   ├── CAMBIOS_REALIZADOS.md    # Registro de cambios implementados
│   └── RESULTADOS_VALIDACION.md # Pruebas ejecutadas y métricas
│
├── .gitignore                    # Patrones ignorados por Git (repositorio no inicializado)
├── .env.example                  # ⭐ NUEVO: Configuración externa segura
├── requirements.txt              # ⭐ ACTUALIZADO con versionado explícito
├── setup_cache_and_inspect.py   # Script de carga automática de cache IRSA
├── run_project.sh               # Script de inicio automático (Linux/macOS)
├── run_project.bat               # Script de inicio automático (Windows)
├── README.md                     # Documentación principal del proyecto
├── plan_maestro.pdf              # Plan estratégico del equipo Papastronomy
├── recursos.pdf                  # Recursos adicionales para la investigación
└── contexto_maestro_para_ia_local_spherex.md  # Contexto técnico para IA local
```

---

## 🚀 Instalación y Ejecución

### Requisitos del Sistema

| Componente | Versión Mínima | Recomendado |
|------------|---------------|-------------|
| Python | 3.10 | 3.12 |
| RAM | 8 GB | 16 GB |
| Discospace | 10 GB (cache) | 50 GB (para experimentación offline) |
| GPU | No requerido (CPU-only) | GTX 1650+ opcional para aceleración CUDA |

### Pasos de Instalación

```bash
# 1. Activar entorno virtual
python -m venv .venv
source .venv/bin/activate  # Linux/macOS
.venv\Scripts\activate.bat  # Windows

# 2. Instalar dependencias con versionado explícito
pip install -r requirements.txt

# 3. Crear backup de configuración original (si existe .env)
cp .env .env.backup

# 4. Ejecutar carga automática de cache IRSA (primera vez)
python setup_cache_and_inspect.py --list-cached-targets

# 5. Iniciar servidor FastAPI
python -m uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

### Acceso al Frontend

Una vez ejecutado el backend, abrir en navegador:
```
http://localhost:8000
```

El frontend renderiza automáticamente con datos de cache local (offline capability).

---

## 🔐 Consideraciones de Seguridad

### No hay credenciales expuestas en el código

- ✅ Todas las consultas a IRSA TAP usan endpoint público sin autenticación
- ✅ Cruces con Gaia/AllWISE vía CDS VizieR son públicos
- ⚠️ **NO almacenar .env con datos reales en repositorios Git públicos**

### Uso seguro de datos externos

```python
# src/irsa_client.py - Consultas seguras sin exponer tokens
def query_spherex_tap(ra_deg: float, dec_deg: float) -> Table:
    service = pyvo.dal.TAPService(IRSA_TAP_URL)  # URL pública oficial NASA
    return service.search(f"SELECT ... FROM SPHEREx WHERE ra BETWEEN ... AND ...")

# Nunca exponer credenciales en logs o excepciones
logger.info("Consulta exitosa", extra={"query_id": query_id})  # No incluir datos sensibles
```

---

## 📈 Mejoras Pendientes y Futuras Iteraciones

### Inmediato (Requiere Autorización)

1. **Centralizar `max_epochs` en config.py** ([P2-001](informes/PLAN_MEJORAS.md))
   - Actualizar endpoints para usar constante centralizada en lugar de hardcoded `max_epochs=10`
   - Beneficio: Consistencia y facilidad para cambiar configuración global

2. **Corregir tipografía** ([P3-001](informes/PLAN_MEJORAS.md))
   - Corregir comentario `construy6` → `construyó` en línea 225 de [src/main.py](file:///C:/Users/Sebas/OneDrive/Desktop/Nasa/src/main.py)

3. **Inicializar Git repository** (si no está activo)
   - Para versionado y rollback seguro de cambios

### Futuro (Mejoras a Largo Plazo)

1. **Suite de pruebas automatizadas**: Crear estructura `tests/pytest/` con fixtures para FITS mocks
2. **CI/CD con GitHub Actions**: Ejecutar tests automáticos en push/pull requests
3. **Optimización GPU opcional**: Usar CUDA para reproyección acelerada si hay hardware disponible
4. **Documentación ampliada**: Diagramas de flujo, casos límite documentados, troubleshooting avanzado

### Futuro (Mejoras a Largo Plazo)

1. **Suite de pruebas automatizadas**: Crear estructura `tests/pytest/` con fixtures para FITS mocks
2. **CI/CD con GitHub Actions**: Ejecutar tests automáticos en push/pull requests
3. **Optimización GPU opcional**: Usar CUDA para reproyección acelerada si hay hardware disponible
4. **Documentación ampliada**: Diagramas de flujo, casos límite documentados, troubleshooting avanzado

---

## ⚠️ Casos Límite y Comportamiento Esperado

### /api/spectrum sin cobertura espectral disponible
**HTTP 502 Bad Gateway** - Esto ocurre cuando:
- Las coordenadas no tienen datos SPHEREx en caché IRSA (único caso raro)
- El archivo FITS tiene WCS espectral inválido para esa posición
- **Solución:** Verificar que la coordenada esté dentro del campo de visión del detector

### /api/explore con WCS inválido  
**HTTP 503 Service Unavailable** - Esto ocurre cuando:
- Las coordenadas están fuera del rango válido del archivo FITS (bordes)
- El FoV es demasiado pequeño (<0.005°) o demasiado grande (>1.0°)
- **Solución:** Asegurar que `0.005 < fov <= 1.0` en la consulta

### IRSA temporalmente indisponible
**HTTP 502 con mensaje de log:** "Error comunicando con NASA/IPAC IRSA"  
Esto es esperado cuando:
- Los servidores de IRSA están bajo mantenimiento (horarios no especificados)
- Hay problemas de conectividad a Internet
- **Solución:** Esperar y reintentar, o usar caché local si está pre-cargado

### CRITICAL: TypeError en /api/spectrum (YA CORREGIDO v2.0)
En versiones anteriores (<v2.0), este endpoint caía con `TypeError` cuando no había cobertura espectral. Esta versión incluye validación explícita que devuelve HTTP 503 con mensaje claro.

---

## 📚 Créditos y Agradecimientos

**Equipo Papastronomy:** 3 integrantes TUIA especializados en Inteligencia Artificial y 3 en Ingeniería de Sistemas  
**NASA Space Apps Challenge 2026:** Programa de hackathon global organizado por la NASA  
**Misión SPHEREx:** Telescopio espacial infrarrojo que cartografiará todo el cielo desde 2025-2027  
**IRSA (IPAC):** Centro de datos e información astronómica de Caltech, proveedor oficial de cutouts SPHEREx  
**CDS (Centre de Données astronomiques de Strasbourg):** Proveedor oficial de cruces con Gaia DR3 y AllWISE  

---

## 📄 Licencia

Este proyecto se distribuye bajo la licencia Apache 2.0 para investigación académica y educación.

*Nota: Los datos astronómicos SPHEREx están sujetos a derechos de propiedad intelectual de la NASA.*
