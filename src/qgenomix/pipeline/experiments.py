"""Experiment drivers E0 to E9. Each writes JSON (and sometimes NPZ) into results/.

E0  data and simulator checks (PCA, mosaic fidelity, lean phenotype)
E1  main benchmark: all models, 3 seeds (also yields E5 entanglement ablation and E8 lean capture)
E2  power grid over interaction strengths (gamma, delta)
E3  sample-size curve
E4  null scenario: false positives and p-value calibration
E6  pair-selection strategies (QUBO vs top-K vs mRMR), from E2/E3 runs
E7  QAOA on small sub-QUBOs: ideal simulator, noisy FakeKingston simulator (and IBM hardware via script)
E9  transfer to real 1000 Genomes genomes by ancestry
"""

from __future__ import annotations

import time
from pathlib import Path

import numpy as np

from qgenomix.config import Config
from qgenomix.data.cohort import load_real, synthetic_sas
from qgenomix.pipeline.run import additive_features, run_once, search, search_covariates, search_only
from qgenomix.sim.simulator import choose_planted_pairs, simulate
from qgenomix.utils import load_json, log, save_json, seed_everything


def _sim(cfg: Config, **over) -> dict:
    return dict(cfg["simulator"]) | over


def _out(cfg: Config, name: str) -> Path:
    p = cfg.path("results") / name
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


# ---------------------------------------------------------------- E0
def e0_data_checks(cfg: Config) -> dict:
    import pandas as pd

    rng = seed_everything(cfg["seed"])
    real = load_real(cfg)
    sas = (real.meta["SuperPop"] == "SAS").to_numpy()
    syn = synthetic_sas(cfg, 10000, rng)
    pcs = pd.read_csv(cfg.path("processed") / "pcs_all.tsv", sep="\t")
    ph = simulate(syn, _sim(cfg), tuple(cfg["focus_pair"]), rng)
    lean = ph.bmi < cfg["eval"]["lean_bmi"]
    S_b, S_l = ph.scores["beta_cell"], ph.scores["lipodystrophy"]
    both_high = (S_b > np.quantile(S_b, 0.8)) & (S_l > np.quantile(S_l, 0.8))
    out = {
        "pca": {"pc1": pcs["PC1"].tolist(), "pc2": pcs["PC2"].tolist(), "superpop": real.meta["SuperPop"].tolist()},
        "eaf_real_sas": (real.G[sas].mean(0) / 2).tolist(),
        "eaf_mosaic": (syn.G.mean(0) / 2).tolist(),
        "prs_real_sas": real.prs[sas, -1].tolist(),
        "prs_mosaic": syn.prs[:3000, -1].tolist(),
        "prs_sd_ratio": (syn.prs.std(0) / real.prs[sas].std(0)).tolist(),
        "components": ph.components,
        "prevalence": float(ph.y.mean()),
        "case_rate_lean": float(ph.y[lean].mean()),
        "case_rate_nonlean": float(ph.y[~lean].mean()),
        "lean_share_of_cases": float(lean[ph.y == 1].mean()),
        "case_rate_both_high": float(ph.y[both_high].mean()),
        "case_rate_others": float(ph.y[~both_high].mean()),
        "bmi_both_high": float(ph.bmi[both_high].mean()),
        "bmi_others": float(ph.bmi[~both_high].mean()),
        "bmi_mean": float(ph.bmi.mean()),
        "bmi_sd": float(ph.bmi.std()),
        "n_snps": int(real.G.shape[1]),
        "clusters": real.snps["cluster"].value_counts().to_dict(),
        "snps": real.snps[["id", "rsid", "cluster", "weight", "eaf_sas", "eaf_all"]].to_dict("records"),
        "superpop_counts": real.meta["SuperPop"].value_counts().to_dict(),
    }
    if ph.clinical:
        from sklearn.metrics import roc_auc_score

        from qgenomix.clinical import idrs_category

        cl = ph.clinical
        cat = np.array([idrs_category(v) for v in cl["idrs"]])
        out["clinical"] = {
            "age_mean": float(cl["age"].mean()), "waist_mean_male": float(cl["waist"][cl["male"] == 1].mean()),
            "waist_mean_female": float(cl["waist"][cl["male"] == 0].mean()),
            "family_share": np.bincount(cl["family"], minlength=3).tolist(),
            "activity_share": np.bincount(cl["activity"], minlength=4).tolist(),
            "idrs_category_share": {k: float((cat == k).mean()) for k in ("low", "moderate", "high")},
            "idrs_category_case_rate": {k: float(ph.y[cat == k].mean()) for k in ("low", "moderate", "high")},
            "auc_idrs": float(roc_auc_score(ph.y, cl["idrs"])), "auc_bmi": float(roc_auc_score(ph.y, ph.bmi)),
            "auc_true_risk": float(roc_auc_score(ph.y, ph.true_risk())),
            "waist_per_bmi_both_high": float((cl["waist"] / ph.bmi)[both_high].mean()),
            "waist_per_bmi_others": float((cl["waist"] / ph.bmi)[~both_high].mean()),
            "lean_cases_idrs_high": float((cat[(ph.y == 1) & lean] == "high").mean()),
        }
    save_json(out, _out(cfg, "e0_data.json"))
    return out


