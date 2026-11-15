# Acceso, perfiles y asistente portables

Estos módulos se integran **dentro de la herramienta**. La landing solamente
redirige al explorador; no contiene el acceso demo. Son JavaScript y CSS sin
framework, npm, Tailwind, build ni dependencia del backend científico.

## Qué conservar al traer el restyling

- Copiar completa `static/modules/`: acceso, perfiles, chat, reglas y compositor.
- Conservar `static/learn-3d/` si se quiere ofrecer su enlace educativo.
- **Reescribir el adaptador**, no recuperar el antiguo `static/app.js` ni
  reemplazar el HTML nuevo. El adaptador actual es
  `static/integrations/explorer-modules.js` y es el único archivo que conoce
  nombres de controles y funciones del explorador actual.
- Los estilos de los componentes están encapsulados en Shadow DOM. No
  seleccionan los divs del restyling ni necesitan que sus IDs coincidan.

Separar archivos reduce los conflictos; si alguien elimina estas carpetas
al reemplazar la interfaz, hay que conservarlas o recuperarlas explícitamente.

## Probar sin el explorador

Con FastAPI iniciado, abrir `/static/modules/index.html`. Este ejemplo usa
los mismos componentes, pero no consulta APIs ni contiene observaciones.
Permite entrar como invitado, editar una cuenta demo, usar el chat y aplicar
propuestas sobre un objeto de configuración local. Comparte perfiles con la
herramienta cuando se sirve desde el mismo origen.

También puede servirse `static/` con cualquier servidor HTTP. Para el ejemplo
portable no hace falta instalar las dependencias científicas.

## Montaje mínimo

```html
<papastronomy-workspace></papastronomy-workspace>
<div id="mi-explorador"><!-- La interfaz nueva del compañero --></div>
<script src="./modules/access/model.js" defer></script>
<script src="./modules/access/access.js" defer></script>
<script src="./modules/assistant/rules.js" defer></script>
<script src="./modules/assistant/assistant.js" defer></script>
<script src="./modules/workspace.js" defer></script>
<script src="./mi-adaptador.js" defer></script>
```

El adaptador se ejecuta después de esos scripts:

```js
const workspace = document.querySelector('papastronomy-workspace');
workspace.configure({
  getContext: () => host.getContext(),
  applyProfile: (profile, reason) => host.applyProfile(profile, reason),
  applySettings: (patch, revision) => host.applySettings(patch, revision),
  onNavigate: target => host.navigate(target),
  getLearning3DUrl: () => host.learningUrl(),
  // provider: proveedorAsincrono, // opcional; por defecto usa reglas locales
});
await workspace.ready();
// A partir de aquí el anfitrión puede iniciar su primera consulta científica.
```

`host` es la implementación del adaptador, no una dependencia global de los
módulos. El ejemplo ejecutable está en `demo.js`. Se pueden montar acceso y
chat por separado sin usar `workspace.js`.

## Contrato con el anfitrión

| Callback/método | Responsabilidad |
| --- | --- |
| `getContext()` | Entregar una instantánea JSON del estado vigente. |
| `applyProfile(profile, reason)` | Aplicar preferencias iniciales; cambios de alias/explicación no deben reiniciar la vista. `null` indica invitado. |
| `applySettings(patch, revision)` | Validar y aplicar una propuesta únicamente después de la confirmación del usuario en el formulario. |
| `onNavigate(target)` | Mostrar asistente/explorador o enfocar detector/espectro. Sin descargar ni volver a consultar. |
| `getLearning3DUrl()` | URL HTTP(S) del mismo origen; puede omitirse. |
| `workspace.ready()` | Esperar el acceso demo o la elección de invitado. |
| `workspace.refresh()` | Actualizar contexto y cancelar propuestas/respuestas obsoletas. |
| `workspace.showSection(section)` | Alternar `explorer`/`assistant`, conservando ambos DOM y su estado. |

Contexto base: `settings`, `target`, `loading`, `temporal`, `detections`,
`selectedDetectionId`, `analysisFrames`, `spectrum`, `revision`,
`conversationKey`, `answerKey`. El compositor agrega perfil, valores iniciales
y ajustes manuales. Una propuesta aplicada queda guardada como ajuste manual.

`revision` cambia al cambiar la configuración/campo; `answerKey` también
identifica selección y fotometría. Nunca entregar una medición anterior como
si perteneciera a la selección actual. Las cantidades ausentes son `null`
o colecciones vacías, no resultados científicos inventados.

Cambiar de sección solo oculta el explorador; no lo desmonta. Al regresar,
el anfitrión puede redimensionar Plotly y repintar los lienzos. La navegación
por hash y los eventos globales pertenecen al adaptador, no al chat.
En una SPA, llamar `PapastronomyIntegration.destroy()` antes de retirar la
integración actual. Los componentes liberan eventos y tareas al desconectarse.

## Perfil y almacenamiento

El acceso es **demo**, con Principiante, Explorador, Avanzado e invitado.
No implementa contraseñas, sesiones de servidor ni autorización. Todos
conservan acceso a las funciones científicas.

`papastronomy.demo-profiles.v1` conserva compatibilidad con las cuentas del
respaldo. Los ajustes manuales prevalecen sobre el nivel. Se admite editar
alias, interés y estilo; restaurar configuración borra únicamente overrides.
Si el almacenamiento falla, se informa y se continúa en memoria. Cambiar de
cuenta o salir reinicia la conversación, no borra las observaciones.

`<papastronomy-workspace embedded>` abre como invitado temporal y oculta
acceso/navegación sin modificar los perfiles del navegador. El adaptador actual
lo activa mediante `?embed=1`.

El FoV preparado en el perfil solo actualiza el campo pendiente cuando ya
hay imágenes; no se cambia la geometría de esos datos. En el adaptador actual,
los parámetros explícitos de URL prevalecen al entrar. `maxFrames` se usa en
la próxima exploración; los límites son 102 en modo normal y 32 en temporal.
Las preferencias históricas `lightcurve` se adaptan a `timeline` y se
conservan las velocidades fraccionarias de la nueva herramienta.

## Motor local y futuro LLM

`assistant/rules.js` contiene las reglas recuperadas; `assistant/assistant.js`
contiene únicamente la conversación y sus controles. El proveedor recibe
`{message, context, conversation, signal}` y devuelve una respuesta estructurada.
Se cancela al cambiar cuenta/contexto o retirar el componente. Los textos se
insertan como texto, las fuentes se validan y las acciones permitidas están
limitadas. El proveedor nunca aplica ajustes automáticamente.

Para integrar un LLM, proporcionar `provider.respond(...)` que llame a un
backend. No hacen falta cambios en la interfaz ni claves en el navegador.
No se agregó un LLM ni un endpoint nuevo en esta etapa. Ver el contrato
detallado en [assistant/README.md](assistant/README.md).

## Apariencia común

El anfitrión puede definir variables heredables en el componente o un ancestro:
`--papastronomy-bg`, `--papastronomy-panel`, `--papastronomy-text`,
`--papastronomy-muted`, `--papastronomy-accent`, `--papastronomy-line`,
`--papastronomy-font`. Permiten adaptar los módulos al restyling conservando
sus pantallas y lógica.

## Chequeos sin dependencias

```bash
node static/modules/access/check.cjs
node static/modules/assistant/check.cjs
node static/modules/check.cjs
```

Cubren persistencia, validaciones, contexto obsoleto, proveedor asíncrono,
prioridad manual, navegación y límites del adaptador. No sustituyen la revisión
visual del diálogo/chat ni la validación del pipeline científico.
