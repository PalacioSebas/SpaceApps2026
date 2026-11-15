# Contenido portable del asistente

Este directorio contiene textos y recorridos para trasladar el perfil y el chat a otra versión del proyecto. Se puede copiar completo a otra rama. No importa el frontend actual ni necesita sus selectores HTML, sus endpoints o un framework determinado.

El material todavía **no está conectado al chat**. Prepararlo no cambia la página, los cálculos, las cachés ni el comportamiento de la versión que está en ejecución. La conexión se hará cuando conozcamos la base estable.

## Archivos

| Archivo | Contenido |
| --- | --- |
| [catalog.json](catalog.json) | Preguntas frecuentes, respuestas simples y técnicas, condiciones de uso, fuentes, acciones y alternativas. |
| [sources.json](sources.json) | Referencias oficiales, contratos del producto y fuentes que necesitan datos de cada consulta. |
| [demo-scenarios.json](demo-scenarios.json) | Tres recorridos con preparación, pasos, verificaciones y alternativas. |
| [validate.py](validate.py) | Verificación local de estructura y referencias, con la biblioteca estándar de Python. |
| [test_contract.py](test_contract.py) | Pruebas del contrato y del rechazo de contenido inválido, ejecutables sin la app. |
| [PRESENTACION.md](PRESENTACION.md) | Guion breve para ensayar o compartir con el equipo. |

Los JSON usan UTF-8 y `schema_version: 1`. No hay un motor de chat, credenciales, modelos, datos FITS ni observaciones de ejemplo en este paquete.

## Alcance

El MVP usa acceso demo y perfiles declarados, con explicaciones simples o técnicas. Los perfiles no restringen funciones; los ajustes manuales tienen prioridad. El asistente usa respuestas integradas y resultados suministrados por la app.

Las acciones del catálogo son intenciones, no instrucciones ejecutables. `open_explorer`, `open_detector` y `open_spectrum` representan navegación. `prepare_settings` solo prepara una propuesta revisable. Sus nombres no dependen del HTML ni de la API de esta rama. El integrador decide cómo conectarlos a su interfaz y omite los que todavía no estén disponibles.

`open_learning_3d` representa el acceso opcional al módulo educativo `static/learn-3d/`, que se traslada copiando esa carpeta completa. La entrada `brown_dwarf` ofrece una guía general incluso sin datos cargados. En el chat actual existe una respuesta equivalente en `static/demo-assistant.js`, con un enlace provisto por el anfitrión mediante `getLearning3DUrl`; el chat aún no lee estos JSON. Al integrar, omitir la acción si falta el visor y no usar una ilustración como evidencia del candidato seleccionado.

La entrada `young_star` conserva la guía de estrellas jóvenes y discos. Su acción `open_young_star_3d` debe apuntar al mismo módulo con `object=young-star`; `open_learning_3d` puede usar `object=brown-dwarf`. Es contenido educativo disponible sin campo o durante la carga. El adaptador decide la ruta real y conserva el estilo de explicación. La guía no diagnostica variaciones actuales de RW Aurigae.

No se incluyen comandos para ejecutar código, consultas científicas automáticas ni acciones de autenticación real.

## Datos y resultados

El contrato neutral está dentro de `catalog.json`, en `context_contract`. El adaptador de la base estable debe convertir sus propios datos a esos estados, sin modificar los resultados científicos.

| Estado | Valores | Regla de interpretación |
| --- | --- | --- |
| `field_state` | `unknown`, `none`, `loading`, `ready` | Una consulta pendiente no proporciona resultados actuales. |
| `comparison_state` | `unknown`, `unavailable`, `available` | Un dato ausente no equivale a una resta fallida ni a una resta válida. |
| `detection_state` | `unknown`, `none`, `present` | `none` exige un resultado real con cero candidatos. |
| `candidate_state` | `none`, `selected` | La selección debe pertenecer al resultado vigente. |
| `candidate_kind` | `unknown`, `motion`, `variability` | Es el patrón reportado por el detector, no la categoría celeste del objeto. |
| `photometry_state` | `unknown`, `loading`, `empty`, `ready` | Un resultado vacío es distinto de un flujo medido igual a cero. |

No hay que convertir `null`, campos ausentes o errores de red en ceros. Los resultados viejos se invalidan al cambiar el campo o la selección. Si la nueva versión no informa un diagnóstico, se conserva `unknown` y se usa la respuesta correspondiente.

Los valores cuantificados del catálogo son variables `{{nombre}}`. No hay cifras de brillo, señal, distancia o cantidad de candidatos precargadas. Por ejemplo, `field_summary` necesita `target_name` y `loaded_frame_count`; este último representa los recortes realmente recibidos, no el límite solicitado.

Para `photometry_ready` se necesitan `measurement_count` y `measurement_unit`. Las unidades se toman de la medición: no se supone que una API distinta devuelve MJy/sr. Los valores individuales, incertidumbres, bandas y fechas se muestran desde el resultado real de la app; este catálogo no los inventa ni los calcula.

El banco no fija un umbral de detección ni asegura que se haya aplicado un método concreto de igualación de PSF, calibración o fotometría. Esas afirmaciones deben comprobarse contra la base estable antes de incorporarse a una respuesta contextual.

## Selección de respuestas

