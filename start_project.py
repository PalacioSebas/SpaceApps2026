"""Lanzador compartido por Windows y Linux; solo usa la biblioteca estándar.

Este archivo puede mostrar un error comprensible con Python 3.8/3.9 sin
importar el backend, que requiere Python 3.10 o posterior.
"""

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import venv


BASE_DIR = Path(__file__).resolve().parent
MIN_PYTHON = (3, 10)
MAX_PYTHON = (3, 15)  # extremo exclusivo; ampliar después de validar dependencias


class LaunchError(RuntimeError):
    pass


def check_version(version):
    pair = tuple(version[:2])
    if not MIN_PYTHON <= pair < MAX_PYTHON:
        raise LaunchError(
            "Python {}.{} no es compatible. Usa Python 3.10-3.14; "
            "se recomienda 3.12. No se modifico el entorno existente.".format(*pair)
        )


def environment_python(directory, windows=None):
    if windows is None:
        windows = os.name == "nt"
    return directory / ("Scripts/python.exe" if windows else "bin/python")


def inspect_interpreter(executable):
    try:
        result = subprocess.run(
            [str(executable), "-c", "import json,sys; print(json.dumps(list(sys.version_info[:3])))"],
            check=True, capture_output=True, text=True, timeout=15,
        )
        version = json.loads(result.stdout)
        check_version(version)
        return version
    except (OSError, subprocess.SubprocessError, ValueError) as exc:
        raise LaunchError(
            "No se pudo usar el Python de {}. El entorno puede estar movido o danado. "
            "Conservalo y crea otro con --venv .venv-nueva.".format(executable)
        ) from exc


def ensure_environment(directory):
    executable = environment_python(directory)
    if executable.is_file():
        inspect_interpreter(executable)
        return executable
    if directory.exists() and any(directory.iterdir()):
        raise LaunchError(
            "{} ya existe pero no contiene un entorno valido para este sistema. "
            "Puede pertenecer a Windows/Linux o a otra instalacion. No se borro. "
            "Usa --venv .venv-nueva o renombra esa carpeta manualmente.".format(directory)
        )
    print("[1/3] Creando entorno virtual: {}".format(directory), flush=True)
    try:
        venv.EnvBuilder(with_pip=True).create(str(directory))
    except (OSError, subprocess.SubprocessError) as exc:
        raise LaunchError(
            "No se pudo crear el entorno. Verifica que el modulo venv/ensurepip de este "
            "Python este instalado y que puedas escribir en la carpeta. Detalle: {}".format(exc)
        ) from exc
    inspect_interpreter(executable)
    return executable


def run(command, environment):
    try:
        return subprocess.run(command, cwd=str(BASE_DIR), env=environment).returncode
    except OSError as exc:
        raise LaunchError("No se pudo ejecutar {}: {}".format(command[0], exc)) from exc


def main(argv=None):
    parser = argparse.ArgumentParser(description="Inicia Papastronomy en Windows o Linux.")
    parser.add_argument("--venv", default=".venv", help="Carpeta del entorno, relativa al proyecto.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="Comprueba el interprete sin instalar ni iniciar.")
    mode.add_argument("--setup-only", action="store_true", help="Prepara dependencias sin iniciar el servidor.")
    mode.add_argument("--test", action="store_true", help="Prepara dependencias de desarrollo y ejecuta las pruebas.")
    parser.add_argument("--no-install", action="store_true", help="Reutiliza las dependencias ya instaladas.")
    args, server_args = parser.parse_known_args(argv)
    check_version(sys.version_info)
    directory = Path(args.venv)
    if not directory.is_absolute():
        directory = BASE_DIR / directory
    directory = directory.resolve()
    print("Papastronomy | Python {}.{}.{} | {}".format(*sys.version_info[:3], sys.platform), flush=True)
    executable = environment_python(directory)
    if args.check:
        if executable.is_file():
            version = inspect_interpreter(executable)
            print("Entorno existente: Python {}.{}.{} | {}".format(*version, executable))
        elif directory.exists() and any(directory.iterdir()):
            raise LaunchError("El entorno {} no corresponde a este sistema; se conservo intacto.".format(directory))
        else:
            print("Interprete compatible. Se crearia el entorno en {}.".format(directory))
        return 0
    executable = ensure_environment(directory)
    environment = os.environ.copy()
    environment.setdefault("MPLCONFIGDIR", str(BASE_DIR / ".matplotlib"))
    if not args.no_install:
        print("[2/3] Instalando dependencias compatibles en el entorno virtual...", flush=True)
        code = run([str(executable), "-m", "pip", "install", "--disable-pip-version-check",
                    "--prefer-binary", "-r", str(BASE_DIR / ("requirements-dev.txt" if args.test else "requirements.txt"))], environment)
        if code:
            print("La instalacion fallo. Revisa el error anterior; no se inicio el servidor.", file=sys.stderr)
            return code
    if args.test:
        return run([str(executable), "-m", "unittest", "discover", "-s", "tests", "-v"], environment)
    if args.setup_only:
        print("Entorno preparado: {}".format(executable))
        return 0
    print("[3/3] Servidor: http://127.0.0.1:8000 (Ctrl+C para detener)", flush=True)
    return run([str(executable), "-m", "uvicorn", "src.main:app", "--host", "127.0.0.1",
                "--port", "8000", "--reload"] + server_args, environment)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except LaunchError as error:
        print("Error: {}".format(error), file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        sys.exit(130)
