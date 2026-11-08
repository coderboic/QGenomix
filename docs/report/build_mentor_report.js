// QGenomix final reports in the Thapar capstone format: cover, abstract, declaration, acknowledgement, contents,
// lists, chapters 1-6, references and a remarks page. One source builds both versions, so their format cannot drift:
//
//   node build_mentor_report.js            final mentor evaluation report
//   node build_mentor_report.js --panel    final panel evaluation report (changes since the mentor evaluation,
//                                          the final demonstration and future scope, and a page for the panel)
//   cd docs/report && npm install && npm run build      both
//
// Every number in the text is read from results/ (and bundle/meta.json when present), so the report always
// matches the experiments. The contents and the two lists are real Word fields built from the Heading styles and
// the caption numbers: References > Update Table (or right click > Update Field) rebuilds them. Figure and table
// numbers are SEQ fields and the mentions in the text are REF fields to them. The page numbers stored in the fields
// come from a first rendering pass with LibreOffice and pdftotext, and Word refreshes them when the file is opened.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  AlignmentType, Bookmark, BorderStyle, BuilderElement, Document, Footer, HeadingLevel, ImageRun, InternalHyperlink,
  LeaderType, LevelFormat, NumberFormat, Packer, PageNumber, Paragraph, Run, ShadingType, Tab, Table, TableCell,
  TableOfContents, TableRow, TabStopType, TextRun, VerticalAlign, WidthType,
} = require("docx");

const ROOT = path.resolve(__dirname, "../..");
const PANEL = process.argv.includes("--panel");
const EVALUATION = PANEL ? "Final Panel Evaluation" : "Final Mentor Evaluation";
const OUT = path.resolve(process.argv.slice(2).find((a) => !a.startsWith("--")) ||
  path.join(ROOT, PANEL ? "QGenomix_Final_Panel_Evaluation_Report.docx" : "QGenomix_Final_Mentor_Evaluation_Report.docx"));
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
const dLean = settings.map((s) => 100 * (e12[s].lean_capture_genetic - e12[s].lean_capture_idrs));
const depthMean = (form, depth) => {
  const v = T.e7.problems.flatMap((p) => p.runs).filter((r) => r.formulation === form && r.depth === depth)
    .map((r) => r.ideal.approx_ratio);
  return v.reduce((x, y) => x + y, 0) / v.length;
};
const e14 = T.e14, e15 = T.e15.summary;
const a14 = (k) => e14.auc[k][0];
const e0raw = R("e0_data.json");
const pearson = (x, y) => {
  const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length, mx = mean(x), my = mean(y);
  const sxy = x.reduce((a, v, i) => a + (v - mx) * (y[i] - my), 0);
  return sxy / Math.sqrt(x.reduce((a, v) => a + (v - mx) ** 2, 0) * y.reduce((a, v) => a + (v - my) ** 2, 0));
};
const eafR = pearson(e0raw.eaf_real_sas, e0raw.eaf_mosaic);

const pyFiles = fs.readdirSync(path.join(ROOT, "src/qgenomix"), { recursive: true }).filter((f) => f.endsWith(".py"));
const srcLines = pyFiles.reduce((n, f) =>
  n + fs.readFileSync(path.join(ROOT, "src/qgenomix", f), "utf8").split("\n").length - 1, 0);
const nScripts = fs.readdirSync(path.join(ROOT, "scripts")).filter((f) => f.endsWith(".py")).length;
const nTests = fs.readdirSync(path.join(ROOT, "tests")).filter((f) => f.endsWith(".py"))
  .reduce((n, f) => n + (fs.readFileSync(path.join(ROOT, "tests", f), "utf8").match(/^def test_/gm) || []).length, 0);

// ---------------------------------------------------------------- references (numbered in order of first citation)
const REFS = JSON.parse(fs.readFileSync(path.join(__dirname, "references.json"), "utf8")); // APA, see build_references.py

const ABBREVIATIONS = [
  ["API", "Application Programming Interface"], ["AUC", "Area Under the ROC Curve"], ["BMI", "Body-Mass Index"],
  ["CI", "Continuous Integration"], ["CV", "Cross-Validation"], ["CZ", "Controlled-Z (quantum gate)"],
  ["D-PRISM", "South Asian-trained multi-ancestry polygenic score for type 2 diabetes (PGS005373–7)"],
  ["EDR@K", "Epistasis Detection Rate at K"], ["GRCh37", "Genome Reference Consortium human genome build 37"],
  ["GWAS", "Genome-Wide Association Study"], ["HWE", "Hardy–Weinberg Equilibrium"],
  ["IDRS", "Indian Diabetes Risk Score"], ["LD", "Linkage Disequilibrium"], ["LNS", "Large-Neighbourhood Search"], ["LR", "Logistic Regression"],
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
const FIG_ORDER = ["bmi", "lean_world", "arch", "flow", "circuit", "app_summary", "app_mech", "app_whatif",
  "e0_pca", "e0_freq", "e0_prs", "phenotype", "e1", "e8", "e2", "e3", "e4", "e5", "e14", "e14_qubit", "e7", "e7b",
  "e15", "e9", "e11",
  "e12_auc", "e12_lean", "e13_error", "e13_flagged", "e10"];
const TAB_ORDER = ["burden", "lit", "fr", "cost", "risk", "wbs", "tools", "changes", ...(PANEL ? ["since_mentor"] : []),
  "stages", "experiments", "models", "selection", "lns", "fairness", "problems", "objectives",
  ...(PANEL ? ["demo"] : ["panel", "schedule"])];
const numberOf = (order, label) => {
  const i = order.indexOf(label);
  if (i < 0) throw new Error(`unknown label ${label}`);
  return i + 1;
};
const F = (label) => { numberOf(FIG_ORDER, label); return `⟦f:${label}⟧`; };
const TB = (label) => { numberOf(TAB_ORDER, label); return `⟦t:${label}⟧`; };

// ---------------------------------------------------------------- build state (reset for every pass)
let S;
function resetState(pages) {
  S = { pages, toc: [], figs: [], tabs: [], refOrder: [], figNo: 0, tabNo: 0, lists: 0 };
}
const cite = (...keys) => `[${keys.map((k) => {
  if (!REFS[k]) throw new Error(`unknown reference ${k}`);
  if (!S.refOrder.includes(k)) S.refOrder.push(k);
  return `⟦c:${k}:${S.refOrder.indexOf(k) + 1}⟧`;
}).join(", ")}]`;
const refYear = (k) => `${cite(k)} (${REFS[k].year})`; // "[12] (2026)", as in the literature table
const pageOf = (key) => (S.pages ? S.pages[key] || "" : "00");

// ---------------------------------------------------------------- Word fields, written the way Word writes them
const fldChar = (type) => new BuilderElement({ name: "w:fldChar",
  attributes: { type: { key: "w:fldCharType", value: type } } });
const instrText = (code) => new BuilderElement({ name: "w:instrText",
  attributes: { space: { key: "xml:space", value: "preserve" } }, children: [` ${code} `] });
const field = (code, cached, props = {}) => new Run({ ...props,
  children: [fldChar("begin"), instrText(code), fldChar("separate"), cached, fldChar("end")] });
// a mention of a figure or a table; MERGEFORMAT keeps the text style when Word refreshes it
const mention = (id, text, props) => field(`REF ${id} \\h \\* MERGEFORMAT`, text, props);

// ---------------------------------------------------------------- text helpers: **bold**, ^{sup}, _{sub}, `code`
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\^\{[^}]+\}|_\{[^}]+\}|`[^`]+`|⟦[^⟧]+⟧)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(new TextRun({ ...base, text: tok.slice(2, -2), bold: true }));
    else if (tok.startsWith("^{")) out.push(new TextRun({ ...base, text: tok.slice(2, -1), superScript: true }));
    else if (tok.startsWith("_{")) out.push(new TextRun({ ...base, text: tok.slice(2, -1), subScript: true }));
    else if (tok.startsWith("⟦")) {
      const [kind, id, n] = tok.slice(1, -1).split(":");
      if (kind === "c") out.push(new InternalHyperlink({ anchor: `ref_${id}`, children: [new TextRun({ ...base, text: n })] }));
      else if (kind === "f") out.push(mention(`fig_${id}`, `Figure ${numberOf(FIG_ORDER, id)}`, base));
      else out.push(mention(`tab_${id}`, `Table ${numberOf(TAB_ORDER, id)}`, base));
    } else out.push(new TextRun({ ...base, text: tok.slice(1, -1), font: "Consolas", size: (base.size || 24) - 3 }));
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}
// the same text with no markup, for the entries of the two lists
const plain = (text) => text.replace(/⟦c:[^:]+:(\d+)⟧/g, "$1").replace(/\*\*|`/g, "").replace(/[\^_]\{([^}]+)\}/g, "$1");
const P = (text, o = {}) => new Paragraph({
  alignment: o.align ?? AlignmentType.JUSTIFIED, keepNext: o.keepNext, indent: o.indent,
  spacing: { after: o.after ?? 120, before: o.before ?? 0, line: o.line ?? 276 }, children: runs(text, o.run || {}),
});
const C = (text, run = {}, after = 80) => new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { after, line: 276 }, children: runs(text, run),
});
const mark = (text, key, level) => { // a heading with the bookmark its contents entry links to
  const id = `_Toc${100000 + S.toc.length}`;
  S.toc.push({ level, text, key, id });
  return [new Bookmark({ id, children: [new TextRun(text)] })];
};
const FRONT = (text) => new Paragraph({ // centred front-matter title (ABSTRACT, DECLARATION, ...), starts a new page
  heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, pageBreakBefore: true,
  children: mark(text, `front:${text}`, 0) });
const H1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true,
  children: mark(text, `h:${text}`, 1) });
const H2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true,
  children: mark(text, `h:${text}`, 2) });
const H3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, keepNext: true, children: [new TextRun(text)] });
// Bullets for a few items in no particular order; (i), (ii), ... for a sequence, for items referred to elsewhere, and
// for any list of more than four items.
const bullets = (items) => items.map((t) => new Paragraph({
  numbering: { reference: "bullets", level: 0 }, alignment: AlignmentType.JUSTIFIED, spacing: { after: 80, line: 276 },
  children: runs(t),
}));
const enumerated = (items) => {
  const instance = ++S.lists;
  return items.map((t) => new Paragraph({
    numbering: { reference: "roman", level: 0, instance }, alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 80, line: 276 }, children: runs(t),
  }));
};
const list = (items) => (items.length > 4 ? enumerated(items) : bullets(items));
const ROMAN = ["(i)", "(ii)", "(iii)", "(iv)", "(v)", "(vi)", "(vii)", "(viii)", "(ix)", "(x)"];

// ---------------------------------------------------------------- tables
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "8A9AA4" };
const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE };
function cell(text, width, { header = false, align = AlignmentType.LEFT, shade, borders = BORDERS, size = 21,
  pad = 60, keepNext = false } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA }, borders, verticalAlign: VerticalAlign.CENTER,
    shading: header ? { fill: "DCE5EA", type: ShadingType.CLEAR, color: "auto" }
      : shade ? { fill: shade, type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: pad, bottom: pad, left: 100, right: 100 },
    children: String(text).split("\n").map((line) => new Paragraph({
      alignment: align, keepNext, spacing: { after: 0, line: 250 },
      children: runs(line, { size, bold: header || undefined }),
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
        children: headers.map((h, i) => cell(h, widths[i], { header: true, align: aligns[i], borders, size: o.size,
          keepNext: true })) })] : []),
      ...rows.map((r, row) => new TableRow({ cantSplit: true, children: r.map((t, i) => cell(t, widths[i], {
        align: aligns[i], borders, size: o.size, pad: o.pad,
        keepNext: Boolean(headers) && (o.whole ? row < rows.length - 1 : row < 2), // header + first rows, or all
        shade: o.shadeFirst && i === 0 ? "F3F6F8" : undefined })) })),
    ],
  });
}
// "Figure 3: ..." with a SEQ field for the number; the bookmark around "Figure 3" is what the mentions refer to
const captionRuns = (kind, id, n, text) => [
  new Bookmark({ id, children: [new TextRun({ text: `${kind} `, bold: true }),
    field(`SEQ ${kind} \\* ARABIC`, String(n), { bold: true })] }),
  new TextRun({ text: ": ", bold: true }), ...runs(text),
];
const tableCaption = (text, label) => {
  const n = ++S.tabNo, id = `tab_${label}`;
  if (numberOf(TAB_ORDER, label) !== n) throw new Error(`table "${label}" is number ${n}, TAB_ORDER says otherwise`);
  S.tabs.push({ n, text, id });
  return new Paragraph({ style: "Caption", keepNext: true, spacing: { before: 160, after: 80 },
    children: captionRuns("Table", id, n, text) });
};

