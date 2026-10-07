import json
import statistics
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

BASELINE = Path(
    "benchmark/results/"
    "handwriting-kraken/"
    "documents.json"
)

OUTPUT_DIR = Path(
    "benchmark/results/"
    "handwriting-performance"
)

OUTPUT = (
    OUTPUT_DIR
    / "performance.json"
)

MODEL = (
    Path.home()
    / ".local/share/htrmopo"
    / "6c2823f4-371c-5dd2-95d3-d09074307fbc"
    / "small.safetensors"
)

THREADS = 4
INTEROP_THREADS = 2
CYCLES = 3


def current_rss_mib():
    status = Path(
        "/proc/self/status"
    ).read_text(
        encoding="utf-8"
    )

    for line in status.splitlines():
        if line.startswith("VmRSS:"):
            return (
                int(
                    line.split()[1]
                )
                / 1024.0
            )

    raise RuntimeError(
        "VmRSS no encontrado"
    )


def load_expected():
    data = json.loads(
        BASELINE.read_text(
            encoding="utf-8"
        )
    )

    expected = {}

    for document in data["documents"]:
        expected[
            document["id"]
        ] = {
            line["lineNumber"]:
                line["text"]
            for line
            in document["lines"]
        }

    return expected


def prepare_document(sample):
    rows = []

    for line in sample["lines"]:
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
            imagename=
                line["path"],
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

        rows.append({
            "lineNumber":
                line["lineNumber"],
            "image":
                image,
            "segmentation":
                segmentation,
        })

    return rows


