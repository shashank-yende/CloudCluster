import json
import os
import re
from collections import Counter


def run(input_file: str, task_id: str) -> str:
    """Analyze a UTF-8 text file and write a JSON summary."""
    if not input_file or not os.path.exists(input_file):
        raise FileNotFoundError("A text input file is required.")

    character_count = 0
    line_count = 0
    word_counts = Counter()
    with open(input_file, encoding="utf-8-sig") as source:
        for line in source:
            character_count += len(line)
            line_count += 1
            word_counts.update(re.findall(r"\b[\w']+\b", line.casefold()))

    word_count = sum(word_counts.values())
    summary = {
        "task_id": task_id,
        "character_count": character_count,
        "word_count": word_count,
        "line_count": line_count,
        "unique_word_count": len(word_counts),
        "top_words": [
            {"word": word, "count": count}
            for word, count in word_counts.most_common(10)
        ],
        "estimated_reading_time_seconds": round(word_count / 4.0, 1),
    }

    os.makedirs("storage/results", exist_ok=True)
    output_file = f"storage/results/{task_id}_text_analysis.json"
    with open(output_file, "w", encoding="utf-8") as output:
        json.dump(summary, output, indent=2, ensure_ascii=False)
    return output_file