1. Reconocer el tema o una pregunta equivalente. `questions` ofrece ejemplos de lenguaje y no exige copiar un clasificador específico.
2. Para preguntas sobre resultados, resolver primero los estados sin campo, carga pendiente o dato desconocido. Las guías generales siguen disponibles durante una carga.
3. Filtrar las respuestas cuyas condiciones `when` coincidan con el contexto actual. Las listas de cada condición significan «uno de estos valores»; las condiciones entre sí significan «todas».
4. Comprobar `requires`. Un valor ausente, vacío o no finito no se reemplaza; cero es un valor válido cuando su campo lo admite.
5. Entre variantes compatibles del mismo tema o pregunta, preferir la mayor `priority` y luego la condición más específica. Si queda una ambigüedad real, pedir una aclaración.
6. Si faltan valores de una variante, revisar `fallback_ids` respetando también sus condiciones. Si ninguna aplica, aclarar qué falta o usar una guía general; no forzar una respuesta cuyo estado contradiga los datos.
7. Elegir `answers.simple` o `answers.technical` según la preferencia declarada. El estilo es independiente del nivel del perfil.
8. Reemplazar las variables mediante texto escapado o `textContent`, sin interpretar respuestas o datos como HTML.
9. Filtrar `follow_up_ids` por disponibilidad y condiciones. Que una respuesta recomiende un tema no significa que ya existan los datos necesarios para mostrarlo.

Una misma pregunta puede aparecer en varias entradas porque su respuesta depende del estado. Por ejemplo, «¿Por qué no hay detecciones?» puede llevar a `comparison_unknown`, `comparison_unavailable_reason`, `comparison_unavailable` o `no_candidates`. No se elige por el primer texto que coincida.

La continuidad de una pregunta como «¿Y cómo lo compruebo?» depende del último tema y del contexto actual. En un tema de candidato usa `verify_candidate`; en uno de comparación, `verify_comparison`. Una pregunta sin tema previo debe pedir una aclaración. La memoria se descarta al iniciar charla, cambiar de cuenta o cambiar de campo.

## Fuentes

Se separan tres clases:

- `official_reference`: documentación externa cuyo alcance está descrito en `supports` y `does_not_support`. Una guía de NASA o IRSA no valida el resultado de un candidato concreto.
- `product_contract`: comportamiento acordado del MVP, documentado aquí y pendiente de confirmación al integrar. Es una guía de producto, no una autoridad científica externa.
- `context_snapshot`: datos de la consulta actual. Si faltan sus campos, no se presenta una tarjeta vacía como evidencia; se omite o se explica la ausencia. Se conservan los datos usados al responder para que el historial no cambie al seleccionar otro campo.

Las referencias oficiales se revisaron el 14 de noviembre de 2026: [misión SPHEREx de NASA](https://science.nasa.gov/mission/spherex/), [archivo IRSA](https://irsa.ipac.caltech.edu/Missions/spherex.html), [introducción a las imágenes espectrales](https://caltech-ipac.github.io/irsa-tutorials/spherex-intro/) y [modelos ePSF](https://caltech-ipac.github.io/irsa-tutorials/spherex-psf/). La revisión es del material documental, no una certificación del procesamiento de esta app.

## Recorridos de presentación

1. **Primera exploración:** orientarse, entender el perfil y revisar una propuesta que conserve cambios manuales.
2. **Comparación no disponible:** explicar el diagnóstico real y distinguirlo de una comparación válida sin candidatos.
3. **Revisión de un candidato:** interpretar una selección real, revisar su evidencia y mantener explícitos los límites de la conclusión.

La preparación y las alternativas están en `demo-scenarios.json`; el guion legible está en [PRESENTACION.md](PRESENTACION.md). Los recorridos no obligan a que el backend devuelva un resultado predeterminado.

## Traslado a la versión estable

Copiar esta carpeta completa es suficiente para conservar el contenido. Después se necesita un adaptador que lea los estados de esa versión, resuelva las respuestas y conecte las acciones disponibles. No hace falta copiar `static/app.js`, modificar el pipeline científico ni mergear toda nuestra rama para reutilizar los textos.

Antes de conectarlo, revisar con el compañero qué resultados informa el detector, qué mediciones produce, cómo expresa las unidades y qué controles admite. Las rutas y nombres de botones del guion describen funciones y pueden adaptarse.

## Verificación local

```bash
python content/assistant/validate.py
python -m unittest discover -s content/assistant -p test_contract.py -v
```

El comando verifica JSON, IDs, referencias, condiciones, variables y recorridos. También comprueba las alternativas de las respuestas. No hace solicitudes de red, no importa la aplicación y no escribe en sus cachés. No sustituye la revisión del contenido ni las pruebas del futuro adaptador.

Las 15 pruebas de `test_contract.py` comprueban las condiciones declaradas para campos pendientes, comparaciones desconocidas o no disponibles, ausencia de candidatos, selección y fotometría. Verifican que los contadores permitan cero sin asignarlo por defecto y que las respuestas cuantificadas exijan sus valores y unidades. Además, alteran copias en memoria para comprobar que el validador rechace IDs duplicados, fuentes rotas, condiciones inválidas, variables sin requisitos, ciclos de alternativas y acciones fuera del alcance o sin clic explícito.

Estas pruebas viajan con la carpeta y también se incluyen en la suite habitual mediante `tests/test_assistant_content.py`. No ejecutan el chat ni prueban cómo un adaptador futuro transforma datos: la prioridad de ajustes manuales, la invalidación de selecciones viejas, la interpolación segura y el tratamiento de valores ausentes deben comprobarse al conectar esa base. Las pruebas del chat actual siguen en `scripts/check_assistant.cjs`.