// ---------------------------------------------------------------- figures
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
// Figures are made at 300 dpi and placed at exactly that size (96 px per inch here), never scaled, so their 12 pt
// labels print as large as the 12 pt text around them.
function figure(name, caption, label) {
  const file = path.join(ROOT, "figures", name);
  const n = ++S.figNo, id = `fig_${label}`;
  if (numberOf(FIG_ORDER, label) !== n) throw new Error(`figure "${label}" is number ${n}, FIG_ORDER says otherwise`);
  S.figs.push({ n, text: caption, id });
  const { w, h } = pngSize(file);
  if (w / 300 > CONTENT_W / 1440) throw new Error(`${name} is wider than the text`);
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 160, after: 60 },
      children: [new ImageRun({ type: "png", data: fs.readFileSync(file),
        transformation: { width: Math.round((w * 96) / 300), height: Math.round((h * 96) / 300) },
        altText: { name: label, title: plain(caption), description: plain(caption) } })] }),
    new Paragraph({ style: "Caption", alignment: AlignmentType.CENTER, spacing: { after: 200 },
      children: captionRuns("Figure", id, n, caption) }),
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
    new Paragraph({ spacing: { before: 300 }, children: [] }),
    C(TITLE[0], { bold: true, size: 32 }, 40),
    C(TITLE[1], { bold: true, size: 32 }, 160),
    C("Focus: early-onset type 2 diabetes in lean South Asians", { size: 26 }, 400),
    C("Capstone Project Report", { bold: true, size: 26 }, 80),
    C(EVALUATION, { size: 24 }, 520),
    C("Submitted by", {}, 120),
    ...TEAM.map(([, n]) => C(n, { bold: true }, 40)),
    blank(320),
    C("BE Third Year, COE"),
    C("CPG No: 218", {}, 440),
    C("Under the mentorship of"),
    C(MENTOR, { bold: true }),
    C(MENTOR_TITLE, {}, 600),
    C("Computer Science and Engineering Department", { bold: true }),
    C("Thapar Institute of Engineering and Technology, Patiala", { bold: true }, 200),
    C("November 2026"),
  ];
}

