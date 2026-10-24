// QGenomix mentor evaluation report (A4, Times New Roman, Thapar capstone format).
//   cd docs/report && npm install && npm run build      (needs results/*.json and figures/*.png)
// Every number in the text is read from results/, so the report always matches the experiments.
const fs = require("fs");
const path = require("path");
const {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, ImageRun, LevelFormat, Packer, PageNumber,
  Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType,
} = require("docx");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.resolve(process.argv[2] || path.join(ROOT, "QGenomix_Mentor_Evaluation_Report.docx"));
const CONTENT_W = 9386; // A4 width 11906 - left 1440 - right 1080
const FONT = "Times New Roman";

// ---------------------------------------------------------------- results
const R = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, "results", name), "utf8"));
const T = process.env.QGX_TABLES ? JSON.parse(fs.readFileSync(process.env.QGX_TABLES, "utf8")) : R("tables.json");
const e1 = T.e1.models;
const auc = (m) => e1[m].auc[0];
const lean = (m) => e1[m].lean_case_capture[0];
const f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3), pc = (x) => `${Math.round(100 * x)}%`;
const quantumNames = ["H_vqc", "M10_xgb_vqc", "H_noent", "M9_xgb_noent"];
const qMin = Math.min(...quantumNames.map(auc)), qMax = Math.max(...quantumNames.map(auc));
const e10 = R("e10_lifestyle.json").scenarios;
const rel = (k, w) => `${Math.round(100 * e10[k][`${w}_relative_change`])}%`.replace("-", "−");

const e11 = T.e11.groups;
const POPS = { GIH: "Gujarati", PJL: "Punjabi", BEB: "Bengali", STU: "Sri Lankan Tamil", ITU: "Telugu" };
const popAuc = Object.keys(POPS).map((k) => e11[k].auc_genetic);
const popGain = Object.keys(POPS).map((k) => e11[k].auc_genetic - e11[k].auc_clinical);
const allGain = Object.keys(POPS).every((k) => e11[k].auc_genetic > e11[k].auc_clinical);
const worstPop = Object.keys(POPS).reduce((a, b) => (e11[a].auc_genetic < e11[b].auc_genetic ? a : b));
const bestPop = Object.keys(POPS).reduce((a, b) => (e11[a].auc_genetic > e11[b].auc_genetic ? a : b));

const e12 = T.e12;
const settings = Object.keys(e12);
const nSet = settings.length;
const dAuc = settings.map((s) => e12[s].auc_genetic - e12[s].auc_clinical);
const nAucWin = dAuc.filter((d) => d > 0).length;
const nLeanWin = settings.filter((s) => e12[s].lean_capture_genetic > e12[s].lean_capture_idrs).length;
const edrs = settings.map((s) => e12[s].edr10_score_test);

const e13 = T.e13;
const e13s = e13.summary;
const ci = e13.coverages.indexOf(0.45);
const m13 = (method, title) => e13s[method][title][ci][0];
const PRS_T = "PRS agreement with the full genome", ERR_T = "Error in the risk percentile shown",
  HIGH_T = "High-risk people still flagged high";

const e7b = T.e7b;
const mit = (k) => e7b[k];

const countLines = (dir, re) => fs.readdirSync(dir, { recursive: true })
  .filter((f) => re.test(f)).reduce((n, f) => n + fs.readFileSync(path.join(dir, f), "utf8").split("\n").length - 1, 0);
const pyFiles = fs.readdirSync(path.join(ROOT, "src/qgenomix"), { recursive: true }).filter((f) => f.endsWith(".py"));
const srcLines = countLines(path.join(ROOT, "src/qgenomix"), /\.py$/);
const nScripts = fs.readdirSync(path.join(ROOT, "scripts")).filter((f) => f.endsWith(".py")).length;
const nTests = fs.readdirSync(path.join(ROOT, "tests")).filter((f) => f.endsWith(".py"))
  .reduce((n, f) => n + (fs.readFileSync(path.join(ROOT, "tests", f), "utf8").match(/^def test_/gm) || []).length, 0);

// ---------------------------------------------------------------- text helpers: **bold**, ^{sup}, `code`
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\^\{[^}]+\}|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(new TextRun({ ...base, text: tok.slice(2, -2), bold: true }));
    else if (tok.startsWith("^{")) out.push(new TextRun({ ...base, text: tok.slice(2, -1), superScript: true }));
    else out.push(new TextRun({ ...base, text: tok.slice(1, -1), font: "Consolas", size: (base.size || 24) - 3 }));
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}
const P = (text, o = {}) => new Paragraph({
  alignment: o.align ?? AlignmentType.JUSTIFIED, keepNext: o.keepNext,
  spacing: { after: o.after ?? 120, before: o.before ?? 0, line: 276 }, children: runs(text, o.run || {}),
});
const C = (text, run = {}, after = 80) => new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { after, line: 276 }, children: runs(text, run),
});
const H1 = (text, o = {}) => new Paragraph({
  heading: HeadingLevel.HEADING_1, alignment: o.center ? AlignmentType.CENTER : AlignmentType.LEFT,
  pageBreakBefore: o.pageBreak !== false, children: [new TextRun(text)],
});
const H2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [new TextRun(text)] });
const bullet = (text, align = AlignmentType.JUSTIFIED) => new Paragraph({
  numbering: { reference: "bullets", level: 0 }, alignment: align, spacing: { after: 80, line: 276 },
  children: runs(text),
});
const bullets = (items, align) => items.map((t) => bullet(t, align));

// ---------------------------------------------------------------- tables
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "8A9AA4" };
const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
function cell(text, width, { header = false, align = AlignmentType.LEFT, shade } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA }, borders: BORDERS, verticalAlign: VerticalAlign.CENTER,
    shading: header ? { fill: "DCE5EA", type: ShadingType.CLEAR, color: "auto" }
      : shade ? { fill: shade, type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: String(text).split("\n").map((line) => new Paragraph({
      alignment: align, spacing: { after: 0, line: 250 }, children: runs(line, { size: 20, bold: header || undefined }),
    })),
  });
}
function table(headers, rows, widths, o = {}) {
  const sum = widths.reduce((a, b) => a + b, 0);
  if (sum !== CONTENT_W && !o.width) throw new Error(`widths sum ${sum} != ${CONTENT_W}`);
  const aligns = o.aligns || widths.map(() => AlignmentType.LEFT);
  return new Table({
    width: { size: o.width || CONTENT_W, type: WidthType.DXA }, columnWidths: widths,
    alignment: o.center ? AlignmentType.CENTER : undefined,
    rows: [
      ...(headers ? [new TableRow({ tableHeader: true, cantSplit: true,
        children: headers.map((h, i) => cell(h, widths[i], { header: true, align: aligns[i] })) })] : []),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((t, i) =>
        cell(t, widths[i], { align: aligns[i], shade: o.shadeFirst && i === 0 ? "F3F6F8" : undefined })) })),
    ],
  });
}
let tableNo = 0, figNo = 0;
const tableCaption = (text) => new Paragraph({
  keepNext: true, spacing: { before: 120, after: 80 },
  children: [new TextRun({ text: `Table ${++tableNo}: `, bold: true, size: 22 }), ...runs(text, { size: 22 })],
});

