import json
import os
import time
from pathlib import Path

import numpy as np
import torch

from PIL import (
    Image,
    ImageOps,
)

from transformers import (
    TrOCRProcessor,
    VisionEncoderDecoderModel,
)


MODEL_ID = (
    "ifesther/"
    "trocr-spanish-handwritten"
)

MANIFEST_PATH = Path(
    "benchmark/"
    "handwriting-manifest.json"
)

OUTPUT_PATH = Path(
    "benchmark/results/"
    "handwriting-trocr.json"
)

SEGMENTATION_DIR = Path(
    "benchmark/results/"
    "handwriting-trocr-segments"
)


def split_expected_lines(
    text: str,
) -> list[str]:
    return [
        line.strip()
        for line in text.splitlines()
        if line.strip()
    ]


def detect_bands(
    gray: np.ndarray,
    threshold: int,
    row_min_ratio: float,
    smooth_window: int,
    max_gap: int,
) -> list[dict]:
    ink = (
        gray <
        threshold
    )

    row_ratio = (
        ink.mean(
            axis=1,
        )
    )

    kernel = (
        np.ones(
            smooth_window,
            dtype=np.float64,
        ) /
        smooth_window
    )

    smoothed = (
        np.convolve(
            row_ratio,
            kernel,
            mode="same",
        )
    )

    active = (
        smoothed >
        row_min_ratio
    )

    raw_bands = []

    start = None

    for y, value in enumerate(
        active
    ):
        if (
            value
            and
            start is None
        ):
            start = y

        if (
            start is not None
            and (
                not value
                or
                y ==
                len(active) - 1
            )
        ):
            end = (
                y
                if not value
                else y + 1
            )

            if (
                end -
                start >= 8
            ):
                raw_bands.append(
                    [
                        start,
                        end,
                    ]
                )

            start = None

    merged = []

    for y1, y2 in raw_bands:
        if not merged:
            merged.append(
                [
                    y1,
                    y2,
                ]
            )
            continue

        gap = (
            y1 -
            merged[-1][1]
        )

        if gap <= max_gap:
            merged[-1][1] = y2
        else:
            merged.append(
                [
                    y1,
                    y2,
                ]
            )

    filtered = []

    for y1, y2 in merged:
        band_ink = (
            ink[
                y1:y2,
                :
            ]
        )

        ys, xs = (
            np.where(
                band_ink
            )
        )

        if len(xs) < 20:
            continue

        x1 = int(
            xs.min()
        )

        x2 = (
            int(
                xs.max()
            ) +
            1
        )

        width = (
            x2 -
            x1
        )

        height = (
            y2 -
            y1
        )

        if (
            width < 100
            or
            height < 10
        ):
            continue

        filtered.append(
            {
                "x1": x1,
                "x2": x2,
                "y1": y1,
                "y2": y2,
                "width": width,
                "height": height,
            }
        )

    return filtered


def select_segmentation(
    gray: np.ndarray,
    expected_count: int,
):
    candidates = []

    for threshold in [
        60,
        70,
        80,
        90,
        100,
        110,
        120,
        130,
        140,
    ]:
        for row_min_ratio in [
            0.0010,
            0.0015,
            0.0020,
            0.0025,
            0.0030,
            0.0040,
            0.0050,
            0.0075,
            0.0100,
        ]:
            for smooth_window in [
                3,
                5,
                7,
            ]:
                for max_gap in [
                    2,
                    4,
                    6,
                    8,
                ]:
                    bands = (
                        detect_bands(
                            gray,
                            threshold,
                            row_min_ratio,
                            smooth_window,
                            max_gap,
                        )
                    )

                    if (
                        len(bands) !=
                        expected_count
                    ):
                        continue

                    heights = [
                        item["height"]
                        for item
                        in bands
                    ]

                    median_height = float(
                        np.median(
                            heights
                        )
                    )

                    score = sum(
                        abs(
                            height -
                            median_height
                        )
                        for height
                        in heights
                    )

                    candidates.append(
                        {
                            "threshold":
                                threshold,

                            "rowMinRatio":
                                row_min_ratio,

                            "smoothWindow":
                                smooth_window,

                            "maxGap":
                                max_gap,

                            "score":
                                float(
                                    score
                                ),

                            "bands":
                                bands,
                        }
                    )

    if not candidates:
        return None

    candidates.sort(
        key=lambda item:
            item["score"]
    )

    return candidates[0]