function abstractPage() {
  return [
    FRONT("ABSTRACT"),
    P(`On 10 June 2023 The Tribune reported that the ICMR-INDIAB study, published that month in The Lancet Diabetes & ` +
      `Endocrinology, had found 101 million Indians with diabetes and 136 million more with prediabetes ` +
      `${cite("tribune", "anjana")}. On 14 November 2024 ThePrint reported a study in The Lancet that placed more than a ` +
      `quarter of the world's 828 million adults with diabetes in India, 62% of them not on medication ` +
      `${cite("theprint", "ncdrisc")}. The International Diabetes Federation's Diabetes Atlas of 2025 adds that 43% of ` +
      `affected Indian adults do not know they have the disease ${cite("idf")}. South Asians also fall ill younger and ` +
      `thinner than others: a 2021 study in The Lancet Diabetes & Endocrinology found that a body-mass index (BMI) of ` +
      `23.9, which most charts call normal, carries the diabetes risk of a BMI of 30 in White people ` +
      `${cite("caleyachetty")}. Screening by body weight therefore misses lean people at high risk, and the Indian ` +
      `Diabetes Risk Score (IDRS), the questionnaire used in Indian practice, cannot see inherited risk.`),
    P(`QGenomix is a quantum-classical hybrid framework built to find these people. It asks how much polygenic risk ` +
      `scores add to clinical screening for South Asians, and whether genetic variants from two diabetes mechanisms, ` +
      `insulin production (β-cell) and fat distribution (lipodystrophy), interact. It uses the real genotypes of all ` +
      `2,504 people in the 1000 Genomes Project, the South Asian-trained D-PRISM score, five published mechanism scores ` +
      `and 10,000 synthetic South Asians built from real haplotypes, with simulated outcomes so that every discovery can ` +
      `be checked against a known truth. Gene pairs are scored with a vectorised test, a non-redundant set is chosen by ` +
      `a QUBO solved with simulated annealing and with the Quantum Approximate Optimisation Algorithm (QAOA), and the ` +
      `chosen pairs are encoded by an 8-qubit variational circuit. Seventeen predictors are compared in seventeen ` +
      `experiments, and every quantum component faces a matched classical control.`),
    P(`Genetic scores raise the AUC of clinical screening from ${f3(auc("M3c_clinical"))} to ${f3(auc("M3_additive"))} ` +
      `and nearly double the share of lean diabetes cases caught in the top 20% of risk (IDRS ${pc(lean("M0_idrs"))}, ` +
      `genetic model ${pc(lean("M3_additive"))}); the result holds in ${nAucWin} of ${nSet} alternative simulator ` +
      `settings and in all five South Asian populations of 1000 Genomes. The interaction search recovers 70–84% of ` +
      `planted gene pairs, against 40–48% for PLINK's BOOST. On an outcome made only of gene–gene interaction, the ` +
      `entangled circuit reaches AUC ${f3(a14("vqc"))} against ${f3(a14("noent"))} without entanglement, and 12-qubit ` +
      `QAOA circuits make the full 48-of-200 pair selection as well as simulated annealing; no quantum speed-up is ` +
      `claimed, and error mitigation recovers most of the quality lost to hardware noise. The work is ` +
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

// The three contents pages are live Word fields: Update Table rebuilds them from the headings and the captions. The
// entries stored here are what a reader sees before that, with a real tab before each right-aligned page number.
class Contents extends TableOfContents {
  getTabStopsForLevel() {
    return [{ type: TabStopType.RIGHT, position: CONTENT_W, leader: LeaderType.DOT }];
  }
}
function contentsPages() {
  return [
    new Paragraph({ style: "ContentsTitle", pageBreakBefore: true, children: [new TextRun("TABLE OF CONTENTS")] }),
    new Contents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2", hideTabAndPageNumbersInWebView: true,
      beginDirty: false,
      cachedEntries: S.toc.map((e) => ({ title: e.text, level: e.level === 2 ? 2 : 1, page: pageOf(e.key), href: e.id })) }),
  ];
}
function listPage(title, items, kind) {
  return [
    FRONT(title),
    new Contents(title, { hyperlink: true, captionLabelIncludingNumbers: kind, hideTabAndPageNumbersInWebView: true,
      beginDirty: false,
      cachedEntries: items.map((it) => ({ title: `${kind} ${it.n}: ${plain(it.text)}`, level: 3,
        page: pageOf(`${kind.toLowerCase()}:${it.n}`), href: it.id })) }),
  ];
}
function abbreviationsPage() {
  return [
    FRONT("LIST OF ABBREVIATIONS"),
    table(null, ABBREVIATIONS.map(([a, b]) => [a, b]), [2000, 7386], { borderless: true, size: 22, pad: 25 }),
  ];
}

// =====================================================================
// CHAPTER 1: INTRODUCTION (the problem only; the solution starts in Chapter 3)
// =====================================================================
function chapter1() {
  return [
    H1("CHAPTER 1: INTRODUCTION"),
    H2("1.1 The Scale of the Problem"),
    P(`India has more people with diabetes than any other country. The ICMR-INDIAB study tested 113,043 people across ` +
      `the country and found 101 million Indians with diabetes, 11.4% of adults, and another 136 million with ` +
      `prediabetes, 15.3% ${cite("anjana")}. The Tribune carried the finding on 10 June 2023 ${cite("tribune")}. Taken ` +
      `together, more than one Indian adult in four either has the disease or is on the way to it.`),
    P(`The global picture is just as stark. The NCD Risk Factor Collaboration pooled 1,108 population studies in The ` +
      `Lancet and counted 828 million adults with diabetes in the world in 2022. More than a quarter of them, 212 ` +
      `million, lived in India ${cite("ncdrisc")}, and ThePrint reported on 14 November 2024 that 62% of them were not ` +
      `on medication ${cite("theprint")}. The International Diabetes Federation, counting adults aged 20 to 79, ` +
      `estimates 89.8 million Indians with diabetes in 2024 and 156.7 million by 2050, and says that 43% of those ` +
      `affected do not know they have it ${cite("idf")}.`),
    P(`These counts differ because the studies use different age ranges, blood tests and statistical methods, but ` +
      `they agree on the message: the disease is vast, it is growing, and much of it is hidden. ${TB("burden")} ` +
      `gathers the numbers and their sources.`),
    tableCaption("Diabetes in India in numbers", "burden"),
    table(["Measure", "Number", "Source"], [
      ["Indians with diabetes", "101 million", `ICMR-INDIAB ${cite("anjana")}; The Tribune, 10 June 2023 ${cite("tribune")}`],
      ["Indians with prediabetes", "136 million", `ICMR-INDIAB ${cite("anjana")}`],
      ["Adults with diabetes worldwide, 2022, more than 1 in 4 of them in India", "828 million", `The Lancet ${cite("ncdrisc")}; ThePrint, 14 November 2024 ${cite("theprint")}`],
      ["Indians with diabetes not on medication", "62%", `ThePrint, 14 November 2024 ${cite("theprint")}`],
      ["Indian adults who do not know they have diabetes", "43%", `IDF Diabetes Atlas, 2025 ${cite("idf")}`],
      ["Indian adults with diabetes expected by 2050", "156.7 million", `IDF Diabetes Atlas, 2025 ${cite("idf")}`],
    ], [4200, 1700, 3486], { shadeFirst: true }),

    H2("1.2 Diabetes Without Obesity"),
    P(`The usual picture of a person with type 2 diabetes (T2D) is someone overweight. In South Asia that picture leaves ` +
      `out a great many people. A study of 1.47 million people in England asked which body-mass index (BMI) carries the ` +
      `same risk of T2D as a BMI of 30 in White people ${cite("caleyachetty")}. ${F("bmi")} shows the answer. For Black, ` +
      `Chinese and Arab people the equal-risk BMI lies between 26 and 28. For South Asians it is 23.9. A South Asian ` +
      `whom most charts call normal weight already carries the diabetes risk of a White person called obese.`),
    ...figure("fig_intro_bmi.png", `BMI at which each group has the T2D risk of a White person at BMI 30 ${cite("caleyachetty")}`, "bmi"),
    P(`The same gap appears when people of normal weight are compared directly. ${F("lean_world")} sets adults in ` +
      `Chennai beside White adults in the United States ${cite("gujral")}. Among normal-weight men, 23.5% in Chennai ` +
      `have diabetes against 6.1% in the United States; among normal-weight women the figures are 13.6% and 2.8%. A ` +
      `normal-weight Indian man is almost four times as likely to have diabetes as his American counterpart, and a ` +
      `normal-weight Indian woman almost five times.`),
    ...figure("fig_intro_lean.png", `Diabetes among normal-weight adults in Chennai and the United States ${cite("gujral")}`, "lean_world"),
    P(`The disease also arrives earlier. Among people with young-onset diabetes, 24–39% of Asian Indians had a normal ` +
      `BMI against 9.3% of White Europeans (normal meant below 23 for Indians and below 25 for Europeans), and the ` +
      `Indians had weaker insulin-producing β-cells ${cite("siddiqui")}. This pattern of early disease at low body ` +
      `weight is often called the lean or thin-fat phenotype ${cite("narayan")}.`),

    H2("1.3 Why Current Screening Misses Them"),
    P(`Two tools decide who gets tested. The first is body weight: a rule based on BMI cannot flag a lean person, by ` +
      `definition. The second is the Indian Diabetes Risk Score (IDRS), four questions on age, waist, physical activity ` +
      `and family history ${cite("mohan")}. At its usual cut-off of 60 it finds 72.5% of undiagnosed diabetes and wrongly ` +
      `flags about 40% of people without it. A young, slim person earns few points on it by design, and family history ` +
      `is only a rough shadow of inherited risk.`),
    P(`The result is a blind spot. The people most likely to be told they are safe are the people described above: ` +
      `young, slim and South Asian. Someone who is not flagged is not tested.`),

    H2("1.4 The Inherited Risk Nobody Measures"),
    P(`Much of this risk is written in the genome. Among British South Asians, people with high genetic risk on both ` +
      `insulin deficiency and lipodystrophy (a fat-distribution mechanism) were diagnosed 8.2 years earlier, at a BMI 3 ` +
      `kg/m² lower ${cite("hodgson")}. Such a person looks healthy on every measure used in screening today. Four gaps ` +
      `keep this information out of screening:`, { keepNext: true }),
    ...bullets([
      `South Asians are missing from the data: they were only 2% of the 2.5 million people in the latest multi-ancestry genetic study ${cite("hodgson")}, so most risk scores were not built for them.`,
      "Polygenic scores add up the effects of variants one at a time. Whether diabetes mechanisms amplify each other in South Asians is not known.",
      "We found no study that measures what genetics adds to India's own screening questionnaire for lean people in particular.",
      "Consumer DNA tests measure only about half of the variants in modern scores, so people who hold such a file still cannot get a reliable score from it.",
    ]),

    H2("1.5 Why It Is Worth Solving"),
    P(`Type 2 diabetes is not fate. In the Indian Diabetes Prevention Programme, lifestyle change lowered progression to ` +
      `diabetes by about 28% in people with impaired glucose tolerance ${cite("ramachandran")}, and The Tribune quoted the ` +
      `head of the ICMR saying that 60% of diabetes is reversible ${cite("tribune")}. But prevention only reaches people ` +
      `who know they need it. A lean person diagnosed eight years early also lives with the disease eight years longer, ` +
      `through their most productive years, and India already spends more than USD 9.8 billion a year on diabetes ` +
      `${cite("idf")}. Each person found before the disease begins is someone who can act while action is still cheap ` +
      `and effective.`),

    H2("1.6 Problem Definition and Scope"),
    P("The problem can now be stated precisely: how can lean South Asians at high risk of T2D be found early, before " +
      "current screening would notice them, from information that is cheap to collect? It breaks into three questions:",
    { keepNext: true }),
    ...bullets([
      "How much does genetic information add to the clinical screening used in India, above all for lean people?",
      "Do genetic variants from different diabetes mechanisms interact, or do they only add up?",
      "Can a partial consumer DNA file give a person a reliable risk report that they can understand?",
    ]),
    P("The work covers type 2 diabetes in adults of South Asian ancestry. It is a research study with a working " +
      "prototype, not a medical device, and it does not diagnose anyone.", { before: 60 }),

    H2("1.7 Organisation of the Report"),
    P("Chapter 2 surveys the literature and sets out the requirements. Chapter 3 presents the proposed solution, " +
      "Chapter 4 its design and working prototype, Chapter 5 the experimental results, and Chapter 6 the conclusions."),
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
    P(`PLINK ${cite("plink")} is the standard toolset for genotype quality control and polygenic scoring, and BOOST ` +
      `${cite("wan")} made exhaustive pairwise interaction screening fast. Polygenic scores are distributed through the ` +
      `PGS Catalog ${cite("lambert")}. Clinical screening in India uses the IDRS questionnaire ${cite("mohan")}. Missing ` +
      `genotypes are normally filled by imputation servers that use reference haplotypes ${cite("marchini", "browning")}. ` +
      `Quantum software frameworks (Qiskit, PennyLane) make circuits easy to build and simulate, but no existing system ` +
      `joins these pieces into one benchmarked pipeline for South Asian diabetes screening.`),
    H3("2.1.3 Literature Survey Table"),
    P(`${TB("lit")} summarises the studies closest to this work, in the order of the problem: who is at risk, how ` +
      `genetics predicts it, how interactions are found, and what quantum and supporting methods offer.`),
    tableCaption("Literature survey", "lit"),
    table(["Sr.", "Ref.", "Method", "Highlights", "Limitation"], [
      ["1", refYear("caleyachetty"), "Cohort of 1.47 million people in England", "BMI 23.9 in South Asians carries the T2D risk of BMI 30 in White people", "English data; no genetic information"],
      ["2", refYear("gujral"), "CARRS and NHANES surveys compared", "Diabetes in normal-weight men: 23.5% in Chennai, 6.1% in the United States", "Cross-sectional; cannot say who will develop diabetes"],
      ["3", refYear("mohan"), "Indian Diabetes Risk Score", "Four questions find 72.5% of undiagnosed diabetes at a cut-off of 60", "No genetic information; scores young, slim people low"],
      ["4", refYear("hodgson"), "Genetic study of British South Asians", "High risk on two mechanisms brings diagnosis 8.2 years earlier at a lower BMI", "Association study; no screening tool built"],
      ["5", refYear("khera"), "Genome-wide PRS, UK Biobank", "A few percent of people have risk equal to monogenic mutations, including for T2D", "Mostly European ancestry; additive only"],
      ["6", refYear("udler"), "Soft clustering of T2D loci", "T2D variants split into five mechanism clusters (two β-cell, three insulin resistance)", "European-centred; no interaction tested"],
      ["7", refYear("ruan"), "PRS-CSx", "Combining studies of several ancestries improves PRS accuracy in non-European groups", "Additive; needs ancestry-matched tuning"],
      ["8", refYear("mahajan"), "Multi-ancestry T2D association study", "Diverse populations increase discovery and improve PRS transfer", "South Asian samples still a minority"],
      ["9", refYear("cordell"), "Review of interaction methods", "Compares regression, exhaustive and data-mining approaches to gene–gene interaction", "Low power and heavy multiple testing at genome scale"],
      ["10", refYear("wan"), "BOOST", "Boolean genotype encoding makes exhaustive pairwise screening fast", "Approximate first stage; redundant pairs not handled"],
      ["11", refYear("hadfield"), "QAOA, constraint-preserving mixers", "Mixers such as XY keep the search inside the valid set", "Benefit on noisy hardware not established"],
      ["12", refYear("havlicek"), "Quantum feature maps", "Quantum kernels and variational classifiers run on real hardware", "Small synthetic data; no advantage on real data"],
      ["13", refYear("temme"), "Zero-noise extrapolation", "Extrapolating from amplified noise reduces the bias of noisy results", "More sampling; assumes noise scales predictably"],
      ["14", refYear("marchini"), "Genotype imputation", "Unmeasured variants can be predicted from reference haplotypes using LD", "Accuracy depends on panel size and ancestry"],
      ["15", refYear("lundberg"), "SHAP", "Consistent, well-founded attributions for any model", "Post hoc; attributions are not causal"],
    ], [520, 1300, 2150, 3080, 2336], { aligns: [AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.LEFT,
      AlignmentType.LEFT, AlignmentType.LEFT], size: 20 }),
    P(`Reading down the last column of ${TB("lit")} shows the common weakness. The epidemiology (rows 1 to 4) proves ` +
      `the problem but offers no screening tool. The genetic studies (rows 5 to 8) are additive and mostly European. ` +
      `The interaction methods (rows 9 and 10) struggle with power and redundancy. The quantum studies (rows 11 to 13) ` +
      `leave open whether the methods help on real problems under real noise.`, { before: 160 }),
    H3("2.1.4 Problem Identified"),
    P("Existing work treats polygenic risk as additive, studies interactions without handling redundancy, reports " +
      "quantum methods without classical controls or noise, and offers no way to turn a partial consumer DNA file into " +
      "a reliable report for South Asians. QGenomix addresses all four in one benchmarked, reproducible system."),
    H3("2.1.5 Survey of Tools and Technologies Used"),
    P(`The project builds on established open-source tools: PLINK for genomic data, the scientific Python stack for ` +
      `statistics, scikit-learn and XGBoost for classical models, PyTorch, PennyLane and Qiskit for quantum circuits, ` +
      `SHAP for explanations, and FastAPI, Streamlit and Docker for the application. ${TB("tools")} in Chapter 3 lists ` +
      `each with its version and purpose.`),
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
    P(`${TB("fr")} lists the functional requirements and the module that implements each one.`),
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
    ], [700, 5700, 2986], { shadeFirst: true }),
    H3("2.2.4 External Interface Requirements"),
    ...bullets([
      "User interfaces: a Streamlit dashboard (report, clinician view, research results, model card) and a downloadable PDF.",
      "Software interfaces: a REST API (`POST /v1/profile`, `POST /v1/report.pdf`) with OpenAPI documentation; PLINK binaries; Qiskit IBM Runtime for hardware runs.",
      "Hardware interfaces: a laptop with 16 GB of memory runs everything; IBM quantum processors are reached through the cloud.",
    ]),
    H3("2.2.5 Non-functional Requirements"),
    ...bullets([
      "Performance: a report from a 46 MB genome file in about 10 seconds; what-if updates in under a second; the full research pipeline in about three hours on 16 cores.",
      "Safety: every report states that it is a research prototype trained on simulated outcomes and is not a diagnosis.",
      "Security and privacy: uploaded files are processed in memory and never stored or logged; API keys are never kept in the repository; the container runs as a non-root user.",
      `Reliability and portability: ${nTests} automated tests on every push; one Docker image runs the dashboard and the API on any operating system.`,
    ]),
    H2("2.3 Cost Analysis"),
    P(`The project runs entirely on public data and open-source software, so its direct cost is zero (${TB("cost")}). ` +
      `The real costs are the team's time and the 10 free quantum minutes a month, which limit how much can run on ` +
      `hardware.`),
    tableCaption("Cost analysis", "cost"),
    table(["Item", "Source", "Cost"], [
      ["Genotype data", "1000 Genomes Project, public", "Free"],
      ["Polygenic scores", "PGS Catalog, public", "Free"],
      ["Software", `Open-source libraries and tools (${TB("tools")})`, "Free"],
      ["Computing", "Team laptops", "No additional cost"],
      ["Quantum hardware", "IBM Quantum Open Plan, 10 QPU minutes per 28 days", "Free"],
      ["Code hosting and CI", "GitHub", "Free"],
      ["Public demo hosting", "Free tier of a container host", "Free"],
      ["Total", "", "₹0"],
    ], [3000, 4186, 2200], { shadeFirst: true }),
    H2("2.4 Risk Analysis"),
    P(`${TB("risk")} lists the main project risks. The largest is that outcomes are simulated, which is why the ` +
      `conclusions are tested under thirteen simulator settings and why validation on real patients heads the future ` +
      `work.`),
    tableCaption("Risk analysis", "risk"),
    table(["Risk", "Likelihood", "Impact", "Mitigation"], [
      ["Simulated outcomes do not match real disease biology", "High", "High", "Real genotypes and published weights; robustness across 13 simulator settings (E12); validation on a real Indian cohort planned"],
      ["Hardware noise destroys QAOA quality", "High", "Medium", "Constraint-preserving mixer; error mitigation (E7b); rehearsal on the IBM noise model"],
      ["Partial consumer DNA files bias the reported risk", "High", "Medium", "LD imputation (E13) and a coverage warning in every report"],
      ["Data leakage inflates accuracy", "Medium", "High", "All selection and fitting inside each cross-validation fold; untouched 20% test set"],
      ["Memory limits with 84 million variants", "Medium", "Medium", "Extract only target variants; chunked processing with memory caps"],
      ["Results differ between machines", "Low", "Medium", "Fixed seeds, configuration hash, tightened solver tolerance, continuous integration"],
      ["The app is mistaken for a diagnostic tool", "Low", "High", "Disclaimer on every report; model card; research-prototype labelling"],
    ], [2350, 1300, 1050, 4686], { aligns: [AlignmentType.LEFT, AlignmentType.CENTER, AlignmentType.CENTER, AlignmentType.LEFT] }),
  ];
}

