from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from .common import require_file, safe_filename


def run(data: bytes, filename: str, options: dict):
    require_file(data, filename)
    try:
        with Image.open(BytesIO(data)) as source:
            source = ImageOps.exif_transpose(source)
            original = source.size
            max_edge = int(options.get("max_edge", 1800))
            max_edge = min(max(max_edge, 256), 4000)
            source.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
            image = source.convert("RGB") if source.mode not in {"RGB", "L"} else source
            output = BytesIO()
            image.save(output, format="WEBP", quality=82, method=5)
    except (UnidentifiedImageError, OSError) as error:
        raise ValueError("That file could not be opened as an image. Try PNG, JPEG, or WebP.") from error
    result = {"original_bytes": len(data), "optimized_bytes": len(output.getvalue()), "original_dimensions": f"{original[0]} × {original[1]}", "optimized_dimensions": f"{image.width} × {image.height}", "format": "WebP"}
    return result, output.getvalue(), f"{Path(safe_filename(filename)).stem}-optimized.webp", "image/webp"