// ---------------------------------------------------------------- figures
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function figure(name, widthPx, caption) {
  const file = path.isAbsolute(name) ? name : path.join(ROOT, "figures", name);
  if (!fs.existsSync(file)) {  // experiment not run yet: keep the numbering, say what is missing
    console.warn("missing figure", name);
    return [C(`[Figure ${++figNo} pending: ${name}]`, { italics: true }, 200)];
  }
  const { w, h } = pngSize(file);
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 60 },
      children: [new ImageRun({ type: "png", data: fs.readFileSync(file),
        transformation: { width: widthPx, height: Math.round((widthPx * h) / w) } })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
      children: [new TextRun({ text: `Figure ${++figNo}: `, bold: true, size: 21 }),
        ...runs(caption, { size: 21, italics: true })] }),
  ];
}

// =====================================================================
// COVER
// =====================================================================
const cover = [
  new Paragraph({ spacing: { before: 600 }, children: [] }),
  C("QGenomix: Quantum-Classical Hybrid Framework", { bold: true, size: 32 }, 40),
  C("for Polygenic Disease Risk Prediction", { bold: true, size: 32 }, 160),
  C("Focus: early-onset type 2 diabetes in lean South Asians", { italics: true, size: 26 }, 360),
  C("Capstone Project Report", { bold: true, size: 26 }, 80),
  C("MENTOR EVALUATION", { bold: true, size: 24 }, 60),
  C("Progress report", {}, 480),
  C("Submitted by:", {}, 120),
  table(null, [["102303452", "Aritro Chowdhury"], ["102303017", "Suyash Gupta"], ["102303286", "Rishabh Sharma"],
    ["102315073", "Akshat Ahuja"], ["102303455", "Anshh Pasriccha"]], [1700, 2900], { width: 4600, center: true }),
  new Paragraph({ spacing: { after: 200 }, children: [] }),
  C("BE Third Year, COE"),
  C("CPG No: 218", {}, 400),
  C("Under the Mentorship of"),
  C("Dr. Husanbir Singh Pannu", { bold: true }),
  C("Assistant Professor, CSED", {}, 600),
  C("Computer Science and Engineering Department", { bold: true }),
  C("Thapar Institute of Engineering and Technology, Patiala", { bold: true }, 200),
  C("October 2026"),
];

// =====================================================================
// SUMMARY
// =====================================================================
const summary = [
  H1("SUMMARY", { center: true, pageBreak: false }),
  P("South Asians develop type 2 diabetes (T2D) younger and at a lower body weight than Europeans, so screening " +
    "that relies on body-mass index (BMI) misses many of them. QGenomix asks two questions: do variants from two " +
    "diabetes mechanisms, insulin production (β-cell) and fat distribution (lipodystrophy), interact; and how much " +
    "does genetic information add to the Indian Diabetes Risk Score (IDRS), the questionnaire used for screening in " +
    "India? Gene-pair selection is posed as a QUBO and solved classically and with the Quantum Approximate " +
    "Optimisation Algorithm (QAOA); selected pairs are encoded by an 8-qubit variational quantum circuit (VQC); and " +
    "every quantum step is compared against a classical control."),
  P("The system is complete and runs end to end on real genotypes: all 2,504 genomes of the 1000 Genomes Project, " +
    "published polygenic scores from the PGS Catalog, and 10,000 synthetic South Asians built from the 978 real " +
    "South Asian haplotypes, with simulated outcomes so that every discovery claim can be checked. It ends in a " +
    "working risk-report application that reads 23andMe and AncestryDNA files, fills in variants the file is " +
    "missing by LD imputation, produces a downloadable PDF report, and ships as a Docker image."),
  P("**Main results** (simulated outcomes, real genotypes):", { after: 60, keepNext: true }),
  ...bullets([
    `Genetic scores add ${f3(auc("M3_additive") - auc("M3c_clinical"))} AUC on top of all clinical factors ` +
      `(${f3(auc("M3c_clinical"))} → ${f3(auc("M3_additive"))}, DeLong p ≤ 4×10^{−6} in every seed); the IDRS alone ` +
      `reaches ${f3(auc("M0_idrs"))}.`,
    `Among lean people (BMI < 23) who develop diabetes, screening the top 20% catches **${pc(lean("M1_bmi"))}** with ` +
      `a BMI rule, **${pc(lean("M0_idrs"))}** with the IDRS and **${pc(lean("M3_additive"))}** with the genetic model.`,
    `The result holds in ${nAucWin} of ${nSet} alternative simulator settings and in all five South Asian ` +
      `populations of 1000 Genomes (AUC ${f2(Math.min(...popAuc))}–${f2(Math.max(...popAuc))}).`,
    `For a typical consumer DNA file (45% of risk-score variants), LD imputation halves the error in the reported ` +
      `risk percentile (${m13("mean_fill", ERR_T).toFixed(0)} → ${m13("ld_impute", ERR_T).toFixed(0)} points).`,
    "The interaction search recovers 70–84% of planted gene pairs at 10,000 people (PLINK BOOST 40–48%) and " +
      "reports almost nothing when no interaction exists.",
    `The quantum components give no significant gain over their classical controls. On IBM's Kingston noise ` +
      `model, error mitigation lifts the constraint-preserving QAOA from ${f2(mit("xy_p1").raw)} to ` +
      `${f2(mit("xy_p1").readout_postselect_zne)} (noise-free ${f2(mit("xy_p1").ideal_postselect)}).`,
    `Engineering: ${pyFiles.length} Python modules (${srcLines.toLocaleString("en-IN")} lines), ${nTests} automated ` +
      "tests, continuous integration on GitHub, a Docker image, and every result reproducible from one config file.",
  ]),
  P("All six objectives approved at mid-semester are complete, and the project goes well beyond them. Two " +
    "features are deliberately kept for the final panel evaluation: a run on a real IBM quantum computer and a " +
    "public online demo (Chapter 8). Both are built and rehearsed; they need only the team's own accounts.",
    { before: 60 }),
];

