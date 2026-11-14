"""Rutas portables para manifiestos creados en Windows, Linux o macOS."""

from pathlib import Path, PureWindowsPath


def resolve_cached_path(raw_path: str, directory: Path) -> Path:
    # Priorizar el archivo junto al manifiesto evita depender de otra instalación.
    name = PureWindowsPath(raw_path).name
    local = directory / name
    if name and local.is_file():
        return local
    return Path(raw_path)
