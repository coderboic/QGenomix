// QGenomix project summary: a short briefing of everything done, with the key numbers, likely questions and a
// demo script. Numbers are read from results/.
//   cd docs/report && node build_summary.js ../../QGenomix_Project_Summary.docx
const fs = require("fs");
const path = require("path");
const {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, LevelFormat, Packer, PageNumber, Paragraph, ShadingType,
  Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType,
} = require("docx");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.resolve(process.argv[2] || path.join(ROOT, "QGenomix_Project_Summary.docx"));
const CW = 9978; // A4 11906 - 2 x 964 (0.67") margins

const R = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, "results", n), "utf8"));
const T = R("tables.json");
const e1 = T.e1.models;
const auc = (m) => e1[m].auc[0];
const lean = (m) => e1[m].lean_case_capture[0];
const f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3), pc = (x) => `${Math.round(100 * x)}%`;
const e7b = T.e7b.xy_p1;
const e11 = T.e11.groups;
const popAuc = ["GIH", "PJL", "BEB", "STU", "ITU"].map((k) => e11[k].auc_genetic);
const e12 = T.e12, nSet = Object.keys(e12).length;
const nWin = Object.values(e12).filter((v) => v.auc_genetic > v.auc_clinical).length;
const nLean = Object.values(e12).filter((v) => v.lean_capture_genetic > v.lean_capture_idrs).length;
const at = (m, t) => T.e13.summary[m][t][T.e13.coverages.indexOf(0.45)][0];
const ERR = "Error in the risk percentile shown", HIGH = "High-risk people still flagged high";
const e10 = R("e10_lifestyle.json").scenarios;
const rel = (k, w) => `${Math.round(100 * e10[k][`${w}_relative_change`])}%`.replace("-", "−");
const nTests = fs.readdirSync(path.join(ROOT, "tests")).filter((f) => f.endsWith(".py"))
  .reduce((n, f) => n + (fs.readFileSync(path.join(ROOT, "tests", f), "utf8").match(/^def test_/gm) || []).length, 0);

// ---------------------------------------------------------------- helpers: **bold** and ^{sup} markup
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\^\{[^}]+\}|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    out.push(t.startsWith("**") ? new TextRun({ ...base, text: t.slice(2, -2), bold: true })
      : t.startsWith("`") ? new TextRun({ ...base, text: t.slice(1, -1), font: "Consolas", size: 19 })
        : new TextRun({ ...base, text: t.slice(2, -1), superScript: true }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}
const P = (t, o = {}) => new Paragraph({ alignment: o.align ?? AlignmentType.LEFT, spacing: { after: o.after ?? 100,
  before: o.before ?? 0, line: 264 }, keepNext: o.keepNext, children: runs(t, o.run || {}) });
const H = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, keepNext: true, children: [new TextRun(t)] });
const B = (t) => new Paragraph({ numbering: { reference: "b", level: 0 }, spacing: { after: 60, line: 264 }, children: runs(t) });
const N = (t) => new Paragraph({ numbering: { reference: "n", level: 0 }, spacing: { after: 60, line: 264 }, children: runs(t) });
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "B8C6CC" };
const cell = (t, w, head, shade) => new TableCell({
  width: { size: w, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
  borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
  shading: head ? { fill: "0D3D46", type: ShadingType.CLEAR, color: "auto" }
    : shade ? { fill: "E3F0EE", type: ShadingType.CLEAR, color: "auto" } : undefined,
  margins: { top: 50, bottom: 50, left: 100, right: 100 },
  children: [new Paragraph({ spacing: { after: 0, line: 252 },
    children: runs(t, { size: 20, bold: head || undefined, color: head ? "FFFFFF" : undefined }) })],
});
function table(head, rows, widths) {
  if (widths.reduce((a, b) => a + b, 0) !== CW) throw new Error("widths");
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: widths, rows: [
    new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, widths[i], true)) }),
    ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((t, i) => cell(t, widths[i], false, i === 0)) })),
  ] });
}