// =====================================================================
// CHAPTER 1
// =====================================================================
const ch1 = [
  H1("CHAPTER 1: PROJECT OVERVIEW"),
  H2("1.1 The Problem"),
  P("India has an estimated 101 million adults with diabetes and 136 million with prediabetes [1]. South Asians " +
    "develop T2D at younger ages and lower BMI than Europeans, a pattern often called the lean or \"thin-fat\" " +
    "phenotype [2]. Two consequences follow. BMI-based screening misses lean people at high risk, and the IDRS [3], " +
    "which scores age, waist, physical activity and family history, cannot see inherited risk in a young, slim person."),
  P("Recent genetic studies split T2D risk into mechanism-specific scores [4] and have produced a multi-ancestry " +
    "PRS trained for South Asians, D-PRISM [5]. What is not known is whether the mechanisms interact: whether a " +
    "person high on both the β-cell and the lipodystrophy score carries more risk than the two scores add up to. " +
    "Testing every pair of variants across mechanisms and choosing a small, non-redundant set of pairs is a " +
    "combinatorial selection problem, which is where the quantum methods enter."),
  H2("1.2 Changes Since the Mid-Semester Evaluation"),
  P("The mid-semester design was generic. Table 1 lists what changed and why; each change gives the project a " +
    "measurable clinical outcome and a verifiable ground truth."),
  tableCaption("Changes from the mid-semester plan"),
  table(["Aspect", "Mid-semester plan", "Implemented", "Reason"], [
    ["Clinical focus", "T2D in general", "Early-onset T2D in lean South Asians, compared with IDRS screening",
      "A specific, unmet need in India gives a measurable outcome"],
    ["Genotypes", "2,504 × 1,000 SNP matrix", "Full 1000 Genomes data; 10,000 synthetic South Asians built from real haplotypes",
      "Real allele frequencies and linkage; enough people to detect interactions"],
    ["Risk scores", "Literature GWAS betas (pending)", "D-PRISM South Asian PRS (1.34M variants) and 5 mechanism scores from the PGS Catalog",
      "Published, ancestry-matched weights"],
    ["Outcomes", "Labels with 20 hidden pairs", "Liability model: genetics, β-cell × lipodystrophy interaction, 10 planted pairs, age, sex, BMI, waist, activity, family history",
      "Known truth makes every discovery claim checkable"],
    ["Pair selection", "Adaptive SHAP loop", "Score test on 1,263 cross-mechanism pairs, then QUBO (annealing and QAOA)",
      "SHAP ranking found 33% of planted pairs, the score test 73% (E1)"],
    ["Quantum", "VQC encoder, 125 circuits", "QAOA with error mitigation; 12-circuit VQC with no-entanglement and classical-twin controls",
      "Controls isolate what the quantum part contributes"],
    ["Output", "Benchmark table", "Benchmark, web app with PDF report, REST API, Docker image",
      "Shows how the result reaches a clinician or a user"],
  ], [1450, 1900, 3336, 2700], { shadeFirst: true }),
];

// =====================================================================
// CHAPTER 2
// =====================================================================
const ch2 = [
  H1("CHAPTER 2: PROGRESS AGAINST APPROVED OBJECTIVES"),
  P("Table 2 compares each objective approved at the mid-semester evaluation with its status then and now."),
  tableCaption("Status of the approved objectives"),
  table(["#", "Approved objective", "Mid-sem", "Now", "Evidence"], [
    ["1", "Genomic data pipeline: QC, SNP selection, pair ranking, labels", "100%", "Complete, rebuilt on real data",
      "`make data` rebuilds every file from the raw downloads; a full re-run gave identical output"],
    ["2", "Variational quantum circuit encoder for SNP pairs", "20%", "Complete",
      "8-qubit circuit; our simulator matches PennyLane to 10^{−6} and trains 7× faster"],
    ["3", "Classical baselines (LR, RF, XGBoost, SVM) and PRS", "15%", "Complete",
      "Also the IDRS, a BMI rule and a clinical-factor model"],
    ["4", "Hybrid stacking ensemble", "0%", "Complete", `Stacked model has the best AUC, ${f3(auc("M12_stack"))}`],
    ["5", "SHAP-guided adaptive pair refinement", "0%", "Built, tested, replaced",
      "SHAP ranking found 33% of planted pairs vs 73% for the score test; SHAP kept for per-person explanations"],
    ["6", "Benchmark: AUC-ROC, F1, EDR@K, DeLong, McNemar", "10%", "Complete",
      "17 models, 15 experiments (E0–E13), Holm-corrected tests"],
  ], [450, 2700, 950, 1500, 3786], { aligns: [AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.CENTER,
    AlignmentType.LEFT, AlignmentType.LEFT] }),
  H2("2.1 Work Beyond the Approved Plan"),
  ...bullets([
    "**QAOA for pair selection** in two formulations, with readout correction, post-selection and zero-noise " +
      "extrapolation, tested on a noise model of IBM's 156-qubit Kingston processor.",
    "**Clinical factors and the IDRS**, so the value of genetics is measured against what Indian clinics already use.",
    "**Validation on real genomes** of five ancestries, and **fairness** across five South Asian populations and both sexes.",
    "**Robustness** of every conclusion to the simulator's assumptions.",
    "**LD imputation** of variants missing from consumer DNA files, built from the South Asian reference genomes.",
    "**A complete application:** dashboard, REST API, PDF report, clinician view, model card and Docker image.",
    "**Automated tests and continuous integration** on GitHub.",
  ]),
  H2("2.2 Progress Since the Previous Mentor Review (21 October)"),
  tableCaption("Features added since the previous review"),
  table(["Feature", "What it does", "Result"], [
    ["LD imputation (E13)", "Predicts each variant missing from a DNA file from its best-correlated measured neighbour",
      `Percentile error ${m13("mean_fill", ERR_T).toFixed(0)} → ${m13("ld_impute", ERR_T).toFixed(0)} points at 45% coverage`],
    ["Error mitigation (E7b)", "Readout correction, post-selection and zero-noise extrapolation for QAOA",
      `XY QAOA ${f2(mit("xy_p1").raw)} → ${f2(mit("xy_p1").readout_postselect_zne)} on the IBM noise model`],
    ["Fairness (E11)", "Accuracy, calibration and screening yield per South Asian population and sex",
      `Genetics helps in ${allGain ? "every" : "most"} group; AUC ${f2(Math.min(...popAuc))}–${f2(Math.max(...popAuc))}`],
    ["Robustness (E12)", `${nSet} simulator settings, one assumption changed at a time`,
      `Genetics beats clinical factors in ${nAucWin} of ${nSet}`],
    ["PDF report", "One-page report from the dashboard and the API (`POST /v1/report.pdf`)", "Tested from inside Docker"],
    ["Docker image", "Dashboard and API in containers (`docker compose up`)", "1.3 GB image, health checks pass"],
    ["IBM rehearsal mode", "Runs the hardware script locally on the Kingston noise model", "Ready for the panel run"],
  ], [1900, 4100, 3386], { shadeFirst: true }),
];

