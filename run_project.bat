@echo off
setlocal
rem Solo buscar interpretes instalados, sin descargas automaticas del gestor.
set "PYTHON_MANAGER_AUTOMATIC_INSTALL=false"
set "PYLAUNCHER_ALLOW_INSTALL="
set "PYLAUNCHER_ALWAYS_INSTALL="
pushd "%~dp0"
if errorlevel 1 exit /b 1
set "PAPASTRONOMY_EXIT_CODE=1"

if defined PAPASTRONOMY_PYTHON goto custom_python
if exist ".venv\Scripts\python.exe" goto existing_python
where py >nul 2>nul
if errorlevel 1 goto path_python
for %%V in (3.12 3.13 3.14 3.11 3.10) do (
    py -%%V -c "import sys; sys.exit(not ((3, 10) <= sys.version_info[:2] < (3, 15)))" >nul 2>nul
    if not errorlevel 1 (
        set "PAPASTRONOMY_VERSION=%%V"
        goto python_launcher
    )
)

:path_python
where python >nul 2>nul
if errorlevel 1 goto missing_python
python -c "import sys; sys.exit(not ((3, 10) <= sys.version_info[:2] < (3, 15)))" >nul 2>nul
if errorlevel 1 goto missing_python
python "%~dp0start_project.py" %*
set "PAPASTRONOMY_EXIT_CODE=%errorlevel%"
goto finished

:python_launcher
py -%PAPASTRONOMY_VERSION% "%~dp0start_project.py" %*
set "PAPASTRONOMY_EXIT_CODE=%errorlevel%"
goto finished

:existing_python
".venv\Scripts\python.exe" "%~dp0start_project.py" %*
set "PAPASTRONOMY_EXIT_CODE=%errorlevel%"
goto finished

:custom_python
"%PAPASTRONOMY_PYTHON%" "%~dp0start_project.py" %*
set "PAPASTRONOMY_EXIT_CODE=%errorlevel%"
goto finished

:missing_python
echo No se encontro Python 3.10-3.14. Se recomienda 3.12.
echo Instala Python o indica su ejecutable con PAPASTRONOMY_PYTHON.

:finished
popd
exit /b %PAPASTRONOMY_EXIT_CODE%
