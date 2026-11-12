from __future__ import annotations

import re
from pathlib import PurePath


def safe_filename(value: str, fallback: str = "input") -> str:
    name = PurePath(value.replace("\\", "/")).name
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._")
    return (name or fallback)[:180]


def require_file(data: bytes, filename: str) -> None:
    if not data:
        raise ValueError("Choose a file before starting this workload.")
    if len(data) > 20 * 1024 * 1024:
        raise ValueError("Files must be smaller than 20 MB.")
    if not filename:
        raise ValueError("The uploaded file needs a filename.")