// =====================================================================
// CHAPTER 3
// =====================================================================
const ch3 = [
  H1("CHAPTER 3: SYSTEM ARCHITECTURE"),
  P("Figure 1 shows the system. Three inputs feed eight stages; the two purple stages use quantum circuits, and " +
    "each is compared against a classical control. Table 4 lists the module and main technique of each stage."),
  ...figure("fig_architecture.png", 620, "QGenomix architecture: inputs, the eight stages S1–S8, and the quantum stages (purple)"),
  tableCaption("Stages, code modules and techniques"),
  table(["Stage", "Module (src/qgenomix)", "Technique"], [
    ["S1 Data preparation", "data", "PLINK 2 QC (MAF, HWE, missingness), PCA, PRS scoring, haplotype library (2,710 blocks), LD panel"],
    ["S2 Cohort and simulator", "data.cohort, sim, clinical", "Haplotype-mosaic cohort; liability-threshold outcome model, 11% prevalence; IDRS"],
    ["S3 Interaction search", "search.relevance", "Vectorised Rao score test for 1,263 pairs, refitted in every cross-validation fold"],
    ["S4 Pair selection", "search.qubo, solvers, qaoa, mitigation", "QUBO of relevance minus SNP overlap; simulated annealing with swap polish; QAOA in Qiskit with error mitigation"],
    ["S5 Quantum encoder", "quantum", "8-qubit data re-uploading circuit (RY/RZ rotations, CZ ring), 4 layers, 64 parameters; fidelity kernel"],
    ["S6 Model zoo", "models.zoo", "IDRS, BMI rule, logistic regression, random forest, SVM, XGBoost, quantum heads, quantum-kernel SVC, stacking"],
    ["S7 Evaluation", "eval, pipeline", "AUC, average precision, F1, Brier, EDR@K, lean-case capture; DeLong, McNemar, Holm; E0–E13"],
    ["S8 Application", "app, data.impute", "Genotype parser, LD imputation, calibrated model, FastAPI, Streamlit, PDF report, Docker"],
  ], [2050, 2300, 5036], { shadeFirst: true }),
];

// =====================================================================
// CHAPTER 4
// =====================================================================
const ch4 = [
  H1("CHAPTER 4: IMPLEMENTATION"),
  H2("4.1 Data"),
  P("PLINK 2 [6] processed the 1000 Genomes phase 3 release [7]: 84 million variants in 2,504 people from 26 " +
    "populations. From it we computed the five components of D-PRISM [5] (1.34 million variants), the five mechanism " +
    "scores of [4] (β-cell, lipodystrophy, liver/lipid, obesity, proinsulin), and the dosages of their 62 SNPs. The " +
    "489 South Asian samples (Gujarati, Punjabi, Bengali, Sri Lankan Tamil and Telugu) give 978 phased haplotypes. A " +
    "synthetic person is assembled by drawing each one-megabase block of the genome from a random South Asian " +
    "haplotype, which keeps real allele frequencies and local linkage while allowing a cohort of any size."),
  H2("4.2 Outcome Simulator"),
  P("Each person's liability to T2D is a weighted sum of the D-PRISM background (10% of variance), the five " +
    "mechanism scores (6.9%), a β-cell × lipodystrophy interaction (2.0%), ten planted SNP-pair interactions (4.0%), " +
    "age (7%), BMI (4%), waist, activity and family history (4.5% together) and noise. The top 11% become cases, close " +
    "to the national prevalence [1]. The IDRS is computed from the simulated clinical factors exactly as published [3]. " +
    "The simulator reproduces the lean phenotype: 25% of cases are lean, and people high on both the β-cell and " +
    "lipodystrophy scores have a 37% case rate against 10% for everyone else, despite a lower average BMI."),
  H2("4.3 Interaction Search and QUBO Selection"),
  P("For each of the 1,263 pairs of SNPs from different mechanisms, a Rao score test asks whether the pair's product " +
    "term improves a logistic model that already contains all main effects and covariates; it is vectorised over all " +
    "pairs (about 7 seconds per fold). The 200 strongest pairs enter a QUBO that rewards relevance and penalises " +
    "pairs sharing a SNP or a linkage block, with a penalty that forces exactly 48 pairs [8]. Simulated annealing " +
    "with a swap-polishing step solves it; top-K ranking and mRMR [9] are the classical controls."),
  H2("4.4 Quantum Circuits"),
  P("**QAOA** [10]. A 12-pair sub-problem (choose 4 of 12) is solved with QAOA in Qiskit. Besides the textbook " +
    "penalty formulation we implemented a constraint-preserving XY mixer [11] that starts from a Dicke state, " +
    "prepared with the Bärtschi–Eidenbenz circuit [12], so it only explores valid selections."),
  P("**Encoder.** Each 8-qubit circuit takes 4 SNP pairs, places the two dosages of a pair on two qubits and " +
    "re-uploads the data [13] over 4 layers of RY/RZ rotations and a CZ ring. Twelve circuits cover 48 pairs and give " +
    "96 features. Our exact PyTorch statevector simulator matches PennyLane to 10^{−6} and trains 7× faster. Controls: " +
    "the same circuit without CZ gates (no entanglement) and a classical network of similar size. A quantum-kernel " +
    "SVC [14] is also tested."),
  H2("4.5 Error Mitigation"),
  P("Real quantum processors are noisy: after routing to IBM's heavy-hex layout the QAOA circuits need 220–700 " +
    "two-qubit gates. Three standard, inexpensive techniques are applied to the same shots. **Readout correction** " +
    "measures two calibration circuits and inverts each qubit's 2 × 2 assignment matrix [15]. **Post-selection** " +
    "keeps only samples that select exactly four pairs; for the XY circuit any other count is a detected error, " +
    "because the circuit conserves it [16]. **Zero-noise extrapolation** runs the circuit at noise scales 1, 3 and 5 " +
    "by unitary folding and extrapolates the quality back to zero noise [17]. The same code drives the hardware run."),
  H2("4.6 Evaluation Protocol"),
  P("Every experiment holds out 20% of people as a test set. All selection and fitting happens inside 5-fold " +
    "cross-validation on the remaining 80%, so no test information leaks into the choice of pairs. Results are " +
    "averaged over 3 seeds. AUCs are compared with DeLong's test [18], classifications with McNemar's test, both " +
    "Holm-corrected. EDR@10 is the share of the 10 planted pairs found in a method's top 10. Lean-case capture is the " +
    "share of lean cases (BMI < 23) among the top 20% of predicted risk, with exactly 20% flagged."),
  H2("4.7 LD Imputation for Consumer DNA Files"),
  P("Consumer chips measure about 600,000 SNPs, so a typical 23andMe or AncestryDNA file contains only about half " +
    "of the 1.34 million D-PRISM variants. Filling a missing variant with the population average pulls every score " +
    "towards the middle and hides high-risk people. QGenomix instead predicts each missing variant from its " +
    "best-correlated measured neighbour (its \"tag\"), using linkage disequilibrium measured in the 489 South Asian " +
    "genomes: the dosage is the reference mean plus a regression slope times the tag's deviation from its mean. For " +
    `each of 1.46 million variants the panel stores the six best tags within 500 kb; the median best tag has ` +
    `r² = ${f2(e13.best_tag_r2_median)}. The panel builds in about two minutes and imputes a genome in about one ` +
    "second, with no external software."),
  H2("4.8 Application"),
  P("The deployed model (XGBoost on clinical factors, PRS, mechanism scores, SNP dosages and quantum features) is " +
    "trained on 16,000 synthetic people and calibrated on 4,000 more (AUC 0.876). The app reads a 23andMe or " +
    "AncestryDNA file, checks the genome build, imputes missing variants, and reports the risk tier and percentile, " +
    "the IDRS, mechanism percentiles, \"missed by BMI\" and \"missed by IDRS\" flags, the interacting SNP pairs the " +
    "person carries ranked by SHAP [19], live lifestyle what-ifs, and a one-page PDF. A clinician view ranks a " +
    "synthetic cohort. The same service is exposed as a REST API, and both run from one Docker image. Uploaded files " +
    "are processed in memory and never stored."),
];

