# QGenomix handover note (25 Oct 2026)

The system is complete: data pipeline, simulator, interaction search, quantum stages with error mitigation,
17 models, experiments E0 to E13, a risk-report app (dashboard, API, PDF, Docker) and the mentor report.
Two features are deliberately kept for the final panel (around 9 November) because each needs a team account.

## Done since the previous mentor review (21 Oct)
- **LD imputation for consumer DNA files** (`qgenomix.data.impute`, E13): each missing variant is predicted from its
  best-correlated measured neighbour in the 489 South Asian genomes. At 45% coverage the risk-percentile error drops
  from 13 to 6 points and 80% of truly high-risk people stay flagged (54% with average filling).
- **Error mitigation for QAOA** (`qgenomix.search.mitigation`, E7b): readout correction, post-selection and
  zero-noise extrapolation on the IBM Kingston noise model.
- **Fairness** (E11): accuracy, calibration and screening yield for each South Asian population and both sexes.
- **Robustness** (E12): the conclusions under 13 alternative simulator settings.
- **PDF report** from the dashboard and `POST /v1/report.pdf`; **Docker image** (`docker compose up`).
- **IBM rehearsal mode**: `make rehearse-ibm` runs the hardware script locally on the Kingston noise model.
- Mentor report regenerated from the results: `QGenomix_Mentor_Evaluation_Report.docx`
  (rebuild: `cd docs/report && npm install && npm run build`).

## Kept for the final panel (each about one day)
1. **Real IBM quantum hardware run.** Create a free IBM Quantum account (Open Plan, 10 QPU minutes per 28 days),
   save the API key on your own laptop with the command in `scripts/run_ibm.py` (never in chat or git), and run
   `python scripts/run_ibm.py --backend ibm_kingston --depths 1 2` (one batched job, about 2 QPU minutes).
   Afterwards `make figures` and `cd docs/report && npm run build` add the hardware result to the E7b figure and
   to Section 5.6 of the report automatically.
2. **Public online demo.** Deploy the Docker image to a free host (for example a Hugging Face Space, Docker SDK)
   under a team account. The image needs `bundle/` and `data/personas/`, which are not in git (too large), so build
   it on a machine that has them.

## Also before the panel
- Sign the declaration in the report and attach the Turnitin report as Appendix B.
- Slides, a three-minute demo video, and who presents which part.

## Demo checklist (panel day)
- Needed on the laptop: `.venv/`, `bundle/` (including `impute_panel.npz`), `data/personas/`, `figures/`, `docs/`.
  No internet needed.
- `make app`, then open http://localhost:8501/?persona=asha_lean_high&autorun=1 (lean, IDRS moderate, QGenomix high
  risk; what-ifs show exercise + smaller waist cutting her risk by about three quarters). Press **Download PDF report**.
- The first report takes about 10 s (reading and imputing a 46 MB genome); what-if changes are then instant.
- If the model bundle is rebuilt, restart the app (it caches the model).
- Backup: `docker compose up`, or the screenshots in `figures/app_*.png`.
