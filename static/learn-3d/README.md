# Aprendé en 3D · módulo portable

Primera pieza: una **enana marrón genérica** para rotar, acercar y explorar. Es una ilustración educativa con atmósfera procedural y paletas conceptuales. No reconstruye WISE 0855 ni Epsilon Indi B, no recibe fotometría ni produce resultados científicos. Las referencias de NASA están en `content.js`, revisadas el 14 de noviembre de 2026.

## Probar

Con la app iniciada, abrir `/static/learn-3d/index.html` o el enlace **Aprendé en 3D ↗** de la navegación o del asistente. Se abre otra pestaña para conservar las observaciones actuales. La explicación inicial respeta el estilo simple/técnico del perfil; luego se puede cambiar en el visor. El estilo equilibrado usa la explicación simple.

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

`viewer.js` resuelve su CSS respecto de su propia URL. El contenido actual es fijo y se expone como `window.Papastronomy3DContent`, inmutable. Los únicos valores admitidos por `explanation` son `simple` y `technical`; un valor desconocido usa `simple`. El anfitrión puede cambiar el atributo para seguir el perfil. El componente no lee ni escribe perfiles, almacenamiento o coordenadas.

También se puede usar un iframe con `src="./learn-3d/index.html?explanation=technical"`, `title="Enana marrón educativa en 3D"`, ancho 100% y una altura adecuada al diseño. La página standalone solo muestra el enlace relativo de regreso al explorador si recibe `from=explorer`; ese parámetro pertenece al adaptador actual y debe omitirse o adaptarse en otra aplicación. No acepta URLs de regreso arbitrarias.

Para preservar el estado de una SPA, mostrar el componente en una sección propia sin recargar la aplicación. Al ocultarlo queda suspendido por el observador de visibilidad; al retirarlo del DOM libera observadores, eventos, animación y recursos WebGL. No necesita un método global de montaje. No cargarlo dos veces con catálogos diferentes: esta primera versión admite un único tipo de objeto.

## Controles y límites

- Arrastrar con mouse o un dedo: rotar; al hacerlo, la animación se pausa.
- Con foco en el lienzo: flechas para rotar, `+`/`-` para zoom, espacio para animar/pausar y `0` para restablecer la vista.
- El deslizador de zoom y todos los temas funcionan con teclado. Los puntos numerados son accesos educativos, no posiciones medidas sobre una superficie.
- Las paletas visible/infrarrojo no implementan filtros ni radiometría. No hay escala física, temperatura calculada, órbita ni velocidad científica.
- Se necesita WebGL para la esfera analítica tridimensional; no hay archivo GLB/GLTF. La superficie se calcula en un shader y rota en tres dimensiones. Si WebGL falla, los temas y fuentes siguen disponibles y se ofrece reintentar.
- Movimiento reducido inicia la animación en pausa. La animación se suspende si la pestaña o el componente no están visibles. Se limita la resolución a 1.5 veces el tamaño CSS para contener el trabajo de GPU.

## Verificación

```bash
node --check static/learn-3d/viewer.js
node static/learn-3d/check.cjs
```

`check.cjs` comprueba condiciones y transiciones del componente con elementos mínimos en memoria; no sustituye el navegador ni compila shaders. Antes de integrar, comprobar escritorio y móvil: renderizado WebGL, rotación, zoom, temas, estilos de explicación, paletas, pausa, foco, navegación y manejo de pérdida del contexto WebGL. No hace falta que IRSA esté disponible.