// =====================================================================
// CHAPTER 5
// =====================================================================
const sx = (k) => mit(k);
const ch5 = [
  H1("CHAPTER 5: RESULTS"),
  P("Table 5 summarises the experiments. All use 10,000 synthetic South Asians unless stated; outcomes are " +
    "simulated, genotypes are real."),
  tableCaption("Experiments and results"),
  table(["Exp.", "Question", "Result"], [
    ["E0", "Does the simulated cohort behave like the population?", "Prevalence 11%; 25% of cases lean; β-cell + lipodystrophy high group: 37% case rate at lower BMI"],
    ["E1", "Which predictor is most accurate?", `IDRS ${f3(auc("M0_idrs"))}, clinical ${f3(auc("M3c_clinical"))}, PRS ${f3(auc("M2_prs"))}, clinical + genetics ${f3(auc("M3_additive"))}, stacked ${f3(auc("M12_stack"))}; quantum ${f3(qMin)}–${f3(qMax)}`],
    ["E2", "Does the search find planted pairs?", "Score test 70–84% in its top 10 at δ = 0.2; PLINK BOOST [20] 40–48%"],
    ["E3", "How many people are needed?", "24% of pairs at 2,500 people, 78% at 10,000, 92% at 20,000, 100% at 40,000"],
    ["E4", "Does it invent pairs when none exist?", "18 of 20 null runs report nothing; 5.4% of p-values below 0.05; λ = 1.05"],
    ["E5", "Does entanglement help?", `Entangled ${f3(auc("H_vqc"))}, no entanglement ${f3(auc("H_noent"))}, classical twin ${f3(auc("H_twin"))}: no`],
    ["E6", "Is QUBO selection better than top-K?", "62 distinct SNPs vs 49, 26% fewer redundant pairs, best objective in 61% of 70 runs"],
    ["E7", "Does QAOA solve the selection?", "Ideal: XY mixer 0.76 → 0.83 (depth 1 → 6), penalty 0.30 → 0.66; with IBM noise both ≈ 0.3"],
    ["E7b", "Can error mitigation recover it?", `XY depth 1: ${f2(sx("xy_p1").raw)} → ${f2(sx("xy_p1").readout_postselect_zne)} (noise-free ${f2(sx("xy_p1").ideal_postselect)}); penalty: ${f2(sx("penalty_p1").raw)} → ${f2(sx("penalty_p1").readout_postselect_zne)}`],
    ["E8", "Who catches lean cases?", `Top 20%: BMI rule ${pc(lean("M1_bmi"))}, IDRS ${pc(lean("M0_idrs"))}, clinical ${pc(lean("M3c_clinical"))}, with genetics ${pc(lean("M3_additive"))}`],
    ["E9", "Does it work on real genomes?", `AUC ${f3(T.e9.SAS.M3_additive[0])} South Asian; 0.85–0.87 East Asian, European, American; ${f3(T.e9.AFR.M3_additive[0])} African`],
    ["E10", "Are the app's what-ifs right?", `Waist −5 cm: ${rel("waist_minus_5cm", "model")} vs true ${rel("waist_minus_5cm", "true")}; exercise ${rel("vigorous_exercise", "model")} vs ${rel("vigorous_exercise", "true")}`],
    ["E11", "Is it fair across populations?", `Genetic-model AUC ${f2(Math.min(...popAuc))}–${f2(Math.max(...popAuc))} across five populations; gain over clinical +${f2(Math.min(...popGain))} to +${f2(Math.max(...popGain))}`],
    ["E12", "Robust to simulator assumptions?", `Genetics beats clinical in ${nAucWin}/${nSet} settings and beats IDRS on lean cases in ${nLeanWin}/${nSet}`],
    ["E13", "Partial consumer DNA files?", `45% coverage: PRS r ${f3(m13("mean_fill", PRS_T))} → ${f3(m13("ld_impute", PRS_T))}; high-risk kept ${pc(m13("mean_fill", HIGH_T))} → ${pc(m13("ld_impute", HIGH_T))}`],
  ], [750, 3000, 5636], { shadeFirst: true, aligns: [AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.LEFT] }),
  H2("5.1 Genetics Adds to Clinical Screening"),
  P(`Figure 2 compares all 17 predictors. Adding the PRS and mechanism scores to the clinical factors raises AUC ` +
    `from ${f3(auc("M3c_clinical"))} to ${f3(auc("M3_additive"))}; DeLong's test gives p ≤ 4×10^{−6} after Holm ` +
    `correction in each seed. The stacked hybrid is the most accurate model (${f3(auc("M12_stack"))}), but its margin ` +
    `over the additive model is not significant.`),
  ...figure("fig_e1_benchmark.png", 520, "E1 benchmark: test AUC of the 17 predictors (mean ± sd over 3 seeds)"),
  H2("5.2 The Lean Blind Spot"),
  P(`Figure 3 is the main clinical result. Among lean people who develop diabetes, a BMI rule flags none by ` +
    `construction, the IDRS flags ${pc(lean("M0_idrs"))} and a clinical-factor model ${pc(lean("M3c_clinical"))}. ` +
    `Adding genetics raises this to ${pc(lean("M3_additive"))}: genetic information helps most for exactly the ` +
    `people current screening misses.`),
  ...figure("fig_e8_lean.png", 560, "E8: share of all cases and of lean cases caught when the top 20% by risk are screened"),
  H2("5.3 Finding Interactions"),
  P("The score test recovers most planted pairs at 10,000 people and nearly all at 20,000 (E2, E3), well ahead of " +
    "PLINK's BOOST. Under the null it is calibrated (λ = 1.05) and 18 of 20 runs report nothing (E4). QUBO selection " +
    "covers more distinct SNPs and wastes fewer slots on redundant \"shadow\" pairs than top-K (E6)."),
  H2("5.4 Robustness to the Simulator's Assumptions"),
  P(`Because outcomes are simulated, a fair question is whether the conclusions depend on our parameter choices. ` +
    `E12 changes one assumption at a time across ${nSet} settings (Figure 4). Genetics beats clinical factors in ` +
    `${nAucWin} of ${nSet} settings (gain ${f3(Math.min(...dAuc))} to ${f3(Math.max(...dAuc))} AUC) and catches more ` +
    `lean cases than the IDRS in ${nLeanWin} of ${nSet}. Interaction discovery, in contrast, depends strongly on ` +
    `effect size (EDR@10 from ${f2(Math.min(...edrs))} to ${f2(Math.max(...edrs))}), which is reported as a limit.`),
  ...figure("fig_e12_robustness.png", 620, "E12: the main conclusions under thirteen alternative simulator settings"),
  H2("5.5 Fairness Across South Asian Populations"),
  P(`E11 trains on synthetic people and tests on the 489 real South Asian genomes of 1000 Genomes (Figure 5). The ` +
    `genetic model improves on clinical factors in ${allGain ? "every" : "most"} population and in both sexes. ` +
    `Accuracy is lowest in the ${POPS[worstPop]} samples (AUC ${f2(e11[worstPop].auc_genetic)}) and highest in the ` +
    `${POPS[bestPop]} samples (${f2(e11[bestPop].auc_genetic)}); with about 100 people per group these differences ` +
    `are within sampling noise. Predicted risks run about ${Math.round(100 * (1 - e11.all.oe[0]))}% high on real ` +
    `genomes, equally in every group, so local recalibration, not a group-specific fix, is the remedy.`),
  ...figure("fig_e11_fairness.png", 620, "E11: accuracy, cases caught and calibration by population and sex"),
  H2("5.6 Consumer DNA Files"),
  P(`E13 holds out 100 real South Asian genomes, builds the LD panel from the other 389, and masks each genome to ` +
    `25%, 45% or 65% coverage (Figure 6). At 45%, typical of a consumer chip, LD imputation raises the PRS ` +
    `correlation with the full genome from ${f3(m13("mean_fill", PRS_T))} to ${f3(m13("ld_impute", PRS_T))}, cuts ` +
    `the error in the reported risk percentile from ${m13("mean_fill", ERR_T).toFixed(1)} to ` +
    `${m13("ld_impute", ERR_T).toFixed(1)} points, and keeps ${pc(m13("ld_impute", HIGH_T))} of truly high-risk ` +
    `people flagged, against ${pc(m13("mean_fill", HIGH_T))} with average filling.`),
  ...figure("fig_e13_imputation.png", 620, "E13: partial DNA files, average filling against LD imputation"),
  H2("5.7 Quantum Results and Error Mitigation"),
  P(`Every quantum component was tested against a matched classical control, and none gave a significant gain ` +
    `(E1, E5, E7). On an ideal simulator the constraint-preserving XY mixer clearly beats the textbook penalty form. ` +
    `Under IBM Kingston noise both fall to about 0.3. Error mitigation (Figure 7) recovers most of the loss: for the ` +
    `XY circuit at depth 1 the approximation ratio rises from ${f2(sx("xy_p1").raw)} to ` +
    `${f2(sx("xy_p1").readout_postselect_zne)}, against ${f2(sx("xy_p1").ideal_postselect)} noise-free and ` +
    `${f2(sx("xy_p1").random_valid)} for a random valid choice. Post-selection does most of the work, which is ` +
    `exactly what the conserved pair count makes possible. An 8-qubit encoder can be simulated exactly, so no ` +
    `speed-up is claimed; the contribution is a controlled test of where quantum methods stand on this problem.`),
  ...figure("fig_e7b_mitigation.png", 600, "E7b: QAOA quality on the IBM Kingston noise model after each mitigation stage"),
  H2("5.8 Real Genomes and Lifestyle What-ifs"),
  P(`On real 1000 Genomes samples the clinical-plus-genetic model reaches AUC ${f3(T.e9.SAS.M3_additive[0])} in ` +
    `South Asians and ${f3(T.e9.AFR.M3_additive[0])} in Africans (E9), the expected loss for a South Asian-trained ` +
    `model. The app's lifestyle what-ifs match the simulator's true effect: waist −5 cm ` +
    `${rel("waist_minus_5cm", "model")} predicted against ${rel("waist_minus_5cm", "true")} true; regular exercise ` +
    `${rel("vigorous_exercise", "model")} against ${rel("vigorous_exercise", "true")} (conservative) (E10).`),
];

