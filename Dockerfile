# QGenomix app image: Streamlit dashboard (port 8501) and FastAPI service (port 8000).
#
# The trained model and demo genomes are not in git (too large). Build them once, then the image:
#   make bundle impute personas      (or copy bundle/ and data/personas/ from a machine that has them)
#   docker compose up --build        dashboard on http://localhost:8501, API on http://localhost:8000/docs
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app/src PIP_NO_CACHE_DIR=1
WORKDIR /app

RUN pip install --index-url https://download.pytorch.org/whl/cpu torch==2.14.1
COPY requirements.txt .
RUN grep -vE "^(pytest|ruff)" requirements.txt > requirements-app.txt && pip install -r requirements-app.txt

COPY configs configs
COPY src src
COPY docs docs
COPY figures figures
COPY bundle bundle
COPY data/personas data/personas

RUN useradd --create-home app && chown -R app /app
USER app
EXPOSE 8501 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8501/_stcore/health')" || exit 1
CMD ["python", "-m", "streamlit", "run", "src/qgenomix/app/dashboard.py", "--server.port=8501", \
     "--server.address=0.0.0.0", "--server.headless=true", "--browser.gatherUsageStats=false"]