// =====================================================================
// CHAPTER 3: METHODOLOGY ADOPTED (the solution starts here)
// =====================================================================
function chapter3() {
  return [
    H1("CHAPTER 3: METHODOLOGY ADOPTED"),
    H2("3.1 Proposed Solution"),
    P("Chapter 1 ended with three questions. QGenomix answers them with one reproducible system that joins real " +
      "genotypes, published risk scores and the IDRS questionnaire, and delivers the result as a risk report that a " +
      "person can read. It also asks a fourth question: where can quantum computing help? Section 3.2 explains the " +
      "two steps where it is used and why."),
    P(`${F("arch")} shows the system. Three inputs feed eight stages that run in order; the two purple stages use ` +
      `quantum circuits and the last stage is the application a person actually sees.`),
    ...figure("fig_architecture.png", "The QGenomix system: three inputs, eight stages, two of them quantum (purple)", "arch"),
    P("The eight stages are:", { after: 60, keepNext: true }),
    ...enumerated([
      "Data preparation: quality control of 1000 Genomes, principal components, D-PRISM and mechanism scores, a haplotype library and an LD panel.",
      "Cohort and simulator: synthetic South Asians as haplotype mosaics, with clinical factors, the IDRS and simulated T2D.",
      "Interaction search: a vectorised score test for all 1,263 cross-mechanism SNP pairs, inside each cross-validation fold.",
      "Pair selection: a QUBO of relevance minus redundancy, solved by simulated annealing and by QAOA with error mitigation.",
      "Quantum encoder: 12 eight-qubit circuits encode the 48 selected pairs into 96 features.",
      "Model zoo: 17 predictors, from the IDRS and a BMI rule to a stacked hybrid.",
      "Evaluation: seventeen experiments (E0–E15) with DeLong, McNemar and Holm-corrected tests.",
      "Application: a calibrated model behind a dashboard, a REST API and a PDF report, with LD imputation.",
    ]),
    P("Chapter 4 gives the design of these stages and Chapter 5 their results.", { before: 60 }),
    H2("3.2 Why Quantum Computing"),
    P("Quantum computing is used at two steps because the problem itself has the shape of what quantum hardware does " +
      "natively. A third reason is practical:", { after: 60, keepNext: true }),
    ...bullets([
      `Interaction is what entanglement represents. The scientific question is gene–gene interaction: whether two ` +
        `variants together change risk more than each alone. In the encoder the two SNPs of a candidate pair sit on two ` +
        `qubits joined by a CZ gate, so each measured feature can depend on both SNPs; without entanglement a qubit can ` +
        `only ever report its own SNP ${cite("perez", "havlicek")}.`,
      `Pair selection is a native quantum optimisation problem. Choosing 48 of 200 candidates while penalising overlap ` +
        `has about 10^{47} possible answers. As a QUBO it maps directly onto an Ising energy, which QAOA and quantum ` +
        `annealers minimise ${cite("lucas", "farhi")}.`,
      "The circuits are sized for today's hardware. The encoder needs 8 qubits and each QAOA step 12, within what " +
        "current IBM processors run, so the same circuits move from the simulator to hardware unchanged.",
    ]),
    P("Quantum claims are easy to overstate, so each step faces a matched classical control. Two experiments then " +
      "measure what the quantum part adds: E14 removes entanglement on an outcome built only from gene–gene " +
      "interaction, and E15 lets 12-qubit QAOA make the full pair selection against random sampling and simulated " +
      "annealing (Section 5.6).", { before: 60 }),
    H2("3.3 Approved Objectives"),
    P("The objectives approved at the mid-semester evaluation were:", { after: 60, keepNext: true }),
    ...enumerated([
      "Build a complete genomic data pipeline: QC, SNP selection, pair ranking and label generation.",
      "Design and implement a variational quantum circuit encoder that produces interaction features for SNP pairs.",
      "Train classical baselines (LR, RF, XGBoost, SVM) and compute a PRS as a clinical reference.",
      "Build a hybrid stacking ensemble integrating quantum features, PRS and classical predictions.",
      "Implement an adaptive SHAP-guided loop that refines the gene-pair selection.",
      "Benchmark all models on a held-out test set using AUC-ROC, F1 and EDR@K, with DeLong and McNemar tests.",
    ]),
    P(`${TB("objectives")} in Chapter 6 reports the status of each objective.`, { before: 60 }),
    H2("3.4 Investigative Techniques"),
    P("QGenomix uses four complementary techniques:", { after: 60, keepNext: true }),
    ...bullets([
      "Comparison: all 17 predictors are trained on identical splits and scored with identical metrics.",
      "Simulation with ground truth: outcomes come from a known model with planted interactions, so discovery and calibration can be checked exactly.",
      "Ablation: each quantum component is compared with the same component without its quantum ingredient (annealing instead of QAOA, the circuit without entanglement, a classical network of similar size).",
      "External checks: models trained on synthetic people are tested on real genomes of five ancestries, on each South Asian population, and under thirteen alternative simulator settings.",
    ]),
    H2("3.5 Novelty of Work"),
    P("The work is new in six ways:", { after: 60, keepNext: true }),
    ...enumerated([
      "It tests for interaction between published T2D mechanism scores on real South Asian haplotypes, and measures the value of genetics for lean people against India's own screening questionnaire.",
      "It poses gene-pair selection as a QUBO with an SNP-overlap redundancy term and solves it with a constraint-preserving QAOA started from a Dicke state, then measures it under realistic noise with error mitigation.",
      "It gives every quantum component a matched classical control.",
      "It introduces two task-specific metrics: EDR@K for interaction discovery and lean-case capture for screening.",
      "It builds an LD imputation panel from South Asian reference genomes so that partial consumer DNA files give reliable reports.",
      "It measures what the quantum parts contribute: entanglement is what lets the circuit capture gene–gene interaction, and hardware-sized QAOA makes the full pair selection through decomposition.",
    ]),
    H2("3.6 Assumptions and Constraints"),
    P("The results should be read with these assumptions in mind:", { after: 60, keepNext: true }),
    ...enumerated([
      `Disease outcomes are simulated with known ground truth, using a liability-threshold model calibrated to Indian prevalence ${cite("anjana")}; genotypes, allele frequencies, linkage and polygenic weights are real.`,
      "Synthetic cohorts are mosaics of real South Asian haplotypes in one-megabase blocks, which keeps local linkage but removes population substructure.",
      "Genotype files are on genome build GRCh37 and the forward strand, as 23andMe and AncestryDNA files are; other builds are rejected.",
      "Quantum hardware access is limited to IBM's free Open Plan (10 QPU minutes per 28 days), so most quantum results come from exact and noisy simulators.",
      "All computation runs on a 16-core laptop with 14 GB of memory; large steps are chunked to fit.",
    ]),
    H2("3.7 Standards"),
    P("The project follows these standards:", { after: 60, keepNext: true }),
    ...enumerated([
      "Genomic quality control follows PLINK 2 conventions: minor-allele frequency ≥ 1%, genotype missingness ≤ 5%, Hardy–Weinberg p > 10^{−6} in South Asians.",
      `Polygenic weights come from harmonised GRCh37 scoring files of the PGS Catalog ${cite("lambert")}; the IDRS is scored exactly as published ${cite("mohan")}.`,
      `Prediction models are reported with discrimination and calibration on held-out data, following the TRIPOD recommendations ${cite("tripod")}; a model card documents intended use, data, performance, fairness and limits.`,
      "Code follows PEP 8 (checked by ruff), is covered by automated tests run on every push, and exposes a REST API with an OpenAPI description.",
      "Every result records the hash of the configuration that produced it; fixed seeds make runs repeatable.",
    ]),
    H2("3.8 Project Outcomes and Deliverables"),
    P("The project delivers:", { after: 60, keepNext: true }),
    ...enumerated([
      "A reproducible data pipeline on real 1000 Genomes data, with the D-PRISM score, mechanism scores and a South Asian haplotype library.",
      "An outcome simulator with clinical factors and the IDRS, validated against the real population (E0).",
      "An interaction search with QUBO selection and QAOA, including error mitigation and a script for real IBM hardware.",
      "An 8-qubit variational pair encoder with its own exact simulator, and its classical controls.",
      "A model zoo of 17 predictors and seventeen experiments (E0–E15), with statistical tests.",
      "A risk-report application: dashboard, REST API, PDF report, LD imputation for consumer DNA files and a Docker image.",
      `A test suite of ${nTests} automated tests with continuous integration, a model card, and this report.`,
    ]),
    H2("3.9 Work Breakdown Structure"),
    P(`${TB("wbs")} breaks the work into eight phases. Six are complete; the seventh has been built and rehearsed and ` +
      `is kept for the final panel because it needs team accounts.`),
    tableCaption("Work breakdown and progress", "wbs"),
    table(["Phase", "Scope", "Progress", "Status"], [
      ["1", "Data pipeline on real 1000 Genomes data", "100%", "Complete"],
      ["2", "Outcome simulator, clinical factors and IDRS", "100%", "Complete"],
      ["3", "Interaction search, QUBO selection and QAOA with error mitigation", "100%", "Complete"],
      ["4", "Variational quantum encoder and its classical controls", "100%", "Complete"],
      ["5", "Classical baselines, hybrid stack and experiments E0–E15", "100%", "Complete"],
      ["6", "Application: dashboard, API, PDF, LD imputation, Docker", "100%", "Complete"],
      ["7", "Run on real IBM quantum hardware; public online demo", "Ready", "Planned for the final panel"],
      ["8", "Final report, slides and demo video", "In progress", "Ongoing"],
    ], [900, 4486, 1300, 2700], { aligns: [AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.CENTER, AlignmentType.LEFT] }),
    H2("3.10 Tools and Technology"),
    P(`${TB("tools")} lists the tools used, with the versions that produced the results in this report.`),
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
    ], [2800, 1600, 4986], { shadeFirst: true }),
    H2("3.11 Changes Since the Mid-Semester Evaluation"),
    P(`The mid-semester design was generic. ${TB("changes")} lists what changed and why; each change gives the ` +
      "project a measurable clinical outcome and a truth that can be checked."),
    tableCaption("Changes from the mid-semester plan", "changes"),
    table(["Aspect", "Mid-semester plan", "Implemented", "Reason"], [
      ["Clinical focus", "T2D in general", "Early-onset T2D in lean South Asians, compared with IDRS screening", "A specific, unmet need in India gives a measurable outcome"],
      ["Genotypes", "2,504 × 1,000 SNP matrix", "Full 1000 Genomes data; 10,000 synthetic South Asians built from real haplotypes", "Real allele frequencies and linkage; enough people to detect interactions"],
      ["Risk scores", "Literature GWAS betas (pending)", "D-PRISM South Asian PRS (1.34M variants) and 5 mechanism scores from the PGS Catalog", "Published, ancestry-matched weights"],
      ["Outcomes", "Labels with 20 hidden pairs", "Liability model: genetics, β-cell × lipodystrophy interaction, 10 planted pairs, age, sex, BMI, waist, activity, family history", "Known truth makes every discovery claim checkable"],
      ["Pair selection", "Adaptive SHAP loop", "Score test on 1,263 cross-mechanism pairs, then QUBO (annealing and QAOA)", `SHAP ranking found ${pc(edrShap)} of planted pairs, the score test ${pc(edrScore)} (E1)`],
      ["Quantum", "VQC encoder, 125 circuits", "QAOA with error mitigation; 12-circuit VQC with no-entanglement and classical-twin controls", "Controls isolate what the quantum part contributes"],
      ["Output", "Benchmark table", "Benchmark, web app with PDF report, REST API, Docker image", "Shows how the result reaches a clinician or a user"],
    ], [1400, 1800, 3486, 2700], { shadeFirst: true }),
    ...(PANEL ? sinceMentor() : []),
  ];
}

function sinceMentor() {
  return [
    H2("3.12 Changes Since the Mentor Evaluation"),
    P(`${TB("since_mentor")} lists what changed after the mentor evaluation. Most changes answer the mentor's ` +
      "feedback on the report and the slides; the two new experiments answer the question of why quantum computing is " +
      "used at all."),
    tableCaption("Changes since the mentor evaluation", "since_mentor"),
    table(["Aspect", "At the mentor evaluation", "Final", "Reason"], [
      ["Quantum evidence", "Quantum parts compared with controls on the realistic cohort only", "E14 shows entanglement is what captures gene–gene interaction; E15 shows 12-qubit QAOA can make the full pair selection", "To measure why each quantum part is there"],
      ["Introduction", "Problem, solution and quantum methods together", "The problem only, with sourced statistics; the solution starts in Chapter 3", "Mentor's feedback"],
      ["Figures", "Several panels per figure, small text", "One point per figure, drawn at print size with text as large as the body", "Mentor's feedback"],
      ["Contents and links", "Typed contents; figures and tables not always discussed", "Live Word fields for contents, lists and cross-references; every figure, table and reference discussed in the text", "Mentor's feedback"],
      ["References", "Mixed style with DOI links", "APA throughout, no DOI links; each statistic names its source and date", "Mentor's feedback"],
      ["Slides", "16 dense slides", "41 light slides, large text, a named source under every outside statistic", "Mentor's feedback"],
    ], [1500, 2350, 3536, 2000], { shadeFirst: true, whole: true }),
  ];
}

