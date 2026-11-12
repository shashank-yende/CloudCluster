import hashlib
import json
import mimetypes
import os
from datetime import datetime, timezone
from pathlib import Path


def run(input_file: str, task_id: str) -> str:
    """Create a SHA-256 checksum and useful metadata report for any uploaded file."""
    if not input_file or not os.path.isfile(input_file):
        raise FileNotFoundError("Choose a file to check.")

    path = Path(input_file)
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)

    report = {
        "file_name": path.name,
        "size_bytes": path.stat().st_size,
        "content_type": mimetypes.guess_type(path.name)[0] or "application/octet-stream",
        "sha256": digest.hexdigest(),
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "how_to_use": "Compare the SHA-256 value with the publisher's checksum to verify this file.",
    }

    output_dir = Path("storage/results")
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / f"{task_id}_integrity.json"
    output_file.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return str(output_file)