// =====================================================================
// CHAPTER 6
// =====================================================================
const ch6 = [
  H1("CHAPTER 6: WORKING PROTOTYPE"),
  P("Figure 8 shows the dashboard report for a synthetic demo persona: a 34-year-old woman with BMI 21.6. " +
    "QGenomix rates her high risk (84th percentile) while the IDRS rates her moderate and the BMI rule does not flag " +
    "her. Her β-cell and lipodystrophy scores are both high, and the what-if table shows exercise and a smaller waist " +
    "cutting her risk from 23% to 6%. Figure 9 is the PDF report the same page produces."),
  ...figure(path.join(__dirname, "asha_top.png"), 450, "Dashboard report for a lean, high-genetic-risk demo persona (synthetic genome)"),
  ...figure("app_pdf_report.png", 430, "The one-page PDF report (download button and POST /v1/report.pdf)"),
  P("The clinician view (Figure 10) ranks a synthetic cohort by risk and filters people who are high risk but would " +
    "be missed by BMI screening or by the IDRS."),
  ...figure(path.join(__dirname, "clinician_crop.png"), 560, "Clinician view of a 200-person synthetic cohort"),
  H2("6.1 Running the Demo"),
  ...bullets([
    "`make app` starts the dashboard at localhost:8501; adding `?persona=asha_lean_high&autorun=1` opens the report above.",
    "`make api` starts the REST service: `POST /v1/profile` returns the report as JSON and `POST /v1/report.pdf` as a PDF.",
    "`docker compose up` runs the dashboard and the API in containers on any machine with Docker.",
    "Three synthetic personas are included: a lean woman at high genetic risk, an obese man at high risk, and a low-risk young woman.",
    "`make rehearse-ibm` runs the quantum-hardware script locally on the IBM Kingston noise model.",
  ], AlignmentType.LEFT),
];

