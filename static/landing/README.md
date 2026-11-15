# Landing `/main`

Página de presentación del proyecto. FastAPI la sirve en `/main` (ver `serve_landing` en `src/main.py`).

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | Contenido fijo de la página: hero, proyecto, cómo funciona, objetivos y pie. |
| `landing.css` | Estilos. No usa librerías ni fuentes externas. |
| `landing.js` | Dibuja la bitácora de desarrollo a partir de `desarrollo.json`. |
| `desarrollo.json` | Entradas de la bitácora. **Para sumar avances, editá solo este archivo.** |
| `img/` | Capturas e imágenes de la bitácora. |

## Agregar una entrada a la bitácora

1. Copiá la imagen en `static/landing/img/`, por ejemplo `img/flipbook-wise0855.png`.
   Conviene `.webp` o `.jpg`, de 1600 px de ancho como máximo.
2. Agregá un objeto **al principio** de `entradas` en `desarrollo.json`. Las entradas se muestran en el orden del archivo:

```json
{
  "fecha": "2026-11-20",
  "etiqueta": "Visor",
  "titulo": "Flipbook más rápido",
  "texto": ["Primer párrafo.", "Segundo párrafo (opcional)."],
  "imagenes": [
    { "src": "img/flipbook-wise0855.png", "alt": "Flipbook de WISE 0855", "pie": "WISE 0855 en 10 épocas." }
  ]
}
```

- `fecha` (AAAA-MM-DD), `etiqueta`, `texto` e `imagenes` son opcionales; `titulo` no.
- Para reservar el lugar de una imagen que todavía no existe, usá `{ "pendiente": "Descripción" }`.
  Cuando la tengas, reemplazalo por `{ "src": ..., "alt": ..., "pie": ... }`.

No hace falta reiniciar el servidor: alcanza con recargar la página.
