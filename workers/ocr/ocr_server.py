#!/usr/bin/env python3
import json
import os
import shutil
import tempfile
import threading
from pathlib import Path

import fitz
from flask import Flask, jsonify, request
from paddleocr import PaddleOCR


PADDLEOCR_SEED_DIR = Path(os.getenv("PADDLEOCR_SEED_DIR", "/opt/paddleocr"))
OCR_MAX_PAGES = int(os.getenv("OCR_MAX_PAGES", "10"))
OCR_MIN_SCORE = float(os.getenv("OCR_MIN_SCORE", "0.45"))
OCR_PORT = int(os.getenv("OCR_PORT", "8081"))

app = Flask(__name__)
ocr_lock = threading.Lock()
ocr_engine = None


def seed_paddleocr_cache() -> None:
    if not PADDLEOCR_SEED_DIR.is_dir():
        return

    target = Path.home() / ".paddleocr"
    for source in PADDLEOCR_SEED_DIR.rglob("*"):
        relative = source.relative_to(PADDLEOCR_SEED_DIR)
        destination = target / relative
        if source.is_dir():
            destination.mkdir(parents=True, exist_ok=True)
            continue
        if destination.exists():
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)


def get_ocr_engine():
    global ocr_engine
    if ocr_engine is None:
        seed_paddleocr_cache()
        ocr_engine = PaddleOCR(
            use_gpu=False,
            use_angle_cls=True,
            lang="ch",
            show_log=False,
            ir_optim=False,
            enable_mkldnn=False,
            cpu_threads=max(1, min(8, os.cpu_count() or 2)),
        )
    return ocr_engine


def is_ocr_line(item) -> bool:
    if not isinstance(item, (list, tuple)) or len(item) < 2:
        return False
    payload = item[1]
    return (
        isinstance(payload, (list, tuple))
        and len(payload) >= 2
        and isinstance(payload[0], str)
    )


def normalize_box(box):
    if not isinstance(box, (list, tuple)):
        return []
    normalized = []
    for point in box:
        if isinstance(point, (list, tuple)) and len(point) >= 2:
            normalized.append([float(point[0]), float(point[1])])
    return normalized


def flatten_ocr_result(result):
    if not result:
        return []

    candidates = result
    if (
        isinstance(result, list)
        and len(result) == 1
        and isinstance(result[0], list)
        and result[0]
        and is_ocr_line(result[0][0])
    ):
        candidates = result[0]

    rows = []
    for item in candidates:
        if not is_ocr_line(item):
            continue
        text = item[1][0].strip()
        score = float(item[1][1])
        if not text or score < OCR_MIN_SCORE:
            continue
        rows.append({
            "text": text,
            "score": round(score, 4),
            "box": normalize_box(item[0]),
        })
    return rows


def ocr_image(image_path: Path, page_number: int):
    with ocr_lock:
        result = get_ocr_engine().ocr(str(image_path), cls=True)
    items = flatten_ocr_result(result)
    return {
        "page": page_number,
        "items": items,
    }


def render_pdf_pages(pdf_path: Path, workdir: Path):
    document = fitz.open(pdf_path)
    rendered = []
    try:
        page_count = min(document.page_count, OCR_MAX_PAGES)
        for index in range(page_count):
            page = document.load_page(index)
            pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            image_path = workdir / f"page-{index + 1}.png"
            pixmap.save(image_path)
            rendered.append(image_path)
    finally:
        document.close()
    return rendered


def extension_for(filename: str, mime_type: str):
    suffix = Path(filename).suffix.lower()
    if suffix in {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}:
        return suffix
    mime_type = (mime_type or "").lower()
    if "pdf" in mime_type:
        return ".pdf"
    if "png" in mime_type:
        return ".png"
    if "jpeg" in mime_type or "jpg" in mime_type:
        return ".jpg"
    if "webp" in mime_type:
        return ".webp"
    return ".bin"


def confidence_for_pages(pages):
    scores = [
        item["score"]
        for page in pages
        for item in page.get("items", [])
        if isinstance(item.get("score"), (int, float))
    ]
    if not scores:
        return 0.0
    return round(sum(scores) / len(scores), 4)


def build_response(pages):
    lines = [
        item["text"]
        for page in pages
        for item in page.get("items", [])
        if item.get("text")
    ]
    return {
        "text": "\n".join(lines),
        "pages": pages,
        "tables": [],
        "keyValues": {},
        "confidence": confidence_for_pages(pages),
    }


@app.get("/healthz")
def healthz():
    return jsonify({"status": "ok"})


@app.post("/ocr")
def ocr():
    uploaded = request.files.get("file")
    if uploaded is None:
        return jsonify({"error": "file is required"}), 400

    mime_type = request.form.get("mimeType") or uploaded.mimetype or ""
    filename = request.form.get("fileName") or uploaded.filename or "document"
    ext = extension_for(filename, mime_type)
    if ext == ".bin":
        return jsonify({"error": "unsupported file type"}), 400

    workdir = Path(tempfile.mkdtemp(prefix="health-ocr-"))
    try:
        source_path = workdir / f"source{ext}"
        uploaded.save(source_path)

        if ext == ".pdf":
            image_paths = render_pdf_pages(source_path, workdir)
        else:
            image_paths = [source_path]

        pages = []
        for index, image_path in enumerate(image_paths, start=1):
            pages.append(ocr_image(image_path, index))

        return jsonify(build_response(pages))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


if __name__ == "__main__":
    seed_paddleocr_cache()
    app.run(host="0.0.0.0", port=OCR_PORT, threaded=False)