# ---------------------------------------------------------------- E1 (+E5, E8)
def e1_benchmark(cfg: Config, seeds=(0, 1, 2), n: int | None = None) -> list[dict]:
    n = n or cfg["cohort"]["n"]
    results = []
    for seed in seeds:
        rng = seed_everything(cfg["seed"] + seed)
        cohort = synthetic_sas(cfg, n, rng)
        ph = simulate(cohort, _sim(cfg), tuple(cfg["focus_pair"]), rng)
        t0 = time.time()
        res = run_once(cohort, ph, cfg, seed=seed, quantum=True, boost_bin=str(cfg.path("plink")))
        log.info("E1 seed %d done in %.0f s", seed, time.time() - t0)
        test = res.pop("test")
        np.savez_compressed(_out(cfg, f"e1_preds_seed{seed}.npz"), y=test["y"], bmi=test["bmi"], idx=test["idx"],
                            **{f"p_{k}": v for k, v in test["preds"].items()})
        res |= {"seed": seed, "n": n, "config_hash": cfg.hash()}
        save_json(res, _out(cfg, f"e1_seed{seed}.json"))
        results.append(res)
    return results


# ---------------------------------------------------------------- E2 / E3 / E4 sweeps
def _sweep_one(cfg: Config, n: int, gamma: float, delta: float, seed: int, boost: bool = True) -> dict:
    rng = seed_everything(cfg["seed"] + 1000 + seed)
    cohort = synthetic_sas(cfg, n, rng)
    ph = simulate(cohort, _sim(cfg, gamma=gamma, delta=delta), tuple(cfg["focus_pair"]), rng)
    res = search_only(cohort, ph, cfg, seed, boost_bin=str(cfg.path("plink")) if boost else None)
    return res | {"n": n, "gamma": gamma, "delta": delta, "seed": seed}


def e2_power(cfg: Config, gammas=(0.0, 0.1, 0.2), deltas=(0.0, 0.1, 0.2, 0.3), seeds=range(5),
             n: int = 10000) -> list[dict]:
    rows = []
    for g in gammas:
        for d in deltas:
            for s in seeds:
                rows.append(_sweep_one(cfg, n, g, d, s))
                log.info("E2 gamma=%.2f delta=%.2f seed=%d edr10=%.2f", g, d, s,
                         rows[-1]["edr"]["score_test"]["edr@10"])
    save_json(rows, _out(cfg, "e2_power.json"))
    return rows


def e3_sample_size(cfg: Config, ns=(2500, 5000, 10000, 20000, 40000), seeds=range(5)) -> list[dict]:
    sim = cfg["simulator"]
    rows = []
    for n in ns:
        for s in seeds:
            rows.append(_sweep_one(cfg, n, sim["gamma"], sim["delta"], s, boost=n <= 20000))
            log.info("E3 n=%d seed=%d edr10=%.2f", n, s, rows[-1]["edr"]["score_test"]["edr@10"])
    save_json(rows, _out(cfg, "e3_sample_size.json"))
    return rows


