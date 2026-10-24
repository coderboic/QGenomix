"""Streamlit dashboard: report with live what-if, clinician list, research results, model card.

    streamlit run src/qgenomix/app/dashboard.py
"""

from __future__ import annotations

import json
import sys
from dataclasses import replace
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "src"))

import pandas as pd  # noqa: E402
import streamlit as st  # noqa: E402

from qgenomix.app.service import Form, GenoFeatures, ProfileService  # noqa: E402
from qgenomix.clinical import ACTIVITY_LEVELS, FAMILY_LEVELS  # noqa: E402

st.set_page_config(page_title="QGenomix", page_icon="🧬", layout="wide", initial_sidebar_state="expanded")
PERSONA_DIR = ROOT / "data" / "personas"
FIG = ROOT / "figures"
TIER_COLOUR = {"high": "#b3261e", "moderate": "#a8650a", "low": "#1d7f47"}


@st.cache_resource
def get_service() -> ProfileService:
    return ProfileService(str(ROOT / "bundle"))


@st.cache_data
def personas() -> dict:
    p = PERSONA_DIR / "personas.json"
    return json.loads(p.read_text()) if p.exists() else {}


@st.cache_data(show_spinner=False, max_entries=8)
def geno_features(data: bytes) -> GenoFeatures:
    return get_service().genotype_features(data)


def pct_text(p: float) -> str:
    return "below 1st" if p < 1 else f"{p:.0f}th"


def risk_text(r: float) -> str:
    return "under 1%" if r < 0.01 else f"{r:.0%}"


def bar(label: str, pct: float) -> None:
    colour = "#b3261e" if pct >= 80 else "#a8650a" if pct >= 60 else "#6b7780"
    st.markdown(
        f"<div style='display:flex;align-items:center;gap:10px;margin:4px 0'>"
        f"<div style='width:230px'>{label}</div>"
        f"<div style='flex:1;background:#e9eef0;border-radius:4px;height:10px'>"
        f"<div style='width:{pct:.0f}%;background:{colour};height:10px;border-radius:4px'></div></div>"
        f"<div style='width:48px;text-align:right;font-family:monospace'>{pct:.0f}</div></div>",
        unsafe_allow_html=True)


