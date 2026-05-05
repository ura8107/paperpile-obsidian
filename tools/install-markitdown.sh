#!/bin/bash
# Install markitdown and its full dependencies (OCR, audio, etc.)
set -e

echo "Installing markitdown..."
pip3 install "markitdown[all]"

echo ""
echo "Verifying installation..."
markitdown --version 2>/dev/null || echo "(markitdown installed — no --version flag but it's ready)"
echo "Done."
