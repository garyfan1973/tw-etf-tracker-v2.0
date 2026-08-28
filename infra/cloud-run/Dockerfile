FROM mcr.microsoft.com/playwright/python:v1.55.0-noble

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update \
    && apt-get install -y --no-install-recommends git fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/* \
    && python -m pip install --no-cache-dir playwright==1.55.0

WORKDIR /app
COPY batch_runner.py /app/batch_runner.py

ENTRYPOINT ["python", "/app/batch_runner.py"]
