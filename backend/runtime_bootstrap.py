from __future__ import annotations

import os
import sys
from pathlib import Path


def _candidate_interpreters() -> list[Path]:
    backend_dir = Path(__file__).resolve().parent
    return [
        backend_dir / ".venv" / "bin" / "python",
        backend_dir / ".venv" / "Scripts" / "python.exe",
    ]


def preferred_interpreter() -> Path | None:
    current = Path(sys.executable).absolute()
    for candidate in _candidate_interpreters():
        if candidate.exists():
            absolute_candidate = candidate.absolute()
            if absolute_candidate == current:
                return None
            return absolute_candidate
    return None


def ensure_project_python() -> None:
    candidate = preferred_interpreter()
    if candidate is None:
        return

    os.execv(str(candidate), [str(candidate), *sys.argv])
