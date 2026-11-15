# Contexto y continuidad del MVP

Actualizado el **14 de noviembre de 2026**. Este documento conserva las decisiones del trabajo con Codex para continuar desde otra PC. Las referencias de Git y las verificaciones describen esa fecha: comprobar el estado real antes de actuar.

## Objetivo acordado con el usuario

Otro integrante está preparando una versión más estable del proyecto. **Su versión será la base de la integración futura**. De esta rama queremos conservar el acceso demo, los perfiles, el chat y el contenido portable del asistente. No se pretende mergear todos nuestros cambios a `main`.

Decisiones vigentes:

- El acceso es de demostración, con cuentas seleccionables y perfiles locales. El usuario descartó implementar autenticación real para este MVP.
- El perfil aplica valores iniciales; no bloquea funciones ni controles. Los ajustes manuales del usuario tienen prioridad y se pueden modificar después.
- El asistente usa respuestas integradas y reglas locales. No se implementará por ahora un LLM externo, RAG, claves de IA ni entrenamiento de modelos.
- El chat ocupa una sección propia, separada del explorador. Conserva una breve animación de preparación y la indicación de que usa respuestas integradas.
- «Aprendé en 3D» incluye una enana marrón y una estrella joven con disco de polvo, ambas educativas y genéricas. El módulo portable está en `static/learn-3d/`; debe conservarse al integrar. El usuario decidió postergar las pruebas móviles y priorizar escritorio.
- Se debe conservar la ejecución en Windows y Linux. Se recomienda Python 3.12; los lanzadores admiten 3.10–3.14. No introducir dependencias o comandos exclusivos de una plataforma sin revisar sus equivalentes.

Las instrucciones posteriores del usuario pueden cambiar estas decisiones. Ante dudas sobre la integración, primero inspeccionar la versión del compañero y el estado del repositorio.

## Estado de Git al preparar el traspaso

Repositorio: `https://github.com/PalacioSebas/SpaceApps2026`.

- Rama de respaldo y trabajo: **`feature/user-friendly`**, publicada en `origin/feature/user-friendly`.
- `06b2c48`: acceso demo, perfiles, asistente contextual y otras correcciones del frontend y procesamiento. Es un commit mixto: **no trasladarlo entero a la versión estable sin revisar su contenido**.
- `95493d4`: biblioteca portable y recorridos del MVP, aislados en `content/assistant/`. Este material se puede trasladar independientemente del frontend.
- En la última comprobación, `main` local y remoto apuntaban a `a8e4e3ef14e724c4092f8d354038560e03530723` (`Delete data/cache directory`). Esta rama no fue mergeada a `main`.
- La rama remota `feature/sebas` observada entonces apuntaba a `02521bf`, un antecesor de `main`. Eso no identifica la nueva versión estable que prepara el compañero: hace falta conocer su rama o commit exacto.

El usuario autorizó guardar y publicar nuestro trabajo en `feature/user-friendly`. Eso no autoriza mergear a `main`, forzar un push ni reemplazar trabajo local sin revisión. Conservar esta rama como respaldo al integrar.

En la PC de origen quedaron cambios locales en tres `data/cache/*/manifest.json` y un archivo personal llamado `Notas Codex`, excluidos deliberadamente de los commits. No son pendientes de implementación. No leer ni modificar las notas personales, ni subirlas junto con las cachés. En otra PC estos archivos y cambios pueden no existir.

## Qué está implementado y dónde

| Archivo | Responsabilidad |
| --- | --- |
| [static/demo-profiles.js](../static/demo-profiles.js) | Cuentas demo, alias, experiencia, intereses, estilo de explicación, valores iniciales y preferencias manuales por cuenta. |
| [static/demo-assistant.js](../static/demo-assistant.js) | Chat por reglas, respuestas actuales, contexto, fuentes, seguimientos, propuestas de ajustes y animación de preparación. |
| [static/app.js](../static/app.js) | Explorador y conexión entre el estado científico, perfiles y chat. Contiene otros cambios que deben revisarse antes de trasladar. |
| [static/index.html](../static/index.html) | Acceso demo, formulario de perfil, navegación y sección del asistente. |
| [src/main.py](../src/main.py) | Backend FastAPI, endpoints y entrega del frontend. |
| [docs/PERFILES_DEMO.md](PERFILES_DEMO.md) | Contrato y recorrido detallado de perfiles y asistente. |
| [content/assistant/README.md](../content/assistant/README.md) | Biblioteca portable, contrato neutral de contexto e instrucciones de integración. |

