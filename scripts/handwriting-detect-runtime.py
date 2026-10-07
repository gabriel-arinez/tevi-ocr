import argparse
import json
import os
import time
from pathlib import Path

import cv2
import easyocr
import numpy as np


CACHE = Path(
    os.environ.get(
        "TEVI_OCR_EASYOCR_CACHE",
        str(
            Path.home()
            / ".cache"
            / "tevi-ocr-easyocr"
        ),
    )
)


def stats(x1, x2, y1, y2):
    return {
        "x1": float(x1),
        "x2": float(x2),
        "y1": float(y1),
        "y2": float(y2),
        "cx": float((x1 + x2) / 2),
        "cy": float((y1 + y2) / 2),
        "width": float(x2 - x1),
        "height": float(y2 - y1),
    }


def free_stats(points):
    pts = np.asarray(
        points,
        dtype=np.float32,
    )

    return stats(
        pts[:, 0].min(),
        pts[:, 0].max(),
        pts[:, 1].min(),
        pts[:, 1].max(),
    )


def group_regions(regions):
    heights = [
        row["height"]
        for row in regions
        if row["height"] > 0
    ]

    median_height = (
        float(np.median(heights))
        if heights
        else 0.0
    )

    tolerance = max(
        20.0,
        median_height * 0.45,
    )

    groups = []

    for region in sorted(
        regions,
        key=lambda row: (
            row["cy"],
            row["cx"],
        ),
    ):
        best = None
        best_distance = None

        for group in groups:
            distance = abs(
                region["cy"]
                - group["meanCy"]
            )

            if (
                distance <= tolerance
                and (
                    best_distance is None
                    or distance < best_distance
                )
            ):
                best = group
                best_distance = distance

        if best is None:
            groups.append({
                "meanCy": region["cy"],
                "regions": [region],
            })
        else:
            best["regions"].append(
                region
            )

            best["meanCy"] = (
                sum(
                    item["cy"]
                    for item
                    in best["regions"]
                )
                / len(best["regions"])
            )

    groups.sort(
        key=lambda group:
            group["meanCy"]
    )

    return groups, tolerance


def crop_group(
    image,
    group,
    output_dir,
    number,
):
    members = group["regions"]

    x1 = min(
        row["x1"]
        for row in members
    )

    x2 = max(
        row["x2"]
        for row in members
    )

    y1 = min(
        row["y1"]
        for row in members
    )

    y2 = max(
        row["y2"]
        for row in members
    )

    width = x2 - x1
    height = y2 - y1

    pad_x = max(
        12,
        int(round(width * 0.02)),
    )

    pad_y = max(
        10,
        int(round(height * 0.15)),
    )

    ix1 = max(
        0,
        int(round(x1)) - pad_x,
    )

    iy1 = max(
        0,
        int(round(y1)) - pad_y,
    )

    ix2 = min(
        image.shape[1],
        int(round(x2)) + pad_x,
    )

    iy2 = min(
        image.shape[0],
        int(round(y2)) + pad_y,
    )

    crop = image[
        iy1:iy2,
        ix1:ix2,
    ]

    crop_path = (
        output_dir
        / f"line-{number:02d}.jpg"
    )

    if (
        crop.size == 0
        or not cv2.imwrite(
            str(crop_path),
            crop,
        )
    ):
        raise RuntimeError(
            f"No fue posible crear crop {number}"
        )

    return {
        "lineNumber": number,
        "path": str(
            crop_path.resolve()
        ),
        "bbox": {
            "x1": ix1,
            "y1": iy1,
            "x2": ix2,
            "y2": iy2,
        },
    }


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--input",
        required=True,
    )

    parser.add_argument(
        "--output-dir",
        required=True,
    )

    parser.add_argument(
        "--json",
        required=True,
    )

    args = parser.parse_args()

    input_path = Path(args.input)
    output_dir = Path(args.output_dir)
    json_path = Path(args.json)

    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    image = cv2.imread(
        str(input_path)
    )

    if image is None:
        raise RuntimeError(
            "No fue posible decodificar la imagen."
        )

    reader = easyocr.Reader(
        ["es"],
        gpu=False,
        detector=True,
        recognizer=False,
        model_storage_directory=str(
            CACHE
        ),
        download_enabled=False,
        verbose=False,
    )

    started = time.perf_counter()

    horizontal_list, free_list = (
        reader.detect(
            image,
            min_size=20,
            text_threshold=0.7,
            low_text=0.4,
            link_threshold=0.4,
            canvas_size=2560,
            mag_ratio=1.0,
            slope_ths=0.1,
            ycenter_ths=0.5,
            height_ths=0.5,
            width_ths=0.5,
            add_margin=0.1,
            reformat=True,
        )
    )

    horizontal = (
        horizontal_list[0]
        if horizontal_list
        else []
    )

    free = (
        free_list[0]
        if free_list
        else []
    )

    regions = []

    for index, points in enumerate(
        free,
        start=1,
    ):
        row = free_stats(points)
        row["id"] = f"F{index:02d}"
        regions.append(row)

    for index, raw in enumerate(
        horizontal,
        start=1,
    ):
        x1, x2, y1, y2 = [
            float(value)
            for value in raw
        ]

        row = stats(
            x1,
            x2,
            y1,
            y2,
        )

        row["id"] = f"H{index:02d}"
        regions.append(row)

    groups, tolerance = (
        group_regions(
            regions
        )
    )

    lines = [
        crop_group(
            image,
            group,
            output_dir,
            number,
        )
        for number, group
        in enumerate(
            groups,
            start=1,
        )
    ]

    elapsed = (
        time.perf_counter()
        - started
    )

    output = {
        "ok": True,
        "detector":
            "CRAFT/EasyOCR 1.7.2",
        "groundTruthUsed":
            False,
        "detectionSeconds":
            elapsed,
        "regionCount":
            len(regions),
        "groupTolerance":
            tolerance,
        "lineCount":
            len(lines),
        "lines":
            lines,
    }

    json_path.write_text(
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
