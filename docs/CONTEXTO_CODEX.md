# Contexto de integración

Actualizado el 15 de noviembre de 2026.

## Base acordada

El usuario canceló el restyling anterior y autorizó reemplazar el código de
`feature/user-friendly` por `origin/main`. La base importada es `4e010b0`
(`Merge branch 'v0/landing-page'`). La rama `main` no se modificó.

En una segunda actualización se incorporó por fast-forward `f4c8527`
(`Merge remote-tracking branch 'origin/v0/landing-page'`). Este cambio elimina
los siete archivos de `tests/`; no modifica la landing ni el explorador.
Los ajustes locales de pruebas se guardaron sin reaplicar en un stash con
el mensaje `Respaldo ajustes de tests antes de main f4c8527`.
No hacer `stash pop` de ese respaldo sin revisar: intentaría recuperar
archivos eliminados por main. Los ajustes de arranque y landing se incluyen
en el checkpoint descrito a continuación.

La versión anterior se conserva íntegra en la rama local
`backup/user-friendly-before-main-20261114`, commit `c0f1bf9`. También estaba
publicada en `origin/feature/user-friendly`. El historial divergente se reunió
después sin reintroducir su código anterior ni forzar el push.

## Checkpoint del 15 de noviembre

- `12c0704`: módulos de acceso/perfil/chat, visor 3D con idiomas, traducciones
  de la landing, integración y documentación.
- `8332bed`: reúne el historial anterior de `feature/user-friendly` con una
  estrategia de conservación del árbol actual. Los hashes del árbol antes
  y después coinciden (`10c076109a200a3fbded6cb0ede75089358c30c0`). No recupera
  el antiguo explorador ni sus cambios científicos.
- Rama de trabajo y destino del respaldo: `feature/user-friendly`. No se
  modifica ni se publica `main`; no se usa push forzado.
- La base científica sigue en `f4c8527`. Al consultar las referencias remotas,
  `origin/main` ya apuntaba a `26b1a3f`; sus cambios posteriores no se incluyeron
  en este checkpoint. Revisarlos cuando se integre el restyling del compañero.

Para continuar desde otra PC con el árbol limpio: `git fetch origin`,
`git switch feature/user-friendly` y `git pull --ff-only`. Si hay cambios
locales, conservarlos antes de actualizar. Los stashes son locales: no se
transfieren al hacer push; el código anterior sí está en la historia de la rama.

## Material recuperable

En el respaldo están el acceso demo y los perfiles (`static/demo-profiles.js`,
`docs/PERFILES_DEMO.md` y el puente en el antiguo HTML/JS), el asistente local y
su biblioteca, y los objetos educativos portables de `static/learn-3d/`.
El acceso, perfiles y chat se recuperaron después como módulos portables;
ver la sección siguiente. No se reemplazó el explorador con el antiguo `app.js`.

Los objetos 3D fueron aprobados visualmente por el usuario: conservar su
renderizado al reintegrarlos. No leer ni modificar el archivo personal
`Notas Codex`. No versionar `data/`, entornos ni dependencias descargadas.

## Orden de trabajo

1. Preparar y verificar la nueva base de main en esta PC.
2. Adaptar el acceso demo y los perfiles sobre esta base.
3. Hacer el restyling tomando la landing como referencia visual.

El usuario pidió después recuperar y adaptar primero el visor 3D al estilo
de la landing. Se restauró `static/learn-3d/` desde el respaldo, cambiando
inicialmente solo su CSS y su página de presentación. El shader y el
renderizador permanecen idénticos al respaldo. La interfaz usa la paleta
celeste/violeta, títulos sans serif y bordes tenues de la landing. La cabecera
de la landing incluye un acceso en otra pestaña en escritorio, derivado de
la URL del explorador.

## Acceso/perfil/chat: integración modular vigente

El usuario aclaró que **la landing solo redirige a la herramienta** y que
**el restyling del explorador lo hace su compañero**. El acceso debe aparecer
dentro de la herramienta. No seguir rediseñando el explorador en esta rama.

Se recuperaron y separaron los módulos en `static/modules/`:

- `access/`: modelo compatible con los perfiles previos y componente
  `<papastronomy-access>`, con UI/CSS encapsulados en Shadow DOM.
- `assistant/`: reglas locales en `rules.js` y componente
  `<papastronomy-assistant>`, desacoplado del motor mediante `provider.respond`.
- `workspace.js/css`: composición, navegación, perfil y puente neutral.
- `index.html/demo.js`: demostración ejecutable sin explorador ni APIs.
- `README.md`: guía de traslado, contrato, opciones de tema y pruebas.

La integración específica está en `static/integrations/explorer-modules.js`.
Es el único módulo que conoce los IDs/funciones actuales. `app.js` solo tiene
pequeños hooks de arranque, límite de recortes y notificaciones de contexto.
El HTML monta el compositor y conserva el DOM científico al cambiar sección.
Las preferencias se aplican antes de la primera consulta. Invitado dispone
de las mismas funciones; `embed=1` no toca la sesión ni el almacenamiento.

