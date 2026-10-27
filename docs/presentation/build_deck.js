// QGenomix mentor evaluation slides (16:9 PowerPoint).
//
//   cd docs/presentation && npm install && npm run build
//
// Numbers are read from results/ (as in the report), charts are native PowerPoint charts, and each slide has
// speaker notes. The deck is built on one theme and four layouts, so colours and fonts can be changed in one place.
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const sharp = require("sharp");
const Fa = require("react-icons/fa");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.resolve(process.argv[2] || path.join(ROOT, "QGenomix_Mentor_Presentation.pptx"));
const FIG = (f) => path.join(ROOT, "figures", f);

// ---------------------------------------------------------------- project details
const TEAM = [["Aritro Chowdhury", "102303452"], ["Suyash Gupta", "102303017"], ["Rishabh Sharma", "102303286"],
  ["Akshat Ahuja", "102315073"], ["Anshh Pasriccha", "102303455"]];
const MENTOR = "Dr. Husanbir Singh Pannu";

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
const e3 = T.e3;
const e3n = Object.keys(e3).map(Number).sort((a, b) => a - b);
const e6 = T.e6.stats;
const e7b = T.e7b.xy_p1, e7bPen = T.e7b.penalty_p1;
const POPS = [["GIH", "Gujarati"], ["PJL", "Punjabi"], ["BEB", "Bengali"], ["STU", "Sri Lankan Tamil"], ["ITU", "Telugu"],
  ["male", "Men"], ["female", "Women"]];
const e11 = T.e11.groups;
const popGain = POPS.slice(0, 5).map(([k]) => e11[k].auc_genetic - e11[k].auc_clinical);
const e12 = T.e12;
const settings = Object.keys(e12);
const nAucWin = settings.filter((s) => e12[s].auc_genetic > e12[s].auc_clinical).length;
const nLeanWin = settings.filter((s) => e12[s].lean_capture_genetic > e12[s].lean_capture_idrs).length;
const e13 = T.e13;
const ERR_T = "Error in the risk percentile shown", HIGH_T = "High-risk people still flagged high",
  PRS_T = "PRS agreement with the full genome";
const at = (method, title, cov) => e13.summary[method][title][e13.coverages.indexOf(cov)][0];
const nTests = fs.readdirSync(path.join(ROOT, "tests")).filter((f) => f.endsWith(".py"))
  .reduce((n, f) => n + (fs.readFileSync(path.join(ROOT, "tests", f), "utf8").match(/^def test_/gm) || []).length, 0);
const pyFiles = fs.readdirSync(path.join(ROOT, "src/qgenomix"), { recursive: true }).filter((f) => f.endsWith(".py"));
const srcLines = pyFiles.reduce((n, f) =>
  n + fs.readFileSync(path.join(ROOT, "src/qgenomix", f), "utf8").split("\n").length - 1, 0);

// ---------------------------------------------------------------- theme
const THEME = {
  name: "QGenomix",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "15232B", lt1: "FFFFFF", dk2: "0D3D46", lt2: "E3F0EE",
    accent1: "0A756F", accent2: "5A4FB0", accent3: "B3261E", accent4: "A8650A", accent5: "8A979E", accent6: "1D7F47",
    hlink: "0A756F", folHlink: "5A4FB0",
  },
};
const HEX = { ...THEME.colors, muted: "586A72", grid: "D3DDE0", purple1: "D9D4F2", purple2: "B1A8E4", purple3: "8579CF" };
const W = 13.333, H = 7.5, MX = 0.6, CW = W - 2 * MX;

// ---------------------------------------------------------------- icons (white glyph, drawn on a coloured circle)
async function iconData(Icon, color = "#FFFFFF") {
  const svg = renderToStaticMarkup(React.createElement(Icon, { size: 256, color }));
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return `image/png;base64,${png.toString("base64")}`;
}

