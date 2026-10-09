PY := .venv/bin/python

.PHONY: setup data test experiments figures bundle e10 personas app api all

setup:            ## create the virtual environment and install dependencies
	uv venv --python 3.12 .venv
	uv pip install --python $(PY) --index-url https://download.pytorch.org/whl/cpu torch
	uv pip install --python $(PY) -r requirements.txt

data:             ## S1: 1000 Genomes + PGS Catalog -> data/processed (needs data/raw and tools/, see README)
	$(PY) scripts/prepare_data.py

test:
	$(PY) -m pytest -q -W ignore

experiments:      ## E0-E9 (about 1 hour on a 16-core laptop)
	$(PY) scripts/run_experiments.py E0 E1 E2 E3 E4 E7 E9

e10:              ## lifestyle what-if check; needs the bundle
	$(PY) scripts/run_experiments.py E10

figures:
	$(PY) scripts/make_figures.py

bundle:
	$(PY) scripts/build_bundle.py

personas:
	$(PY) scripts/make_personas.py

app:              ## Streamlit dashboard on http://localhost:8501
	$(PY) -m streamlit run src/qgenomix/app/dashboard.py

api:              ## FastAPI on http://localhost:8000/docs
	PYTHONPATH=src $(PY) -m uvicorn qgenomix.app.api:app --port 8000

all: data test experiments bundle e10 figures personas
