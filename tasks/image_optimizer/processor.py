import os
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError


def run(input_file: str, task_id: str) -> str:
    """Resize an image proportionally and compress it to WebP."""
    if not input_file or not os.path.exists(input_file):
        raise FileNotFoundError("An image input file is required.")
    try:
        with Image.open(input_file) as source:
            image = ImageOps.exif_transpose(source)
            image.thumbnail((1800, 1800), Image.Resampling.LANCZOS)
            if "A" in image.getbands():
                image = image.convert("RGBA")
            else:
                image = image.convert("RGB")
            os.makedirs("storage/results", exist_ok=True)
            output_file = Path("storage/results") / f"{task_id}_optimized.webp"
            image.save(output_file, format="WEBP", quality=82, method=5)
    except (UnidentifiedImageError, OSError) as error:
        raise ValueError("That file could not be opened as a supported image.") from error
    return str(output_file)
