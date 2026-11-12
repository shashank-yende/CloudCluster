from collections import Counter
from io import BytesIO
from pathlib import Path, PurePosixPath
import zipfile

from .common import require_file, safe_filename


EXT_CATEGORIES = {"Images": {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}, "Documents": {".pdf", ".doc", ".docx", ".txt", ".md", ".rtf"}, "Sheets": {".csv", ".xls", ".xlsx", ".json"}, "Media": {".mp3", ".wav", ".mp4", ".mov"}, "Code": {".py", ".js", ".ts", ".html", ".css", ".java", ".go", ".rs"}}


def _safe_member(path: str) -> str:
    normalized = path.replace("\\", "/")
    pure = PurePosixPath(normalized)
    if pure.is_absolute() or ".." in pure.parts or not pure.parts:
        raise ValueError("The archive contains an unsafe file path and could not be organized.")
    return "/".join(part for part in pure.parts if part not in {"", "."})


def run(data: bytes, filename: str, options: dict):
    require_file(data, filename)
    output = BytesIO()
    counts = Counter()
    moved = 0
    try:
        with zipfile.ZipFile(BytesIO(data)) as source, zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as target:
            infos = [info for info in source.infolist() if not info.is_dir()]
            if len(infos) > 500:
                raise ValueError("Archives can contain up to 500 files.")
            if sum(info.file_size for info in infos) > 100 * 1024 * 1024:
                raise ValueError("The expanded archive must be 100 MB or smaller.")
            for info in infos:
                original = _safe_member(info.filename)
                ext = Path(original).suffix.lower()
                category = next((name for name, extensions in EXT_CATEGORIES.items() if ext in extensions), "Other")
                destination = f"{category}/{PurePosixPath(original).name}"
                if destination != original:
                    moved += 1
                counts[category] += 1
                target.writestr(destination, source.read(info))
    except zipfile.BadZipFile as error:
        raise ValueError("Upload a valid ZIP archive.") from error
    except (RuntimeError, OSError) as error:
        raise ValueError("The archive could not be read safely.") from error
    return {"files": sum(counts.values()), "categories": dict(counts), "organized": moved}, output.getvalue(), f"{Path(safe_filename(filename)).stem}-organized.zip", "application/zip"
