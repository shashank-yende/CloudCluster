import json
import os
from pathlib import Path

from PIL import Image


def run(input_file: str, task_id: str) -> str:
    """Extract a compact dominant-color palette and image dimensions."""
    if not input_file or not os.path.isfile(input_file):
        raise FileNotFoundError(f"Input image not found: {input_file}")

    with Image.open(input_file) as source:
        width, height = source.size
        sample = source.convert("RGB")
        sample.thumbnail((384, 384))
        quantized = sample.quantize(colors=6, method=Image.Quantize.MEDIANCUT)
        colors = sorted(quantized.getcolors(384 * 384) or [], reverse=True)
        palette_rgb = quantized.getpalette()
        total = sum(count for count, _ in colors) or 1
        palette = []
        for count, color_index in colors[:6]:
            red, green, blue = palette_rgb[color_index * 3:color_index * 3 + 3]
            palette.append({
                "hex": f"#{red:02X}{green:02X}{blue:02X}",
                "pixels": count,
                "share_percent": round(count / total * 100, 2),
            })

    os.makedirs("storage/results", exist_ok=True)
    output_file = f"storage/results/{task_id}_palette.json"
    with open(output_file, "w", encoding="utf-8") as report_file:
        json.dump({
            "source_file": Path(input_file).name,
            "image_size": {"width": width, "height": height},
            "sampled_size": {"width": sample.width, "height": sample.height},
            "palette": palette,
        }, report_file, indent=2)
    return output_file
