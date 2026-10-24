PY := .venv/bin/python

.PHONY: setup data test experiments figures bundle impute e10 extras personas app api docker rehearse-ibm all

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

extras:           ## E7b mitigation, E11 fairness, E12 robustness, E13 imputation (about 1.5 hours; needs E7, bundle)
	$(PY) scripts/run_experiments.py E13 E11 E12 E7b

e10:              ## lifestyle what-if check; needs the bundle
	$(PY) scripts/run_experiments.py E10

figures:
	$(PY) scripts/make_figures.py

bundle:
	$(PY) scripts/build_bundle.py

impute:           ## LD imputation panel for partial consumer DNA files (about 2 minutes)
	$(PY) scripts/build_impute_panel.py

personas:
	$(PY) scripts/make_personas.py

app:              ## Streamlit dashboard on http://localhost:8501
	$(PY) -m streamlit run src/qgenomix/app/dashboard.py

api:              ## FastAPI on http://localhost:8000/docs
	PYTHONPATH=src $(PY) -m uvicorn qgenomix.app.api:app --port 8000

docker:           ## dashboard + API in containers (needs bundle/ and data/personas/)
	docker compose up --build

rehearse-ibm:     ## the IBM hardware run, rehearsed locally on the Kingston noise model (no account needed)
	$(PY) scripts/run_ibm.py --backend fake_kingston --blocks 0 --depths 1 --shots 1000

all: data test experiments bundle impute e10 extras figures personas
