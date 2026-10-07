import json
import os
import time
from pathlib import Path

import torch
from PIL import Image
from transformers import (
    TrOCRProcessor,
    VisionEncoderDecoderModel,
)


MODEL_ID = (
    "ifesther/"
    "trocr-spanish-handwritten"
)

INPUT = Path(
    "benchmark/results/"
    "handwriting-trocr-regions/"
    "manifest.json"
)

OUTPUT = Path(
    "benchmark/results/"
    "handwriting-trocr-regions/"
    "recognition.json"
)


def main():
    if not INPUT.is_file():
        raise FileNotFoundError(
            f"Manifest no encontrado: {INPUT}"
        )

    manifest = json.loads(
        INPUT.read_text(
            encoding="utf-8"
        )
    )

    if (
        manifest["groundTruthUsed"] is not False
        or manifest["paddingApplied"] is not False
        or manifest["detectorRerun"] is not False
        or manifest["regionCount"] != 40
    ):
        raise RuntimeError(
            "Manifest regional inválido"
        )

    load_started = time.perf_counter()

    processor = (
        TrOCRProcessor
        .from_pretrained(
            MODEL_ID,
            use_fast=False,
        )
    )

    model = (
        VisionEncoderDecoderModel
        .from_pretrained(
            MODEL_ID
        )
    )

    model.eval()
    model.to("cpu")

    model_load_seconds = (
        time.perf_counter()
        - load_started
    )

    results = []
    total_seconds = 0.0
    errors = 0

    for region in manifest["regions"]:
        started = time.perf_counter()

        try:
            image = (
                Image.open(
                    region["cropPath"]
                )
                .convert("RGB")
            )

            width, height = image.size

            if (
                width != region["bbox"]["width"]
                or height != region["bbox"]["height"]
            ):
                raise RuntimeError(
                    "Dimensiones crop/bbox incompatibles"
                )

            pixel_values = (
                processor(
                    images=image,
                    return_tensors="pt",
                )
                .pixel_values
            )

            with torch.inference_mode():
                generated = model.generate(
                    pixel_values
                )

            text = (
                processor
                .batch_decode(
                    generated,
                    skip_special_tokens=True,
                )[0]
                .strip()
            )

            status = "OK"

        except Exception as error:
            text = ""
            status = (
                "ERROR:"
                + type(error).__name__
            )
            errors += 1

        elapsed = (
            time.perf_counter()
            - started
        )

        total_seconds += elapsed

        result = {
            **region,
            "trocrText":
                text,
            "recognitionSeconds":
                elapsed,
            "status":
                status,
        }

        results.append(result)

        print(
            [
                region["id"],
                f"{region['bbox']['width']}x"
                f"{region['bbox']['height']}",
                f"{elapsed:.3f}s",
                f"kraken={region['prediction']!r}",
                f"trocr={text!r}",
                status,
            ]
        )

    output = {
        "model":
            MODEL_ID,
        "groundTruthUsed":
            False,
        "paddingApplied":
            False,
        "detectorRerun":
            False,
        "regionCount":
            len(results),
        "errorCount":
            errors,
        "modelLoadSeconds":
            model_load_seconds,
        "totalRecognitionSeconds":
            total_seconds,
        "averageRecognitionSeconds":
            (
                total_seconds
                / max(
                    len(results),
                    1,
                )
            ),
        "regions":
            results,
    }

    OUTPUT.write_text(
        json.dumps(
            output,
            indent=2,
            ensure_ascii=False,
        ) + "\n",
        encoding="utf-8",
    )

    print()
    print(
        "REGION_COUNT=",
        len(results),
    )

    print(
        "ERROR_COUNT=",
        errors,
    )

    print(
        "MODEL_LOAD_SECONDS=",
        round(
            model_load_seconds,
            6,
        ),
    )

    print(
        "TOTAL_RECOGNITION_SECONDS=",
        round(
            total_seconds,
            6,
        ),
    )

    print(
        "AVERAGE_SECONDS_PER_REGION=",
        round(
            output[
                "averageRecognitionSeconds"
            ],
            6,
        ),
    )

    print(
        "GROUND_TRUTH_USED=0"
    )

    print(
        "PADDING_APPLIED=0"
    )

    print(
        "DETECTOR_RERUN=0"
    )

    gate = (
        len(results) == 40
        and errors == 0
        and output[
            "groundTruthUsed"
        ] is False
        and output[
            "paddingApplied"
        ] is False
        and output[
            "detectorRerun"
        ] is False
    )

    print(
        "F11_6_TROCR_REGION_RECOGNITION_GATE=",
        int(gate),
    )


if __name__ == "__main__":
    main()
