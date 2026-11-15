# Aprendé en 3D · módulo portable

Tres objetos educativos para rotar, acercar y explorar: una **enana marrón genérica**, una **estrella joven con disco de polvo** y una **estrella roja pulsante tipo Mira**. Usan geometría procedural y paletas conceptuales. No reconstruyen WISE 0855, Epsilon Indi B, RW Aurigae o R Draconis, no reciben fotometría ni producen resultados científicos. Las referencias de NASA están en `content.js`; las de la estrella tipo Mira se revisaron el 15 de noviembre de 2026 y las de los dos objetos anteriores el 14 de noviembre.

## Probar

Con la app iniciada, abrir `/static/learn-3d/index.html` o el enlace **Aprendé en 3D** de la herramienta o de la cabecera de la landing en escritorio. Se abre otra pestaña. La explicación inicial es simple; puede seleccionarse técnica en el visor o con `?explanation=technical`. El adaptador de los perfiles/chat portables pasa el estilo preferido al abrir el enlace desde la herramienta.

El selector **Objeto educativo** alterna entre los tres. Para abrir directamente la estrella joven, usar `/static/learn-3d/index.html?object=young-star`; para la estrella pulsante, `/static/learn-3d/index.html?object=mira-star`. La enana marrón usa `object=brown-dwarf` y sigue siendo la opción predeterminada. El futuro puente a perfiles/asistente debe pasar los atributos o parámetros correspondientes sin acoplar el módulo a esos servicios.

### Estilo de la landing

La interfaz comparte la paleta de `landing/app/globals.css`: fondo `#05070d`,
paneles azul oscuro, acentos `#55d6ff` y `#9b8cff`, texto `#f3f5fa`, bordes
tenues, botones redondeados y títulos sans serif. El encabezado reutiliza el
símbolo de Papastronomy. Los paneles de escena y lectura tienen separación
propia y los controles permanecen agrupados debajo.

Las fuentes usan la pila local sans serif; si el anfitrión carga Geist puede
heredarse con `--papastronomy-font`. No se descargan fuentes ni se necesita
Tailwind o Next.js para el visor. La estrella tipo Mira tiene su propia rama
del shader; las paletas y la apariencia de los dos objetos originales se conservan.
La cuadrícula y los colores de fondo son estilos de la interfaz.

### Español / English

El encabezado permite cambiar entre español e inglés. Se traducen controles,
etiquetas accesibles, los tres objetos, explicaciones simples/técnicas, actividades,
fuentes y límites. Cambiar el idioma conserva la orientación, zoom, animación,
paleta, disco, tema y progreso del recorrido, incluida la vista guardada al entrar.

La página usa `?lang=es` o `?lang=en`, con prioridad sobre la preferencia de
`localStorage` (`papastronomy-lang`); sin preferencia comienza en español.
El selector guarda la elección y actualiza la URL sin recargar. Si el
almacenamiento está bloqueado, sigue funcionando durante la visita. La
preferencia es por origen: localhost/127.0.0.1 y puertos distintos no comparten
almacenamiento. El enlace de la landing pasa su idioma mediante `lang`.

El componente recibe el atributo `lang="en"` o `lang="es"` y no lee perfiles
ni almacenamiento. El adaptador `page.js` gestiona la preferencia y el idioma
del documento. Los catálogos inmutables son `Papastronomy3DLocales.es/en` para
los objetos y `Papastronomy3DI18n.es/en` para la interfaz. Los alias anteriores
`Papastronomy3DContent` y `Papastronomy3DObjects` continúan en español.

### Recorrido guiado y comparación

**Guiame** inicia un recorrido de tres pasos para el objeto seleccionado. El avance es manual mediante Anterior/Siguiente o los temas numerados; no hay temporizadores ni consultas científicas. Cada paso prepara una orientación y paleta e incluye una actividad en **Probá esto**. Los controles permanecen disponibles. Cambiar solo el estilo de explicación conserva la comparación manual de ese paso.