Los perfiles Principiante, Explorador y Avanzado son seleccionables sin contraseña; también se puede entrar como invitado. La experiencia y el estilo de explicación se eligen por separado. Las preferencias se guardan en `localStorage` bajo `papastronomy.demo-profiles.v1`, por cuenta y origen de la página. Otro navegador, puerto o PC no recibe esas preferencias mediante Git. El modo `embed=1` abre el visor como invitado sin modificar la cuenta del navegador.

La conversación vive en memoria durante la visita, con un máximo de 30 mensajes. Se descarta al iniciar una charla, cambiar de cuenta o salir. Cambiar de sección conserva la conversación y las observaciones. Las rutas `#asistente` y `#explorador` admiten navegación del navegador.

El asistente distingue falta de datos, carga pendiente, comparación no disponible y comparación válida sin candidatos. Explica la selección y fotometría actuales; conserva las fuentes usadas por cada respuesta. Ofrece seguimientos según el tema y pide aclaración ante preguntas ambiguas. Nunca debe presentar un candidato como un descubrimiento confirmado.

Las propuestas permiten revisar recortes, FPS, FLAGS y marcas del detector. Solo se aplican con su botón, respetan ajustes manuales y no cambian coordenadas ni FoV. La cantidad de recortes se usa en la próxima exploración. Navegar desde el chat no dispara una descarga científica.

### Puente para adaptar el chat

En `static/app.js`, buscar `getAssistantContext()`, `applyAssistantSettings(patch, revision)` y `DemoAssistant.mount(...)`.

- `getContext` entrega perfil, configuración, campo, candidatos, selección, diagnóstico y fotometría de la consulta vigente.
- `conversationKey` identifica cuenta y exploración; `answerKey` incluye selección y fotometría; `revision` evita aplicar propuestas preparadas para un contexto anterior.
- `applySettings` valida los valores permitidos antes de aplicarlos.
- `onNavigate` permite enfocar explorador, detector o espectro. `onExplore` vuelve a dibujar los visores y ajusta Plotly al regresar al explorador; no consulta nuevos datos.

La integración futura debe adaptar este puente al estado real de la versión estable, en vez de copiar el antiguo `app.js` completo. Invalidar resultados anteriores al cambiar campo o selección y conservar el escape de texto de alias, respuestas y valores externos.

### Biblioteca portable: preparada, todavía sin conectar

**El chat actual responde desde `static/demo-assistant.js`; todavía no carga los JSON de `content/assistant/`.** La biblioteca contiene 39 entradas con variantes simples y técnicas, 14 fuentes y tres recorridos de presentación. Incluye guías de enanas marrones y estrellas jóvenes, con acciones opcionales `open_learning_3d` y `open_young_star_3d`; el primer recorrido tiene una extensión para ambas escenas en `PRESENTACION.md`.

Sus archivos son `catalog.json`, `sources.json`, `demo-scenarios.json`, `PRESENTACION.md`, `validate.py` y `README.md`. El contrato neutral distingue campo, comparación, candidatos, selección y fotometría. El futuro adaptador debe resolver condiciones, variables y alternativas antes de mostrar una respuesta.

No sustituir datos ausentes por cero, fijar cantidades de candidatos ni fabricar fotometría para que funcione una presentación. Las unidades y resultados deben venir de la base estable. Si un estado es desconocido, conservarlo como tal. Los recorridos contemplan alternativas cuando no hay comparación o candidatos.

## Cómo continuar cuando esté la versión del compañero

