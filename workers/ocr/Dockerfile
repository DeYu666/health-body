ARG OCR_BASE_IMAGE=paddlepaddle/paddle:2.6.2
FROM ${OCR_BASE_IMAGE}

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1
ENV PIP_DEFAULT_TIMEOUT=180
ENV PIP_RETRIES=10

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libgomp1 \
      libglib2.0-0 \
      libgl1 \
      libsm6 \
      libxext6 \
      libxrender1 && \
    rm -rf /var/lib/apt/lists/*

RUN printf "numpy==1.26.4\nopencv-python-headless==4.6.0.66\n" > /tmp/ocr-constraints.txt && \
    printf "protobuf==3.20.2\ncython==3.0.12\npyclipper==1.3.0.post6\n" >> /tmp/ocr-constraints.txt && \
    python -m pip install --upgrade pip && \
    python -m pip install -c /tmp/ocr-constraints.txt \
      paddleocr==2.7.3 \
      Flask==3.0.3 \
      PyMuPDF==1.24.14

RUN pip install --force-reinstall --no-deps \
      protobuf==3.20.2 \
      cython==3.0.12 \
      pyclipper==1.3.0.post6

RUN python - <<'PY'
from pathlib import Path

matches = list(Path("/usr/local/lib/python3.10").rglob("paddleocr/tools/infer/utility.py"))
if not matches:
    raise SystemExit("PaddleOCR utility.py not found")

for utility_path in matches:
    source = utility_path.read_text()
    replacement = "config.switch_ir_optim(getattr(args, 'ir_optim', True))"
    if replacement in source:
        print(f"already patched {utility_path}")
        continue
    patched = source.replace(
        "config.switch_ir_optim(True)",
        replacement,
    )
    if patched == source:
        raise SystemExit(f"IR optim patch target not found in {utility_path}")
    utility_path.write_text(patched)
    print(f"patched {utility_path}")
PY

RUN python -c "from paddleocr import PaddleOCR; PaddleOCR(use_gpu=False, use_angle_cls=True, lang='ch', show_log=False, ir_optim=False, enable_mkldnn=False); print('ocr runtime ok')" && \
    mkdir -p /opt/paddleocr && \
    cp -a /root/.paddleocr/. /opt/paddleocr/

COPY ocr_server.py /app/ocr_server.py

EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8081/healthz', timeout=3).read()"

ENTRYPOINT ["python", "/app/ocr_server.py"]
