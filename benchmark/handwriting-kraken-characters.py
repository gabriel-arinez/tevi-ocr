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
    "handwriting-kraken-characters"
)

OUTPUT = OUTPUT_DIR / "characters.json"

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


def bbox_from_cut(cut):
    if len(cut) != 4:
        raise ValueError(
            "Kraken cut debe contener 4 puntos"
        )

    xs = [
        int(point[0])
        for point in cut
    ]

    ys = [
        int(point[1])
        for point in cut
    ]

    return {
        "x1": min(xs),
        "y1": min(ys),
        "x2": max(xs),
        "y2": max(ys),
    }


def serialize_cut(cut):
    return [
        [
            int(point[0]),
            int(point[1]),
        ]
        for point in cut
    ]


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

    started = time.perf_counter()

    model = (
        RecognitionTaskModel
        .load_model(
            MODEL_PATH
        )
    )

    model.eval()
    model.to("cpu")

    model_load_seconds = (
        time.perf_counter()
        - started
    )

    config = RecognitionInferenceConfig()

    documents = []

    total_lines = 0
    total_characters = 0
    total_recognition_seconds = 0.0

    zero_width_characters = 0
    zero_height_characters = 0

    for sample in data["results"]:
        document_lines = []

        for line in sample["lines"]:
            started = time.perf_counter()

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
                        segmentation=segmentation,
                        config=config,
                    )
                )

            if len(records) != 1:
                raise RuntimeError(
                    "Kraken devolvió "
                    f"{len(records)} records "
                    "para una línea"
                )

            record = records[0]

            prediction = record.prediction
            confidences = list(
                record.confidences
            )
            cuts = list(
                record.cuts
            )

            if not (
                len(prediction)
                == len(confidences)
                == len(cuts)
            ):
                raise RuntimeError(
                    "prediction/confidences/cuts "
                    "no están alineados"
                )

            characters = []

            for index, char in enumerate(
                prediction
            ):
                confidence = float(
                    confidences[index]
                )

                if not (
                    0.0
                    <= confidence
                    <= 1.0
                ):
                    raise RuntimeError(
                        "Confidence fuera de rango"
                    )

                cut = serialize_cut(
                    cuts[index]
                )

                bbox = bbox_from_cut(
                    cut
                )

                if (
                    bbox["x1"] < 0
                    or bbox["y1"] < 0
                    or bbox["x2"] > width
                    or bbox["y2"] > height
                    or bbox["x2"] < bbox["x1"]
                    or bbox["y2"] < bbox["y1"]
                ):
                    raise RuntimeError(
                        "BBox fuera de la imagen"
                    )

                if (
                    bbox["x1"]
                    == bbox["x2"]
                ):
                    zero_width_characters += 1

                if (
                    bbox["y1"]
                    == bbox["y2"]
                ):
                    zero_height_characters += 1

                characters.append({
                    "lineNumber":
                        line["lineNumber"],
                    "characterIndex":
                        index,
                    "char":
                        char,
                    "cut":
                        cut,
                    "bbox":
                        bbox,
                    "confidence":
                        confidence,
                })

            reconstructed = "".join(
                item["char"]
                for item in characters
            )

            if reconstructed != prediction:
                raise RuntimeError(
                    "La reconstrucción altera "
                    "la predicción Kraken"
                )

            recognition_seconds = (
                time.perf_counter()
                - started
            )

            total_recognition_seconds += (
                recognition_seconds
            )

            total_lines += 1
            total_characters += len(
                characters
            )

            document_lines.append({
                "lineNumber":
                    line["lineNumber"],
                "bbox":
                    line["bbox"],
                "width":
                    width,
                "height":
                    height,
                "prediction":
                    prediction,
                "characters":
                    characters,
                "recognitionSeconds":
                    recognition_seconds,
            })

            print(
                sample["id"],
                "| line",
                line["lineNumber"],
                "| chars",
                len(characters),
                "|",
                f"{recognition_seconds:.3f}s",
            )

        raw_text = (
            "\n".join(
                line["prediction"]
                for line in document_lines
            )
            .strip()
        )

        documents.append({
            "id":
                sample["id"],
            "category":
                sample["category"],
            "lineCount":
                len(document_lines),
            "lines":
                document_lines,
            "rawText":
                raw_text,
        })

    output = {
        "model":
            MODEL_ID,
        "engine":
            "Kraken 7.1.1 / PP-OCRv6 small",
        "groundTruthUsed":
            False,
        "normalizationApplied":
            False,
        "characterUnit":
            "Unicode code point",
        "geometrySource":
            "Kraken BBoxOCRRecord.cuts",
        "modelLoadSeconds":
            model_load_seconds,
        "totalRecognitionSeconds":
            total_recognition_seconds,
        "lineCount":
            total_lines,
        "characterCount":
            total_characters,
        "zeroWidthCharacterCount":
            zero_width_characters,
        "zeroHeightCharacterCount":
            zero_height_characters,
        "documents":
            documents,
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
        "LINES=",
        total_lines,
    )

    print(
        "CHARACTERS=",
        total_characters,
    )

    print(
        "ZERO_WIDTH_CHARACTERS=",
        zero_width_characters,
    )

    print(
        "ZERO_HEIGHT_CHARACTERS=",
        zero_height_characters,
    )

    print(
        "GROUND_TRUTH_USED=0"
    )

    print(
        "NORMALIZATION_APPLIED=0"
    )

    print(
        "F11_2_CHAR_CONTRACT_OK=1"
    )


if __name__ == "__main__":
    main()