1. Revisar `git status`, rama activa y remotos. Preservar cualquier modificación local antes de cambiar de rama. Usar `git fetch origin` para actualizar referencias.
2. Identificar con el usuario la rama o commit exacto de la versión estable; no asumir que es `feature/sebas` o que ya llegó a `main`.
3. Comparar esa base con `feature/user-friendly` y crear una nueva rama de integración desde la base elegida. Mantener intacta la rama de respaldo.
4. Trasladar primero el contenido portable y luego perfiles/chat, adaptando el puente y la navegación a la interfaz estable. Revisar cualquier dependencia del HTML, estilos, almacenamiento y scripts servidos.
5. Mantener el procesamiento científico y la política de caché de la base estable. Las correcciones científicas y visuales de `06b2c48` requieren una revisión separada; no son un requisito para recuperar el chat.
6. Comprobar perfiles editables, prioridad de ajustes manuales, cambio de cuenta/campo, resultados pendientes, fuentes, acciones revisables, móvil y modo embebido. Preparar una comparación revisable antes de proponer un merge.

Hasta disponer de esa base se puede ensayar la presentación y revisar contenido, sin adelantar una integración contra una versión supuesta.

## Aprendé en 3D: módulo portable

La carpeta **`static/learn-3d/`** contiene una página independiente, el componente `<papastronomy-object-viewer>`, sus estilos, contenido con fuentes NASA y pruebas. Se puede copiar completa a la base estable sin copiar el antiguo `app.js` ni el pipeline. Leer su `README.md` para la integración por componente o iframe.

El visor permite rotar y acercar una enana marrón genérica, pausar su animación, cambiar entre paletas artísticas visible/infrarroja y leer tres temas en estilo simple o técnico. Es una esfera tridimensional procedural mediante WebGL, no un archivo GLB ni una reconstrucción de un objeto real. No interpreta FITS, no mide temperaturas ni produce detecciones. Las fuentes y los límites están visibles.

La segunda escena es una estrella joven con disco de gas y polvo, seleccionable mediante **Objeto educativo**, el atributo `object="young-star"` o el parámetro `?object=young-star`. El shader calcula esfera y disco plano con superposición según profundidad; inclinar con arrastre vertical cambia la vista. No es una reconstrucción de RW Aurigae ni identifica la causa de una variación. Los temas son Estrella, Disco y Variabilidad. El selector reinicia orientación, zoom y tema, conserva paleta/estilo/pausa y reutiliza el renderizador. La compatibilidad con `Papastronomy3DContent` se conserva; el catálogo completo es `Papastronomy3DObjects`.

El arrastre y las flechas se corrigieron en ambos ejes para que la superficie acompañe el gesto. La rotación automática continúa siendo ilustrativa.

Los enlaces desde la navegación y el asistente abren una pestaña nueva para conservar las observaciones. El puente añadido a `app.js` proporciona la ruta del módulo y pasa el estilo de explicación del perfil mediante un parámetro; se puede reescribir al integrar. El módulo no lee perfiles ni almacenamiento. Movimiento reducido inicia en pausa; fuera de pantalla se suspende y al retirarlo libera recursos. Sin WebGL sigue disponible el contenido educativo.

El chat reconoce «¿Qué es una enana marrón?» y «Explorar en 3D». Su guía general funciona sin campo, durante la carga o con datos, y no clasifica el candidato. `DemoAssistant.mount` recibe `getLearning3DUrl` desde el anfitrión; sin una ruta HTTP(S) válida del mismo origen se omite el enlace. La ruta y el estilo del perfil se revisan al pulsar el acceso. Al integrar, conservar este puente junto al módulo o adaptar la acción neutral `open_learning_3d` de la biblioteca portable.

También reconoce «¿Qué es una estrella joven con disco?» y ofrece un enlace con `object=young-star`, usando la misma ruta proporcionada por el anfitrión. La propiedad `object` de la acción distingue la escena; la biblioteca neutral usa `open_young_star_3d`. Conservar esa selección al adaptar el chat. Sus guías no usan resultados de una fuente como evidencia del dibujo.

El usuario probó el visor en navegador y confirmó que se ve bien después de corregir la transparencia del halo: el shader ahora entrega colores premultiplicados por alfa, con negro transparente fuera del halo. No se completó una validación visual automatizada ni la revisión móvil; los chequeos de código y estado sí están aprobados.

