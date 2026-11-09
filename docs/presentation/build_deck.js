// QGenomix project presentation (16:9 PowerPoint).
//
//   cd docs/presentation && npm install && npm run build
//
// One idea per slide, large text, and a named source under every outside statistic. Numbers are read from results/
// (as in the report), simple charts are native PowerPoint charts, and each slide has speaker notes. The deck is built
// on one theme and three layouts, so colours and fonts can be changed in one place.
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const sharp = require("sharp");
const Fa = require("react-icons/fa");

const ROOT = path.resolve(__dirname, "../..");
// The final evaluation version adds one slide for the live demonstration; everything else is the same deck.
const PANEL = process.argv.includes("--panel");
const OUT = path.resolve(process.argv.slice(2).find((a) => !a.startsWith("--")) ||
  path.join(ROOT, PANEL ? "QGenomix_Final_Panel_Evaluation_Presentation.pptx" : "QGenomix_Mentor_Evaluation_Presentation.pptx"));
const FIG = (f) => path.join(ROOT, "figures", f);

// ---------------------------------------------------------------- project details
const TEAM = ["Aritro Chowdhury", "Suyash Gupta", "Rishabh Sharma", "Akshat Ahuja", "Anshh Pasriccha"];
const MENTOR = "Dr. Husanbir Singh Pannu";

// ---------------------------------------------------------------- results
const R = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, "results", name), "utf8"));
const T = R("tables.json");
const e1 = T.e1.models;
const auc = (m) => e1[m].auc[0];
const lean = (m) => e1[m].lean_case_capture[0];
const f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3), pc = (x) => `${Math.round(100 * x)}%`;
const e6 = T.e6.stats;
const e7b = T.e7b.xy_p1;
const e11 = T.e11.groups;
const e12 = T.e12;
const settings = Object.keys(e12);
const dAuc = settings.map((k) => e12[k].auc_genetic - e12[k].auc_clinical);
const nAucWin = dAuc.filter((d) => d > 0).length;
const nLeanWin = settings.filter((k) => e12[k].lean_capture_genetic > e12[k].lean_capture_idrs).length;
const e13 = T.e13;
const e14 = T.e14, e15 = T.e15.summary;
const ERR_T = "Error in the risk percentile shown", HIGH_T = "High-risk people still flagged high";
const at = (method, title, cov) => e13.summary[method][title][e13.coverages.indexOf(cov)][0];
const e10 = T.e10.scenarios;
const drop = (k, w) => -e10[k][`${w}_relative_change`];
const top = T.e2[Object.keys(T.e2).at(-1)];
const nTests = fs.readdirSync(path.join(ROOT, "tests")).filter((f) => f.endsWith(".py"))
  .reduce((n, f) => n + (fs.readFileSync(path.join(ROOT, "tests", f), "utf8").match(/^def test_/gm) || []).length, 0);

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
const HEX = { ...THEME.colors, muted: "4D5F69" };
const W = 13.333, H = 7.5, MX = 0.6, CW = W - 2 * MX;
const TOP = 1.35, AREA = 5.25; // the part of a slide below the title

// ---------------------------------------------------------------- icons (white glyph, drawn on a coloured circle)
async function iconData(Icon, color = "#FFFFFF") {
  const svg = renderToStaticMarkup(React.createElement(Icon, { size: 256, color }));
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return `image/png;base64,${png.toString("base64")}`;
}
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