Al traer el restyling, conservar `static/modules/` y `static/learn-3d/` y
adaptar ese puente a la nueva interfaz. **No copiar app.js/index.html antiguos
completos**. Esperar `workspace.ready()` antes de explorar y entregar al chat
únicamente datos y fotometría vigentes. Se separaron las generaciones de campo
y selección para evitar reutilizar resultados anteriores tras un fallo.

Los perfiles son demo, no autenticación real. El chat sigue siendo local y
visible como «Respuestas integradas · reglas locales». No se conectó un LLM
ni se agregaron endpoints o claves. Un proveedor futuro puede usar un backend
mediante el contrato documentado, sin cambiar el chat.

Se conservan overrides manuales, FPS históricos 1.2/3.5, fuentes, propuestas
editables y enlaces al visor 3D. El FoV preparado no cambia la geometría de
imágenes cargadas. La navegación no descarga datos. Cambiar de cuenta limpia
la conversación; cambiar de sección conserva conversación y observaciones.

Validación de esta integración: chequeos `static/modules/access/check.cjs`,
`static/modules/assistant/check.cjs`, `static/modules/check.cjs` y el del visor
3D aprobados. Se comprobó también la espera de acceso en el arranque real de
`app.js` mediante un entorno de prueba: no consulta APIs mientras el acceso
está pendiente. Scripts con sintaxis válida y página principal, demo y todos
los assets nuevos con HTTP 200. La comprobación visual del diálogo y chat
en un navegador real sigue pendiente. No se modificó el backend científico,
no se ejecutaron nuevas descargas de FITS. El trabajo se conserva en el
checkpoint Git descrito al inicio.

El visor ahora permite alternar **Español / English** desde el encabezado.
`i18n.js` contiene la interfaz y `content.js` los dos catálogos educativos
inmutables en `Papastronomy3DLocales.es/en`. El atributo `lang` del componente
controla la traducción sin reiniciar vista, tema, reproducción ni recorrido.
El adaptador standalone da prioridad a `?lang=es|en`, luego a la preferencia
`papastronomy-lang` de localStorage y finalmente al español. Se guarda al
pulsar el selector; funciona también con almacenamiento bloqueado. La landing
ya tiene su propio selector en desarrollo: su enlace al visor pasa `lang`
para conservar la elección entre puertos/orígenes distintos. No se reemplazó
su implementación de idiomas por la del visor.

La landing es Next.js en `landing/`; el explorador
es FastAPI con `static/index.html`. Son dos servidores distintos.
Los botones principales de la landing apuntan al explorador local mediante
`NEXT_PUBLIC_EXPLORER_URL` (valor por defecto: `http://127.0.0.1:8000`).
La demostración de la sección Explore de la landing sigue siendo ilustrativa.

## Ajustes locales sobre main

- El lanzador inicia sin `--reload` por defecto; la recarga se puede pedir
  explícitamente. Antes de iniciarlo, detener cualquier servidor anterior
  que esté usando el puerto 8000. El servidor de comprobación del agente
  se detuvo para que el usuario pueda iniciar el suyo desde la terminal.
- La preferencia de movimiento reducido en la landing se lee con
  `useSyncExternalStore`, compatible con SSR y con el chequeo de ESLint.
- Antes de la eliminación de tests por main, se ajustaron las pruebas para que
  los casos que requieren FITS reales se omitan explícitamente si
  faltan los datos. No intentan descargarlos como parte de una prueba offline.
  Los manifiestos presentes pero inválidos siguen generando errores.
- Dependencias Python instaladas en `.venv`; dependencias de la landing en
  `landing/node_modules`. Node está instalado en `C:/Program Files/nodejs`,
  pero no aparece en el PATH del proceso actual del agente.

## Verificación

Antes de actualizar a `f4c8527`, la suite Python ejecutó 101 pruebas sin fallos y omitió 10 subcasos que
requieren FITS locales. Se verificó además una consulta real a IRSA para
WISE 0855: descarga de dos recortes y `/api/explore` HTTP 200. Esto no certifica
todos los objetivos ni su funcionamiento offline sin datos. El explorador sirve
HTML, JavaScript, objetivos y OpenAPI, incluida `/api/timeline`, por HTTP.
La landing pasó build, TypeScript y lint, y se sirve en el puerto 3000. Sus
cuatro imágenes principales responden HTTP 200 y el HTML contiene el enlace
al explorador. Volver a ejecutar build/lint si cambian sus fuentes. No se
completó una revisión visual automatizada.

Después del restyling del visor: `check.cjs` aprobado y sintaxis JavaScript
válida. Los hashes Git de `viewer.js`, `content.js` y `page.js` coinciden con
el respaldo. La landing volvió a compilar con TypeScript aprobado y su HTML
contiene el nuevo acceso; los seis recursos del visor responden HTTP 200.
No se pudo revisar visualmente: el host de acceso al navegador no está
disponible. Los cambios de esta integración se incluyen en el checkpoint.

Después de agregar idiomas se repitieron las pruebas del módulo (paridad ES/EN,
estado manual y recorrido conservados, preferencia, enlaces y almacenamiento
bloqueado), sintaxis JS/CSS, HTTP de los siete recursos y build/TypeScript de
la landing. Todo aprobado. Se comparó la parte de shader/renderizador con el
respaldo: no cambió. La validación visual en navegador sigue pendiente.

Consultar `landing/README.md` para instalar y arrancar ambos servidores.