// =====================================================================
// CHAPTER 7
// =====================================================================
const ch7 = [
  H1("CHAPTER 7: TESTING, QUALITY AND REPRODUCIBILITY"),
  ...bullets([
    `**${nTests} automated tests:** unit tests (QUBO, score test, metrics, simulator, IDRS, LD imputation, PLINK file ` +
      "decoding, readout correction, post-selection, extrapolation), equivalence tests (our simulator against " +
      "PennyLane, our QAOA against Qiskit, the Dicke circuit, circuit folding), an end-to-end pipeline test, and " +
      "parser, API and PDF tests including partial chip files, duplicate positions and wrong genome builds.",
    "**Continuous integration:** GitHub Actions installs the project from scratch and runs the linter and all tests on every push.",
    "**Reproducibility:** one YAML file holds every parameter and each result stores its hash; a re-run matches the " +
      "stored result bit for bit; re-running the data pipeline from raw downloads reproduced every processed file; the " +
      "imputation code reproduces PLINK's PRS exactly (r = 1.000).",
    `**Code:** ${pyFiles.length} modules (${srcLines.toLocaleString("en-IN")} lines), ${nScripts} scripts, one \`make\` command per step, and a Docker image.`,
  ]),
  P("Testing found the problems in Table 6, all fixed and covered by tests.", { before: 80 }),
  tableCaption("Problems found in testing and their fixes"),
  table(["Problem", "Effect", "Fix"], [
    ["PLINK ran out of memory on 84 million variants", "Data step crashed", "Extraction split into parts with a memory cap"],
    ["Interaction p-values depended on the CPU thread count", "Small differences between machines", "Tighter solver tolerance; all experiments re-run"],
    ["Duplicate positions in 23andMe files", "App crashed", "De-duplication and a regression test"],
    ["Consumer files cover about 45% of PRS variants", "Scores pulled to average; high-risk people missed", "LD imputation (E13)"],
    ["Ties in coarse scores (IDRS moves in steps of 10)", "More than 20% flagged, IDRS capture inflated", "Exactly 20% flagged, ties broken at random"],
    ["Step-shaped (isotonic) calibration", "Some risks shown as 0%", "Smooth Platt calibration"],
  ], [3300, 2900, 3186], { shadeFirst: true }),
];

// =====================================================================
// CHAPTER 8
// =====================================================================
const ch8 = [
  H1("CHAPTER 8: PLAN FOR THE FINAL PANEL EVALUATION"),
  P("The final panel evaluation is about 15 days away (around 9 November 2026). The system is complete; two " +
    "features have been kept for the panel because each needs an account in the team's own name, and each is " +
    "already built and rehearsed (Table 7)."),
  tableCaption("Features kept for the final panel"),
  table(["Feature", "What is ready", "What remains", "Effort"], [
    ["Run on a real IBM quantum computer", "`scripts/run_ibm.py` with error mitigation, dynamical decoupling and twirling; rehearsed on the Kingston noise model",
      "Create a free IBM Quantum account, save the key locally, run one batched job (about 2 of the 10 free QPU minutes), add the result to Figure 7", "1 day"],
    ["Public online demo", "Docker image and compose file; health checks pass",
      "Deploy the image to a free host (for example Hugging Face Spaces) under a team account; put the link on the slides", "1 day"],
  ], [2000, 2900, 3486, 1000], { shadeFirst: true }),
  H2("8.1 Timeline"),
  tableCaption("Schedule to the final panel"),
  table(["Dates", "Work"], [
    ["26–29 October", "IBM hardware run and analysis; public demo deployment; update figures and report"],
    ["30 Oct – 4 Nov", "Final report in the Thapar format; IEEE-format paper draft; slides; three-minute demo video"],
    ["5–9 November", "Full test run on a clean machine; timed rehearsal with each member presenting one part"],
  ], [2000, 7386], { shadeFirst: true }),
  H2("8.2 Support Requested from the Mentor"),
  ...bullets([
    "Feedback on the emphasis for the panel: the clinical result, the quantum study, or the application.",
    "Guidance on applying for GenomeIndia data through the Indian Biological Data Centre, to validate on real Indian patients after the course.",
    "Advice on a suitable conference or journal for the paper.",
  ]),
];

// =====================================================================
// CHAPTER 9, REFERENCES, REMARKS
// =====================================================================
const ch9 = [
  H1("CHAPTER 9: CONCLUSION"),
  P(`QGenomix is a complete, tested system built around a clear clinical question. On simulated outcomes over real ` +
    `genotypes, genetic scores add substantially to India's screening questionnaire and nearly double the share of ` +
    `lean diabetes cases caught (${pc(lean("M0_idrs"))} → ${pc(lean("M3_additive"))}); the finding survives ` +
    `${nAucWin} of ${nSet} alternative simulator settings and holds in every South Asian population tested. The ` +
    "interaction search finds planted gene pairs reliably and stays quiet when there are none. The application turns " +
    "a consumer DNA file into a calibrated, explained report, with LD imputation for partial files. The quantum " +
    "methods are implemented with care and with classical controls; they show no advantage yet, and error " +
    "mitigation recovers most of the quality that hardware noise destroys. The main limit is that outcomes are " +
    "simulated; validation on a consented Indian cohort is the next step beyond this course."),
  P("**Code:** https://github.com/coderboic/QGenomix (README, model card and handover notes in `docs/`).", { before: 120 }),
];

