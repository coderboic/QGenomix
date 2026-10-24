"""Turn results/*.json into figures/*.png and results/tables.json (skips anything not yet computed).

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

from qgenomix.config import load_config  # noqa: E402
from qgenomix.eval.stats import delong_test, holm, mcnemar_test  # noqa: E402
from qgenomix.models.zoo import MODEL_INFO  # noqa: E402
from qgenomix.utils import save_json  # noqa: E402

RES, FIG = ROOT / "results", ROOT / "figures"
FIG.mkdir(exist_ok=True)
INK, MUTED, LINE = "#15232b", "#586a72", "#d3dde0"
TEAL, PURPLE, AMBER, RED, GREEN, GREY = "#0a756f", "#5a4fb0", "#a8650a", "#b3261e", "#1d7f47", "#8a979e"
POP_COL = {"SAS": TEAL, "EUR": PURPLE, "EAS": AMBER, "AMR": GREEN, "AFR": RED}
plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 10, "axes.edgecolor": MUTED, "axes.labelcolor": INK,
    "xtick.color": MUTED, "ytick.color": MUTED, "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": LINE, "grid.linewidth": 0.6, "figure.dpi": 150, "savefig.bbox": "tight",
    "axes.titleweight": "bold", "axes.titlesize": 11, "legend.frameon": False,
})


def load(name):
    p = RES / name
    return json.loads(p.read_text()) if p.exists() else None


def save(fig, name):
    fig.savefig(FIG / name)
    plt.close(fig)
    print("wrote", name)


FAMILY = {"M0_idrs": GREY, "M1_bmi": GREY, "M3c_clinical": GREY, "M2_prs": GREY,
          "M3_additive": GREY, "M4_rf": AMBER, "M5_svm": AMBER, "M6_xgb": AMBER,
          "M7_xgb_pairs": AMBER, "M8_xgb_twin": AMBER, "H_twin": AMBER, "M9_xgb_noent": PURPLE, "H_noent": PURPLE,
          "M10_xgb_vqc": PURPLE, "H_vqc": PURPLE, "M11_qsvc": PURPLE, "M12_stack": TEAL}
ORDER = ["M0_idrs", "M1_bmi", "M3c_clinical", "M2_prs",
         "M3_additive", "M4_rf", "M5_svm", "M6_xgb", "M7_xgb_pairs", "H_twin", "M8_xgb_twin",
         "H_noent", "M9_xgb_noent", "H_vqc", "M10_xgb_vqc", "M11_qsvc", "M12_stack"]


def fig_data(tables):
    e0 = load("e0_data.json")
    if not e0:
        return
    fig, ax = plt.subplots(1, 3, figsize=(13, 3.8))
    pcs = e0["pca"]
    for pop, col in POP_COL.items():
        m = np.array(pcs["superpop"]) == pop
        ax[0].scatter(np.array(pcs["pc1"])[m], np.array(pcs["pc2"])[m], s=5, alpha=0.6, color=col, label=pop)
    ax[0].set(title="1000 Genomes: genetic PCs", xlabel="PC1", ylabel="PC2")
    ax[0].legend(markerscale=3, fontsize=8)
    ax[1].scatter(e0["eaf_real_sas"], e0["eaf_mosaic"], s=14, color=TEAL)
    ax[1].plot([0, 1], [0, 1], color=MUTED, lw=0.8, ls="--")
    r = np.corrcoef(e0["eaf_real_sas"], e0["eaf_mosaic"])[0, 1]
    ax[1].set(title="Mechanism SNP frequencies", xlabel="real South Asians (n = 489)",
              ylabel="synthetic mosaic (n = 10,000)")
    ax[1].text(0.05, 0.9, f"r = {r:.4f}", transform=ax[1].transAxes, color=INK)
    real, syn = np.array(e0["prs_real_sas"]), np.array(e0["prs_mosaic"])
    bins = np.linspace(min(real.min(), syn.min()), max(real.max(), syn.max()), 40)
    ax[2].hist(real, bins=bins, density=True, alpha=0.55, color=PURPLE, label="real SAS")
    ax[2].hist(syn, bins=bins, density=True, alpha=0.55, color=TEAL, label="mosaic")
    ax[2].set(title="D-PRISM PRS (SAS weights)", xlabel="score", ylabel="density")
    ax[2].legend()
    save(fig, "fig_data_checks.png")
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
    bmi = np.array([[ph.bmi[(qb == i) & (ql == j)].mean() for j in range(5)] for i in range(5)])
    fig, ax = plt.subplots(figsize=(5.4, 4.4))
    im = ax.imshow(rate * 100, origin="lower", cmap="YlOrRd")
    for i in range(5):
        for j in range(5):
            ax.text(j, i, f"{rate[i, j] * 100:.0f}%\n{bmi[i, j]:.1f}", ha="center", va="center", fontsize=7.5,
                    color="white" if rate[i, j] > 0.2 else INK)
    ax.set(xticks=range(5), yticks=range(5), xticklabels=[f"Q{k}" for k in range(1, 6)],
           yticklabels=[f"Q{k}" for k in range(1, 6)], xlabel="lipodystrophy score quintile",
           ylabel="β-cell score quintile", title="Simulated case rate (and mean BMI)")
    ax.grid(False)
    fig.colorbar(im, ax=ax, label="case rate (%)", shrink=0.8)
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
    fig, ax = plt.subplots(figsize=(8, 6.2))
    y = np.arange(len(names))[::-1]
    m = [rows[n]["auc"][0] for n in names]
    s = [rows[n]["auc"][1] for n in names]
    ax.barh(y, m, xerr=s, color=[FAMILY[n] for n in names], height=0.65, error_kw={"ecolor": INK, "lw": 0.8})
    for yi, mi in zip(y, m, strict=True):
        ax.text(mi + 0.006, yi, f"{mi:.3f}", va="center", fontsize=8, color=INK)
    ax.set(yticks=y, yticklabels=names, xlabel=f"test AUC (mean ± sd over {len(runs)} seeds)",
           title="E1 · Benchmark on held-out synthetic South Asians (N = 10,000)")
    lo = min(m) - 0.05
    ax.set_xlim(max(0.45, lo), min(1.0, max(m) + 0.06))
    from matplotlib.patches import Patch

    ax.legend(handles=[Patch(color=GREY, label="screening / additive"), Patch(color=AMBER, label="classical ML"),
                       Patch(color=PURPLE, label="quantum"), Patch(color=TEAL, label="QGenomix stack")],
              loc="upper left", bbox_to_anchor=(1.01, 1.0), fontsize=8)
    save(fig, "fig_e1_benchmark.png")

    # E5 entanglement ablation: paired by seed
    pairs = [("H_twin", "H_noent", "H_vqc"), ("M8_xgb_twin", "M9_xgb_noent", "M10_xgb_vqc")]
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.8))
    for ax, trio in zip(axes, pairs, strict=True):
        for r in runs:
            vals = [r["metrics"][n]["auc"] for n in trio]
            ax.plot(range(3), vals, "-o", color=MUTED, alpha=0.5, ms=4)
        means = [np.mean([r["metrics"][n]["auc"] for r in runs]) for n in trio]
        ax.plot(range(3), means, "-o", color=PURPLE, lw=2.2, ms=7, label="mean")
        ax.set(xticks=range(3), xticklabels=["classical\ntwin", "VQC, no\nentanglement", "VQC,\nentangled"],
               ylabel="test AUC", xlim=(-0.3, 2.3))
        ax.legend()
    axes[0].set_title("E5 · Encoder with its own linear head")
    axes[1].set_title("E5 · Encoder features fed to XGBoost")
    save(fig, "fig_e5_entanglement.png")

    # E8 lean capture
    show = ["M1_bmi", "M0_idrs", "M3c_clinical", "M2_prs", "M3_additive", "M10_xgb_vqc", "M12_stack"]
    show = [n for n in show if n in rows]
    fig, ax = plt.subplots(figsize=(9.5, 3.8))
    x = np.arange(len(show))
    cc = [rows[n]["case_capture"][0] * 100 for n in show]
    lc = [rows[n]["lean_case_capture"][0] * 100 for n in show]
    ax.bar(x - 0.2, cc, 0.38, color=GREY, label="all cases caught")
    ax.bar(x + 0.2, lc, 0.38, color=RED, label="lean cases caught (BMI < 23)")
    for xi, v in zip(x + 0.2, lc, strict=True):
        ax.text(xi, v + 1, f"{v:.0f}%", ha="center", fontsize=8)
    ax.set(xticks=x, xticklabels=show, ylabel="% caught when screening top 20%",
           title="E8 · The lean blind spot: who does each strategy catch?")
    ax.legend(fontsize=8)
    save(fig, "fig_e8_lean.png")

    # losses
    r0 = runs[0]
    if r0.get("losses"):
        fig, ax = plt.subplots(figsize=(5.5, 3.4))
        for k, col in (("loss_vqc", PURPLE), ("loss_vqc_noent", AMBER), ("loss_twin", GREY)):
            if k in r0["losses"]:
                ax.plot(range(1, len(r0["losses"][k]) + 1), r0["losses"][k], "-o", ms=3, color=col,
                        label=k.replace("loss_", ""))
        ax.set(xlabel="epoch", ylabel="weighted BCE loss", title="Encoder training (final refit, seed 0)")
        ax.legend()
        save(fig, "fig_training_loss.png")

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
        fig, axes = plt.subplots(1, 2, figsize=(11, 3.8))
        for name, col, lab in (("score_test", TEAL, "score test (ours)"), ("boost", AMBER, "PLINK BOOST")):
            means = [np.mean([r["edr"][name]["edr@10"] for r in e2 if r["delta"] == d and r["gamma"] == gammas[-1]
                              and name in r["edr"]]) for d in deltas]
            axes[0].plot(deltas, means, "-o", color=col, label=lab)
        sel = [np.mean([r["selection"]["qubo"]["recall"] for r in e2 if r["delta"] == d and
                        r["gamma"] == gammas[-1]]) for d in deltas]
        axes[0].plot(deltas, sel, "--s", color=PURPLE, label="QUBO-selected set (K = 48)")
        axes[0].set(xlabel="planted pair effect δ (sd units)", ylabel="share of planted pairs found",
                    title=f"E2 · Power vs interaction strength (γ = {gammas[-1]})", ylim=(-0.03, 1.03))
        axes[0].legend(fontsize=8)
        for g, col in zip(gammas, (GREY, AMBER, RED), strict=False):
            ps = [np.mean([r["mech_interaction_p"] < 0.05 for r in e2 if r["gamma"] == g and r["delta"] == d])
                  for d in deltas]
            axes[1].plot(deltas, ps, "-o", color=col, label=f"γ = {g}")
        axes[1].axhline(0.05, color=MUTED, ls=":", lw=1)
        axes[1].set(xlabel="planted pair effect δ", ylabel="share of runs with p < 0.05",
                    title="E2 · Mechanism-level interaction test (β × lipo)", ylim=(-0.03, 1.03))
        axes[1].legend(fontsize=8)
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
        fig, ax = plt.subplots(figsize=(6, 3.8))
        for name, col, lab in (("score_test", TEAL, "score test top-10"), ("boost", AMBER, "PLINK BOOST top-10")):
            pts = [(n, np.mean([r["edr"][name]["edr@10"] for r in e3 if r["n"] == n and name in r["edr"]]))
                   for n in ns if any(name in r["edr"] for r in e3 if r["n"] == n)]
            ax.plot(*zip(*pts, strict=True), "-o", color=col, label=lab)
        ax.plot(ns, [np.mean([r["selection"]["qubo"]["recall"] for r in e3 if r["n"] == n]) for n in ns], "--s",
                color=PURPLE, label="QUBO-selected set (K = 48)")
        ax.set_xscale("log")
        ax.xaxis.set_minor_locator(matplotlib.ticker.NullLocator())
        ax.set(xticks=ns, xticklabels=[f"{n / 1000:g}k" for n in ns],
               xlabel="cohort size", ylabel="share of planted pairs found", ylim=(-0.03, 1.03),
               title="E3 · How many people are needed?")
        ax.legend(fontsize=8)
        save(fig, "fig_e3_sample_size.png")
        def at(n, f):
            return float(np.mean([f(r) for r in e3 if r["n"] == n]))

        tables["e3"] = {str(n): {"edr10_score": at(n, lambda r: r["edr"]["score_test"]["edr@10"]),
                                 "recall_qubo": at(n, lambda r: r["selection"]["qubo"]["recall"]),
                                 "time_score": float(np.mean([r["time_score"] for r in e3 if r["n"] == n]))}
                        for n in ns}

    e4 = load("e4_null.json")
    if e4:
        fig, ax = plt.subplots(1, 2, figsize=(10, 3.8))
        ax[0].plot(e4["qq_expected"], e4["qq_observed"], ".", ms=3, color=TEAL)
        mx = max(e4["qq_expected"])
        ax[0].plot([0, mx], [0, mx], color=MUTED, ls="--", lw=0.8)
        ax[0].set(xlabel="expected −log10 p", ylabel="observed −log10 p",
                  title=f"E4 · Null QQ plot ({e4['n_tests']:,} tests, λ = {e4['lambda_gc']:.3f})")
        runs = e4["runs"]
        bonf = [r["n_sig_bonferroni"] for r in runs]
        boost_top = [r["edr"]["boost"]["edr@10"] if "boost" in r["edr"] else 0 for r in runs]
        n_cand = runs[0]["n_candidates"]
        thr = -np.log10(0.05 / n_cand)
        best = [-np.log10(r["min_p"]) for r in runs]
        ax[1].scatter(range(1, len(runs) + 1), best, color=TEAL, s=28, zorder=3, label="strongest pair in the run")
        ax[1].axhline(thr, color=RED, lw=1.2, ls="--", label=f"Bonferroni threshold (0.05 / {n_cand:,})")
        ax[1].set(xlabel="null simulation (no true interaction)", ylabel="−log10 p of the strongest pair",
                  ylim=(0, thr + 1.2), xticks=[1, 5, 10, 15, 20],
                  title=f"E4 · {sum(b > 0 for b in bonf)} of {len(runs)} null runs report any interaction")
        ax[1].legend(fontsize=8, loc="lower right")
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
        fig, ax = plt.subplots(1, 3, figsize=(11, 3.6))
        labels = ["top-K", "mRMR", "QUBO"]
        cols = [GREY, AMBER, PURPLE]
        fmt = {"recall": "{:.0%}", "shadow_pairs": "{:.1f}", "distinct_snps": "{:.1f}"}
        for a, metric, title in zip(ax, ("recall", "shadow_pairs", "distinct_snps"),
                                    ("planted pairs kept in the 48", "shadow pairs among the 48 (lower = better)",
                                     "distinct SNPs covered (of 62)"), strict=True):
            vals = [stats_[s][metric] for s in strat]
            a.bar(labels, vals, color=cols, width=0.6)
            for i, v in enumerate(vals):
                a.text(i, v * 1.01, fmt[metric].format(v), ha="center", va="bottom", fontsize=9, color=INK)
            a.set_title(title, fontsize=10)
            a.set_ylim(0, max(vals) * 1.18)
        wins_txt = ", ".join(f"{lab} {wins[s]:.0%}" for lab, s in zip(labels, strat, strict=True))
        fig.suptitle(f"E6 · Pair-selection strategies ({len(rows)} simulated datasets) · "
                     f"best QUBO objective: {wins_txt}", fontweight="bold", fontsize=11)
        save(fig, "fig_e6_search.png")
        tables["e6"] = {"stats": stats_, "best_objective_share": wins, "n_runs": len(rows)}


def fig_e7(tables):
    e7 = load("e7_qaoa.json")
    if not e7:
        return
    hw = load("e7_hardware.json")
    probs_ = e7["problems"]
    depths = sorted({r["depth"] for r in probs_[0]["runs"]})
    fig, ax = plt.subplots(1, 3, figsize=(15, 4.0))
    styles = {"penalty": ("--", "o", "penalty QUBO, X mixer"), "xy": ("-", "s", "constraint-preserving XY mixer")}

    def mean_metric(form, depth, key, metric):
        vals = [r[key][metric] for p in probs_ for r in p["runs"]
                if r["formulation"] == form and r["depth"] == depth and key in r]
        return np.mean(vals) if vals else np.nan

    for form, (ls, mk, lab) in styles.items():
        ax[0].plot(depths, [mean_metric(form, d, "ideal", "approx_ratio") for d in depths], ls, marker=mk,
                   color=PURPLE, label=f"{lab} · ideal")
        nd = [d for d in depths if not np.isnan(mean_metric(form, d, "noisy_fake_kingston", "approx_ratio"))]
        ax[0].plot(nd, [mean_metric(form, d, "noisy_fake_kingston", "approx_ratio") for d in nd], ls, marker=mk,
                   color=RED, label=f"{lab} · noisy (Kingston model)")
        ax[1].plot(depths, [mean_metric(form, d, "ideal", "p_feasible") for d in depths], ls, marker=mk,
                   color=PURPLE, label=f"{lab} · ideal")
        ax[1].plot(nd, [mean_metric(form, d, "noisy_fake_kingston", "p_feasible") for d in nd], ls, marker=mk,
                   color=RED, label=f"{lab} · noisy")
    if hw:
        for form, (ls, _mk, lab) in styles.items():
            hd = sorted({r["depth"] for r in hw["results"] if r["formulation"] == form})
            ax[0].plot(hd, [np.mean([r["approx_ratio"] for r in hw["results"] if r["formulation"] == form
                                     and r["depth"] == d]) for d in hd], ls, marker="D", color=INK,
                       label=f"{lab} · IBM {hw['backend']}")
    b = probs_[0]["baselines"]
    ax[0].axhline(np.mean([p["baselines"]["uniform_feasible"]["approx_ratio"] for p in probs_]), color=GREY, ls=":",
                  label="random valid selection")
    ax[0].axhline(np.mean([p["baselines"]["uniform_all"]["approx_ratio"] for p in probs_]), color=GREY, ls="-.",
                  lw=0.8, label="random bitstring")
    ax[0].set(xlabel="QAOA depth p", ylabel="approximation ratio", xticks=depths, ylim=(-0.02, 1.02),
              title=f"E7 · Solution quality (choose {e7['k']} of {e7['n_vars']} pairs)")
    handles, labels = ax[0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="upper center", bbox_to_anchor=(0.36, 0.0), ncol=3, fontsize=8.5)
    ax[1].axhline(b["uniform_all"]["p_feasible"], color=GREY, ls="-.", lw=0.8, label="random bitstring")
    ax[1].set(xlabel="QAOA depth p", ylabel="P(valid selection of exactly k)", xticks=depths, ylim=(-0.02, 1.05),
              title="E7 · Does the circuit respect the constraint?")

    gates = []
    for form in ("penalty", "xy"):
        for d in (1, 2):
            rr = [r for p in probs_ for r in p["runs"] if r["formulation"] == form and r["depth"] == d
                  and "noisy_fake_kingston" in r]
            if rr:
                gates.append((f"{form}\np={d}", np.mean([r["ideal_sampler"]["n_2q"] for r in rr]),
                              np.mean([r["noisy_fake_kingston"]["n_2q"] for r in rr])))
    if gates:
        x = np.arange(len(gates))
        ax[2].bar(x - 0.2, [g[1] for g in gates], 0.38, color=TEAL, label="logical (all-to-all)")
        ax[2].bar(x + 0.2, [g[2] for g in gates], 0.38, color=RED, label="after routing to Heron r2")
        ax[2].set(xticks=x, xticklabels=[g[0] for g in gates], ylabel="two-qubit gates",
                  title="E7 · Circuit cost on real hardware topology")
        ax[2].legend(fontsize=8)
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
    fig, ax = plt.subplots(figsize=(8.5, 3.8))
    w = 0.2
    for i, (m, col) in enumerate(zip(models, (GREY, TEAL, AMBER, PURPLE), strict=True)):
        means = [np.nanmean(e9["auc"][p][m]) for p in pops]
        sds = [np.nanstd(e9["auc"][p][m]) for p in pops]
        ax.bar(np.arange(len(pops)) + (i - 1.5) * w, means, w, yerr=sds, color=col, label=m,
               error_kw={"ecolor": INK, "lw": 0.7})
    ax.set(xticks=range(len(pops)), xticklabels=[f"{p}\n(n = {e9['n_by_pop'][p]})" for p in pops],
           ylabel="AUC", ylim=(0.5, 0.9), title="E9 · Models trained on synthetic South Asians, tested on real genomes")
    ax.legend(fontsize=8, ncol=4)
    save(fig, "fig_e9_real_genomes.png")
    tables["e9"] = {p: {m: (float(np.nanmean(e9["auc"][p][m])), float(np.nanstd(e9["auc"][p][m]))) for m in models}
                    | {"prevalence": float(np.mean(e9["prevalence"][p]))} for p in pops}


def fig_e10(tables):
    e10 = load("e10_lifestyle.json")
    if not e10:
        return
    names = {"vigorous_exercise": "Regular vigorous exercise", "waist_minus_5cm": "Waist 5 cm smaller",
             "both": "Both changes"}
    fig, axes = plt.subplots(1, 3, figsize=(13, 3.8), sharey=True)
    for ax, (key, title) in zip(axes, names.items(), strict=True):
        rows = e10["scenarios"][key]["by_genetic_quintile"]
        q = [r["quintile"] for r in rows]
        ax.plot(q, [100 * r["true_before"] for r in rows], "-", color=GREY, lw=2, label="true risk, now")
        ax.plot(q, [100 * r["true_after"] for r in rows], "--", color=GREY, lw=2, label="true risk, after change")
        ax.plot(q, [100 * r["model_before"] for r in rows], "-o", color=PURPLE, ms=5, label="QGenomix, now")
        ax.plot(q, [100 * r["model_after"] for r in rows], "--o", color=TEAL, ms=5, label="QGenomix, after change")
        sc = e10["scenarios"][key]
        ax.set(title=f"{title}\nmodel {100 * sc['model_relative_change']:+.0f}% · truth "
                     f"{100 * sc['true_relative_change']:+.0f}%", xlabel="genetic risk quintile (D-PRISM PRS)",
               xticks=q)
    axes[0].set_ylabel("mean risk of diabetes (%)")
    axes[0].legend(fontsize=8)
    fig.suptitle("E10 · Lifestyle what-ifs: the app's estimate against the simulator's true effect",
                 fontweight="bold", y=1.03)
    save(fig, "fig_e10_lifestyle.png")
    tables["e10"] = e10


POP_NAME = {"GIH": "Gujarati", "PJL": "Punjabi", "BEB": "Bengali", "STU": "Sri Lankan Tamil", "ITU": "Telugu",
            "male": "men", "female": "women", "all": "all South Asians"}


def fig_e7b(tables):
    e = load("e7b_mitigation.json")
    if not e:
        return
    runs = e["runs"]
    stages = [("raw", "noisy, no mitigation"), ("readout", "+ readout correction"),
              ("readout_postselect", "+ post-selection"), ("readout_postselect_zne", "+ zero-noise extrapolation")]
    shades = ["#d9d4f2", "#b1a8e4", "#8579cf", PURPLE]
    forms = [("penalty", "Penalty QUBO, X mixer"), ("xy", "Constraint-preserving XY mixer")]
    depths = sorted({r["depth"] for r in runs})
    fig, axes = plt.subplots(1, 2, figsize=(12, 4), sharey=True)
    summary = {}
    for ax, (form, title) in zip(axes, forms, strict=True):
        for di, d in enumerate(depths):
            rs = [r for r in runs if r["formulation"] == form and r["depth"] == d]
            if not rs:
                continue
            vals = {k: float(np.mean([r[k] for r in rs])) for k, _ in stages}
            ideal = float(np.mean([r["ideal_postselect"] for r in rs]))
            rand = float(np.mean([r["random_valid"] for r in rs]))
            summary[f"{form}_p{d}"] = vals | {"ideal_postselect": ideal, "random_valid": rand, "n_problems": len(rs),
                                              "n_2q": float(np.mean([r["n_2q"] for r in rs]))}
            for si, ((k, label), col) in enumerate(zip(stages, shades, strict=True)):
                x = di + (si - 1.5) * 0.19
                ax.bar(x, vals[k], width=0.17, color=col, label=label if di == 0 else None)
            ax.plot([di - 0.4, di + 0.4], [ideal, ideal], color=INK, lw=2,
                    label="noise-free, same post-selection" if di == 0 else None)
            ax.plot([di - 0.4, di + 0.4], [rand, rand], color=GREY, lw=1.4, ls="--",
                    label="random valid choice" if di == 0 else None)
            ax.text(di + (1.5 * 0.19), max(vals["readout_postselect_zne"], ideal) + 0.025,
                    f"{vals['readout_postselect_zne']:.2f}", ha="center", fontsize=9, color=INK, fontweight="bold")
        ax.set(title=title, xticks=range(len(depths)), xticklabels=[f"QAOA depth {d}" for d in depths], ylim=(0, 1))
    axes[0].set_ylabel("approximation ratio (1 = best selection)")
    handles, labels = axes[0].get_legend_handles_labels()
    fig.legend(handles, labels, fontsize=8.5, loc="upper center", bbox_to_anchor=(0.5, 0.0), ncol=3)
    fig.suptitle("E7b · Error mitigation on the IBM Kingston noise model (mean of 3 sub-problems)",
                 fontweight="bold", y=1.02)
    save(fig, "fig_e7b_mitigation.png")
    tables["e7b"] = summary


def fig_e11(tables):
    e = load("e11_fairness.json")
    if not e:
        return
    groups = ["GIH", "PJL", "BEB", "STU", "ITU", "male", "female", "all"]
    g = e["groups"]
    x = np.arange(len(groups))
    fig, axes = plt.subplots(1, 3, figsize=(15, 4))
    for ax, (k1, k2, title, ylabel) in zip(axes[:2], [
            ("auc_clinical", "auc_genetic", "Accuracy in each group", "AUC (pooled over 20 outcome draws)"),
            ("capture_clinical", "capture_genetic", "Cases caught when screening the top 20%",
             "share of the group's cases caught")], strict=True):
        v1 = [g[k][k1] if k1.startswith("auc") else g[k][k1][0] for k in groups]
        v2 = [g[k][k2] if k2.startswith("auc") else g[k][k2][0] for k in groups]
        ax.bar(x - 0.2, v1, 0.38, color=GREY, label="clinical factors only")
        ax.bar(x + 0.2, v2, 0.38, color=TEAL, label="clinical + genetics")
        for xi, v in zip(x, v2, strict=True):
            ax.text(xi + 0.2, v + 0.01, f"{v:.2f}", ha="center", fontsize=8, color=INK)
        ax.set(title=title, ylabel=ylabel, ylim=(0.4 if k1.startswith("auc") else 0, 1.06), xticks=x)
        ax.set_xticklabels([POP_NAME[k] for k in groups], rotation=30, ha="right")
        ax.axvline(4.5, color=LINE, lw=1)
    axes[0].legend(fontsize=8, loc="upper left", ncol=2)
    oe = [g[k]["oe"] for k in groups]
    axes[2].errorbar(x, [o[0] for o in oe], yerr=[o[1] for o in oe], fmt="o", color=TEAL, ms=7, capsize=3)
    axes[2].axhline(1, color=MUTED, lw=1, ls="--")
    axes[2].set(title="Calibration (observed / expected cases)", ylabel="O/E, mean ± sd over 20 draws",
                ylim=(0.4, 1.6), xticks=x)
    axes[2].set_xticklabels([POP_NAME[k] for k in groups], rotation=30, ha="right")
    axes[2].axvline(4.5, color=LINE, lw=1)
    fig.suptitle("E11 · Fairness across South Asian populations and sexes (real 1000 Genomes genomes, n = 489)",
                 fontweight="bold", y=1.02)
    save(fig, "fig_e11_fairness.png")
    tables["e11"] = {"n": e["n"], "groups": g}


def fig_e12(tables):
    e = load("e12_robustness.json")
    if not e:
        return
    summ = e["summary"]
    labels = list(summ)
    y = np.arange(len(labels))[::-1]
    fig, axes = plt.subplots(1, 3, figsize=(15, 5.2), sharey=True)
    pairs = [("auc_clinical", "auc_genetic", "AUC", "clinical only", "clinical + genetics"),
             ("lean_capture_idrs", "lean_capture_genetic", "lean cases caught in the top 20%", "IDRS",
              "clinical + genetics")]
    for ax, (a, b, xlabel, la, lb) in zip(axes[:2], pairs, strict=True):
        va, vb = [summ[k][a] for k in labels], [summ[k][b] for k in labels]
        ax.hlines(y, va, vb, color=LINE, lw=3)
        ax.scatter(va, y, color=GREY, s=45, zorder=3, label=la)
        ax.scatter(vb, y, color=TEAL, s=45, zorder=3, label=lb)
        ax.set(xlabel=xlabel)
        ax.legend(fontsize=8.5, loc="upper center", bbox_to_anchor=(0.5, -0.11), ncol=2)
    axes[0].set(yticks=y, title="Genetics adds accuracy in every setting")
    axes[0].set_yticklabels(labels)
    axes[1].set(title="and catches more lean cases than IDRS")
    axes[2].barh(y, [summ[k]["edr10_score_test"] for k in labels], color=PURPLE, height=0.6)
    axes[2].set(xlabel="planted gene pairs found in the top 10 (EDR@10)", xlim=(0, 1),
                title="Interaction search depends on effect size")
    fig.suptitle(f"E12 · Robustness to simulator assumptions (one change at a time; {len(e['seeds'])} seeds × "
                 f"{e['n']:,} people)", fontweight="bold", y=1.0)
    save(fig, "fig_e12_robustness.png")
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

    panels = [("PRS agreement with the full genome", "correlation, South Asian PRS component",
               lambda m: m["prs_r"][-1]),
              ("Error in the risk percentile shown", "mean absolute error (percentile points)",
               lambda m: m["risk_pct_mae"]),
              ("High-risk people still flagged high", "share of the full-genome top 20%",
               lambda m: m["high_risk_kept"])]
    fig, axes = plt.subplots(1, 3, figsize=(14, 3.9))
    summary = {}
    xs = [100 * c for c in covs]
    for ax, (title, ylabel, fn) in zip(axes, panels, strict=True):
        for method, col, label in (("mean_fill", GREY, "fill with population average"),
                                   ("ld_impute", TEAL, "LD imputation")):
            v = agg(method, fn)
            ax.errorbar(xs, [a for a, _ in v], yerr=[b for _, b in v], fmt="-o", color=col, ms=6, capsize=3,
                        lw=2, label=label)
            summary.setdefault(method, {})[title] = v
        ax.set(title=title, xlabel="share of PRS variants in the file (%)", ylabel=ylabel, xticks=xs)
    axes[0].legend(fontsize=8)
    fig.suptitle(f"E13 · Partial consumer DNA files: {e['n_test']} held-out real South Asian genomes, LD panel "
                 f"from the other {e['n_reference']}", fontweight="bold", y=1.03)
    save(fig, "fig_e13_imputation.png")
    tables["e13"] = {k: v for k, v in e.items() if k != "rows"} | {"summary": summary, "coverages": covs}


def fig_architecture():
    """System diagram: three inputs feeding stages S1-S8; quantum stages in purple."""
    from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

    classical, quantum, inp = ("#eef3f6", "#5b7383"), ("#efe9f8", "#6a4c9c"), ("#ffffff", "#8a9aa4")
    fig, ax = plt.subplots(figsize=(13, 7.6), dpi=200)
    ax.set(xlim=(0, 13), ylim=(0, 7.6))
    ax.axis("off")

    def box(x, y, w, h, title, body, kind, tag=None):
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.12", fc=kind[0],
                                    ec=kind[1], lw=1.4))
        if tag:
            ax.text(x + 0.14, y + h - 0.2, tag, fontsize=9.5, fontweight="bold", color=kind[1], va="top")
        ax.text(x + w / 2, y + h - (0.5 if tag else 0.28), title, fontsize=11, fontweight="bold", color=INK,
                ha="center", va="top")
        ax.text(x + w / 2, y + h - (0.92 if tag else 0.7), body, fontsize=9, color="#4d5f69", ha="center",
                va="top", linespacing=1.35)

    def arrow(p, q):
        ax.add_patch(FancyArrowPatch(p, q, arrowstyle="-|>", mutation_scale=14, lw=1.3, color="#5b7383"))

    iw, ih, iy = 3.9, 1.15, 6.25
    for x, t, b in [(0.25, "1000 Genomes phase 3",
                     "2,504 real genomes, 84M variants\n489 South Asians = 978 haplotypes"),
                    (4.55, "PGS Catalog scores", "D-PRISM South Asian PRS (1.3M SNPs)\n5 mechanism scores (β-cell, "
                                                 "lipodystrophy …)"),
                    (8.85, "Clinical questionnaire", "age, sex, BMI, waist, activity,\nparents with diabetes → IDRS")]:
        box(x, iy, iw, ih, t, b, inp)
    w, h, xs, y1, y2 = 2.95, 1.75, [0.25, 3.45, 6.65, 9.85], 3.85, 1.2
    row1 = [("S1", "Data preparation", "PLINK QC, PCA, PRS,\n62 mechanism SNPs,\nhaplotype + LD panels", classical),
            ("S2", "Cohort + simulator", "10,000 synthetic South\nAsians, clinical factors,\nliability-threshold T2D",
             classical),
            ("S3", "Interaction search", "Rao score test on all\n1,263 cross-mechanism\nSNP pairs, inside each CV fold",
             classical),
            ("S4", "Pair selection", "QUBO: relevance − overlap\nannealing; QAOA (XY mixer)\n+ error mitigation",
             quantum)]
    row2 = [("S5", "Quantum pair encoder", "8-qubit VQC, 48 pairs\n→ 96 features; no-entangle-\nment + classical twin",
             quantum),
            ("S6", "Model zoo", "17 predictors: IDRS, BMI,\nPRS, LR, RF, SVM, XGBoost,\nQSVC, stacked hybrid",
             classical),
            ("S7", "Evaluation E0–E13", "AUC, DeLong, EDR@K, lean\ncapture, null, fairness,\nrobustness, real genomes",
             classical),
            ("S8", "Risk report app", "LD imputation of DNA files,\nIDRS, what-ifs, PDF report;\nFastAPI + Streamlit, "
                                      "Docker", classical)]
    for x, (tag, t, b, k) in zip(xs, row1, strict=True):
        box(x, y1, w, h, t, b, k, tag)
    for x, (tag, t, b, k) in zip(reversed(xs), row2, strict=True):
        box(x, y2, w, h, t, b, k, tag)
    for i in range(3):
        arrow((xs[i] + w, y1 + h / 2), (xs[i + 1], y1 + h / 2))
        arrow((xs[3 - i], y2 + h / 2), (xs[2 - i] + w, y2 + h / 2))
    arrow((xs[3] + w / 2, y1), (xs[3] + w / 2, y2 + h))
    arrow((0.25 + iw * 0.4, iy), (xs[0] + w * 0.45, y1 + h))
    arrow((4.55 + 0.6, iy), (xs[0] + w * 0.82, y1 + h))
    arrow((8.85 + 0.6, iy), (xs[1] + w * 0.7, y1 + h))
    ax.text(0.25, 0.62, "Every quantum stage (purple) has a classical control: S4 vs annealing, top-K and mRMR; "
            "S5 vs the same circuit without entanglement and a classical twin.", fontsize=9.5, color="#4d5f69")
    for i, (k, label) in enumerate([(classical, "classical stage"), (quantum, "quantum stage"), (inp, "input data")]):
        ax.add_patch(FancyBboxPatch((0.25 + i * 2.6, 0.12), 0.32, 0.22, boxstyle="round,pad=0.01", fc=k[0], ec=k[1]))
        ax.text(0.7 + i * 2.6, 0.23, label, fontsize=9.5, color=INK, va="center")
    ax.grid(False)
    save(fig, "fig_architecture.png")


def fig_circuit():
    from qgenomix.quantum.circuit import draw

    draw(str(FIG / "fig_circuit.png"), layers=2)
    print("wrote fig_circuit.png")


if __name__ == "__main__":
    cfg = load_config()
    tables: dict = {}
    for f in (fig_data, fig_e1, fig_sweeps, fig_e7, fig_e7b, fig_e9, fig_e10, fig_e11, fig_e12, fig_e13):
        f(tables)
    fig_lean_heatmap(cfg)
    fig_circuit()
    fig_architecture()
    save_json(tables, RES / "tables.json")
    print("wrote results/tables.json")
