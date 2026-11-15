# Acceso demo y perfiles locales

Esta etapa del MVP agrega tres cuentas de demostración con preferencias en el navegador. El procesamiento científico, las APIs y todos los controles existentes siguen disponibles. El perfil define valores iniciales, sin restricciones por nivel.

## Recorrido

1. Iniciar la app normalmente. En la primera visita aparece **Tu punto de partida en el cielo**.
2. Elegir Principiante, Explorador o Avanzado. Se puede cambiar alias, experiencia declarada, interés y explicaciones preferidas antes de entrar.
3. Pulsar **Entrar al explorador** para cargar el campo con la configuración efectiva. **Continuar como invitado** permite usar todas las funciones sin perfil; Escape tiene el mismo efecto en el acceso inicial.
4. Abrir **Mi perfil** para editarlo. Cambiar el nivel respeta los ajustes manuales. Cambiar únicamente el alias, el interés o las explicaciones conserva la vista de análisis actual.
5. **Salir** finaliza el acceso demo, conservando las preferencias de cada cuenta para la próxima entrada.

La guía personal se despliega desde **Leer guía**, dejando más espacio al visor. El diálogo del perfil muestra los valores iniciales en tarjetas; **Cancelar** o el botón de cierre descartan las modificaciones del formulario que todavía no se guardaron. La cabecera separa las coordenadas, los objetivos y las acciones de compartir, y en pantallas pequeñas los paneles se ordenan en una columna.

Estas cuentas son seleccionables por cualquier visitante del mismo navegador: no tienen contraseña, no protegen datos privados ni representan un sistema de autenticación. No se agregó un LLM ni se infiere automáticamente el conocimiento de la persona. La experiencia declarada y el estilo de explicación se pueden elegir independientemente.

## Valores iniciales

| Cuenta inicial | Recortes solicitados | Flipbook | FoV | FLAGS |
| --- | ---: | ---: | ---: | --- |
| Principiante | 10 | 1 fps | 0,05° | Ocultas |
| Explorador | 10 | 2 fps | 0,05° | Ocultas |
| Avanzado | 16 | 4 fps | 0,05° | Visibles |

Todos los perfiles tienen acceso a coordenadas, bandas, medianas, RGB, operaciones A/B, Shift & Stack, modo temporal, catálogos y exportaciones. La cobertura puede proporcionar menos recortes que los solicitados. Las condiciones científicas para disponer de una resta siguen siendo comunes a todos.

## Ajustes manuales

Se añadió el campo **Recortes** al formulario de exploración. Ese valor, FoV, FPS, FLAGS, marcadores, inversión, contraste, stretch, capas de catálogo y los modos de visualización/gráfico se guardan al modificarse. Los ajustes manuales tienen prioridad sobre los valores del nivel elegido.

- Al recargar o volver a entrar con la misma cuenta se recuperan sus preferencias y la última región consultada correctamente.
- Al elegir otro objetivo se conserva el FoV configurado y el límite de recortes.
- **Restaurar configuración del perfil**, dentro de Mi perfil, borra los ajustes manuales y aplica los valores del nivel actual. Conserva alias, intereses, explicaciones y experiencia declarada.
- Los cambios de FoV o cantidad de recortes preparados al editar un perfil se aplican a los datos al pulsar **Explorar Cielo**. Las imágenes actuales conservan su geometría hasta completar una nueva consulta.
- Las selecciones temporales de píxeles, bandas individuales y operaciones A/B no son configuraciones persistentes: dependen de las exposiciones cargadas.
- Los enlaces compartidos respetan las coordenadas y parámetros explícitos de la URL. La recarga de una URL generada por la propia app conserva los ajustes manuales pendientes del mismo navegador.

El formulario permite solicitar de 1 a 102 recortes en modo normal. El modo temporal conserva su límite de 32, y sus botones solicitan 24. Las validaciones de parámetros se mantienen en la app y en el backend.