Al iniciar se guarda en memoria la orientación, zoom, fase visual, paleta, visibilidad del disco, reproducción y tema. **Salir del recorrido** o **Terminar recorrido** restaura esa vista; con movimiento reducido activo la animación queda pausada. Cambiar de objeto cierra el recorrido anterior y prepara el nuevo objeto. Retirar el componente del DOM descarta el recorrido y libera sus recursos. No persiste en perfiles ni almacenamiento.

La estrella tiene un botón **Mostrar/Ocultar disco** que controla su geometría en el shader. El primer paso comienza con la estrella sola; el segundo muestra el disco en una paleta infrarroja conceptual y el tercero prepara una vista más inclinada. Se pueden alternar disco y paletas a voluntad. La comparación es educativa: no calcula diferencias de flujo, extinción ni una curva de luz.

La estrella tipo Mira presenta pulsaciones ilustrativas de tamaño, brillo y halo,
con una textura de superficie conceptual. **Fase del ciclo ilustrativo** permite
recorrer el ciclo manualmente y pausa la animación para comparar estados. El
recorrido prepara tres miradas: **Pulsación**, **Brillo** e **Infrarrojo**, con fases
distintas; los controles siguen disponibles. **Animar objeto** recorre un ciclo
visual de unos 12 segundos, elegido para la demostración: no es el período de
R Draconis ni una predicción de su brillo. El tamaño y los colores tampoco son
mediciones. Salir del recorrido restaura la fase y la vista guardadas; con
movimiento reducido se puede explorar el control manual sin animar.

Para probarlo independientemente del proyecto:

```bash
python -m http.server 8765 --bind 127.0.0.1 --directory static/learn-3d
```

Abrir `http://127.0.0.1:8765/`. También se puede abrir `index.html` directamente si el navegador admite los scripts locales. El módulo no hace descargas de texturas, consultas a NASA ni solicitudes a un backend. Los enlaces de referencia se abren únicamente al pulsarlos.

## Conservar e integrar

Copiar **esta carpeta completa**, manteniendo sus archivos juntos:

- `index.html`, `page.css`, `page.js`: página de demostración, estilos del encabezado y adaptador opcional.
- `content.js`: textos simples/técnicos, fuentes y límites educativos.
- `i18n.js`: traducciones de la interfaz y del encabezado, sin dependencias.
- Las actividades del recorrido también están en `content.js`, en el campo `activity` de cada tema. Viajan junto al visor; no dependen del asistente ni de sus JSON.
- `viewer.js`: componente `<papastronomy-object-viewer>` y renderizador WebGL.
- `viewer.css`: estilos encapsulados en Shadow DOM.
- `check.cjs`: pruebas de estado y ciclo de vida, con Node y sin npm.
- `README.md`: este contrato de integración.

No requiere copiar `static/app.js`, los perfiles, el asistente ni el procesamiento científico. La ruta `/static/learn-3d/` solo corresponde al anfitrión actual: en otra aplicación se puede servir la carpeta desde una ruta diferente. No publicar cambios en `main` para trasladar este módulo; integrarlo primero en la rama creada desde la base estable acordada.

### Integración mínima

Dentro de la página de la versión estable, cargar las traducciones y el contenido antes del visor, usando rutas adaptadas al anfitrión:

```html
<script src="./learn-3d/i18n.js" defer></script>
<script src="./learn-3d/content.js" defer></script>
<script src="./learn-3d/viewer.js" defer></script>
<papastronomy-object-viewer explanation="simple" lang="es"></papastronomy-object-viewer>
```

`viewer.js` resuelve su CSS respecto de su propia URL. El catálogo inmutable `window.Papastronomy3DObjects` contiene `brown-dwarf`, `young-star` y `mira-star`. Por compatibilidad, `window.Papastronomy3DContent` conserva la entrada original de la enana marrón. Los únicos valores admitidos por `explanation` son `simple` y `technical`; un valor desconocido usa `simple`. El atributo `object` selecciona el objeto y un valor desconocido usa `brown-dwarf`. El anfitrión puede modificar ambos atributos. El componente no lee ni escribe perfiles, almacenamiento o coordenadas.

