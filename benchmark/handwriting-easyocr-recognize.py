import hashlib
import json
import os
import time
from pathlib import Path

import cv2
import easyocr


INPUT = Path(
    "benchmark/results/"
    "handwriting-final/"
    "line-crops.json"
)

OUTPUT_DIR = Path(
    "benchmark/results/"
    "handwriting-easyocr"
)

OUTPUT = (
    OUTPUT_DIR /
    "documents.json"
)

MODEL_DIR = Path(
    os.environ.get(
        "TEVI_OCR_EASYOCR_CACHE",
        str(
            Path.home()
            / ".cache"
            / "tevi-ocr-easyocr"
        ),
    )
)

MODEL_PATH = (
    MODEL_DIR /
    "latin_g2.pth"
)


def sha256_file(
    path: Path,
) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as handle:
        for chunk in iter(
            lambda:
                handle.read(
                    1024 * 1024
                ),
            b"",
        ):
            digest.update(chunk)

    return digest.hexdigest()


def main() -> None:
    if not INPUT.is_file():
        raise FileNotFoundError(
            f"Input no encontrado: {INPUT}"
        )

    if not MODEL_PATH.is_file():
        raise FileNotFoundError(
            "Modelo EasyOCR no encontrado: "
            f"{MODEL_PATH}"
        )

    data = json.loads(
        INPUT.read_text(
            encoding="utf-8"
        )
    )

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    load_started = (
        time.perf_counter()
    )

    reader = easyocr.Reader(
        ["es"],
        gpu=False,
        model_storage_directory=str(
            MODEL_DIR
        ),
        detector=False,
        recognizer=True,
        download_enabled=False,
        verbose=False,
    )

    model_load_seconds = (
        time.perf_counter()
        - load_started
    )

    documents = []

    total_seconds = 0.0
    total_lines = 0
    error_lines = 0

    for sample in data["results"]:
        print()
        print(
            "SAMPLE=",
            sample["id"],
        )

        lines = []

        for line in sample["lines"]:
            started = (
                time.perf_counter()
            )

            try:
                image = cv2.imread(
                    line["path"]
                )

                if image is None:
                    raise RuntimeError(
                        "No se pudo abrir crop"
                    )

                height, width = (
                    image.shape[:2]
                )

                result = (
                    reader.recognize(
                        image,
                        horizontal_list=[
                            [
                                0,
                                width,
                                0,
                                height,
                            ]
                        ],
                        free_list=[],
                        decoder="greedy",
                        beamWidth=5,
                        batch_size=1,
                        workers=0,
                        detail=1,
                        paragraph=False,
                    )
                )

                if len(result) != 1:
                    raise RuntimeError(
                        "EasyOCR devolvió "
                        f"{len(result)} resultados"
                    )

                item = result[0]

                text = str(
                    item[1]
                ).strip()

                confidence = float(
                    item[2]
                )

                if not (
                    0.0
                    <= confidence
                    <= 1.0
                ):
                    raise RuntimeError(
                        "Confidence fuera "
                        "de rango"
                    )

                status = "OK"

            except Exception as error:
                text = ""
                confidence = None
                status = (
                    "ERROR:"
                    + type(error).__name__
                )

                error_lines += 1

            recognition_seconds = (
                time.perf_counter()
                - started
            )

            total_seconds += (
                recognition_seconds
            )

            total_lines += 1

            row = {
                **line,
                "text":
                    text,
                "confidence":
                    confidence,
                "status":
                    status,
                "recognitionSeconds":
                    recognition_seconds,
            }

            lines.append(row)

            print(
                "LINE",
                line["lineNumber"],
                "|",
                f"{recognition_seconds:.3f}s",
                "| conf=",
                (
                    "N/A"
                    if confidence is None
                    else f"{confidence:.6f}"
                ),
                "|",
                repr(text),
                "|",
                status,
            )

        document_text = (
            "\n".join(
                row["text"]
                for row in lines
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

    output = {
        "model":
            "EasyOCR latin_g2",
        "modelFile":
            "latin_g2.pth",
        "modelSha256":
            sha256_file(
                MODEL_PATH
            ),
        "recognizer":
            "EasyOCR 1.7.2 / latin_g2",
        "detectorUsed":
            False,
        "groundTruthUsed":
            False,
        "frozenCraftCrops":
            True,
        "documents":
            documents,
        "totalRecognitionSeconds":
            total_seconds,
        "modelLoadSeconds":
            model_load_seconds,
        "lineCount":
            total_lines,
        "errorLineCount":
            error_lines,
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
        "DOCUMENTS=",
        len(documents),
    )

    print(
        "LINES=",
        total_lines,
    )

    print(
        "ERROR_LINES=",
        error_lines,
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
        "AVERAGE_SECONDS_PER_LINE=",
        round(
            total_seconds
            / max(
                total_lines,
                1,
            ),
            6,
        ),
    )

    print(
        "DETECTOR_USED=0"
    )

    print(
        "GROUND_TRUTH_USED=0"
    )

    print(
        "FROZEN_CRAFT_CROPS=1"
    )

    print(
        "EASYOCR_RECOGNITION_OK=",
        int(
            total_lines == 61
            and error_lines == 0
        ),
    )


if __name__ == "__main__":
    main()