## Almacenamiento y modo embebido

Los perfiles se guardan bajo `papastronomy.demo-profiles.v1` en `localStorage`, separados por cuenta demo. El acceso elegido se recuerda al recargar; los cambios no se envían al servidor. El almacenamiento pertenece al origen de la página: otro navegador, dominio o puerto utiliza un espacio distinto.

Si el almacenamiento está bloqueado o excede su capacidad, el perfil sigue funcionando durante la visita y aparece un aviso. Las preferencias guardadas se validan antes de usarse; valores inválidos se descartan.

El modo `embed=1` abre directamente el visor como invitado, sin modal ni preferencias de la cuenta del navegador. No modifica ni cierra el perfil utilizado en la ventana normal.

## Asistente de respuestas integradas

La navegación superior tiene dos secciones: **Explorador** y **Asistente**. El asistente ocupa una vista propia con una barra lateral de guías, el contexto del campo y un área de conversación. Está identificado como un sistema de respuestas integradas (*built-in answers*). Ofrece seis guías y cada respuesta sugiere preguntas para continuar. No hay un modelo generativo ni una API de IA: las consultas conocidas se reconocen con reglas locales, y una consulta desconocida remite a las preguntas disponibles.

- **Ayudame a empezar** presenta un recorrido con explicaciones simples o técnicas según la preferencia del perfil.
- **Configurá la app para mí** prepara una propuesta editable de recortes, FPS, FLAGS y marcas del detector. Conserva los ajustes manuales; pulsar **Aplicar estos ajustes** guarda las preferencias del perfil activo y actualiza los controles. La cantidad de recortes se usa en la próxima exploración; no se descargan imágenes desde el chat ni se cambian coordenadas, FoV o el modo de análisis.
- **¿Por qué no hay detecciones?** distingue un análisis no disponible de una resta válida sin candidatos, e incluye el motivo real informado por el backend.
- **Explicá el candidato seleccionado** utiliza el ID, tipo, señal y desplazamiento reportados del candidato seleccionado. Mantiene el carácter preliminar de las detecciones.
- También reconoce consultas sobre imágenes, falso color y espectros. Los ejemplos son recorridos guiados; no agregan observaciones o descubrimientos ficticios.

Las guías también cubren qué es SPHEREx, qué datos tiene el campo cargado, cuándo está habilitada la resta temporal y por qué un candidato no confirma un planeta. La consulta sobre el brillo muestra valores de la fotometría actual con longitudes de onda, incertidumbres, detectores y fechas; si la medición está pendiente o pertenece a otro campo, no se usa.

Cada respuesta incluye **Fuentes y datos usados** desplegables y accesos numerados a sus referencias. Se distinguen los datos concretos de esa consulta, el diagnóstico del análisis y las guías generales de esta app. La guía de SPHEREx enlaza las páginas oficiales de NASA e IRSA; estos enlaces se abren solo al pulsarlos. Las fuentes conservan una instantánea de los datos usados al responder: no cambian las cifras del historial al seleccionar otro candidato o campo. No se ejecutan consultas de archivo desde el chat ni se agrega un buscador RAG.

El chat conserva el último tema de la conversación: después de preguntar por un dipolo, **¿Y cómo lo compruebo?** continúa con pasos para revisar sus observaciones. Las consultas ambiguas como **¿Por qué cambia?** permiten elegir entre diferencias entre bandas o entre fechas. Si no hay un tema previo, pregunta sobre qué continuar. Esta memoria se limpia al iniciar una charla, cambiar de cuenta o consultar otro campo; los mensajes anteriores conservan sus fuentes como historial.

Las sugerencias se adaptan a la carga del campo, la disponibilidad de la resta, el candidato seleccionado y la fotometría. No ofrecen explicar un candidato inexistente o un brillo todavía no medido. Tras la primera consulta se ocultan las sugerencias fijas del pie y se muestran preguntas de seguimiento solo en la última respuesta. Los mensajes presentan un resumen y permiten desplegar la explicación completa.

