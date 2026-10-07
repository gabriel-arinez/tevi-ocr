import json
import os
import sys
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

THREADS = 4
INTEROP_THREADS = 2


def emit(payload):
    sys.stdout.write(
        json.dumps(
            payload,
            ensure_ascii=False,
        )
        + "\n"
    )
    sys.stdout.flush()


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
        {
            "x": int(point[0]),
            "y": int(point[1]),
        }
        for point in cut
    ]


class KrakenRuntime:
    def __init__(self):
        if not MODEL_PATH.is_file():
            raise FileNotFoundError(
                "Modelo Kraken no disponible"
            )

        torch.set_num_threads(
            THREADS
        )

        torch.set_num_interop_threads(
            INTEROP_THREADS
        )

        started = time.perf_counter()

        self.model = (
            RecognitionTaskModel
            .load_model(
                MODEL_PATH
            )
        )

        self.model.eval()
        self.model.to("cpu")

        self.config = (
            RecognitionInferenceConfig()
        )

        self.model_load_seconds = (
            time.perf_counter()
            - started
        )

        self.request_count = 0

    def recognize(self, detection_path):
        detection = json.loads(
            Path(
                detection_path
            ).read_text(
                encoding="utf-8"
            )
        )

        lines = []
        characters = []
        total_seconds = 0.0

        for line in detection["lines"]:
            started = time.perf_counter()

            with Image.open(
                line["path"]
            ) as source:
                image = (
                    source
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
                            "runtime-"
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
                    self.model.predict(
                        im=image,
                        segmentation=
                            segmentation,
                        config=self.config,
                    )
                )

            if len(records) != 1:
                raise RuntimeError(
                    "Cantidad inesperada "
                    "de resultados Kraken"
                )

            record = records[0]

            prediction = (
                record.prediction
            )

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

            line_characters = []

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

                bbox = bbox_from_cut([
                    [
                        point["x"],
                        point["y"],
                    ]
                    for point in cut
                ])

                item = {
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
                }

                line_characters.append(
                    item
                )

                characters.append(
                    item
                )

            reconstructed = "".join(
                item["char"]
                for item
                in line_characters
            )

            if reconstructed != prediction:
                raise RuntimeError(
                    "La reconstrucción altera "
                    "la predicción Kraken"
                )

            elapsed = (
                time.perf_counter()
                - started
            )

            total_seconds += elapsed

            lines.append({
                "lineNumber":
                    line["lineNumber"],
                "text":
                    prediction,
                "prediction":
                    prediction,
                "bbox":
                    line["bbox"],
                "recognitionSeconds":
                    elapsed,
                "characters":
                    line_characters,
            })

        text = (
            "\n".join(
                line["text"]
                for line in lines
            )
            .strip()
        )

        self.request_count += 1

        return {
            "ok": True,
            "engine":
                "Kraken 7.1.1 / PP-OCRv6 small",
            "model":
                MODEL_ID,
            "groundTruthUsed":
                False,
            "normalizationApplied":
                False,
            "confidence":
                None,
            "modelLoadSeconds":
                self.model_load_seconds,
            "recognitionSeconds":
                total_seconds,
            "lineCount":
                len(lines),
            "characterCount":
                len(characters),
            "lines":
                lines,
            "characters":
                characters,
            "text":
                text,
            "runtime": {
                "persistent": True,
                "threads":
                    THREADS,
                "interopThreads":
                    INTEROP_THREADS,
                "requestCount":
                    self.request_count,
            },
        }


def main():
    try:
        runtime = KrakenRuntime()
    except Exception:
        emit({
            "type": "fatal",
            "ok": False,
            "error":
                "RUNTIME_INITIALIZATION_FAILED",
        })
        return

    emit({
        "type": "ready",
        "ok": True,
        "engine":
            "Kraken 7.1.1 / PP-OCRv6 small",
        "model":
            MODEL_ID,
        "modelLoadSeconds":
            runtime.model_load_seconds,
        "threads":
            THREADS,
        "interopThreads":
            INTEROP_THREADS,
    })

    for raw_line in sys.stdin:
        raw_line = raw_line.strip()

        if not raw_line:
            continue

        request_id = None

        try:
            request = json.loads(
                raw_line
            )

            request_id = request.get(
                "id"
            )

            if (
                not isinstance(
                    request_id,
                    str,
                )
                or not request_id
            ):
                raise ValueError(
                    "id inválido"
                )

            detection_path = (
                request.get(
                    "detectionPath"
                )
            )

            if (
                not isinstance(
                    detection_path,
                    str,
                )
                or not detection_path
            ):
                raise ValueError(
                    "detectionPath inválido"
                )

            result = runtime.recognize(
                detection_path
            )

            emit({
                "type": "result",
                "id":
                    request_id,
                **result,
            })

        except Exception:
            emit({
                "type": "result",
                "id":
                    request_id,
                "ok": False,
                "error":
                    "RECOGNITION_FAILED",
            })


if __name__ == "__main__":
    main()
