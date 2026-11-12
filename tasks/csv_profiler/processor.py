import csv
import json
import os
from collections import Counter


def run(input_file: str, task_id: str) -> str:
    """Summarize CSV columns and write a machine-readable JSON profile."""
    if not input_file or not os.path.exists(input_file):
        raise FileNotFoundError("A CSV input file is required.")

    with open(input_file, newline="", encoding="utf-8-sig") as source:
        reader = csv.DictReader(source)
        fieldnames = reader.fieldnames
        if not fieldnames:
            raise ValueError("The CSV file must include a header row.")

    column_stats = {
        name: {
            "missing_values": 0,
            "unique": set(),
            "is_numeric": True,
            "numeric_count": 0,
            "numeric_sum": 0.0,
            "minimum": None,
            "maximum": None,
        }
        for name in fieldnames
    }
    row_count = 0
    with open(input_file, newline="", encoding="utf-8-sig") as source:
        for row in csv.DictReader(source):
            row_count += 1
            for name, stats in column_stats.items():
                value = (row.get(name) or "").strip()
                if not value:
                    stats["missing_values"] += 1
                    continue

                stats["unique"].add(value)
                if stats["is_numeric"]:
                    try:
                        numeric_value = float(value)
                    except ValueError:
                        stats["is_numeric"] = False
                    else:
                        stats["numeric_count"] += 1
                        stats["numeric_sum"] += numeric_value
                        stats["minimum"] = numeric_value if stats["minimum"] is None else min(stats["minimum"], numeric_value)
                        stats["maximum"] = numeric_value if stats["maximum"] is None else max(stats["maximum"], numeric_value)

    category_counts = {name: Counter() for name, stats in column_stats.items() if not stats["is_numeric"]}
    if category_counts:
        with open(input_file, newline="", encoding="utf-8-sig") as source:
            for row in csv.DictReader(source):
                for name, counts in category_counts.items():
                    value = (row.get(name) or "").strip()
                    if value:
                        counts[value] += 1

    columns = {}
    for name, stats in column_stats.items():
        summary = {
            "missing_values": stats["missing_values"],
            "unique_values": len(stats["unique"]),
        }
        if stats["is_numeric"] and stats["numeric_count"]:
            summary.update({
                "numeric": True,
                "minimum": stats["minimum"],
                "maximum": stats["maximum"],
                "mean": stats["numeric_sum"] / stats["numeric_count"],
            })
        else:
            summary["top_values"] = [
                {"value": value, "count": count}
                for value, count in category_counts.get(name, Counter()).most_common(5)
            ]
        columns[name] = summary

    report = {
        "task_id": task_id,
        "row_count": row_count,
        "column_count": len(fieldnames),
        "columns": columns,
    }
    os.makedirs("storage/results", exist_ok=True)
    output_file = f"storage/results/{task_id}_profile.json"
    with open(output_file, "w", encoding="utf-8") as output:
        json.dump(report, output, indent=2, ensure_ascii=False)
    return output_file