// =====================================================================
// CHAPTER 4: DESIGN SPECIFICATIONS
// =====================================================================
function chapter4() {
  return [
    H1("CHAPTER 4: DESIGN SPECIFICATIONS"),
    H2("4.1 System Architecture"),
    P(`${F("arch")} in Chapter 3 gave the overall flow. ${TB("stages")} maps each stage to the module that implements ` +
      `it and its main technique. All stages share one Python package and one configuration file, and each can be ` +
      `re-run on its own with one \`make\` command.`),
    tableCaption("Stages, code modules and techniques", "stages"),
    table(["Stage", "Module (src/qgenomix)", "Technique"], [
      ["1 Data preparation", "data", "PLINK 2 QC (MAF, HWE, missingness), PCA, PRS scoring, haplotype library (2,710 blocks), LD panel"],
      ["2 Cohort and simulator", "data.cohort, sim, clinical", "Haplotype-mosaic cohort; liability-threshold outcome model, 11% prevalence; IDRS"],
      ["3 Interaction search", "search.relevance", "Vectorised Rao score test for 1,263 pairs, refitted in every cross-validation fold"],
      ["4 Pair selection", "search.qubo, solvers, qaoa, xy_qaoa, mitigation", "QUBO of relevance minus SNP overlap; simulated annealing with swap polish; QAOA in Qiskit with error mitigation; QAOA decomposition for the full problem"],
      ["5 Quantum encoder", "quantum", "8-qubit data re-uploading circuit (RY/RZ rotations, chain of CZ gates), 4 layers, 64 shared parameters; fidelity kernel"],
      ["6 Model zoo", "models.zoo", "IDRS, BMI rule, logistic regression, random forest, SVM, XGBoost, quantum heads, quantum-kernel SVC, stacking"],
      ["7 Evaluation", "eval, pipeline", "AUC, average precision, F1, Brier, EDR@K, lean-case capture; DeLong, McNemar, Holm; E0–E15"],
      ["8 Application", "app, data.impute", "Genotype parser, LD imputation, calibrated model, FastAPI, Streamlit, PDF report, Docker"],
    ], [2100, 2300, 4986], { shadeFirst: true }),
    H2("4.2 Design Level Diagrams"),
    H3("4.2.1 Report Generation"),
    P(`${F("flow")} follows one person's data through the application. A DNA file from 23andMe or AncestryDNA is checked ` +
      `and its missing variants are filled in. Genetic scores and quantum features are computed from it, six ` +
      `questionnaire answers join them in the calibrated model, and the result is a report on screen or as a PDF. The ` +
      `slow genetic part runs once per file and is cached, so the model, its explanation and the what-if sliders then ` +
      `respond at once.`),
    ...figure("fig_app_flow.png", "From a consumer DNA file and six answers to a risk report", "flow"),
    H3("4.2.2 Quantum Pair Encoder"),
    P(`${F("circuit")} shows one layer of the encoder. Each circuit carries four SNP pairs on eight qubits, two qubits ` +
      `per pair, so SNP 1a and SNP 1b are the two variants of the first pair. The teal block loads each SNP dosage (0, 1 ` +
      `or 2 copies) as a rotation angle. The purple block applies trainable RY and RZ rotations. The vertical lines are ` +
      `CZ gates, which entangle the qubits inside each pair and between neighbouring pairs. The layer runs four times, ` +
      `so the data is loaded afresh in each one ${cite("perez")}.`),
    ...figure("fig_circuit.png", "One layer of the 8-qubit pair encoder", "circuit"),
    P(`Measuring Z on every qubit gives 8 features per circuit. Twelve circuits share the same 64 trainable angles and ` +
      `give 96 features. Without the CZ gates each qubit would see only its own SNP; entanglement is what lets a feature ` +
      `depend on both SNPs of a pair, which is why experiment E5 removes it as a test.`),
    H3("4.2.3 Pair Selection and QAOA"),
    P(`The QUBO rewards relevance (the score-test strength of each pair) and penalises pairs that share a SNP or a ` +
      `linkage block, with a penalty that forces exactly 48 pairs ${cite("lucas")}. Simulated annealing with a ` +
      `swap-polishing step solves the full problem. QAOA ${cite("farhi")} solves 12-pair sub-problems (choose 4) in two ` +
      `forms: the textbook penalty form with an X mixer, and a constraint-preserving XY mixer ${cite("hadfield")} ` +
      `started from a Dicke state prepared with the Bärtschi–Eidenbenz circuit ${cite("bartschi")}, which only ` +
      `explores valid selections.`),
    P(`To make the full 48-of-200 selection with hardware-sized circuits, a decomposition (large-neighbourhood search ` +
      `${cite("shaw")}) hands QAOA one block at a time. Starting from the top-K choice, a block of 12 candidates, 4 of ` +
      `them selected, is cut out; with the rest held fixed, choosing which 4 to keep is a 12-variable problem of the ` +
      `same form. XY-mixer QAOA solves it, and the best of 32 samples is kept if it improves the whole selection. ` +
      `Because the XY mixer never leaves the valid selections, each block is simulated exactly in its 495 valid ` +
      `amplitudes instead of 4,096; this simulator matches PennyLane to 10^{−8}.`),
    H3("4.2.4 Hybrid Model"),
    P(`Level-one learners (an additive logistic model, XGBoost on the quantum features, and a quantum-kernel SVC) ` +
      `produce out-of-fold predictions inside five-fold cross-validation; a logistic meta-learner combines them. The ` +
      `deployed model is XGBoost on clinical factors, PRS, mechanism scores, SNP dosages and quantum features, with ` +
      `Platt calibration on a held-out set.`),
    H2("4.3 Snapshots of Working Prototype"),
    P(`The application is shown here for a synthetic demo person, a 34-year-old woman with a BMI of 21.6: exactly the ` +
      `kind of person Chapter 1 described. ${F("app_summary")} is the top of her report. QGenomix rates her high risk, at ` +
      `the 84th percentile, with a 23% probability of diabetes. The IDRS rates her moderate and the BMI rule does not ` +
      `flag her at all, and the two red messages say so in plain words.`),
    ...figure("app_summary.png", "Top of the report: QGenomix disagrees with the IDRS and the BMI rule", "app_summary"),
    P(`${F("app_mech")} shows why. Her insulin-production and fat-distribution scores sit at the 96th and 88th ` +
      `percentiles while her obesity score sits at the 24th, the genetic pattern behind lean diabetes. The report raises ` +
      `a combination flag when both of the first two are high.`),
    ...figure("app_mechanisms.png", "Mechanism profile: where the risk comes from", "app_mech"),
    P(`${F("app_whatif")} shows what she can do about it. With genes, age and family history held fixed, regular ` +
      `vigorous exercise lowers her risk from 23% to 15%, a waist 5 cm smaller lowers it to 11%, and both together to ` +
      `6%. Section 5.8 tests these estimates against the true effects.`),
    ...figure("app_whatif.png", "Lifestyle what-ifs for the same person", "app_whatif"),
    P("The same page downloads as a one-page PDF, and a clinician view ranks a whole cohort by risk. The demo runs with " +
      "`make app` (dashboard), `make api` (REST service) or `docker compose up` (both, in containers). Three synthetic " +
      "people are included: a lean woman at high genetic risk, an obese man at high risk, and a low-risk young woman.",
    { before: 60 }),
  ];
}

// =====================================================================
// CHAPTER 5: IMPLEMENTATION AND EXPERIMENTAL RESULTS
// =====================================================================
const MODEL_NAMES = [["M1_bmi", "BMI rule"], ["M2_prs", "PRS only (D-PRISM)"], ["M0_idrs", "IDRS questionnaire"],
  ["M3c_clinical", "Clinical factors, logistic regression"], ["M3_additive", "Clinical + genetics, logistic regression"],
  ["M4_rf", "Random forest"], ["M5_svm", "Support vector machine"], ["M6_xgb", "XGBoost"],
  ["M7_xgb_pairs", "XGBoost + selected SNP pairs"], ["H_twin", "Classical twin encoder"],
  ["M8_xgb_twin", "XGBoost + classical twin features"], ["H_noent", "Circuit without entanglement"],
  ["M9_xgb_noent", "XGBoost + circuit without entanglement"], ["H_vqc", "Circuit with entanglement"],
  ["M10_xgb_vqc", "XGBoost + quantum features"], ["M11_qsvc", "Quantum-kernel SVC (one circuit only)"],
  ["M12_stack", "Stacked hybrid"]];

