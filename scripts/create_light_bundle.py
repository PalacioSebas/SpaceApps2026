"""Empaqueta fuentes y recursos sin historial, entornos ni descargas astronómicas."""

import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
DIRECTORIES = ("src", "static", "tests", "docs", "scripts", ".github")
ROOT_FILES = ("README.md", "requirements.txt", "requirements-dev.txt", "start_project.py",
              "run_project.bat", "run_project.sh", "setup_cache_and_inspect.py",
              ".gitignore", ".gitattributes", "LICENSE", "LICENSE.md", "LICENSE.txt")
SOURCE_SUFFIXES = {".py", ".cjs", ".js", ".css", ".html", ".md", ".json", ".txt", ".yml", ".yaml"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "dist" / "papastronomy-light.zip")
    args = parser.parse_args()
    files = [ROOT / name for name in ROOT_FILES if (ROOT / name).is_file()]
    for directory in DIRECTORIES:
        files.extend(path for path in (ROOT / directory).rglob("*")
                     if path.is_file() and not path.is_symlink()
                     and "__pycache__" not in path.parts
                     and path.suffix in SOURCE_SUFFIXES
                     and not any(part.startswith(".") for part in path.relative_to(ROOT / directory).parts))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(args.output, "w", compression=ZIP_DEFLATED, compresslevel=6) as archive:
        for path in sorted(files):
            archive.write(path, path.relative_to(ROOT).as_posix())
    print("{} | {} archivos | {:.1f} KiB".format(args.output, len(files), args.output.stat().st_size / 1024))
    print("Sin FITS precargados: requiere internet para consultar campos o preparar su cache.")


if __name__ == "__main__":
    main()
