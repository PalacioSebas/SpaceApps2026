# Referencia complementaria con Aladin Lite

`reference.js` monta un panel desplegable que recibe el campo y los catálogos
del anfitrión. La carga externa comienza al abrir el panel. La navegación de
Aladin permanece dentro de la referencia. El botón **Sincronizar campo** lee
de nuevo el contexto actual.

```html
<div id="aladin-reference"></div>
<script src="/static/aladin-reference/reference.js" defer></script>
```

```js
const reference = PapastronomyAladinReference.mount(container, {
  getContext: () => ({
    ra: 133.795129, dec: -7.245147, fov: 0.05,
    selected: { ra: 133.795129, dec: -7.245147 },
    gaia: { sources: [], service: 'IRSA TAP', truncated: false, queryFov: 0.05 },
    allwise: { sources: [], service: 'CDS VizieR', truncated: false, queryFov: 0.05 },
  }),
});
```

`sources` contiene las filas vigentes del backend con `id`, `ra`, `dec`,
`mag`, `pmra` y `pmdec`. Las coordenadas se muestran directamente y las
referencias conservan sus épocas originales. El complemento muestra como
máximo 500 fuentes por catálogo e informa servicio y limitación. Si falta una
consulta, se indica su ausencia. El campo opcional `error` permite mostrar el
estado de esa consulta. `queryFov` conserva el tamaño realmente consultado
cuando difiere del campo SPHEREx, por ejemplo en el mapa continuo.

El contorno del campo usa las esquinas de su proyección tangente. La selección
se dibuja en la capa **Selección al sincronizar**. El botón Sincronizar campo
actualiza esa marca con la selección vigente. El complemento recibe snapshots de los catálogos
y las posiciones de catálogo originales del anfitrión.

La API devuelve `sync()`, `open()` y `destroy()`. `sync()` actualiza el
contexto y devuelve si contiene un campo válido. Con el panel cerrado, esta
operación prepara etiquetas y enlaces. `open()` abre e inicia el visor.
`destroy()` retira el panel, cancela el timeout y libera eventos y observadores.
También se libera al retirar su contenedor del DOM. `pagehide` descarga el iframe
y `pageshow` lo reconstruye si el desplegable sigue abierto, para admitir la
restauración de páginas desde bfcache.

## Biblioteca y fondos

El frame carga el módulo ESM fijo
`https://cdn.jsdelivr.net/npm/aladin-lite@3.8.1/dist/aladin.js`. Se verificó
HTTP 200 y un tamaño de 2 392 227 bytes el 15 de noviembre de 2026. El paquete
exporta `A` por defecto, incluye CSS y WebAssembly en el propio JavaScript,
y expone `A.init` como promesa. El navegador necesita WebGL2.

Los fondos se solicitan directamente a los mirrors HiPS de ESA Sky
`https://skies.esac.esa.int/DSSColor`, `/2MASSColor` y `/AllWISEColor`.
El contenido de los tiles depende de esos servicios externos. El timeout
predeterminado de inicio es de 20 segundos. Ante un fallo se ofrece reintentar
y abrir el servicio oficial en otra pestaña.

Aladin vive en `frame.html`, servido desde el mismo origen. Los mensajes entre
el panel y el frame verifican origen, ventana emisora y token de instancia.
La instancia queda descargada al cerrar el desplegable o destruir el panel,
liberando su realm y el render loop de esta versión de Aladin. Se preservan
el logo y las atribuciones de CDS.

Los enlaces de exportación apuntan a
`/api/tools/catalog.vot?catalog=gaia|allwise&ra=…&dec=…&fov=…`, usando el FoV
de consulta del catálogo cuando existe. El endpoint del anfitrión devuelve
el resultado del backend, con su límite de 2000 fuentes. 2MASS se ofrece
como fondo HiPS.

## Verificación

```powershell
node static/aladin-reference/check.cjs
```

Las pruebas verifican carga diferida, límite de fuentes, coordenadas,
mensajes de ventanas anteriores o de otro origen, timeout, reintento,
desmontaje y construcción de capas mediante un mock de la API. La revisión
visual y el renderizado WebGL requieren un navegador compatible.

Referencias de la implementación

- [API de Aladin Lite](https://cds-astro.github.io/aladin-lite/A.html)
- [Navegación y eventos](https://cds-astro.github.io/aladin-lite/Aladin.html)
- [Catálogos](https://cds-astro.github.io/aladin-lite/Catalog.html)
- [Versión 3.8.1](https://github.com/cds-astro/aladin-lite/releases/tag/v3.8.1)
