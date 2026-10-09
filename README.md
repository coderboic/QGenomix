# QGenomix

**Quantum-assisted search for cross-mechanism gene interactions in early-onset type 2 diabetes among lean
South Asians.** Capstone project CPG 218, Computer Science and Engineering Department, Thapar Institute.

Many South Asians develop type 2 diabetes young and at a normal BMI, so BMI-based screening misses them.
QGenomix asks two questions: do genetic variants from two diabetes mechanisms, insulin production (β-cell)
and fat distribution (lipodystrophy), *interact*, and how much do genes add to India's clinical screening
score (IDRS)? It searches for gene pairs with a QUBO solved classically and by QAOA, encodes them with a
variational quantum circuit, benchmarks every quantum step against a classical control, and serves the result
as a mechanism-profile risk report with validated lifestyle what-ifs.

> Research prototype. Genotypes are real (1000 Genomes); disease outcomes are **simulated**. Not a medical
> device and not for diagnosis.

## What is in the box

| Stage | Module | What it does |
| --- | --- | --- |
| S1 | `qgenomix.data.prepare` | 1000 Genomes QC, PCA, D-PRISM PRS, mechanism SNPs, South Asian haplotype library |
| S2 | `qgenomix.data.cohort`, `qgenomix.sim`, `qgenomix.clinical` | Synthetic South Asians as haplotype mosaics; clinical factors and IDRS; liability-threshold outcome simulator |
| S3 | `qgenomix.search.relevance` | Rao score test for all 1,263 cross-mechanism pairs, inside each CV fold |
| S4 | `qgenomix.search.qubo`, `solvers`, `qaoa` | QUBO pair selection (annealing + swap polish); QAOA (penalty and Dicke/XY forms) |
| S5 | `qgenomix.quantum` | 8-qubit pair circuit, exact fast simulator, encoders, fidelity kernel |
| S6 | `qgenomix.models.zoo` | 17 predictors, from the IDRS questionnaire to the quantum stack |
| S7 | `qgenomix.eval`, `qgenomix.pipeline` | AUC, EDR@K, lean-case capture, DeLong, McNemar; experiments E0 to E10 |
| S8 | `qgenomix.app` | Model bundle, genotype parser (23andMe, AncestryDNA), FastAPI, Streamlit dashboard with what-ifs, synthetic personas |

## Quick start

```bash
make setup        # Python 3.12 venv with CPU torch and all dependencies (uses uv)
make test         # 30 tests; the 3 bundle tests are skipped until `make bundle`
```

Full pipeline (needs the raw data below, about 2 to 3 hours on a 16-core laptop; keep it from sleeping):

```bash
make data         # S1: data/raw -> data/processed
make experiments  # E0-E9 -> results/*.json
make bundle       # train the deployable model -> bundle/
make e10          # lifestyle what-if check against the simulator's truth
make figures      # -> figures/*.png, results/tables.json
make personas     # three synthetic demo genomes -> data/personas/
make app          # Streamlit on http://localhost:8501 (restart after rebuilding the bundle)
                  # demo link: http://localhost:8501/?persona=asha_lean_high&autorun=1
make api          # FastAPI on http://localhost:8000/docs
```

### Raw data

* `tools/plink2`, `tools/plink`: PLINK 2 and PLINK 1.9 Linux binaries from cog-genomics.org.
* `data/raw/1kg/`: from the PLINK 2 resources page, `all_phase3.pgen.zst`, `all_phase3_noannot.pvar.zst`
  (rename to `all_phase3.pvar.zst`) and `phase3_corrected.psam` (rename to `all_phase3.psam`).
* `data/raw/pgs/`: PGS Catalog harmonised GRCh37 scoring files `PGS005115`–`PGS005119` (mechanisms) and
  `PGS005373`–`PGS005377` (D-PRISM, trained for South Asians), named `<ID>_hmPOS_GRCh37.txt.gz`.

### Real quantum hardware (optional)

`scripts/run_ibm.py` samples the trained QAOA circuits on IBM hardware with a free IBM Quantum Open Plan
account (10 QPU minutes per 28 days; this uses under one). Save your API key on your own machine as the
script header shows, never in this repository.

## Results (10,000 synthetic South Asians unless stated)

| Experiment | Result |
| --- | --- |
| E1 prediction | IDRS questionnaire AUC 0.761, clinical factors 0.812, PRS only 0.736; clinical + PRS + mechanisms 0.874 (genes add +0.063, p < 0.001). Quantum variants 0.866-0.871, no significant gain |
| E2 interaction discovery | Score test finds 70-84% of planted pairs in its top 10 at δ = 0.2; PLINK BOOST 40-48% |
| E3 sample size | 24% of pairs found with 2,500 people, 78% with 10,000, 92% with 20,000 |
| E4 null | 18 of 20 null runs report nothing, 2 report one false pair; p-values calibrated (λ = 1.05) |
| E5 entanglement | Entangled VQC 0.866, no entanglement 0.871, classical twin 0.870 (own heads) |
| E6 pair selection | QUBO covers 62 SNPs (top-K 49), cuts shadow pairs by a quarter, best objective in 61% of runs |
| E7 QAOA | Constraint-preserving XY mixer 0.76→0.83 (depth 1→6) vs penalty form 0.30→0.66, ideal; IBM Kingston noise model ~0.3 for both |
| E8 lean blind spot | Lean cases caught in the top 20%: BMI rule 0%, IDRS 30%, clinical model 35%, with genes 58% |
| E9 real genomes | Clinical + genes AUC 0.881 on real South Asians, 0.792 on Africans |
| E10 lifestyle what-ifs | App vs truth: waist −5 cm −28% vs −28%; exercise −32% vs −40%; both −52% vs −59% |

Every number comes from `results/*.json`; `results/tables.json` is the summary and `figures/` holds the plots.
Results from before the clinical factors were added are kept in `results/v1_pre_clinical/`.

## Repository layout

```
configs/      main.yaml: every parameter; results record its hash
src/qgenomix/ the package (data, sim, search, quantum, models, eval, pipeline, app)
scripts/      prepare_data, run_experiments, make_figures, build_bundle, make_personas, run_ibm
tests/        unit, equivalence and smoke tests
docs/         model_card.md
results/      experiment outputs (JSON)
figures/      report figures
```
