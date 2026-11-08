"""Turn results/*.json into figures/*.png and results/tables.json (skips anything not yet computed).

Figures are saved at exactly the size they are printed (6.4 inches, the report's text width) and embedded at 100%,
so a 12 pt label here is exactly as large as the 12 pt text around it. Each figure makes one point, with plain-English
labels and values written on the marks instead of a legend wherever that is possible.

    python scripts/make_figures.py
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import matplotlib.ticker  # noqa: E402,F401
import numpy as np  # noqa: E402
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch, Rectangle  # noqa: E402

from qgenomix.config import load_config  # noqa: E402
from qgenomix.eval.stats import delong_test, holm, mcnemar_test  # noqa: E402
from qgenomix.models.zoo import MODEL_INFO  # noqa: E402
from qgenomix.utils import save_json  # noqa: E402

RES, FIG = ROOT / "results", ROOT / "figures"
FIG.mkdir(exist_ok=True)
INK, MUTED, LINE = "#15232b", "#4d5f69", "#d3dde0"
TEAL, PURPLE, AMBER, RED, GREEN, GREY = "#0a756f", "#5a4fb0", "#a8650a", "#b3261e", "#1d7f47", "#8a979e"
DEEP, DARK_GREY = "#0d3d46", "#5f6e76"
WIDTH = 6.4  # inches: the report's text width
plt.rcParams.update({
    "font.family": ["Liberation Serif", "DejaVu Serif"], "font.size": 12, "axes.labelsize": 12,
    "xtick.labelsize": 12, "ytick.labelsize": 12, "legend.fontsize": 12, "axes.edgecolor": MUTED,
    "axes.labelcolor": INK, "text.color": INK, "xtick.color": INK, "ytick.color": INK, "axes.spines.top": False,
    "axes.spines.right": False, "axes.grid": False, "grid.color": LINE, "grid.linewidth": 0.7, "figure.dpi": 100,
    "savefig.dpi": 300, "legend.frameon": False, "axes.axisbelow": True, "figure.constrained_layout.use": True,
})


def load(name):
    p = RES / name
    return json.loads(p.read_text()) if p.exists() else None


def save(fig, name):
    fig.savefig(FIG / name)
    plt.close(fig)
    print("wrote", name)


ORDER = ["M0_idrs", "M1_bmi", "M3c_clinical", "M2_prs",
         "M3_additive", "M4_rf", "M5_svm", "M6_xgb", "M7_xgb_pairs", "H_twin", "M8_xgb_twin",
         "H_noent", "M9_xgb_noent", "H_vqc", "M10_xgb_vqc", "M11_qsvc", "M12_stack"]


def yline(ax):
    ax.grid(axis="y")


def xline(ax):
    ax.grid(axis="x")


def fig_intro():
    """Published numbers quoted in Chapter 1 of the report (sources: Caleyachetty 2021, Gujral 2018)."""
    bmi = [("White", 30.0), ("Black", 28.1), ("Chinese", 26.9), ("Arab", 26.6), ("South Asian", 23.9)]
    fig, ax = plt.subplots(figsize=(WIDTH, 2.6))
    y = np.arange(len(bmi))[::-1]
    ax.barh(y, [v for _, v in bmi], height=0.66, color=[GREY, GREY, GREY, GREY, RED])
    for yi, (_, v) in zip(y, bmi, strict=True):
        ax.text(v + 0.25, yi, f"{v:.1f}", va="center", fontsize=14, fontweight="bold")
    ax.set(yticks=y, yticklabels=[n for n, _ in bmi], xlabel="BMI carrying the diabetes risk of BMI 30 in White people",
           xlim=(0, 33))
    ax.tick_params(axis="y", length=0)
    save(fig, "fig_intro_bmi.png")

    fig, ax = plt.subplots(figsize=(WIDTH, 2.8))
    x = np.arange(2)
    indian, us = [23.5, 13.6], [6.1, 2.8]
    ax.bar(x - 0.2, indian, 0.38, color=RED, label="Asian Indians, Chennai")
    ax.bar(x + 0.2, us, 0.38, color=GREY, label="White adults, United States")
    for xi, a, b in zip(x, indian, us, strict=True):
        ax.text(xi - 0.2, a + 0.5, f"{a}%", ha="center", fontsize=14, fontweight="bold")
        ax.text(xi + 0.2, b + 0.5, f"{b}%", ha="center", fontsize=14, fontweight="bold")
    ax.set(xticks=x, xticklabels=["Normal-weight men", "Normal-weight women"], ylabel="Adults with diabetes (%)",
           ylim=(0, 30))
    ax.legend(loc="upper right")
    yline(ax)
    save(fig, "fig_intro_lean.png")


def fig_data(tables):
    e0 = load("e0_data.json")
    if not e0:
        return
    pcs = e0["pca"]
    names = {"AMR": ("American", GREY, (-0.0168, 0.0035, "right")),
             "EUR": ("European", PURPLE, (-0.0065, 0.0285, "left")),
             "EAS": ("East Asian", AMBER, (-0.0125, -0.0335, "left")),
             "AFR": ("African", RED, (0.0355, 0.0055, "right")),
             "SAS": ("South Asian", TEAL, (-0.0005, 0.0045, "left"))}
    fig, ax = plt.subplots(figsize=(WIDTH, 3.5))
    for pop, (label, col, (cx, cy, ha)) in names.items():
        m = np.array(pcs["superpop"]) == pop
        ax.scatter(np.array(pcs["pc1"])[m], np.array(pcs["pc2"])[m], s=14, alpha=0.75, color=col, linewidths=0)
        ax.annotate(label, xy=(-0.0099, 0.0059) if pop == "SAS" else (cx, cy), xytext=(cx, cy), ha=ha, va="center",
                    color=DARK_GREY if pop == "AMR" else col, fontsize=13, fontweight="bold",
                    arrowprops={"arrowstyle": "-", "color": col, "lw": 1.2} if pop == "SAS" else None)
    ax.set(xlabel="Genetic component 1", ylabel="Genetic component 2", xticks=[], yticks=[], xlim=(-0.036, 0.04))
    save(fig, "fig_e0_pca.png")

    fig, ax = plt.subplots(figsize=(4.3, 3.9))
    real, syn = e0["eaf_real_sas"], e0["eaf_mosaic"]
    ax.plot([0, 1], [0, 1], color=GREY, lw=1.2)
    ax.scatter(real, syn, s=34, color=TEAL, linewidths=0)
    r = np.corrcoef(real, syn)[0, 1]
    ax.text(0.06, 0.88, f"r = {r:.4f}", fontsize=14, fontweight="bold", color=TEAL)
    ax.set(xlabel="Allele frequency, 489 real people", ylabel="Allele frequency, synthetic cohort",
           xlim=(0, 1), ylim=(0, 1), xticks=[0, 0.5, 1], yticks=[0, 0.5, 1])
    save(fig, "fig_e0_freq.png")

    fig, ax = plt.subplots(figsize=(WIDTH, 3.1))
    real, syn = np.array(e0["prs_real_sas"]), np.array(e0["prs_mosaic"])
    bins = np.linspace(min(real.min(), syn.min()), max(real.max(), syn.max()), 32)
    ax.hist(syn, bins=bins, density=True, color=TEAL, alpha=0.75, label="Synthetic people")
    ax.hist(real, bins=bins, density=True, histtype="step", color=INK, lw=2, label="Real South Asians")
    ax.set(xlabel="D-PRISM risk score", ylabel="Share of people", yticks=[])
    ax.spines["left"].set_visible(False)
    ax.legend(loc="upper right")
    save(fig, "fig_e0_prs.png")
    tables["e0"] = {k: e0[k] for k in ("components", "prevalence", "case_rate_lean", "case_rate_nonlean",
                                       "lean_share_of_cases", "case_rate_both_high", "case_rate_others",
                                       "bmi_both_high", "bmi_others", "bmi_mean", "bmi_sd", "prs_sd_ratio",
                                       "clusters", "superpop_counts", "clinical") if k in e0}


def fig_lean_heatmap(cfg):
    from qgenomix.data.cohort import synthetic_sas
    from qgenomix.sim.simulator import simulate

    if not (cfg.path("processed") / "sas_mosaic.npz").exists():
        return
    rng = np.random.default_rng(3)
    c = synthetic_sas(cfg, 40000, rng)
    ph = simulate(c, dict(cfg["simulator"]), tuple(cfg["focus_pair"]), rng)
    qb = np.digitize(ph.scores["beta_cell"], np.quantile(ph.scores["beta_cell"], [0.2, 0.4, 0.6, 0.8]))
    ql = np.digitize(ph.scores["lipodystrophy"], np.quantile(ph.scores["lipodystrophy"], [0.2, 0.4, 0.6, 0.8]))
    rate = np.array([[ph.y[(qb == i) & (ql == j)].mean() for j in range(5)] for i in range(5)])
    fig, ax = plt.subplots(figsize=(5.0, 4.1))
    ax.imshow(rate * 100, origin="lower", cmap="YlOrRd", vmin=0, vmax=45)
    for i in range(5):
        for j in range(5):
            ax.text(j, i, f"{rate[i, j] * 100:.0f}%", ha="center", va="center", fontsize=13,
                    color="white" if rate[i, j] > 0.22 else INK)
    labels = ["Lowest", "2", "3", "4", "Highest"]
    ax.set(xticks=range(5), yticks=range(5), xticklabels=labels, yticklabels=labels,
           xlabel="Fat-distribution (lipodystrophy) score, fifths of people",
           ylabel="Insulin-production (β-cell) score")
    ax.tick_params(length=0)
    for sp in ax.spines.values():
        sp.set_visible(False)
    save(fig, "fig_lean_phenotype.png")


def e1_runs():
    return [r for s in range(10) if (r := load(f"e1_seed{s}.json"))]


def fig_e1(tables):
    runs = e1_runs()
    if not runs:
        return
    names = [n for n in ORDER if n in runs[0]["metrics"]]
    rows = {}
    for n in names:
        vals = {k: [r["metrics"][n][k] for r in runs if k in r["metrics"][n]] for k in
                ("auc", "ap", "f1", "brier", "oof_auc", "case_capture", "lean_case_capture")}
        rows[n] = {k: (float(np.mean(v)), float(np.std(v))) for k, v in vals.items() if v}
    tables["e1"] = {"models": rows, "n_seeds": len(runs), "descriptions": {n: MODEL_INFO[n] for n in names},
                    "time": {k: float(np.mean([r["time"][k] for r in runs if k in r["time"]]))
                             for k in runs[0]["time"]},
                    "params": runs[0]["params"], "qubo_info": [r["qubo_info"] for r in runs],
                    "components": runs[0]["components"]}
    show = [("BMI rule", "M1_bmi", GREY), ("PRS only", "M2_prs", GREY), ("IDRS questionnaire", "M0_idrs", GREY),
            ("Clinical factors", "M3c_clinical", GREY), ("XGBoost + quantum features", "M10_xgb_vqc", PURPLE),
            ("XGBoost", "M6_xgb", TEAL), ("Clinical + genetics", "M3_additive", TEAL),
            ("Stacked hybrid", "M12_stack", TEAL)]
    fig, ax = plt.subplots(figsize=(WIDTH, 3.5))
    y = np.arange(len(show))
    m = [rows[n]["auc"][0] for _, n, _ in show]
    ax.barh(y, m, color=[c for _, _, c in show], height=0.68)
    for yi, mi in zip(y, m, strict=True):
        ax.text(mi + 0.004, yi, f"{mi:.3f}", va="center", fontsize=12, fontweight="bold")
    ax.set(yticks=y, yticklabels=[lab for lab, _, _ in show], xlabel="AUC (higher is better)", xlim=(0.5, 0.93),
           xticks=[0.5, 0.6, 0.7, 0.8, 0.9])
    ax.tick_params(axis="y", length=0)
    xline(ax)
    save(fig, "fig_e1_benchmark.png")

    # E5 entanglement ablation
    trio = [("Classical twin", "H_twin", GREY), ("Circuit without entanglement", "H_noent", PURPLE),
            ("Circuit with entanglement", "H_vqc", PURPLE)]
    fig, ax = plt.subplots(figsize=(WIDTH, 1.9))
    for i, (_, n, col) in enumerate(trio):
        ax.errorbar(rows[n]["auc"][0], i, xerr=rows[n]["auc"][1], fmt="o", ms=10, color=col, capsize=4, lw=2)
        ax.text(rows[n]["auc"][0] + rows[n]["auc"][1] + 0.0012, i, f"{rows[n]['auc'][0]:.3f}", va="center",
                fontweight="bold")
    ax.set(yticks=range(3), yticklabels=[t[0] for t in trio], xlabel="AUC (mean ± sd over 3 seeds)",
           ylim=(-0.5, 2.5), xlim=(0.855, 0.885))
    ax.tick_params(axis="y", length=0)
    xline(ax)
    save(fig, "fig_e5_entanglement.png")

    # E8 lean capture
    show = [("BMI rule", "M1_bmi", GREY), ("IDRS", "M0_idrs", GREY), ("Clinical\nfactors", "M3c_clinical", GREY),
            ("Clinical +\ngenetics", "M3_additive", TEAL)]
    fig, ax = plt.subplots(figsize=(5.2, 3.2))
    vals = [rows[n]["lean_case_capture"][0] * 100 for _, n, _ in show]
    ax.bar(range(4), vals, color=[c for _, _, c in show], width=0.62)
    for i, v in enumerate(vals):
        ax.text(i, v + 1.2, f"{v:.0f}%", ha="center", fontsize=15, fontweight="bold")
    ax.set(xticks=range(4), xticklabels=[lab for lab, _, _ in show], ylabel="Lean cases caught (%)", ylim=(0, 70))
    yline(ax)
    save(fig, "fig_e8_lean.png")

    # EDR from models (E1)
    edr = defaultdict(list)
    for r in runs:
        for name, d in r["edr"].items():
            edr[name].append(d["edr@10"])
    tables["e1_edr"] = {k: (float(np.mean(v)), float(np.std(v))) for k, v in edr.items()}
    tables["e1_selection"] = {k: {m: float(np.mean([r["selection"][k][m] for r in runs]))
                                  for m in ("recall", "objective", "mean_redundancy")}
                              for k in runs[0]["selection"]}

    # significance tests on pooled test predictions (per seed, then Holm)
    comps = [("M3_additive", "M3c_clinical"), ("M3c_clinical", "M0_idrs"),
             ("M10_xgb_vqc", "M3_additive"), ("M10_xgb_vqc", "M6_xgb"), ("M10_xgb_vqc", "M7_xgb_pairs"),
             ("M10_xgb_vqc", "M8_xgb_twin"), ("M10_xgb_vqc", "M9_xgb_noent"), ("H_vqc", "H_twin"),
             ("H_vqc", "H_noent"), ("M12_stack", "M3_additive"), ("M3_additive", "M2_prs"),
             ("M7_xgb_pairs", "M6_xgb")]
    tests = []
    for s in range(10):
        p = RES / f"e1_preds_seed{s}.npz"
        if not p.exists():
            continue
        d = np.load(p)
        for a, b in comps:
            if f"p_{a}" in d and f"p_{b}" in d:
                t = delong_test(d["y"], d[f"p_{a}"], d[f"p_{b}"])
                tests.append({"seed": s, "a": a, "b": b, **t})
        if "p_M12_stack" in d:
            thr = lambda v: v >= np.quantile(v, 0.8)  # noqa: E731 - top-20% screening decision
            mc = mcnemar_test(d["y"].astype(bool), thr(d["p_M12_stack"]), thr(d["p_M3_additive"]))
            tests.append({"seed": s, "a": "M12_stack", "b": "M3_additive", "test": "mcnemar_top20", **mc})
    delong = [t for t in tests if "test" not in t]
    for t, adj in zip(delong, holm([t["p"] for t in delong]), strict=True):
        t["p_holm"] = adj
    tables["e1_tests"] = tests


def fig_sweeps(tables):
    e2 = load("e2_power.json")
    if e2:
        gammas = sorted({r["gamma"] for r in e2})
        deltas = sorted({r["delta"] for r in e2})
        fig, ax = plt.subplots(figsize=(WIDTH, 3.3))
        strongest = [r for r in e2 if r["gamma"] == gammas[-1]]

        def curve(fn):
            return [np.mean([fn(r) for r in strongest if r["delta"] == d and fn(r) is not None]) for d in deltas]

        series = [("QUBO-selected set", PURPLE, curve(lambda r: r["selection"]["qubo"]["recall"])),
                  ("Score test, top 10", TEAL, curve(lambda r: r["edr"]["score_test"]["edr@10"])),
                  ("PLINK BOOST, top 10", AMBER, curve(lambda r: r["edr"].get("boost", {}).get("edr@10")))]
        for (lab, col, vals), off in zip(series, (5, -4, 0), strict=True):
            ax.plot(deltas, np.array(vals) * 100, "-o", color=col, lw=2.5, ms=8)
            ax.text(deltas[-1] + 0.012, vals[-1] * 100 + off, lab, color=col, fontweight="bold", va="center")
        ax.set(xlabel="Strength of the planted interaction (δ)", ylabel="Planted pairs found (%)", ylim=(-3, 105),
               xticks=deltas, xlim=(-0.01, 0.31))
        yline(ax)
        save(fig, "fig_e2_power.png")
        tab = defaultdict(dict)
        for g in gammas:
            for d in deltas:
                rs = [r for r in e2 if r["gamma"] == g and r["delta"] == d]
                tab[str(g)][str(d)] = {
                    "edr10_score": float(np.mean([r["edr"]["score_test"]["edr@10"] for r in rs])),
                    "edr10_boost": float(np.mean([r["edr"]["boost"]["edr@10"] for r in rs if "boost" in r["edr"]])),
                    "recall_qubo": float(np.mean([r["selection"]["qubo"]["recall"] for r in rs])),
                    "mech_power": float(np.mean([r["mech_interaction_p"] < 0.05 for r in rs])),
                    "false_bonf": float(np.mean([r["n_sig_bonferroni_false"] for r in rs]))}
        tables["e2"] = tab

    e3 = load("e3_sample_size.json")
    if e3:
        ns = sorted({r["n"] for r in e3})
        fig, ax = plt.subplots(figsize=(WIDTH, 3.0))
        vals = [np.mean([r["edr"]["score_test"]["edr@10"] for r in e3 if r["n"] == n]) * 100 for n in ns]
        ax.plot(range(len(ns)), vals, "-o", color=TEAL, lw=2.5, ms=9)
        for i, v in enumerate(vals):
            ax.text(i, v + 6, f"{v:.0f}%", ha="center", fontsize=13, fontweight="bold")
        ax.set(xticks=range(len(ns)), xticklabels=[f"{n:,}" for n in ns], xlabel="People in the cohort",
               ylabel="Planted pairs found (%)", ylim=(0, 118), yticks=[0, 25, 50, 75, 100])
        yline(ax)
        save(fig, "fig_e3_sample_size.png")

        def at(n, f):
            return float(np.mean([f(r) for r in e3 if r["n"] == n]))

        tables["e3"] = {str(n): {"edr10_score": at(n, lambda r: r["edr"]["score_test"]["edr@10"]),
                                 "recall_qubo": at(n, lambda r: r["selection"]["qubo"]["recall"]),
                                 "time_score": float(np.mean([r["time_score"] for r in e3 if r["n"] == n]))}
                        for n in ns}

    e4 = load("e4_null.json")
    if e4:
        runs = e4["runs"]
        bonf = [r["n_sig_bonferroni"] for r in runs]
        boost_top = [r["edr"]["boost"]["edr@10"] if "boost" in r["edr"] else 0 for r in runs]
        fig, ax = plt.subplots(figsize=(4.3, 3.8))
        mx = max(e4["qq_expected"])
        ax.plot([0, mx], [0, mx], color=GREY, lw=1.5)
        ax.plot(e4["qq_expected"], e4["qq_observed"], "o", ms=4, color=TEAL)
        ax.text(0.2, mx * 0.86, f"λ = {e4['lambda_gc']:.2f}", fontsize=14, fontweight="bold", color=TEAL)
        ax.set(xlabel="Expected −log10 p", ylabel="Observed −log10 p")
        save(fig, "fig_e4_null.png")
        tables["e4"] = {k: e4[k] for k in ("n_tests", "frac_p_below_005", "frac_p_below_001", "lambda_gc")} | {
            "runs_with_any_bonferroni_hit": int(sum(b > 0 for b in bonf)), "n_runs": len(runs),
            "mech_p_below_005": float(np.mean([r["mech_interaction_p"] < 0.05 for r in runs])),
            "boost_mean": float(np.mean(boost_top))}

    # E6 from E2 + E3 runs with true pairs
    rows = [r for r in (e2 or []) + (e3 or []) if r.get("delta", 0) > 0]
    if rows:
        strat = ["topk", "mrmr", "qubo"]
        stats_ = {s: {m: float(np.mean([r["selection"][s][m] for r in rows])) for m in
                      ("recall", "mean_redundancy", "objective", "shadow_pairs", "distinct_snps")} for s in strat}
        wins = {s: float(np.mean([r["selection"][s]["objective"] >= max(r["selection"][t]["objective"] for t in strat)
                                  - 1e-9 for r in rows])) for s in strat}
        fig, ax = plt.subplots(figsize=(5.2, 2.9))
        labels = ["Top-K", "mRMR", "QUBO"]
        vals = [stats_[s]["shadow_pairs"] for s in strat]
        ax.bar(labels, vals, color=[GREY, GREY, PURPLE], width=0.58)
        for i, v in enumerate(vals):
            ax.text(i, v + 0.6, f"{v:.1f}", ha="center", fontsize=14, fontweight="bold")
        ax.set(ylabel="Redundant pairs among 48", ylim=(0, 27))
        yline(ax)
        save(fig, "fig_e6_search.png")
        tables["e6"] = {"stats": stats_, "best_objective_share": wins, "n_runs": len(rows)}


def fig_e7(tables):
    e7 = load("e7_qaoa.json")
    if not e7:
        return
    hw = load("e7_hardware.json")
    probs_ = e7["problems"]
    depths = sorted({r["depth"] for r in probs_[0]["runs"]})

    def mean_metric(form, depth, key, metric):
        vals = [r[key][metric] for p in probs_ for r in p["runs"]
                if r["formulation"] == form and r["depth"] == depth and key in r]
        return np.mean(vals) if vals else np.nan

    fig, ax = plt.subplots(figsize=(WIDTH, 3.4))
    rand = np.mean([p["baselines"]["uniform_feasible"]["approx_ratio"] for p in probs_])
    ax.axhline(rand, color=DARK_GREY, ls=":", lw=2)
    for form, col, label, off in (("xy", PURPLE, "XY mixer", 0), ("penalty", AMBER, "Textbook QAOA", -0.045)):
        ideal = [mean_metric(form, d, "ideal", "approx_ratio") for d in depths]
        ax.plot(depths, ideal, "-o", color=col, lw=2.5, ms=8)
        nd = [d for d in depths if not np.isnan(mean_metric(form, d, "noisy_fake_kingston", "approx_ratio"))]
        ax.plot(nd, [mean_metric(form, d, "noisy_fake_kingston", "approx_ratio") for d in nd], "s", color=RED, ms=9,
                mec="white", mew=0.8, zorder=4)
        ax.text(depths[-1] + 0.18, ideal[-1] + off, label, color=col, fontweight="bold", va="center")
    ax.text(depths[-1] + 0.18, rand + 0.045, "Random choice", color=DARK_GREY, fontweight="bold", va="center")
    ax.text(2.25, 0.27, "Squares: same circuits with IBM noise", color=RED, fontweight="bold", va="center")
    if hw:
        hd = sorted({r["depth"] for r in hw["results"]})
        ax.plot(hd, [np.mean([r.get("readout_postselect_zne", r.get("approx_ratio")) for r in hw["results"]
                              if r["depth"] == d]) for d in hd], "D", color=INK, ms=8)
    ax.set(xlabel="Circuit depth", ylabel="Solution quality (1 = best)", xticks=depths, ylim=(0, 1),
           xlim=(0.7, depths[-1] + 0.15))
    yline(ax)
    save(fig, "fig_e7_qaoa.png")
    slim = []
    for p in probs_:
        slim.append({"block": p["block"], "n_overlaps": p["n_overlaps"], "baselines": p["baselines"],
                     "greedy_is_optimal": p["baselines"]["warm_start"]["p_optimal"] > 0.99,
                     "runs": [{"formulation": r["formulation"], "depth": r["depth"], "train_s": r["train_seconds"],
                               **{k: {m: v for m, v in r[k].items() if m != "probs"}
                                  for k in ("ideal", "ideal_sampler", "noisy_fake_kingston") if k in r}}
                              for r in p["runs"]]})
    tables["e7"] = {"problems": slim, "hardware": hw}


def fig_e9(tables):
    e9 = load("e9_real_genomes.json")
    if not e9:
        return
    pops = list(e9["auc"])
    models = ["M2_prs", "M3_additive", "M6_xgb", "M7_xgb_pairs"]
    names = {"SAS": "South\nAsian", "EUR": "European", "EAS": "East\nAsian", "AMR": "American", "AFR": "African"}
    fig, ax = plt.subplots(figsize=(WIDTH, 3.1))
    x = np.arange(len(pops))
    prs = [np.nanmean(e9["auc"][p]["M2_prs"]) for p in pops]
    full = [np.nanmean(e9["auc"][p]["M3_additive"]) for p in pops]
    ax.bar(x - 0.2, prs, 0.38, color=GREY, label="PRS only")
    ax.bar(x + 0.2, full, 0.38, color=TEAL, label="Clinical + genetics")
    for xi, a, b in zip(x, prs, full, strict=True):
        ax.text(xi - 0.2, a + 0.006, f"{a:.2f}", ha="center", fontsize=12)
        ax.text(xi + 0.2, b + 0.006, f"{b:.2f}", ha="center", fontsize=12, fontweight="bold")
    ax.set(xticks=x, xticklabels=[names[p] for p in pops], ylabel="AUC", ylim=(0.5, 1.0),
           yticks=[0.5, 0.6, 0.7, 0.8, 0.9])
    ax.legend(loc="upper right", ncol=2)
    yline(ax)
    save(fig, "fig_e9_real_genomes.png")
    tables["e9"] = {p: {m: (float(np.nanmean(e9["auc"][p][m])), float(np.nanstd(e9["auc"][p][m]))) for m in models}
                    | {"prevalence": float(np.mean(e9["prevalence"][p]))} for p in pops}


def fig_e10(tables):
    e10 = load("e10_lifestyle.json")
    if not e10:
        return
    names = {"waist_minus_5cm": "Waist 5 cm smaller", "vigorous_exercise": "Regular exercise", "both": "Both changes"}
    fig, ax = plt.subplots(figsize=(WIDTH, 3.0))
    x = np.arange(3)
    app = [-100 * e10["scenarios"][k]["model_relative_change"] for k in names]
    true = [-100 * e10["scenarios"][k]["true_relative_change"] for k in names]
    ax.bar(x - 0.2, app, 0.38, color=TEAL, label="Application")
    ax.bar(x + 0.2, true, 0.38, color=GREY, label="True effect")
    for xi, a, b in zip(x, app, true, strict=True):
        ax.text(xi - 0.2, a + 1, f"{a:.0f}%", ha="center", fontsize=13, fontweight="bold")
        ax.text(xi + 0.2, b + 1, f"{b:.0f}%", ha="center", fontsize=13)
    ax.set(xticks=x, xticklabels=list(names.values()), ylabel="Drop in risk (%)", ylim=(0, 72))
    ax.legend(loc="upper left", ncol=2)
    yline(ax)
    save(fig, "fig_e10_lifestyle.png")
    tables["e10"] = e10


def fig_e7b(tables, hardware_file="e7_hardware.json"):
    e = load("e7b_mitigation.json")
    if not e:
        return
    runs = e["runs"]
    hw = load(hardware_file)  # written by scripts/run_ibm.py on real IBM hardware (mitigated runs only)
    hw_rows = hw["results"] if hw and hw.get("mitigated") else []
    stages = ["raw", "readout", "readout_postselect", "readout_postselect_zne"]
    depths = sorted({r["depth"] for r in runs})
    summary = {}
    for form in ("penalty", "xy"):
        for d in depths:
            rs = [r for r in runs if r["formulation"] == form and r["depth"] == d]
            if not rs:
                continue
            summary[f"{form}_p{d}"] = {k: float(np.mean([r[k] for r in rs])) for k in stages} | {
                "ideal_postselect": float(np.mean([r["ideal_postselect"] for r in rs])),
                "random_valid": float(np.mean([r["random_valid"] for r in rs])), "n_problems": len(rs),
                "n_2q": float(np.mean([r["n_2q"] for r in rs]))}
            hr = [r for r in hw_rows if r["formulation"] == form and r["depth"] == d]
            if hr:
                summary[f"{form}_p{d}"] |= {
                    "hardware_raw": float(np.mean([r["raw"] for r in hr])),
                    "hardware_mitigated": float(np.mean([r["readout_postselect_zne"] for r in hr])),
                    "hardware_backend": hw["backend"], "hardware_problems": len(hr)}
    v = summary["xy_p1"]
    labels = ["Noisy", "+ Readout\ncorrection", "+ Post-\nselection", "+ Zero-noise\nextrapolation", "Noise-\nfree"]
    vals = [v[k] for k in stages] + [v["ideal_postselect"]]
    fig, ax = plt.subplots(figsize=(WIDTH, 3.2))
    ax.bar(range(5), vals, color=["#d9d4f2", "#b1a8e4", "#8579cf", PURPLE, INK], width=0.66)
    for i, val in enumerate(vals):
        ax.text(i, val + 0.02, f"{val:.2f}", ha="center", fontsize=14, fontweight="bold")
    ax.axhline(v["random_valid"], color=RED, ls=":", lw=2)
    ax.text(-0.42, v["random_valid"] + 0.02, f"Random choice {v['random_valid']:.2f}", color=RED, fontweight="bold")
    if "hardware_mitigated" in v:
        ax.plot([0, 3], [v["hardware_raw"], v["hardware_mitigated"]], "D", color=RED, ms=9, mec="white",
                label=f"IBM hardware ({v['hardware_backend']})")
        ax.legend(loc="upper left")
    ax.set(xticks=range(5), xticklabels=labels, ylabel="Solution quality (1 = best)", ylim=(0, 1), yticks=[0, 0.5, 1])
    yline(ax)
    save(fig, "fig_e7b_mitigation.png")
    tables["e7b"] = summary


def fig_e11(tables):
    e = load("e11_fairness.json")
    if not e:
        return
    groups = {"GIH": "Gujarati", "PJL": "Punjabi", "BEB": "Bengali", "STU": "Sri Lankan\nTamil", "ITU": "Telugu",
              "male": "Men", "female": "Women"}
    g = e["groups"]
    x = np.array([0, 1, 2, 3, 4, 5.4, 6.4])
    fig, ax = plt.subplots(figsize=(WIDTH, 3.4))
    clin = [g[k]["auc_clinical"] for k in groups]
    gen = [g[k]["auc_genetic"] for k in groups]
    ax.bar(x - 0.2, clin, 0.38, color=GREY, label="Clinical factors only")
    ax.bar(x + 0.2, gen, 0.38, color=TEAL, label="Clinical + genetics")
    for xi, v in zip(x, gen, strict=True):
        ax.text(xi + 0.2, v + 0.004, f"{v:.2f}", ha="center", fontsize=12, fontweight="bold")
    ax.set(xticks=x, xticklabels=list(groups.values()), ylabel="AUC", ylim=(0.7, 1.02), yticks=[0.7, 0.8, 0.9, 1.0])
    ax.legend(loc="upper left", ncol=2)
    yline(ax)
    save(fig, "fig_e11_fairness.png")
    tables["e11"] = {"n": e["n"], "groups": g}


def fig_e12(tables):
    e = load("e12_robustness.json")
    if not e:
        return
    summ = e["summary"]
    labels = dict(zip(summ, ["Default setting", "No mechanism interaction", "Double mechanism interaction",
                             "Weaker gene pairs", "Stronger gene pairs", "Half background PRS", "1.5× background PRS",
                             "Half mechanism scores", "1.5× mechanism scores", "Prevalence 8%", "Prevalence 15%",
                             "Half age effect", "Double age effect"], strict=True))
    for a, b, scale, fmt, xlabel, xmax, fname in (
            ("auc_clinical", "auc_genetic", 1, "+{:.3f}", "AUC gained by adding genetics", 0.1, "fig_e12_auc.png"),
            ("lean_capture_idrs", "lean_capture_genetic", 100, "+{:.0f}",
             "Extra lean cases caught compared with IDRS (points)", 33, "fig_e12_lean.png")):
        gains = sorted((((summ[k][b] - summ[k][a]) * scale, labels[k]) for k in summ))
        fig, ax = plt.subplots(figsize=(WIDTH, 4.3))
        y = np.arange(len(gains))
        ax.barh(y, [g for g, _ in gains], height=0.7,
                color=[DEEP if n == "Default setting" else TEAL for _, n in gains])
        for yi, (g, _) in zip(y, gains, strict=True):
            ax.text(g + xmax * 0.012, yi, fmt.format(g), va="center", fontweight="bold")
        ax.set(yticks=y, yticklabels=[n for _, n in gains], xlabel=xlabel, xlim=(0, xmax),
               ylim=(-0.6, len(gains) - 0.4))
        ax.tick_params(axis="y", length=0)
        xline(ax)
        save(fig, fname)
    tables["e12"] = summ


def fig_e13(tables):
    e = load("e13_imputation.json")
    if not e:
        return
    rows = e["rows"]
    covs = sorted({r["coverage"] for r in rows})

    def agg(method, fn):
        out = []
        for c in covs:
            v = [fn(r[method]) for r in rows if r["coverage"] == c]
            out.append((float(np.mean(v)), float(np.std(v))))
        return out

    measures = {"PRS agreement with the full genome": lambda m: m["prs_r"][-1],
                "Error in the risk percentile shown": lambda m: m["risk_pct_mae"],
                "High-risk people still flagged high": lambda m: m["high_risk_kept"]}
    summary = {m: {t: agg(m, fn) for t, fn in measures.items()} for m in ("mean_fill", "ld_impute")}
    xs = [f"{100 * c:.0f}%" for c in covs]
    for title, fname, ylabel, ylim, fmt, scale, pad in (
            ("Error in the risk percentile shown", "fig_e13_error.png", "Error in risk percentile\n(points)",
             (0, 21), "{:.1f}", 1, 1.2),
            ("High-risk people still flagged high", "fig_e13_flagged.png", "High-risk people\nstill flagged (%)",
             (40, 105), "{:.0f}%", 100, 3)):
        fig, ax = plt.subplots(figsize=(WIDTH, 3.0))
        for method, col, label in (("mean_fill", DARK_GREY, "Average filling"), ("ld_impute", TEAL, "LD imputation")):
            vals = [a * scale for a, _ in summary[method][title]]
            ax.plot(range(3), vals, "-o", color=col, lw=2.5, ms=9)
            for i, v in enumerate(vals):
                ax.text(i, v + pad, fmt.format(v), ha="center", fontweight="bold", color=col, fontsize=13)
            ax.text(2.14, vals[-1], label, color=col, fontweight="bold", va="center")
        ax.set(xticks=range(3), xticklabels=xs, xlabel="Share of risk-score variants in the file", ylabel=ylabel,
               ylim=ylim, xlim=(-0.25, 2.1))
        yline(ax)
        save(fig, fname)
    tables["e13"] = {k: v for k, v in e.items() if k != "rows"} | {"summary": summary, "coverages": covs}


def fig_e14(tables):
    e = load("e14_entanglement.json")
    if not e:
        return
    rows = e["rows"]
    names = [("additive", "Regression on the 8 dosages", GREY), ("noent", "Circuit without entanglement", "#b1a8e4"),
             ("twin_small", "Classical network, 59 parameters", GREY),
             ("twin", "Classical network, 110 parameters", GREY),
             ("vqc", "Circuit with entanglement, 64 parameters", PURPLE),
             ("products", "Regression on the true products", TEAL)]
    summary = {k: (float(np.mean([r[k] for r in rows])), float(np.std([r[k] for r in rows]))) for k, _, _ in names}
    fig, ax = plt.subplots(figsize=(WIDTH, 3.3))
    y = np.arange(len(names))
    m = [summary[k][0] for k, _, _ in names]
    ax.barh(y, m, xerr=[summary[k][1] for k, _, _ in names], color=[c for _, _, c in names], height=0.66,
            error_kw={"ecolor": INK, "capsize": 3, "lw": 1.2})
    for yi, mi, (k, _, _) in zip(y, m, names, strict=True):
        ax.text(mi + summary[k][1] + 0.004, yi, f"{mi:.3f}", va="center", fontweight="bold")
    ax.axvline(0.5, color=DARK_GREY, ls=":", lw=1.5)
    ax.set(yticks=y, yticklabels=[lab for _, lab, _ in names], xlabel="AUC when only gene pairs carry risk",
           xlim=(0.45, 0.76))
    ax.tick_params(axis="y", length=0)
    xline(ax)
    save(fig, "fig_e14_interaction.png")

    grids = e["qubit0_grid"]
    fig, axes = plt.subplots(1, 2, figsize=(WIDTH, 3.0))
    lim = max(np.abs(np.array(grids["entangled"])).max(), np.abs(np.array(grids["cz_removed"])).max())
    for ax, key, title in ((axes[0], "entangled", "With entanglement"),
                           (axes[1], "cz_removed", "Same angles, CZ gates removed")):
        g = np.array(grids[key])
        ax.imshow(g, cmap="PuOr", vmin=-lim, vmax=lim, origin="lower")
        for i in range(3):
            for j in range(3):
                ax.text(j, i, f"{g[i, j]:+.2f}", ha="center", va="center", fontsize=12,
                        color="white" if abs(g[i, j]) > 0.55 * lim else INK)
        ax.set(xticks=range(3), yticks=range(3), xlabel="Partner SNP dosage", title=title)
        ax.tick_params(length=0)
        for sp in ax.spines.values():
            sp.set_visible(False)
    axes[0].set_ylabel("Own SNP dosage")
    save(fig, "fig_e14_qubit.png")
    delong = {k: [r["delong_p"][k] for r in rows] for k in rows[0].get("delong_p", {})}
    tables["e14"] = {"n": e["n"], "seeds": len(rows), "auc": summary, "delong_p": delong,
                     "params": {k: rows[0][f"{k}_params"] for k in ("noent", "vqc", "twin", "twin_small")},
                     "partner_share": {k: float(np.mean([np.mean(r[f"{k}_partner_share"]) for r in rows]))
                                       for k in ("noent", "vqc")},
                     "qubit0_grid": grids}


def fig_e15(tables):
    e = load("e15_qaoa_selection.json")
    if not e:
        return
    rows = e["rows"]
    methods = [("qaoa_p2", "QAOA, depth 2", PURPLE), ("qaoa_p1", "QAOA, depth 1", "#8579cf"),
               ("exact", "Exhaustive search", TEAL), ("random", "Random sampling", DARK_GREY)]

    def scaled(trace, row):  # 0 = the top-K start, 1 = simulated annealing
        lo, hi = row["topk"]["objective"], row["sa"]["objective"]
        return (np.array(trace) - lo) / (hi - lo)

    found = {m: np.mean([run["mean_is_block_optimum"] for row in rows for run in row["runs"] if run["method"] == m])
             for m in ("qaoa_p1", "qaoa_p2")}
    paired_random = np.mean([run["mean_random_is_block_optimum"] for row in rows for run in row["runs"]
                             if run["method"].startswith("qaoa")])
    bars = [("Random sampling", paired_random, DARK_GREY), ("QAOA, depth 1", found["qaoa_p1"], "#8579cf"),
            ("QAOA, depth 2", found["qaoa_p2"], PURPLE)]
    fig, ax = plt.subplots(figsize=(WIDTH, 2.6))
    y = np.arange(len(bars))
    ax.barh(y, [100 * v for _, v, _ in bars], color=[c for _, _, c in bars], height=0.62)
    for yi, (_, v, _) in zip(y, bars, strict=True):
        ax.text(100 * v + 0.25, yi, f"{100 * v:.1f}%", va="center", fontsize=13, fontweight="bold")
    ax.set(yticks=y, yticklabels=[lab for lab, _, _ in bars], xlim=(0, 15),
           xlabel="Blocks where 32 samples contained the best selection (%)")
    ax.tick_params(axis="y", length=0)
    xline(ax)
    save(fig, "fig_e15_blocks.png")
    summary = {}
    for m, _, _ in methods:
        runs = [(run, row) for row in rows for run in row["runs"] if run["method"] == m]
        summary[m] = {"final_scaled": float(np.mean([scaled(run["trace"], row)[-1] for run, row in runs])),
                      "beats_annealing": int(sum(run["objective"] >= row["sa"]["objective"] - 1e-9
                                                 for run, row in runs)),
                      "n_runs": len(runs), "seconds": float(np.mean([run["seconds"] for run, _ in runs]))}
        for key in ("objective", "distinct_snps", "recall", "shadow_pairs", "mean_is_block_optimum", "mean_percentile",
                    "mean_random_is_block_optimum", "mean_random_percentile"):
            if key in runs[0][0]:
                summary[m][key] = float(np.mean([run[key] for run, _ in runs]))
    for ref in ("topk", "sa"):
        summary[ref] = {key: float(np.mean([row[ref][key] for row in rows])) for key in rows[0][ref]}
    tables["e15"] = {"summary": summary, "blocks": e["blocks"], "shots": e["shots"], "n_cohorts": len(rows),
                     "paired_random_block_optimum": float(paired_random)}


def _box(ax, x, y, w, h, text, fill, color="white", size=12.5, weight="bold"):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0,rounding_size=0.09", fc=fill, ec="none"))
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", color=color, fontsize=size, fontweight=weight,
            linespacing=1.15)


def _arrow(ax, p, q, color=MUTED):
    ax.add_patch(FancyArrowPatch(p, q, arrowstyle="-|>", mutation_scale=15, lw=1.6, color=color, shrinkA=0, shrinkB=0))


def _canvas(height):
    """A blank drawing where one axis unit is one printed inch."""
    fig = plt.figure(figsize=(WIDTH, height), layout="none")
    ax = fig.add_axes((0, 0, 1, 1))
    ax.set(xlim=(0, WIDTH), ylim=(0, height))
    ax.axis("off")
    return fig, ax


def fig_architecture():
    """Three inputs, then eight stages in two rows; the quantum stages are purple."""
    fig, ax = _canvas(3.75)
    for x, t in ((0.0, "1000 Genomes"), (2.2, "Published risk scores"), (4.4, "Clinical questionnaire")):
        _box(ax, x, 3.2, 2.0, 0.5, t, "#e3f0ee", INK, 12, "normal")
    w, h, gap = 1.42, 0.92, (WIDTH - 4 * 1.42) / 3
    xs = [i * (w + gap) for i in range(4)]
    row1 = [("1. Data\npreparation", TEAL), ("2. Synthetic\ncohort", TEAL), ("3. Interaction\nsearch", TEAL),
            ("4. Pair\nselection", PURPLE)]
    row2 = [("5. Quantum\nencoder", PURPLE), ("6. Prediction\nmodels", TEAL), ("7. Evaluation", TEAL),
            ("8. Risk report\napplication", DEEP)]
    y1, y2 = 1.72, 0.2
    for x, (t, c) in zip(xs, row1, strict=True):
        _box(ax, x, y1, w, h, t, c)
    for x, (t, c) in zip(reversed(xs), row2, strict=True):
        _box(ax, x, y2, w, h, t, c)
    for i in range(3):
        _arrow(ax, (xs[i] + w + 0.01, y1 + h / 2), (xs[i + 1] - 0.01, y1 + h / 2))
        _arrow(ax, (xs[3 - i] - 0.01, y2 + h / 2), (xs[2 - i] + w + 0.01, y2 + h / 2))
    _arrow(ax, (xs[3] + w / 2, y1 - 0.01), (xs[3] + w / 2, y2 + h + 0.01))
    _arrow(ax, (1.0, 3.19), (xs[0] + 0.6, y1 + h + 0.01))
    _arrow(ax, (3.2, 3.19), (xs[1] + 0.3, y1 + h + 0.01))
    _arrow(ax, (5.4, 3.19), (xs[1] + 1.1, y1 + h + 0.01))
    save(fig, "fig_architecture.png")


def fig_app_flow():
    """From one DNA file and six answers to a report."""
    fig, ax = _canvas(2.6)
    w, h, gap = 1.9, 0.92, (WIDTH - 3 * 1.9) / 2
    xs = [i * (w + gap) for i in range(3)]
    y1, y2 = 1.6, 0.1
    row1 = [("DNA file\n23andMe, Ancestry", "#e3f0ee", INK), ("Check file, fill\nmissing variants", TEAL, "white"),
            ("Genetic scores", TEAL, "white")]
    row2 = [("Risk report\nscreen or PDF", DEEP, "white"), ("Calibrated model\nand explanation", TEAL, "white"),
            ("Quantum features", PURPLE, "white")]
    for x, (t, c, tc) in zip(xs, row1, strict=True):
        _box(ax, x, y1, w, h, t, c, tc, 12.5)
    for x, (t, c, tc) in zip(xs, row2, strict=True):
        _box(ax, x, y2, w, h, t, c, tc, 12.5)
    for i in range(2):
        _arrow(ax, (xs[i] + w + 0.02, y1 + h / 2), (xs[i + 1] - 0.02, y1 + h / 2))
        _arrow(ax, (xs[i + 1] - 0.02, y2 + h / 2), (xs[i] + w + 0.02, y2 + h / 2))
    _arrow(ax, (xs[2] + w / 2, y1 - 0.02), (xs[2] + w / 2, y2 + h + 0.02))
    ax.text(xs[1] + w / 2, (y1 + y2 + h) / 2, "Six questionnaire answers", ha="center", va="center", fontsize=12,
            color=MUTED, fontweight="bold")
    _arrow(ax, (xs[1] + w / 2, 1.2), (xs[1] + w / 2, y2 + h + 0.02), MUTED)
    save(fig, "fig_app_flow.png")


def fig_circuit():
    """One layer of the 8-qubit encoder: load the dosages, trainable rotations, entangle; four layers in all."""
    fig, ax = _canvas(3.7)
    ys = [3.12 - i * 0.34 for i in range(8)]
    top, bottom = ys[0] + 0.15, ys[-1] - 0.15
    left, right = 0.72, 5.36
    for i, y in enumerate(ys):
        ax.plot([left - 0.02, right], [y, y], color=MUTED, lw=1.2, zorder=1)
        ax.text(0.64, y, f"SNP {i // 2 + 1}{'ab'[i % 2]}", ha="right", va="center", fontsize=12)
    _box(ax, 0.92, bottom, 1.12, top - bottom, "Load the\nSNP\ndosages", TEAL)
    _box(ax, 2.2, bottom, 1.12, top - bottom, "Trainable\nRY and RZ\nrotations", PURPLE)
    inside, between = [(0, 1), (2, 3), (4, 5), (6, 7)], [(1, 2), (3, 4), (5, 6)]
    for edges, x in ((inside, 3.62), (between, 4.02)):
        for i, j in edges:
            ax.plot([x, x], [ys[i], ys[j]], color=INK, lw=1.8, zorder=3)
            ax.scatter([x, x], [ys[i], ys[j]], color=INK, s=46, zorder=4)
    ax.text(3.82, bottom - 0.2, "Entangle", ha="center", va="center", fontsize=12.5, fontweight="bold")
    ax.add_patch(Rectangle((0.82, bottom - 0.4), 3.46, top - bottom + 0.5, fc="none", ec=MUTED, lw=1.3, ls="--"))
    ax.text(2.55, top + 0.26, "This layer runs 4 times", ha="center", va="center", fontsize=12.5, fontweight="bold",
            color=DARK_GREY)
    for y in ys:
        ax.add_patch(FancyBboxPatch((4.52, y - 0.125), 0.46, 0.25, boxstyle="round,pad=0,rounding_size=0.05", fc=DEEP,
                                    ec="none", zorder=3))
        ax.text(4.75, y - 0.005, "Z", ha="center", va="center", color="white", fontsize=12, fontweight="bold", zorder=4)
    ax.text(5.44, (ys[0] + ys[-1]) / 2, "8 output\nfeatures", ha="left", va="center", fontsize=12.5,
            fontweight="bold")
    save(fig, "fig_circuit.png")


if __name__ == "__main__":
    cfg = load_config()
    tables: dict = {}
    for f in (fig_data, fig_e1, fig_sweeps, fig_e7, fig_e7b, fig_e9, fig_e10, fig_e11, fig_e12, fig_e13, fig_e14,
              fig_e15):
        f(tables)
    fig_lean_heatmap(cfg)
    fig_intro()
    fig_circuit()
    fig_architecture()
    fig_app_flow()
    save_json(tables, RES / "tables.json")
    print("wrote results/tables.json")
