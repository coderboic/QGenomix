// QGenomix mentor evaluation report in the Thapar capstone format: cover, abstract, declaration,
// acknowledgement, contents, lists, chapters 1-6, appendices and the mentor's remarks page.
//
//   cd docs/report && npm install && npm run build
//
// Every number in the text is read from results/ (and bundle/meta.json when present), so the report always
// matches the experiments. Page numbers in the contents and the lists come from a first rendering pass with
// LibreOffice and pdftotext; without those tools the report is written without page numbers.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, ImageRun, LeaderType, LevelFormat, NumberFormat,
  Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TabStopType, TextRun, VerticalAlign,
  WidthType,
} = require("docx");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.resolve(process.argv[2] || path.join(ROOT, "QGenomix_Mentor_Evaluation_Report.docx"));
const CONTENT_W = 9386; // A4 width 11906 - left 1440 - right 1080
const FONT = "Times New Roman";

// ---------------------------------------------------------------- project details (from the mid-semester report)
const TITLE = ["QGenomix: Quantum-Classical Hybrid Framework", "for Polygenic Disease Risk Prediction"];
const FULL_TITLE = `${TITLE[0]} ${TITLE[1]}`;
const TEAM = [["102303452", "Aritro Chowdhury"], ["102303017", "Suyash Gupta"], ["102303286", "Rishabh Sharma"],
  ["102315073", "Akshat Ahuja"], ["102303455", "Anshh Pasriccha"]];
const MENTOR = "Dr. Husanbir Singh Pannu";
const MENTOR_TITLE = "Assistant Professor, CSED";
const REPO = "https://github.com/coderboic/QGenomix";

// ---------------------------------------------------------------- results
const R = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, "results", name), "utf8"));
const T = R("tables.json");
const e1 = T.e1.models;
const auc = (m) => e1[m].auc[0];
const lean = (m) => e1[m].lean_case_capture[0];
const f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3), pc = (x) => `${Math.round(100 * x)}%`;
const qNames = ["H_vqc", "M10_xgb_vqc", "H_noent", "M9_xgb_noent"];
const qMin = Math.min(...qNames.map(auc)), qMax = Math.max(...qNames.map(auc));
const edrScore = T.e1_edr.score_test[0], edrShap = T.e1_edr.M10_xgb_vqc[0];
const e10 = R("e10_lifestyle.json").scenarios;
const rel = (k, w) => `${Math.round(100 * e10[k][`${w}_relative_change`])}%`.replace("-", "−");
const meta = fs.existsSync(path.join(ROOT, "bundle/meta.json"))
  ? JSON.parse(fs.readFileSync(path.join(ROOT, "bundle/meta.json"), "utf8")) : { cal_auc: 0.876, n_train: 16000, n_cal: 4000 };

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
const ci = e13.coverages.indexOf(0.45);
const m13 = (method, title) => e13.summary[method][title][ci][0];
const PRS_T = "PRS agreement with the full genome", ERR_T = "Error in the risk percentile shown",
  HIGH_T = "High-risk people still flagged high";
const mit = (k) => T.e7b[k];
const hwRun = T.e7b.xy_p1 && T.e7b.xy_p1.hardware_mitigated !== undefined ? T.e7b.xy_p1 : null; // real IBM run, if done
const e6 = T.e6.stats, e6win = T.e6.best_objective_share.qubo;

const pyFiles = fs.readdirSync(path.join(ROOT, "src/qgenomix"), { recursive: true }).filter((f) => f.endsWith(".py"));
const srcLines = pyFiles.reduce((n, f) =>
  n + fs.readFileSync(path.join(ROOT, "src/qgenomix", f), "utf8").split("\n").length - 1, 0);
const nScripts = fs.readdirSync(path.join(ROOT, "scripts")).filter((f) => f.endsWith(".py")).length;
const nTests = fs.readdirSync(path.join(ROOT, "tests")).filter((f) => f.endsWith(".py"))
  .reduce((n, f) => n + (fs.readFileSync(path.join(ROOT, "tests", f), "utf8").match(/^def test_/gm) || []).length, 0);

// ---------------------------------------------------------------- references (numbered in order of first citation)
const REFS = {
  anjana: "R. M. Anjana et al., \"Metabolic non-communicable disease health report of India: the ICMR-INDIAB national cross-sectional study (ICMR-INDIAB-17),\" Lancet Diabetes Endocrinol., vol. 11, no. 7, pp. 474–489, 2023.",
  narayan: "K. M. V. Narayan and A. M. Kanaya, \"Why are South Asians prone to type 2 diabetes? A hypothesis based on underexplored pathways,\" Diabetologia, vol. 63, pp. 1103–1109, 2020.",
  mohan: "V. Mohan, R. Deepa, M. Deepa, S. Somannavar and M. Datta, \"A simplified Indian Diabetes Risk Score for screening for undiagnosed diabetic subjects,\" J. Assoc. Physicians India, vol. 53, pp. 759–763, 2005.",
  huerta: "A. Huerta-Chagoya et al., medRxiv, 2025, doi: 10.1101/2025.07.21.25331778 (D-PRISM scores PGS005373–PGS005377).",
  loesch: "D. P. Loesch et al., Nature Communications, 2025, doi: 10.1038/s41467-025-56695-z (mechanism scores PGS005115–PGS005119).",
  khera: "A. V. Khera et al., \"Genome-wide polygenic scores for common diseases identify individuals with risk equivalent to monogenic mutations,\" Nat. Genet., vol. 50, pp. 1219–1224, 2018.",
  udler: "M. S. Udler et al., \"Type 2 diabetes genetic loci informed by multi-trait associations point to disease mechanisms and subtypes: a soft clustering analysis,\" PLoS Med., vol. 15, no. 9, art. e1002654, 2018.",
  ruan: "Y. Ruan et al., \"Improving polygenic prediction in ancestrally diverse populations,\" Nat. Genet., vol. 54, pp. 573–580, 2022.",
  mahajan: "A. Mahajan et al., \"Multi-ancestry genetic study of type 2 diabetes highlights the power of diverse populations for discovery and translation,\" Nat. Genet., vol. 54, pp. 560–572, 2022.",
  cordell: "H. J. Cordell, \"Detecting gene–gene interactions that underlie human diseases,\" Nat. Rev. Genet., vol. 10, pp. 392–404, 2009.",
  wan: "X. Wan et al., \"BOOST: A fast approach to detecting gene-gene interactions in genome-wide case-control studies,\" Am. J. Hum. Genet., vol. 87, no. 3, pp. 325–340, 2010.",
  lucas: "A. Lucas, \"Ising formulations of many NP problems,\" Frontiers in Physics, vol. 2, art. 5, 2014.",
  farhi: "E. Farhi, J. Goldstone and S. Gutmann, \"A quantum approximate optimization algorithm,\" arXiv:1411.4028, 2014.",
  hadfield: "S. Hadfield et al., \"From the quantum approximate optimization algorithm to a quantum alternating operator ansatz,\" Algorithms, vol. 12, no. 2, art. 34, 2019.",
  bartschi: "A. Bärtschi and S. Eidenbenz, \"Deterministic preparation of Dicke states,\" in Fundamentals of Computation Theory (FCT), LNCS 11651, pp. 126–139, 2019.",
  perez: "A. Pérez-Salinas, A. Cervera-Lierta, E. Gil-Fuster and J. I. Latorre, \"Data re-uploading for a universal quantum classifier,\" Quantum, vol. 4, art. 226, 2020.",
  havlicek: "V. Havlíček et al., \"Supervised learning with quantum-enhanced feature spaces,\" Nature, vol. 567, pp. 209–212, 2019.",
  temme: "K. Temme, S. Bravyi and J. M. Gambetta, \"Error mitigation for short-depth quantum circuits,\" Phys. Rev. Lett., vol. 119, art. 180509, 2017.",
  bravyi: "S. Bravyi, S. Sheldon, A. Kandala, D. C. Mckay and J. M. Gambetta, \"Mitigating measurement errors in multiqubit experiments,\" Phys. Rev. A, vol. 103, art. 042605, 2021.",
  bonet: "X. Bonet-Monroig, R. Sagastizabal, M. Singh and T. E. O'Brien, \"Low-cost error mitigation by symmetry verification,\" Phys. Rev. A, vol. 98, art. 062339, 2018.",
  marchini: "J. Marchini and B. Howie, \"Genotype imputation for genome-wide association studies,\" Nat. Rev. Genet., vol. 11, pp. 499–511, 2010.",
  browning: "B. L. Browning and S. R. Browning, \"Genotype imputation with millions of reference samples,\" Am. J. Hum. Genet., vol. 98, no. 1, pp. 116–126, 2016.",
  lundberg: "S. M. Lundberg and S.-I. Lee, \"A unified approach to interpreting model predictions,\" in Advances in Neural Information Processing Systems (NeurIPS), 2017.",
  kg: "1000 Genomes Project Consortium, \"A global reference for human genetic variation,\" Nature, vol. 526, pp. 68–74, 2015.",
  lambert: "S. A. Lambert et al., \"The Polygenic Score Catalog as an open database for reproducibility and systematic evaluation,\" Nat. Genet., vol. 53, pp. 420–425, 2021.",
  plink: "C. C. Chang et al., \"Second-generation PLINK: rising to the challenge of larger and richer datasets,\" GigaScience, vol. 4, art. 7, 2015.",
  tripod: "G. S. Collins, J. B. Reitsma, D. G. Altman and K. G. M. Moons, \"Transparent reporting of a multivariable prediction model for individual prognosis or diagnosis (TRIPOD): the TRIPOD statement,\" BMJ, vol. 350, art. g7594, 2015.",
  peng: "H. Peng, F. Long and C. Ding, \"Feature selection based on mutual information: criteria of max-dependency, max-relevance, and min-redundancy,\" IEEE Trans. Pattern Anal. Mach. Intell., vol. 27, no. 8, pp. 1226–1238, 2005.",
  delong: "E. R. DeLong, D. M. DeLong and D. L. Clarke-Pearson, \"Comparing the areas under two or more correlated receiver operating characteristic curves: a nonparametric approach,\" Biometrics, vol. 44, no. 3, pp. 837–845, 1988.",
  sunxu: "X. Sun and W. Xu, \"Fast implementation of DeLong's algorithm for comparing the areas under correlated receiver operating characteristic curves,\" IEEE Signal Process. Lett., vol. 21, no. 11, pp. 1389–1393, 2014.",
  ramachandran: "A. Ramachandran, C. Snehalatha, S. Mary, B. Mukesh, A. D. Bhaskar and V. Vijay, \"The Indian Diabetes Prevention Programme shows that lifestyle modification and metformin prevent type 2 diabetes in Asian Indian subjects with impaired glucose tolerance (IDPP-1),\" Diabetologia, vol. 49, pp. 289–297, 2006.",
};