async function main() {
  const ICON = {};
  for (const [k, Icon] of Object.entries({
    dna: Fa.FaDna, atom: Fa.FaAtom, weight: Fa.FaWeight, clipboard: Fa.FaClipboardList, vial: Fa.FaVial,
    flask: Fa.FaFlask, sitemap: Fa.FaProjectDiagram, docker: Fa.FaDocker, globe: Fa.FaGlobeAsia, heart: Fa.FaHeartbeat,
    users: Fa.FaUsers, chart: Fa.FaChartBar, microchip: Fa.FaMicrochip, cubes: Fa.FaCubes,
  })) ICON[k] = await iconData(Icon);

  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  pres.author = TEAM.join(", ");
  pres.company = "Thapar Institute of Engineering and Technology";
  pres.title = "QGenomix";
  pres.subject = "Genetic screening for early-onset type 2 diabetes in lean South Asians";
  const C = pres.SchemeColor;

  // ---------------------------------------------------------------- layouts
  pres.defineSlideMaster({
    title: "QGX Title",
    background: { color: HEX.dk2 },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 0.7, w: 8.6, h: 1.4, fontSize: 72, bold: true,
        color: C.background1, align: "left", valign: "bottom", margin: 0 }, text: "" } },
      { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 2.25, w: 8.6, h: 1.4, fontSize: 28,
        color: C.background2, valign: "top", margin: 0 }, text: "" } },
    ],
  });
  pres.defineSlideMaster({
    title: "QGX Content",
    background: { color: HEX.lt1 },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: MX, y: 0.3, w: CW, h: 0.95, fontSize: 40, bold: true,
        color: C.text1, align: "left", valign: "middle", margin: 0 }, text: "" } },
    ],
    slideNumber: { x: W - MX - 0.8, y: 6.98, w: 0.8, h: 0.3, fontSize: 13, color: HEX.accent5, align: "right" },
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
  const text = (s, t, o) => s.addText(t, { isTextBox: true, margin: 0, valign: "top", color: C.text1, fontSize: 26, ...o });
  const card = (s, x, y, w, h, name, fill = C.background2) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.14, fill: { color: fill }, line: { color: fill }, objectName: name });
  const badge = (s, icon, x, y, d, fill, name) => {
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill }, objectName: `${name} circle` });
    s.addImage({ data: icon, x: x + d * 0.24, y: y + d * 0.24, w: d * 0.52, h: d * 0.52, objectName: `${name} icon`,
      altText: `${name} icon` });
  };
  const source = (s, t) => text(s, `Source: ${t}`, { x: MX, y: 6.68, w: CW - 1, h: 0.4, fontSize: 15, color: HEX.muted,
    valign: "middle", objectName: "Source" });
  const big = (s, value, label, o = {}) => {
    const { x = MX, y = TOP + 0.2, w = CW, size = 100, labelSize = 30, color = C.accent3 } = o;
    const h = size / 58;
    text(s, value, { x, y, w, h, fontFace: "+mj-lt", fontSize: size, bold: true, color, valign: "bottom", objectName: "Number" });
    text(s, label, { x, y: y + h + 0.12, w, h: labelSize / 72 * 2.6, fontSize: labelSize, objectName: "Number label" });
  };
  // the largest size that fits the area under the title, centred
  const figure = (s, file, alt, o = {}) => {
    const { x = MX, y = TOP, w = CW, h = AREA } = o;
    const size = pngSize(FIG(file));
    const k = Math.min(w / size.w, h / size.h);
    s.addImage({ path: FIG(file), x: x + (w - size.w * k) / 2, y: y + (h - size.h * k) / 2, w: size.w * k, h: size.h * k,
      objectName: "Figure", altText: alt });
  };
  const chartBase = (extra) => ({ // a fresh options object for every chart (pptxgenjs mutates options)
    x: MX, y: TOP, w: CW, h: AREA,
    catAxisLabelColor: HEX.dk1, catAxisLabelFontFace: "+mn-lt", catAxisLabelFontSize: 20, catAxisLineShow: true,
    valAxisHidden: true, valAxisLineShow: false, valGridLine: { style: "none" }, catGridLine: { style: "none" },
    showValue: true, dataLabelColor: HEX.dk1, dataLabelFontSize: 22, dataLabelFontBold: true, dataLabelFontFace: "+mn-lt",
    showTitle: false, showLegend: false, legendFontFace: "+mn-lt", legendFontSize: 20, legendColor: HEX.dk1,
    dataLabelPosition: "outEnd", barGapWidthPct: 45,
    ...extra,
  });
  const GREY = HEX.accent5, TEAL = HEX.accent1, RED = HEX.accent3, PURPLE = HEX.accent2;
  const axisTitle = (t) => ({ showCatAxisTitle: true, catAxisTitle: t, catAxisTitleFontSize: 20, catAxisTitleColor: HEX.dk1,
    catAxisTitleFontFace: "+mn-lt" });

  // =====================================================================
  // Title
  // =====================================================================
  let s = newSlide("QGX Title", null, "The problem");
  s.addText("QGenomix", { placeholder: "title" });
  s.addText("A quantum-classical framework to find lean South Asians at high risk of type 2 diabetes", { placeholder: "body" });
  badge(s, ICON.dna, 10.0, 0.75, 2.5, C.accent1, "DNA");
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: MX, y: 4.0, w: CW, h: 2.95, rectRadius: 0.15,
    fill: { color: C.background1, transparency: 91 }, line: { color: C.background1, transparency: 100 },
    objectName: "People panel" });
  text(s, "Presented by", { x: 1.0, y: 4.25, w: 6, h: 0.4, fontSize: 20, color: C.background2 });
  TEAM.forEach((n, i) => text(s, n, { x: 1.0 + (i % 2) * 3.55, y: 4.8 + Math.floor(i / 2) * 0.62, w: 3.5, h: 0.5,
    fontSize: 24, bold: true, color: C.background1, objectName: `Member ${i + 1}` }));
  text(s, "Guided by", { x: 8.4, y: 4.25, w: 4.1, h: 0.4, fontSize: 20, color: C.background2 });
  text(s, [
    { text: MENTOR, options: { bold: true, fontSize: 24, color: C.background1, breakLine: true } },
    { text: "Assistant Professor, CSED", options: { fontSize: 20, color: C.background2, breakLine: true } },
    { text: "Thapar Institute of Engineering and Technology, Patiala", options: { fontSize: 20, color: C.background2 } },
  ], { x: 8.4, y: 4.8, w: 4.2, h: 2.0, paraSpaceAfter: 4, objectName: "Guide" });
  s.addNotes("Introduce the team and our guide. One sentence on the project: we want to find South Asians who look " +
    "healthy and slim but carry a high inherited risk of type 2 diabetes.");

  // =====================================================================
  // The problem (no solution and no quantum here)
  // =====================================================================
  s = newSlide("QGX Content", "India's diabetes crisis", "The problem");
  big(s, "101 million", "Indians live with diabetes", { size: 104 });
  big(s, "136 million", "more have prediabetes", { y: 4.1, size: 66, labelSize: 28, color: C.accent4 });
  source(s, "ICMR-INDIAB, The Lancet Diabetes & Endocrinology, June 2023; The Tribune, 10 June 2023");
  s.addNotes("The ICMR-INDIAB study tested over 113,000 people. It found 101 million Indians with diabetes and 136 " +
    "million more with prediabetes. More than one Indian adult in four either has the disease or is on the way to it.");

  s = newSlide("QGX Content", "A quarter of the world's diabetes", "The problem");
  big(s, "212 million", "of the world's 828 million adults with diabetes live in India", { size: 104, y: 1.9, labelSize: 32 });
  source(s, "NCD Risk Factor Collaboration, The Lancet, November 2024; ThePrint, 14 November 2024");
  s.addNotes("A Lancet study pooled over a thousand population studies. It counted 828 million adults with diabetes in " +
    "2022, more than a quarter of them in India. The count differs from ICMR's because the studies use different age " +
    "ranges and blood tests, but the message is the same.");

  s = newSlide("QGX Content", "Much of it is hidden", "The problem");
  big(s, "43%", "of Indian adults with diabetes do not know they have it", { w: 5.8, size: 120, y: 1.7, labelSize: 30 });
  big(s, "62%", "of Indians with diabetes are not on medication", { x: 6.93, w: 5.8, size: 120, y: 1.7, labelSize: 30, color: C.accent4 });
  source(s, "IDF Diabetes Atlas, 2025; ThePrint, 14 November 2024");
  s.addNotes("Nearly half of the people with diabetes in India do not know it, and most are not treated. A disease that " +
    "stays hidden does its damage in silence.");

  s = newSlide("QGX Content", "Normal weight does not mean low risk", "The problem");
  const bmi = [["South Asian", 23.9], ["Arab", 26.6], ["Chinese", 26.9], ["Black", 28.1], ["White", 30.0]];
  s.addChart(pres.charts.BAR, [{ name: "BMI", labels: bmi.map((b) => b[0]), values: bmi.map((b) => b[1]) }], chartBase({
    h: 4.6, barDir: "bar", barGapWidthPct: 35, chartColors: [RED, GREY, GREY, GREY, GREY], valAxisMinVal: 0, valAxisMaxVal: 33,
    dataLabelFormatCode: "0.0",
  }));
  text(s, "The BMI that carries the same diabetes risk as BMI 30 in White people", { x: MX, y: 6.0, w: CW, h: 0.5,
    fontSize: 24, align: "center", valign: "middle" });
  source(s, "Caleyachetty et al., The Lancet Diabetes & Endocrinology, 2021");
  s.addNotes("This is the first punch line. In a study of 1.47 million people, a South Asian at BMI 23.9 had the same " +
    "diabetes risk as a White person at BMI 30. Most charts call 23.9 normal. The same risk in a White person is called " +
    "obese.");

  s = newSlide("QGX Content", "Normal weight, yet far more diabetes", "The problem");
  s.addChart(pres.charts.BAR, [
    { name: "Asian Indians, Chennai", labels: ["Normal-weight men", "Normal-weight women"], values: [23.5, 13.6] },
    { name: "White adults, United States", labels: ["Normal-weight men", "Normal-weight women"], values: [6.1, 2.8] },
  ], chartBase({
    h: AREA, barDir: "col", barGrouping: "clustered", chartColors: [RED, GREY], valAxisMinVal: 0, valAxisMaxVal: 28,
    dataLabelFormatCode: '0.0"%"', showLegend: true, legendPos: "t",
  }));
  source(s, "Gujral et al., Diabetes Research and Clinical Practice, 2018");
  s.addNotes("Compare people of normal weight directly. In Chennai, 23.5 percent of normal-weight men have diabetes; in " +
    "the United States, 6 percent. For women it is 13.6 against 2.8. That is four to five times as much diabetes in " +
    "people who look just as healthy.");

  s = newSlide("QGX Content", "Screening cannot see these people", "The problem");
  [[ICON.weight, "BMI rule", "Never flags a lean person"], [ICON.clipboard, "IDRS questionnaire", "Four questions, no genes"]]
    .forEach(([icon, head, body], i) => {
      const x = MX + i * 6.215;
      card(s, x, 1.6, 5.915, 4.5, `Screening card ${i + 1}`);
      badge(s, icon, x + 0.45, 1.95, 1.2, C.accent3, `Screening ${i + 1}`);
      text(s, head, { x: x + 0.45, y: 3.4, w: 5.1, h: 0.75, fontSize: 36, bold: true, fontFace: "+mj-lt" });
      text(s, body, { x: x + 0.45, y: 4.25, w: 5.1, h: 1.3, fontSize: 30 });
    });
  source(s, "IDRS: Mohan et al., Journal of the Association of Physicians of India, 2005");
  s.addNotes("Two tools decide who gets tested. A BMI rule cannot flag a lean person. The IDRS asks about age, waist, " +
    "activity and family history, so a young, slim person scores low by design. These are exactly the people we just " +
    "saw.");

  s = newSlide("QGX Content", "The missing risk is inherited", "The problem");
  big(s, "8.2 years", "earlier diagnosis, at a BMI 3 points lower, in people with high genetic risk on two mechanisms",
    { size: 104, y: 1.8, labelSize: 32 });
  source(s, "Hodgson et al., Nature Medicine, 2025");
  s.addNotes("Among British South Asians, people with high genetic risk on both insulin deficiency and lipodystrophy were " +
    "diagnosed 8.2 years earlier at a lower BMI. They look healthy on every measure used in screening today. And only " +
    "2 percent of the people in the largest genetic study were South Asian.");

  s = newSlide("QGX Content", "Prevention works, if people are found", "The problem");
  big(s, "28%", "less progression to diabetes with lifestyle change", { size: 120, y: 1.7, color: C.accent1, labelSize: 32 });
  text(s, "But only people who know they are at risk can act.", { x: MX, y: 5.1, w: CW, h: 0.8, fontSize: 32, bold: true });
  source(s, "Indian Diabetes Prevention Programme, Ramachandran et al., Diabetologia, 2006");
  s.addNotes("This is why the problem is worth solving. Lifestyle change lowered progression to diabetes by about 28 " +
    "percent in Indian adults. The hard part is finding the right people early.");

  s = newSlide("QGX Content", "Three questions", "The problem");
  ["How much does genetics add to screening, above all for lean people?",
    "Do diabetes mechanisms interact, or do they only add up?",
    "Can a consumer DNA file give a reliable report?"].forEach((q, i) => {
    const y = 1.6 + i * 1.65;
    s.addShape(pres.shapes.OVAL, { x: MX, y, w: 1.0, h: 1.0, fill: { color: C.accent1 }, line: { color: C.accent1 },
      objectName: `Question ${i + 1} circle` });
    text(s, String(i + 1), { x: MX, y, w: 1.0, h: 1.0, fontFace: "+mj-lt", fontSize: 40, bold: true, color: C.background1,
      align: "center", valign: "middle" });
    text(s, q, { x: MX + 1.35, y, w: CW - 1.35, h: 1.0, fontSize: 32, valign: "middle" });
  });
  s.addNotes("The problem comes down to three questions, and the rest of the talk answers them in turn.");

  // =====================================================================
  // The solution
  // =====================================================================
  s = newSlide("QGX Content", "One DNA file, six answers, one report", "The solution");
  figure(s, "fig_app_flow.png", "A DNA file is checked and completed, scored, joined with six answers and turned into a report");
  s.addNotes("QGenomix turns a 23andMe or AncestryDNA file and six questionnaire answers into a risk report that a person " +
    "can read. This slide is the destination; the next slides show how we got there.");

  s = newSlide("QGX Content", "Real genomes, known truth", "The solution");
  [[ICON.dna, "2,504", "real genomes from 1000 Genomes", C.accent1], [ICON.chart, "1.34 M", "variants in the D-PRISM risk score", C.accent4],
    [ICON.users, "10,000", "synthetic South Asians with a known truth", C.accent2]].forEach(([icon, v, l, color], i) => {
    const x = MX + i * 4.14;
    card(s, x, 1.6, 3.85, 4.5, `Data card ${i + 1}`);
    badge(s, icon, x + 0.4, 1.9, 1.0, color, `Data ${i + 1}`);
    text(s, v, { x: x + 0.4, y: 3.05, w: 3.2, h: 1.0, fontFace: "+mj-lt", fontSize: 50, bold: true, color, valign: "middle" });
    text(s, l, { x: x + 0.4, y: 4.15, w: 3.2, h: 1.7, fontSize: 26 });
  });
  s.addNotes("Genotypes and risk weights are real. Disease outcomes are simulated on synthetic South Asians built from " +
    "real haplotypes, with ten planted gene pairs, so that every discovery can be checked against a known truth. This " +
    "is also the main limit of the work, which is why we test it so hard later.");

  s = newSlide("QGX Content", "2,504 real genomes, five ancestries", "The solution");
  figure(s, "fig_e0_pca.png", "Scatter of the first two genetic components; South Asians form a tight group between Europeans and East Asians");
  s.addNotes("Each dot is a person. This is the well-known shape of human genetic variation, so the data was read " +
    "correctly. South Asians, in teal, are the group we study.");

  s = newSlide("QGX Content", "Synthetic people match real people", "The solution");
  figure(s, "fig_e0_freq.png", "Allele frequencies of 62 SNPs in real and synthetic people lie on the diagonal, r = 0.9999", { w: 6.2 });
  big(s, "r = 0.9999", "between real and synthetic allele frequencies", { x: 7.1, w: 5.6, size: 66, y: 2.1, color: C.accent1, labelSize: 30 });
  s.addNotes("Each dot is one of the 62 mechanism SNPs. Its frequency in 489 real South Asians and in 10,000 synthetic " +
    "people is the same, with a correlation of 0.9999.");

  s = newSlide("QGX Content", "Eight stages, two of them quantum", "The solution");
  figure(s, "fig_architecture.png", "Three inputs feed eight stages; pair selection and the encoder are quantum");
  s.addNotes("Walk the pipeline quickly. The two purple stages are where quantum computing enters. Everything else is " +
    "classical.");

  s = newSlide("QGX Content", "Why quantum computing?", "The solution");
  [[ICON.microchip, "Gene pairs", "Entanglement links two variants, so a qubit can see interaction"],
    [ICON.cubes, "Pair selection", "48 of 200 pairs: 10\u2074\u2077 choices, a native QUBO for QAOA"]]
    .forEach(([icon, head, body], i) => {
      const x = MX + i * 6.215;
      card(s, x, 1.5, 5.915, 3.55, `Quantum card ${i + 1}`);
      badge(s, icon, x + 0.45, 1.75, 1.0, C.accent2, `Quantum ${i + 1}`);
      text(s, head, { x: x + 1.7, y: 1.75, w: 4.0, h: 1.0, fontSize: 34, bold: true, fontFace: "+mj-lt", valign: "middle" });
      text(s, body, { x: x + 0.45, y: 3.0, w: 5.1, h: 1.8, fontSize: 30 });
    });
  text(s, "Every quantum part faces a classical control.", { x: MX, y: 5.35, w: CW, h: 0.9, fontSize: 34, bold: true,
    color: C.accent2, valign: "middle", align: "center" });
  s.addNotes("Quantum is used where the problem has a quantum shape. Our question is gene-gene interaction, and " +
    "entanglement is exactly the operation that makes two qubits depend on each other. Choosing 48 of 200 pairs has " +
    "about 10 to the 47 possible answers, and as a QUBO it is the native problem of QAOA and quantum annealers. The " +
    "circuits are 8 and 12 qubits, sized for today's hardware. And because quantum claims are easy to overstate, " +
    "every quantum part faces a classical control.");

  s = newSlide("QGX Content", "The quantum pair encoder", "The solution");
  figure(s, "fig_circuit.png", "One layer: load SNP dosages, trainable rotations, CZ entangling gates; repeated four times, then measured");
  s.addNotes("Each circuit carries four SNP pairs on eight qubits. It loads the dosages, applies trainable rotations and " +
    "entangles the qubits, four times over. Twelve circuits give 96 features. Without the CZ gates a qubit sees only " +
    "its own SNP, which is the control we test.");

  // =====================================================================
  // Results
  // =====================================================================
  s = newSlide("QGX Content", "Two mechanisms, dangerous together", "Results");
  figure(s, "fig_lean_phenotype.png", "Heat map of diabetes rate by fifths of two scores; it rises from 5% to 38% only when both are high", { w: 7.0 });
  big(s, "38%", "develop diabetes when both scores are in the top fifth", { x: 7.9, w: 4.83, size: 88, y: 1.55, labelSize: 28 });
  text(s, "About 5% when the insulin score is lowest", { x: 7.9, y: 5.05, w: 4.83, h: 1.2, fontSize: 28 });
  s.addNotes("In the simulated cohort, risk stays near 5 percent along the bottom row and climbs to 38 percent in the top " +
    "corner. People high on both have a 37 percent case rate at a lower BMI. This is the lean pattern from the start " +
    "of the talk.");

  s = newSlide("QGX Content", "Genetics lifts screening accuracy", "Results");
  const aucBars = [["BMI rule", "M1_bmi"], ["PRS only", "M2_prs"], ["IDRS", "M0_idrs"], ["Clinical\nfactors", "M3c_clinical"],
    ["Clinical +\ngenetics", "M3_additive"]];
  s.addChart(pres.charts.BAR, [{ name: "AUC", labels: aucBars.map((b) => b[0]), values: aucBars.map((b) => auc(b[1])) }], chartBase({
    h: 4.75, barDir: "col", chartColors: [GREY, GREY, GREY, GREY, TEAL], valAxisMinVal: 0.5, valAxisMaxVal: 0.92,
    dataLabelFormatCode: "0.000",
  }));
  text(s, "AUC: 0.5 is a coin toss, 1 is perfect", { x: MX, y: 6.1, w: CW, h: 0.5, fontSize: 24, align: "center", valign: "middle" });
  s.addNotes(`Each step adds information. All clinical factors reach ${f3(auc("M3c_clinical"))}; adding the genetic ` +
    `scores lifts this to ${f3(auc("M3_additive"))}, significant in every seed. The stacked hybrid reaches ` +
    `${f3(auc("M12_stack"))} but its margin is not significant.`);

  s = newSlide("QGX Content", "Genetics nearly doubles lean cases caught", "Results");
  const leanBars = [["BMI rule", "M1_bmi"], ["IDRS", "M0_idrs"], ["Clinical factors", "M3c_clinical"], ["Clinical + genetics", "M3_additive"]];
  s.addChart(pres.charts.BAR, [{ name: "Lean cases caught", labels: leanBars.map((b) => b[0]), values: leanBars.map((b) => lean(b[1])) }],
    chartBase({ h: 4.75, barDir: "col", chartColors: [GREY, GREY, GREY, TEAL], valAxisMinVal: 0, valAxisMaxVal: 0.7,
      dataLabelFormatCode: "0%", dataLabelFontSize: 28 }));
  text(s, "Lean diabetes cases caught when the top 20% by risk are screened", { x: MX, y: 6.1, w: CW, h: 0.5, fontSize: 24,
    align: "center", valign: "middle" });
  s.addNotes(`This is the main result. A BMI rule catches no lean cases, the IDRS ${pc(lean("M0_idrs"))}, all clinical ` +
    `factors ${pc(lean("M3c_clinical"))}, and with genetics ${pc(lean("M3_additive"))}. Genetics helps most for exactly ` +
    "the people screening misses.");

  s = newSlide("QGX Content", "The search finds planted gene pairs", "Results");
  const deltas = ["0.1", "0.2", "0.3"];
  s.addChart(pres.charts.BAR, [
    { name: "Score test", labels: deltas, values: deltas.map((d) => top[d].edr10_score) },
    { name: "PLINK BOOST", labels: deltas, values: deltas.map((d) => top[d].edr10_boost) },
  ], chartBase({ h: 4.75, barDir: "col", barGrouping: "clustered", chartColors: [TEAL, HEX.accent4], valAxisMinVal: 0,
    valAxisMaxVal: 1.15, dataLabelFormatCode: "0%", showLegend: true, legendPos: "t" }));
  text(s, "Share of 10 planted pairs in the top 10, as the interaction grows stronger", { x: MX, y: 6.1, w: CW, h: 0.5,
    fontSize: 24, align: "center", valign: "middle" });
  s.addNotes("Ten pairs are planted, so a search can be marked exactly. Across the mechanism settings the score test finds " +
    "70 to 84 percent at strength 0.2, against 40 to 48 percent for PLINK's BOOST. With more people it finds them all: " +
    "78 percent at 10,000 people and 100 percent at 40,000.");

  s = newSlide("QGX Content", "It does not invent interactions", "Results");
  figure(s, "fig_e4_null.png", "Q-Q plot of p-values on the diagonal, lambda 1.05", { w: 6.2 });
  big(s, "18 of 20", "runs with no true interaction report nothing", { x: 7.1, w: 5.6, size: 76, y: 1.95, color: C.accent1, labelSize: 30 });
  s.addNotes("We repeated the search twenty times with no planted interaction. The p-values follow chance almost exactly " +
    "and 18 of the 20 runs report nothing.");

  s = newSlide("QGX Content", "Selection cuts redundant pairs", "Results");
  const sel = [["Top-K", "topk"], ["mRMR", "mrmr"], ["QUBO", "qubo"]];
  s.addChart(pres.charts.BAR, [{ name: "Redundant pairs", labels: sel.map((b) => b[0]), values: sel.map((b) => e6[b[1]].shadow_pairs) }],
    chartBase({ h: 4.75, barDir: "col", chartColors: [GREY, GREY, PURPLE], valAxisMinVal: 0, valAxisMaxVal: 26,
      dataLabelFormatCode: "0.0", dataLabelFontSize: 28, barGapWidthPct: 70 }));
  text(s, "Redundant pairs among the 48 chosen", { x: MX, y: 6.1, w: CW, h: 0.5, fontSize: 24, align: "center", valign: "middle" });
  s.addNotes(`Nearby variants repeat the same signal. Top-K wastes 22 of its 48 places on these shadows. The QUBO and mRMR ` +
    `both cover 62 SNPs with about 16 shadows; the QUBO reaches the best objective in ${pc(T.e6.best_objective_share.qubo)} ` +
    `of runs and mRMR in ${pc(T.e6.best_objective_share.mrmr)}, so it is only slightly better than mRMR.`);

  s = newSlide("QGX Content", "Entanglement lets the circuit see interaction", "Results");
  figure(s, "fig_e14_interaction.png", "AUC on an outcome made only of gene pairs: entangled circuit 0.673, without entanglement 0.523");
  s.addNotes(`To test what entanglement does, we built an outcome from four gene pairs only, so no single SNP carries ` +
    `risk. Without entanglement the circuit stays at chance, ${f3(e14.auc.noent[0])}, like plain regression. With the ` +
    `CZ gates it reaches ${f3(e14.auc.vqc[0])}, most of the way to the ${f3(e14.auc.products[0])} of a model told the ` +
    `answer, and with 64 parameters it beats classical networks of 59 and 110 parameters. The networks were not ` +
    "tuned for this, so the claim is that entanglement detects interaction, not that quantum beats classical.");

  s = newSlide("QGX Content", "Without entanglement, a qubit is blind", "Results");
  figure(s, "fig_e14_qubit.png", "Mean output of one qubit for each pair of dosages: varies along both axes with entanglement, only along its own SNP without");
  s.addNotes(`This is the mechanism. With entanglement the qubit's output changes with its partner SNP; remove the CZ ` +
    `gates and keep the same angles, and every row is flat. Across the circuit ${Math.round(100 * e14.partner_share.vqc)} ` +
    "percent of a qubit's output comes from its partner, against exactly zero without entanglement.");

  s = newSlide("QGX Content", "On realistic data, all encoders tie", "Results");
  figure(s, "fig_e5_entanglement.png", "AUC of the circuit with and without entanglement and of a classical twin; the three overlap");
  s.addNotes(`On the realistic cohort, interaction is a small part of risk and the additive scores carry most of the ` +
    `signal, so all three encoders tie: ${f3(auc("H_vqc"))} with entanglement, ${f3(auc("H_noent"))} without, ` +
    `${f3(auc("H_twin"))} for a classical network. Entanglement helps exactly when there is interaction to find.`);

  s = newSlide("QGX Content", "A better mixer, until noise arrives", "Results");
  figure(s, "fig_e7_qaoa.png", "QAOA quality against depth: XY mixer above random choice, textbook QAOA below it, both near 0.3 with IBM noise");
  s.addNotes("On an ideal simulator our XY mixer beats textbook QAOA at every depth and beats a random valid choice. On a " +
    "noise model of the IBM Kingston processor both fall to about 0.3.");

  s = newSlide("QGX Content", "Error mitigation wins most of it back", "Results");
  figure(s, "fig_e7b_mitigation.png", "XY QAOA quality rises from 0.31 to 0.75 through three mitigation stages; noise-free is 0.76");
  s.addNotes(`Three inexpensive techniques take the XY circuit from ${f2(e7b.raw)} to ${f2(e7b.readout_postselect_zne)}, ` +
    `against ${f2(e7b.ideal_postselect)} with no noise. Post-selection does most of the work, because this circuit ` +
    "conserves the number of selected pairs.");

  s = newSlide("QGX Content", "12-qubit QAOA makes the real selection", "Results");
  figure(s, "fig_e15_blocks.png", "Blocks where 32 samples contained the best answer: QAOA 12.1% and 11.7%, random sampling 7.2%", { h: 3.85 });
  text(s, [{ text: `${e15.qaoa_p2.beats_annealing} of ${e15.qaoa_p2.n_runs}`, options: { fontFace: "+mj-lt", fontSize: 48, bold: true, color: C.accent2 } },
    { text: "  runs match or beat simulated annealing", options: { fontSize: 30 } }],
  { x: MX, y: 5.45, w: CW, h: 0.95, align: "center", valign: "middle", objectName: "Number" });
  s.addNotes(`QAOA can now make the selection the pipeline uses, 48 of 200 pairs, by solving it 12 pairs at a time, ` +
    `a hardware-sized circuit. With the same 32 samples per block, QAOA finds the best answer about 1.7 times as often ` +
    `as random sampling. The whole search matches or beats simulated annealing in ${e15.qaoa_p2.beats_annealing} of ` +
    `${e15.qaoa_p2.n_runs} runs; random sampling never does. No speed-up is claimed: these circuits are small enough ` +
    "to simulate exactly.");

  s = newSlide("QGX Content", "It holds on real genomes", "Results");
  const anc = [["South Asian", "SAS"], ["East Asian", "EAS"], ["American", "AMR"], ["European", "EUR"], ["African", "AFR"]];
  s.addChart(pres.charts.BAR, [{ name: "AUC", labels: anc.map((a) => a[0]), values: anc.map((a) => T.e9[a[1]].M3_additive[0]) }],
    chartBase({ h: 4.75, barDir: "col", chartColors: [TEAL, GREY, GREY, GREY, GREY], valAxisMinVal: 0.5, valAxisMaxVal: 0.95,
      dataLabelFormatCode: "0.00", dataLabelFontSize: 26 }));
  text(s, "AUC of the clinical + genetic model on real 1000 Genomes people", { x: MX, y: 6.1, w: CW, h: 0.5, fontSize: 24,
    align: "center", valign: "middle" });
  s.addNotes("Trained on synthetic South Asians and tested on real genomes, with simulated outcomes. It is best in South " +
    "Asians and weakest in Africans, the expected loss far from the training ancestry.");

  s = newSlide("QGX Content", "It holds across South Asia", "Results");
  const grp = [["Gujarati", "GIH"], ["Punjabi", "PJL"], ["Bengali", "BEB"], ["Sri Lankan\nTamil", "STU"], ["Telugu", "ITU"], ["Men", "male"], ["Women", "female"]];
  s.addChart(pres.charts.BAR, [{ name: "AUC gain", labels: grp.map((g) => g[0]),
    values: grp.map((g) => e11[g[1]].auc_genetic - e11[g[1]].auc_clinical) }], chartBase({
    h: 4.75, barDir: "col", chartColors: [TEAL], valAxisMinVal: 0, valAxisMaxVal: 0.11, dataLabelFormatCode: '"+"0.00',
    dataLabelFontSize: 24,
  }));
  text(s, "AUC gained from genetics in each group", { x: MX, y: 6.1, w: CW, h: 0.5, fontSize: 24, align: "center", valign: "middle" });
  s.addNotes(`Genetics improves on clinical factors in every population and in both sexes. Predicted risks run about ` +
    `${Math.round(100 * (1 - e11.all.oe[0]))} percent high on real genomes, equally in every group, so local recalibration ` +
    "is the remedy.");

  s = newSlide("QGX Content", `It survives ${settings.length} simulator settings`, "Results");
  big(s, `${nAucWin} of ${settings.length}`, "settings where genetics beats clinical factors", { w: 5.8, size: 96, y: 1.9, color: C.accent1, labelSize: 30 });
  big(s, `${nLeanWin} of ${settings.length}`, "settings where it catches more lean cases than the IDRS", { x: 6.93, w: 5.8, size: 96, y: 1.9, color: C.accent1, labelSize: 30 });
  s.addNotes(`Because outcomes are simulated, we changed one assumption at a time. The AUC gain ranges from ` +
    `${f3(Math.min(...dAuc))} to ${f3(Math.max(...dAuc))} and is positive in every setting, even with no mechanism ` +
    "interaction at all. Interaction discovery is less forgiving and depends on the true effect size, which we report " +
    "as a limit.");

  s = newSlide("QGX Content", "Partial DNA files stay reliable", "Results");
  const covs = e13.coverages, covL = covs.map((c) => `${Math.round(100 * c)}% of variants`);
  s.addChart(pres.charts.BAR, [
    { name: "Average filling", labels: covL, values: covs.map((c) => at("mean_fill", HIGH_T, c)) },
    { name: "LD imputation", labels: covL, values: covs.map((c) => at("ld_impute", HIGH_T, c)) },
  ], chartBase({ h: 4.75, barDir: "col", barGrouping: "clustered", chartColors: [GREY, TEAL], valAxisMinVal: 0, valAxisMaxVal: 1.15,
    dataLabelFormatCode: "0%", showLegend: true, legendPos: "t" }));
  text(s, "Truly high-risk people still flagged, by the share of variants in the file", { x: MX, y: 6.1, w: CW, h: 0.5,
    fontSize: 24, align: "center", valign: "middle" });
  s.addNotes(`Consumer chips hold about 45 percent of the variants. Filling the gaps with the average keeps only ` +
    `${pc(at("mean_fill", HIGH_T, 0.45))} of high-risk people flagged. Our LD imputation keeps ` +
    `${pc(at("ld_impute", HIGH_T, 0.45))} and cuts the percentile error from ${Math.round(at("mean_fill", ERR_T, 0.45))} ` +
    `to ${Math.round(at("ld_impute", ERR_T, 0.45))} points.`);

  s = newSlide("QGX Content", "The what-ifs match the truth", "Results");
  const wi = [["Waist 5 cm smaller", "waist_minus_5cm"], ["Regular exercise", "vigorous_exercise"], ["Both changes", "both"]];
  s.addChart(pres.charts.BAR, [
    { name: "Application", labels: wi.map((w) => w[0]), values: wi.map((w) => drop(w[1], "model")) },
    { name: "True effect", labels: wi.map((w) => w[0]), values: wi.map((w) => drop(w[1], "true")) },
  ], chartBase({ h: 4.75, barDir: "col", barGrouping: "clustered", chartColors: [TEAL, GREY], valAxisMinVal: 0, valAxisMaxVal: 0.72,
    dataLabelFormatCode: "0%", showLegend: true, legendPos: "t" }));
  text(s, "Drop in diabetes risk from each change", { x: MX, y: 6.1, w: CW, h: 0.5, fontSize: 24, align: "center", valign: "middle" });
  s.addNotes("The simulator knows the true effect of each change, so the app can be checked directly. Its estimates are " +
    "close and on the cautious side.");

  // =====================================================================
  // The application
  // =====================================================================
  s = newSlide("QGX Content", "A lean woman, flagged high risk", "The application");
  figure(s, "app_summary.png", "Report summary: QGenomix high risk at the 84th percentile, IDRS moderate, BMI rule not flagged");
  s.addNotes("A synthetic demo person: 34 years old, BMI 21.6. QGenomix rates her high risk at the 84th percentile. The " +
    "IDRS says moderate and the BMI rule says nothing. The report says so in plain words.");

  s = newSlide("QGX Content", "Her genes show why", "The application");
  figure(s, "app_mechanisms.png", "Mechanism profile: insulin production 96th and fat distribution 88th percentile, obesity 24th");
  s.addNotes("Her insulin-production and fat-distribution scores are high and her obesity score is low. This is the " +
    "genetic pattern behind lean diabetes.");

  s = newSlide("QGX Content", "What she can change", "The application");
  figure(s, "app_whatif.png", "What-if table: exercise 15%, smaller waist 11%, both 6%, from 23%");
  s.addNotes("With genes, age and family history fixed, exercise and a smaller waist take her risk from 23 percent to 6 " +
    "percent. The same report downloads as a PDF. Live demo here if time allows.");

  s = newSlide("QGX Content", "Built to be checked", "The application");
  [[ICON.vial, String(nTests), "automated tests on every push"], [ICON.flask, "17", "experiments"],
    [ICON.sitemap, "17", "predictors compared"], [ICON.docker, "1", "command to run it anywhere"]].forEach(([icon, v, l], i) => {
    const x = MX + (i % 2) * 6.215, y = 1.5 + Math.floor(i / 2) * 2.6;
    card(s, x, y, 5.915, 2.35, `Tile ${i + 1}`);
    badge(s, icon, x + 0.35, y + 0.65, 1.05, C.accent1, `Tile ${i + 1}`);
    text(s, v, { x: x + 1.65, y: y + 0.2, w: 4.0, h: 1.05, fontFace: "+mj-lt", fontSize: 56, bold: true, color: C.accent1, valign: "middle" });
    text(s, l, { x: x + 1.65, y: y + 1.25, w: 4.1, h: 0.85, fontSize: 26 });
  });
  s.addNotes("Everything can be checked. Tests run on every push, re-runs match bit for bit, and docker compose up runs the " +
    "whole application.");

  if (PANEL) {
    s = newSlide("QGX Content", "Live demonstration", "The application");
    [[ICON.users, "A lean woman's risk report, step by step", "make app"],
      [ICON.chart, "The same report from the API, as JSON and PDF", "make api"],
      [ICON.atom, "Quantum experiments E14 and E15, rerun live", "make quantum"],
      [ICON.microchip, "QAOA with error mitigation on IBM's noise model", "make rehearse-ibm"],
      [ICON.vial, `All ${nTests} automated tests`, "make test"]].forEach(([icon, label, cmd], i) => {
      const y = 1.45 + i * 1.04;
      badge(s, icon, MX, y, 0.86, C.accent1, `Demo ${i + 1}`);
      text(s, label, { x: MX + 1.15, y, w: 7.9, h: 0.86, fontSize: 28, valign: "middle" });
      text(s, cmd, { x: 9.4, y, w: W - MX - 9.4, h: 0.86, fontSize: 22, color: HEX.muted, align: "right",
        valign: "middle" });
    });
    s.addNotes("Run the demonstration in this order. Open the dashboard on the lean demo woman and walk through her " +
      "report, mechanism profile and what-ifs, then download the PDF. Show the same report from the API. Rerun the two " +
      "quantum experiments, about five minutes, and the IBM noise-model rehearsal. Finish with the tests. No internet is " +
      "needed.");
  }

  // =====================================================================
  // Outlook
  // =====================================================================
  s = newSlide("QGX Content", "What comes next", "Outlook");
  [[ICON.atom, "Run on a real IBM quantum computer", C.accent2], [ICON.globe, "A public online demo", C.accent1],
    [ICON.heart, "Validation on Indian patients", C.accent3], [ICON.dna, "More ancestries, a larger panel", C.accent4]]
    .forEach(([icon, t, color], i) => {
      const y = 1.5 + i * 1.28;
      badge(s, icon, MX, y, 1.0, color, `Next ${i + 1}`);
      text(s, t, { x: MX + 1.35, y, w: CW - 1.35, h: 1.0, fontSize: 34, valign: "middle" });
    });
  s.addNotes("The IBM run is scripted and rehearsed. The Docker image is ready for a public demo. Most important " +
    "scientifically is validation on real Indian patients, because our outcomes are simulated.");

  s = newSlide("QGX Content", "What we found", "Outlook");
  [`Genetics nearly doubles lean cases caught: ${pc(lean("M0_idrs"))} to ${pc(lean("M3_additive"))}`,
    "The search finds 70–84% of planted gene pairs",
    "Entanglement captures interaction; QAOA matches annealing",
    "A tested app turns a DNA file into a clear report"].forEach((t, i) => {
    const y = 1.55 + i * 1.28;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: MX, y: y + 0.12, w: 0.14, h: 0.76, rectRadius: 0.05,
      fill: { color: C.accent1 }, line: { color: C.accent1 }, objectName: `Finding ${i + 1} mark` });
    text(s, t, { x: MX + 0.45, y, w: CW - 0.45, h: 1.0, fontSize: 32, valign: "middle" });
  });
  s.addNotes("Four things to remember, one from each part of the talk. On quantum: the parts do what they are there " +
    "for, with no speed-up claimed. The main limit is that outcomes are simulated.");

  s = newSlide("QGX Title", null, "Outlook");
  s.addText("Thank you", { placeholder: "title" });
  s.addText("Questions and feedback are welcome", { placeholder: "body" });
  badge(s, ICON.dna, 10.0, 0.75, 2.5, C.accent1, "Closing DNA");
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: MX, y: 4.0, w: CW, h: 2.95, rectRadius: 0.15,
    fill: { color: C.background1, transparency: 91 }, line: { color: C.background1, transparency: 100 },
    objectName: "People panel" });
  text(s, "Team", { x: 1.0, y: 4.25, w: 6, h: 0.4, fontSize: 20, color: C.background2 });
  TEAM.forEach((n, i) => text(s, n, { x: 1.0 + (i % 2) * 3.55, y: 4.8 + Math.floor(i / 2) * 0.62, w: 3.5, h: 0.5,
    fontSize: 24, bold: true, color: C.background1, objectName: `Member ${i + 1}` }));
  text(s, "Guide", { x: 8.4, y: 4.25, w: 4.1, h: 0.4, fontSize: 20, color: C.background2 });
  text(s, [
    { text: MENTOR, options: { bold: true, fontSize: 24, color: C.background1, breakLine: true } },
    { text: "Assistant Professor, CSED", options: { fontSize: 20, color: C.background2 } },
  ], { x: 8.4, y: 4.8, w: 4.2, h: 1.4, paraSpaceAfter: 4, objectName: "Guide" });
  s.addNotes("Thank our guide and invite questions.");

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
