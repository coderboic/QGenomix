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
* **Missing variants:** imputed from the best-correlated measured neighbour (LD imputation) using the 489 South
  Asian genomes of 1000 Genomes; variants with no usable neighbour get the South Asian mean.
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
* Partial consumer files (E13, 100 held-out real South Asian genomes): at 45% of PRS variants, LD imputation
  cuts the risk-percentile error from 13 to 6 points and keeps 80% of truly high-risk people flagged (54% with
  mean filling). The report warns when less than 80% of variants are measured or reliably imputed.
* Output: on-screen report, JSON (`POST /v1/profile`) or a one-page PDF (`POST /v1/report.pdf`).

## Bias and fairness
Trained only on South Asian haplotypes. E9 tests transfer to real 1000 Genomes genomes of five ancestries;
performance differences across ancestries are reported there. Within South Asia, the mosaic mixes Gujarati,
Punjabi, Bengali, Telugu and Tamil haplotypes, which removes population substructure that real cohorts have.
E11 therefore tests each real South Asian population and both sexes separately (20 simulated outcome draws on the
489 real genomes): the clinical + genetic model improves on clinical factors in every group, with AUC from 0.84
(Punjabi) to 0.92 (Sri Lankan Tamil, Telugu) and 0.89 in both men and women. With about 100 people per population
these differences are within sampling noise. Predicted risks run about 11% high on real genomes (observed /
expected 0.89), equally in every group; recalibration on local data, not a group-specific correction, is the fix.

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
* Consumer genotyping files cover only part of the 1.3M PRS variants. LD imputation recovers most of the lost
  accuracy, but it uses a single tag per variant and a 489-person reference panel; a full imputation server
  (for example Beagle with a larger panel) would do better.
* E12 shows the clinical conclusions hold across thirteen alternative simulator settings, but interaction
  discovery depends strongly on the assumed effect sizes.
