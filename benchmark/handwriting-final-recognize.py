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
    "handwriting-final/"
    "line-crops.json"
)

OUTPUT = Path(
    "benchmark/results/"
    "handwriting-final/"
    "documents.json"
)


def main():
    data = json.loads(
        INPUT.read_text(
            encoding="utf-8"
        )
    )

    print(
        "model =",
        MODEL_ID,
    )

    print(
        "torch =",
        torch.__version__,
    )

    print(
        "cuda =",
        torch.cuda.is_available(),
    )

    started = time.perf_counter()

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
            MODEL_ID,
        )
    )

    model.eval()
    model.to("cpu")

    load_seconds = (
        time.perf_counter()
        - started
    )

    print(
        "model_load_seconds =",
        round(
            load_seconds,
            3,
        ),
    )

    documents = []
    total_seconds = 0.0
    total_lines = 0

    for sample in data["results"]:
        print()
        print(
            "SAMPLE =",
            sample["id"],
        )

        lines = []

        for line in sample["lines"]:
            started = (
                time.perf_counter()
            )

            try:
                image = (
                    Image
                    .open(
                        line["path"]
                    )
                    .convert("RGB")
                )

                pixel_values = (
                    processor(
                        images=image,
                        return_tensors="pt",
                    )
                    .pixel_values
                )

                with (
                    torch
                    .inference_mode()
                ):
                    generated = (
                        model.generate(
                            pixel_values
                        )
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

            elapsed = (
                time.perf_counter()
                - started
            )

            total_seconds += (
                elapsed
            )

            total_lines += 1

            lines.append({
                **line,
                "text": text,
                "status": status,
                "recognitionSeconds":
                    elapsed,
            })

            print(
                "LINE",
                line["lineNumber"],
                "|",
                f"{elapsed:.3f}s",
                "|",
                repr(text),
            )

        document_text = (
            "\n".join(
                line["text"]
                for line in lines
            )
            .strip()
        )

        documents.append({
            "id":
                sample["id"],
            "category":
                sample["category"],
            "lineCount":
                len(lines),
            "lines":
                lines,
            "text":
                document_text,
        })

    OUTPUT.write_text(
        json.dumps(
            {
                "model":
                    MODEL_ID,
                "groundTruthUsed":
                    False,
                "documents":
                    documents,
                "totalRecognitionSeconds":
                    total_seconds,
                "modelLoadSeconds":
                    load_seconds,
            },
            indent=2,
            ensure_ascii=False,
        ) + "\n",
        encoding="utf-8",
    )

    print()
    print(
        "documents =",
        len(documents),
    )

    print(
        "lines =",
        total_lines,
    )

    print(
        "total_seconds =",
        round(
            total_seconds,
            3,
        ),
    )

    print(
        "average_seconds_per_line =",
        round(
            total_seconds /
            max(
                total_lines,
                1,
            ),
            3,
        ),
    )

    print(
        "GROUND_TRUTH_USED=0"
    )

    print(
        "TROCR_FINAL_OK=1"
    )


if __name__ == "__main__":
    main()
