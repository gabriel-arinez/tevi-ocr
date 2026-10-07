#!/usr/bin/env bash
set -euo pipefail

ROOT="$(
  cd "$(
    dirname "${BASH_SOURCE[0]}"
  )/.." &&
  pwd
)"

DETECTOR_PYTHON="${TEVI_OCR_DETECTOR_PYTHON:-$HOME/.cache/tevi-ocr-venvs/text-detector/bin/python}"
TROCR_PYTHON="${TEVI_OCR_TROCR_PYTHON:-$ROOT/.venv-handwriting/bin/python}"
HF_CACHE="${TEVI_OCR_HF_CACHE:-$HOME/.cache/tevi-ocr-huggingface}"

cd "$ROOT"

if [[ ! -x "$DETECTOR_PYTHON" ]]; then
  echo "ERROR: detector Python no disponible:"
  echo "$DETECTOR_PYTHON"
  false
fi

if [[ ! -x "$TROCR_PYTHON" ]]; then
  echo "ERROR: TrOCR Python no disponible:"
  echo "$TROCR_PYTHON"
  false
fi

echo "===== DETECTOR ====="

"$DETECTOR_PYTHON" \
  -u \
  benchmark/handwriting-final-detect.py

echo
echo "===== TROCR ====="

HF_HOME="$HF_CACHE" \
"$TROCR_PYTHON" \
  -u \
  benchmark/handwriting-final-recognize.py

echo
echo "===== METRICAS ====="

node \
  --import tsx \
  benchmark/handwriting-final-metrics.ts