def main():
    if not INPUT.is_file():
        raise FileNotFoundError(
            f"Corpus no encontrado: {INPUT}"
        )

    if not BASELINE.is_file():
        raise FileNotFoundError(
            f"Baseline no encontrado: {BASELINE}"
        )

    if not MODEL.is_file():
        raise FileNotFoundError(
            f"Modelo Kraken no encontrado: {MODEL}"
        )

    torch.set_num_threads(
        THREADS
    )

    torch.set_num_interop_threads(
        INTEROP_THREADS
    )

    corpus = json.loads(
        INPUT.read_text(
            encoding="utf-8"
        )
    )

    expected = load_expected()

    expected_documents = 8
    expected_lines = 61

    document_count = len(
        corpus["results"]
    )

    line_count = sum(
        len(sample["lines"])
        for sample
        in corpus["results"]
    )

    if (
        document_count
        != expected_documents
        or line_count
        != expected_lines
    ):
        raise RuntimeError(
            "Corpus F11 inesperado: "
            f"documents={document_count}, "
            f"lines={line_count}"
        )

    rss_before_model = (
        current_rss_mib()
    )

    load_started = (
        time.perf_counter()
    )

    model = (
        RecognitionTaskModel
        .load_model(MODEL)
    )

    model.eval()
    model.to("cpu")

    config = (
        RecognitionInferenceConfig()
    )

    model_load_seconds = (
        time.perf_counter()
        - load_started
    )

    rss_after_model = (
        current_rss_mib()
    )

    cycles = []

    all_mismatches = []

    for cycle_number in range(
        1,
        CYCLES + 1,
    ):
        cycle_started = (
            time.perf_counter()
        )

        documents = []

        for sample in corpus["results"]:
            preparation_started = (
                time.perf_counter()
            )

            prepared = (
                prepare_document(
                    sample
                )
            )

            preparation_seconds = (
                time.perf_counter()
                - preparation_started
            )

            recognition_started = (
                time.perf_counter()
            )

            mismatches = []

            for row in prepared:
                with torch.inference_mode():
                    records = list(
                        model.predict(
                            im=
                                row["image"],
                            segmentation=
                                row[
                                    "segmentation"
                                ],
                            config=config,
                        )
                    )

                if len(records) != 1:
                    raise RuntimeError(
                        "Cantidad inesperada "
                        "de resultados Kraken"
                    )

                prediction = (
                    records[0]
                    .prediction
                    .strip()
                )

                expected_text = (
                    expected[
                        sample["id"]
                    ][
                        row[
                            "lineNumber"
                        ]
                    ]
                )

                if (
                    prediction
                    != expected_text
                ):
                    mismatch = {
                        "cycle":
                            cycle_number,
                        "document":
                            sample["id"],
                        "lineNumber":
                            row[
                                "lineNumber"
                            ],
                        "expected":
                            expected_text,
                        "actual":
                            prediction,
                    }

                    mismatches.append(
                        mismatch
                    )

                    all_mismatches.append(
                        mismatch
                    )

            recognition_seconds = (
                time.perf_counter()
                - recognition_started
            )

            documents.append({
                "id":
                    sample["id"],
                "lineCount":
                    len(prepared),
                "preparationSeconds":
                    preparation_seconds,
                "recognitionSeconds":
                    recognition_seconds,
                "totalSeconds":
                    preparation_seconds
                    + recognition_seconds,
                "rssMiB":
                    current_rss_mib(),
                "mismatchCount":
                    len(mismatches),
            })

            del prepared

        cycle_seconds = (
            time.perf_counter()
            - cycle_started
        )

        cycles.append({
            "cycle":
                cycle_number,
            "wallSeconds":
                cycle_seconds,
            "recognitionSeconds":
                sum(
                    item[
                        "recognitionSeconds"
                    ]
                    for item
                    in documents
                ),
            "preparationSeconds":
                sum(
                    item[
                        "preparationSeconds"
                    ]
                    for item
                    in documents
                ),
            "rssMiB":
                current_rss_mib(),
            "mismatchCount":
                sum(
                    item[
                        "mismatchCount"
                    ]
                    for item
                    in documents
                ),
            "documents":
                documents,
        })

    recognition_cycles = [
        cycle[
            "recognitionSeconds"
        ]
        for cycle in cycles
    ]

    warm_cycles = (
        recognition_cycles[1:]
    )

    warm_mean = (
        statistics.mean(
            warm_cycles
        )
    )

    warm_average_line_ms = (
        warm_mean
        / expected_lines
        * 1000.0
    )

    max_rss = max(
        document["rssMiB"]
        for cycle in cycles
        for document
        in cycle["documents"]
    )

    final_rss = (
        current_rss_mib()
    )

    baseline = json.loads(
        BASELINE.read_text(
            encoding="utf-8"
        )
    )

    baseline_seconds = float(
        baseline[
            "totalRecognitionSeconds"
        ]
    )

    improvement = (
        (
            baseline_seconds
            - warm_mean
        )
        / baseline_seconds
    )

    gate = (
        len(all_mismatches) == 0
        and document_count == 8
        and line_count == 61
        and THREADS == 4
        and INTEROP_THREADS == 2
        and warm_mean
        < baseline_seconds
    )

    result = {
        "configuration": {
            "threads":
                THREADS,
            "interopThreads":
                INTEROP_THREADS,
            "workers":
                1,
            "runtime":
                "persistent",
            "modelLoad":
                "once",
            "documentParallelism":
                "sequential",
            "lineParallelism":
                "sequential",
            "artificialBatching":
                False,
        },

        "methodology": {
            "documents":
                document_count,
            "lines":
                line_count,
            "cycles":
                CYCLES,
            "warmCycles":
                2,
            "groundTruthUsed":
                False,
            "comparison":
                "frozen Kraken predictions",
        },

        "baseline": {
            "recognitionSeconds":
                baseline_seconds,
        },

        "measurements": {
            "rssBeforeModelMiB":
                rss_before_model,
            "rssAfterModelMiB":
                rss_after_model,
            "modelLoadSeconds":
                model_load_seconds,
            "maxObservedRssMiB":
                max_rss,
            "finalRssMiB":
                final_rss,
            "cycles":
                cycles,
            "warmMeanRecognitionSeconds":
                warm_mean,
            "warmAverageLineMs":
                warm_average_line_ms,
            "recognitionImprovement":
                improvement,
        },

        "validation": {
            "mismatchCount":
                len(
                    all_mismatches
                ),
            "predictionsMatchBaseline":
                len(
                    all_mismatches
                ) == 0,
            "mismatches":
                all_mismatches,
            "f11_8PerformanceGate":
                gate,
        },
    }

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    OUTPUT.write_text(
        json.dumps(
            result,
            indent=2,
            ensure_ascii=False,
        ) + "\n",
        encoding="utf-8",
    )

    print(
        "DOCUMENTS=",
        document_count,
    )

    print(
        "LINES=",
        line_count,
    )

    print(
        "THREADS=",
        THREADS,
    )

    print(
        "INTEROP_THREADS=",
        INTEROP_THREADS,
    )

    print(
        "WORKERS=",
        1,
    )

    print(
        "MODEL_LOAD_SECONDS=",
        round(
            model_load_seconds,
            6,
        ),
    )

    for cycle in cycles:
        print(
            "CYCLE="
            f"{cycle['cycle']} "
            "RECOGNITION_SECONDS="
            f"{cycle['recognitionSeconds']:.6f} "
            "RSS_MIB="
            f"{cycle['rssMiB']:.2f} "
            "MISMATCHES="
            f"{cycle['mismatchCount']}"
        )

    print(
        "BASELINE_SECONDS=",
        round(
            baseline_seconds,
            6,
        ),
    )

    print(
        "WARM_MEAN_SECONDS=",
        round(
            warm_mean,
            6,
        ),
    )

    print(
        "WARM_AVG_LINE_MS=",
        round(
            warm_average_line_ms,
            3,
        ),
    )

    print(
        "IMPROVEMENT_PERCENT=",
        round(
            improvement
            * 100.0,
            2,
        ),
    )

    print(
        "RSS_AFTER_MODEL_MIB=",
        round(
            rss_after_model,
            2,
        ),
    )

    print(
        "MAX_RSS_MIB=",
        round(
            max_rss,
            2,
        ),
    )

    print(
        "FINAL_RSS_MIB=",
        round(
            final_rss,
            2,
        ),
    )

    print(
        "MISMATCH_COUNT=",
        len(
            all_mismatches
        ),
    )

    print(
        "F11_8_PERFORMANCE_GATE=",
        int(gate),
    )

    if not gate:
        raise RuntimeError(
            "F11.8 performance gate falló"
        )


if __name__ == "__main__":
    main()
