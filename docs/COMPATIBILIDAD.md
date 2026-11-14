# Compatibilidad de arranque y Python · 2026-11-05

> Registro histórico de la validación del 5 de noviembre. Desde el 14 de noviembre se retiraron Pandas, Matplotlib, scikit-image y Astroquery del conjunto directo; las versiones vigentes están en [requirements.txt](../requirements.txt) y las nuevas mediciones en [OPTIMIZACION.md](OPTIMIZACION.md). Las cifras y tablas siguientes describen la revisión original.

## Alcance antes del merge

Se recomienda CPython 3.12 y se admite el rango 3.10–3.14. No hace falta usar la misma versión menor en todo el equipo. Python 3.9 o anterior queda fuera del soporte: el backend original ya utilizaba anotaciones que requieren 3.10.

El problema no estaba solo en el `.bat`: NumPy 2.5.4, SciPy 1.18.1 y Photutils 3.1.1 exigen Python 3.12 o posterior. El archivo original, pensado para 3.14, impedía instalar en versiones anteriores aunque el código pudiera ejecutarse allí.

`requirements.txt` conserva los paquetes existentes en Python 3.12–3.14. Para Python 3.10–3.11 usa marcadores de versión de pip y estas alternativas fijadas:

| Biblioteca | Python 3.10–3.11 | Python 3.12–3.14 |
| --- | --- | --- |
| NumPy | 2.2.6 | 2.5.4 |
| SciPy | 1.15.3 | 1.18.1 |
| pandas | 2.3.3 | 3.1.0 |
| Astropy | 6.1.7 | 8.0.2 |
| Reproject | 0.14.1 | 0.21.0 |
| Photutils | 2.0.2 | 3.1.1 |
| scikit-image | 0.25.2 | 0.26.0 |
| Matplotlib | 3.10.8 | 3.11.2 |
| Pillow | 11.3.0 | 13.0.0 |

FastAPI, Uvicorn, Pydantic, PyVO y Astroquery mantienen sus versiones fijadas actuales. Las dependencias transitivas siguen siendo resueltas por pip según Python y plataforma; no se trata de un lock completo con hashes.

Se consultaron los metadatos oficiales de PyPI y la [especificación de marcadores de dependencias](https://packaging.python.org/en/latest/specifications/dependency-specifiers/). Ejemplos de paquetes del conjunto anterior: [NumPy 2.2.6](https://pypi.org/project/numpy/2.2.6/), [Astropy 6.1.7](https://pypi.org/project/astropy/6.1.7/), [Reproject 0.14.1](https://pypi.org/project/reproject/0.14.1/) y [Photutils 2.0.2](https://pypi.org/project/photutils/2.0.2/).

## Lanzadores

`run_project.bat` y `run_project.sh` delegan en `start_project.py`, que solo importa la biblioteca estándar antes de preparar dependencias.

- Si existe un `.venv` compatible, se conserva su intérprete.
- Si no hay entorno, se busca un Python instalado, priorizando 3.12. Windows admite tanto el launcher `py` como `python` en PATH.
- `PAPASTRONOMY_PYTHON` permite indicar un ejecutable explícito. Si la carpeta elegida ya contiene un entorno, su intérprete se conserva; para usar otro hay que elegir una carpeta nueva con `--venv`.
- Una carpeta de entorno de otro sistema operativo, dañada o incompatible se rechaza sin borrarla ni reconstruirla automáticamente.
- Las instalaciones se realizan mediante el Python del entorno, nunca mediante un `pip` global.
- No se actualiza pip automáticamente ni se ejecuta el precargador de FITS al iniciar.
- Windows deshabilita las instalaciones automáticas de runtimes del gestor Python solo dentro del script. No modifica la configuración global.
- Se preservan los códigos de salida y se detiene el arranque si falla la instalación.
- `.gitattributes` fija LF para Bash y CRLF para Batch, y trata FITS como binarios.

Opciones comunes: `--check`, `--setup-only`, `--test`, `--no-install` y `--venv carpeta`. Los argumentos adicionales, como `--port 8001`, se pasan a Uvicorn. Los entornos `.venv-*` están ignorados por Git.

## Validación realizada

| Sistema | Python | Instalación | Pruebas | Arranque por `.sh`, página y API |
| --- | --- | --- | --- | --- |
| Linux x64 | 3.10.22 | Correcta, entorno temporal nuevo | 72 aprobadas | HTTP 200; diez FITS procesados |
| Linux x64 | 3.11.18 | Correcta, entorno temporal nuevo | 72 aprobadas | HTTP 200; diez FITS procesados |
| Linux x64 | 3.12.3 | Se conservó el entorno existente | 72 aprobadas | HTTP 200; diez FITS procesados |
| Linux x64 | 3.14.10 | Correcta, entorno temporal nuevo | 72 aprobadas | HTTP 200; diez FITS procesados |

Los runtimes de prueba y los entornos temporales se usaron sin reemplazar el Python del sistema. Las pruebas incluyen rutas con espacios, invocación desde otra carpeta, preservación de un entorno ajeno, propagación de errores y rechazo antes de instalar en Python no soportado.

Para **Windows x64** se resolvió el conjunto de dependencias de Python 3.10, 3.11, 3.12 y 3.14 con uv, exigiendo wheels para NumPy, SciPy, pandas, Astropy, Reproject, Photutils, scikit-image, Matplotlib y Pillow. No se ejecutó código Windows en Linux: esto comprueba la resolución y las bibliotecas principales, no sustituye el arranque nativo ni certifica otros componentes o arquitecturas.

El workflow [.github/workflows/compatibility.yml](../.github/workflows/compatibility.yml) prepara y ejecuta las pruebas usando el `.bat` real en Windows y el `.sh` real en Linux, para Python 3.10, 3.11, 3.12, 3.13 y 3.14. Python 3.13 está previsto en esa matriz, pero no se ejecutó localmente. El workflow todavía no fue ejecutado en GitHub durante esta revisión: **antes de mergear se deben revisar sus resultados, especialmente los de Windows**.

Mientras tanto, un integrante con Windows puede ejecutar:

```bat
run_project.bat --check
run_project.bat --test
```

En Linux, los equivalentes son `bash run_project.sh --check` y `bash run_project.sh --test`. Si ya están instaladas las dependencias de desarrollo, se puede añadir `--no-install` a la prueba.