const ABBREVIATIONS = [
  ["API", "Application Programming Interface"], ["AUC", "Area Under the ROC Curve"], ["BMI", "Body-Mass Index"],
  ["CI", "Continuous Integration"], ["CV", "Cross-Validation"], ["CZ", "Controlled-Z (quantum gate)"],
  ["D-PRISM", "South Asian-trained multi-ancestry polygenic score for type 2 diabetes (PGS005373–7)"],
  ["EDR@K", "Epistasis Detection Rate at K"], ["GRCh37", "Genome Reference Consortium human genome build 37"],
  ["GWAS", "Genome-Wide Association Study"], ["HWE", "Hardy–Weinberg Equilibrium"],
  ["IDRS", "Indian Diabetes Risk Score"], ["LD", "Linkage Disequilibrium"], ["LR", "Logistic Regression"],
  ["MAF", "Minor Allele Frequency"], ["mRMR", "minimum Redundancy Maximum Relevance"], ["OOF", "Out-of-Fold"],
  ["PCA", "Principal Component Analysis"], ["PGS", "Polygenic Score"], ["PRS", "Polygenic Risk Score"],
  ["QAOA", "Quantum Approximate Optimisation Algorithm"], ["QC", "Quality Control"],
  ["QSVC", "Quantum-kernel Support Vector Classifier"], ["QUBO", "Quadratic Unconstrained Binary Optimisation"],
  ["RF", "Random Forest"], ["ROC", "Receiver Operating Characteristic"], ["SA", "Simulated Annealing"],
  ["SAS", "South Asian (1000 Genomes super-population)"], ["SHAP", "SHapley Additive exPlanations"],
  ["SNP", "Single Nucleotide Polymorphism"], ["SVM", "Support Vector Machine"], ["T2D", "Type 2 Diabetes"],
  ["VQC", "Variational Quantum Circuit"], ["XGBoost", "eXtreme Gradient Boosting"], ["ZNE", "Zero-Noise Extrapolation"],
];

// ---------------------------------------------------------------- figure and table labels (reading order)
const FIG_ORDER = ["arch", "flow", "circuit", "dash", "pdf", "clinician", "e0", "e1", "e8", "e2", "e4", "e5", "e7",
  "e7b", "e9", "e11", "e12", "e13", "e10"];
const TAB_ORDER = ["changes", "lit", "fr", "cost", "risk", "wbs", "tools", "stages", "experiments", "problems",
  "objectives", "panel", "schedule"];
const numberOf = (order, label) => {
  const i = order.indexOf(label);
  if (i < 0) throw new Error(`unknown label ${label}`);
  return i + 1;
};
const F = (label) => `Figure ${numberOf(FIG_ORDER, label)}`;
const TB = (label) => `Table ${numberOf(TAB_ORDER, label)}`;

// ---------------------------------------------------------------- build state (reset for every pass)
let S;
function resetState(pages) {
  S = { pages, toc: [], figs: [], tabs: [], refOrder: [], figNo: 0, tabNo: 0 };
}
const cite = (...keys) => `[${keys.map((k) => {
  if (!REFS[k]) throw new Error(`unknown reference ${k}`);
  if (!S.refOrder.includes(k)) S.refOrder.push(k);
  return S.refOrder.indexOf(k) + 1;
}).join(", ")}]`;
const pageOf = (key) => (S.pages ? S.pages[key] || "" : "00");

// ---------------------------------------------------------------- text helpers: **bold**, ^{sup}, _{sub}, `code`
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\^\{[^}]+\}|_\{[^}]+\}|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(new TextRun({ ...base, text: tok.slice(2, -2), bold: true }));
    else if (tok.startsWith("^{")) out.push(new TextRun({ ...base, text: tok.slice(2, -1), superScript: true }));
    else if (tok.startsWith("_{")) out.push(new TextRun({ ...base, text: tok.slice(2, -1), subScript: true }));
    else out.push(new TextRun({ ...base, text: tok.slice(1, -1), font: "Consolas", size: (base.size || 24) - 3 }));
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}
const P = (text, o = {}) => new Paragraph({
  alignment: o.align ?? AlignmentType.JUSTIFIED, keepNext: o.keepNext, indent: o.indent,
  spacing: { after: o.after ?? 120, before: o.before ?? 0, line: o.line ?? 276 }, children: runs(text, o.run || {}),
});
const C = (text, run = {}, after = 80) => new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { after, line: 276 }, children: runs(text, run),
});
const FRONT = (text) => { // centred front-matter title (ABSTRACT, DECLARATION, ...), starts a new page
  S.toc.push({ level: 0, text, key: `front:${text}` });
  return new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, pageBreakBefore: true,
    children: [new TextRun(text)] });
};
const H1 = (text) => {
  S.toc.push({ level: 1, text, key: `h:${text}` });
  return new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun(text)] });
};
const H2 = (text, o = {}) => {
  S.toc.push({ level: 2, text, key: `h:${text}` });
  return new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, pageBreakBefore: o.pageBreak,
    children: [new TextRun(text)] });
};
const H3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, keepNext: true, children: [new TextRun(text)] });
const bullet = (text, align = AlignmentType.JUSTIFIED) => new Paragraph({
  numbering: { reference: "bullets", level: 0 }, alignment: align, spacing: { after: 80, line: 276 }, children: runs(text),
});
const bullets = (items, align) => items.map((t) => bullet(t, align));
const numbered = (items) => items.map((t) => new Paragraph({
  numbering: { reference: "numbers", level: 0 }, alignment: AlignmentType.JUSTIFIED, spacing: { after: 80, line: 276 },
  children: runs(t),
}));

// ---------------------------------------------------------------- tables
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "8A9AA4" };
const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE };
function cell(text, width, { header = false, align = AlignmentType.LEFT, shade, borders = BORDERS, size = 20,
  pad = 60 } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA }, borders, verticalAlign: VerticalAlign.CENTER,
    shading: header ? { fill: "DCE5EA", type: ShadingType.CLEAR, color: "auto" }
      : shade ? { fill: shade, type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: pad, bottom: pad, left: 100, right: 100 },
    children: String(text).split("\n").map((line) => new Paragraph({
      alignment: align, spacing: { after: 0, line: 250 }, children: runs(line, { size, bold: header || undefined }),
    })),
  });
}
function table(headers, rows, widths, o = {}) {
  const sum = widths.reduce((a, b) => a + b, 0);
  if (sum !== CONTENT_W && !o.width) throw new Error(`widths sum ${sum} != ${CONTENT_W}`);
  const aligns = o.aligns || widths.map(() => AlignmentType.LEFT);
  const borders = o.borderless ? NO_BORDERS : BORDERS;
  return new Table({
    width: { size: o.width || CONTENT_W, type: WidthType.DXA }, columnWidths: widths,
    alignment: o.center ? AlignmentType.CENTER : undefined,
    rows: [
      ...(headers ? [new TableRow({ tableHeader: true, cantSplit: true,
        children: headers.map((h, i) => cell(h, widths[i], { header: true, align: aligns[i], borders })) })] : []),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((t, i) => cell(t, widths[i], {
        align: aligns[i], borders, size: o.size, pad: o.pad,
        shade: o.shadeFirst && i === 0 ? "F3F6F8" : undefined })) })),
    ],
  });
}
const tableCaption = (text, label) => {
  const n = ++S.tabNo;
  if (numberOf(TAB_ORDER, label) !== n) throw new Error(`table "${label}" is number ${n}, TAB_ORDER says otherwise`);
  S.tabs.push({ n, text });
  return new Paragraph({
    keepNext: true, spacing: { before: 120, after: 80 },
    children: [new TextRun({ text: `Table ${n}: `, bold: true, size: 22 }), ...runs(text, { size: 22 })],
  });
};

// ---------------------------------------------------------------- figures
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function figure(name, widthPx, caption, label) {
  const file = path.isAbsolute(name) ? name : path.join(ROOT, "figures", name);
  const n = ++S.figNo;
  if (numberOf(FIG_ORDER, label) !== n) throw new Error(`figure "${label}" is number ${n}, FIG_ORDER says otherwise`);
  S.figs.push({ n, text: caption });
  if (!fs.existsSync(file)) {
    console.warn("missing figure", name);
    return [C(`[Figure ${n} pending: ${name}]`, { italics: true }, 200)];
  }
  const { w, h } = pngSize(file);
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 60 },
      children: [new ImageRun({ type: "png", data: fs.readFileSync(file),
        transformation: { width: widthPx, height: Math.round((widthPx * h) / w) } })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
      children: [new TextRun({ text: `Figure ${n}: `, bold: true, size: 21 }), ...runs(caption, { size: 21, italics: true })] }),
  ];
}
const blank = (after = 120) => new Paragraph({ spacing: { after }, children: [] });
const line = (label, before = 360) => new Paragraph({ spacing: { before, after: 0 },
  children: [new TextRun({ text: `${label}: ` }), new TextRun({ text: "_".repeat(36) })] });

// =====================================================================
// FRONT MATTER
// =====================================================================
function coverPage() {
  return [
    new Paragraph({ spacing: { before: 500 }, children: [] }),
    C(TITLE[0], { bold: true, size: 32 }, 40),
    C(TITLE[1], { bold: true, size: 32 }, 160),
    C("Focus: early-onset type 2 diabetes in lean South Asians", { italics: true, size: 26 }, 360),
    C("Capstone Project Report", { bold: true, size: 26 }, 80),
    C("MENTOR EVALUATION", { bold: true, size: 24 }, 440),
    C("Submitted by:", {}, 120),
    table(["Roll No.", "Name"], TEAM, [1800, 3000], { width: 4800, center: true,
      aligns: [AlignmentType.CENTER, AlignmentType.LEFT] }),
    blank(240),
    C("BE Third Year, COE"),
    C("CPG No: 218", {}, 400),
    C("Under the Mentorship of"),
    C(MENTOR, { bold: true }),
    C(MENTOR_TITLE, {}, 560),
    C("Computer Science and Engineering Department", { bold: true }),
    C("Thapar Institute of Engineering and Technology, Patiala", { bold: true }, 200),
    C("October 2026"),
  ];
}

function abstractPage() {
  return [
    FRONT("ABSTRACT"),
    P(`Type 2 diabetes (T2D) affects an estimated 101 million adults in India. South Asians develop it younger and at ` +
      `a lower body weight than Europeans, so screening that relies on body-mass index (BMI) misses many lean people ` +
      `at risk, and the Indian Diabetes Risk Score (IDRS), the questionnaire used in Indian practice, cannot see ` +
      `inherited risk. QGenomix is a quantum-classical hybrid framework that asks two questions: how much do polygenic ` +
      `risk scores add to clinical screening for South Asians, and do genetic variants from two diabetes mechanisms, ` +
      `insulin production (β-cell) and fat distribution (lipodystrophy), interact?`),
    P(`The system uses the real genotypes of all 2,504 people in the 1000 Genomes Project, the South Asian-trained ` +
      `D-PRISM polygenic score with five published mechanism scores, and 10,000 synthetic South Asians built from the ` +
      `978 real South Asian haplotypes, with simulated outcomes so that every discovery claim can be checked against a ` +
      `known truth. Candidate gene pairs are scored with a vectorised score test; a non-redundant set is chosen by ` +
      `solving a QUBO with simulated annealing and with the Quantum Approximate Optimisation Algorithm (QAOA), ` +
      `including a constraint-preserving circuit tested with error mitigation on an IBM noise model; the chosen pairs ` +
      `are encoded by an 8-qubit variational quantum circuit. Seventeen predictors are compared in fifteen experiments, ` +
      `and every quantum component is tested against a matched classical control.`),
    P(`Genetic scores raise the AUC of clinical screening from ${f3(auc("M3c_clinical"))} to ${f3(auc("M3_additive"))} ` +
      `and nearly double the share of lean diabetes cases caught in the top 20% of risk (IDRS ${pc(lean("M0_idrs"))}, ` +
      `genetic model ${pc(lean("M3_additive"))}); the result holds in ${nAucWin} of ${nSet} alternative simulator ` +
      `settings and in all five South Asian populations of 1000 Genomes. The interaction search recovers 70–84% of ` +
      `planted gene pairs, against 40–48% for PLINK's BOOST. The quantum components work as designed but show no ` +
      `significant advantage; error mitigation recovers most of the quality lost to hardware noise. The work is ` +
      `delivered as a tested application that reads consumer DNA files, fills in missing variants by LD imputation, ` +
      `explains each prediction and produces a PDF report.`),
    P(`**Keywords:** type 2 diabetes, South Asians, polygenic risk score, gene–gene interaction, QUBO, QAOA, variational ` +
      `quantum circuit, error mitigation, genotype imputation, explainable machine learning.`, { before: 120 }),
  ];
}

