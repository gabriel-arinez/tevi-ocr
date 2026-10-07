#!/usr/bin/env bash

set -u

REPO="$(
  cd "$(dirname "$0")/.." &&
  pwd
)"

KRAKEN_PY="${TEVI_OCR_KRAKEN_PYTHON:-$HOME/.cache/tevi-ocr-venvs/kraken/bin/python}"

if ! cd "$REPO"; then
  echo "ERROR: no se pudo entrar a $REPO"
elif [ ! -x "$KRAKEN_PY" ]; then
  echo "ERROR: runtime Kraken no disponible:"
  echo "$KRAKEN_PY"
else
  "$KRAKEN_PY" \
    benchmark/handwriting-kraken-performance.py
fi
