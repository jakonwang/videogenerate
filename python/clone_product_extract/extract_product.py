import json
import os
import sys
from dataclasses import dataclass
import io
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from ultralytics import YOLO, SAM

try:
    from rembg import remove
    REMBG_IMPORT_ERROR: str | None = None
except Exception as exc:  # noqa: BLE001
    remove = None
    REMBG_IMPORT_ERROR = str(exc)

os.environ.setdefault("YOLO_VERBOSE", "False")


@dataclass
class Diagnostic:
    originalPath: str
    sanitizedPath: str | None
    status: str
    note: str


def load_payload() -> dict:
    if len(sys.argv) < 2:
        raise RuntimeError("missing payload path")
    payload_path = Path(sys.argv[1])
    return json.loads(payload_path.read_text(encoding="utf-8"))


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def crop_with_yolo(model: YOLO, image_bgr: np.ndarray) -> np.ndarray:
    try:
        results = model.predict(source=image_bgr, verbose=False, conf=0.15)
    except Exception:
        return image_bgr
    if not results:
        return image_bgr
    result = results[0]
    boxes = getattr(result, "boxes", None)
    xyxy = getattr(boxes, "xyxy", None) if boxes is not None else None
    if xyxy is None or len(xyxy) == 0:
        return image_bgr
    coords = xyxy.cpu().numpy()[0]
    x1, y1, x2, y2 = [int(max(v, 0)) for v in coords]
    h, w = image_bgr.shape[:2]
    pad_x = int((x2 - x1) * 0.12)
    pad_y = int((y2 - y1) * 0.12)
    left = max(0, x1 - pad_x)
    top = max(0, y1 - pad_y)
    right = min(w, x2 + pad_x)
    bottom = min(h, y2 + pad_y)
    cropped = image_bgr[top:bottom, left:right]
    return cropped if cropped.size else image_bgr


def white_bg_rgba(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    bg = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    composed = Image.alpha_composite(bg, rgba)
    return composed.convert("RGB")


def segment_with_sam(sam_model: SAM, image_bgr: np.ndarray) -> Image.Image:
    h, w = image_bgr.shape[:2]
    try:
        results = sam_model(image_bgr, bboxes=[[0, 0, w, h]], verbose=False)
    except TypeError:
        results = sam_model(image_bgr)
    except Exception:
        return Image.fromarray(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB))
    if not results:
        return Image.fromarray(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB))
    result = results[0]
    masks = getattr(result, "masks", None)
    if masks is None or masks.data is None or len(masks.data) == 0:
        return Image.fromarray(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB))
    mask = masks.data[0].cpu().numpy()
    mask_u8 = (mask * 255).astype(np.uint8)
    rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    rgba = np.dstack([rgb, mask_u8])
    return Image.fromarray(rgba, mode="RGBA")


def extract_one(det_model: YOLO, sam_model: SAM, input_path: Path, output_path: Path) -> tuple[bool, str]:
    image_bgr = cv2.imread(str(input_path), cv2.IMREAD_COLOR)
    if image_bgr is None:
        return False, "cannot read image"
    cropped = crop_with_yolo(det_model, image_bgr)
    cropped_image = segment_with_sam(sam_model, cropped)
    removed_image = cropped_image.convert("RGBA")
    note = "product extracted with yolo+sam"
    if remove is not None:
        try:
            removed = remove(cropped_image)
            if isinstance(removed, bytes):
                removed_image = Image.open(io.BytesIO(removed)).convert("RGBA")
            elif isinstance(removed, Image.Image):
                removed_image = removed.convert("RGBA")
            else:
                removed_image = Image.fromarray(np.array(removed)).convert("RGBA")
            note = "product extracted with yolo+sam+rembg"
        except Exception as exc:  # noqa: BLE001
            note = f"rembg skipped: {exc}"
    elif REMBG_IMPORT_ERROR:
        note = f"rembg unavailable: {REMBG_IMPORT_ERROR}"
    final_image = white_bg_rgba(removed_image)
    ensure_dir(output_path.parent)
    final_image.save(output_path, format="PNG")
    return True, note


def main() -> int:
    payload = load_payload()
    original_paths = [str(Path(item).resolve()) for item in payload.get("originalPaths", []) if str(item).strip()]
    out_dir = Path(payload["outDir"]).resolve()
    ensure_dir(out_dir)
    det_model_path = Path(payload["detModelPath"]).resolve()
    sam_model_path = Path(payload["samModelPath"]).resolve()
    det_model = YOLO(str(det_model_path))
    sam_model = SAM(str(sam_model_path))

    sanitized_paths: list[str] = []
    failed: list[str] = []
    diagnostics: list[dict] = []

    for index, original_path in enumerate(original_paths, start=1):
        source = Path(original_path)
        output = out_dir / f"product_extract_{index}.png"
        try:
            ok, note = extract_one(det_model, sam_model, source, output)
            if ok:
                sanitized_paths.append(str(output))
                diagnostics.append(Diagnostic(originalPath=str(source), sanitizedPath=str(output), status="sanitized", note=note).__dict__)
            else:
                failed.append(str(source))
                diagnostics.append(Diagnostic(originalPath=str(source), sanitizedPath=None, status="failed", note=note).__dict__)
        except Exception as exc:  # noqa: BLE001
            failed.append(str(source))
            diagnostics.append(Diagnostic(originalPath=str(source), sanitizedPath=None, status="failed", note=str(exc)).__dict__)

    result = {
        "sanitizedPaths": sanitized_paths,
        "failed": failed,
        "diagnostics": diagnostics,
    }
    sys.stdout.write(json.dumps(result, ensure_ascii=False))
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