async function main() {
  const ICON = {};
  for (const [k, Icon] of Object.entries({
    dna: Fa.FaDna, atom: Fa.FaAtom, weight: Fa.FaWeight, clipboard: Fa.FaClipboardList, users: Fa.FaUsers,
    flask: Fa.FaFlask, chart: Fa.FaChartBar, shield: Fa.FaBalanceScale, file: Fa.FaFileMedical, docker: Fa.FaDocker,
    vial: Fa.FaVial, sitemap: Fa.FaProjectDiagram, code: Fa.FaCode, sync: Fa.FaSyncAlt, cubes: Fa.FaCubes,
    microchip: Fa.FaMicrochip, search: Fa.FaSearch, globe: Fa.FaGlobeAsia, check: Fa.FaCheck, laptop: Fa.FaLaptopMedical,
    heart: Fa.FaHeartbeat,
  })) ICON[k] = await iconData(Icon);

  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  pres.author = TEAM.map(([n]) => n).join(", ");
  pres.company = "Thapar Institute of Engineering and Technology";
  pres.title = "QGenomix: Mentor Evaluation";
  pres.subject = "Capstone Project CPG 218, Computer Science and Engineering Department, TIET, Patiala";
  const C = pres.SchemeColor;

  // ---------------------------------------------------------------- layouts
  const footer = { text: { text: "QGenomix  ·  Capstone CPG 218  ·  Thapar Institute of Engineering and Technology",
    options: { x: MX, y: 7.0, w: 9, h: 0.3, fontSize: 10, color: C.accent5, margin: 0 } } };
  pres.defineSlideMaster({
    title: "QGX Title",
    background: { color: HEX.dk2 },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 1.95, w: 8.0, h: 1.2, fontSize: 60, bold: true,
        color: C.background1, align: "left", valign: "bottom", margin: 0 }, text: "" } },
      { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 3.25, w: 7.6, h: 1.0, fontSize: 20,
        color: C.background2, valign: "top", margin: 0 }, text: "" } },
    ],
  });
  pres.defineSlideMaster({
    title: "QGX Content",
    background: { color: HEX.lt1 },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: MX, y: 0.35, w: CW, h: 0.85, fontSize: 36, bold: true,
        color: C.text1, align: "left", valign: "middle", margin: 0 }, text: "" } },
      footer,
    ],
    slideNumber: { x: W - MX - 0.8, y: 7.0, w: 0.8, h: 0.3, fontSize: 10, color: HEX.accent5, align: "right" },
  });
  pres.defineSlideMaster({
    title: "QGX Closing",
    background: { color: HEX.dk2 },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 0.9, w: 8.0, h: 1.1, fontSize: 54, bold: true,
        color: C.background1, align: "left", valign: "bottom", margin: 0 }, text: "" } },
      { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 2.1, w: 7.6, h: 0.6, fontSize: 22,
        color: C.background2, valign: "top", margin: 0 }, text: "" } },
    ],
  });

  // ---------------------------------------------------------------- building blocks
  let section = null;
  const newSlide = (layout, title, sectionTitle) => {
    if (sectionTitle !== section) {
      pres.addSection({ title: sectionTitle });
      section = sectionTitle;
    }
    const s = pres.addSlide({ masterName: layout, sectionTitle });
    if (title) s.addText(title, { placeholder: "title" });
    return s;
  };
  const text = (s, t, o) => s.addText(t, { isTextBox: true, margin: 0, valign: "top", color: C.text1, fontSize: 15, ...o });
  const card = (s, x, y, w, h, name, fill = C.background2) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: { color: fill }, objectName: name });
  const badge = (s, icon, x, y, d, fill, name) => {
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill }, objectName: `${name} circle` });
    s.addImage({ data: icon, x: x + d * 0.24, y: y + d * 0.24, w: d * 0.52, h: d * 0.52, objectName: `${name} icon` });
  };
  const numberBadge = (s, n, x, y, d, fill, name) => {
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill }, objectName: `${name} circle` });
    text(s, String(n), { x, y, w: d, h: d, fontFace: "+mj-lt", fontSize: 24, bold: true, color: C.background1,
      align: "center", valign: "middle", objectName: `${name} number` });
  };
  const bigRuns = (value, size) => value.split("→").flatMap((part, i) => (i === 0 ? [{ text: part }] :
    [{ text: "→", options: { fontFace: "+mn-lt", fontSize: Math.round(size * 0.8), bold: false } }, { text: part }]));
  const stat = (s, value, label, x, y, w, color = C.accent1, size = 40, labelSize = 15) => {
    text(s, bigRuns(value, size), { x, y, w, h: size / 60 + 0.2, fontFace: "+mj-lt", fontSize: size, bold: true, color,
      valign: "bottom" });
    text(s, label, { x, y: y + size / 60 + 0.25, w, h: 0.8, fontSize: labelSize, color: C.text1 });
  };
  const caption = (s, t, x, y, w, h = 0.35) => text(s, t, { x, y, w, h, fontSize: 11, color: HEX.muted, italic: true });
  const chartBase = (extra) => ({ // a fresh options object for every chart (pptxgenjs mutates options)
    catAxisLabelColor: HEX.muted, valAxisLabelColor: HEX.muted, catAxisLabelFontFace: "+mn-lt",
    valAxisLabelFontFace: "+mn-lt", catAxisLabelFontSize: 12, valAxisLabelFontSize: 11,
    valGridLine: { color: HEX.grid, size: 0.5 }, catGridLine: { style: "none" },
    catAxisLineShow: true, valAxisLineShow: false,
    showValue: true, dataLabelColor: HEX.dk1, dataLabelFontSize: 12, dataLabelFontFace: "+mn-lt",
    showTitle: true, titleFontFace: "+mn-lt", titleFontSize: 14, titleColor: HEX.dk1,
    legendFontFace: "+mn-lt", legendFontSize: 12, legendColor: HEX.dk1,
    ...extra,
  });

  // =====================================================================
  // 1. Title
  // =====================================================================
  let s = newSlide("QGX Title", null, "Introduction");
  text(s, "CAPSTONE PROJECT CPG 218  ·  MENTOR EVALUATION", { x: 0.8, y: 1.45, w: 8, h: 0.4, fontSize: 14, bold: true,
    color: C.background2, charSpacing: 2 });
  s.addText("QGenomix", { placeholder: "title" });
  s.addText("Quantum-assisted genetic screening for early-onset type 2 diabetes in lean South Asians",
    { placeholder: "body" });
  text(s, "TEAM", { x: 0.8, y: 4.55, w: 3, h: 0.3, fontSize: 12, bold: true, color: C.background2, charSpacing: 2 });
  text(s, TEAM.map(([n, r], i) => ({ text: `${n}  ·  ${r}`, options: { breakLine: i < TEAM.length - 1 } })),
    { x: 0.8, y: 4.9, w: 4.9, h: 1.7, fontSize: 15, color: C.background1, paraSpaceAfter: 2 });
  text(s, "MENTOR", { x: 6.0, y: 4.55, w: 3, h: 0.3, fontSize: 12, bold: true, color: C.background2, charSpacing: 2 });
  text(s, [
    { text: MENTOR, options: { bold: true, fontSize: 17, breakLine: true } },
    { text: "Assistant Professor, CSED", options: { breakLine: true } },
    { text: " ", options: { fontSize: 8, breakLine: true } },
    { text: "Computer Science and Engineering Department", options: { fontSize: 12, breakLine: true } },
    { text: "Thapar Institute of Engineering and Technology", options: { fontSize: 12, breakLine: true } },
    { text: "Patiala  ·  October 2026", options: { fontSize: 12 } },
  ], { x: 6.0, y: 4.9, w: 3.6, h: 1.9, fontSize: 15, color: C.background1 });
  badge(s, ICON.dna, 9.55, 1.25, 3.0, C.accent1, "DNA");
  badge(s, ICON.atom, 11.35, 3.95, 1.45, C.accent2, "Quantum");
  s.addNotes("Introduce the team and the mentor. One sentence on the project: QGenomix asks how much genetics adds to " +
    "India's diabetes screening for lean South Asians, and tests honestly whether quantum computing helps find " +
    "interacting genes. Today: the problem, what we built since the mid-semester review, the results, the working " +
    "application, and the plan for the final panel.");

  // =====================================================================
  // 2. Problem
  // =====================================================================
  s = newSlide("QGX Content", "Lean South Asians slip through screening", "Introduction");
  stat(s, "101 M", "adults with diabetes in India", MX, 1.5, 4.6, C.accent3, 60, 18);
  stat(s, "136 M", "adults with prediabetes", MX, 3.55, 4.6, C.accent3, 60, 18);
  caption(s, "Source: ICMR-INDIAB-17 national survey (Lancet Diabetes Endocrinol., 2023)", MX, 5.75, 4.9);
  const problems = [
    [ICON.weight, "A BMI rule misses them", "South Asians develop type 2 diabetes younger and at a lower body " +
      "weight than Europeans, so BMI-based screening misses lean people at risk."],
    [ICON.clipboard, "The IDRS cannot see genes", "India's screening questionnaire scores age, waist, activity and " +
      "family history, so a young, slim person scores low even with high inherited risk."],
  ];
  problems.forEach(([icon, head, body], i) => {
    const y = 1.55 + i * 2.55;
    card(s, 5.9, y, 6.83, 2.25, `Problem card ${i + 1}`);
    badge(s, icon, 6.2, y + 0.35, 0.85, C.accent3, `Problem ${i + 1}`);
    text(s, head, { x: 7.35, y: y + 0.35, w: 5.1, h: 0.45, fontSize: 20, bold: true });
    text(s, body, { x: 7.35, y: y + 0.9, w: 5.1, h: 1.2, fontSize: 15 });
  });
  s.addNotes("India has about 101 million adults with diabetes. South Asians get it younger and thinner, so the two " +
    "screening tools in use both have a blind spot: a BMI rule never flags a lean person, and the IDRS questionnaire " +
    "has no way to see genetic risk in someone young and slim. That lean, high-risk group is our target.");

  // =====================================================================
  // 3. Questions
  // =====================================================================
  s = newSlide("QGX Content", "What QGenomix sets out to answer", "Introduction");
  const questions = [
    ["How much does genetics add to India's screening questionnaire, especially for lean people?",
      "Polygenic and mechanism scores on real genomes (E1, E8)", C.accent1],
    ["Do insulin-production (β-cell) and fat-distribution (lipodystrophy) variants interact, and can quantum " +
      "optimisation help find them?", "Score test, QUBO, QAOA and a quantum encoder (E2–E7b)", C.accent2],
  ];
  questions.forEach(([q, how, color], i) => {
    const x = MX + i * 6.215;
    card(s, x, 1.55, 5.915, 3.35, `Question card ${i + 1}`);
    numberBadge(s, i + 1, x + 0.35, 1.85, 0.75, color, `Question ${i + 1}`);
    text(s, q, { x: x + 0.35, y: 2.8, w: 5.25, h: 1.45, fontSize: 19, bold: true });
    text(s, how, { x: x + 0.35, y: 4.35, w: 5.2, h: 0.4, fontSize: 14, color: HEX.muted, italic: true });
  });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: MX, y: 5.25, w: CW, h: 1.3, rectRadius: 0.12,
    fill: { color: C.background1 }, line: { color: C.accent2, width: 1.25 }, objectName: "Control principle outline" });
  badge(s, ICON.atom, MX + 0.35, 5.47, 0.85, C.accent2, "Control principle");
  text(s, [
    { text: "Every quantum component has a classical control: ", options: { bold: true } },
    { text: "simulated annealing for QAOA, and the same circuit without entanglement plus a classical network of " +
      "similar size for the quantum encoder." },
  ], { x: MX + 1.5, y: 5.47, w: CW - 1.85, h: 0.9, fontSize: 16, valign: "middle" });
  s.addNotes("Two questions drive everything. The first is clinical: what does genetics add to the IDRS, and does it " +
    "help the lean people current screening misses? The second is scientific and technical: do two diabetes " +
    "mechanisms interact, and does quantum optimisation help find the interacting pairs? Because quantum claims are " +
    "easy to overstate, every quantum step has a matched classical control.");

  // =====================================================================
  // 4. Progress since mid-semester
  // =====================================================================
  s = newSlide("QGX Content", "Progress since the mid-semester review", "Progress");
  const objectives = [["Data pipeline", 1.0], ["Quantum encoder", 0.2], ["Classical baselines + PRS", 0.15],
    ["Hybrid ensemble", 0.0], ["SHAP refinement loop*", 0.0], ["Benchmark + statistical tests", 0.1]].reverse();
  s.addChart(pres.charts.BAR, [
    { name: "At mid-semester", labels: objectives.map((o) => o[0]), values: objectives.map((o) => o[1]) },
    { name: "Now", labels: objectives.map((o) => o[0]), values: objectives.map(() => 1.0) },
  ], chartBase({
    x: MX, y: 1.4, w: 7.3, h: 5.05, barDir: "bar", barGrouping: "clustered", barGapWidthPct: 60,
    chartColors: [HEX.accent5, HEX.accent1], valAxisMinVal: 0, valAxisMaxVal: 1.0, valAxisMajorUnit: 0.25,
    valAxisLabelFormatCode: "0%", dataLabelFormatCode: "0%", dataLabelPosition: "outEnd", dataLabelFontSize: 11,
    showLegend: true, legendPos: "b", title: "Approved objectives: progress",
  }));
  caption(s, `*Built and measured, then replaced: the score test with QUBO selection found ${pc(edrScore)} of planted ` +
    `pairs, SHAP ranking ${pc(edrShap)}.`, MX, 6.5, 7.3, 0.4);
  text(s, "Added beyond the plan", { x: 8.35, y: 1.5, w: 4.38, h: 0.45, fontSize: 20, bold: true });
  const extras = [[ICON.atom, "QAOA with error mitigation", C.accent2], [ICON.clipboard, "Clinical factors and the IDRS", C.accent1],
    [ICON.shield, "Real-genome, fairness and robustness tests", C.accent1], [ICON.dna, "LD imputation for consumer DNA files", C.accent1],
    [ICON.laptop, "App with PDF report, REST API and Docker", C.accent1]];
  extras.forEach(([icon, label, color], i) => {
    const y = 2.15 + i * 0.86;
    badge(s, icon, 8.35, y, 0.6, color, `Extra ${i + 1}`);
    text(s, label, { x: 9.15, y, w: 3.58, h: 0.6, fontSize: 15, valign: "middle" });
  });
  s.addNotes("At mid-semester only the data pipeline was complete. All six approved objectives are now done; the SHAP " +
    "refinement loop was built and measured, but the score test with QUBO selection found far more of the planted " +
    "pairs, so it replaced the loop and SHAP is now used for per-person explanations. On the right is what we added " +
    "beyond the plan.");

  // =====================================================================
  // 5. Data
  // =====================================================================
  s = newSlide("QGX Content", "Real genomes, simulated outcomes", "Approach");
  const sources = [
    [ICON.dna, "1000 Genomes", ["2,504 real genomes", "84 million variants", "489 South Asians: 978 haplotypes"], C.accent1],
    [ICON.chart, "Published scores", ["D-PRISM South Asian PRS: 1.34 M variants", "5 mechanism scores, 62 SNPs",
      "1,263 cross-mechanism SNP pairs"], C.accent4],
    [ICON.users, "Synthetic cohort", ["10,000 South Asians as haplotype mosaics", "Simulated T2D, 11% prevalence",
      "10 planted gene pairs: known truth"], C.accent2],
  ];
  sources.forEach(([icon, head, lines, color], i) => {
    const x = MX + i * 4.14;
    card(s, x, 1.55, 3.85, 3.65, `Data card ${i + 1}`);
    badge(s, icon, x + 0.35, 1.85, 0.9, color, `Data ${i + 1}`);
    text(s, head, { x: x + 0.35, y: 2.95, w: 3.2, h: 0.45, fontSize: 20, bold: true });
    text(s, lines.map((l, j) => ({ text: l, options: { bullet: true, breakLine: j < lines.length - 1 } })),
      { x: x + 0.35, y: 3.5, w: 3.25, h: 1.6, fontSize: 15, paraSpaceAfter: 6 });
  });
  text(s, [
    { text: "Why simulate the outcomes? ", options: { bold: true } },
    { text: "A known ground truth lets every discovery claim be checked. The synthetic cohort matches real South Asian " +
      "allele frequencies (r = 0.9999), and models are re-tested on the real genomes." },
  ], { x: MX, y: 5.5, w: CW, h: 0.9, fontSize: 16 });
  s.addNotes("Genotypes are real: all 2,504 people in 1000 Genomes, including 489 South Asians. Risk weights are " +
    "published: the D-PRISM score trained for South Asians and five mechanism scores. To score discovery exactly we " +
    "simulate outcomes on 10,000 synthetic South Asians assembled from real haplotypes, with ten planted gene pairs " +
    "that we know are true.");

  // =====================================================================
  // 6. Architecture
  // =====================================================================
  s = newSlide("QGX Content", "Eight stages, two of them quantum", "Approach");
  s.addImage({ path: FIG("fig_architecture.png"), x: (W - 9.3) / 2, y: 1.35, w: 9.3, h: 9.3 * 1210 / 2081,
    objectName: "Architecture diagram" });
  s.addNotes("Walk the pipeline: data preparation, cohort and simulator, interaction search, pair selection (QUBO with " +
    "annealing and QAOA), the quantum encoder, the model zoo of 17 predictors, the evaluation (15 experiments), and " +
    "the risk-report application. The purple stages are quantum; each has a classical control.");

  // =====================================================================
  // 7. Quantum
  // =====================================================================
  s = newSlide("QGX Content", "Where the quantum computing comes in", "Approach");
  const qrows = [
    [ICON.cubes, "QUBO pair selection", "Pick 48 non-redundant pairs from the 200 strongest: reward relevance, " +
      "penalise pairs that share a SNP. Solved by simulated annealing."],
    [ICON.atom, "QAOA", "The same selection on a quantum circuit: a constraint-preserving XY mixer started from a " +
      "Dicke state, tested on the IBM Kingston noise model with error mitigation."],
    [ICON.microchip, "Variational pair encoder", "8 qubits, 4 layers, 64 shared angles: 12 circuits turn the 48 " +
      "pairs into 96 features for the model."],
  ];
  qrows.forEach(([icon, head, body], i) => {
    const y = 1.55 + i * 1.75;
    badge(s, icon, MX, y, 0.8, C.accent2, `Quantum ${i + 1}`);
    text(s, head, { x: MX + 1.05, y, w: 5.2, h: 0.4, fontSize: 19, bold: true });
    text(s, body, { x: MX + 1.05, y: y + 0.45, w: 5.2, h: 1.1, fontSize: 15 });
  });
  s.addImage({ path: FIG("fig_circuit.png"), x: 7.2, y: 1.6, w: 5.5, h: 5.5 * 1472 / 2112, objectName: "Circuit diagram" });
  caption(s, "The pair encoder, two of its four layers: data rotations, trainable RY/RZ, a chain of CZ gates",
    7.2, 5.55, 5.5, 0.5);
  s.addNotes("Quantum computing appears in two places. Choosing a non-redundant set of gene pairs is a QUBO, which we " +
    "solve classically and with QAOA; our QAOA uses an XY mixer that only explores valid selections. The selected " +
    "pairs are then encoded by an 8-qubit variational circuit whose entanglement lets a feature depend on both SNPs " +
    "of a pair.");

  // =====================================================================
  // 8. Genetics adds to screening
  // =====================================================================
  s = newSlide("QGX Content", "Genetics adds to clinical screening", "Results");
  const e1bars = [["BMI rule", "M1_bmi"], ["IDRS", "M0_idrs"], ["PRS only", "M2_prs"], ["Clinical factors", "M3c_clinical"],
    ["Clinical + genetics", "M3_additive"], ["Stacked hybrid", "M12_stack"]];
  s.addChart(pres.charts.BAR, [{ name: "Test AUC", labels: e1bars.map((b) => b[0]), values: e1bars.map((b) => auc(b[1])) }],
    chartBase({
      x: MX, y: 1.4, w: 7.6, h: 5.2, barDir: "col", barGapWidthPct: 45,
      chartColors: [HEX.accent5, HEX.accent5, HEX.accent5, HEX.accent5, HEX.accent1, HEX.accent1],
      valAxisMinVal: 0.5, valAxisMaxVal: 0.9, valAxisMajorUnit: 0.1, valAxisLabelFormatCode: "0.0",
      dataLabelFormatCode: "0.000", dataLabelPosition: "outEnd", showLegend: false,
      title: "Test AUC, 2,000 held-out people × 3 seeds",
    }));
  stat(s, `+${f3(auc("M3_additive") - auc("M3c_clinical"))}`, "AUC from genetics on top of all clinical factors",
    8.75, 1.6, 3.98, C.accent1, 54, 17);
  text(s, "DeLong p ≤ 4×10⁻⁶ in every seed", { x: 8.75, y: 3.6, w: 3.98, h: 0.4, fontSize: 14, color: HEX.muted });
  stat(s, `${f3(qMin)}–${f3(qMax)}`, "AUC of the quantum variants: no significant gain over classical", 8.75, 4.4,
    3.98, C.accent2, 30, 15);
  s.addNotes(`The IDRS alone reaches ${f3(auc("M0_idrs"))}; clinical factors ${f3(auc("M3c_clinical"))}. Adding the ` +
    `PRS and mechanism scores lifts this to ${f3(auc("M3_additive"))}, significant in every seed. The stacked hybrid ` +
    `is best at ${f3(auc("M12_stack"))} but not significantly better than the additive model, and the quantum ` +
    "variants do not beat their classical counterparts.");

  // =====================================================================
  // 9. Lean blind spot
  // =====================================================================
  s = newSlide("QGX Content", "Genes find the lean cases screening misses", "Results");
  card(s, MX, 1.55, 4.55, 4.95, "Lean headline card");
  text(s, bigRuns(`${pc(lean("M0_idrs"))} → ${pc(lean("M3_additive"))}`, 54), { x: MX + 0.35, y: 1.9, w: 4.0, h: 1.1,
    fontFace: "+mj-lt", fontSize: 54, bold: true, color: C.accent1, valign: "bottom" });
  text(s, "of lean diabetes cases (BMI < 23) caught in the top 20% of risk: IDRS questionnaire → with genetics",
    { x: MX + 0.35, y: 3.15, w: 3.9, h: 1.4, fontSize: 17 });
  text(s, "A BMI rule catches none of them by construction.", { x: MX + 0.35, y: 4.75, w: 3.9, h: 0.8, fontSize: 15,
    color: HEX.muted, italic: true });
  const leanBars = [["BMI rule", "M1_bmi"], ["IDRS", "M0_idrs"], ["Clinical factors", "M3c_clinical"],
    ["Clinical + genetics", "M3_additive"]];
  s.addChart(pres.charts.BAR, [{ name: "Lean cases caught", labels: leanBars.map((b) => b[0]),
    values: leanBars.map((b) => lean(b[1])) }], chartBase({
    x: 5.55, y: 1.4, w: 7.18, h: 5.2, barDir: "col", barGapWidthPct: 55,
    chartColors: [HEX.accent5, HEX.accent5, HEX.accent5, HEX.accent1], valAxisMinVal: 0, valAxisMaxVal: 0.7,
    valAxisMajorUnit: 0.1, valAxisLabelFormatCode: "0%", dataLabelFormatCode: "0%", dataLabelPosition: "outEnd",
    showLegend: false, title: "Lean cases caught when the top 20% by risk are screened",
  }));
  s.addNotes("This is the main clinical result. Among lean people who develop diabetes, the BMI rule flags none, the " +
    `IDRS ${pc(lean("M0_idrs"))}, a clinical model ${pc(lean("M3c_clinical"))}. Adding genetics raises this to ` +
    `${pc(lean("M3_additive"))}. Genetics helps most for exactly the people current screening misses.`);

  // =====================================================================
  // 10. Interaction discovery
  // =====================================================================
  s = newSlide("QGX Content", "The search finds the planted gene pairs", "Results");
  s.addChart(pres.charts.LINE, [{ name: "Score test", labels: e3n.map((n) => n.toLocaleString("en-IN")),
    values: e3n.map((n) => e3[String(n)].edr10_score) }], chartBase({
    x: MX, y: 1.4, w: 7.1, h: 5.2, chartColors: [HEX.accent1], lineSize: 3, lineDataSymbol: "circle",
    lineDataSymbolSize: 9, valAxisMinVal: 0, valAxisMaxVal: 1.0, valAxisMajorUnit: 0.25, valAxisLabelFormatCode: "0%",
    dataLabelFormatCode: "0%", dataLabelPosition: "t", showLegend: false,
    title: "Planted pairs found in the top 10, by cohort size", catAxisTitle: "people in the cohort",
    showCatAxisTitle: true, catAxisTitleFontSize: 12, catAxisTitleColor: HEX.muted, catAxisTitleFontFace: "+mn-lt",
  }));
  const findings = [
    ["70–84%", "of planted pairs in the top 10 at 10,000 people; PLINK BOOST finds 40–48%"],
    ["18 of 20", "runs with no true interaction report nothing (λ = 1.05)"],
    [`${Math.round(e6.qubo.distinct_snps)} vs ${Math.round(e6.topk.distinct_snps)}`,
      `distinct SNPs covered by QUBO vs top-K, with ${Math.round(100 * (1 - e6.qubo.shadow_pairs / e6.topk.shadow_pairs))}% fewer redundant pairs`],
  ];
  findings.forEach(([v, l], i) => stat(s, v, l, 8.15, 1.45 + i * 1.75, 4.58, C.accent1, 34, 15));
  s.addNotes("With 10,000 people the score test puts 70 to 84 percent of the planted pairs in its top ten, against " +
    "40 to 48 percent for PLINK's BOOST, and the curve shows how discovery grows with cohort size. With no true " +
    "interaction it stays quiet: 18 of 20 null runs report nothing. QUBO selection covers more distinct SNPs and " +
    "wastes fewer slots on redundant shadow pairs than plain top-K.");

  // =====================================================================
  // 11. Quantum results
  // =====================================================================
  s = newSlide("QGX Content", "Quantum results, measured honestly", "Results");
  const mitBars = [["Noisy", e7b.raw], ["+ readout", e7b.readout], ["+ post-selection", e7b.readout_postselect],
    ["+ zero-noise", e7b.readout_postselect_zne], ["Noise-free", e7b.ideal_postselect]];
  s.addChart(pres.charts.BAR, [{ name: "Approximation ratio", labels: mitBars.map((b) => b[0]),
    values: mitBars.map((b) => b[1]) }], chartBase({
    x: MX, y: 1.4, w: 7.1, h: 5.2, barDir: "col", barGapWidthPct: 45,
    chartColors: [HEX.purple1, HEX.purple2, HEX.purple3, HEX.accent2, HEX.dk1], valAxisMinVal: 0, valAxisMaxVal: 1.0,
    valAxisMajorUnit: 0.25, valAxisLabelFormatCode: "0.00", dataLabelFormatCode: "0.00", dataLabelPosition: "outEnd",
    showLegend: false, title: "XY-mixer QAOA on the IBM noise model, depth 1",
  }));
  card(s, 8.0, 1.55, 4.73, 5.0, "Quantum findings card");
  const qfind = [
    `Entanglement adds nothing: ${f3(auc("H_vqc"))} with it, ${f3(auc("H_noent"))} without, ${f3(auc("H_twin"))} for a classical twin.`,
    "On an ideal simulator the XY mixer beats textbook QAOA (0.76 vs 0.30 at depth 1).",
    `Hardware noise drops both to about 0.3; mitigation brings the XY circuit back to ${f2(e7b.readout_postselect_zne)} (noise-free ${f2(e7b.ideal_postselect)}, random choice ${f2(e7b.random_valid)}).`,
    "No speed-up is claimed: an 8-qubit circuit can be simulated exactly.",
  ];
  text(s, qfind.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < qfind.length - 1 } })),
    { x: 8.3, y: 1.8, w: 4.15, h: 4.5, fontSize: 16, paraSpaceAfter: 12, valign: "middle" });
  s.addNotes("We report the quantum results as they are. The encoder performs the same with and without " +
    "entanglement. QAOA with our XY mixer clearly beats the textbook form on an ideal simulator, but realistic IBM " +
    "noise destroys both. Error mitigation recovers most of it: readout correction, post-selection on the conserved " +
    "pair count, and zero-noise extrapolation take the XY circuit from 0.31 to 0.75, close to the noise-free 0.76. " +
    `The penalty form reaches only ${f2(e7bPen.readout_postselect_zne)}, the level of a random valid choice.`);

  // =====================================================================
  // 12. Fairness and robustness
  // =====================================================================
  s = newSlide("QGX Content", "Fair across groups, robust to assumptions", "Results");
  s.addChart(pres.charts.BAR, [
    { name: "Clinical factors only", labels: POPS.map((p) => p[1]), values: POPS.map(([k]) => e11[k].auc_clinical) },
    { name: "Clinical + genetics", labels: POPS.map((p) => p[1]), values: POPS.map(([k]) => e11[k].auc_genetic) },
  ], chartBase({
    x: MX, y: 1.4, w: 7.7, h: 5.2, barDir: "col", barGrouping: "clustered", barGapWidthPct: 50,
    chartColors: [HEX.accent5, HEX.accent1], valAxisMinVal: 0.7, valAxisMaxVal: 0.95, valAxisMajorUnit: 0.05,
    valAxisLabelFormatCode: "0.00", dataLabelFormatCode: "0.00", dataLabelPosition: "outEnd", dataLabelFontSize: 10,
    showLegend: true, legendPos: "b", title: "AUC on the 489 real South Asian genomes, by group",
  }));
  stat(s, `${nAucWin} / ${settings.length}`, "simulator settings where genetics beats clinical factors", 8.75, 1.45,
    3.98, C.accent1, 48, 15);
  stat(s, `${nLeanWin} / ${settings.length}`, "settings where it catches more lean cases than the IDRS", 8.75, 3.15,
    3.98, C.accent1, 48, 15);
  text(s, `AUC gain in every South Asian population: +${f2(Math.min(...popGain))} to +${f2(Math.max(...popGain))}. ` +
    `Risk runs about ${Math.round(100 * (1 - e11.all.oe[0]))}% high on real genomes, equally in every group, so ` +
    "local recalibration fixes it.", { x: 8.75, y: 4.95, w: 3.98, h: 1.6, fontSize: 14, color: HEX.muted });
  s.addNotes("Two checks of trust. Fairness: on the real South Asian genomes, genetics improves on clinical factors " +
    "in every population and in men and women. Robustness: because outcomes are simulated, we changed one " +
    `assumption at a time in ${settings.length} settings; genetics wins in all of them.`);

  // =====================================================================
  // 13. Consumer DNA files
  // =====================================================================
  s = newSlide("QGX Content", "Consumer DNA files: filling the gaps", "Results");
  const covs = e13.coverages;
  s.addChart(pres.charts.LINE, [
    { name: "Fill with the population average", labels: covs.map((c) => `${Math.round(100 * c)}%`),
      values: covs.map((c) => at("mean_fill", ERR_T, c)) },
    { name: "LD imputation", labels: covs.map((c) => `${Math.round(100 * c)}%`), values: covs.map((c) => at("ld_impute", ERR_T, c)) },
  ], chartBase({
    x: MX, y: 1.4, w: 7.1, h: 5.2, chartColors: [HEX.accent5, HEX.accent1], lineSize: 3, lineDataSymbol: "circle",
    lineDataSymbolSize: 9, valAxisMinVal: 0, valAxisMaxVal: 20, valAxisMajorUnit: 5, valAxisLabelFormatCode: "0",
    dataLabelFormatCode: "0.0", dataLabelPosition: "t", showLegend: true, legendPos: "b",
    title: "Error in the reported risk percentile (points)", catAxisTitle: "share of risk-score variants in the file",
    showCatAxisTitle: true, catAxisTitleFontSize: 12, catAxisTitleColor: HEX.muted, catAxisTitleFontFace: "+mn-lt",
  }));
  text(s, "At 45% coverage, typical of a 23andMe file", { x: 8.15, y: 1.5, w: 4.58, h: 0.4, fontSize: 15, bold: true,
    color: HEX.muted });
  const dna = [
    [`${Math.round(at("mean_fill", ERR_T, 0.45))} → ${Math.round(at("ld_impute", ERR_T, 0.45))}`, "points of error in the risk percentile"],
    [`${pc(at("mean_fill", HIGH_T, 0.45))} → ${pc(at("ld_impute", HIGH_T, 0.45))}`, "of truly high-risk people still flagged high"],
    [`${f2(at("mean_fill", PRS_T, 0.45))} → ${f2(at("ld_impute", PRS_T, 0.45))}`, "correlation with the full-genome PRS"],
  ];
  dna.forEach(([v, l], i) => stat(s, v, l, 8.15, 2.0 + i * 1.5, 4.58, C.accent1, 34, 15));
  caption(s, "Each missing variant is predicted from its best-correlated measured neighbour in 489 South Asian " +
    "genomes; about one second per genome.", 8.15, 6.2, 4.58, 0.6);
  s.addNotes("Consumer chips measure about half the variants of the risk score. Filling the gaps with the average " +
    "pulls everyone to the middle and hides high-risk people. Our LD imputation predicts each missing variant from " +
    "its best-correlated measured neighbour; at typical coverage it halves the error and keeps most high-risk people " +
    "flagged.");

  // =====================================================================
  // 14. Application
  // =====================================================================
  s = newSlide("QGX Content", "The working application", "Product");
  const dashH = 4.55, dashW = dashH * 1180 / 1200, pdfW = dashH * 1240 / 1754;
  s.addImage({ path: path.join(ROOT, "docs/report/asha_top.png"), x: MX, y: 1.45, w: dashW, h: dashH,
    objectName: "Dashboard screenshot" });
  s.addImage({ path: FIG("app_pdf_report.png"), x: MX + dashW + 0.3, y: 1.45, w: pdfW, h: dashH,
    objectName: "PDF report" });
  caption(s, "Dashboard report for a synthetic demo persona", MX, 6.1, dashW, 0.35);
  caption(s, "The one-page PDF", MX + dashW + 0.3, 6.1, pdfW, 0.35);
  const appX = MX + dashW + pdfW + 0.65;
  const feats = ["Reads 23andMe and AncestryDNA files", "Fills in missing variants (LD imputation)",
    "Risk tier, percentile, IDRS and screening flags", "Mechanism profile and SHAP-ranked gene pairs",
    "Live lifestyle what-ifs", "PDF report, REST API and Docker image"];
  text(s, feats.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < feats.length - 1 } })),
    { x: appX, y: 1.5, w: W - MX - appX, h: 4.6, fontSize: 15, paraSpaceAfter: 10 });
  s.addNotes("This is the product. A user uploads a 23andMe or AncestryDNA file and answers six questions. The app " +
    "imputes missing variants, shows the risk with its percentile and the IDRS, flags people the BMI rule or the IDRS " +
    "would miss, explains which mechanisms and gene pairs drive the risk, and lets them try lifestyle changes. The " +
    "same report downloads as a PDF, and everything runs from one Docker image. Live demo: make app.");

  // =====================================================================
  // 15. Engineering
  // =====================================================================
  s = newSlide("QGX Content", "Built to be checked", "Product");
  const tiles = [
    [ICON.vial, String(nTests), "automated tests, run on every push with GitHub Actions"],
    [ICON.flask, "15", "experiments, from data checks to robustness"],
    [ICON.sitemap, "17", "predictors compared on identical data splits"],
    [ICON.code, String(pyFiles.length), `Python modules, ${srcLines.toLocaleString("en-IN")} lines`],
    [ICON.sync, "Bit for bit", "re-runs reproduce the stored results"],
    [ICON.docker, "1 command", "docker compose up runs the app anywhere"],
  ];
  tiles.forEach(([icon, v, l], i) => {
    const x = MX + (i % 3) * 4.14, y = 1.55 + Math.floor(i / 3) * 2.6;
    card(s, x, y, 3.85, 2.3, `Engineering tile ${i + 1}`);
    badge(s, icon, x + 0.3, y + 0.3, 0.7, C.accent1, `Engineering ${i + 1}`);
    text(s, v, { x: x + 1.2, y: y + 0.22, w: 2.5, h: 0.85, fontFace: "+mj-lt", fontSize: v.length > 4 ? 28 : 40,
      bold: true, color: C.accent1, valign: "middle" });
    text(s, l, { x: x + 0.3, y: y + 1.2, w: 3.3, h: 0.9, fontSize: 15 });
  });
  s.addNotes("Everything can be checked. Tests cover the maths, the equivalence of our simulators with PennyLane and " +
    "Qiskit, the pipeline end to end, and the app. One configuration file drives every result, re-runs match bit for " +
    "bit, and the whole application runs with one Docker command.");

  // =====================================================================
  // 16. Plan
  // =====================================================================
  s = newSlide("QGX Content", "Next: the final panel on 9 November", "Next steps");
  const steps = [["28–31 Oct", "IBM quantum hardware run, public online demo, updated figures and report"],
    ["1–5 Nov", "Final report, paper draft, slides and a three-minute demo video"],
    ["6–9 Nov", "Test run on a clean machine and a timed rehearsal"]];
  s.addShape(pres.shapes.LINE, { x: MX + 0.4, y: 1.95, w: 2 * 4.14, h: 0, line: { color: HEX.grid, width: 2 },
    objectName: "Timeline line" });
  steps.forEach(([d, t], i) => {
    const x = MX + i * 4.14;
    numberBadge(s, i + 1, x + 0.05, 1.6, 0.7, C.accent1, `Step ${i + 1}`);
    text(s, d, { x, y: 2.5, w: 3.8, h: 0.45, fontSize: 20, bold: true });
    text(s, t, { x, y: 3.0, w: 3.6, h: 1.0, fontSize: 15 });
  });
  const kept = [
    [ICON.atom, "Kept for the panel: real IBM quantum run", "Script ready and rehearsed on the Kingston noise " +
      "model; one batched job uses about 2 of the 10 free QPU minutes.", C.accent2],
    [ICON.globe, "Kept for the panel: public online demo", "Docker image built and tested; deploy it to a free " +
      "host under a team account and share the link.", C.accent1],
  ];
  kept.forEach(([icon, head, body, color], i) => {
    const x = MX + i * 6.215;
    card(s, x, 4.45, 5.915, 2.1, `Kept card ${i + 1}`);
    badge(s, icon, x + 0.3, 4.75, 0.8, color, `Kept ${i + 1}`);
    text(s, head, { x: x + 1.3, y: 4.72, w: 4.4, h: 0.45, fontSize: 17, bold: true });
    text(s, body, { x: x + 1.3, y: 5.22, w: 4.4, h: 1.15, fontSize: 15 });
  });
  s.addNotes("Two features are deliberately kept for the final panel because each needs an account in our own name: " +
    "the run on a real IBM quantum computer, which is scripted and rehearsed, and a public online demo from the " +
    "Docker image. The rest of the time goes to the final report, a paper draft, slides, a demo video and rehearsal.");

  // =====================================================================
  // 17. Closing
  // =====================================================================
  s = newSlide("QGX Closing", null, "Next steps");
  s.addText("Thank you", { placeholder: "title" });
  s.addText("Questions and feedback are welcome", { placeholder: "body" });
  const takeaways = [
    `Genetics nearly doubles the lean diabetes cases caught (${pc(lean("M0_idrs"))} → ${pc(lean("M3_additive"))}), in every population and every setting tested.`,
    "The interaction search finds 70–84% of planted pairs and stays quiet when there are none.",
    "Quantum methods, measured against classical controls: no advantage yet, and mitigation recovers most of the noise.",
    "A working, tested application turns a consumer DNA file into an explained report.",
  ];
  text(s, takeaways.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < takeaways.length - 1 } })),
    { x: 0.8, y: 3.0, w: 8.1, h: 2.7, fontSize: 17, color: C.background1, paraSpaceAfter: 10 });
  text(s, `${TEAM.map(([n]) => n).join("  ·  ")}`, { x: 0.8, y: 6.15, w: 11.7, h: 0.35, fontSize: 13,
    color: C.background2 });
  text(s, `Mentor: ${MENTOR}, Assistant Professor, CSED, Thapar Institute of Engineering and Technology, Patiala`,
    { x: 0.8, y: 6.55, w: 11.7, h: 0.35, fontSize: 13, color: C.background2 });
  badge(s, ICON.dna, 9.75, 1.6, 2.6, C.accent1, "Closing DNA");
  s.addNotes("Close with the four takeaways and invite questions. Ask the mentor which emphasis to give the final " +
    "panel: the clinical result, the quantum study, or the application.");

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT);
  console.log("wrote", OUT, `(${pres.slides.length} slides)`);
}

