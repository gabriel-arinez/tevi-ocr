import argparse
import json
import os
import time
from pathlib import Path

import torch
from PIL import Image

from kraken.configs import RecognitionInferenceConfig
from kraken.containers import BBoxLine, Segmentation
from kraken.tasks import RecognitionTaskModel


MODEL_ID = "10.5281/zenodo.21788405"

DEFAULT_MODEL = (
    Path.home()
    / ".local/share/htrmopo"
    / "6c2823f4-371c-5dd2-95d3-d09074307fbc"
    / "small.safetensors"
)

MODEL_PATH = Path(
    os.environ.get(
        "TEVI_OCR_KRAKEN_MODEL",
        str(DEFAULT_MODEL),
    )
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

    parser.add_argument(
        "--strategy",
        required=True,
    )

    args = parser.parse_args()

    input_path = Path(
        args.input_json
    )

    output_path = Path(
        args.output_json
    )

    if not MODEL_PATH.is_file():
        raise FileNotFoundError(
            "Modelo Kraken no encontrado"
        )

    data = json.loads(
        input_path.read_text(
            encoding="utf-8",
        )
    )

    load_started = (
        time.perf_counter()
    )

    model = (
        RecognitionTaskModel
        .load_model(
            MODEL_PATH
        )
    )

    model.eval()
    model.to("cpu")

    config = RecognitionInferenceConfig()

    model_load_seconds = (
        time.perf_counter()
        - load_started
    )

    documents = []
    total_recognition_seconds = 0.0
    total_lines = 0

    for sample in data["results"]:
        lines = []

        for line in sample["lines"]:
            started = (
                time.perf_counter()
            )

            image = (
                Image.open(
                    line["path"]
                )
                .convert("RGB")
            )

            width, height = image.size

            segmentation = Segmentation(
                type="bbox",
                imagename=line["path"],
                text_direction=
                    "horizontal-lr",
                script_detection=False,
                lines=[
                    BBoxLine(
                        id=(
                            f"{sample['id']}-"
                            f"{line['lineNumber']:02d}"
                        ),
                        imagename=
                            line["path"],
                        bbox=(
                            0,
                            0,
                            width,
                            height,
                        ),
                        text_direction=
                            "horizontal-lr",
                    )
                ],
                regions={},
            )

            with torch.inference_mode():
                records = list(
                    model.predict(
                        im=image,
                        segmentation=
                            segmentation,
                        config=config,
                    )
                )

            if len(records) != 1:
                raise RuntimeError(
                    "Cantidad inesperada "
                    "de records Kraken"
                )

            text = (
                records[0]
                .prediction
                .strip()
            )

            elapsed = (
                time.perf_counter()
                - started
            )

            total_recognition_seconds += (
                elapsed
            )

            total_lines += 1

            lines.append({
                "lineNumber":
                    line["lineNumber"],
                "text":
                    text,
                "recognitionSeconds":
                    elapsed,
            })

        document_text = (
            "\n".join(
                item["text"]
                for item in lines
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

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    output_path.write_text(
        json.dumps(
            {
                "model":
                    MODEL_ID,
                "recognizer":
                    "Kraken 7.1.1 / PP-OCRv6 small",
                "strategy":
                    args.strategy,
                "groundTruthUsed":
                    False,
                "modelLoadSeconds":
                    model_load_seconds,
                "totalRecognitionSeconds":
                    total_recognition_seconds,
                "lineCount":
                    total_lines,
                "documents":
                    documents,
            },
            indent=2,
            ensure_ascii=False,
        ) + "\n",
        encoding="utf-8",
    )

    print(
        "STRATEGY=",
        args.strategy,
    )

    print(
        "LINES=",
        total_lines,
    )

    print(
        "MODEL_LOAD_SECONDS=",
        round(
            model_load_seconds,
            3,
        ),
    )

    print(
        "RECOGNITION_SECONDS=",
        round(
            total_recognition_seconds,
            3,
        ),
    )

    print(
        "GROUND_TRUTH_USED=0"
    )


if __name__ == "__main__":
    main()