function chapter5() {
  const sx = (k) => mit(k);
  const xy = sx("xy_p1"), pen = sx("penalty_p1");
  const e4 = T.e4, e3 = T.e3, top = T.e2[Object.keys(T.e2).at(-1)];
  const ab = T.e6.best_objective_share;
  const groups = { ...POPS, male: "Men", female: "Women", all: "All South Asians" };
  return [
    H1("CHAPTER 5: IMPLEMENTATION AND EXPERIMENTAL RESULTS"),
    H2("5.1 Implementation"),
    H3("5.1.1 Data"),
    P(`PLINK 2 ${cite("plink")} processed the 1000 Genomes phase 3 release ${cite("kg")}: 84 million variants in ` +
      `2,504 people from 26 populations. From it we computed the five components of D-PRISM ${cite("huerta")} (1.34 ` +
      `million variants), the five mechanism scores ${cite("loesch")} (β-cell, lipodystrophy, liver/lipid, obesity, ` +
      `proinsulin) and the dosages of their 62 SNPs. The 489 South Asian samples (Gujarati, Punjabi, Bengali, Sri Lankan ` +
      `Tamil and Telugu) give 978 phased haplotypes. A synthetic person is assembled by drawing each one-megabase block ` +
      `of the genome from a random South Asian haplotype, which keeps real allele frequencies and local linkage while ` +
      `allowing a cohort of any size.`),
    H3("5.1.2 Outcome Simulator"),
    P(`Each person's liability to T2D is a weighted sum of the D-PRISM background (10% of variance), the five ` +
      `mechanism scores (6.9%), a β-cell × lipodystrophy interaction (2.0%), ten planted SNP-pair interactions (4.0%), ` +
      `age (7%), BMI (4%), waist, activity and family history (4.5% together) and noise. The top 11% become cases, ` +
      `close to the national prevalence ${cite("anjana")}. The IDRS is computed from the simulated clinical factors ` +
      `exactly as published ${cite("mohan")}.`),
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
      `(its tag), using linkage disequilibrium measured in the 489 South Asian genomes ${cite("marchini", "browning")}: ` +
      `the dosage is the reference mean plus a regression slope times the tag's deviation from its mean. For each of ` +
      `1.46 million variants the panel stores the six best tags within 500 kb; the median best tag has r^{2} = ` +
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
      `McNemar's test, both Holm-corrected.`),
    P(`Three measures appear throughout. The AUC is the chance that a model ranks a random case above a random ` +
      `non-case: 0.5 is a coin toss and 1 is perfect. EDR@10 is the share of the 10 planted pairs found in a method's ` +
      `top 10. Lean-case capture is the share of lean cases (BMI < 23) among the top 20% of predicted risk, with ` +
      `exactly 20% flagged. ${TB("experiments")} lists the seventeen experiments with their results, and the rest of this ` +
      `chapter discusses them.`),
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
      ["E7b", "Can error mitigation recover it?", `XY depth 1: ${f2(xy.raw)} → ${f2(xy.readout_postselect_zne)} (noise-free ${f2(xy.ideal_postselect)}); penalty: ${f2(pen.raw)} → ${f2(pen.readout_postselect_zne)}`],
      ["E8", "Who catches lean cases?", `Top 20%: BMI rule ${pc(lean("M1_bmi"))}, IDRS ${pc(lean("M0_idrs"))}, clinical ${pc(lean("M3c_clinical"))}, with genetics ${pc(lean("M3_additive"))}`],
      ["E9", "Does it work on real genomes?", `AUC ${f3(T.e9.SAS.M3_additive[0])} South Asian; 0.85–0.87 East Asian, European, American; ${f3(T.e9.AFR.M3_additive[0])} African`],
      ["E10", "Are the app's what-ifs right?", `Waist −5 cm: ${rel("waist_minus_5cm", "model")} vs true ${rel("waist_minus_5cm", "true")}; exercise ${rel("vigorous_exercise", "model")} vs ${rel("vigorous_exercise", "true")}`],
      ["E11", "Is it fair across populations?", `Genetic-model AUC ${f2(Math.min(...popAuc))}–${f2(Math.max(...popAuc))} across five populations; gain over clinical +${f2(Math.min(...popGain))} to +${f2(Math.max(...popGain))}`],
      ["E12", "Robust to simulator assumptions?", `Genetics beats clinical in ${nAucWin}/${nSet} settings and beats IDRS on lean cases in ${nLeanWin}/${nSet}`],
      ["E13", "Partial consumer DNA files?", `45% coverage: PRS r ${f3(m13("mean_fill", PRS_T))} → ${f3(m13("ld_impute", PRS_T))}; high-risk kept ${pc(m13("mean_fill", HIGH_T))} → ${pc(m13("ld_impute", HIGH_T))}`],
      ["E14", "Is entanglement what captures interaction?", `Pure-interaction outcome: ${f3(a14("vqc"))} with entanglement, ${f3(a14("noent"))} without, ${f3(a14("twin"))} for a larger classical network`],
      ["E15", "Can 12-qubit QAOA make the full selection?", `Matches or beats annealing in ${e15.qaoa_p2.beats_annealing} of ${e15.qaoa_p2.n_runs} runs; best block answer ${(100 * e15.qaoa_p2.mean_is_block_optimum).toFixed(1)}% vs ${(100 * T.e15.paired_random_block_optimum).toFixed(1)}% for random sampling`],
    ], [750, 3000, 5636], { shadeFirst: true, aligns: [AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.LEFT] }),

    H2("5.3 Data and Simulator Checks"),
    P(`Before any result can be trusted, the data must behave like the real population. ${F("e0_pca")} plots the first ` +
      `two genetic components of all 2,504 people in 1000 Genomes; each dot is one person. Africans separate to the ` +
      `right, Europeans and East Asians to the top and bottom, South Asians form a tight column between them, and ` +
      `Americans spread out along their mixed ancestry. This is the well-known shape of human genetic variation ` +
      `${cite("kg")}, so the genotypes were read and processed correctly.`),
    ...figure("fig_e0_pca.png", "All 2,504 people of 1000 Genomes on the first two genetic components", "e0_pca"),
    P(`${F("e0_freq")} tests the synthetic cohort. Each dot is one of the 62 mechanism SNPs, placed by its allele ` +
      `frequency among the 489 real South Asians and among 10,000 synthetic people. Every dot sits on the diagonal ` +
      `(r = ${eafR.toFixed(4)}), so building people from blocks of real haplotypes keeps the frequencies almost exactly.`),
    ...figure("fig_e0_freq.png", "Allele frequencies of the 62 mechanism SNPs, real against synthetic", "e0_freq"),
    P(`${F("e0_prs")} compares the D-PRISM risk score in the two groups. The centres match, but the real people spread ` +
      `further to both sides, because a mosaic removes the population substructure that stretches the score in real ` +
      `samples. This is the one known difference between synthetic and real people, and Section 5.7 therefore also ` +
      `tests the models on real genomes.`),
    ...figure("fig_e0_prs.png", "D-PRISM risk score of real and synthetic South Asians", "e0_prs"),
    P(`${F("phenotype")} checks that the simulator reproduces the lean phenotype. It divides 40,000 synthetic people ` +
      `into fifths by their β-cell score and by their lipodystrophy score; each cell gives the share who develop T2D. In ` +
      `the bottom row, with the lowest β-cell score, the rate stays near 5% whatever the lipodystrophy score. In the top ` +
      `row it climbs from 5% to 38%. The two mechanisms are dangerous together, not separately. People high on both have ` +
      `a case rate of ${pc(T.e0.case_rate_both_high)} against ${pc(T.e0.case_rate_others)} for everyone else, at a lower ` +
      `average BMI (${T.e0.bmi_both_high.toFixed(1)} against ${T.e0.bmi_others.toFixed(1)}), and ` +
      `${pc(T.e0.lean_share_of_cases)} of all cases are lean. This is the pattern Chapter 1 described, reproduced by ` +
      `the simulator.`),
    ...figure("fig_lean_phenotype.png", "Share of people who develop T2D, by fifths of two mechanism scores", "phenotype"),

    H2("5.4 Prediction and the Lean Blind Spot"),
    P(`${F("e1")} shows the main predictors, from the simplest rule at the bottom to the strongest model at the top. ` +
      `Each step adds information: the BMI rule reaches ${f3(auc("M1_bmi"))}, a genetic score alone ` +
      `${f3(auc("M2_prs"))}, the IDRS ${f3(auc("M0_idrs"))}, and all clinical factors together ` +
      `${f3(auc("M3c_clinical"))}. Adding the genetic scores then lifts the AUC to ${f3(auc("M3_additive"))}, a gain ` +
      `that DeLong's test confirms in every seed (p ≤ 4×10^{−6} after Holm correction).`),
    ...figure("fig_e1_benchmark.png", "Test AUC of the main predictors (mean over 3 seeds)", "e1"),
    P(`Above that point the bars flatten. XGBoost reaches ${f3(auc("M6_xgb"))}, the stacked hybrid ` +
      `${f3(auc("M12_stack"))} and quantum features ${f3(auc("M10_xgb_vqc"))}, and none of these margins is significant. ` +
      `Most of the signal in the data is additive and simple models capture it. ${TB("models")} gives the results for ` +
      `all 17 predictors. The quantum-kernel SVC stands out at ${f3(auc("M11_qsvc"))} because it sees only the 8 SNPs ` +
      `of one circuit; it is an input to the stacked model and not a stand-alone predictor.`),
    tableCaption("All 17 predictors on the held-out test set (mean over 3 seeds)", "models"),
    table(["Predictor", "AUC", "Lean cases caught"], MODEL_NAMES.map(([k, n]) => [n, f3(auc(k)), pc(lean(k))]),
      [5786, 1500, 2100], { aligns: [AlignmentType.LEFT, AlignmentType.CENTER, AlignmentType.CENTER], pad: 30 }),
    P(`${F("e8")} is the main clinical result of the project. Suppose the top 20% of people by risk are sent for a blood ` +
      `test, and count how many lean people who develop diabetes are among them. A BMI rule catches none, by ` +
      `construction. The IDRS catches ${pc(lean("M0_idrs"))} and a model of all clinical factors ` +
      `${pc(lean("M3c_clinical"))}. Adding genetics raises this to ${pc(lean("M3_additive"))}, nearly double the IDRS. ` +
      `Genetic information helps most for exactly the people current screening misses.`, { before: 200 }),
    ...figure("fig_e8_lean.png", "Lean diabetes cases caught when the top 20% by risk are screened", "e8"),

    H2("5.5 Interaction Discovery"),
    P(`The simulator plants ten interacting SNP pairs, so a search method can be marked exactly. ${F("e2")} plots the ` +
      `share of those pairs found as they grow stronger, for 10,000 people and the strongest mechanism interaction. ` +
      `At δ = 0.2 the score test finds ${pc(top["0.2"].edr10_score)} of them in its top 10 against ` +
      `${pc(top["0.2"].edr10_boost)} for PLINK's BOOST, and the QUBO-selected set of 48 pairs holds ` +
      `${pc(top["0.2"].recall_qubo)}. Across all mechanism settings the score test finds 70–84% and BOOST 40–48%. The ` +
      `mechanism-level β-cell × lipodystrophy interaction is detected in every run in which it is present.`),
    ...figure("fig_e2_power.png", "Planted pairs found as the interaction grows stronger", "e2"),
    P(`${F("e3")} asks how many people such a study needs. At δ = 0.2 the score test finds ` +
      `${pc(e3["2500"].edr10_score)} of the pairs with 2,500 people and ${pc(e3["10000"].edr10_score)} with 10,000, and ` +
      `all of them with 40,000. This matters for future work: a real validation study will need tens of thousands of ` +
      `South Asians.`),
    ...figure("fig_e3_sample_size.png", "Planted pairs found as the cohort grows", "e3"),
    P(`A search must also stay silent when there is nothing to find. E4 repeats the search ${e4.n_runs} times with no ` +
      `planted interaction at all. ${F("e4")} compares its ${e4.n_tests.toLocaleString("en-IN")} p-values with what ` +
      `chance alone would give. If the test is honest the dots lie on the diagonal, and they do (λ = ` +
      `${f2(e4.lambda_gc)}). In ${e4.n_runs - e4.runs_with_any_bonferroni_hit} of the ${e4.n_runs} runs nothing passes ` +
      `the significance threshold. The search does not invent interactions.`),
    ...figure("fig_e4_null.png", "p-values of the score test when no interaction exists", "e4"),
    P(`Finding pairs is not enough, because nearby variants in linkage repeat the same signal as redundant "shadow" ` +
      `pairs. ${TB("selection")} compares three ways of choosing 48 pairs (E6). Plain top-K ranking keeps the most ` +
      `planted pairs but spends ${e6.topk.shadow_pairs.toFixed(0)} of its 48 places on shadows and covers only ` +
      `${Math.round(e6.topk.distinct_snps)} SNPs. The QUBO and mRMR ${cite("peng")} both cover ` +
      `${Math.round(e6.qubo.distinct_snps)} SNPs with about 16 shadows. The QUBO reaches the best value of its objective ` +
      `in ${pc(ab.qubo)} of runs and mRMR in ${pc(ab.mrmr)}, so it is a sound formulation of the problem, though only ` +
      `slightly better than mRMR.`),
    tableCaption(`Three ways of choosing 48 pairs (mean of ${T.e6.n_runs} runs)`, "selection"),
    table(["Method", "Planted pairs kept", "Distinct SNPs", "Redundant pairs", "Best objective"], [
      ["Top-K ranking", pc(e6.topk.recall), Math.round(e6.topk.distinct_snps), e6.topk.shadow_pairs.toFixed(1), pc(ab.topk)],
      ["mRMR", pc(e6.mrmr.recall), Math.round(e6.mrmr.distinct_snps), e6.mrmr.shadow_pairs.toFixed(1), pc(ab.mrmr)],
      ["QUBO", pc(e6.qubo.recall), Math.round(e6.qubo.distinct_snps), e6.qubo.shadow_pairs.toFixed(1), pc(ab.qubo)],
    ], [2586, 1900, 1600, 1700, 1600], { shadeFirst: true, aligns: [AlignmentType.LEFT, AlignmentType.CENTER,
      AlignmentType.CENTER, AlignmentType.CENTER, AlignmentType.CENTER] }),

    H2("5.6 Quantum Components"),
    P("Every quantum component was tested against a matched classical control. On the realistic cohort none gave a " +
      "significant gain; two further experiments then measured whether each part does the job it is there for."),
    H3("5.6.1 Entanglement and Gene–Gene Interaction"),
    P(`${F("e5")} shows the test of the encoder on the realistic cohort. All three models use the same selected pairs ` +
      `and differ only in the encoder; the dot is the mean AUC and the bar the spread between seeds. The entangled ` +
      `circuit reaches ${f3(auc("H_vqc"))}, the same circuit without entanglement ${f3(auc("H_noent"))}, and a ` +
      `classical network of similar size ${f3(auc("H_twin"))}. The bars overlap.`),
    ...figure("fig_e5_entanglement.png", "The encoder with and without entanglement, and its classical twin", "e5"),
    P(`E5 does not show that entanglement is useless. In the simulated cohort, interaction is a small share of risk ` +
      `and the additive scores carry most of the signal, so any encoder of the pairs adds little. E14 asks the sharper ` +
      `question: is entanglement what lets the circuit capture interaction at all? Its outcome is built only from four ` +
      `gene pairs on real genotypes, so no single SNP carries risk. One circuit holds exactly those four pairs, and six ` +
      `models see the same 8 dosages (${F("e14")}).`),
    ...figure("fig_e14_interaction.png", "AUC when only gene pairs carry risk (mean and spread over 3 seeds)", "e14"),
    P(`Regression on the dosages and the circuit without entanglement stay near chance (${f3(a14("additive"))} and ` +
      `${f3(a14("noent"))}): an additive model cannot see a product. With the CZ gates the same circuit reaches ` +
      `${f3(a14("vqc"))} (DeLong p < 10^{−13} in each seed), ` +
      `${Math.round((100 * (a14("vqc") - 0.5)) / (a14("products") - 0.5))}% of the way to the ${f3(a14("products"))} ` +
      `of a model told the true products. With ${e14.params.vqc} parameters it also beats a classical network of ` +
      `${e14.params.twin_small} parameters in every seed (p ≤ 2×10^{−4}) and one of ${e14.params.twin} parameters in ` +
      `two of three seeds. The classical networks were not tuned for this task, so the result shows that entanglement ` +
      `works as an interaction detector, not that quantum circuits beat classical ones.`),
    P(`${F("e14_qubit")} shows the mechanism. It plots the mean output of one qubit for each pair of dosages of its SNP ` +
      `pair. With entanglement the output changes along both axes. With the CZ gates removed and the same angles kept, ` +
      `every row is constant: the qubit can only ever report its own SNP. Over all eight qubits, ` +
      `${Math.round(100 * e14.partner_share.vqc)}% of an entangled qubit's output variance comes from its partner SNP, ` +
      `against exactly ${Math.round(100 * e14.partner_share.noent)}% without entanglement.`),
    ...figure("fig_e14_qubit.png", "What one qubit outputs for each pair of dosages, with and without entanglement", "e14_qubit"),
    H3("5.6.2 QAOA for Pair Selection"),
    P(`QAOA is first tested on three 12-pair sub-problems (choose 4), small enough to run on real hardware. ` +
      `${F("e7")} plots solution quality against circuit depth, where 1 is the best possible selection. On an ideal ` +
      `simulator the constraint-preserving XY mixer starts at ${f2(depthMean("xy", 1))} and reaches ` +
      `${f2(depthMean("xy", 6))}, above the ${f2(xy.random_valid)} of a random valid choice (the dotted line). Textbook ` +
      `QAOA starts at ${f2(depthMean("penalty", 1))} and reaches only ${f2(depthMean("penalty", 6))}, because much of ` +
      `its probability is wasted on invalid selections. The red squares show the same circuits at depths 1 and 2 on a ` +
      `noise model of the IBM Kingston processor: both fall to about 0.3 and the advantage disappears.`),
    ...figure("fig_e7_qaoa.png", "QAOA solution quality against depth, ideal and with IBM noise", "e7"),
    P(`Error mitigation asks how much of that loss can be won back. ${F("e7b")} follows the XY circuit at depth 1 through ` +
      `the three stages of Section 5.1.4. The noisy circuit gives ${f2(xy.raw)}. Readout correction alone adds little ` +
      `(${f2(xy.readout)}). Post-selection does most of the work and lifts quality to ` +
      `${f2(xy.readout_postselect)}, above a random choice, because the XY circuit conserves the number of selected ` +
      `pairs and any other count is a detected error. Zero-noise extrapolation adds the rest and reaches ` +
      `${f2(xy.readout_postselect_zne)}, against ${f2(xy.ideal_postselect)} without noise.${hwRun ? ` On the real ` +
      `${hwRun.hardware_backend} processor the mitigated circuit reached ${f2(hwRun.hardware_mitigated)} (raw ` +
      `${f2(hwRun.hardware_raw)}).` : ""} The penalty form only reaches ${f2(pen.readout_postselect_zne)}, the level ` +
      `of a random valid choice, because even noise-free it has no edge once invalid samples are discarded.`),
    ...figure("fig_e7b_mitigation.png", "XY QAOA on the IBM noise model after each mitigation stage", "e7b"),
    P(`E7 and E7b solve isolated 12-pair problems. E15 asks whether QAOA can make the selection the pipeline actually ` +
      `uses, 48 of 200 candidates, while every circuit stays hardware-sized. It runs the decomposition of Section 4.2.3 ` +
      `on ${T.e15.n_cohorts} cohorts, two runs each, ${T.e15.blocks} blocks per run, from the top-K start. The ` +
      `controls see the same blocks: ${T.e15.shots} uniformly random valid selections, which is what QAOA's sampling ` +
      `must beat, and exhaustive search, the best any sub-solver can do.`),
    ...figure("fig_e15_blocks.png", "How often 32 samples contained the best answer for a 12-pair block", "e15"),
    P(`${F("e15")} compares the samples directly. QAOA's best sample was the block's optimum in ` +
      `${(100 * e15.qaoa_p2.mean_is_block_optimum).toFixed(1)}% of blocks at depth 2 and ` +
      `${(100 * e15.qaoa_p1.mean_is_block_optimum).toFixed(1)}% at depth 1; 32 random selections on the same blocks ` +
      `contained it ${(100 * T.e15.paired_random_block_optimum).toFixed(1)}% of the time. QAOA's distribution ` +
      `concentrates on good selections, so it needs fewer samples. ${TB("lns")} shows where the whole search ends.`),
    tableCaption(`How the full 48-pair selection ends (${T.e15.n_cohorts} cohorts, 2 runs each)`, "lns"),
    table(["Method", "Matches or beats annealing", "Distinct SNPs", "Planted pairs kept", "Seconds per run"], [
      ["QAOA, depth 2", `${e15.qaoa_p2.beats_annealing} of ${e15.qaoa_p2.n_runs}`, Math.round(e15.qaoa_p2.distinct_snps), pc(e15.qaoa_p2.recall), e15.qaoa_p2.seconds.toFixed(1)],
      ["QAOA, depth 1", `${e15.qaoa_p1.beats_annealing} of ${e15.qaoa_p1.n_runs}`, Math.round(e15.qaoa_p1.distinct_snps), pc(e15.qaoa_p1.recall), e15.qaoa_p1.seconds.toFixed(1)],
      ["Exhaustive search", `${e15.exact.beats_annealing} of ${e15.exact.n_runs}`, Math.round(e15.exact.distinct_snps), pc(e15.exact.recall), e15.exact.seconds.toFixed(1)],
      ["Random sampling", `${e15.random.beats_annealing} of ${e15.random.n_runs}`, Math.round(e15.random.distinct_snps), pc(e15.random.recall), e15.random.seconds.toFixed(1)],
      ["Simulated annealing (reference)", "", Math.round(e15.sa.distinct_snps), pc(e15.sa.recall), ""],
      ["Top-K (the start)", "", Math.round(e15.topk.distinct_snps), pc(e15.topk.recall), ""],
    ], [3086, 1900, 1400, 1600, 1400], { shadeFirst: true, aligns: [AlignmentType.LEFT, AlignmentType.CENTER,
      AlignmentType.CENTER, AlignmentType.CENTER, AlignmentType.CENTER] }),
    P(`QAOA at depth 2 reaches the same objective as simulated annealing on average and matches or beats it in ` +
      `${e15.qaoa_p2.beats_annealing} of ${e15.qaoa_p2.n_runs} runs; random sampling with the same budget does so in ` +
      `${e15.random.beats_annealing}. Every method removes the redundancy of top-K (${Math.round(e15.sa.distinct_snps)} ` +
      `distinct SNPs instead of ${Math.round(e15.topk.distinct_snps)}). The margins are small because a 12-pair block has ` +
      `only 495 valid answers, but the experiment shows that 12-qubit circuits can make the real selection end to end. ` +
      `No speed-up is claimed: every circuit in this section is small enough to simulate exactly on a laptop.`,
    { before: 160 }),

    H2("5.7 Real Genomes, Fairness and Robustness"),
    P(`So far the test people have been synthetic. ${F("e9")} moves to the real genomes of 1000 Genomes, with outcomes ` +
      `from the same simulator, for models trained on synthetic South Asians. In every ancestry the clinical-plus-genetic ` +
      `model beats a PRS alone. It is most accurate in South Asians (${f3(T.e9.SAS.M3_additive[0])}), the group it was ` +
      `trained for, and least accurate in Africans (${f3(T.e9.AFR.M3_additive[0])}), the expected loss when a model moves ` +
      `far from its training ancestry and a warning against using it outside South Asians without retraining.`),
    ...figure("fig_e9_real_genomes.png", "Models trained on synthetic South Asians, tested on real genomes", "e9"),
    P(`South Asia is itself diverse. ${F("e11")} and ${TB("fairness")} ask whether the model serves all its groups ` +
      `(E11). The genetic model improves on clinical factors in ${allGain ? "every" : "most"} population and in both ` +
      `sexes. Accuracy is lowest in the ${POPS[worstPop]} samples (AUC ${f2(e11[worstPop].auc_genetic)}) and highest in ` +
      `the ${POPS[bestPop]} samples (${f2(e11[bestPop].auc_genetic)}), differences within sampling noise for about 100 ` +
      `people per group. The ratio of observed to predicted cases in ${TB("fairness")} is about ` +
      `${f2(e11.all.oe[0])}: predicted risks run about ${Math.round(100 * (1 - e11.all.oe[0]))}% high on real genomes, ` +
      `and equally so in every group, so local recalibration, not a group-specific fix, is the remedy.`),
    ...figure("fig_e11_fairness.png", "Accuracy by South Asian population and by sex, on real genomes", "e11"),
    tableCaption("Calibration and cases caught on real South Asian genomes", "fairness"),
    table(["Group", "People", "AUC, clinical", "AUC, with genetics", "Observed / predicted", "Cases caught in top 20%"],
      Object.entries(groups).map(([k, n]) => [n, T.e11.n[k], f2(e11[k].auc_clinical), f2(e11[k].auc_genetic), f2(e11[k].oe[0]),
        `${pc(e11[k].capture_clinical[0])} → ${pc(e11[k].capture_genetic[0])}`]),
      [2386, 950, 1200, 1400, 1450, 2000], { shadeFirst: true, aligns: [AlignmentType.LEFT, ...Array(5).fill(AlignmentType.CENTER)] }),
    P(`Because outcomes are simulated, the main risk is that the conclusions depend on the simulator. E12 changes one ` +
      `assumption at a time across ${nSet} settings. ${F("e12_auc")} shows the AUC that genetics adds in each setting, ` +
      `sorted by size. Every bar is positive: the gain ranges from ${f3(Math.min(...dAuc))} to ${f3(Math.max(...dAuc))}, ` +
      `and it stays positive even with no mechanism interaction at all.`, { before: 200 }),
    ...figure("fig_e12_auc.png", "AUC gained by adding genetics, in each of 13 simulator settings", "e12_auc"),
    P(`${F("e12_lean")} repeats the check for the clinical result: how many more lean cases the genetic model catches ` +
      `than the IDRS. It wins in ${nLeanWin} of ${nSet} settings, by ${Math.round(Math.min(...dLean))} to ` +
      `${Math.round(Math.max(...dLean))} percentage points. Interaction discovery is less forgiving: EDR@10 runs from ` +
      `${f2(Math.min(...edrs))} to ${f2(Math.max(...edrs))} across the settings, because it depends strongly on the true ` +
      `effect size. We report this as a limit of the work.`),
    ...figure("fig_e12_lean.png", "Extra lean cases caught compared with the IDRS, in each setting", "e12_lean"),

    H2("5.8 Consumer DNA Files and Lifestyle What-ifs"),
    P(`A consumer DNA file holds only part of the genome that a risk score needs. E13 tests what this does to a report. ` +
      `It holds out 100 real South Asian genomes, builds the LD panel from the other 389, and hides variants so that ` +
      `25%, 45% or 65% remain; 45% is typical of a consumer chip. ${F("e13_error")} shows the error in the risk ` +
      `percentile a person would see. At 45% coverage it is ${m13("mean_fill", ERR_T).toFixed(1)} points if missing ` +
      `variants are filled with the population average, and ${m13("ld_impute", ERR_T).toFixed(1)} with LD imputation.`),
    ...figure("fig_e13_error.png", "Error in the reported risk percentile, by coverage of the DNA file", "e13_error"),
    P(`${F("e13_flagged")} shows what that means for a person. Average filling pulls every score towards the middle, ` +
      `so high-risk people drop out of the high-risk group: at 45% coverage only ${pc(m13("mean_fill", HIGH_T))} stay ` +
      `flagged. LD imputation keeps ${pc(m13("ld_impute", HIGH_T))}, and raises the correlation with the full-genome ` +
      `score from ${f3(m13("mean_fill", PRS_T))} to ${f3(m13("ld_impute", PRS_T))}.`),
    ...figure("fig_e13_flagged.png", "Truly high-risk people still flagged, by coverage of the DNA file", "e13_flagged"),
    P(`A report should also be right about what a person can change. Because the simulator holds the true effect of ` +
      `each change, E10 can check the app's what-ifs directly (${F("e10")}). A waist 5 cm smaller lowers risk by ` +
      `${rel("waist_minus_5cm", "model").replace("−", "")} in the app and ${rel("waist_minus_5cm", "true").replace("−", "")} ` +
      `in truth. For regular exercise the figures are ${rel("vigorous_exercise", "model").replace("−", "")} and ` +
      `${rel("vigorous_exercise", "true").replace("−", "")}, and for both changes ` +
      `${rel("both", "model").replace("−", "")} and ${rel("both", "true").replace("−", "")}. The app errs on the ` +
      `cautious side, and the size of these changes is consistent with the Indian Diabetes Prevention Programme ` +
      `${cite("ramachandran")}.`),
    ...figure("fig_e10_lifestyle.png", "Drop in risk from each lifestyle change, app against the true effect", "e10"),

    H2("5.9 Testing and Validation"),
    P("The code is tested at four levels:", { after: 60, keepNext: true }),
    ...bullets([
      `${nTests} automated tests: unit tests (QUBO, score test, metrics, simulator, IDRS, LD imputation, PLINK file ` +
        "decoding, readout correction, post-selection, extrapolation, QAOA decomposition), equivalence tests (our " +
        "circuit simulators against PennyLane, our QAOA against Qiskit, the Dicke circuit, circuit folding), an " +
        "end-to-end pipeline test, and " +
        "parser, API and PDF tests including partial chip files, duplicate positions and wrong genome builds.",
      "Continuous integration: GitHub Actions installs the project from scratch and runs the linter and all tests on every push.",
      "Reproducibility: a re-run matches the stored result bit for bit; re-running the data pipeline from the raw " +
        "downloads reproduced every processed file; the imputation code reproduces PLINK's PRS exactly (r = 1.000).",
      `Code: ${pyFiles.length} Python modules (${srcLines.toLocaleString("en-IN")} lines), ${nScripts} scripts, one \`make\` command per step, and a Docker image.`,
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
    P(`${TB("objectives")} compares each objective of Section 3.3 with its status then and now.`),
    tableCaption("Status of the approved objectives", "objectives"),
    table(["Obj.", "Approved objective", "Mid-sem", "Now", "Evidence"], [
      [ROMAN[0], "Genomic data pipeline: QC, SNP selection, pair ranking, labels", "100%", "Complete, rebuilt on real data", "`make data` rebuilds every file from the raw downloads; a full re-run gave identical output"],
      [ROMAN[1], "Variational quantum circuit encoder for SNP pairs", "20%", "Complete", "8-qubit circuit; our simulator matches PennyLane to 10^{−6} and trains 7× faster"],
      [ROMAN[2], "Classical baselines (LR, RF, XGBoost, SVM) and PRS", "15%", "Complete", "Also the IDRS, a BMI rule and a clinical-factor model"],
      [ROMAN[3], "Hybrid stacking ensemble", "0%", "Complete", `Stacked model has the best AUC, ${f3(auc("M12_stack"))}`],
      [ROMAN[4], "SHAP-guided adaptive pair refinement", "0%", "Built, tested, replaced", `SHAP ranking found ${pc(edrShap)} of planted pairs vs ${pc(edrScore)} for the score test; SHAP kept for per-person explanations`],
      [ROMAN[5], "Benchmark: AUC-ROC, F1, EDR@K, DeLong, McNemar", "10%", "Complete", "17 models, 17 experiments (E0–E15), Holm-corrected tests"],
    ], [720, 2600, 1100, 1400, 3566], { aligns: [AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.CENTER,
      AlignmentType.LEFT, AlignmentType.LEFT] }),
    P("Beyond the approved objectives the project added QAOA with error mitigation, clinical factors and the IDRS, " +
      "tests on real genomes, fairness and robustness studies, LD imputation for consumer DNA files, two experiments " +
      "that measure what the quantum parts contribute (E14, E15), and a complete application with a PDF report and a " +
      "Docker image.", { before: 120 }),
    H2("6.2 Conclusions"),
    P(`QGenomix is a complete, tested system built around a clear clinical question. On simulated outcomes over real ` +
      `genotypes, genetic scores add substantially to India's screening questionnaire and nearly double the share of ` +
      `lean diabetes cases caught (${pc(lean("M0_idrs"))} → ${pc(lean("M3_additive"))}); the finding survives ` +
      `${nAucWin} of ${nSet} alternative simulator settings and holds in every South Asian population tested. The ` +
      `interaction search finds planted gene pairs reliably and stays quiet when there are none. The application turns ` +
      `a consumer DNA file into a calibrated, explained report, with LD imputation for partial files. The quantum ` +
      `parts do what they are there for: entanglement is what lets the circuit capture gene–gene interaction (E14), ` +
      `and 12-qubit QAOA circuits make the full pair selection as well as simulated annealing (E15). They show no ` +
      `speed-up yet, because every circuit here can be simulated exactly, and error mitigation recovers most of the ` +
      `quality that hardware noise destroys. The main limit is that outcomes are ` +
      `simulated; validation on a consented Indian cohort is the next step beyond this course.`),
    H2("6.3 Environmental / Social Benefits"),
    P("Earlier identification of lean South Asians at high risk allows lifestyle change before diabetes develops, which " +
      "is cheaper and kinder than treating its complications. QGenomix needs only a consumer DNA file and six questions, " +
      "runs on an ordinary laptop with a small energy footprint, processes genetic data in memory without storing it, " +
      "and is open source, so it could be adapted for public-health screening at low cost."),
    ...(PANEL ? finalDemonstration() : futureWorkPlan()),
  ];
}

