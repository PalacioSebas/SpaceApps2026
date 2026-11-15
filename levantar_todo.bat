@echo off
setlocal EnableExtensions
rem ==========================================================================
rem  Papastronomy - levanta el visor y las tres landings, cada uno en su ventana.
rem
rem    levantar_todo.bat           levanta todo y abre el navegador
rem    levantar_todo.bat detener   apaga todo lo que este escuchando en esos puertos
rem
rem  Para apagar un servicio solo, cerra su ventana (o Ctrl+C dentro de ella).
rem ==========================================================================

rem Subrutina interna: cada landing corre en su propia ventana llamando a este mismo archivo.
if /i "%~1"==":landing" goto landing_worker

pushd "%~dp0"
if errorlevel 1 exit /b 1

set "PUERTOS=8000 3000 3001 3002"

if /i "%~1"=="detener" goto detener

where node >nul 2>nul
if errorlevel 1 (
    echo No se encontro Node.js. Instalalo desde https://nodejs.org y volve a ejecutar este archivo.
    pause
    popd
    exit /b 1
)

echo.
echo  Papastronomy - levantando todo
echo  ------------------------------
echo   Visor (FastAPI) ........ http://127.0.0.1:8000
echo   Landing principal ...... http://localhost:3000
echo   Landing login .......... http://localhost:3001
echo   Landing LLM ............ http://localhost:3002
echo.

rem Visor: run_project.bat ya prepara el entorno virtual y las dependencias de Python.
start "Papastronomy - Visor :8000" cmd /k call "%~dp0run_project.bat"

call :lanzar_landing "landing"       3000 "Landing principal"
call :lanzar_landing "Landing login" 3001 "Landing login"
call :lanzar_landing "landing LLM"   3002 "Landing LLM"

echo Esperando a que respondan los servidores (la primera vez puede tardar unos minutos)...
call :esperar_y_abrir "http://127.0.0.1:8000/"
call :esperar_y_abrir "http://localhost:3000/"
call :esperar_y_abrir "http://localhost:3001/"
call :esperar_y_abrir "http://localhost:3002/"
echo.
echo Todo levantado. Para apagar todo: levantar_todo.bat detener
popd
exit /b 0


:lanzar_landing
rem %1 carpeta, %2 puerto, %3 nombre visible
if not exist "%~dp0%~1\package.json" (
    echo   [omitida] No existe la carpeta "%~1".
    exit /b 0
)
start "Papastronomy - %~3 :%~2" cmd /k call "%~f0" :landing "%~dp0%~1" %~2
exit /b 0


:esperar_y_abrir
rem Espera hasta 5 minutos a que la URL responda y la abre en el navegador.
set /a "_intentos=0"
:esperar_bucle
curl.exe -s -o nul --max-time 5 "%~1" && goto esperar_ok
set /a "_intentos+=1"
if %_intentos% geq 150 (
    echo   [sin respuesta] %~1 - revisa su ventana para ver el error.
    exit /b 0
)
timeout /t 2 /nobreak >nul
goto esperar_bucle
:esperar_ok
echo   [listo] %~1
start "" "%~1"
exit /b 0


:landing_worker
rem %2 carpeta absoluta, %3 puerto. Usa la version de pnpm que fija el package.json.
cd /d "%~2" || exit /b 1
set "PM=pnpm"
for /f "usebackq tokens=1 delims=+" %%v in (`node -p "require('./package.json').packageManager || 'pnpm'"`) do set "PM=%%v"
if not exist "node_modules\" (
    echo Instalando dependencias con %PM% ^(solo la primera vez^)...
    call npx --yes %PM% install --frozen-lockfile
    if errorlevel 1 (
        echo La instalacion fallo; revisa el error de arriba.
        exit /b 1
    )
)
call npx --yes %PM% dev --port %~3
exit /b %errorlevel%


:detener
echo Apagando los servicios en los puertos %PUERTOS%...
powershell -NoProfile -Command "foreach ($p in '%PUERTOS%'.Split(' ')) { $ids = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if ($ids) { $ids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }; Write-Host ('  puerto ' + $p + ': apagado') } else { Write-Host ('  puerto ' + $p + ': no estaba activo') } }"
popd
exit /b 0
