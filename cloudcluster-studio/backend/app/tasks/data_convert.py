import csv
import io
import json
from pathlib import Path

from .common import require_file, safe_filename


def run(data: bytes, filename: str, options: dict):
    require_file(data, filename)
    name = safe_filename(filename)
    extension = Path(name).suffix.lower()
    try:
        text = data.decode("utf-8-sig")
        if extension == ".csv":
            rows = list(csv.DictReader(io.StringIO(text, newline="")))
            if not rows:
                raise ValueError("The CSV needs a header and at least one data row.")
            output = json.dumps(rows, ensure_ascii=False, indent=2).encode("utf-8")
            target = f"{Path(name).stem}.json"
            mime = "application/json"
            summary = {"converted_from": "CSV", "converted_to": "JSON", "records": len(rows)}
        elif extension == ".json":
            value = json.loads(text)
            if not isinstance(value, list) or not value or not all(isinstance(row, dict) for row in value):
                raise ValueError("JSON to CSV expects a non-empty array of objects.")
            columns = list(dict.fromkeys(key for row in value for key in row.keys()))
            output_stream = io.StringIO(newline="")
            writer = csv.DictWriter(output_stream, fieldnames=columns, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(value)
            output = output_stream.getvalue().encode("utf-8")
            target = f"{Path(name).stem}.csv"
            mime = "text/csv"
            summary = {"converted_from": "JSON", "converted_to": "CSV", "records": len(value), "columns": len(columns)}
        else:
            raise ValueError("Use a .csv file to create JSON, or a .json array of objects to create CSV.")
    except UnicodeDecodeError as error:
        raise ValueError("Please upload a UTF-8 encoded file.") from error
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid JSON near character {error.pos}.") from error
    return summary, output, target, mime