Ejemplo para abrir la estrella pulsante directamente: `<papastronomy-object-viewer object="mira-star" explanation="technical"></papastronomy-object-viewer>`. La estrella joven conserva `object="young-star"`. Cambiar de objeto reinicia orientación, zoom, fase y tema, conserva la paleta, el estilo y la pausa, y reutiliza el renderizador.

También se puede usar un iframe con `src="./learn-3d/index.html?object=young-star&explanation=technical"`, `title="Objeto educativo en 3D"`, ancho 100% y una altura adecuada al diseño. La página standalone solo muestra el enlace relativo de regreso al explorador si recibe `from=explorer`; ese parámetro pertenece al adaptador actual y debe omitirse o adaptarse en otra aplicación. No acepta URLs de regreso arbitrarias. Su adaptador actualiza el parámetro `object` de la URL al cambiar de objeto en el selector.

Para preservar el estado de una SPA, mostrar el componente en una sección propia sin recargar la aplicación. Al ocultarlo queda suspendido por el observador de visibilidad; al retirarlo del DOM libera observadores, eventos, animación y recursos WebGL. No necesita un método global de montaje. Las instancias comparten el catálogo inmutable pero conservan su propia selección y controles.

## Controles y límites

- Arrastrar con mouse o un dedo: la superficie acompaña el gesto y la animación se pausa. En la estrella, arrastrar verticalmente permite inclinar el disco.
- Con foco en el lienzo: flechas para rotar, `+`/`-` para zoom, espacio para animar/pausar y `0` para restablecer la vista.
- El deslizador de zoom y todos los temas funcionan con teclado. Los puntos numerados son accesos educativos, no posiciones medidas sobre una superficie.
- Las paletas visible/infrarrojo no implementan filtros ni radiometría. No hay escala física, temperatura calculada, órbita ni velocidad científica.
- Se necesita WebGL; no hay archivo GLB/GLTF. El shader calcula una esfera para la enana, una esfera central con disco plano inclinado para la estrella joven y una esfera con radio y brillo periódicos ilustrativos para la estrella tipo Mira. La profundidad controla las superposiciones; no se simulan grosor, transferencia radiativa, dinámica estelar o una órbita física. El halo usa alfa premultiplicado para conservar el fondo oscuro. Si WebGL falla, los temas y fuentes siguen disponibles y se ofrece reintentar.
- Movimiento reducido inicia la animación en pausa. La animación se suspende si la pestaña o el componente no están visibles. Se limita la resolución a 1.5 veces el tamaño CSS para contener el trabajo de GPU.

## Verificación

```bash
node --check static/learn-3d/viewer.js
node static/learn-3d/check.cjs
```

`check.cjs` comprueba condiciones y transiciones del componente con elementos mínimos en memoria; incluye recorrido reversible, cambio de objeto, disco, fases de Mira, paletas y respeto del control manual. No sustituye el navegador ni compila shaders. Antes de integrar, comprobar en escritorio: selector, renderizado WebGL, rotación, zoom, recorrido, visibilidad del disco, fase de pulsación, temas, estilos, pausa, foco, navegación y manejo de pérdida del contexto WebGL. El usuario decidió postergar la revisión móvil. No hace falta que IRSA esté disponible.

Para esta incorporación se comprobó además la compilación y el renderizado del
shader con ANGLE/EGL en GPU. Las escenas originales produjeron exactamente los
mismos píxeles que la base en doce comparaciones. Se inspeccionaron las fases
de Mira y el zoom máximo, incluida la transparencia del halo. Esta comprobación
gráfica independiente no sustituye una sesión completa de interacción en el navegador.