// pptxgenjs writes Office's default palette into the theme; replace it with ours so scheme colours resolve correctly
async function applyTheme(file) {
  const JSZip = require(require.resolve("jszip", { paths: [require.resolve("pptxgenjs")] }));
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const part = "ppt/theme/theme1.xml";
  const slots = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];
  const scheme = `<a:clrScheme name="${THEME.name}">` +
    slots.map((k) => `<a:${k}><a:srgbClr val="${THEME.colors[k]}"/></a:${k}>`).join("") + "</a:clrScheme>";
  const xml = (await zip.file(part).async("string"))
    .replace(/<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/, () => scheme)
    .replace(/(<a:(?:theme|fontScheme)\b[^>]*?\bname=")[^"]*"/g, (_, head) => `${head}${THEME.name}"`);
  if (!xml.includes(scheme)) throw new Error("theme colour scheme not found");
  zip.file(part, xml);
  for (const name of Object.keys(zip.files).filter((n) => n.endsWith(".xml"))) {
    const bad = (await zip.file(name).async("string")).match(/<a:srgbClr val="(?![0-9A-Fa-f]{6}")[^"]*"/);
    if (bad) throw new Error(`${name} has a non-hex colour (${bad[0]}): a scheme colour was given to a hex-only option`);
  }
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

main().catch((err) => { console.error(err); process.exit(1); });
