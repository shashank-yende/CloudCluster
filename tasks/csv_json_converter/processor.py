import csv
import json
import os


def _json_cell(value):
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    if value is None:
        return ""
    return value


def _convert_csv(input_file: str, output_file: str) -> None:
    with open(input_file, newline="", encoding="utf-8-sig") as source:
        reader = csv.DictReader(source)
        if not reader.fieldnames:
            raise ValueError("The CSV file must include a header row.")
        with open(output_file, "w", encoding="utf-8") as output:
            output.write("[")
            first = True
            for row in reader:
                if not first:
                    output.write(",")
                json.dump(dict(row), output, ensure_ascii=False)
                first = False
            output.write("]")


def _convert_json(input_file: str, output_file: str) -> None:
    with open(input_file, encoding="utf-8-sig") as source:
        records = json.load(source)

    if isinstance(records, dict):
        records = [records]
    if not isinstance(records, list) or any(not isinstance(record, dict) for record in records):
        raise ValueError("JSON to CSV conversion requires a JSON object or an array of objects.")

    fieldnames = list(dict.fromkeys(key for record in records for key in record))
    with open(output_file, "w", newline="", encoding="utf-8") as output:
        if not fieldnames:
            return
        writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for record in records:
            writer.writerow({key: _json_cell(value) for key, value in record.items()})


def run(input_file: str, task_id: str) -> str:
    """Convert tabular CSV data to JSON records or JSON objects to CSV."""
    if not input_file or not os.path.exists(input_file):
        raise FileNotFoundError("A CSV or JSON input file is required.")

    extension = os.path.splitext(input_file)[1].lower()
    if extension not in {".csv", ".json"}:
        raise ValueError("The converter accepts only .csv or .json input files.")

    os.makedirs("storage/results", exist_ok=True)
    output_extension = ".json" if extension == ".csv" else ".csv"
    output_file = f"storage/results/{task_id}_converted{output_extension}"
    if extension == ".csv":
        _convert_csv(input_file, output_file)
    else:
        _convert_json(input_file, output_file)
    return output_file
