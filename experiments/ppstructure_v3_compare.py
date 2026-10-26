#!/usr/bin/env python3
"""Optional PP-StructureV3 experimental benchmark.

No production import, no network calls by this script, no text replacement.
Dependencies intentionally isolated from the Node/Tesseract production runtime.
See docs/printed-photo-roadmap.md before attempting to install PaddleOCR.
"""
import argparse
import json
import time
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("image", help="Local test image containing no sensitive data")
    parser.add_argument("--output", required=True, help="Destination directory")
    args = parser.parse_args()

    source = Path(args.image)
    if not source.is_file():
        parser.error("Image file not found")

    dest = Path(args.output)
    dest.mkdir(parents=True, exist_ok=True)

    try:
        from paddleocr import PPStructureV3
    except ImportError as exc:
        raise SystemExit(
            "Optional PP-StructureV3 is not installed. Use an isolated Python "
            "environment and follow the official PaddlePaddle/PaddleOCR installation guide."
        ) from exc

    start = time.perf_counter()
    pipeline = PPStructureV3(
        device="cpu",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
    )
    load_seconds = time.perf_counter() - start

    start = time.perf_counter()
    output = pipeline.predict(input=str(source))
    results = list(output)
    inference_seconds = time.perf_counter() - start

    for result in results:
        result.save_to_json(save_path=str(dest))
        result.save_to_markdown(save_path=str(dest))

    report = {
        "engine": "PP-StructureV3",
        "source": source.name,
        "pages": len(results),
        "loadSeconds": load_seconds,
        "inferenceSeconds": inference_seconds,
        "productionTextModified": False,
        "warning": "Experimental reference only; validate against independently labeled ground truth.",
    }
    (dest / "performance.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
