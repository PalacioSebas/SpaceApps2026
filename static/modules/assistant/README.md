# Asistente portable

Este módulo incluye un motor de reglas locales y un componente de chat.
No contiene un LLM, claves, solicitudes científicas ni llamadas de red. El
anfitrión conserva el estado del explorador y decide qué acciones admite.

## Montaje

Copiar la carpeta completa y adaptar únicamente las rutas:

```html
<script src="./modules/assistant/rules.js" defer></script>
<script src="./modules/assistant/assistant.js" defer></script>
<papastronomy-assistant></papastronomy-assistant>
```

Tras cargar los scripts:

```js
const assistant = document.querySelector('papastronomy-assistant');
assistant.configure({
  getContext: () => host.getAssistantContext(),
  applySettings: (patch, revision) => host.applyAssistantSettings(patch, revision),
  onNavigate: target => host.navigate(target),
  getLearning3DUrl: () => host.getLearning3DUrl(),
});
```

Los nombres `host.*` son adaptadores del anfitrión, no funciones globales que
deba implementar el explorador. No se necesita copiar el antiguo `app.js`.
El CSS se carga respecto de `assistant.js` y está encapsulado en Shadow DOM.
Puede ajustarse mediante `--papastronomy-bg`, `--papastronomy-panel`,
`--papastronomy-text`, `--papastronomy-muted`, `--papastronomy-accent`,
`--papastronomy-line` y `--papastronomy-font`.

## Contexto y acciones

`getContext()` devuelve un objeto JSON con:

- `profile`: `id`, `alias`, `level`, `levelLabel`, `explanations` (`tecnica` activa el detalle técnico).
- `defaults`, `manualOverrides`, `settings`: valores preparados por el anfitrión.
- `target`: metadatos del campo cargado; `null` si no hay campo.
- `loading`, `temporal`, `detections`, `selectedDetectionId`, `analysisFrames`, `spectrum`.
- `conversationKey`: identidad de cuenta/campo para el hilo temático.
- `revision`: versión de la configuración/campo para validar propuestas.
- `answerKey`: versión de la selección y fotometría para invalidar respuestas.

No sustituir observaciones ausentes por ceros. `spectrum` solo debe contener
fotometría de la selección vigente; durante una carga, el motor no presenta
resultados anteriores como mediciones actuales.

Llamar `refresh()` al cambiar campo, selección, estado de carga o perfil.
Cancela respuestas y deshabilita propuestas preparadas para un contexto anterior.
Además, se vuelve a comprobar el contexto cuando termina un proveedor asíncrono,
aunque el anfitrión haya omitido llamar `refresh()`.

`applySettings(patch, revision)` solo se invoca al enviar la propuesta editable.
El patch contiene `maxFrames`, `fps`, `showFlags`, `showAIMarkers`. Los FPS
admitidos son 1, 1.2, 2, 3.5, 4 y 6; el límite temporal de recortes es 32,
frente a 102 en modo normal. El anfitrión debe validar de nuevo revisión,
valores y prioridad de ajustes manuales. No se cambian coordenadas ni se
descargan datos desde el chat.

`onNavigate(target)` recibe `explorer`, `detector` o `spectrum`. El componente
no modifica el hash ni busca controles del explorador. El acceso educativo
usa `getLearning3DUrl()`: solo permite HTTP(S) del mismo origen y añade
`object=brown-dwarf|young-star`. Revisa la URL de nuevo al pulsar el enlace.

`reset()` borra el hilo, la memoria y propuestas. Cambiar de cuenta también
lo hace. Ocultar el componente conserva la conversación; retirarlo del DOM
cancela el proveedor y libera eventos/temporizadores.

## Sustituir el motor por un proveedor

La interfaz recibe opcionalmente `provider` dentro de `configure`:

```js
const provider = {
  id: 'mi-backend',
  label: 'Asistente conectado',
  async respond({ message, context, conversation, signal }) {
    // Implementar aquí el adaptador a un backend, respetando signal.
    return { summary: 'Respuesta', sources: [], followUps: [], actions: [] };
  },
};
```

El proveedor predeterminado es
`PapastronomyAssistantRules.createLocalProvider()`, identificado visiblemente
como **Respuestas integradas · reglas locales**. Un LLM futuro debe conectarse
a través de un backend; no colocar credenciales en este módulo.

`message` es la consulta actual (máximo 400 caracteres). `context` es una
instantánea JSON y `conversation` contiene memoria del proveedor y las últimas
30 intervenciones en `messages: [{role, content}]`. El proveedor puede devolver:

```js
{
  summary: 'Respuesta breve',
  text: 'Texto completo opcional',
  detail: 'Detalle desplegable opcional',
  sources: [{title: 'Referencia', kind: 'Referencia oficial', url: 'https://example.org', facts: ['Dato usado']}],
  followUps: ['Pregunta sugerida'],
  choices: [{label: 'Una opción', prompt: 'Consulta explícita'}],
  actions: [{id: 'explorer', label: 'Volver al explorador'}],
  proposal: {settings: {maxFrames: 10, fps: 2, showFlags: false, showAIMarkers: true}},
  memory: {topic: 'tema opaco del proveedor'},
}
```

Las acciones admitidas son `explorer`, `detector`, `spectrum`, `configure` y
`learn3d` (con `object` opcional). Se descartan acciones desconocidas y URLs
de protocolos no permitidos. Los textos del proveedor se muestran como texto,
sin interpretar HTML o Markdown. El adaptador siempre puede ignorar acciones
que su anfitrión no admita.

## Verificación

```powershell
node --check static/modules/assistant/assistant.js
node static/modules/assistant/check.cjs
```

Las pruebas cubren reglas científicas previas, fuentes, continuidad, propuestas,
estilos simple/técnico, enlaces educativos y errores/cancelación de proveedores.
También verifican respuestas obsoletas por cambio de selección/cuenta, aplicación
explícita de propuestas y liberación al desmontar. Usan un DOM mínimo en memoria;
no sustituyen una revisión visual en navegador.