def page_report() -> None:
    st.title("Mechanism-profile report")
    st.caption("Research prototype trained on simulated outcomes using real 1000 Genomes South Asian haplotypes. "
               "Not a diagnosis.")
    ps = personas()
    left, right = st.columns([1, 2])
    with left:
        source = st.radio("Genotype source", ["Demo persona", "Upload file"], horizontal=True)
        data = None
        defaults = {"age": 35, "sex": "F", "bmi": 23.0, "waist_cm": 80, "activity": 2, "family_history": 0}
        if source == "Demo persona":
            if not ps:
                st.warning("No personas yet. Run `python scripts/make_personas.py`.")
                return
            wanted = st.query_params.get("persona")  # direct demo links: ?persona=asha_lean_high&autorun=1
            keys = list(ps)
            key = st.selectbox("Persona", keys, index=keys.index(wanted) if wanted in keys else 0,
                               format_func=lambda k: f"{ps[k]['title']} ({k.split('_')[0]})")
            defaults = defaults | ps[key]
            data = (PERSONA_DIR / ps[key]["file"]).read_bytes()
        else:
            up = st.file_uploader("23andMe or AncestryDNA raw data file (GRCh37)", type=["txt", "tsv", "csv"])
            data = up.read() if up else None
        age = st.number_input("Age", 18, 90, int(defaults["age"]))
        sex = st.selectbox("Sex", ["F", "M"], index=0 if defaults["sex"] == "F" else 1)
        bmi = st.number_input("BMI (kg/m²)", 14.0, 60.0, float(defaults["bmi"]), step=0.1)
        waist = st.number_input("Waist (cm)", 50.0, 160.0, float(defaults["waist_cm"]), step=1.0)
        activity = st.selectbox("Physical activity", range(4), index=int(defaults["activity"]),
                                format_func=lambda i: ACTIVITY_LEVELS[i].capitalize())
        family = st.selectbox("Parents with diabetes", range(3), index=int(defaults["family_history"]),
                              format_func=lambda i: FAMILY_LEVELS[i].capitalize())
        go = st.button("Generate report", type="primary", disabled=data is None)
        if st.query_params.get("autorun") == "1" and data is not None and "report_data" not in st.session_state:
            go = True
    if go:
        st.session_state["report_data"] = data
    data = st.session_state.get("report_data") if not go else data
    if data is None:
        with right:
            st.info("Pick a persona or upload a file, then press **Generate report**.")
        return
    form = Form(age=int(age), sex=sex, bmi=float(bmi), waist_cm=float(waist), activity=int(activity),
                family_history=int(family))
    svc = get_service()
    with st.spinner("Reading genotypes and imputing missing variants (about 10 seconds the first time)…"):
        try:
            feats = geno_features(data)
        except ValueError as exc:
            st.error(str(exc))
            return
    r = svc.report(feats, form)
    with right:
        cards = [("QGenomix risk", r["risk_tier"].title(), TIER_COLOUR[r["risk_tier"]],
                  f"{risk_text(r['risk_probability'])} probability"),
                 ("Risk percentile", pct_text(r["risk_percentile"]), "#15232b", "South Asian reference"),
                 ("IDRS questionnaire", str(r["idrs"]["score"]), TIER_COLOUR[r["idrs"]["category"]],
                  f"{r['idrs']['category']} risk (of 100)"),
                 ("Flagged by BMI rule?", "No" if r["lean"] else "Yes", "#15232b", f"BMI {bmi:.1f}")]
        for col, (label, value, colour, note) in zip(st.columns(4), cards, strict=True):
            col.markdown(f"<div style='font-size:13px;color:#586a72'>{label}</div>"
                         f"<div style='font-size:28px;font-weight:700;color:{colour}'>{value}</div>"
                         f"<div style='font-size:12px;color:#586a72'>{note}</div>", unsafe_allow_html=True)
        cov = r["coverage"]
        if cov["low"]:
            st.warning(f"Partial genotype file: {cov['prs_variants']:.0%} of PRS variants were measured and "
                       f"{cov['prs_effective']:.0%} are measured or reliably imputed. Scores may be pulled toward "
                       "the middle.")
        elif cov["imputation"] == "ld" and cov["prs_variants"] < 0.95:
            st.info(f"{cov['prs_variants']:.0%} of PRS variants were measured; missing ones were imputed from "
                    f"correlated measured variants (LD imputation), giving {cov['prs_effective']:.0%} effective "
                    "coverage.")
        if r["missed_by_bmi_screening"]:
            st.error("High risk at a normal BMI: this is the lean blind spot that BMI-based screening misses.")
        if r["missed_by_idrs"]:
            st.error(f"The IDRS questionnaire rates this person {r['idrs']['category']}; the genetic profile "
                     "puts them in the top 20%.")
        st.subheader("Mechanism profile (percentile)")
        for m in r["mechanisms"].values():
            bar(m["label"], m["percentile"])
        bar("Genome-wide background PRS (D-PRISM)", r["prs_percentile"])
        if r["combination_flag"]:
            st.warning("**Combination flag:** insulin-production and fat-distribution scores are both high.")

        st.subheader("What if? (genes, age and family history stay fixed)")
        w1, w2 = st.columns(2)
        new_act = w1.select_slider("Activity", options=list(range(4)), value=int(activity),
                                   format_func=lambda i: ACTIVITY_LEVELS[i])
        new_waist = w2.slider("Waist (cm)", float(waist) - 15, float(waist) + 5, float(waist), step=1.0)
        alt = replace(form, activity=int(new_act), waist_cm=float(new_waist),
                      bmi=float(bmi) + (float(new_waist) - float(waist)) * 0.4)
        risk_now, _ = svc.risk(feats, form)
        risk_alt, _ = svc.risk(feats, alt)
        d1, d2, d3 = st.columns(3)
        d1.metric("Risk now", risk_text(risk_now))
        d2.metric("Risk with these changes", risk_text(risk_alt), f"{(risk_alt - risk_now) * 100:+.1f} points",
                  delta_color="inverse")
        d3.metric("IDRS with these changes", f"{alt.idrs()}")
        if r["what_if"]:
            st.dataframe(pd.DataFrame([{"Change": w["change"], "Risk after": risk_text(w["risk_probability"]),
                                        "Relative change": f"{100 * w['relative_change']:+.0f}%"}
                                       for w in r["what_if"]]), hide_index=True, width="stretch")
        st.caption("Risk is the model's calibrated probability in the simulated South Asian population. "
                   "Waist changes also move BMI by 0.4 kg/m² per cm.")

        if r["top_pairs"]:
            st.subheader("Interacting SNP pairs this person carries")
            st.dataframe(pd.DataFrame(r["top_pairs"]), hide_index=True, width="stretch")
        st.subheader("What helps")
        for a in r["advice"]:
            st.markdown(f"- {a}")
        st.caption(f"Coverage: {cov['prs_variants']:.0%} of PRS variants measured "
                   f"({cov['prs_effective']:.0%} with imputation), {cov['mechanism_snps']:.0%} of mechanism SNPs, "
                   f"{cov['n_calls']:,} calls. Model {r['model_version']}.")
        from qgenomix.app.pdf import render_report

        st.download_button("Download PDF report", data=render_report(r, form), file_name="qgenomix_report.pdf",
                           mime="application/pdf", type="primary")
        if (FIG / "fig_circuit.png").exists():
            with st.expander("The quantum circuit that encoded this person's gene pairs"):
                st.image(str(FIG / "fig_circuit.png"))


