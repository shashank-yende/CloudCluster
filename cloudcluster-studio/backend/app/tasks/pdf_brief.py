from io import BytesIO
from collections import Counter
import re

from pypdf import PdfReader

from .common import require_file, safe_filename


def run(data: bytes, filename: str, options: dict):
    require_file(data, filename)
    try:
        reader = PdfReader(BytesIO(data), strict=True)
        if reader.is_encrypted:
            raise ValueError("This PDF is password protected. Remove the password and try again.")
        if len(reader.pages) > 500:
            raise ValueError("The PDF is over the 500-page processing limit.")
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
    except ValueError:
        raise
    except Exception as error:
        raise ValueError("We could not read this PDF. Check that it is a valid, unencrypted PDF.") from error
    words = re.findall(r"[A-Za-z][A-Za-z'-]{2,}", text.lower())
    common = {"the", "and", "for", "that", "with", "from", "this", "are", "was", "were", "have", "has", "you", "your", "not", "but", "can", "will", "into", "their", "they", "then", "than", "when", "what", "which", "about", "also", "more", "all", "one", "our", "its", "by", "to", "of", "in", "on", "at", "is", "as", "it", "be", "or", "an", "a"}
    terms = [word for word, _ in Counter(word for word in words if word not in common).most_common(8)]
    metadata = reader.metadata
    result = {"pages": len(reader.pages), "word_count": len(words), "characters": len(text), "title": (metadata.title or "").strip() if metadata else "", "key_terms": terms, "note": "Key terms are frequency highlights from selectable PDF text." if text.strip() else "No selectable text found; this PDF may be a scan."}
    report = "PDF brief\n=========" + f"\nPages: {len(reader.pages)}\nWords: {len(words)}\nTitle: {result['title'] or 'Not provided'}\nKey terms: {', '.join(terms) if terms else 'None found'}\n\n" + text[:200_000]
    return result, report.encode("utf-8"), f"{safe_filename(filename).rsplit('.', 1)[0]}-brief.txt", "text/plain"
