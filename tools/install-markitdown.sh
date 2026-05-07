#!/bin/bash
# Install markitdown and its full dependencies (OCR, audio, etc.)
set -e

VENV_DIR="${VENV_DIR:-.venv}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

if [ ! -x "$VENV_DIR/bin/python" ]; then
  echo "Creating virtual environment in $VENV_DIR..."
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

echo "Installing markitdown into $VENV_DIR..."
"$VENV_DIR/bin/python" -m pip install --upgrade pip setuptools wheel "markitdown[all]"

echo ""
echo "Verifying installation..."
"$VENV_DIR/bin/markitdown" --help >/dev/null
"$VENV_DIR/bin/python" - <<'PY'
import platform
import numpy
import markitdown

print(f"Python architecture: {platform.machine()}")
print(f"NumPy: {numpy.__version__}")
print(f"markitdown: {markitdown.__file__}")
PY
echo "Done."
