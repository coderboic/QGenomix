"""Downloadable PDF version of the mechanism-profile report (A4, one page for a typical report).

    render_report(report_dict, form) -> PDF bytes

Uses fpdf2 with the bundled Noto Sans fonts (SIL Open Font License), so symbols such as beta and >= print
correctly. The content mirrors the dashboard: summary cards, screening flags, mechanism percentiles, what-ifs,
interacting SNP pairs, advice, coverage and the research-prototype disclaimer.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

from fpdf import FPDF

from qgenomix.clinical import ACTIVITY_LEVELS

ASSETS = Path(__file__).resolve().parent / "assets"
INK, MUTED, LINE, TRACK = (21, 35, 43), (88, 106, 114), (205, 214, 219), (233, 238, 240)
TIER = {"high": (179, 38, 30), "moderate": (168, 101, 10), "low": (29, 127, 71)}


def _risk_text(r: float) -> str:
    return "under 1%" if r < 0.01 else f"{r:.0%}"


def _pct_text(p: float) -> str:
    return "below 1st" if p < 1 else f"{p:.0f}th"


class _Doc(FPDF):
    def __init__(self) -> None:
        super().__init__(format="A4")
        self.add_font("Noto", "", str(ASSETS / "NotoSans-Regular.ttf"))
        self.add_font("Noto", "B", str(ASSETS / "NotoSans-Bold.ttf"))
        self.set_margins(16, 14, 16)
        self.set_auto_page_break(True, margin=16)

    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("Noto", "", 7.5)
        self.set_text_color(*MUTED)
        self.cell(0, 4, "QGenomix research prototype. Trained on simulated outcomes using real 1000 Genomes South "
                        f"Asian haplotypes. Not a diagnosis.   Page {self.page_no()}", align="C")

    def heading(self, text: str, size: float = 11.5, before: float = 3.5) -> None:
        self.ln(before)
        self.set_font("Noto", "B", size)
        self.set_text_color(*INK)
        self.cell(0, 6, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(0.5)

    def para(self, s: str, size: float = 9, color=INK, style: str = "") -> None:
        self.set_font("Noto", style, size)
        self.set_text_color(*color)
        self.multi_cell(0, size * 0.48, s, new_x="LMARGIN", new_y="NEXT")


def _cards(pdf: _Doc, r: dict, form) -> None:
    cards = [("QGenomix risk", r["risk_tier"].title(), TIER[r["risk_tier"]],
              f"{_risk_text(r['risk_probability'])} probability"),
             ("Risk percentile", _pct_text(r["risk_percentile"]), INK, "South Asian reference"),
             ("IDRS questionnaire", str(r["idrs"]["score"]), TIER[r["idrs"]["category"]],
              f"{r['idrs']['category']} risk (of 100)"),
             ("Flagged by BMI rule?", "No" if r["lean"] else "Yes", INK, f"BMI {form.bmi:.1f}")]
    w = (pdf.w - pdf.l_margin - pdf.r_margin) / 4
    y0 = pdf.get_y()
    for i, (label, value, colour, note) in enumerate(cards):
        x = pdf.l_margin + i * w
        pdf.set_draw_color(*LINE)
        pdf.rect(x + 1, y0, w - 2, 21)
        pdf.set_xy(x + 3.5, y0 + 2)
        pdf.set_font("Noto", "", 7.5)
        pdf.set_text_color(*MUTED)
        pdf.cell(w - 6, 4, label)
        pdf.set_xy(x + 3.5, y0 + 6.5)
        pdf.set_font("Noto", "B", 15)
        pdf.set_text_color(*colour)
        pdf.cell(w - 6, 7, value)
        pdf.set_xy(x + 3.5, y0 + 14.5)
        pdf.set_font("Noto", "", 7.5)
        pdf.set_text_color(*MUTED)
        pdf.cell(w - 6, 4, note)
    pdf.set_xy(pdf.l_margin, y0 + 23)


def _flag(pdf: _Doc, s: str, fill=(252, 232, 230), colour=(160, 30, 24)) -> None:
    pdf.set_fill_color(*fill)
    pdf.set_text_color(*colour)
    pdf.set_font("Noto", "", 8.8)
    pdf.multi_cell(0, 5.2, s, fill=True, padding=(1.2, 2.5), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1.2)


def _bar(pdf: _Doc, label: str, pct: float) -> None:
    colour = TIER["high"] if pct >= 80 else TIER["moderate"] if pct >= 60 else (107, 119, 128)
    y = pdf.get_y()
    pdf.set_font("Noto", "", 8.8)
    pdf.set_text_color(*INK)
    pdf.set_xy(pdf.l_margin, y)
    pdf.cell(66, 5.5, label)
    x0, wbar = pdf.l_margin + 68, pdf.w - pdf.r_margin - pdf.l_margin - 82
    pdf.set_fill_color(*TRACK)
    pdf.rect(x0, y + 1.7, wbar, 2.4, style="F")
    pdf.set_fill_color(*colour)
    pdf.rect(x0, y + 1.7, max(wbar * pct / 100, 0.6), 2.4, style="F")
    pdf.set_xy(x0 + wbar + 2, y)
    pdf.set_font("Noto", "B", 8.8)
    pdf.cell(12, 5.5, f"{pct:.0f}", align="R")
    pdf.set_xy(pdf.l_margin, y + 5.8)


def _table(pdf: _Doc, header: list[str], rows: list[list[str]], widths: list[float]) -> None:
    pdf.set_draw_color(*LINE)
    pdf.set_font("Noto", "B", 8)
    pdf.set_text_color(*MUTED)
    pdf.set_fill_color(243, 246, 248)
    for h, w in zip(header, widths, strict=True):
        pdf.cell(w, 6, h, border="B", fill=True)
    pdf.ln()
    pdf.set_font("Noto", "", 8.5)
    pdf.set_text_color(*INK)
    for row in rows:
        for v, w in zip(row, widths, strict=True):
            pdf.cell(w, 5.6, v, border="B")
        pdf.ln()


def render_report(r: dict, form, person: str | None = None) -> bytes:
    pdf = _Doc()
    pdf.add_page()
    pdf.set_font("Noto", "B", 17)
    pdf.set_text_color(*INK)
    pdf.cell(0, 9, "QGenomix · Mechanism-profile report", new_x="LMARGIN", new_y="NEXT")
    who = f"{person} · " if person else ""
    sex = "male" if form.sex.upper().startswith("M") else "female"
    parents = {0: "no parent", 1: "one parent", 2: "both parents"}[form.family_history]
    pdf.para(f"{who}Age {form.age}, {sex}, BMI {form.bmi:.1f}, waist {form.waist_cm:.0f} cm, "
             f"{ACTIVITY_LEVELS[form.activity]} activity, {parents} with diabetes · {date.today():%d %b %Y} · "
             f"model {r['model_version']}", size=8, color=MUTED)
    pdf.ln(2.5)
    _cards(pdf, r, form)

    if r["coverage"]["low"]:
        _flag(pdf, f"Partial genotype file: {r['coverage']['prs_variants']:.0%} of risk-score variants were measured "
                   f"and {r['coverage']['prs_effective']:.0%} are measured or reliably imputed. Scores may be pulled "
                   "towards the middle.", fill=(253, 244, 225), colour=(120, 72, 6))
    if r["missed_by_bmi_screening"]:
        _flag(pdf, "High risk at a normal BMI: this is the lean blind spot that BMI-based screening misses.")
    if r["missed_by_idrs"]:
        _flag(pdf, f"The IDRS questionnaire rates this person {r['idrs']['category']}; the genetic profile puts "
                   "them in the top 20%.")

    pdf.heading("Mechanism profile (percentile among South Asians)")
    for m in r["mechanisms"].values():
        _bar(pdf, m["label"], m["percentile"])
    _bar(pdf, "Genome-wide background PRS (D-PRISM)", r["prs_percentile"])
    if r["combination_flag"]:
        pdf.ln(1)
        _flag(pdf, "Combination flag: insulin-production and fat-distribution scores are both high.",
              fill=(253, 248, 225), colour=(120, 90, 6))

    if r["what_if"]:
        pdf.heading("What if? Genes, age and family history stay fixed")
        pdf.para(f"Risk now: {_risk_text(r['risk_probability'])}", size=8.8)
        pdf.ln(1)
        _table(pdf, ["Change", "Risk after", "Relative change"],
               [[w["change"], _risk_text(w["risk_probability"]), f"{100 * w['relative_change']:+.0f}%"]
                for w in r["what_if"]], [100, 36, 42])

    if r["top_pairs"]:
        pdf.heading("Interacting SNP pairs this person carries")
        _table(pdf, ["SNP 1", "SNP 2", "Mechanisms", "Copies", "Importance"],
               [[p["snp1"], p["snp2"], f"{p['cluster1'].replace('_', ' ')} × {p['cluster2'].replace('_', ' ')}",
                 f"{p['dosage1']:.0f} / {p['dosage2']:.0f}", f"{p['importance']:.3f}"] for p in r["top_pairs"]],
               [30, 30, 62, 24, 32])

    pdf.heading("What helps")
    for a in r["advice"]:
        pdf.set_font("Noto", "", 8.8)
        pdf.set_text_color(*INK)
        pdf.cell(4, 4.8, "•")
        pdf.multi_cell(0, 4.8, a, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(0.6)

    cov = r["coverage"]
    method = "LD imputation from South Asian reference genomes" if cov.get("imputation") == "ld" else \
        "population-average filling"
    pdf.ln(2)
    pdf.para(f"Coverage: {cov['prs_variants']:.0%} of risk-score variants measured, "
             f"{cov.get('prs_effective', cov['prs_variants']):.0%} measured or reliably imputed ({method}); "
             f"{cov['mechanism_snps']:.0%} of mechanism SNPs; {cov['n_calls']:,} genotype calls. Risk is the model's "
             "calibrated probability in a simulated South Asian population.", size=7.5, color=MUTED)
    return bytes(pdf.output())