Verificación local: scripts con sintaxis válida, página y assets HTTP 200, pruebas `check.cjs` del módulo y los cuatro chequeos JavaScript existentes aprobados mediante el runtime JavaScript de herramientas. Las pruebas cubren el selector entre escenas, conservación de estilo/paleta, liberación de recursos y selección del modelo desde el asistente. Node no está en PATH. La revisión visual automatizada de la estrella joven queda pendiente: el navegador integrado no está disponible y el control de Chrome se interrumpió porque no pudo verificar la URL con suficiente confianza. Las pruebas de estado no compilan shaders ni certifican el renderizado. La revisión móvil se postergó por decisión del usuario. CI aún no se ejecutó por estos cambios.

## Levantar la app en otra PC

Si el repositorio todavía no existe allí:

```bash
git clone --branch feature/user-friendly https://github.com/PalacioSebas/SpaceApps2026.git
cd SpaceApps2026
```

Si ya existe, revisar primero sus cambios locales. Con el árbol listo para cambiar de rama:

```bash
git fetch origin
git switch feature/user-friendly
git pull --ff-only
```

Si esa rama solo existe en el remoto, usar `git switch --track origin/feature/user-friendly` en lugar de `git switch feature/user-friendly`.

En Windows PowerShell ejecutar `./run_project.bat`; en Linux, `bash run_project.sh`. Abrir `http://127.0.0.1:8000`. Los lanzadores preparan el entorno local y las dependencias. No copiar `.venv` entre sistemas. Node se necesita solo para los chequeos de desarrollo, no para ejecutar la app.

Los entornos, perfiles del navegador, conversaciones, credenciales y archivos temporales no se trasladan con los commits. Algunos FITS antiguos siguen versionados en esta rama; otros datos requerirán descarga. No agregar nuevas cachés, secretos o entornos al repositorio. Un archivo ya seguido por Git sigue apareciendo como modificado aunque su directorio figure en `.gitignore`.

Consultar [COMPATIBILIDAD.md](COMPATIBILIDAD.md) y [OPTIMIZACION.md](OPTIMIZACION.md), teniendo en cuenta sus fechas y las dependencias vigentes de `requirements.txt`.

## Verificación y límites

Se añadieron 15 pruebas portables en `content/assistant/test_contract.py`, incluidas también en la suite habitual a través de `tests/test_assistant_content.py`. Se aprobaron en esta PC con la biblioteca estándar: verifican condiciones del catálogo y errores deliberados en copias en memoria. No certifican el chat ni el futuro adaptador. Comando independiente: `python -m unittest discover -s content/assistant -p test_contract.py -v`. En esta PC Node no está disponible en PATH; no se repitieron los chequeos JavaScript.

En la PC de origen se aprobaron 90 pruebas Python, cuatro chequeos JavaScript, el validador de contenido y recorridos en Chrome de escritorio y móvil. Esto documenta esa ejecución; no certifica el nuevo equipo ni la futura integración. Los recorridos adicionales de navegador usaron scripts temporales fuera del repositorio y no se transfieren con Git.

Para repetir los chequeos versionados, con las dependencias instaladas y el Python del entorno activo:

```bash
python -m unittest discover -s tests -q
node scripts/check_frontend.cjs
node scripts/check_profiles.cjs
node scripts/check_images.cjs
node scripts/check_assistant.cjs
python content/assistant/validate.py
```

El validador del contenido solo usa la biblioteca estándar. El workflow de compatibilidad está en `.github/workflows/compatibility.yml`; una validación local no equivale a un resultado aprobado de CI. Revisar sus ejecuciones antes de un merge, especialmente Windows.

Los servicios astronómicos externos y la cobertura pueden variar. No esperar IDs ni cantidades fijas de candidatos. Las vistas derivadas de PNG son ayudas visuales; las mediciones deben usar los resultados científicos correspondientes.

## Mensaje inicial para Codex en la otra PC

> Leé `docs/CONTEXTO_CODEX.md`, `docs/PERFILES_DEMO.md` y `content/assistant/README.md`. Revisá el estado de Git y la rama actual antes de modificar archivos. La versión estable de mi compañero será la base; queremos conservar acceso demo, perfiles, chat y biblioteca de respuestas. No mergees a main ni reemplaces trabajo local. Primero confirmá qué está disponible y proponé el siguiente paso según este contexto.

El documento está enlazado desde el README. Pedir explícitamente su lectura al iniciar una nueva conversación permite usar estas decisiones sin depender del historial de la PC anterior.
