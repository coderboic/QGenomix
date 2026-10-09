# QGenomix handover note (9 Oct 2026)

Everything technical is done: code, data, experiments E0 to E10, figures, app, report. What is left needs
decisions or accounts from the team.

## Audit: what was checked and fixed
- Clean install from `requirements.txt` into a new environment: all tests pass.
- `make data` re-run from scratch: every array, table and QC count identical to the stored files.
- Determinism: a re-run experiment matched its stored result bit for bit on the same machine. The tolerance of
  the interaction test was tightened so results no longer depend on the CPU thread count.
- App bugs fixed: duplicate positions in 23andMe files crashed it; real chip files (~45% coverage) were refused.
  Both are handled, with regression tests. AncestryDNA and `chr`-prefixed files work; wrong genome builds are
  refused with a clear message.
- Screening metric fixed: coarse scores (IDRS moves in steps of 10) flagged more than 20% because of ties; exactly
  20% are now flagged, ties broken at random.

## Added at your request: clinical factors
- Age, sex, BMI, waist, physical activity and family history in the simulator, every model and the app.
- India's Indian Diabetes Risk Score (IDRS) as a baseline; the report shows it and flags "missed by IDRS".
- Live what-if panel plus a scenario table (exercise, smaller waist, both); smooth Platt calibration.
- New experiment E10: the app's what-ifs against the simulator's true effect.

## Final headline numbers (simulated outcomes)
- Genes add +0.063 AUC on top of all clinical factors (0.812 → 0.874, p < 0.001); IDRS alone 0.761.
- Lean cases caught in the top 20%: BMI rule 0%, IDRS 30%, clinical model 35%, with genes 58%.
- What-ifs vs truth: waist −5 cm −28% vs −28%; exercise −32% vs −40%; both −52% vs −59%.
- Interaction search: 70–84% of planted pairs found at 10,000 people (PLINK BOOST 40–48%).
- Quantum: no significant gain anywhere (E5, E7), reported honestly.

## What we need from you / the team
- **IBM Quantum (optional, for a real-hardware result):** each person can create a free IBM Quantum account.
  Save the API key yourself on your own laptop (command in `scripts/run_ibm.py`); never paste it into chat or git.
  Then run `python scripts/run_ibm.py --backend ibm_kingston --depths 1 2` and `make figures`.
- **Validation cohort wording:** answer the comment in the report (Genes & Health vs GenomeIndia via IBDC).
- **GitHub:** the code is at https://github.com/coderboic/QGenomix (private). Add teammates under Settings →
  Collaborators. To bring it into the team repo (SuyashN07/QGenomix, remote `team`), push a branch there and
  open a pull request; do not force-push over the teammates' branches.
- **Thapar submission format:** if the department needs the Word template, export the report and add the cover
  page, declaration, signatures and the Turnitin report from the mid-sem `.docx`.
- **Panel date and who presents which part,** if you want slides and a timed demo script.

## Demo checklist (panel day)
- Needed on the laptop: `.venv/`, `bundle/`, `data/personas/`, `figures/`, `docs/` (no internet needed).
- `make app`, then open http://localhost:8501/?persona=asha_lean_high&autorun=1 (lean, IDRS moderate,
  QGenomix high risk; what-ifs show exercise + smaller waist cutting her risk by about three quarters).
- The first report takes ~10 s (reading a 46 MB genome file); after that, what-if changes are instant.
- If the model bundle is rebuilt, restart the app (it caches the model).
- Backup screenshots: `figures/app_report_asha.png`, `app_report_ravi.png`, `app_clinician.png`
  (regenerate with `python scripts/screenshot_app.py` while the app runs).
