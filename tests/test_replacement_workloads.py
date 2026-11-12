import csv
import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path

from PIL import Image
from pypdf import PdfWriter

from tasks.csv_deduplicator.processor import run as deduplicate_csv
from tasks.data_preprocessing.processor import run as preprocess_csv
from tasks.file_integrity.processor import run as check_integrity
from tasks.image_optimizer.processor import run as optimize_image
from tasks.image_palette.processor import run as extract_palette
from tasks.pdf_brief.processor import run as summarize_pdf
from tasks.qr_generator.processor import run as generate_qr


class ReplacementWorkloadTests(unittest.TestCase):
    def test_data_preprocessing_normalizes_cells_headers_and_duplicate_rows(self):
        with tempfile.NamedTemporaryFile(mode="w", newline="", encoding="utf-8", suffix=".csv", delete=False) as source:
            source.write(" Full Name ,Years Old,Years Old\n")
            source.write(" Ada Lovelace , 36 , 36 \n")
            source.write(" Ada Lovelace,36,36\n")
            source.write(",,\n")
        output_file = None
        try:
            output_file = preprocess_csv(source.name, "preprocess-test")
            with open(output_file, newline="", encoding="utf-8") as result:
                rows = list(csv.reader(result))
            self.assertEqual(rows, [["full_name", "years_old", "years_old_2"], ["Ada Lovelace", "36", "36"]])
        finally:
            os.unlink(source.name)
            if output_file:
                Path(output_file).unlink(missing_ok=True)

    def test_csv_deduplicator_preserves_first_occurrences(self):
        with tempfile.NamedTemporaryFile(mode="w", newline="", encoding="utf-8", suffix=".csv", delete=False) as source:
            writer = csv.writer(source)
            writer.writerow(["name", "score"])
            writer.writerow(["Ada", "10"])
            writer.writerow(["Lin", "12"])
            writer.writerow(["Ada", "10"])
            input_file = source.name

        output_file = None
        try:
            output_file = deduplicate_csv(input_file, "deduplicator-test")
            with open(output_file, newline="", encoding="utf-8") as result:
                rows = list(csv.reader(result))
            self.assertEqual(rows, [["name", "score"], ["Ada", "10"], ["Lin", "12"]])
        finally:
            os.unlink(input_file)
            if output_file:
                Path(output_file).unlink(missing_ok=True)

    def test_image_palette_reports_dimensions_and_color_shares(self):
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as source:
            input_file = source.name
        output_file = None
        try:
            image = Image.new("RGB", (20, 10), "#ff0000")
            for x in range(5):
                for y in range(10):
                    image.putpixel((x, y), (0, 0, 255))
            image.save(input_file)

            output_file = extract_palette(input_file, "palette-test")
            with open(output_file, encoding="utf-8") as result:
                report = json.load(result)
            self.assertEqual(report["image_size"], {"width": 20, "height": 10})
            self.assertEqual(report["palette"][0]["hex"], "#FF0000")
            self.assertEqual(report["palette"][0]["share_percent"], 75.0)
        finally:
            os.unlink(input_file)
            if output_file:
                Path(output_file).unlink(missing_ok=True)

    def test_qr_generator_creates_png_from_entered_link_file(self):
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".txt", delete=False) as source:
            source.write("https://example.test/docs")
            input_file = source.name
        output_file = None
        try:
            output_file = generate_qr(input_file, "qr-link-test")
            with Image.open(output_file) as image:
                self.assertEqual(image.format, "PNG")
                self.assertGreater(image.width, 100)
                self.assertEqual(image.width, image.height)
        finally:
            os.unlink(input_file)
            if output_file:
                Path(output_file).unlink(missing_ok=True)

    def test_image_optimizer_outputs_resized_webp(self):
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as source:
            input_file = source.name
        output_file = None
        try:
            Image.new("RGB", (2200, 1200), "#7565ed").save(input_file)
            output_file = optimize_image(input_file, "image-opt-test")
            with Image.open(output_file) as result:
                self.assertEqual(result.format, "WEBP")
                self.assertEqual(result.size, (1800, 982))
        finally:
            os.unlink(input_file)
            if output_file:
                Path(output_file).unlink(missing_ok=True)

    def test_pdf_brief_reports_page_count_and_scan_hint(self):
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as source:
            input_file = source.name
        output_file = None
        try:
            writer = PdfWriter()
            writer.add_blank_page(width=72, height=72)
            with open(input_file, "wb") as pdf:
                writer.write(pdf)
            output_file = summarize_pdf(input_file, "pdf-brief-test")
            report = Path(output_file).read_text(encoding="utf-8")
            self.assertIn("Pages: 1", report)
            self.assertIn("this may be a scanned PDF", report)
        finally:
            os.unlink(input_file)
            if output_file:
                Path(output_file).unlink(missing_ok=True)

    def test_file_integrity_report_includes_a_matching_sha256_checksum(self):
        payload = b"verify this daily download"
        with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as source:
            source.write(payload)
            input_file = source.name
        output_file = None
        try:
            output_file = check_integrity(input_file, "file-integrity-test")
            report = json.loads(Path(output_file).read_text(encoding="utf-8"))
            self.assertEqual(report["file_name"], Path(input_file).name)
            self.assertEqual(report["size_bytes"], len(payload))
            self.assertEqual(report["sha256"], hashlib.sha256(payload).hexdigest())
        finally:
            os.unlink(input_file)
            if output_file:
                Path(output_file).unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