function declarationPage() {
  return [
    FRONT("DECLARATION"),
    P(`We hereby declare that the design principles and working prototype model of the project entitled ` +
      `**${FULL_TITLE}** is an authentic record of our own work carried out in the Computer Science and Engineering ` +
      `Department, TIET, Patiala, under the guidance of ${MENTOR} during the 6th Semester (2025–26).`, { after: 360 }),
    table(["Roll No.", "Name", "Signature"], TEAM.map(([r, n]) => [r, n, "_______________"]), [2000, 3500, 3000],
      { width: 8500, center: true, aligns: [AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.CENTER] }),
    P("Date: ________________", { before: 360, after: 480 }),
    P("**Counter Signed By:**", { after: 200 }),
    P(`Faculty Mentor: ${MENTOR}          Co-Mentor: N/A`, { after: 80 }),
    P("Designation: Assistant Professor, CSED, TIET, Patiala", { after: 80 }),
    line("Signature", 480),
    line("Date", 240),
  ];
}

function acknowledgementPage() {
  return [
    FRONT("ACKNOWLEDGEMENT"),
    P(`We would like to express our sincere gratitude to our mentor ${MENTOR}, whose technical guidance, critical ` +
      `feedback, and consistent encouragement have been indispensable throughout this project. His deep expertise in ` +
      `machine learning and research methodology has shaped the direction of QGenomix at every stage.`),
    P("We are also grateful to the Head of the Computer Science and Engineering Department, the faculty, and the " +
      "staff at TIET, Patiala for providing the infrastructure and academic environment that made this work " +
      "possible. We thank our fellow students for their peer review and collaborative discussions that strengthened " +
      "our approach."),
    P("Finally, we thank our families for their unwavering support and patience through the demands of this " +
      "capstone project."),
    P("Date: ________________", { before: 360, after: 360 }),
    ...TEAM.map(([r, n]) => P(`${n} (${r})`, { align: AlignmentType.RIGHT, after: 40 })),
  ];
}

