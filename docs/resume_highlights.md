# QGenomix: resume highlights

Pick the lines that match the part you built and be ready to explain them; interviewers will ask. Every number
comes from `results/` and is on simulated outcomes over real 1000 Genomes genotypes, so say "simulated outcomes"
if asked. Do not claim a quantum speed-up or advantage: the project measured none, and saying so is a strength.

**Project line**
QGenomix: genetic risk screening for early-onset type 2 diabetes in lean South Asians, with quantum-assisted
gene-interaction search (Python, PyTorch, Qiskit, PennyLane, XGBoost, PLINK, FastAPI, Streamlit, Docker).

**Bullets**
- Built an end-to-end genomic risk pipeline on 2,504 real 1000 Genomes genomes and 1.3M-variant polygenic scores;
  adding genetics to India's IDRS screening questionnaire nearly doubled lean diabetes cases caught (30% to 58%).
- Formulated gene-pair selection as a QUBO and solved it with simulated annealing and QAOA, including a
  constraint-preserving XY-mixer / Dicke-state circuit; benchmarked every quantum step against classical controls.
- Implemented quantum error mitigation (readout correction, symmetry post-selection, zero-noise extrapolation),
  recovering most of the QAOA quality lost on an IBM Heron (Kingston) noise model.
- Wrote an LD-based genotype imputation for consumer DNA files (23andMe, AncestryDNA) that halves risk-percentile
  error at typical chip coverage and keeps 80% of high-risk people correctly flagged (54% before).
- Designed a vectorised interaction score test that finds 70-84% of planted gene pairs, against 40-48% for
  PLINK's BOOST, with calibrated false-positive control (λ = 1.05).
- Audited fairness across five South Asian populations and both sexes, and robustness across 13 simulator settings.
- Shipped a FastAPI + Streamlit app with explainable reports (SHAP), lifestyle what-ifs, PDF export and Docker;
  38 automated tests and GitHub Actions CI.

**One-line pitch (for interviews)**
"BMI-based screening misses South Asians who get diabetes while thin. We showed, on real genomes with simulated
outcomes, that adding polygenic scores to India's screening questionnaire nearly doubles how many of them are
caught, and we tested honestly whether quantum optimisation helps pick interacting genes. It doesn't yet, and we
can show exactly why."
