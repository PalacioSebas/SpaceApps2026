# Landing de Papastronomy

La landing usa Next.js; el explorador científico usa FastAPI. Se ejecutan por
separado. Los datos de la demostración visual de la landing son ilustrativos.

## Arranque en Windows

Desde la raíz del repositorio, en una terminal:

```powershell
.\run_project.bat
```

Explorador: <http://127.0.0.1:8000>.

En otra terminal:

```powershell
cd landing
npm exec --yes --package=pnpm@10.34.3 -- pnpm install --frozen-lockfile
npm run dev
```

Landing: <http://localhost:3000>. Detener cada servidor con Ctrl+C en su terminal.
La instalación solo hace falta la primera vez o cuando cambien las dependencias.
Se necesita Node compatible con Next.js 16 y npm; en esta PC se verificó con
Node 26.13.1. Si PowerShell bloquea `npm.ps1`, usar `npm.cmd`.

Si Node está instalado pero todavía no figura en el PATH de la terminal:

```powershell
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
```

En Linux/macOS, arrancar el explorador con `bash run_project.sh` y usar los mismos
comandos npm dentro de `landing/`.

## Destino de los botones de acceso

Los botones «Explore Papastronomy» abren el explorador en
`http://127.0.0.1:8000`. Para otro entorno, definir antes de `npm run build`:

```powershell
$env:NEXT_PUBLIC_EXPLORER_URL = 'https://explorer.example.org'
```

La URL pública se incorpora al build. No incluir secretos en esta variable.

## Verificación y ejecución de producción

```powershell
npm run lint
npm run build
npm start
```

`npm start` utiliza el último build: repetir el build después de editar las
fuentes. Para desarrollo, `npm run dev` actualiza la página durante los cambios.
