import argparse
import json
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


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--input-json",
        required=True,
    )

    parser.add_argument(
        "--output-json",
        required=True,
    )

    args = parser.parse_args()

    input_path = Path(
        args.input_json
    )

    output_path = Path(
        args.output_json
    )

    detection = json.loads(
        input_path.read_text(
            encoding="utf-8"
        )
    )

    load_started = (
        time.perf_counter()
    )

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

    lines = []
    total_seconds = 0.0

    for line in detection["lines"]:
        started = (
            time.perf_counter()
        )

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

        with torch.inference_mode():
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

        elapsed = (
            time.perf_counter()
            - started
        )

        total_seconds += elapsed

        lines.append({
            **line,
            "text":
                text,
            "recognitionSeconds":
                elapsed,
        })

    document_text = (
        "\n".join(
            line["text"]
            for line in lines
        )
        .strip()
    )

    output = {
        "ok": True,
        "engine":
            MODEL_ID,
        "groundTruthUsed":
            False,
        "confidence":
            None,
        "modelLoadSeconds":
            model_load_seconds,
        "recognitionSeconds":
            total_seconds,
        "lineCount":
            len(lines),
        "lines":
            lines,
        "text":
            document_text,
    }

    output_path.write_text(
        json.dumps(
            output,
            indent=2,
            ensure_ascii=False,
        ) + "\n",
        encoding="utf-8",
    )

    print(
        json.dumps(
            output,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
