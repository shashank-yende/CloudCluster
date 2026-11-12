import csv
import os
import re
import unicodedata
from pathlib import Path


MAX_ROWS = 250_000
MAX_COLUMNS = 200
MISSING_MARKERS = {"na", "n/a", "null", "none", "nan"}


def _normalize_header(value: str, index: int) -> str:
    normalized = unicodedata.normalize("NFKD", value.strip()).encode("ascii", "ignore").decode("ascii").lower()
    normalized = re.sub(r"[^a-z0-9]+", "_", normalized).strip("_")
    return normalized or f"column_{index + 1}"


def _unique_headers(raw_headers: list[str]) -> list[str]:
    headers = []
    used = set()
    for index, raw in enumerate(raw_headers):
        base = _normalize_header(raw or "", index)
        name = base
        suffix = 2
        while name in used:
            name = f"{base}_{suffix}"
            suffix += 1
        used.add(name)
        headers.append(name)
    return headers


def run(input_file: str, task_id: str) -> str:
    """Normalize CSV headers and cells, drop blank records, and remove duplicates."""
    if not input_file or not os.path.exists(input_file):
        raise FileNotFoundError("A CSV input file is required.")

    try:
        with open(input_file, "r", newline="", encoding="utf-8-sig") as source:
            reader = csv.reader(source)
            raw_headers = next(reader, None)
            if not raw_headers or not any(value.strip() for value in raw_headers):
                raise ValueError("The CSV needs a header row with at least one column.")
            if len(raw_headers) > MAX_COLUMNS:
                raise ValueError(f"The CSV can contain up to {MAX_COLUMNS} columns.")

            headers = _unique_headers(raw_headers)
            rows = []
            seen = set()
            blank_rows_removed = 0
            duplicate_rows_removed = 0
            rows_seen = 0

            for raw_row in reader:
                rows_seen += 1
                if rows_seen > MAX_ROWS:
                    raise ValueError(f"The CSV can contain up to {MAX_ROWS:,} rows.")
                if len(raw_row) > len(headers):
                    overflow = raw_row[len(headers):]
                    if any(value.replace("\u00a0", " ").strip() for value in overflow):
                        raise ValueError(f"Row {rows_seen + 1} has more cells than the header row.")
                    raw_row = raw_row[:len(headers)]
                values = [(raw_row[index] if index < len(raw_row) else "").replace("\u00a0", " ").strip() for index in range(len(headers))]
                values = ["" if value.casefold() in MISSING_MARKERS else value for value in values]
                if not any(values):
                    blank_rows_removed += 1
                    continue
                signature = tuple(value.casefold() for value in values)
                if signature in seen:
                    duplicate_rows_removed += 1
                    continue
                seen.add(signature)
                rows.append(values)
    except UnicodeDecodeError as error:
        raise ValueError("Please upload a UTF-8 encoded CSV file.") from error
    except csv.Error as error:
        raise ValueError("The CSV file could not be parsed. Check its quoting and delimiters.") from error

    os.makedirs("storage/results", exist_ok=True)
    output_file = Path("storage/results") / f"{task_id}_preprocessed.csv"
    with output_file.open("w", newline="", encoding="utf-8") as output:
        writer = csv.writer(output)
        writer.writerow(headers)
        writer.writerows(rows)
    return str(output_file)
