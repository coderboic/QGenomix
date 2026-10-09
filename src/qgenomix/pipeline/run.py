"""One complete QGenomix run on one simulated dataset: search, encoders, models, evaluation.

Leakage rules enforced here:
  * 20% of people form a test set that only the final refit ever predicts.
  * Within the other 80% ("dev"), 5-fold CV produces out-of-fold (OOF) predictions; every fold re-runs the
    pair search, re-fits scalers and re-trains the encoders on its own training part.
  * Decision thresholds and the stacking model are learned on OOF predictions, then applied to the test set.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

import numpy as np
import torch
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_predict, train_test_split
from sklearn.preprocessing import StandardScaler

from qgenomix.config import Config
from qgenomix.data.cohort import CLUSTERS, Cohort
from qgenomix.eval import metrics
from qgenomix.models import zoo
from qgenomix.quantum.encoder import VARIANTS, circuit_states, encode, pack_pairs, train_encoder
from qgenomix.quantum.kernel import QSVC
from qgenomix.search.candidates import cross_mechanism_pairs, pair_features
from qgenomix.search.qubo import redundancy_matrix
from qgenomix.search.relevance import null_design, relevance, score_test
from qgenomix.search.solvers import mean_redundancy, objective, select_mrmr, select_qubo_sa, select_topk
from qgenomix.sim.simulator import Phenotype
from qgenomix.utils import log, zscore

HEAD = {"vqc": "H_vqc", "vqc_noent": "H_noent", "twin": "H_twin"}
XGB_ON = {"vqc": "M10_xgb_vqc", "vqc_noent": "M9_xgb_noent", "twin": "M8_xgb_twin"}


@dataclass
class FoldResult:
    preds: dict[str, np.ndarray]
    search: dict
    extras: dict = field(default_factory=dict)


def clinical_features(pheno: Phenotype) -> np.ndarray:
    """Age, male, BMI, waist, activity (0 vigorous .. 3 sedentary), family history (0, 1, 2 parents)."""
    if pheno.clinical:
        return pheno.clinical_matrix()
    return pheno.bmi[:, None]


def additive_features(cohort: Cohort, pheno: Phenotype) -> np.ndarray:
    """PRS components (5), the clinical factors, and the five published mechanism scores."""
    return np.column_stack([cohort.prs, clinical_features(pheno),
                            *[pheno.scores[c] for c in CLUSTERS if c in pheno.scores]])


def search_covariates(cohort: Cohort, pheno: Phenotype) -> np.ndarray:
    """Covariates of the null model in the interaction score test: PRS components and clinical factors."""
    return np.column_stack([cohort.prs, clinical_features(pheno)])


def search(G: np.ndarray, y: np.ndarray, covars: np.ndarray, cand: np.ndarray, scfg: dict, seed: int) -> dict:
    """Score every candidate on these rows, prescreen, then select K pairs three ways."""
    t0 = time.time()
    X = pair_features(G, cand, center=G.mean(0))
    _, p = score_test(X, y, null_design(G, covars))
    rel = relevance(p)
    order = np.argsort(-rel, kind="stable")
    pre = order[: scfg["prescreen"]]
    R = redundancy_matrix(G, cand[pre], scfg.get("tau", 0.1))
    r = rel[pre] / max(rel[pre].max(), 1e-9)
    k, lam = scfg["k"], scfg["lam"]
    t1 = time.time()
    q_sel, q_info = select_qubo_sa(r, R, k, lam, num_reads=scfg["sa_reads"], seed=seed)
    t2 = time.time()
    sels = {"qubo": q_sel, "topk": select_topk(r, k), "mrmr": select_mrmr(r, R, k, lam)}
    stats = {name: {"objective": objective(s, r, R, lam), "mean_redundancy": mean_redundancy(s, R),
                    "distinct_snps": int(len(np.unique(cand[pre[s]]))), "overlapping_pairs": int((R[np.ix_(s, s)] > 0)
                                                                                                    .sum() // 2)}
             for name, s in sels.items()}
    # encode pairs in relevance order so circuit 0 carries the strongest pairs
    chosen = {name: pre[s[np.argsort(-r[s], kind="stable")]] for name, s in sels.items()}
    return {"order": order, "pvals": p, "chosen": chosen, "stats": stats, "qubo_info": q_info,
            "time_score": t1 - t0, "time_qubo": t2 - t1}


def _pair_importance(shap_vals: np.ndarray, start: int, n_pairs: int, per_pair: int) -> np.ndarray:
    """Mean |SHAP| per pair, for features laid out from column `start`, `per_pair` columns per pair."""
    block = np.abs(shap_vals[:, start:start + n_pairs * per_pair]).mean(0)
    return block.reshape(n_pairs, per_pair).sum(1)


def _ranking_from_importance(chosen: np.ndarray, imp: np.ndarray, base_order: np.ndarray) -> np.ndarray:
    first = chosen[np.argsort(-imp, kind="stable")]
    rest = base_order[~np.isin(base_order, first)]
    return np.concatenate([first, rest])


def fit_fold(cohort: Cohort, pheno: Phenotype, A: np.ndarray, cand: np.ndarray, tr: np.ndarray, te: np.ndarray,
             cfg: Config, seed: int, quantum: bool = True, explain: bool = False) -> FoldResult:
    G, y, bmi = cohort.G, pheno.y.astype(int), pheno.bmi
    xgb_params = cfg["models"]["xgb"]
    qcfg = cfg["quantum"]
    covars = search_covariates(cohort, pheno)
    s = search(G[tr], y[tr], covars[tr], cand, cfg["search"], seed)
    pairs = cand[s["chosen"]["qubo"]]

    base = np.column_stack([A, G])
    C = clinical_features(pheno)
    preds: dict[str, np.ndarray] = {
        "M1_bmi": bmi[te],
        "M2_prs": zoo.fit_lr(cohort.prs[tr], y[tr], cohort.prs[te]),
        "M3_additive": zoo.fit_lr(A[tr], y[tr], A[te]),
        "M4_rf": zoo.fit_rf(base[tr], y[tr], base[te], seed),
        "M5_svm": zoo.fit_svm(base[tr], y[tr], base[te], seed),
        "M6_xgb": zoo.fit_xgb(base[tr], y[tr], base[te], xgb_params, seed),
    }
    if pheno.clinical:
        preds["M0_idrs"] = pheno.clinical["idrs"][te].astype(float)
        preds["M3c_clinical"] = zoo.fit_lr(C[tr], y[tr], C[te])
    P = pair_features(G, pairs, center=G[tr].mean(0))
    with_pairs = np.column_stack([base, P])
    preds["M7_xgb_pairs"], m7 = zoo.fit_xgb(with_pairs[tr], y[tr], with_pairs[te], xgb_params, seed,
                                            return_model=True)
    extras: dict = {"time": {"score": s["time_score"], "qubo": s["time_qubo"]}}
    models_for_shap = {"M7_xgb_pairs": (m7, with_pairs[te], base.shape[1], 1)}

    if quantum:
        sc = StandardScaler().fit(A[tr])
        C_tr, C_te = sc.transform(A[tr]), sc.transform(A[te])
        Xq = pack_pairs(G, pairs)
        trained = {}
        for variant in VARIANTS:
            t0 = time.time()
            model, tlog = train_encoder(variant, Xq[tr], C_tr, y[tr], layers=qcfg["layers"], epochs=qcfg["epochs"],
                                        lr=qcfg["lr"], batch=qcfg["batch"], twin_hidden=qcfg["twin_hidden"],
                                        seed=seed)
            extras["time"][f"train_{variant}"] = time.time() - t0
            extras[f"loss_{variant}"] = tlog.losses
            extras[f"params_{variant}"] = tlog.n_params
            trained[variant] = model
            with torch.no_grad():
                logit = model(torch.tensor(Xq[te]), torch.tensor(C_te, dtype=torch.float32)).numpy()
            preds[HEAD[variant]] = 1 / (1 + np.exp(-logit))
            F = encode(model, Xq)
            Xf = np.column_stack([base, F])
            preds[XGB_ON[variant]], mdl = zoo.fit_xgb(Xf[tr], y[tr], Xf[te], xgb_params, seed, return_model=True)
            models_for_shap[XGB_ON[variant]] = (mdl, Xf[te], base.shape[1], 2)  # 2 qubits per pair
        t0 = time.time()
        states = circuit_states(trained["vqc"], Xq[:, 0, :])
        preds["M11_qsvc"] = QSVC(max_train=3000, seed=seed).fit(states[tr], y[tr]).predict_proba(states[te])
        extras["time"]["qsvc"] = time.time() - t0

    if explain:
        import shap

        rankings = {"score_test": s["order"]}
        for name, (mdl, Xte, start, per_pair) in models_for_shap.items():
            sv = shap.TreeExplainer(mdl).shap_values(Xte)
            imp = _pair_importance(np.asarray(sv), start, len(pairs), per_pair)
            rankings[name] = _ranking_from_importance(s["chosen"]["qubo"], imp, s["order"])
        extras["rankings"] = rankings
        extras["pairs"] = pairs
    return FoldResult(preds=preds, search=s, extras=extras)


def run_once(cohort: Cohort, pheno: Phenotype, cfg: Config, seed: int, quantum: bool = True,
             boost_bin: str | None = None) -> dict:
    """Full CV + test evaluation. Returns metrics, rankings and test predictions."""
    t_start = time.time()
    y = pheno.y.astype(int)
    idx = np.arange(cohort.n)
    dev, test = train_test_split(idx, test_size=cfg["cv"]["test_frac"], stratify=y, random_state=seed)
    A = additive_features(cohort, pheno)
    cand = cross_mechanism_pairs(cohort.snps)
    skf = StratifiedKFold(cfg["cv"]["folds"], shuffle=True, random_state=seed)

    oof: dict[str, np.ndarray] = {}
    fold_search = []
    for f, (a, b) in enumerate(skf.split(dev, y[dev])):
        res = fit_fold(cohort, pheno, A, cand, dev[a], dev[b], cfg, seed + f, quantum=quantum)
        for name, p in res.preds.items():
            oof.setdefault(name, np.full(len(dev), np.nan))[b] = p
        fold_search.append({k: res.search["stats"][k] for k in res.search["stats"]})
        log.info("fold %d done (%.0fs elapsed)", f, time.time() - t_start)

    final = fit_fold(cohort, pheno, A, cand, dev, test, cfg, seed + 100, quantum=quantum, explain=True)
    test_preds = dict(final.preds)

    stack_inputs = ["M3_additive", "M10_xgb_vqc", "M11_qsvc"] if quantum else ["M3_additive", "M7_xgb_pairs"]
    S_oof = np.column_stack([zoo.logit(oof[n]) for n in stack_inputs])
    S_test = np.column_stack([zoo.logit(test_preds[n]) for n in stack_inputs])
    stacker = LogisticRegression(max_iter=1000)
    oof["M12_stack"] = cross_val_predict(stacker, S_oof, y[dev], cv=5, method="predict_proba")[:, 1]
    test_preds["M12_stack"] = stacker.fit(S_oof, y[dev]).predict_proba(S_test)[:, 1]

    y_te, bmi_te = y[test], pheno.bmi[test]
    results = {}
    for name in test_preds:
        thr = metrics.best_f1_threshold(y[dev], oof[name])
        prob = name not in ("M0_idrs", "M1_bmi", "M5_svm")
        results[name] = metrics.summary(y_te, test_preds[name], thr, prob=prob)
        results[name]["oof_auc"] = metrics.auc(y[dev], oof[name])
        results[name] |= metrics.screen_capture(y_te, bmi_te, test_preds[name], cfg["eval"]["screen_budget"],
                                                cfg["eval"]["lean_bmi"])

    planted = pheno.planted
    edr = {}
    rankings = final.extras["rankings"]
    if boost_bin:
        t0 = time.time()
        rankings["boost"] = __import__("qgenomix.search.boost", fromlist=["boost_ranking"]).boost_ranking(
            cohort.G[dev], y[dev], cohort.snps, cand, boost_bin)["order"]
        final.extras["time"]["boost"] = time.time() - t0
    for name, order in rankings.items():
        ranked = cand[order]
        edr[name] = {f"edr@{k}": metrics.edr_at_k(ranked, planted, k) for k in (10, 25, 48)}
    selection = {name: {"recall": metrics.recall_of_set(cand[ch], planted),
                        "shadow_pairs": metrics.shadow_pairs(cand[ch], planted), **final.search["stats"][name]}
                 for name, ch in final.search["chosen"].items()}

    return {
        "metrics": results,
        "edr": edr,
        "selection": selection,
        "fold_selection": fold_search,
        "qubo_info": final.search["qubo_info"],
        "time": final.extras["time"] | {"total": time.time() - t_start},
        "losses": {k: v for k, v in final.extras.items() if k.startswith("loss_")},
        "params": {k: v for k, v in final.extras.items() if k.startswith("params_")},
        "selected_pairs": final.extras["pairs"].tolist(),
        "planted": planted,
        "components": pheno.components,
        "test": {"y": y_te, "bmi": bmi_te, "idx": test, "preds": test_preds},
    }


def mechanism_interaction_test(cohort: Cohort, pheno: Phenotype, focus: tuple[str, str]) -> float:
    """Score-test p-value for the mechanism-level product z(S_a) * z(S_b) over the additive null."""
    X = (zscore(pheno.scores[focus[0]]) * zscore(pheno.scores[focus[1]]))[:, None]
    Z = null_design(cohort.G, search_covariates(cohort, pheno))
    _, p = score_test(X, pheno.y.astype(int), Z)
    return float(p[0])


def search_only(cohort: Cohort, pheno: Phenotype, cfg: Config, seed: int, boost_bin: str | None = None) -> dict:
    """Cheap run for the parameter sweeps (E2, E3, E4, E6): search on the dev split only, no predictive models."""
    y = pheno.y.astype(int)
    dev, _ = train_test_split(np.arange(cohort.n), test_size=cfg["cv"]["test_frac"], stratify=y, random_state=seed)
    cand = cross_mechanism_pairs(cohort.snps)
    covars = search_covariates(cohort, pheno)
    s = search(cohort.G[dev], y[dev], covars[dev], cand, cfg["search"], seed)
    rankings = {"score_test": s["order"]}
    if boost_bin:
        from qgenomix.search.boost import boost_ranking

        rankings["boost"] = boost_ranking(cohort.G[dev], y[dev], cohort.snps, cand, boost_bin)["order"]
    planted = pheno.planted
    out = {
        "edr": {n: {f"edr@{k}": metrics.edr_at_k(cand[o], planted, k) for k in (10, 25, 48)}
                for n, o in rankings.items()},
        "selection": {n: {"recall": metrics.recall_of_set(cand[ch], planted),
                          "shadow_pairs": metrics.shadow_pairs(cand[ch], planted), **s["stats"][n]}
                      for n, ch in s["chosen"].items()},
        "n_false_top10_p05": int((s["pvals"][s["order"][:10]] < 0.05).sum()),
        "min_p": float(s["pvals"].min()),
        "n_sig_bonferroni": int((s["pvals"] < 0.05 / len(cand)).sum()),
        "n_candidates": len(cand),
        "mech_interaction_p": mechanism_interaction_test(cohort.subset(dev), _sub_pheno(pheno, dev),
                                                         tuple(cfg["focus_pair"])),
        "time_score": s["time_score"],
        "time_qubo": s["time_qubo"],
    }
    if planted:
        truth = {frozenset(p) for p in planted}
        is_true = np.array([frozenset(map(int, c)) in truth for c in cand])
        out["n_sig_bonferroni_false"] = int(((s["pvals"] < 0.05 / len(cand)) & ~is_true).sum())
    else:
        out["n_sig_bonferroni_false"] = out["n_sig_bonferroni"]
    return out


def _sub_pheno(pheno: Phenotype, idx: np.ndarray) -> Phenotype:
    return Phenotype(y=pheno.y[idx], bmi=pheno.bmi[idx], liability=pheno.liability[idx],
                     scores={k: v[idx] for k, v in pheno.scores.items()}, planted=pheno.planted,
                     clinical={k: v[idx] for k, v in pheno.clinical.items()}, components=pheno.components)
