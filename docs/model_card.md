# QGenomix model card

Structured after the points CDSCO's 2026 medical-device-software guidance asks AI developers to disclose
(model description, data, performance, bias, explainability, drift, limits).

## Intended use
Research and teaching prototype. It estimates **relative** genetic and clinical risk of type 2 diabetes for
South Asian adults and explains which biological mechanism drives it. **It is not a medical device, has not
been clinically validated, and must not be used for diagnosis or treatment decisions.**

## Model
* **Inputs:** a GRCh37 genotype file (23andMe or AncestryDNA), age, sex, BMI, waist, physical activity
  (4 levels) and parents with diabetes (0, 1, 2). The IDRS questionnaire score is computed from the same answers.
* **Features:** D-PRISM multi-ancestry PRS (5 PRS-CSx components, PGS005373–005377); five published
  mechanism scores (PGS005115–005119); 62 mechanism SNP dosages; 96 features from a 12-circuit, 8-qubit
  variational quantum circuit (VQC) that encodes 48 cross-mechanism SNP pairs chosen by a QUBO.
* **Predictor:** XGBoost on the PRS, the clinical factors, the mechanism scores, the SNP dosages and the quantum
  features, Platt-calibrated (logistic on its log-odds) on a held-out 20%.
* **Explanation:** mechanism percentiles against a South Asian reference; per-person SHAP values for each
  encoded SNP pair.

## Training data
* Genotypes: synthetic South Asians built as block mosaics (1 Mb blocks) of the 978 phased haplotypes of the
  489 South Asian samples in 1000 Genomes phase 3. No real person's genome is used directly in training.
* **Outcomes are simulated** with a liability-threshold model (11% prevalence) that includes the D-PRISM
  background, the five mechanism scores, a β-cell × lipodystrophy interaction, 10 planted SNP-pair
  interactions and BMI. All reported accuracy is accuracy at recovering this simulated truth.

## Performance (simulated outcomes)
* Deployed bundle: AUC 0.876 on its 4,000-person held-out calibration set (`bundle/meta.json`).
* Benchmark (E1, 3 seeds × 2,000 held-out synthetic South Asians): IDRS 0.761, clinical factors only 0.812,
  clinical + PRS + mechanism scores 0.874, XGBoost + VQC features 0.867. The quantum features give no significant gain.
* Real 1000 Genomes genomes (E9): clinical + genetic model AUC 0.881 in South Asians, 0.85-0.87 in East Asian,
  European and admixed American samples, 0.792 in African samples.
* Lean cases (BMI < 23) caught in the top 20% of risk: 58% with genes, 35% clinical factors only, 30% IDRS,
  0% BMI rule (E8).
* Lifestyle what-ifs (E10): estimated vs true relative risk change, waist −5 cm −28% vs −28%, regular exercise
  −32% vs −40% (conservative).
* Partial consumer files: risk is pulled towards average when coverage is low (the report warns below 80%).

## Bias and fairness
Trained only on South Asian haplotypes. E9 tests transfer to real 1000 Genomes genomes of five ancestries;
performance differences across ancestries are reported there. Within South Asia, the mosaic mixes Gujarati,
Punjabi, Bengali, Telugu and Tamil haplotypes, which removes population substructure that real cohorts have.

## Explainability
Every report lists the mechanism percentiles, the combination flag rule (β-cell and lipodystrophy both
≥ 80th percentile) and the SNP pairs the person carries, ordered by their SHAP contribution.

## Drift and updates
The bundle records the config hash of the training run. Any change to the simulator, the scores or the model
requires retraining and a new hash; reports show the model version.

## Privacy
Uploaded genotype files are parsed in memory and never written to disk or logged. Demo personas are
synthetic mosaics, not real people.

## Known limits
* Simulated outcomes: real-world accuracy is unknown until validated on a consented Indian cohort
  (for example GenomeIndia via IBDC managed access).
* The quantum circuits run on a classical simulator; an 8-qubit circuit gives no computational advantage.
* Consumer genotyping files cover only part of the 1.3M PRS variants; missing ones are imputed at the
  South Asian mean, which shrinks scores towards average.
