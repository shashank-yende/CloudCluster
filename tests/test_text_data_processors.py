import csv
import json
import os
import tempfile
import unittest
from pathlib import Path

from tasks.csv_profiler.processor import run as profile_csv
from tasks.csv_json_converter.processor import run as convert_csv_json
from tasks.text_analyzer.processor import run as analyze_text


class TextAndDataProcessorTests(unittest.TestCase):
    def test_csv_profiler_emits_json_numeric_and_category_summaries(self):
        with tempfile.NamedTemporaryFile(
            mode="w", newline="", encoding="utf-8", suffix=".csv", delete=False
        ) as source:
            writer = csv.DictWriter(source, fieldnames=["score", "team"])
            writer.writeheader()
            writer.writerows([
                {"score": "2", "team": "blue"},
                {"score": "4", "team": "blue"},
                {"score": "", "team": "gold"},
            ])
            input_file = source.name

        output_file = None
        try:
            output_file = profile_csv(input_file, "csv-profile-test")
            with open(output_file, encoding="utf-8") as result:
                report = json.load(result)

            self.assertEqual(report["row_count"], 3)
            self.assertEqual(report["column_count"], 2)
            self.assertEqual(report["columns"]["score"]["missing_values"], 1)
            self.assertEqual(report["columns"]["score"]["mean"], 3.0)
            self.assertEqual(report["columns"]["team"]["top_values"][0], {"value": "blue", "count": 2})
        finally:
            os.unlink(input_file)
            if output_file:
                Path(output_file).unlink(missing_ok=True)

    def test_text_analyzer_emits_json_counts_and_top_words(self):
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", suffix=".txt", delete=False
        ) as source:
            source.write("Cloud data. Cloud systems!")
            input_file = source.name

        output_file = None
        try:
            output_file = analyze_text(input_file, "text-analysis-test")
            with open(output_file, encoding="utf-8") as result:
                report = json.load(result)

            self.assertEqual(report["word_count"], 4)
            self.assertEqual(report["line_count"], 1)
            self.assertEqual(report["top_words"][0], {"word": "cloud", "count": 2})
        finally:
            os.unlink(input_file)
            if output_file:
                Path(output_file).unlink(missing_ok=True)

    def test_csv_json_converter_converts_csv_and_json_records(self):
        with tempfile.NamedTemporaryFile(
            mode="w", newline="", encoding="utf-8", suffix=".csv", delete=False
        ) as source:
            writer = csv.DictWriter(source, fieldnames=["name", "score"])
            writer.writeheader()
            writer.writerow({"name": "Ada", "score": "10"})
            input_file = source.name

        csv_output = None
        json_input = None
        json_output = None
        try:
            csv_output = convert_csv_json(input_file, "csv-json-convert-test")
            with open(csv_output, encoding="utf-8") as result:
                self.assertEqual(json.load(result), [{"name": "Ada", "score": "10"}])

            with tempfile.NamedTemporaryFile(
                mode="w", encoding="utf-8", suffix=".json", delete=False
            ) as source:
                json.dump([{"name": "Ada", "score": 10}, {"name": "Lin", "city": "Oslo"}], source)
                json_input = source.name

            json_output = convert_csv_json(json_input, "json-csv-convert-test")
            with open(json_output, newline="", encoding="utf-8") as result:
                rows = list(csv.DictReader(result))
            self.assertEqual(rows, [
                {"name": "Ada", "score": "10", "city": ""},
                {"name": "Lin", "score": "", "city": "Oslo"},
            ])
        finally:
            os.unlink(input_file)
            if json_input:
                os.unlink(json_input)
            if csv_output:
                Path(csv_output).unlink(missing_ok=True)
            if json_output:
                Path(json_output).unlink(missing_ok=True)

    def test_processors_require_existing_input_files(self):
        with self.assertRaises(FileNotFoundError):
            profile_csv("missing.csv", "missing-csv")
        with self.assertRaises(FileNotFoundError):
            analyze_text("missing.txt", "missing-text")
        with self.assertRaises(FileNotFoundError):
            convert_csv_json("missing.csv", "missing-converter")


if __name__ == "__main__":
    unittest.main()