**Ir al detector**, **Ver el espectro** y **Ver observaciones** vuelven al explorador y enfocan el panel correspondiente. **Preparar ajustes** abre una propuesta revisable; estas acciones no disparan descargas ni aplican parámetros automáticamente.

**Ver observaciones** o **Explorador** permiten regresar al análisis conservando el campo, la selección y los controles. Volver a **Asistente** conserva la conversación durante la misma visita; navegar entre secciones no descarga otra vez las observaciones. El enlace `#asistente` abre directamente esa sección y funciona con Atrás/Adelante del navegador. En móvil las guías se pueden desplegar sobre el chat.

Una propuesta queda invalidada si cambia el campo, la cuenta, la configuración o el estado de carga antes de aplicarse. Los controles siguen disponibles para hacer cambios posteriores. El chat funciona como invitado y queda oculto en modo embebido.

Antes de mostrar cada respuesta aparece una breve pausa de presentación con tres puntos animados y el estado **Preparando respuesta**. Las respuestas siguen siendo integradas, sin un modelo generativo. La espera se cancela al iniciar una charla nueva, cambiar de cuenta o modificar el contexto; no se encolan envíos duplicados. Con movimiento reducido los puntos se muestran estáticos.

La conversación vive solo en memoria durante la visita, con un máximo de 30 mensajes; **Nueva charla** la limpia. Cambiar de cuenta o salir descarta la conversación anterior. El chat no guarda mensajes en `localStorage` ni los envía al servidor.

Para mostrar la idea en una presentación: entrar con un perfil, abrir el asistente, consultar una guía y sus fuentes, pedir ayuda para empezar, revisar y aplicar una configuración, seleccionar un candidato real si está disponible y pedir su explicación.

La guía **¿Qué es una enana marrón?** ofrece explicaciones simples o técnicas y una referencia NASA. Su acción **Explorar en 3D** abre el objeto educativo genérico en otra pestaña, conservando la conversación y el campo. El estilo se toma del perfil vigente al abrirlo y puede cambiarse en el visor. La guía funciona sin campo o durante una carga; no clasifica candidatos ni usa la ilustración como evidencia de una fuente real.

La guía **¿Qué es una estrella joven con disco?** y las preguntas generales sobre discos de polvo o RW Aurigae ofrecen **Explorar la estrella en 3D**. El enlace añade `object=young-star` y conserva el estilo del perfil. El visor permite alternar objetos; sus tamaños, colores y movimientos son ilustrativos. La guía usa fuentes NASA y no diagnostica los cambios actuales de RW Aurigae. Las consultas explícitas sobre un candidato mantienen la respuesta contextual del detector.

Al montar el chat en otra base, `getLearning3DUrl()` debe devolver la URL HTTP(S) del módulo en el mismo origen. Si falta ese adaptador o la URL no es válida, se omite el enlace. No se debe copiar una ruta fija del proyecto antiguo. El módulo está documentado en `static/learn-3d/README.md`.

## Verificación

```bash
node scripts/check_profiles.cjs
node scripts/check_frontend.cjs
node scripts/check_images.cjs
node scripts/check_assistant.cjs
python -m unittest discover -s tests -v
```

Node solo se necesita para los chequeos de desarrollo, no para ejecutar la aplicación. El workflow de compatibilidad agrega pruebas JavaScript con Node 24 en Windows y Linux; su resultado requiere ejecutar CI en GitHub.

La validación local incluye las 90 pruebas del backend, reglas de almacenamiento/precedencia con Node y recorrido en Chrome: acceso, cambios manuales, edición del nivel, recarga, cambio de cuenta, restauración, alias mostrado como texto, móvil, invitado, enlaces, embebido y almacenamiento bloqueado. Las reglas del frontend no sustituyen las validaciones científicas de los endpoints.
