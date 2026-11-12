import csv
import os


def run(input_file: str, task_id: str) -> str:
    """Remove exact duplicate CSV rows while keeping the original row order."""
    if not input_file or not os.path.isfile(input_file):
        raise FileNotFoundError(f"Input CSV not found: {input_file}")

    os.makedirs("storage/results", exist_ok=True)
    output_file = f"storage/results/{task_id}_deduplicated.csv"
    seen_rows = set()

    with open(input_file, "r", newline="", encoding="utf-8-sig") as source:
        reader = csv.reader(source)
        header = next(reader, None)
        if not header or not any(column.strip() for column in header):
            raise ValueError("The CSV must contain a header row")

        with open(output_file, "w", newline="", encoding="utf-8") as destination:
            writer = csv.writer(destination)
            writer.writerow(header)
            for row in reader:
                key = tuple(row)
                if key in seen_rows:
                    continue
                seen_rows.add(key)
                writer.writerow(row)

    return output_file