function futureWorkPlan() {
  return [
    H2("6.4 Future Work Plan"),
    P("The final panel evaluation is around 9 November 2026. Two features have been kept for the panel because each " +
      `needs an account in the team's own name; both are built and rehearsed (${TB("panel")}). ${TB("schedule")} gives ` +
      "the plan up to the panel."),
    tableCaption("Features kept for the final panel", "panel"),
    table(["Feature", "What is ready", "What remains", "Effort"], [
      hwRun
        ? ["Run on a real IBM quantum computer", `Done on ${hwRun.hardware_backend}; the result is in ${F("e7b")}`, "Present it at the panel", "Done"]
        : ["Run on a real IBM quantum computer", "`scripts/run_ibm.py` with error mitigation, dynamical decoupling and twirling; rehearsed on the Kingston noise model", `Create a free IBM Quantum account, run one batched job (about 2 of the 10 free QPU minutes); \`make figures\` adds the result to ${F("e7b")}`, "1 day"],
      ["Public online demo", "Docker image and compose file; health checks pass", "Deploy the image to a free host under a team account; put the link on the slides", "1 day"],
    ], [2000, 2900, 3486, 1000], { shadeFirst: true }),
    tableCaption("Schedule to the final panel", "schedule"),
    table(["Dates", "Work"], [
      ["4–6 November", "IBM hardware run and public demo under team accounts; update figures, reports and slides"],
      ["7–8 November", "Full test run on a clean machine; timed rehearsal with each member presenting one part"],
      ["9 November", "Final panel evaluation"],
    ], [2000, 7386], { shadeFirst: true }),
    P("Beyond the course, the natural next steps are validation on real Indian patients (for example GenomeIndia data " +
      "through the Indian Biological Data Centre), imputation with a larger reference panel, extension to other " +
      "ancestries and traits, and a paper on the screening and interaction results.", { before: 120 }),
  ];
}