def e4_null(cfg: Config, seeds=range(20), n: int = 10000) -> dict:
    from sklearn.model_selection import train_test_split

    from qgenomix.search.candidates import cross_mechanism_pairs, pair_features
    from qgenomix.search.relevance import null_design, score_test

    rows, all_p = [], []
    for s in seeds:
        rng = seed_everything(cfg["seed"] + 5000 + s)
        cohort = synthetic_sas(cfg, n, rng)
        ph = simulate(cohort, _sim(cfg, gamma=0.0, delta=0.0), tuple(cfg["focus_pair"]), rng)
        rows.append(search_only(cohort, ph, cfg, s, boost_bin=str(cfg.path("plink"))) | {"seed": s})
        y = ph.y.astype(int)
        dev, _ = train_test_split(np.arange(n), test_size=cfg["cv"]["test_frac"], stratify=y, random_state=s)
        cand = cross_mechanism_pairs(cohort.snps)
        X = pair_features(cohort.G[dev], cand)
        _, p = score_test(X, y[dev], null_design(cohort.G[dev], search_covariates(cohort, ph)[dev]))
        all_p.append(p)
        log.info("E4 seed %d: min p %.2e, bonferroni hits %d", s, p.min(), rows[-1]["n_sig_bonferroni"])
    P = np.concatenate(all_p)
    out = {"runs": rows, "n_tests": int(P.size), "frac_p_below_005": float((P < 0.05).mean()),
           "frac_p_below_001": float((P < 0.01).mean()),
           "qq_expected": (-np.log10((np.arange(1, 2001) - 0.5) / 2000)).tolist(),
           "qq_observed": (-np.log10(np.quantile(P, (np.arange(1, 2001) - 0.5) / 2000))).tolist(),
           "lambda_gc": float(np.median(_chi2_from_p(P)) / 0.4549364)}
    save_json(out, _out(cfg, "e4_null.json"))
    return out


def _chi2_from_p(p: np.ndarray) -> np.ndarray:
    from scipy import stats

    return stats.chi2.isf(np.clip(p, 1e-300, 1), df=1)


