#!/usr/bin/env python3
"""
Fallback PDF-to-Markdown converter using pypdf.
Used when markitdown is unavailable or fails.

Usage: python3 pdf_fallback.py <path/to/file.pdf>
Output: Markdown text to stdout
"""

import sys
import re

def pdf_to_markdown(pdf_path: str) -> str:
    try:
        import pypdf
    except ImportError:
        try:
            import PyPDF2 as pypdf
        except ImportError:
            print("# PDF Conversion Error\n\nNeither pypdf nor PyPDF2 is installed.\nRun: pip3 install pypdf", file=sys.stderr)
            sys.exit(1)

    reader = pypdf.PdfReader(pdf_path)
    pages = []

    for i, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        text = text.strip()
        if text:
            # Clean up common PDF extraction artifacts
            text = re.sub(r'\n{3,}', '\n\n', text)
            text = re.sub(r'(\w)-\n(\w)', r'\1\2', text)  # rejoin hyphenated words
            pages.append(f"## Page {i}\n\n{text}")

    return "\n\n---\n\n".join(pages)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: pdf_fallback.py <path/to/file.pdf>", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]
    try:
        markdown = pdf_to_markdown(pdf_path)
        print(markdown)
    except Exception as e:
        print(f"Error converting PDF: {e}", file=sys.stderr)
        sys.exit(1)