def crop_lines(
    image: Image.Image,
    bands: list[dict],
    sample_id: str,
):
    sample_dir = (
        SEGMENTATION_DIR /
        sample_id
    )

    sample_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    crops = []

    for index, band in enumerate(
        bands,
        start=1,
    ):
        margin_x = 25
        margin_y = 15

        x1 = max(
            0,
            band["x1"] -
            margin_x,
        )

        x2 = min(
            image.width,
            band["x2"] +
            margin_x,
        )

        y1 = max(
            0,
            band["y1"] -
            margin_y,
        )

        y2 = min(
            image.height,
            band["y2"] +
            margin_y,
        )

        crop = image.crop(
            (
                x1,
                y1,
                x2,
                y2,
            )
        )

        path = (
            sample_dir /
            f"line-{index:02d}.png"
        )

        crop.save(
            path
        )

        crops.append(
            {
                "image":
                    crop,
                "path":
                    str(path),
                "box": {
                    "x1": x1,
                    "x2": x2,
                    "y1": y1,
                    "y2": y2,
                },
            }
        )

    return crops


def main():
    manifest = json.loads(
        MANIFEST_PATH.read_text(
            encoding="utf-8",
        )
    )

    SEGMENTATION_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    OUTPUT_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    torch.set_num_threads(4)

    print(
        "MODEL_ID=",
        MODEL_ID,
    )

    print(
        "torch_threads=",
        torch.get_num_threads(),
    )

    started_load = (
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
            MODEL_ID,
        )
    )

    model.eval()
    model.to("cpu")

    load_seconds = (
        time.perf_counter()
        -
        started_load
    )

    print(
        "model_load_seconds=",
        round(
            load_seconds,
            3,
        ),
    )

    sample_results = []

    total_inference_seconds = 0.0
    total_lines = 0

    for sample in manifest:
        sample_id = (
            sample["id"]
        )

        print()
        print(
            "=" * 60
        )

        print(
            "SAMPLE=",
            sample_id,
        )

        expected_text = (
            Path(
                sample[
                    "groundTruthPath"
                ]
            )
            .read_text(
                encoding="utf-8",
            )
        )

        expected_lines = (
            split_expected_lines(
                expected_text
            )
        )

        print(
            "expected_lines=",
            len(
                expected_lines
            ),
        )

        image = (
            Image
            .open(
                sample[
                    "fixturePath"
                ]
            )
        )

        image = (
            ImageOps
            .exif_transpose(
                image
            )
            .convert("RGB")
        )

        gray = np.asarray(
            ImageOps.grayscale(
                image
            ),
            dtype=np.uint8,
        )

        segmentation = (
            select_segmentation(
                gray,
                len(
                    expected_lines
                ),
            )
        )

        if segmentation is None:
            print(
                "SEGMENTATION_FAILED=1"
            )

            sample_results.append(
                {
                    "id":
                        sample_id,

                    "category":
                        sample["category"],

                    "writerId":
                        sample["writerId"],

                    "capture":
                        sample["capture"],

                    "expectedText":
                        expected_text,

                    "expectedLines":
                        expected_lines,

                    "segmentationOk":
                        False,

                    "lines":
                        [],
                }
            )

            continue

        bands = (
            segmentation[
                "bands"
            ]
        )

        print(
            "segmentation=",
            {
                key:
                    segmentation[key]
                for key in [
                    "threshold",
                    "rowMinRatio",
                    "smoothWindow",
                    "maxGap",
                    "score",
                ]
            },
        )

        print(
            "detected_lines=",
            len(bands),
        )

        crops = (
            crop_lines(
                image,
                bands,
                sample_id,
            )
        )

        line_results = []

        for index, (
            expected,
            crop_info,
        ) in enumerate(
            zip(
                expected_lines,
                crops,
                strict=True,
            ),
            start=1,
        ):
            inputs = (
                processor(
                    images=
                        crop_info[
                            "image"
                        ],

                    return_tensors=
                        "pt",
                )
            )

            started = (
                time.perf_counter()
            )

            with (
                torch
                .inference_mode()
            ):
                generated_ids = (
                    model.generate(
                        inputs.pixel_values,
                        max_new_tokens=128,
                    )
                )

            elapsed = (
                time.perf_counter()
                -
                started
            )

            total_inference_seconds += (
                elapsed
            )

            total_lines += 1

            predicted = (
                processor
                .batch_decode(
                    generated_ids,
                    skip_special_tokens=True,
                )[0]
                .strip()
            )

            print(
                f"line={index} "
                f"seconds={elapsed:.3f}"
            )

            print(
                "  expected =",
                repr(
                    expected
                ),
            )

            print(
                "  predicted=",
                repr(
                    predicted
                ),
            )

            line_results.append(
                {
                    "lineNumber":
                        index,

                    "expected":
                        expected,

                    "predicted":
                        predicted,

                    "inferenceSeconds":
                        elapsed,

                    "imagePath":
                        crop_info[
                            "path"
                        ],

                    "box":
                        crop_info[
                            "box"
                        ],
                }
            )

        predicted_text = (
            "\n".join(
                line[
                    "predicted"
                ]
                for line
                in line_results
            )
        )

        sample_results.append(
            {
                "id":
                    sample_id,

                "category":
                    sample[
                        "category"
                    ],

                "writerId":
                    sample[
                        "writerId"
                    ],

                "capture":
                    sample[
                        "capture"
                    ],

                "expectedText":
                    expected_text,

                "predictedText":
                    predicted_text,

                "expectedLines":
                    expected_lines,

                "segmentationOk":
                    True,

                "segmentation": {
                    key:
                        segmentation[
                            key
                        ]
                    for key in [
                        "threshold",
                        "rowMinRatio",
                        "smoothWindow",
                        "maxGap",
                        "score",
                    ]
                },

                "lines":
                    line_results,
            }
        )

    payload = {
        "model":
            MODEL_ID,

        "device":
            "cpu",

        "torchThreads":
            torch.get_num_threads(),

        "modelLoadSeconds":
            load_seconds,

        "sampleCount":
            len(
                manifest
            ),

        "successfulSegmentations":
            sum(
                1
                for sample
                in sample_results
                if sample[
                    "segmentationOk"
                ]
            ),

        "totalLines":
            total_lines,

        "totalInferenceSeconds":
            total_inference_seconds,

        "averageInferenceSeconds":
            (
                total_inference_seconds /
                total_lines
                if total_lines
                else 0
            ),

        "samples":
            sample_results,
    }

    OUTPUT_PATH.write_text(
        json.dumps(
            payload,
            indent=2,
            ensure_ascii=False,
        ) + "\n",
        encoding="utf-8",
    )

    print()
    print(
        "=" * 60
    )

    print(
        "SUCCESSFUL_SEGMENTATIONS=",
        payload[
            "successfulSegmentations"
        ],
    )

    print(
        "TOTAL_SAMPLES=",
        payload[
            "sampleCount"
        ],
    )

    print(
        "TOTAL_LINES=",
        total_lines,
    )

    print(
        "TOTAL_INFERENCE_SECONDS=",
        round(
            total_inference_seconds,
            3,
        ),
    )

    print(
        "AVERAGE_INFERENCE_SECONDS=",
        round(
            payload[
                "averageInferenceSeconds"
            ],
            3,
        ),
    )

    print(
        "OUTPUT=",
        OUTPUT_PATH,
    )


if __name__ == "__main__":
    main()