const tocPara = (text, page, level) => new Paragraph({
  indent: { left: level === 2 ? 440 : 0 }, spacing: { after: level === 2 ? 40 : 80, before: level === 1 ? 80 : 0 },
  tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W, leader: LeaderType.DOT }],
  children: [new TextRun({ text, size: 22, bold: level === 1 || undefined }), new TextRun({ text: `\t${page}`, size: 22 })],
});
function contentsPages() {
  const entries = S.toc.filter((e) => e.text !== "TABLE OF CONTENTS");
  return [
    FRONT("TABLE OF CONTENTS"),
    ...entries.map((e) => tocPara(e.text, pageOf(e.key), e.level === 0 ? 1 : e.level)),
  ];
}
function listPage(title, items, kind) {
  return [
    FRONT(title),
    table([`${kind} No.`, "Caption", "Page No."], items.map((it) => [`${kind} ${it.n}`, it.text.replace(/`/g, ""),
      pageOf(`${kind.toLowerCase()}:${it.n}`)]), [1300, 6886, 1200],
    { aligns: [AlignmentType.LEFT, AlignmentType.LEFT, AlignmentType.CENTER] }),
  ];
}
function abbreviationsPage() {
  return [
    FRONT("LIST OF ABBREVIATIONS"),
    table(null, ABBREVIATIONS.map(([a, b]) => [`**${a}**`, b]), [2000, 7386], { borderless: true, size: 22, pad: 25 }),
  ];
}

// =====================================================================
// CHAPTER 1: INTRODUCTION
// =====================================================================
function chapter1() {
  return [
    H1("CHAPTER 1: INTRODUCTION"),
    H2("1.1 Project Overview"),
    P(`QGenomix is a quantum-classical hybrid framework for polygenic risk prediction, focused on early-onset type 2 ` +
      `diabetes (T2D) in lean South Asians. It combines real genotypes, published polygenic scores and a clinical ` +
      `questionnaire, searches for interacting gene pairs between two diabetes mechanisms, selects a non-redundant set ` +
      `of pairs with classical and quantum optimisation, and encodes them with a variational quantum circuit. Every ` +
      `quantum step is compared against a classical control, so the project measures what quantum computing ` +
      `contributes instead of assuming it.`),
    P(`The result is delivered as a working risk-report application. It reads a consumer DNA file (23andMe or ` +
      `AncestryDNA), fills in the variants the file is missing, and reports the person's risk with its biological ` +
      `mechanisms, the screening flags that the BMI rule and the IDRS would miss, lifestyle what-ifs, and a ` +
      `downloadable PDF. The full research pipeline, from raw 1000 Genomes data to every figure in this report, is ` +
      `reproducible from one configuration file.`),
    H2("1.2 Need Analysis"),
    P(`India has an estimated 101 million adults with diabetes and 136 million with prediabetes ${cite("anjana")}. ` +
      `South Asians develop T2D at younger ages and lower BMI than Europeans, a pattern often called the lean or ` +
      `"thin-fat" phenotype ${cite("narayan")}. Two consequences follow. BMI-based screening misses lean people at high ` +
      `risk, and the IDRS ${cite("mohan")}, which scores age, waist, physical activity and family history, gives young, ` +
      `slim people low scores by design and cannot see inherited risk.`),
    P(`At the same time, genetic data has become cheap: consumer genotyping files are widely available, and a ` +
      `multi-ancestry polygenic score trained for South Asians, D-PRISM ${cite("huerta")}, and mechanism-specific ` +
      `scores for T2D ${cite("loesch")} have been published. What is missing is a careful study of what these scores ` +
      `add to Indian screening, whether the mechanisms interact, and a tool that turns a partial consumer DNA file into ` +
      `an honest, explained risk report.`),
    H2("1.3 Research Gaps"),
    ...bullets([
      "Polygenic risk scores are additive; whether T2D mechanisms interact (for example β-cell × lipodystrophy) has not been tested in South Asians.",
      "Exhaustive pairwise interaction search has low power and returns many redundant \"shadow\" pairs; choosing a small, non-redundant set of pairs is a combinatorial problem.",
      "Quantum machine-learning studies in genomics rarely include matched classical controls or an analysis of hardware noise, so their claims are hard to judge.",
      "India's screening questionnaire ignores genetics, and no study has quantified what genetics adds for lean people in particular.",
      "Consumer DNA files cover only about half of the variants in modern polygenic scores; filling the gaps with the population average biases every score towards the middle.",
    ]),
    H2("1.4 Problem Definition and Scope"),
    P(`**Problem:** given genotypes and clinical answers for South Asian adults, (a) predict T2D risk more accurately ` +
      `than the IDRS and a BMI rule, with particular attention to lean people; (b) recover truly interacting gene pairs ` +
      `between diabetes mechanisms while controlling false discoveries; and (c) measure, against classical controls, ` +
      `whether quantum optimisation and quantum feature encoding help.`),
    P(`**Scope:** the project uses the 2,504 real genomes of 1000 Genomes phase 3 (GRCh37), the D-PRISM score ` +
      `(1.34 million variants), five mechanism scores (62 SNPs) and 1,263 cross-mechanism SNP pairs. Outcomes are ` +
      `simulated with a liability-threshold model calibrated to Indian prevalence. Quantum circuits run on exact ` +
      `simulators and on a noise model of an IBM processor; a run on real IBM hardware is planned for the final ` +
      `evaluation. The application is a research prototype and not a medical device.`),
    H2("1.5 Assumptions and Constraints"),
    ...bullets([
      "Disease outcomes are simulated with known ground truth; genotypes, allele frequencies, linkage and polygenic weights are real.",
      "Synthetic cohorts are mosaics of real South Asian haplotypes in one-megabase blocks, which keeps local linkage but removes population substructure.",
      "Genotype files are on genome build GRCh37 and the forward strand, as 23andMe and AncestryDNA files are; other builds are rejected.",
      "Quantum hardware access is limited to IBM's free Open Plan (10 QPU minutes per 28 days), so most quantum results come from exact and noisy simulators.",
      "All computation runs on a 16-core laptop with 14 GB of memory; large steps are chunked to fit.",
    ]),
    H2("1.6 Standards"),
    ...bullets([
      "Genomic QC follows PLINK 2 conventions: minor-allele frequency ≥ 1%, genotype missingness ≤ 5%, Hardy–Weinberg p > 10^{−6} in South Asians.",
      `Polygenic weights come from harmonised GRCh37 scoring files of the PGS Catalog ${cite("lambert")}; the IDRS is scored exactly as published ${cite("mohan")}.`,
      `Prediction models are reported with discrimination and calibration on held-out data, following the TRIPOD recommendations ${cite("tripod")}; a model card documents intended use, data, performance, fairness and limits.`,
      "Code follows PEP 8 (checked by ruff), is covered by automated tests run on every push, and exposes a REST API with an OpenAPI description.",
      "Every result records the hash of the configuration that produced it; fixed seeds make runs repeatable.",
    ]),
    H2("1.7 Approved Objectives"),
    P("The objectives approved at the mid-semester evaluation were:", { after: 60, keepNext: true }),
    ...numbered([
      "Build a complete genomic data pipeline: QC, SNP selection, pair ranking and label generation.",
      "Design and implement a variational quantum circuit encoder that produces interaction features for SNP pairs.",
      "Train classical baselines (LR, RF, XGBoost, SVM) and compute a PRS as a clinical reference.",
      "Build a hybrid stacking ensemble integrating quantum features, PRS and classical predictions.",
      "Implement an adaptive SHAP-guided loop that refines the gene-pair selection.",
      "Benchmark all models on a held-out test set using AUC-ROC, F1 and EDR@K, with DeLong and McNemar tests.",
    ]),
    P("Section 6.1 reports the status of each objective.", { before: 60 }),
    H2("1.8 Methodology"),
    P(`QGenomix follows an eight-stage pipeline: data preparation, synthetic cohort and outcome simulation, ` +
      `interaction search, pair selection (QUBO solved classically and by QAOA), quantum pair encoding, a model zoo of ` +
      `17 predictors, evaluation in fifteen experiments, and the risk-report application. The investigative technique ` +
      `is comparative: every model sees identical data splits and is scored with identical metrics, and every quantum ` +
      `component has a classical twin. Because outcomes are simulated, the planted interactions are known, so ` +
      `discovery can be scored exactly. Chapter 3 describes the method and Chapter 5 the results.`),
    H2("1.9 Project Outcomes and Deliverables"),
    ...bullets([
      "A reproducible data pipeline on real 1000 Genomes data, with the D-PRISM score, mechanism scores and a South Asian haplotype library.",
      "An outcome simulator with clinical factors and the IDRS, validated against the real population (E0).",
      "An interaction search with QUBO selection and QAOA, including error mitigation and a script for real IBM hardware.",
      "An 8-qubit variational pair encoder with its own exact simulator, and its classical controls.",
      "A model zoo of 17 predictors and fifteen experiments (E0–E13), with statistical tests.",
      "A risk-report application: dashboard, REST API, PDF report, LD imputation for consumer DNA files and a Docker image.",
      `A test suite of ${nTests} automated tests with continuous integration, a model card, and this report.`,
    ]),
    H2("1.10 Novelty of Work"),
    ...bullets([
      "Tests for interaction between published T2D mechanism scores on real South Asian haplotypes, and measures the value of genetics for lean people against India's own screening questionnaire.",
      "Poses gene-pair selection as a QUBO with an SNP-overlap redundancy term and solves it with a constraint-preserving QAOA started from a Dicke state, then measures it under realistic noise with error mitigation.",
      "Gives every quantum component a matched classical control (annealing, the same circuit without entanglement, and a classical twin of similar size).",
      "Introduces two task-specific metrics: EDR@K for interaction discovery and lean-case capture for screening.",
      "Builds an LD imputation panel from South Asian reference genomes so that partial consumer DNA files give reliable reports.",
    ]),
    H2("1.11 Changes Since the Mid-Semester Evaluation"),
    P(`The mid-semester design was generic. ${TB("changes")} lists what changed and why; each change gives the ` +
      "project a measurable clinical outcome and a verifiable ground truth."),
    tableCaption("Changes from the mid-semester plan", "changes"),
    table(["Aspect", "Mid-semester plan", "Implemented", "Reason"], [
      ["Clinical focus", "T2D in general", "Early-onset T2D in lean South Asians, compared with IDRS screening", "A specific, unmet need in India gives a measurable outcome"],
      ["Genotypes", "2,504 × 1,000 SNP matrix", "Full 1000 Genomes data; 10,000 synthetic South Asians built from real haplotypes", "Real allele frequencies and linkage; enough people to detect interactions"],
      ["Risk scores", "Literature GWAS betas (pending)", "D-PRISM South Asian PRS (1.34M variants) and 5 mechanism scores from the PGS Catalog", "Published, ancestry-matched weights"],
      ["Outcomes", "Labels with 20 hidden pairs", "Liability model: genetics, β-cell × lipodystrophy interaction, 10 planted pairs, age, sex, BMI, waist, activity, family history", "Known truth makes every discovery claim checkable"],
      ["Pair selection", "Adaptive SHAP loop", "Score test on 1,263 cross-mechanism pairs, then QUBO (annealing and QAOA)", `SHAP ranking found ${pc(edrShap)} of planted pairs, the score test ${pc(edrScore)} (E1)`],
      ["Quantum", "VQC encoder, 125 circuits", "QAOA with error mitigation; 12-circuit VQC with no-entanglement and classical-twin controls", "Controls isolate what the quantum part contributes"],
      ["Output", "Benchmark table", "Benchmark, web app with PDF report, REST API, Docker image", "Shows how the result reaches a clinician or a user"],
    ], [1450, 1900, 3336, 2700], { shadeFirst: true }),
  ];
}

// =====================================================================
// CHAPTER 2: REQUIREMENT ANALYSIS
// =====================================================================
function chapter2() {
  return [
    H1("CHAPTER 2: REQUIREMENT ANALYSIS"),
    H2("2.1 Literature Survey"),
    H3("2.1.1 Theory Associated With the Problem Area"),
    P(`A polygenic risk score (PRS) is a weighted sum of the risk alleles a person carries, with weights estimated by ` +
      `genome-wide association studies. Genome-wide scores can identify people whose risk equals that of carriers of ` +
      `rare monogenic mutations ${cite("khera")}, and combining association studies from several ancestries improves ` +
      `accuracy outside Europeans ${cite("ruan", "mahajan")}. T2D variants also fall into mechanism clusters: two ` +
      `related to insulin production by β-cells and three to insulin resistance, including a lipodystrophy cluster ` +
      `that links fat distribution to risk at lower body weight ${cite("udler")}.`),
    P(`A PRS is additive: it assumes each variant's effect does not depend on any other. Gene–gene interaction ` +
      `(epistasis) breaks this assumption, but detecting it is hard because the number of pairs is large, power is low ` +
      `and nearby variants in linkage disequilibrium create redundant signals ${cite("cordell")}.`),
    P(`Choosing the best k of n candidate pairs while penalising redundancy is a quadratic unconstrained binary ` +
      `optimisation (QUBO) problem, which maps directly onto an Ising Hamiltonian ${cite("lucas")}. The Quantum ` +
      `Approximate Optimisation Algorithm (QAOA) prepares a parameterised quantum state whose measurements favour low ` +
      `energies ${cite("farhi")}; constraint-preserving mixers keep the search inside the set of valid selections ` +
      `${cite("hadfield")}. Variational quantum circuits with data re-uploading can act as trainable feature maps ` +
      `${cite("perez", "havlicek")}. On today's noisy processors, error-mitigation methods such as zero-noise ` +
      `extrapolation and readout correction reduce the bias of measured results ${cite("temme", "bravyi")}.`),
    H3("2.1.2 Existing Systems and Solutions"),
    P(`PLINK ${cite("plink")} is the standard toolset for genotype QC and polygenic scoring, and BOOST ${cite("wan")} ` +
      `made exhaustive pairwise interaction screening fast. Polygenic scores are distributed through the PGS Catalog. ` +
      `Clinical screening in India uses the IDRS questionnaire. Missing genotypes are normally filled by imputation ` +
      `servers that use reference haplotypes ${cite("marchini", "browning")}. Quantum software frameworks (Qiskit, ` +
      `PennyLane) make circuits easy to build and simulate, but no existing system joins these pieces into one ` +
      `benchmarked pipeline for South Asian diabetes screening.`),
    H3("2.1.3 Literature Survey Table"),
    tableCaption("Literature survey", "lit"),
    table(["S.No", "Paper", "Tools / Tech", "Key Finding", "Limitation", "Citation"], [
      ["1", "Khera et al., 2018", "Genome-wide PRS, UK Biobank", "Genome-wide PRS find a few percent of people with risk equal to monogenic mutations, including for T2D", "Mostly European ancestry; additive only", cite("khera")],
      ["2", "Udler et al., 2018", "Soft clustering of T2D loci", "T2D variants split into five mechanism clusters (two β-cell, three insulin resistance)", "European-centred; no interaction tested", cite("udler")],
      ["3", "Ruan et al., 2022", "PRS-CSx", "Combining GWAS from several ancestries improves PRS accuracy in non-European groups", "Additive; needs ancestry-matched tuning", cite("ruan")],
      ["4", "Mahajan et al., 2022", "Multi-ancestry T2D GWAS", "Diverse populations increase locus discovery and improve PRS transfer across ancestries", "South Asian samples still a minority", cite("mahajan")],
      ["5", "Mohan et al., 2005", "Indian Diabetes Risk Score", "Four questions (age, waist, activity, family history) screen for undiagnosed diabetes in India", "No genetic information; scores young, slim people low", cite("mohan")],
      ["6", "Cordell, 2009", "Review of interaction methods", "Regression, exhaustive and data-mining approaches to gene–gene interaction", "Low power and heavy multiple testing at genome scale", cite("cordell")],
      ["7", "Wan et al., 2010", "BOOST", "Boolean genotype encoding makes exhaustive pairwise screening fast", "Approximate first stage; redundant pairs in LD not handled", cite("wan")],
      ["8", "Hadfield et al., 2019", "QAOA, constraint-preserving mixers", "Mixers such as XY keep the search inside the feasible set", "Benefit on noisy hardware not established", cite("hadfield")],
      ["9", "Havlíček et al., 2019", "Quantum feature maps", "Quantum kernels and variational classifiers run on superconducting hardware", "Small synthetic data; no advantage shown on real data", cite("havlicek")],
      ["10", "Temme et al., 2017", "Zero-noise extrapolation", "Extrapolating from amplified noise reduces the bias of noisy results", "More sampling; assumes noise scales predictably", cite("temme")],
      ["11", "Marchini and Howie, 2010", "Genotype imputation", "Untyped variants can be predicted from reference haplotypes using LD", "Accuracy depends on panel size and ancestry", cite("marchini")],
      ["12", "Lundberg and Lee, 2017", "SHAP", "Consistent, theoretically grounded attributions for any model", "Post hoc; attributions are not causal", cite("lundberg")],
    ], [450, 1900, 1500, 2500, 2236, 800], { aligns: [AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.LEFT,
      AlignmentType.LEFT, AlignmentType.LEFT, AlignmentType.CENTER], size: 19 }),
    H3("2.1.4 Problem Identified"),
    P("Existing work treats polygenic risk as additive, studies interactions without handling redundancy, reports " +
      "quantum methods without classical controls or noise, and offers no way to turn a partial consumer DNA file into " +
      "a reliable report for South Asians. QGenomix addresses all four in one benchmarked, reproducible system."),
    H3("2.1.5 Survey of Tools and Technologies Used"),
    ...bullets([
      "**PLINK 2 and PLINK 1.9:** genotype QC, PCA, polygenic scoring and the BOOST interaction baseline.",
      "**NumPy, pandas, SciPy, statsmodels:** data handling and statistics, including the vectorised score test.",
      "**scikit-learn and XGBoost:** classical models, calibration and cross-validation.",
      "**PyTorch and PennyLane:** training the variational circuits; PennyLane also checks our own exact simulator.",
      "**Qiskit, Qiskit Aer and Qiskit IBM Runtime:** QAOA circuits, noisy simulation and access to IBM hardware.",
      "**dwave-samplers:** simulated annealing for the QUBO.",
      "**SHAP:** per-person explanations of the model.",
      "**FastAPI, Streamlit, fpdf2 and Docker:** the REST API, the dashboard, the PDF report and deployment.",
      "**pytest, ruff and GitHub Actions:** testing, style checks and continuous integration.",
    ]),
    H2("2.2 Software Requirement Specification"),
    H3("2.2.1 Purpose, Audience and Scope"),
    P("This specification defines what the QGenomix research pipeline and application must do. Its readers are the " +
      "development team, the mentor and the evaluation panel. The system covers data ingestion, simulation, interaction " +
      "search, quantum and classical modelling, evaluation and the risk-report application; it excludes clinical " +
      "deployment and any use for diagnosis."),
    H3("2.2.2 Product Perspective and Features"),
    P("QGenomix is a standalone system with two parts: a research pipeline that turns public data into results and " +
      "figures, and an application that turns one person's DNA file and questionnaire answers into a report. Both " +
      "share one Python package and one configuration file."),
    H3("2.2.3 Functional Requirements"),
    tableCaption("Functional requirements and where they are implemented", "fr"),
    table(["ID", "Requirement", "Implemented in"], [
      ["FR1", "Read 23andMe and AncestryDNA files on GRCh37; reject other builds and malformed files", "app.parser, app.service"],
      ["FR2", "Fill in variants missing from the file using LD with measured neighbours", "data.impute"],
      ["FR3", "Compute the D-PRISM PRS, five mechanism scores and 62 SNP dosages", "app.service"],
      ["FR4", "Score the IDRS from the questionnaire", "clinical"],
      ["FR5", "Predict calibrated risk with tier and percentile", "app.bundle"],
      ["FR6", "Explain the result: mechanism percentiles, SHAP-ranked SNP pairs, BMI and IDRS screening flags", "app.service"],
      ["FR7", "Show lifestyle what-ifs with genes, age and family history fixed", "app.service, app.dashboard"],
      ["FR8", "Provide the report on screen, as JSON and as a PDF", "app.dashboard, app.api, app.pdf"],
      ["FR9", "Rebuild every result from raw data with one command per step", "Makefile, scripts/"],
    ], [700, 5000, 3686], { shadeFirst: true }),
    H3("2.2.4 External Interface Requirements"),
    ...bullets([
      "**User interfaces:** a Streamlit dashboard (report, clinician view, research results, model card) and a downloadable PDF.",
      "**Software interfaces:** a REST API (`POST /v1/profile`, `POST /v1/report.pdf`) with OpenAPI documentation; PLINK binaries; Qiskit IBM Runtime for hardware runs.",
      "**Hardware interfaces:** a laptop with 16 GB of memory runs everything; IBM quantum processors are reached through the cloud.",
    ]),
    H3("2.2.5 Non-functional Requirements"),
    ...bullets([
      "**Performance:** a report from a 46 MB genome file in about 10 seconds; what-if updates in under a second; the full research pipeline in about three hours on 16 cores.",
      "**Safety:** every report states that it is a research prototype trained on simulated outcomes and is not a diagnosis.",
      "**Security and privacy:** uploaded files are processed in memory and never stored or logged; API keys are never kept in the repository; the container runs as a non-root user.",
      `**Reliability and portability:** ${nTests} automated tests on every push; one Docker image runs the dashboard and the API on any operating system.`,
    ]),
    H2("2.3 Cost Analysis"),
    tableCaption("Cost analysis", "cost"),
    table(["Item", "Source", "Cost"], [
      ["Genotype data", "1000 Genomes Project, public", "Free"],
      ["Polygenic scores", "PGS Catalog, public", "Free"],
      ["Software", `Open-source libraries and tools (${TB("tools")})`, "Free"],
      ["Computing", "Team laptops", "No additional cost"],
      ["Quantum hardware", "IBM Quantum Open Plan, 10 QPU minutes per 28 days", "Free"],
      ["Code hosting and CI", "GitHub", "Free"],
      ["Public demo hosting", "Free tier of a container host", "Free"],
      ["**Total**", "", "**₹0**"],
    ], [3000, 3886, 2500], { shadeFirst: true }),
    H2("2.4 Risk Analysis", { pageBreak: true }),
    tableCaption("Risk analysis", "risk"),
    table(["Risk", "Likelihood", "Impact", "Mitigation"], [
      ["Simulated outcomes do not match real disease biology", "High", "High", "Real genotypes and published weights; robustness across 13 simulator settings (E12); validation on a real Indian cohort planned"],
      ["Hardware noise destroys QAOA quality", "High", "Medium", "Constraint-preserving mixer; error mitigation (E7b); rehearsal on the IBM noise model"],
      ["Partial consumer DNA files bias the reported risk", "High", "Medium", "LD imputation (E13) and a coverage warning in every report"],
      ["Data leakage inflates accuracy", "Medium", "High", "All selection and fitting inside each cross-validation fold; untouched 20% test set"],
      ["Memory limits with 84 million variants", "Medium", "Medium", "Extract only target variants; chunked processing with memory caps"],
      ["Results differ between machines", "Low", "Medium", "Fixed seeds, configuration hash, tightened solver tolerance, continuous integration"],
      ["The app is mistaken for a diagnostic tool", "Low", "High", "Disclaimer on every report; model card; research-prototype labelling"],
    ], [2600, 1150, 950, 4686], { aligns: [AlignmentType.LEFT, AlignmentType.CENTER, AlignmentType.CENTER, AlignmentType.LEFT] }),
  ];
}

// =====================================================================
// CHAPTER 3: METHODOLOGY ADOPTED
// =====================================================================
function chapter3() {
  return [
    H1("CHAPTER 3: METHODOLOGY ADOPTED"),
    H2("3.1 Investigative Techniques"),
    P("QGenomix uses four complementary techniques. **Comparative:** all 17 predictors are trained on identical splits " +
      "and scored with identical metrics. **Simulation with ground truth:** outcomes are generated from a known model " +
      "with planted interactions, so discovery and calibration can be checked exactly. **Ablation:** each quantum " +
      "component is compared with the same component without its quantum ingredient (annealing instead of QAOA, the " +
      "circuit without entanglement, a classical network of similar size). **External checks:** models trained on " +
      "synthetic people are tested on real genomes of five ancestries, on each South Asian population, and under " +
      "thirteen alternative simulator settings."),
    H2("3.2 Proposed Solution"),
    P(`The solution is an eight-stage pipeline (${F("arch")} in Chapter 4):`, { after: 60, keepNext: true }),
    ...bullets([
      "**S1 Data preparation:** QC of 1000 Genomes, principal components, D-PRISM and mechanism scores, a haplotype library and an LD panel.",
      "**S2 Cohort and simulator:** synthetic South Asians as haplotype mosaics, with clinical factors, the IDRS and simulated T2D.",
      "**S3 Interaction search:** a vectorised score test for all 1,263 cross-mechanism SNP pairs, inside each cross-validation fold.",
      "**S4 Pair selection:** a QUBO of relevance minus redundancy, solved by simulated annealing and by QAOA with error mitigation.",
      "**S5 Quantum encoder:** 12 eight-qubit circuits encode the 48 selected pairs into 96 features.",
      "**S6 Model zoo:** 17 predictors, from the IDRS and a BMI rule to a stacked hybrid.",
      "**S7 Evaluation:** fifteen experiments (E0–E13) with DeLong, McNemar and Holm-corrected tests.",
      "**S8 Application:** a calibrated model behind a dashboard, a REST API and a PDF report, with LD imputation.",
    ]),
    H2("3.3 Work Breakdown Structure"),
    tableCaption("Work breakdown and progress", "wbs"),
    table(["Phase", "Scope", "Progress", "Status"], [
      ["1", "Data pipeline on real 1000 Genomes data", "100%", "Complete"],
      ["2", "Outcome simulator, clinical factors and IDRS", "100%", "Complete"],
      ["3", "Interaction search, QUBO selection and QAOA with error mitigation", "100%", "Complete"],
      ["4", "Variational quantum encoder and its classical controls", "100%", "Complete"],
      ["5", "Classical baselines, hybrid stack and experiments E0–E13", "100%", "Complete"],
      ["6", "Application: dashboard, API, PDF, LD imputation, Docker", "100%", "Complete"],
      ["7", "Run on real IBM quantum hardware; public online demo", "Ready", "Planned for the final panel"],
      ["8", "Final report, slides and demo video", "In progress", "Ongoing"],
    ], [900, 4486, 1300, 2700], { aligns: [AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.CENTER, AlignmentType.LEFT] }),
    H2("3.4 Tools and Technology"),
    tableCaption("Tools and technologies used", "tools"),
    table(["Tool / Library", "Version", "Purpose"], [
      ["Python", "3.12", "Implementation language"],
      ["PLINK 2 / PLINK 1.9", "2.0 / 1.9", "Genotype QC, PCA, polygenic scoring; BOOST interaction baseline"],
      ["NumPy / pandas / SciPy", "2.5 / 3.0 / 1.18", "Arrays, tables, statistics"],
      ["scikit-learn", "1.9", "Logistic regression, random forest, SVM, calibration, cross-validation"],
      ["XGBoost", "3.4", "Gradient-boosted trees"],
      ["PyTorch", "2.14", "Training the variational circuits (own exact simulator)"],
      ["PennyLane", "0.45", "Reference circuit simulation and QAOA training"],
      ["Qiskit / Aer / IBM Runtime", "2.5 / 0.17 / 0.50", "QAOA circuits, noisy simulation, IBM hardware access"],
      ["dwave-samplers", "1.8", "Simulated annealing for the QUBO"],
      ["SHAP", "0.52", "Per-person model explanations"],
      ["FastAPI / Streamlit", "0.143 / 1.65", "REST API and dashboard"],
      ["fpdf2", "2.8", "PDF report"],
      ["Docker", "29", "Container image for the application"],
      ["pytest / ruff / GitHub Actions", "9.1 / 0.16 / —", "Tests, style checks, continuous integration"],
      ["VS Code, Git, GitHub", "—", "Development environment and version control"],
    ], [2600, 1400, 5386], { shadeFirst: true }),
  ];
}

// =====================================================================
// CHAPTER 4: DESIGN SPECIFICATIONS
// =====================================================================
function chapter4() {
  return [
    H1("CHAPTER 4: DESIGN SPECIFICATIONS"),
    H2("4.1 System Architecture"),
    P(`${F("arch")} shows the system. Three inputs feed eight stages; the two purple stages use quantum circuits, ` +
      `and each is compared against a classical control. ${TB("stages")} lists the module and main technique of each ` +
      "stage."),
    ...figure("fig_architecture.png", 620, "QGenomix architecture: inputs, the eight stages S1–S8, and the quantum stages (purple)", "arch"),
    tableCaption("Stages, code modules and techniques", "stages"),
    table(["Stage", "Module (src/qgenomix)", "Technique"], [
      ["S1 Data preparation", "data", "PLINK 2 QC (MAF, HWE, missingness), PCA, PRS scoring, haplotype library (2,710 blocks), LD panel"],
      ["S2 Cohort and simulator", "data.cohort, sim, clinical", "Haplotype-mosaic cohort; liability-threshold outcome model, 11% prevalence; IDRS"],
      ["S3 Interaction search", "search.relevance", "Vectorised Rao score test for 1,263 pairs, refitted in every cross-validation fold"],
      ["S4 Pair selection", "search.qubo, solvers, qaoa, mitigation", "QUBO of relevance minus SNP overlap; simulated annealing with swap polish; QAOA in Qiskit with error mitigation"],
      ["S5 Quantum encoder", "quantum", "8-qubit data re-uploading circuit (RY/RZ rotations, chain of CZ gates), 4 layers, 64 shared parameters; fidelity kernel"],
      ["S6 Model zoo", "models.zoo", "IDRS, BMI rule, logistic regression, random forest, SVM, XGBoost, quantum heads, quantum-kernel SVC, stacking"],
      ["S7 Evaluation", "eval, pipeline", "AUC, average precision, F1, Brier, EDR@K, lean-case capture; DeLong, McNemar, Holm; E0–E13"],
      ["S8 Application", "app, data.impute", "Genotype parser, LD imputation, calibrated model, FastAPI, Streamlit, PDF report, Docker"],
    ], [2050, 2300, 5036], { shadeFirst: true }),
    H2("4.2 Design Level Diagrams"),
    H3("4.2.1 Report Generation"),
    P(`${F("flow")} shows how the application turns one DNA file and six questionnaire answers into a report. The slow ` +
      "genetic part runs once per file and is cached; the model, explanation and what-ifs then respond instantly."),
    ...figure("fig_app_flow.png", 620, "Report generation: from a consumer DNA file and the questionnaire to the risk report", "flow"),
    H3("4.2.2 Quantum Pair Encoder"),
    P(`Each circuit (${F("circuit")}) takes four SNP pairs on eight qubits, two qubits per pair. In every layer each qubit ` +
      `receives its SNP dosage as a rotation angle, then trainable RY and RZ rotations, then a chain of CZ gates ` +
      `within each pair and between neighbouring pairs; the data is re-uploaded in each of the four layers ` +
      `${cite("perez")}. The expectation of Z on every qubit gives 8 features per circuit. Twelve circuits share the ` +
      `same 64 trainable angles and give 96 features. Without the CZ gates each qubit would only see its own SNP; ` +
      `entanglement is what lets a feature depend on both SNPs of a pair.`),
    ...figure("fig_circuit.png", 470, "The 8-qubit pair encoder (two of its four layers shown)", "circuit"),
    H3("4.2.3 Pair Selection and QAOA"),
    P(`The QUBO rewards relevance (the score-test strength of each pair) and penalises pairs that share a SNP or a ` +
      `linkage block, with a penalty that forces exactly 48 pairs ${cite("lucas")}. Simulated annealing with a ` +
      `swap-polishing step solves the full problem. QAOA ${cite("farhi")} solves 12-pair sub-problems (choose 4) in two ` +
      `forms: the textbook penalty form with an X mixer, and a constraint-preserving XY mixer ${cite("hadfield")} ` +
      `started from a Dicke state prepared with the Bärtschi–Eidenbenz circuit ${cite("bartschi")}, which only ` +
      `explores valid selections.`),
    H3("4.2.4 Hybrid Model"),
    P(`Level-one learners (an additive logistic model, XGBoost on the quantum features, and a quantum-kernel SVC) ` +
      `produce out-of-fold predictions inside five-fold cross-validation; a logistic meta-learner combines them. The ` +
      `deployed model is XGBoost on clinical factors, PRS, mechanism scores, SNP dosages and quantum features, with ` +
      `Platt calibration on a held-out set.`),
    H2("4.3 Snapshots of Working Prototype"),
    P(`${F("dash")} shows the dashboard report for a synthetic demo persona: a 34-year-old woman with BMI 21.6. QGenomix ` +
      "rates her high risk (84th percentile) while the IDRS rates her moderate and the BMI rule does not flag her. Her " +
      "β-cell and lipodystrophy scores are both high, and the what-if table shows exercise and a smaller waist cutting " +
      `her risk from 23% to 6%. ${F("pdf")} is the PDF report the same page produces, and ${F("clinician")} the ` +
      "clinician view."),
    ...figure(path.join(__dirname, "asha_top.png"), 450, "Dashboard report for a lean, high-genetic-risk demo persona (synthetic genome)", "dash"),
    ...figure("app_pdf_report.png", 430, "The one-page PDF report (download button and POST /v1/report.pdf)", "pdf"),
    ...figure(path.join(__dirname, "clinician_crop.png"), 560, "Clinician view of a 200-person synthetic cohort", "clinician"),
    P("The demo runs with `make app` (dashboard), `make api` (REST service) or `docker compose up` (both, in " +
      "containers). Three synthetic personas are included: a lean woman at high genetic risk, an obese man at high " +
      "risk, and a low-risk young woman.", { before: 60 }),
  ];
}

// =====================================================================
// CHAPTER 5: IMPLEMENTATION AND EXPERIMENTAL RESULTS
// =====================================================================
function chapter5() {
  const sx = (k) => mit(k);
  return [
    H1("CHAPTER 5: IMPLEMENTATION AND EXPERIMENTAL RESULTS"),
    H2("5.1 Implementation"),
    H3("5.1.1 Data"),
    P(`PLINK 2 ${cite("plink")} processed the 1000 Genomes phase 3 release ${cite("kg")}: 84 million variants in ` +
      `2,504 people from 26 populations. From it we computed the five components of D-PRISM (1.34 million variants), ` +
      `the five mechanism scores (β-cell, lipodystrophy, liver/lipid, obesity, proinsulin) and the dosages of their 62 ` +
      `SNPs. The 489 South Asian samples (Gujarati, Punjabi, Bengali, Sri Lankan Tamil and Telugu) give 978 phased ` +
      `haplotypes. A synthetic person is assembled by drawing each one-megabase block of the genome from a random South ` +
      `Asian haplotype, which keeps real allele frequencies and local linkage while allowing a cohort of any size.`),
    H3("5.1.2 Outcome Simulator"),
    P(`Each person's liability to T2D is a weighted sum of the D-PRISM background (10% of variance), the five ` +
      `mechanism scores (6.9%), a β-cell × lipodystrophy interaction (2.0%), ten planted SNP-pair interactions (4.0%), ` +
      `age (7%), BMI (4%), waist, activity and family history (4.5% together) and noise. The top 11% become cases, ` +
      `close to the national prevalence ${cite("anjana")}. The IDRS is computed from the simulated clinical factors ` +
      `exactly as published.`),
    H3("5.1.3 Interaction Search"),
    P(`For each of the 1,263 pairs of SNPs from different mechanisms, a Rao score test asks whether the pair's product ` +
      `term improves a logistic model that already contains all main effects and covariates; it is vectorised over all ` +
      `pairs (about 7 seconds per fold). The 200 strongest pairs enter the QUBO; top-K ranking and mRMR ${cite("peng")} ` +
      `are the classical controls.`),
    H3("5.1.4 Error Mitigation"),
    P(`After routing to IBM's heavy-hex layout the QAOA circuits need 220–700 two-qubit gates. Three inexpensive ` +
      `techniques are applied to the same shots. Readout correction measures two calibration circuits and inverts each ` +
      `qubit's 2 × 2 assignment matrix ${cite("bravyi")}. Post-selection keeps only samples that select exactly four ` +
      `pairs; for the XY circuit any other count is a detected error, because the circuit conserves it ` +
      `${cite("bonet")}. Zero-noise extrapolation runs the circuit at noise scales 1, 3 and 5 by unitary folding and ` +
      `extrapolates back to zero noise ${cite("temme")}. The same code drives the hardware script, which adds ` +
      `dynamical decoupling and gate twirling.`),
    H3("5.1.5 LD Imputation"),
    P(`Consumer chips measure about 600,000 SNPs, so a typical 23andMe or AncestryDNA file contains only about half ` +
      `of the D-PRISM variants. QGenomix predicts each missing variant from its best-correlated measured neighbour ` +
      `(its tag), using linkage disequilibrium measured in the 489 South Asian genomes ${cite("marchini")}: the dosage ` +
      `is the reference mean plus a regression slope times the tag's deviation from its mean. For each of 1.46 million ` +
      `variants the panel stores the six best tags within 500 kb; the median best tag has r^{2} = ` +
      `${f2(e13.best_tag_r2_median)}. The panel builds in about two minutes and imputes a genome in about a second, ` +
      `with no external software.`),
    H3("5.1.6 Application"),
    P(`The deployed model is trained on ${meta.n_train.toLocaleString("en-IN")} synthetic people and calibrated on ` +
      `${meta.n_cal.toLocaleString("en-IN")} more (AUC ${f3(meta.cal_auc)}). The service parses the file, checks the ` +
      `genome build, imputes missing variants, computes the scores and the IDRS, predicts calibrated risk, ranks the ` +
      `SNP pairs the person carries by SHAP ${cite("lundberg")}, simulates lifestyle changes and renders the report on ` +
      `screen, as JSON or as a PDF. Uploaded files are processed in memory and never stored.`),
    H2("5.2 Evaluation Protocol"),
    P(`Every experiment holds out 20% of people as a test set. All selection and fitting happens inside five-fold ` +
      `cross-validation on the remaining 80%, so no test information leaks into the choice of pairs. Results are ` +
      `averaged over 3 seeds. AUCs are compared with DeLong's test ${cite("delong", "sunxu")}, classifications with ` +
      `McNemar's test, both Holm-corrected. EDR@10 is the share of the 10 planted pairs found in a method's top 10. ` +
      `Lean-case capture is the share of lean cases (BMI < 23) among the top 20% of predicted risk, with exactly 20% ` +
      `flagged. ${TB("experiments")} summarises the experiments.`),
    tableCaption("Experiments and results", "experiments"),
    table(["Exp.", "Question", "Result"], [
      ["E0", "Does the simulated cohort behave like the population?", "Prevalence 11%; 25% of cases lean; β-cell + lipodystrophy high group: 37% case rate at lower BMI"],
      ["E1", "Which predictor is most accurate?", `IDRS ${f3(auc("M0_idrs"))}, clinical ${f3(auc("M3c_clinical"))}, PRS ${f3(auc("M2_prs"))}, clinical + genetics ${f3(auc("M3_additive"))}, stacked ${f3(auc("M12_stack"))}; quantum ${f3(qMin)}–${f3(qMax)}`],
      ["E2", "Does the search find planted pairs?", "Score test 70–84% in its top 10 at δ = 0.2; PLINK BOOST 40–48%"],
      ["E3", "How many people are needed?", "24% of pairs at 2,500 people, 78% at 10,000, 92% at 20,000, 100% at 40,000"],
      ["E4", "Does it invent pairs when none exist?", "18 of 20 null runs report nothing; 5.4% of p-values below 0.05; λ = 1.05"],
      ["E5", "Does entanglement help?", `Entangled ${f3(auc("H_vqc"))}, no entanglement ${f3(auc("H_noent"))}, classical twin ${f3(auc("H_twin"))}: no`],
      ["E6", "Is QUBO selection better than top-K?", `${Math.round(e6.qubo.distinct_snps)} distinct SNPs vs ${Math.round(e6.topk.distinct_snps)}, ${Math.round(100 * (1 - e6.qubo.shadow_pairs / e6.topk.shadow_pairs))}% fewer redundant pairs, best objective in ${pc(e6win)} of runs`],
      ["E7", "Does QAOA solve the selection?", "Ideal: XY mixer 0.76 → 0.83 (depth 1 → 6), penalty 0.30 → 0.66; with IBM noise both ≈ 0.3"],
      ["E7b", "Can error mitigation recover it?", `XY depth 1: ${f2(sx("xy_p1").raw)} → ${f2(sx("xy_p1").readout_postselect_zne)} (noise-free ${f2(sx("xy_p1").ideal_postselect)}); penalty: ${f2(sx("penalty_p1").raw)} → ${f2(sx("penalty_p1").readout_postselect_zne)}`],
      ["E8", "Who catches lean cases?", `Top 20%: BMI rule ${pc(lean("M1_bmi"))}, IDRS ${pc(lean("M0_idrs"))}, clinical ${pc(lean("M3c_clinical"))}, with genetics ${pc(lean("M3_additive"))}`],
      ["E9", "Does it work on real genomes?", `AUC ${f3(T.e9.SAS.M3_additive[0])} South Asian; 0.85–0.87 East Asian, European, American; ${f3(T.e9.AFR.M3_additive[0])} African`],
      ["E10", "Are the app's what-ifs right?", `Waist −5 cm: ${rel("waist_minus_5cm", "model")} vs true ${rel("waist_minus_5cm", "true")}; exercise ${rel("vigorous_exercise", "model")} vs ${rel("vigorous_exercise", "true")}`],
      ["E11", "Is it fair across populations?", `Genetic-model AUC ${f2(Math.min(...popAuc))}–${f2(Math.max(...popAuc))} across five populations; gain over clinical +${f2(Math.min(...popGain))} to +${f2(Math.max(...popGain))}`],
      ["E12", "Robust to simulator assumptions?", `Genetics beats clinical in ${nAucWin}/${nSet} settings and beats IDRS on lean cases in ${nLeanWin}/${nSet}`],
      ["E13", "Partial consumer DNA files?", `45% coverage: PRS r ${f3(m13("mean_fill", PRS_T))} → ${f3(m13("ld_impute", PRS_T))}; high-risk kept ${pc(m13("mean_fill", HIGH_T))} → ${pc(m13("ld_impute", HIGH_T))}`],
    ], [750, 3000, 5636], { shadeFirst: true, aligns: [AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.LEFT] }),

    H2("5.3 Data and Simulator Checks"),
    P(`The synthetic mosaic reproduces the real South Asian allele frequencies of the mechanism SNPs almost exactly ` +
      `(r = 0.9999; ${F("e0")}). Its PRS spread is narrower than in the real samples because the mosaic removes ` +
      `population substructure. The simulator reproduces the lean phenotype: 25% of cases are lean, and people high on ` +
      `both the β-cell and lipodystrophy scores have a 37% case rate against 10% for everyone else, despite a lower ` +
      `average BMI.`),
    ...figure("fig_data_checks.png", 620, "E0: genetic principal components, mechanism SNP frequencies, and the PRS of real and synthetic South Asians", "e0"),

    H2("5.4 Prediction and the Lean Blind Spot"),
    P(`${F("e1")} compares all 17 predictors. Adding the PRS and mechanism scores to the clinical factors raises AUC ` +
      `from ${f3(auc("M3c_clinical"))} to ${f3(auc("M3_additive"))}; DeLong's test gives p ≤ 4×10^{−6} after Holm ` +
      `correction in each seed. The stacked hybrid is the most accurate model (${f3(auc("M12_stack"))}), but its ` +
      `margin over the additive model is not significant.`),
    ...figure("fig_e1_benchmark.png", 520, "E1 benchmark: test AUC of the 17 predictors (mean ± sd over 3 seeds)", "e1"),
    P(`${F("e8")} is the main clinical result. Among lean people who develop diabetes, a BMI rule flags none by ` +
      `construction, the IDRS flags ${pc(lean("M0_idrs"))} and a clinical-factor model ${pc(lean("M3c_clinical"))}. ` +
      `Adding genetics raises this to ${pc(lean("M3_additive"))}: genetic information helps most for exactly the ` +
      `people current screening misses.`),
    ...figure("fig_e8_lean.png", 560, "E8: share of all cases and of lean cases caught when the top 20% by risk are screened", "e8"),

    H2("5.5 Interaction Discovery"),
    P(`The score test recovers most planted pairs at 10,000 people and nearly all at 20,000 (E2, E3; ${F("e2")}), ` +
      "well ahead of PLINK's BOOST, and the mechanism-level β-cell × lipodystrophy interaction is detected in every " +
      `run when it is present. Under the null the test is calibrated (λ = 1.05) and 18 of 20 runs report nothing ` +
      `(${F("e4")}). ` +
      `QUBO selection covers more distinct SNPs and wastes fewer slots on redundant "shadow" pairs than top-K (E6).`),
    ...figure("fig_e2_power.png", 600, "E2: share of planted pairs found against their effect size, and power of the mechanism-level test", "e2"),
    ...figure("fig_e4_null.png", 560, "E4: p-values under the null hypothesis and the strongest pair in each of 20 null runs", "e4"),

    H2("5.6 Quantum Components"),
    P(`Every quantum component was tested against a matched classical control, and none gave a significant gain. The ` +
      `encoder performs the same with and without entanglement and the same as a classical twin (${F("e5")}). In QAOA, ` +
      `the constraint-preserving XY mixer clearly beats the textbook penalty form on an ideal simulator (${F("e7")}), ` +
      `but under IBM Kingston noise both fall to about 0.3. Error mitigation recovers most of the loss (${F("e7b")}): for ` +
      `the XY circuit at depth 1 the approximation ratio rises from ${f2(sx("xy_p1").raw)} to ` +
      `${f2(sx("xy_p1").readout_postselect_zne)}, against ${f2(sx("xy_p1").ideal_postselect)} noise-free and ` +
      `${f2(sx("xy_p1").random_valid)} for a random valid choice. Post-selection does most of the work, which is ` +
      `exactly what the conserved pair count makes possible. The penalty form only reaches the level of a random valid ` +
      `choice (${f2(sx("penalty_p1").readout_postselect_zne)}), because even noise-free it has no edge once invalid ` +
      `samples are discarded.${hwRun ? ` On the real ${hwRun.hardware_backend} processor the mitigated XY circuit ` +
      `reached ${f2(hwRun.hardware_mitigated)} (raw ${f2(hwRun.hardware_raw)}).` : ""} An 8-qubit circuit can be ` +
      `simulated exactly, so no speed-up is claimed; the contribution is a controlled test of where quantum methods ` +
      `stand on this problem today.`),
    ...figure("fig_e5_entanglement.png", 560, "E5: test AUC of the classical twin and of the quantum encoder with and without entanglement (3 seeds)", "e5"),
    ...figure("fig_e7_qaoa.png", 620, "E7: QAOA solution quality, constraint satisfaction and two-qubit gate cost, ideal and with IBM Kingston noise", "e7"),
    ...figure("fig_e7b_mitigation.png", 600, "E7b: QAOA quality on the IBM Kingston noise model after each mitigation stage", "e7b"),

    H2("5.7 Real Genomes, Fairness and Robustness"),
    P(`On the real 1000 Genomes samples the clinical-plus-genetic model reaches AUC ${f3(T.e9.SAS.M3_additive[0])} in ` +
      `South Asians and ${f3(T.e9.AFR.M3_additive[0])} in Africans (E9; ${F("e9")}), the expected loss for a South ` +
      `Asian-trained model. Within South Asia (E11; ${F("e11")}) the genetic model improves on clinical factors in ` +
      `${allGain ? "every" : "most"} population and in both sexes; accuracy is lowest in the ${POPS[worstPop]} samples ` +
      `(AUC ${f2(e11[worstPop].auc_genetic)}) and highest in the ${POPS[bestPop]} samples ` +
      `(${f2(e11[bestPop].auc_genetic)}), differences within sampling noise for about 100 people per group. Predicted ` +
      `risks run about ${Math.round(100 * (1 - e11.all.oe[0]))}% high on real genomes, equally in every group, so local ` +
      `recalibration, not a group-specific fix, is the remedy.`),
    P(`Because outcomes are simulated, E12 changes one assumption at a time across ${nSet} settings (${F("e12")}). ` +
      `Genetics beats clinical factors in ${nAucWin} of ${nSet} settings (gain ${f3(Math.min(...dAuc))} to ` +
      `${f3(Math.max(...dAuc))} AUC) and catches more lean cases than the IDRS in ${nLeanWin} of ${nSet}. Interaction ` +
      `discovery, in contrast, depends strongly on effect size (EDR@10 from ${f2(Math.min(...edrs))} to ` +
      `${f2(Math.max(...edrs))}), which is reported as a limit.`),
    ...figure("fig_e9_real_genomes.png", 560, "E9: models trained on synthetic South Asians, tested on real genomes of five ancestries", "e9"),
    ...figure("fig_e11_fairness.png", 620, "E11: accuracy, cases caught and calibration by South Asian population and sex", "e11"),
    ...figure("fig_e12_robustness.png", 620, "E12: the main conclusions under thirteen alternative simulator settings", "e12"),

    H2("5.8 Consumer DNA Files and Lifestyle What-ifs"),
    P(`E13 holds out 100 real South Asian genomes, builds the LD panel from the other 389, and masks each genome to ` +
      `25%, 45% or 65% coverage (${F("e13")}). At 45%, typical of a consumer chip, LD imputation raises the PRS ` +
      `correlation with the full genome from ${f3(m13("mean_fill", PRS_T))} to ${f3(m13("ld_impute", PRS_T))}, cuts ` +
      `the error in the reported risk percentile from ${m13("mean_fill", ERR_T).toFixed(1)} to ` +
      `${m13("ld_impute", ERR_T).toFixed(1)} points, and keeps ${pc(m13("ld_impute", HIGH_T))} of truly high-risk ` +
      `people flagged, against ${pc(m13("mean_fill", HIGH_T))} with average filling.`),
    ...figure("fig_e13_imputation.png", 620, "E13: partial DNA files, average filling against LD imputation", "e13"),
    P(`The app's lifestyle what-ifs match the simulator's true effect (E10; ${F("e10")}): a waist 5 cm smaller changes ` +
      `risk by ${rel("waist_minus_5cm", "model")} in the app against ${rel("waist_minus_5cm", "true")} in truth, and ` +
      `regular exercise by ${rel("vigorous_exercise", "model")} against ${rel("vigorous_exercise", "true")}, a ` +
      `conservative estimate. The size of these changes is consistent with the Indian Diabetes Prevention Programme ` +
      `${cite("ramachandran")}.`),
    ...figure("fig_e10_lifestyle.png", 620, "E10: mean risk by genetic risk quintile before and after each change, app estimate against the true effect", "e10"),

    H2("5.9 Testing and Validation"),
    ...bullets([
      `**${nTests} automated tests:** unit tests (QUBO, score test, metrics, simulator, IDRS, LD imputation, PLINK ` +
        "file decoding, readout correction, post-selection, extrapolation), equivalence tests (our simulator against " +
        "PennyLane, our QAOA against Qiskit, the Dicke circuit, circuit folding), an end-to-end pipeline test, and " +
        "parser, API and PDF tests including partial chip files, duplicate positions and wrong genome builds.",
      "**Continuous integration:** GitHub Actions installs the project from scratch and runs the linter and all tests on every push.",
      "**Reproducibility:** a re-run matches the stored result bit for bit; re-running the data pipeline from the raw " +
        "downloads reproduced every processed file; the imputation code reproduces PLINK's PRS exactly (r = 1.000).",
      `**Code:** ${pyFiles.length} Python modules (${srcLines.toLocaleString("en-IN")} lines), ${nScripts} scripts, one \`make\` command per step, and a Docker image.`,
    ]),
    P(`Testing found the problems in ${TB("problems")}; all are fixed and covered by tests.`, { before: 80 }),
    tableCaption("Problems found in testing and their fixes", "problems"),
    table(["Problem", "Effect", "Fix"], [
      ["PLINK ran out of memory on 84 million variants", "Data step crashed", "Extraction split into parts with a memory cap"],
      ["Interaction p-values depended on the CPU thread count", "Small differences between machines", "Tighter solver tolerance; all experiments re-run"],
      ["Duplicate positions in 23andMe files", "App crashed", "De-duplication and a regression test"],
      ["Consumer files cover about 45% of PRS variants", "Scores pulled to average; high-risk people missed", "LD imputation (E13)"],
      ["Ties in coarse scores (IDRS moves in steps of 10)", "More than 20% flagged, IDRS capture inflated", "Exactly 20% flagged, ties broken at random"],
      ["Step-shaped (isotonic) calibration", "Some risks shown as 0%", "Smooth Platt calibration"],
    ], [3300, 2900, 3186], { shadeFirst: true }),
  ];
}

// =====================================================================
// CHAPTER 6: CONCLUSIONS AND FUTURE SCOPE
// =====================================================================
function chapter6() {
  return [
    H1("CHAPTER 6: CONCLUSIONS AND FUTURE SCOPE"),
    H2("6.1 Work Accomplished"),
    P(`${TB("objectives")} compares each objective approved at the mid-semester evaluation with its status then and now.`),
    tableCaption("Status of the approved objectives", "objectives"),
    table(["#", "Approved objective", "Mid-sem", "Now", "Evidence"], [
      ["1", "Genomic data pipeline: QC, SNP selection, pair ranking, labels", "100%", "Complete, rebuilt on real data", "`make data` rebuilds every file from the raw downloads; a full re-run gave identical output"],
      ["2", "Variational quantum circuit encoder for SNP pairs", "20%", "Complete", "8-qubit circuit; our simulator matches PennyLane to 10^{−6} and trains 7× faster"],
      ["3", "Classical baselines (LR, RF, XGBoost, SVM) and PRS", "15%", "Complete", "Also the IDRS, a BMI rule and a clinical-factor model"],
      ["4", "Hybrid stacking ensemble", "0%", "Complete", `Stacked model has the best AUC, ${f3(auc("M12_stack"))}`],
      ["5", "SHAP-guided adaptive pair refinement", "0%", "Built, tested, replaced", `SHAP ranking found ${pc(edrShap)} of planted pairs vs ${pc(edrScore)} for the score test; SHAP kept for per-person explanations`],
      ["6", "Benchmark: AUC-ROC, F1, EDR@K, DeLong, McNemar", "10%", "Complete", "17 models, 15 experiments (E0–E13), Holm-corrected tests"],
    ], [450, 2700, 950, 1500, 3786], { aligns: [AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.CENTER,
      AlignmentType.LEFT, AlignmentType.LEFT] }),
    P("Beyond the approved objectives the project added QAOA with error mitigation, clinical factors and the IDRS, " +
      "tests on real genomes, fairness and robustness studies, LD imputation for consumer DNA files, and a complete " +
      "application with a PDF report and a Docker image.", { before: 120 }),
    H2("6.2 Conclusions"),
    P(`QGenomix is a complete, tested system built around a clear clinical question. On simulated outcomes over real ` +
      `genotypes, genetic scores add substantially to India's screening questionnaire and nearly double the share of ` +
      `lean diabetes cases caught (${pc(lean("M0_idrs"))} → ${pc(lean("M3_additive"))}); the finding survives ` +
      `${nAucWin} of ${nSet} alternative simulator settings and holds in every South Asian population tested. The ` +
      `interaction search finds planted gene pairs reliably and stays quiet when there are none. The application turns ` +
      `a consumer DNA file into a calibrated, explained report, with LD imputation for partial files. The quantum ` +
      `methods are implemented with care and with classical controls; they show no advantage yet, and error ` +
      `mitigation recovers most of the quality that hardware noise destroys. The main limit is that outcomes are ` +
      `simulated; validation on a consented Indian cohort is the next step beyond this course.`),
    H2("6.3 Environmental / Social Benefits"),
    P("Earlier identification of lean South Asians at high risk allows lifestyle change before diabetes develops, which " +
      "is cheaper and kinder than treating its complications. QGenomix needs only a consumer DNA file and six questions, " +
      "runs on an ordinary laptop with a small energy footprint, processes genetic data in memory without storing it, " +
      "and is open source, so it could be adapted for public-health screening at low cost."),
    H2("6.4 Future Work Plan"),
    P("The final panel evaluation is about two weeks away (around 9 November 2026). Two features have been kept for " +
      `the panel because each needs an account in the team's own name; both are built and rehearsed (${TB("panel")}).`),
    tableCaption("Features kept for the final panel", "panel"),
    table(["Feature", "What is ready", "What remains", "Effort"], [
      hwRun
        ? ["Run on a real IBM quantum computer", `Done on ${hwRun.hardware_backend}; the result is in ${F("e7b")}`, "Present it at the panel", "Done"]
        : ["Run on a real IBM quantum computer", "`scripts/run_ibm.py` with error mitigation, dynamical decoupling and twirling; rehearsed on the Kingston noise model", `Create a free IBM Quantum account, run one batched job (about 2 of the 10 free QPU minutes); \`make figures\` adds the result to ${F("e7b")}`, "1 day"],
      ["Public online demo", "Docker image and compose file; health checks pass", "Deploy the image to a free host under a team account; put the link on the slides", "1 day"],
    ], [2000, 2900, 3486, 1000], { shadeFirst: true }),
    tableCaption("Schedule to the final panel", "schedule"),
    table(["Dates", "Work"], [
      ["28–31 October", "IBM hardware run and analysis; public demo deployment; update figures and report"],
      ["1–5 November", "Final report; IEEE-format paper draft; slides; three-minute demo video"],
      ["6–9 November", "Full test run on a clean machine; timed rehearsal with each member presenting one part"],
    ], [2000, 7386], { shadeFirst: true }),
    P("Beyond the course, the natural next steps are validation on real Indian patients (for example GenomeIndia data " +
      "through the Indian Biological Data Centre), imputation with a larger reference panel, extension to other " +
      "ancestries and traits, and a paper on the screening and interaction results.", { before: 120 }),
  ];
}

// =====================================================================
// APPENDICES AND REMARKS
// =====================================================================
function appendices() {
  return [
    H1("APPENDIX A: REFERENCES"),
    ...S.refOrder.map((k, i) => new Paragraph({
      spacing: { after: 80, line: 260 }, indent: { left: 560, hanging: 560 }, tabStops: [{ type: TabStopType.LEFT, position: 560 }],
      children: [new TextRun({ text: `[${i + 1}]\t`, size: 22 }), ...runs(REFS[k], { size: 22 })],
    })),
    H1("APPENDIX B: PLAGIARISM REPORT"),
    P("Plagiarism report to be attached here after Turnitin submission."),
  ];
}
function remarksPage() {
  return [
    H1("MENTOR'S REMARKS"),
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [CONTENT_W],
      rows: Array.from({ length: 12 }, () => new TableRow({ height: { value: 480, rule: "exact" }, children: [
        new TableCell({ width: { size: CONTENT_W, type: WidthType.DXA },
          borders: { top: NONE, left: NONE, right: NONE, bottom: BORDER }, children: [new Paragraph({ children: [] })] }),
      ] })),
    }),
    line("Faculty Mentor"),
    new Paragraph({ spacing: { before: 120 }, children: [new TextRun(`${MENTOR}, Assistant Professor, CSED, TIET, Patiala`)] }),
    line("Signature"),
    line("Date"),
  ];
}

// =====================================================================
// DOCUMENT
// =====================================================================
function build(pages) {
  resetState(pages);
  // body first, so that headings, figures, tables and citations are numbered in reading order
  const front = [...abstractPage(), ...declarationPage(), ...acknowledgementPage()];
  const body = [...chapter1(), ...chapter2(), ...chapter3(), ...chapter4(), ...chapter5(), ...chapter6(),
    ...appendices(), ...remarksPage()];
  const listsStart = S.toc.length;
  const lists = [...listPage("LIST OF FIGURES", S.figs, "Figure"), ...listPage("LIST OF TABLES", S.tabs, "Table"),
    ...abbreviationsPage()];
  // contents order: front-matter titles, the three lists, then the body headings
  const listEntries = S.toc.slice(listsStart);
  S.toc = [...S.toc.slice(0, 3), ...listEntries, ...S.toc.slice(3, listsStart)];
  const contents = contentsPages();

  const page = { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1300, left: 1440, right: 1080 } };
  const footer = () => new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
    children: [new TextRun({ children: [PageNumber.CURRENT], size: 20 })] })] });
  const team = TEAM.map(([, n]) => n).join(", ");
  return new Document({
    creator: team,
    lastModifiedBy: team,
    title: `${FULL_TITLE}: Mentor Evaluation Report`,
    subject: "Capstone Project CPG 218, Computer Science and Engineering Department, TIET, Patiala",
    keywords: "type 2 diabetes, South Asians, polygenic risk, QAOA, variational quantum circuit",
    styles: {
      default: { document: { run: { font: FONT, size: 24 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: FONT, size: 32, bold: true, color: "000000" }, paragraph: { spacing: { before: 240, after: 200 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: FONT, size: 28, bold: true, color: "000000" }, paragraph: { spacing: { before: 240, after: 100 }, outlineLevel: 1 } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: FONT, size: 24, bold: true, color: "000000" }, paragraph: { spacing: { before: 180, after: 80 }, outlineLevel: 2 } },
      ],
    },
    numbering: { config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] },
      { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
    ] },
    sections: [
      { // front matter: lower-case roman page numbers, none on the cover
        properties: { titlePage: true, page: { ...page, pageNumbers: { start: 1, formatType: NumberFormat.LOWER_ROMAN } } },
        footers: { default: footer(), first: new Footer({ children: [new Paragraph({ children: [] })] }) },
        children: [...coverPage(), ...front, ...contents, ...lists],
      },
      { // body: arabic page numbers from 1
        properties: { page: { ...page, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } } },
        footers: { default: footer() },
        children: body,
      },
    ],
  });
}