# ---------------------------------------------------------------- E7
def e7_qaoa(cfg: Config, depths=(1, 2, 3, 4, 6), n_vars: int = 12, k: int = 4, n_problems: int = 3,
            shots: int = 4000, noisy_depths=(1, 2)) -> dict:
    """QAOA on 12-variable sub-problems cut from a real search: choose 4 of 12 candidate pairs.

    Sub-problems are built around the strongest candidates that share SNPs, so redundancy actually matters.
    """
    from qiskit import transpile
    from qiskit_aer import AerSimulator
    from qiskit_ibm_runtime.fake_provider import FakeKingston

    from qgenomix.search.candidates import cross_mechanism_pairs, pair_features
    from qgenomix.search.qaoa import SelectionProblem, baselines, counts_to_probs, evaluate, qiskit_circuit, train_qaoa
    from qgenomix.search.qubo import redundancy_matrix
    from qgenomix.search.relevance import null_design, relevance, score_test

    rng = seed_everything(cfg["seed"])
    cohort = synthetic_sas(cfg, cfg["cohort"]["n"], rng)
    ph = simulate(cohort, _sim(cfg), tuple(cfg["focus_pair"]), rng)
    y = ph.y.astype(int)
    cand = cross_mechanism_pairs(cohort.snps)
    _, p = score_test(pair_features(cohort.G, cand), y,
                      null_design(cohort.G, search_covariates(cohort, ph)))
    rel = relevance(p)
    order = list(np.argsort(-rel))
    lam, tau = cfg["search"]["lam"], cfg["search"].get("tau", 0.1)
    backends = {"ideal_sampler": AerSimulator(), "noisy_fake_kingston": AerSimulator.from_backend(FakeKingston())}

    problems, used = [], set()
    for b in range(n_problems):
        # seed each sub-problem with the best unused candidate, then add the candidates that overlap it most
        # and fill up with the next strongest, so every sub-problem contains real shadow-pair structure
        seed_pair = next(i for i in order if i not in used)
        overlap = [i for i in order if i not in used and i != seed_pair and set(cand[i]) & set(cand[seed_pair])]
        idx = [seed_pair] + overlap[:5]
        idx += [i for i in order if i not in used and i not in idx][: n_vars - len(idx)]
        used.update(idx)
        idx = np.array(idx)
        r = rel[idx] / rel[idx].max()
        prob = SelectionProblem(r=r, R=redundancy_matrix(cohort.G, cand[idx], tau), k=k, lam=lam)
        bits, f, feas = prob.table()
        entry = {"block": b, "pairs": cand[idx].tolist(), "relevance": r.tolist(),
                 "n_overlaps": int((prob.R > 0).sum() // 2),
                 "optimum": bits[feas][np.argmax(f[feas])].astype(int).tolist(),
                 "warm_start": prob.warm_start().tolist(), "baselines": baselines(prob), "runs": []}
        for form in ("penalty", "xy"):
            prev = None
            for depth in depths:
                init = None if prev is None else np.hstack([prev, prev[:, -1:]])
                t0 = time.time()
                res = train_qaoa(prob, form, depth, steps=150, restarts=3, lr=0.05, init=init, seed=b * 100 + depth)
                prev = res.params
                row = {"formulation": form, "depth": depth, "ideal": res.metrics, "params": res.params.tolist(),
                       "train_seconds": time.time() - t0}
                if depth in noisy_depths:
                    qc = qiskit_circuit(prob, form, res.params)
                    for bname, backend in backends.items():
                        tqc = transpile(qc, backend, optimization_level=3, seed_transpiler=0)
                        counts = backend.run(tqc, shots=shots, seed_simulator=depth).result().get_counts()
                        pr = counts_to_probs(counts, n_vars)
                        row[bname] = evaluate(prob, pr) | {
                            "n_2q": int(sum(1 for i in tqc.data if i.operation.num_qubits == 2)),
                            "depth_2q": int(tqc.depth(lambda i: i.operation.num_qubits == 2))}
                        if b == 0 and depth == 2:
                            row[bname]["probs"] = pr.tolist()
                if b == 0 and depth == 2:
                    row["ideal"]["probs"] = res.probs.tolist()
                entry["runs"].append(row)
                log.info("E7 block %d %s p=%d: AR %.3f P(opt) %.3f P(feas) %.3f", b, form, depth,
                         res.metrics["approx_ratio"], res.metrics["p_optimal"], res.metrics["p_feasible"])
        if b == 0:
            entry["f"] = f.tolist()
            entry["feasible"] = feas.tolist()
        problems.append(entry)
        np.savez(_out(cfg, f"e7_problem{b}.npz"), r=prob.r, R=prob.R, k=k, lam=lam)
    out = {"n_vars": n_vars, "k": k, "shots": shots, "problems": problems}
    save_json(out, _out(cfg, "e7_qaoa.json"))
    return out


# ---------------------------------------------------------------- E9
def e9_real_genomes(cfg: Config, n_train: int = 20000, pheno_seeds=range(20)) -> dict:
    from qgenomix.data.cohort import Cohort
    from qgenomix.eval.metrics import auc
    from qgenomix.models import zoo
    from qgenomix.search.candidates import cross_mechanism_pairs, pair_features

    rng = seed_everything(cfg["seed"] + 9)
    train = synthetic_sas(cfg, n_train, rng)
    real = load_real(cfg)
    focus = tuple(cfg["focus_pair"])
    planted = choose_planted_pairs(train.snps, focus, cfg["simulator"]["n_planted"],
                                   cfg["simulator"]["planted_min_maf"], rng)
    ph_tr = simulate(train, _sim(cfg), focus, rng, planted=planted)
    cand = cross_mechanism_pairs(train.snps)
    s = search(train.G, ph_tr.y.astype(int), search_covariates(train, ph_tr), cand, cfg["search"], cfg["seed"])
    pairs = cand[s["chosen"]["qubo"]]
    xgbp = cfg["models"]["xgb"]

    def feats(c: Cohort, ph):
        A = additive_features(c, ph)
        return A, np.column_stack([A, c.G]), np.column_stack([A, c.G, pair_features(c.G, pairs, train.G.mean(0))])

    A_tr, B_tr, P_tr = feats(train, ph_tr)
    y_tr = ph_tr.y.astype(int)
    pops = ["SAS", "EUR", "EAS", "AMR", "AFR"]
    res = {p: {m: [] for m in ("M2_prs", "M3_additive", "M6_xgb", "M7_xgb_pairs")} for p in pops}
    prev = {p: [] for p in pops}
    sp = real.meta["SuperPop"].to_numpy()
    p_prs = zoo.fit_lr(train.prs, y_tr, real.prs)  # genetics only: does not depend on the phenotype draw
    for s_ in pheno_seeds:
        r2 = np.random.default_rng(10_000 + s_)
        ph = simulate(real, _sim(cfg), focus, r2, planted=planted)  # same generative model, real genomes
        A_te, B_te, P_te = feats(real, ph)
        preds = {
            "M2_prs": p_prs,
            "M3_additive": zoo.fit_lr(A_tr, y_tr, A_te),
            "M6_xgb": zoo.fit_xgb(B_tr, y_tr, B_te, xgbp, 0),
            "M7_xgb_pairs": zoo.fit_xgb(P_tr, y_tr, P_te, xgbp, 0),
        }
        y = ph.y.astype(int)
        for pop in pops:
            m = sp == pop
            prev[pop].append(float(y[m].mean()))
            for name, p in preds.items():
                res[pop][name].append(auc(y[m], p[m]) if 0 < y[m].sum() < m.sum() else np.nan)
        log.info("E9 phenotype seed %d done", s_)
    out = {"auc": res, "prevalence": prev, "n_by_pop": {p: int((sp == p).sum()) for p in pops},
           "note": "models trained on synthetic South Asians; phenotypes simulated on real 1000G genomes"}
    save_json(out, _out(cfg, "e9_real_genomes.json"))
    return out


def load_results(cfg: Config, name: str):
    return load_json(cfg.path("results") / name)


# ---------------------------------------------------------------- E10
def e10_lifestyle(cfg: Config, n: int = 10000) -> dict:
    """Do the app's lifestyle what-ifs match the true effect built into the simulator?

    Uses the deployed bundle on fresh synthetic people. For each scenario the model's predicted risk before and
    after the change is compared with the simulator's exact case probability before and after.
    """
    from qgenomix.app.bundle import load_bundle, predict

    b = load_bundle(cfg.path("bundle"))
    rng = seed_everything(cfg["seed"] + 10)
    cohort = synthetic_sas(cfg, n, rng)
    ph = simulate(cohort, _sim(cfg), tuple(cfg["focus_pair"]), rng)
    C = ph.clinical_matrix()  # age, male, bmi, waist, activity, family
    risk0, _ = predict(b, cohort.prs, C, cohort.G)
    true0 = ph.true_risk()
    genetic = np.digitize(cohort.prs[:, -1], np.quantile(cohort.prs[:, -1], [0.2, 0.4, 0.6, 0.8]))
    bmi, waist, act = C[:, 2], C[:, 3], C[:, 4]

    def scenario(new_act=None, d_waist=0.0, d_bmi=0.0):
        C2 = C.copy()
        if new_act is not None:
            C2[:, 4] = new_act
        C2[:, 3] = waist + d_waist
        C2[:, 2] = bmi + d_bmi
        risk1, _ = predict(b, cohort.prs, C2, cohort.G)
        shift = ph.lifestyle_shift(activity=None if new_act is None else np.full(n, new_act),
                                   waist=waist + d_waist if d_waist else None, bmi=bmi + d_bmi if d_bmi else None)
        return risk1, ph.true_risk(shift)

    scen = {"vigorous_exercise": scenario(new_act=0), "waist_minus_5cm": scenario(d_waist=-5.0, d_bmi=-2.0),
            "both": scenario(new_act=0, d_waist=-5.0, d_bmi=-2.0)}
    out = {"n": n, "scenarios": {}}
    for name, (risk1, true1) in scen.items():
        who = act > 0 if name != "waist_minus_5cm" else np.ones(n, bool)
        rows = []
        for q in range(5):
            m = who & (genetic == q)
            rows.append({"quintile": q + 1, "n": int(m.sum()),
                         "model_before": float(risk0[m].mean()), "model_after": float(risk1[m].mean()),
                         "true_before": float(true0[m].mean()), "true_after": float(true1[m].mean())})
        d_model, d_true = (risk1 - risk0)[who], (true1 - true0)[who]
        out["scenarios"][name] = {
            "by_genetic_quintile": rows,
            "model_relative_change": float(d_model.sum() / risk0[who].sum()),
            "true_relative_change": float(d_true.sum() / true0[who].sum()),
            "model_absolute_change": float(d_model.mean()), "true_absolute_change": float(d_true.mean()),
            "corr_individual_change": float(np.corrcoef(d_model, d_true)[0, 1]),
        }
        log.info("E10 %s: model %.1f%% vs true %.1f%% relative change", name,
                 100 * out["scenarios"][name]["model_relative_change"],
                 100 * out["scenarios"][name]["true_relative_change"])
    save_json(out, _out(cfg, "e10_lifestyle.json"))
    return out
