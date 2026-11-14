"""Regresiones de arranque: preservar entornos y fallar antes de instalar."""

import os
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import start_project as launcher


class LauncherTests(unittest.TestCase):
    def test_supported_versions_include_the_existing_team_versions(self):
        for minor in (10, 11, 12, 13, 14):
            launcher.check_version((3, minor, 0))

    def test_unsupported_python_is_rejected_before_creating_environment(self):
        with TemporaryDirectory() as root:
            directory = Path(root) / "new-env"
            with patch.object(launcher.sys, "version_info", (3, 9, 0)), \
                 patch.object(launcher.venv, "EnvBuilder") as builder:
                with self.assertRaises(launcher.LaunchError):
                    launcher.main(["--venv", str(directory), "--setup-only"])
                builder.assert_not_called()
            self.assertFalse(directory.exists())

    def test_unvalidated_future_python_is_not_selected_silently(self):
        with self.assertRaises(launcher.LaunchError):
            launcher.check_version((3, 15, 0))

    def test_existing_environment_from_another_os_is_not_overwritten(self):
        with TemporaryDirectory() as root:
            directory = Path(root) / ".venv"
            foreign_python = launcher.environment_python(directory, windows=os.name != "nt")
            foreign_python.parent.mkdir(parents=True)
            foreign_python.write_text("preserve me")
            with patch.object(launcher.venv, "EnvBuilder") as builder:
                with self.assertRaises(launcher.LaunchError):
                    launcher.ensure_environment(directory)
                builder.assert_not_called()
            self.assertEqual(foreign_python.read_text(), "preserve me")

    def test_existing_compatible_environment_is_reused(self):
        with TemporaryDirectory() as root:
            directory = Path(root)
            executable = launcher.environment_python(directory)
            executable.parent.mkdir(parents=True)
            executable.touch()
            with patch.object(launcher, "inspect_interpreter", return_value=[3, 10, 22]), \
                 patch.object(launcher.venv, "EnvBuilder") as builder:
                self.assertEqual(launcher.ensure_environment(directory), executable)
                builder.assert_not_called()

    def test_install_failure_does_not_start_uvicorn(self):
        with patch.object(launcher, "ensure_environment", return_value=Path(sys.executable)), \
             patch.object(launcher, "run", return_value=7) as run:
            self.assertEqual(launcher.main([]), 7)
            self.assertEqual(run.call_count, 1)
            self.assertIn("pip", run.call_args.args[0])

    def test_check_mode_does_not_create_or_install_anything(self):
        with TemporaryDirectory() as root:
            directory = Path(root) / "new-env"
            with patch.object(launcher, "run") as run:
                self.assertEqual(launcher.main(["--check", "--venv", str(directory)]), 0)
                run.assert_not_called()
            self.assertFalse(directory.exists())

    def test_reload_is_opt_in_for_development(self):
        with patch.object(launcher, "ensure_environment", return_value=Path(sys.executable)), \
             patch.object(launcher, "run", return_value=0) as run:
            launcher.main(["--no-install"])
            self.assertNotIn("--reload", run.call_args.args[0])
            launcher.main(["--no-install", "--reload"])
            self.assertEqual(run.call_args.args[0].count("--reload"), 1)

    def test_interpreter_can_be_inspected_without_project_dependencies(self):
        version = launcher.inspect_interpreter(Path(sys.executable))
        self.assertEqual(tuple(version[:2]), tuple(sys.version_info[:2]))


class WrapperTests(unittest.TestCase):
    def run_wrapper(self, broken=False):
        # Ejercita rutas con espacios y un directorio de trabajo ajeno al proyecto.
        with TemporaryDirectory(prefix="papastronomy launch ") as root:
            directory = Path(root) / "project with spaces"
            directory.mkdir()
            suffix = ".bat" if os.name == "nt" else ".sh"
            script = directory / ("run_project" + suffix)
            shutil.copyfile(launcher.BASE_DIR / script.name, script)
            bootstrap = directory / "start_project.py"
            if broken:
                bootstrap.write_text("raise SystemExit(9)\n")
            else:
                shutil.copyfile(launcher.BASE_DIR / "start_project.py", bootstrap)
            environment = os.environ.copy()
            environment["PAPASTRONOMY_PYTHON"] = sys.executable
            command = [str(script), "--check"] if os.name == "nt" else ["bash", str(script), "--check"]
            return subprocess.run(command, cwd=root, env=environment, shell=os.name == "nt",
                                  capture_output=True, text=True, timeout=30)

    def test_native_wrapper_works_from_another_directory_with_spaces(self):
        result = self.run_wrapper()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Interprete compatible", result.stdout)

    def test_native_wrapper_propagates_python_exit_code(self):
        result = self.run_wrapper(broken=True)
        self.assertEqual(result.returncode, 9, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
