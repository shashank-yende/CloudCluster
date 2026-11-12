import qrcode
from PIL import Image
import os

def run(input_file: str, task_id: str) -> str:
    """
    Generates a high-quality QR code image automatically sizing version to avoid overflow errors.
    """
    os.makedirs("storage/results", exist_ok=True)
    
    data = f"CloudCluster://workload/{task_id}"
    if input_file and os.path.exists(input_file):
        try:
            with open(input_file, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read().strip()
                if content:
                    data = content
        except Exception:
            pass

    # version=None allows automatic sizing from 1 to 40 without raising Version Error
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(data)
    qr.make(fit=True)

    img = qr.make_image(fill_color="#0f172a", back_color="#ffffff").convert('RGB')
    output_filename = f"storage/results/{task_id}_qrcode.png"
    img.save(output_filename, format="PNG")

    return output_filename
