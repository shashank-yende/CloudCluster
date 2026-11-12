import csv
import io
import json
import zipfile
from io import BytesIO

import pytest
from PIL import Image
from pypdf import PdfWriter

from app.tasks import csv_cleanup, data_convert, image_optimize, link_qr, pdf_brief, zip_organize


def test_link_qr_requires_http_url_and_creates_png():
    with pytest.raises(ValueError):
        link_qr.run(b"", "", {"url": "javascript:alert(1)"})
    summary, artifact, name, mime = link_qr.run(b"", "", {"url": "https://example.com/hello"})
    assert summary["url"] == "https://example.com/hello"
    assert name.endswith("-qr.png") and mime == "image/png"
    assert Image.open(BytesIO(artifact)).format == "PNG"


def test_csv_cleanup_trims_deduplicates_and_discards_blank_rows():
    data = b"name, city\n Avery , London \nAvery,London\n , \nCasey,Paris\n"
    result, artifact, _, mime = csv_cleanup.run(data, "contacts.csv", {})
    rows = list(csv.DictReader(io.StringIO(artifact.decode())))
    assert result["rows_after"] == 2
    assert result["duplicates_and_blank_rows_removed"] == 2
    assert rows[0] == {"name": "Avery", "city": "London"}
    assert mime == "text/csv"


def test_csv_json_converts_both_directions():
    result, artifact, _, mime = data_convert.run(b"name,age\nAvery,31\n", "people.csv", {})
    assert json.loads(artifact)[0] == {"name": "Avery", "age": "31"}
    assert result["converted_to"] == "JSON" and mime == "application/json"
    result, artifact, _, _ = data_convert.run(b'[{"name":"Avery","age":31}]', "people.json", {})
    assert list(csv.DictReader(io.StringIO(artifact.decode())))[0] == {"name": "Avery", "age": "31"}
    assert result["converted_to"] == "CSV"


def test_image_optimizer_resizes_and_outputs_webp():
    image = Image.new("RGB", (2400, 1200), (92, 115, 160))
    source = BytesIO(); image.save(source, format="PNG")
    result, artifact, name, mime = image_optimize.run(source.getvalue(), "photo.png", {"max_edge": 1000})
    output = Image.open(BytesIO(artifact))
    assert output.format == "WEBP"
    assert max(output.size) <= 1024
    assert result["original_bytes"] > result["optimized_bytes"]
    assert name == "photo-optimized.webp" and mime == "image/webp"


def test_pdf_brief_reports_pages_and_handles_empty_selectable_text():
    writer = PdfWriter(); writer.add_blank_page(width=300, height=300)
    source = BytesIO(); writer.write(source)
    result, artifact, name, mime = pdf_brief.run(source.getvalue(), "notes.pdf", {})
    assert result["pages"] == 1
    assert "No selectable text" in result["note"]
    assert b"PDF brief" in artifact and name == "notes-brief.txt" and mime == "text/plain"


def test_zip_organizer_sorts_files_and_rejects_traversal():
    source = BytesIO()
    with zipfile.ZipFile(source, "w") as archive:
        archive.writestr("family/photo.png", b"image")
        archive.writestr("todo.txt", b"note")
    result, artifact, name, mime = zip_organize.run(source.getvalue(), "bundle.zip", {})
    with zipfile.ZipFile(BytesIO(artifact)) as organized:
        assert set(organized.namelist()) == {"Images/photo.png", "Documents/todo.txt"}
    assert result["files"] == 2 and name == "bundle-organized.zip" and mime == "application/zip"

    malicious = BytesIO()
    with zipfile.ZipFile(malicious, "w") as archive:
        archive.writestr("../outside.txt", b"no")
    with pytest.raises(ValueError, match="unsafe"):
        zip_organize.run(malicious.getvalue(), "malicious.zip", {})
