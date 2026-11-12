import os
import re
from collections import Counter
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader


COMMON_WORDS = {
    "the", "and", "for", "that", "with", "from", "this", "are", "was", "were", "have", "has", "you", "your",
    "not", "but", "can", "will", "into", "their", "they", "then", "than", "when", "what", "which", "about",
    "also", "more", "all", "one", "our", "its", "by", "to", "of", "in", "on", "at", "is", "as", "it", "be", "or", "an", "a",
}


def run(input_file: str, task_id: str) -> str:
    """Extract a compact plain-text summary and key terms from a PDF."""
    if not input_file or not os.path.exists(input_file):
        raise FileNotFoundError("A PDF input file is required.")
    try:
        with open(input_file, "rb") as source:
            reader = PdfReader(BytesIO(source.read()), strict=True)
        if reader.is_encrypted:
            raise ValueError("This PDF is password protected. Remove the password and try again.")
        if len(reader.pages) > 500:
            raise ValueError("The PDF is over the 500-page processing limit.")
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        metadata = reader.metadata
    except ValueError:
        raise
    except Exception as error:
        raise ValueError("We could not read this PDF. Check that it is valid and unencrypted.") from error

    words = re.findall(r"[A-Za-z][A-Za-z'-]{2,}", text.lower())
    terms = [word for word, _ in Counter(word for word in words if word not in COMMON_WORDS).most_common(8)]
    title = (metadata.title or "").strip() if metadata else ""
    report = (
        "PDF brief\n=========\n"
        f"Pages: {len(reader.pages)}\nWords: {len(words)}\nCharacters: {len(text)}\n"
        f"Title: {title or 'Not provided'}\nKey terms: {', '.join(terms) if terms else 'None found'}\n\n"
        f"Selectable text: {'yes' if text.strip() else 'no — this may be a scanned PDF'}\n\n"
        f"{text[:200_000]}"
    )
    os.makedirs("storage/results", exist_ok=True)
    output_file = Path("storage/results") / f"{task_id}_brief.txt"
    output_file.write_text(report, encoding="utf-8")
    return str(output_file)