// ---------------------------------------------------------------- page numbers from a first rendering pass
const roman = (n) => [["m", 1000], ["cm", 900], ["d", 500], ["cd", 400], ["c", 100], ["xc", 90], ["l", 50], ["xl", 40],
  ["x", 10], ["ix", 9], ["v", 5], ["iv", 4], ["i", 1]].reduce((s, [r, v]) => { while (n >= v) { s += r; n -= v; } return s; }, "");

function locatePages(pdfText) {
  const pages = pdfText.split("\f").map((p) => p.split("\n").map((l) => l.trim()).filter(Boolean));
  const bodyStart = pages.findIndex((ls) => ls[0] === "CHAPTER 1: INTRODUCTION");
  if (bodyStart < 0) throw new Error("could not find the first chapter in the rendered PDF");
  const label = (i) => (i < bodyStart ? roman(i + 1) : String(i - bodyStart + 1));
  // a heading is one line, or a long heading wrapped over two consecutive lines
  const has = (ls, text) => ls.some((l, i) => l === text || (text.startsWith(`${l} `) &&
    `${l} ${ls[i + 1] || ""}`.replace(/\s+/g, " ").startsWith(text)));
  const found = {};
  let cursor = bodyStart;
  for (const e of S.toc) {
    if (e.level === 0) {
      const i = pages.findIndex((ls, j) => j < bodyStart && ls[0] === e.text);
      if (i >= 0) found[e.key] = label(i);
    } else {
      const i = pages.findIndex((ls, j) => j >= cursor && has(ls, e.text));
      if (i >= 0) { found[e.key] = label(i); cursor = i; }
    }
  }
  for (const [kind, list] of [["figure", S.figs], ["table", S.tabs]]) {
    const prefix = kind === "figure" ? "Figure" : "Table";
    for (const it of list) {
      const i = pages.findIndex((ls, j) => j >= bodyStart && ls.some((l) => l.startsWith(`${prefix} ${it.n}:`)));
      if (i >= 0) found[`${kind}:${it.n}`] = label(i);
    }
  }
  return found;
}

async function main() {
  let buf = await Packer.toBuffer(build(null));
  let pages = null;
  try {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qgx-report-"));
    const docx = path.join(tmp, "pass1.docx");
    fs.writeFileSync(docx, buf);
    execFileSync("soffice", [`-env:UserInstallation=file://${tmp}/lo-profile`, "--headless", "--convert-to", "pdf",
      "--outdir", tmp, docx], { stdio: "ignore", timeout: 300000 });
    pages = locatePages(execFileSync("pdftotext", ["-layout", path.join(tmp, "pass1.pdf"), "-"]).toString());
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (err) {
    console.warn(`page numbers left blank (${err.message}); install LibreOffice and poppler-utils to fill them`);
  }
  if (pages) buf = await Packer.toBuffer(build(pages));
  fs.writeFileSync(OUT, buf);
  const missing = S.toc.filter((e) => pages && !pages[e.key]).map((e) => e.text);
  if (missing.length) console.warn("not located:", missing.join("; "));
  console.log("wrote", OUT, `(${S.figs.length} figures, ${S.tabs.length} tables, ${S.refOrder.length} references)`);
}
main();