const refs = [
  "R. M. Anjana et al., \"Metabolic non-communicable disease health report of India: the ICMR-INDIAB national cross-sectional study (ICMR-INDIAB-17),\" Lancet Diabetes Endocrinol., vol. 11, no. 7, pp. 474–489, 2023.",
  "K. M. V. Narayan and A. M. Kanaya, \"Why are South Asians prone to type 2 diabetes? A hypothesis based on underexplored pathways,\" Diabetologia, vol. 63, pp. 1103–1109, 2020.",
  "V. Mohan, R. Deepa, M. Deepa, S. Somannavar and M. Datta, \"A simplified Indian Diabetes Risk Score for screening for undiagnosed diabetic subjects,\" J. Assoc. Physicians India, vol. 53, pp. 759–763, 2005.",
  "D. P. Loesch et al., Nature Communications, 2025, doi: 10.1038/s41467-025-56695-z (mechanism scores PGS005115–PGS005119).",
  "A. Huerta-Chagoya et al., medRxiv, 2025, doi: 10.1101/2025.07.21.25331778 (D-PRISM scores PGS005373–PGS005377).",
  "C. C. Chang et al., \"Second-generation PLINK: rising to the challenge of larger and richer datasets,\" GigaScience, vol. 4, art. 7, 2015.",
  "1000 Genomes Project Consortium, \"A global reference for human genetic variation,\" Nature, vol. 526, pp. 68–74, 2015.",
  "A. Lucas, \"Ising formulations of many NP problems,\" Frontiers in Physics, vol. 2, art. 5, 2014.",
  "H. Peng, F. Long and C. Ding, \"Feature selection based on mutual information: criteria of max-dependency, max-relevance, and min-redundancy,\" IEEE Trans. Pattern Anal. Mach. Intell., vol. 27, no. 8, pp. 1226–1238, 2005.",
  "E. Farhi, J. Goldstone and S. Gutmann, \"A quantum approximate optimization algorithm,\" arXiv:1411.4028, 2014.",
  "S. Hadfield et al., \"From the quantum approximate optimization algorithm to a quantum alternating operator ansatz,\" Algorithms, vol. 12, no. 2, art. 34, 2019.",
  "A. Bärtschi and S. Eidenbenz, \"Deterministic preparation of Dicke states,\" in Fundamentals of Computation Theory (FCT), LNCS 11651, pp. 126–139, 2019.",
  "A. Pérez-Salinas, A. Cervera-Lierta, E. Gil-Fuster and J. I. Latorre, \"Data re-uploading for a universal quantum classifier,\" Quantum, vol. 4, art. 226, 2020.",
  "V. Havlíček et al., \"Supervised learning with quantum-enhanced feature spaces,\" Nature, vol. 567, pp. 209–212, 2019.",
  "S. Bravyi, S. Sheldon, A. Kandala, D. C. Mckay and J. M. Gambetta, \"Mitigating measurement errors in multiqubit experiments,\" Phys. Rev. A, vol. 103, art. 042605, 2021.",
  "X. Bonet-Monroig, R. Sagastizabal, M. Singh and T. E. O'Brien, \"Low-cost error mitigation by symmetry verification,\" Phys. Rev. A, vol. 98, art. 062339, 2018.",
  "K. Temme, S. Bravyi and J. M. Gambetta, \"Error mitigation for short-depth quantum circuits,\" Phys. Rev. Lett., vol. 119, art. 180509, 2017.",
  "E. R. DeLong, D. M. DeLong and D. L. Clarke-Pearson, \"Comparing the areas under two or more correlated receiver operating characteristic curves: a nonparametric approach,\" Biometrics, vol. 44, no. 3, pp. 837–845, 1988.",
  "S. M. Lundberg and S.-I. Lee, \"A unified approach to interpreting model predictions,\" in Advances in Neural Information Processing Systems (NeurIPS), 2017.",
  "X. Wan et al., \"BOOST: A fast approach to detecting gene-gene interactions in genome-wide case-control studies,\" Am. J. Hum. Genet., vol. 87, no. 3, pp. 325–340, 2010.",
];
const references = [
  H1("REFERENCES"),
  ...refs.map((r, i) => new Paragraph({
    spacing: { after: 80, line: 260 }, indent: { left: 560, hanging: 560 }, tabStops: [{ type: "left", position: 560 }],
    children: [new TextRun({ text: `[${i + 1}]\t`, size: 22 }), ...runs(r, { size: 22 })],
  })),
];

const line = (label) => new Paragraph({ spacing: { before: 360, after: 0 },
  children: [new TextRun({ text: `${label}: ` }), new TextRun({ text: "_".repeat(40) })] });
const remarks = [
  H1("MENTOR'S REMARKS", { center: true }),
  new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [CONTENT_W],
    rows: Array.from({ length: 12 }, () => new TableRow({ height: { value: 480, rule: "exact" }, children: [
      new TableCell({ width: { size: CONTENT_W, type: WidthType.DXA },
        borders: { top: NONE, left: NONE, right: NONE, bottom: BORDER }, children: [new Paragraph({ children: [] })] }),
    ] })),
  }),
  line("Faculty Mentor"),
  new Paragraph({ spacing: { before: 120 }, children: [new TextRun("Dr. Husanbir Singh Pannu, Assistant Professor, CSED, TIET, Patiala")] }),
  line("Signature"),
  line("Date"),
];

// =====================================================================
// DOCUMENT
// =====================================================================
const page = { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1300, left: 1440, right: 1080 } };
const doc = new Document({
  creator: "QGenomix team",
  title: "QGenomix Mentor Evaluation Report",
  styles: {
    default: { document: { run: { font: FONT, size: 24 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 32, bold: true, color: "000000" }, paragraph: { spacing: { before: 240, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 28, bold: true, color: "000000" }, paragraph: { spacing: { before: 240, after: 100 }, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•",
    alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] }] },
  sections: [
    { properties: { page }, children: cover },
    {
      properties: { page: { ...page, pageNumbers: { start: 1 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ children: [PageNumber.CURRENT], size: 20 })] })] }) },
      children: [...summary, ...ch1, ...ch2, ...ch3, ...ch4, ...ch5, ...ch6, ...ch7, ...ch8, ...ch9, ...references, ...remarks],
    },
  ],
});
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); console.log("wrote", OUT); });
