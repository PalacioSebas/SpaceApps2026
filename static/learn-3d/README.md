# Aprendé en 3D · módulo portable

Dos objetos educativos para rotar, acercar y explorar: una **enana marrón genérica** y una **estrella joven con disco de polvo**. Ambos usan geometría procedural y paletas conceptuales. No reconstruyen WISE 0855, Epsilon Indi B o RW Aurigae, no reciben fotometría ni producen resultados científicos. Las referencias de NASA están en `content.js`, revisadas el 14 de noviembre de 2026.

## Probar

Con la app iniciada, abrir `/static/learn-3d/index.html` o el enlace **Aprendé en 3D ↗** de la navegación o del asistente. Se abre otra pestaña para conservar las observaciones actuales. La explicación inicial respeta el estilo simple/técnico del perfil; luego se puede cambiar en el visor. El estilo equilibrado usa la explicación simple.

El selector **Objeto educativo** alterna entre ambos. Para abrir directamente la estrella, usar `/static/learn-3d/index.html?object=young-star`. En el asistente, preguntar **¿Qué es una estrella joven con disco?** y pulsar **Explorar la estrella en 3D**. El enlace conserva el estilo del perfil y selecciona ese modelo. La enana marrón usa `object=brown-dwarf` y sigue siendo la opción predeterminada.

Para probarlo independientemente del proyecto:

```bash
python -m http.server 8765 --bind 127.0.0.1 --directory static/learn-3d
```

Abrir `http://127.0.0.1:8765/`. También se puede abrir `index.html` directamente si el navegador admite los scripts locales. El módulo no hace descargas de texturas, consultas a NASA ni solicitudes a un backend. Los enlaces de referencia se abren únicamente al pulsarlos.

## Conservar e integrar

Copiar **esta carpeta completa**, manteniendo sus archivos juntos:

- `index.html`, `page.js`: página de demostración y adaptador opcional.
- `content.js`: textos simples/técnicos, fuentes y límites educativos.
- `viewer.js`: componente `<papastronomy-object-viewer>` y renderizador WebGL.
- `viewer.css`: estilos encapsulados en Shadow DOM.
- `check.cjs`: pruebas de estado y ciclo de vida, con Node y sin npm.
- `README.md`: este contrato de integración.

No requiere copiar `static/app.js`, los perfiles, el asistente ni el procesamiento científico. La ruta `/static/learn-3d/` solo corresponde al anfitrión actual: en otra aplicación se puede servir la carpeta desde una ruta diferente. No publicar cambios en `main` para trasladar este módulo; integrarlo primero en la rama creada desde la base estable acordada.

### Integración mínima

Dentro de la página de la versión estable, cargar primero el contenido y luego el visor, usando rutas adaptadas al anfitrión:

```html
<script src="./learn-3d/content.js" defer></script>
<script src="./learn-3d/viewer.js" defer></script>
<papastronomy-object-viewer explanation="simple"></papastronomy-object-viewer>
```

`viewer.js` resuelve su CSS respecto de su propia URL. El catálogo inmutable `window.Papastronomy3DObjects` contiene `brown-dwarf` y `young-star`. Por compatibilidad, `window.Papastronomy3DContent` conserva la entrada original de la enana marrón. Los únicos valores admitidos por `explanation` son `simple` y `technical`; un valor desconocido usa `simple`. El atributo `object` selecciona el objeto y un valor desconocido usa `brown-dwarf`. El anfitrión puede modificar ambos atributos. El componente no lee ni escribe perfiles, almacenamiento o coordenadas.

Ejemplo para abrir la estrella directamente: `<papastronomy-object-viewer object="young-star" explanation="technical"></papastronomy-object-viewer>`. Cambiar de objeto reinicia orientación, zoom y tema, conserva la paleta, el estilo y la pausa, y reutiliza el renderizador.

También se puede usar un iframe con `src="./learn-3d/index.html?object=young-star&explanation=technical"`, `title="Objeto educativo en 3D"`, ancho 100% y una altura adecuada al diseño. La página standalone solo muestra el enlace relativo de regreso al explorador si recibe `from=explorer`; ese parámetro pertenece al adaptador actual y debe omitirse o adaptarse en otra aplicación. No acepta URLs de regreso arbitrarias. Su adaptador actualiza el parámetro `object` de la URL al cambiar de objeto en el selector.

Para preservar el estado de una SPA, mostrar el componente en una sección propia sin recargar la aplicación. Al ocultarlo queda suspendido por el observador de visibilidad; al retirarlo del DOM libera observadores, eventos, animación y recursos WebGL. No necesita un método global de montaje. Las instancias comparten el catálogo inmutable pero conservan su propia selección y controles.

## Controles y límites

- Arrastrar con mouse o un dedo: la superficie acompaña el gesto y la animación se pausa. En la estrella, arrastrar verticalmente permite inclinar el disco.
- Con foco en el lienzo: flechas para rotar, `+`/`-` para zoom, espacio para animar/pausar y `0` para restablecer la vista.
- El deslizador de zoom y todos los temas funcionan con teclado. Los puntos numerados son accesos educativos, no posiciones medidas sobre una superficie.
- Las paletas visible/infrarrojo no implementan filtros ni radiometría. No hay escala física, temperatura calculada, órbita ni velocidad científica.
- Se necesita WebGL; no hay archivo GLB/GLTF. El shader calcula una esfera para la enana y una esfera central con disco plano inclinado para la estrella. La profundidad controla las superposiciones; no se simulan grosor, transferencia radiativa o una órbita física. El halo usa alfa premultiplicado para conservar el fondo oscuro. Si WebGL falla, los temas y fuentes siguen disponibles y se ofrece reintentar.
- Movimiento reducido inicia la animación en pausa. La animación se suspende si la pestaña o el componente no están visibles. Se limita la resolución a 1.5 veces el tamaño CSS para contener el trabajo de GPU.

## Verificación

```bash
node --check static/learn-3d/viewer.js
node static/learn-3d/check.cjs
```

`check.cjs` comprueba condiciones y transiciones del componente con elementos mínimos en memoria; no sustituye el navegador ni compila shaders. Antes de integrar, comprobar en escritorio: selector, renderizado WebGL, rotación, zoom, temas, estilos de explicación, paletas, pausa, foco, navegación y manejo de pérdida del contexto WebGL. El usuario decidió postergar la revisión móvil. No hace falta que IRSA esté disponible.