function finalDemonstration() {
  return [
    H2("6.4 Final Demonstration"),
    P(`The demonstration runs on one laptop with no internet connection, and every part of it is one command ` +
      `(${TB("demo")}). It follows the lean woman of Section 4.3 from her DNA file to her report, then shows the ` +
      "evidence behind each claim."),
    tableCaption("What the final demonstration shows", "demo"),
    table(["Part", "What is shown", "Command"], [
      ["Risk report", "A lean woman flagged high risk; her mechanism profile, what-ifs and PDF report", "`make app`"],
      ["REST API", "The same report as JSON and as a PDF, from an uploaded DNA file", "`make api`"],
      ["Quantum evidence", "Entanglement capturing interaction (E14) and QAOA making the full pair selection (E15), rerun live", "`make quantum` (about 5 minutes)"],
      ["Quantum hardware", hwRun ? `QAOA with error mitigation on the real ${hwRun.hardware_backend} processor` : "QAOA with error mitigation on IBM's Kingston noise model; the same script runs on a real IBM processor with the team's account", hwRun ? "`scripts/run_ibm.py`" : "`make rehearse-ibm`"],
      ["Tests", `All ${nTests} automated tests, from the QUBO to the PDF report`, "`make test`"],
    ], [1900, 5186, 2300], { shadeFirst: true }),
    P(hwRun
      ? `The run on the ${hwRun.hardware_backend} processor is reported in ${F("e7b")}.`
      : "A run on a real IBM processor needs the team's own IBM Quantum account, so it is not part of this report. " +
        "The script is ready and rehearsed; once the account exists, one batched job (about 2 of the 10 free QPU " +
        `minutes) adds its result to ${F("e7b")} and to this report automatically.`, { before: 120 }),
    H2("6.5 Future Scope"),
    P("Five directions would take QGenomix from a research prototype towards real use:", { after: 60, keepNext: true }),
    ...enumerated([
      "Validation on real Indian patients, for example GenomeIndia data through the Indian Biological Data Centre: the step that would turn simulated findings into clinical evidence.",
      "Imputation with a larger reference panel, so that consumer DNA files with less coverage still give reliable reports.",
      "Models for other ancestries and related traits such as gestational diabetes.",
      "Larger quantum runs as hardware improves: bigger QAOA blocks on real processors, and the encoder on hardware instead of a simulator.",
      "A research paper on the screening result and on the controlled tests of the quantum methods.",
    ]),
  ];
}

// =====================================================================
// APPENDICES AND REMARKS
// =====================================================================
// APA text with *italic* markers, as written by build_references.py
const apaRuns = (text, base) => text.split("*").map((part, i) => new TextRun({ ...base, text: part, italics: i % 2 === 1 || undefined }));
function appendices() {
  return [
    H1("APPENDIX A: REFERENCES"),
    ...S.refOrder.map((k, i) => new Paragraph({
      spacing: { after: 80, line: 260 }, indent: { left: 620, hanging: 620 }, alignment: AlignmentType.LEFT,
      tabStops: [{ type: TabStopType.LEFT, position: 620 }],
      children: [new Bookmark({ id: `ref_${k}`, children: [new TextRun({ size: 22, children: [`[${i + 1}]`, new Tab()] })] }),
        ...apaRuns(REFS[k].apa, { size: 22 })],
    })),
  ];
}
const remarkLines = (n) => new Table({ // ruled lines to write remarks on
  width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [CONTENT_W],
  rows: Array.from({ length: n }, () => new TableRow({ height: { value: 480, rule: "exact" }, children: [
    new TableCell({ width: { size: CONTENT_W, type: WidthType.DXA },
      borders: { top: NONE, left: NONE, right: NONE, bottom: BORDER }, children: [new Paragraph({ children: [] })] }),
  ] })),
});
function remarksPage() {
  if (PANEL) {
    return [
      H1("PANEL'S REMARKS"),
      remarkLines(10),
      ...[1, 2, 3].flatMap((i) => [line(`Panel member ${i}`), line("Signature", 160)]),
      line("Date"),
    ];
  }
  return [
    H1("MENTOR'S REMARKS"),
    remarkLines(12),
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
  const unused = Object.keys(REFS).filter((k) => !S.refOrder.includes(k));
  if (unused.length) console.warn("references never cited, left out of the list:", unused.join(", "));
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
  const tocStyle = (id, name, run, paragraph) => ({ id, name, basedOn: "Normal", next: "Normal", run, paragraph });
  return new Document({
    creator: team,
    lastModifiedBy: team,
    title: `${FULL_TITLE}: ${EVALUATION} Report`,
    subject: "Capstone Project CPG 218, Computer Science and Engineering Department, TIET, Patiala",
    keywords: "type 2 diabetes, South Asians, polygenic risk, QAOA, variational quantum circuit",
    features: { updateFields: true }, // Word refreshes the contents, the lists and the numbers when it opens the file
    styles: {
      default: { document: { run: { font: FONT, size: 24 } } },
      characterStyles: [{ id: "IndexLink", name: "Index Link", basedOn: "DefaultParagraphFont" }],
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: FONT, size: 32, bold: true, color: "000000" }, paragraph: { spacing: { before: 240, after: 200 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: FONT, size: 28, bold: true, color: "000000" }, paragraph: { spacing: { before: 240, after: 100 }, outlineLevel: 1 } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: FONT, size: 24, bold: true, color: "000000" }, paragraph: { spacing: { before: 180, after: 80 }, outlineLevel: 2 } },
        { id: "ContentsTitle", name: "Contents Title", basedOn: "Normal", next: "Normal",
          run: { font: FONT, size: 32, bold: true, color: "000000" },
          paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 240, after: 200 } } },
        { id: "Caption", name: "caption", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: FONT, size: 22, color: "000000" }, paragraph: { spacing: { after: 120 } } },
        tocStyle("TOC1", "toc 1", { bold: true, size: 22 }, { spacing: { before: 80, after: 60 } }),
        tocStyle("TOC2", "toc 2", { size: 22 }, { indent: { left: 360 }, spacing: { after: 40 } }),
        tocStyle("TOC3", "toc 3", { size: 22 }, { spacing: { after: 60 } }),
        tocStyle("TableofFigures", "table of figures", { size: 22 }, { spacing: { after: 60 } }),
      ],
    },
    numbering: { config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] },
      { reference: "roman", levels: [{ level: 0, format: LevelFormat.LOWER_ROMAN, text: "(%1)", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 660, hanging: 540 } } } }] },
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
  for (const [kind, list_] of [["figure", S.figs], ["table", S.tabs]]) {
    const prefix = kind === "figure" ? "Figure" : "Table";
    for (const it of list_) {
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
