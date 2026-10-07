import json
import os
import time
from pathlib import Path

import torch
from PIL import Image

from kraken.configs import RecognitionInferenceConfig
from kraken.containers import BBoxLine, Segmentation
from kraken.tasks import RecognitionTaskModel


INPUT = Path(
    "benchmark/results/"
    "handwriting-final/"
    "line-crops.json"
)

OUTPUT_DIR = Path(
    "benchmark/results/"
    "handwriting-kraken"
)

OUTPUT = OUTPUT_DIR / "documents.json"

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
    if not MODEL_PATH.is_file():
        raise FileNotFoundError(
            f"Modelo Kraken no encontrado: {MODEL_PATH}"
        )

    data = json.loads(
        INPUT.read_text(
            encoding="utf-8",
        )
    )

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    print(
        "model =",
        MODEL_PATH,
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

    model = (
        RecognitionTaskModel
        .load_model(
            MODEL_PATH
        )
    )

    model.eval()
    model.to("cpu")

    config = RecognitionInferenceConfig()

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
            started = time.perf_counter()

            try:
                image = (
                    Image
                    .open(
                        line["path"]
                    )
                    .convert("RGB")
                )

                width, height = image.size

                bounds = Segmentation(
                    type="bbox",
                    imagename=line["path"],
                    text_direction="horizontal-lr",
                    script_detection=False,
                    lines=[
                        BBoxLine(
                            id=(
                                f"{sample['id']}-"
                                f"{line['lineNumber']:02d}"
                            ),
                            imagename=line["path"],
                            bbox=(
                                0,
                                0,
                                width,
                                height,
                            ),
                            text_direction="horizontal-lr",
                        )
                    ],
                    regions={},
                )

                with torch.inference_mode():
                    records = list(
                        model.predict(
                            im=image,
                            segmentation=bounds,
                            config=config,
                        )
                    )

                if len(records) != 1:
                    raise RuntimeError(
                        "Cantidad inesperada de "
                        f"resultados: {len(records)}"
                    )

                text = (
                    records[0]
                    .prediction
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

            total_seconds += elapsed
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
                "|",
                status,
            )

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

    OUTPUT.write_text(
        json.dumps(
            {
                "model":
                    MODEL_ID,
                "recognizer":
                    "Kraken 7.1.1 / PP-OCRv6 small",
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
            total_seconds
            / max(total_lines, 1),
            3,
        ),
    )

    print(
        "GROUND_TRUTH_USED=0"
    )

    print(
        "KRAKEN_F11_1_OK=1"
    )


if __name__ == "__main__":
    main()
