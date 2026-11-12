from .tasks import csv_cleanup, data_convert, image_optimize, link_qr, pdf_brief, zip_organize


TASKS = {
    "link-qr": {"title": "Link QR maker", "category": "Quick", "complexity": 1, "description": "Turn any web link into a crisp, downloadable QR code.", "input": "url", "accept": "", "icon": "QrCode", "color": "violet", "run": link_qr.run},
    "csv-clean": {"title": "CSV cleanup", "category": "Quick", "complexity": 1, "description": "Trim messy cells, remove blank rows, and deduplicate records.", "input": "file", "accept": ".csv,text/csv", "icon": "ListFilter", "color": "mint", "run": csv_cleanup.run},
    "data-convert": {"title": "CSV ↔ JSON", "category": "Standard", "complexity": 2, "description": "Convert a tabular file into a clean format for your next tool.", "input": "file", "accept": ".csv,.json,text/csv,application/json", "icon": "ArrowLeftRight", "color": "blue", "run": data_convert.run},
    "image-optimize": {"title": "Image optimizer", "category": "Standard", "complexity": 2, "description": "Resize and compress photos into compact WebP files.", "input": "file", "accept": "image/*", "icon": "Image", "color": "orange", "run": image_optimize.run},
    "pdf-brief": {"title": "PDF brief", "category": "Advanced", "complexity": 3, "description": "Get page, word, title, and recurring-term highlights.", "input": "file", "accept": ".pdf,application/pdf", "icon": "FileText", "color": "rose", "run": pdf_brief.run},
    "zip-organize": {"title": "ZIP organizer", "category": "Advanced", "complexity": 3, "description": "Sort archive contents into useful folders by file type.", "input": "file", "accept": ".zip,application/zip", "icon": "FolderTree", "color": "amber", "run": zip_organize.run},
}


def public_task(task_id: str, spec: dict) -> dict:
    return {key: value for key, value in spec.items() if key != "run"} | {"id": task_id}
