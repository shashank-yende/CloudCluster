from io import BytesIO
from urllib.parse import urlparse

import qrcode

from .common import safe_filename


def run(data: bytes, filename: str, options: dict):
    url = str(options.get("url", "")).strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or len(url) > 4096:
        raise ValueError("Enter a complete link beginning with https:// or http://")
    image = qrcode.make(url, box_size=10, border=3)
    output = BytesIO()
    image.save(output, format="PNG")
    return {"url": url, "format": "PNG", "dimensions": f"{image.width} × {image.height}"}, output.getvalue(), f"{safe_filename(parsed.netloc, 'link')}-qr.png", "image/png"