def page_clinician() -> None:
    st.title("Clinician view: synthetic cohort")
    st.caption("200 synthetic South Asian adults scored by the deployed model, sorted by risk. "
               "IDRS is the Indian Diabetes Risk Score questionnaire.")
    path = ROOT / "bundle" / "cohort_view.csv"
    if not path.exists():
        st.warning("Run `python scripts/build_bundle.py` to create the cohort view.")
        return
    df = pd.read_csv(path)
    view = st.radio("Show", ["Everyone", "High risk, missed by BMI screening", "High risk, missed by IDRS"],
                    horizontal=True)
    if view.startswith("High risk, missed by BMI"):
        df = df[(df["lean"]) & (df["risk_tier"] == "high")]
    elif view.startswith("High risk, missed by IDRS"):
        df = df[(df["risk_tier"] == "high") & (df["idrs_category"] != "high")]
    st.metric("People shown", len(df))
    st.dataframe(df, hide_index=True, width="stretch")


def page_research() -> None:
    st.title("Research results")
    def order(f):  # fig_e1_..., fig_e7b_..., fig_e10_... in experiment order
        num = f.stem.split("_")[1][1:]
        return int("".join(ch for ch in num if ch.isdigit())), num

    figs = sorted(FIG.glob("fig_e*.png"), key=order)
    if not figs:
        st.info("Run the experiments and `python scripts/make_figures.py` first.")
    for f in figs:
        st.image(str(f), caption=f.stem.replace("fig_", "").replace("_", " "))


def page_card() -> None:
    card = ROOT / "docs" / "model_card.md"
    st.markdown(card.read_text() if card.exists() else "Model card not found.")


PAGES = {"Report": page_report, "Clinician view": page_clinician, "Research results": page_research,
         "Model card": page_card}
page_param = st.query_params.get("page")
choice = st.sidebar.radio("QGenomix", list(PAGES), index=list(PAGES).index(page_param) if page_param in PAGES else 0)
st.sidebar.caption("Thapar Institute · CPG 218 · research prototype")
PAGES[choice]()
