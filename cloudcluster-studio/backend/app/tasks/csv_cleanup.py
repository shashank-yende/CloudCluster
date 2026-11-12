import csv
import io

from .common import require_file, safe_filename


def run(data: bytes, filename: str, options: dict):
    require_file(data, filename)
    try:
        text = data.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text, newline=""))
        if not reader.fieldnames:
            raise ValueError("The CSV needs a header row.")
        headers = [str(header or "").strip() for header in reader.fieldnames]
        rows = []
        seen = set()
        removed = 0
        for raw in reader:
            row = {headers[i]: (raw.get(reader.fieldnames[i]) or "").strip() for i in range(len(headers))}
            if not any(row.values()):
                removed += 1
                continue
            signature = tuple(row.values())
            if signature in seen:
                removed += 1
                continue
            seen.add(signature)
            rows.append(row)
            if len(rows) > 250_000:
                raise ValueError("This file has too many rows to process safely (maximum 250,000).")
    except UnicodeDecodeError as error:
        raise ValueError("Please upload a UTF-8 encoded CSV file.") from error
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=headers, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    artifact = output.getvalue().encode("utf-8")
    result = {"rows_before": len(rows) + removed, "rows_after": len(rows), "duplicates_and_blank_rows_removed": removed, "columns": len(headers)}
    return result, artifact, f"{safe_filename(filename, 'cleaned').rsplit('.', 1)[0]}-clean.csv", "text/csv"