// ---------------------------------------------------------------- content
const TEAM = [["Aritro Chowdhury", "102303452"], ["Suyash Gupta", "102303017"], ["Rishabh Sharma", "102303286"],
  ["Akshat Ahuja", "102315073"], ["Anshh Pasriccha", "102303455"]];
const body = [
  new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: "QGenomix", bold: true, size: 48, font: "Cambria", color: "0D3D46" })] }),
  P("Quantum-assisted genetic screening for early-onset type 2 diabetes in lean South Asians",
    { run: { size: 26, color: "0A756F" }, after: 120 }),
  P(`**Team:** ${TEAM.map(([n, r]) => `${n} (${r})`).join(", ")}`, { after: 40 }),
  P("**Guide:** Dr. Husanbir Singh Pannu, Assistant Professor, CSED, Thapar Institute of Engineering and Technology, Patiala",
    { after: 200 }),

  H("1. The project in one paragraph"),
  P("South Asians develop type 2 diabetes younger and at a lower body weight than Europeans, so BMI-based screening " +
    "and India's IDRS questionnaire miss many lean people at risk. QGenomix measures how much genetics adds to " +
    "clinical screening, tests whether two diabetes mechanisms (insulin production and fat distribution) interact, " +
    "and asks honestly whether quantum computing helps find the interacting gene pairs. It runs on the real genomes " +
    "of the 1000 Genomes Project with simulated outcomes (so every discovery can be checked against a known truth), " +
    "compares 17 predictors in 17 experiments with a classical control for every quantum step, and ends in a working " +
    "application that turns a consumer DNA file into an explained risk report."),

  H("2. What we built"),
  table(["Stage", "What we built"], [
    ["Data pipeline", "2,504 real genomes (84 M variants) processed with PLINK; the South Asian D-PRISM risk score (1.34 M variants) and five published mechanism scores (62 SNPs); a library of 978 South Asian haplotypes"],
    ["Cohort and simulator", "10,000 synthetic South Asians built from real haplotypes; age, sex, BMI, waist, activity, family history and the IDRS; simulated diabetes with 10 planted gene pairs as known truth"],
    ["Interaction search", "Vectorised score test over all 1,263 cross-mechanism SNP pairs, run inside cross-validation"],
    ["Pair selection (quantum)", "QUBO that rewards relevant pairs and penalises redundant ones, solved by simulated annealing and by QAOA with a constraint-preserving XY mixer; error mitigation for IBM hardware noise"],
    ["Quantum encoder", "8-qubit variational circuit: 12 circuits encode 48 gene pairs into 96 features; our own exact simulator, 7× faster than PennyLane"],
    ["Models and evaluation", "17 predictors (IDRS, BMI rule, PRS, logistic regression, random forest, SVM, XGBoost, quantum variants, stacked hybrid); 17 experiments with DeLong, McNemar and Holm-corrected tests"],
    ["Application", "Dashboard, REST API and one-page PDF report; reads 23andMe and AncestryDNA files and fills in missing variants (LD imputation); Docker image"],
  ], [2300, 7678]),

  H("3. Key results"),
  table(["Question", "Result"], [
    ["Does genetics add to clinical screening?", `AUC ${f3(auc("M3c_clinical"))} → **${f3(auc("M3_additive"))}** with genetics (DeLong p ≤ 4×10^{−6}); the IDRS alone ${f3(auc("M0_idrs"))}, a BMI rule ${f3(auc("M1_bmi"))}`],
    ["Does it find lean people at risk?", `Lean diabetes cases caught in the top 20% of risk: BMI rule ${pc(lean("M1_bmi"))}, IDRS ${pc(lean("M0_idrs"))}, clinical model ${pc(lean("M3c_clinical"))}, **with genetics ${pc(lean("M3_additive"))}**`],
    ["Does the search find interacting pairs?", "**70–84%** of planted pairs in the top 10 at 10,000 people (PLINK BOOST 40–48%); with no true interaction, 18 of 20 runs report nothing (λ = 1.05)"],
    ["Does it work on real genomes?", `AUC ${f3(T.e9.SAS.M3_additive[0])} on real South Asians; ${f3(T.e9.AFR.M3_additive[0])} on Africans`],
    ["Is it fair?", `Genetics helps in all five South Asian populations and both sexes (AUC ${f2(Math.min(...popAuc))}–${f2(Math.max(...popAuc))})`],
    ["Is it robust to our assumptions?", `Genetics beats clinical factors in **${nWin} of ${nSet}** simulator settings, and beats the IDRS on lean cases in ${nLean} of ${nSet}`],
    ["Do partial DNA files work?", `At 45% coverage, LD imputation cuts the risk-percentile error from ${Math.round(at("mean_fill", ERR))} to **${Math.round(at("ld_impute", ERR))}** points and keeps ${pc(at("ld_impute", HIGH))} of high-risk people flagged (${pc(at("mean_fill", HIGH))} before)`],
    ["Did quantum computing help?", `**It does its job, no speed-up**: on gene-pair-only risk, entangled circuit ${f3(T.e14.auc.vqc[0])} vs ${f3(T.e14.auc.noent[0])} without entanglement; 12-qubit QAOA matches annealing on the full selection. Realistic cohort: all encoders tie (${f3(auc("H_vqc"))}, ${f3(auc("H_noent"))}, ${f3(auc("H_twin"))})`],
    ["Are the lifestyle what-ifs right?", `Waist −5 cm: ${rel("waist_minus_5cm", "model")} in the app vs ${rel("waist_minus_5cm", "true")} true; exercise ${rel("vigorous_exercise", "model")} vs ${rel("vigorous_exercise", "true")}`],
  ], [3100, 6878]),

  H("4. Progress since the mid-semester evaluation"),
  table(["Approved objective", "Mid-sem", "Now"], [
    ["Data pipeline", "100%", "Complete; rebuilt on real 1000 Genomes data"],
    ["Quantum (VQC) encoder", "20%", "Complete, with no-entanglement and classical-twin controls"],
    ["Classical baselines and PRS", "15%", "Complete, plus the IDRS, a BMI rule and a clinical model"],
    ["Hybrid stacking ensemble", "0%", `Complete (best AUC ${f3(auc("M12_stack"))})`],
    ["SHAP refinement loop", "0%", "Built and measured; replaced by the score test + QUBO (73% vs 33% of planted pairs found)"],
    ["Benchmark and statistical tests", "10%", "Complete: 17 models, 15 experiments"],
  ], [3300, 1100, 5578]),
  P("**Added beyond the plan:** QAOA with error mitigation; clinical factors and the IDRS; real-genome, fairness and " +
    "robustness tests; LD imputation for consumer DNA files; the application with PDF report, REST API and Docker.",
    { before: 100 }),

  H("5. Deliverables"),
  B(`**Code:** github.com/coderboic/QGenomix — full pipeline, ${nTests} automated tests, continuous integration, Docker; every result reproducible from one configuration file.`),
  B("**Reports:** QGenomix_Final_Mentor_Evaluation_Report.docx and QGenomix_Final_Panel_Evaluation_Report.docx (department format)."),
  B("**Slides:** QGenomix_Mentor_Evaluation_Presentation.pptx (41 slides) and QGenomix_Final_Panel_Evaluation_Presentation.pptx (42 slides, with the live demonstration)."),
  B("**Application:** dashboard, REST API, PDF report, model card; runs offline on a laptop."),

  H("6. Kept for the final panel"),
  B("**Real IBM quantum run:** script ready and rehearsed on the Kingston noise model; needs a free IBM account (about 2 of 10 free QPU minutes)."),
  B("**Public online demo:** Docker image built and tested; needs deployment under a team account."),
  B("Final report polish, paper draft, demo video and rehearsal."),

  H("7. Likely questions and short answers"),
  P("**Your outcomes are simulated. Why trust the results?**", { after: 20, keepNext: true }),
  P("Genotypes and risk weights are real; the simulator matches Indian prevalence; the conclusions hold in all 13 " +
    "alternative settings and on real genomes of five ancestries. Validation on real Indian patients (for example " +
    "GenomeIndia through IBDC) is the next step."),
  P("**What did quantum computing actually contribute?**", { after: 20, keepNext: true }),
  P(`Each part does its job, with no speed-up claimed. On an outcome made only of gene pairs, entanglement is what lets ` +
    `the circuit see the interaction (${f3(T.e14.auc.vqc[0])} with it, ${f3(T.e14.auc.noent[0])} without), and 12-qubit ` +
    "QAOA makes the full pair selection as well as simulated annealing. On the realistic cohort the quantum models tie " +
    "their classical controls, and error mitigation recovers most of the quality that hardware noise destroys."),
  P("**Why a QUBO instead of simply taking the top pairs?**", { after: 20, keepNext: true }),
  P("Top-K wastes slots on redundant pairs that share a SNP. The QUBO covers 62 distinct SNPs against 49 and has 26% " +
    "fewer redundant pairs."),
  P("**How did you avoid data leakage and overfitting?**", { after: 20, keepNext: true }),
  P("An untouched 20% test set; all pair selection and model fitting inside five-fold cross-validation; three seeds; " +
    "Holm-corrected significance tests; a null experiment with no true interactions."),
  P("**Why did you drop the SHAP refinement loop?**", { after: 20, keepNext: true }),
  P("We built and measured it: SHAP ranking found 33% of planted pairs, the score test 73%. SHAP now explains each " +
    "person's report instead."),
  P("**What is new in this work?**", { after: 20, keepNext: true }),
  P("Testing interaction between T2D mechanisms for lean South Asians against India's own screening tool; a " +
    "constraint-preserving QAOA with error mitigation, benchmarked against classical controls; an LD imputation panel " +
    "for consumer DNA files; and an explainable end-to-end application."),

  H("8. Two-minute demo"),
  N("Run `make app` and open localhost:8501/?persona=asha_lean_high&autorun=1."),
  N("Asha, 34, BMI 21.6: QGenomix says **high risk (84th percentile)**; the IDRS says moderate; the BMI rule does not flag her."),
  N("Show the mechanism bars: insulin production 96th and fat distribution 88th percentile, both high."),
  N("Move the what-if sliders: exercise plus a smaller waist cut her risk from 23% to 6%."),
  N("Press **Download PDF report**. Backup if the laptop fails: screenshots in figures/ or `docker compose up`."),
];

const doc = new Document({
  creator: TEAM.map((t) => t[0]).join(", "), lastModifiedBy: TEAM.map((t) => t[0]).join(", "),
  title: "QGenomix: Project Summary",
  styles: {
    default: { document: { run: { font: "Calibri", size: 21 } } },
    paragraphStyles: [{ id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
      run: { font: "Cambria", size: 26, bold: true, color: "0D3D46" }, paragraph: { spacing: { before: 220, after: 100 }, outlineLevel: 0 } }],
  },
  numbering: { config: [
    { reference: "b", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 420, hanging: 260 } } } }] },
    { reference: "n", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 420, hanging: 300 } } } }] },
  ] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 900, bottom: 900, left: 964, right: 964 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "QGenomix  ·  project summary  ·  page ", size: 16, color: "8A979E" }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "8A979E" })] })] }) },
    children: body,
  }],
});
Packer.toBuffer(doc).then((b) => { fs.writeFileSync(OUT, b); console.log("wrote", OUT); });
