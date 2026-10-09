"""Build and load the deployable model bundle used by the API and the dashboard.

The bundle is trained once on a large synthetic South Asian cohort (simulated outcomes), so every number
the app shows is a research demonstration, not a clinical estimate.

Feature layout (must match training): [5 PRS components | age, male, BMI, waist, activity, family |
5 standardised mechanism scores | 62 SNP dosages | 96 VQC features].
"""

from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import torch
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split

from qgenomix.config import Config
from qgenomix.data.cohort import CLUSTERS, synthetic_sas
from qgenomix.eval.metrics import auc
from qgenomix.models import zoo
from qgenomix.pipeline.run import search, search_covariates
from qgenomix.quantum.encoder import encode, pack_pairs, train_encoder
from qgenomix.search.candidates import cross_mechanism_pairs
from qgenomix.sim.simulator import simulate
from qgenomix.utils import log, save_json, seed_everything


def raw_cluster_scores(G: np.ndarray, snps: pd.DataFrame) -> dict[str, np.ndarray]:
    w = snps["weight"].to_numpy(float)
    cl = snps["cluster"].to_numpy()
    return {c: G[:, cl == c] @ w[cl == c] for c in CLUSTERS if (cl == c).any()}


def design(b: dict, prs: np.ndarray, clinical: np.ndarray, G: np.ndarray) -> np.ndarray:
    """Additive block A used by the encoder head and the first columns of the XGBoost input."""
    raw = raw_cluster_scores(G, b["snps"])
    z = [(raw[c] - b["score_mu"][c]) / b["score_sd"][c] for c in raw]
    return np.column_stack([prs, clinical, *z])


def predict(b: dict, prs: np.ndarray, clinical: np.ndarray, G: np.ndarray) -> np.ndarray:
    """Calibrated risk for people given their PRS components (n, 5), clinical matrix (n, 6), SNP dosages."""
    A = design(b, prs, clinical, G)
    with torch.no_grad():
        F = b["encoder"].features(torch.tensor(pack_pairs(G.astype(np.float32), b["pairs"]))).numpy()
    X = np.column_stack([A, G, F])
    return calibrate(b, b["xgb"].predict_proba(X)[:, 1]), X


def calibrate(b: dict, p_raw: np.ndarray) -> np.ndarray:
    """Platt scaling: a logistic curve on the XGBoost log-odds. Smooth, so what-if changes move risk gradually
    (isotonic calibration is a step function and gives plateaus and 0% risks)."""
    return b["calibrator"].predict_proba(zoo.logit(p_raw)[:, None])[:, 1]


def build_bundle(cfg: Config, n: int = 20000) -> dict:
    rng = seed_everything(cfg["seed"] + 77)
    cohort = synthetic_sas(cfg, n, rng)
    ph = simulate(cohort, dict(cfg["simulator"]), tuple(cfg["focus_pair"]), rng)
    y = ph.y.astype(int)
    tr, cal = train_test_split(np.arange(n), test_size=0.2, stratify=y, random_state=cfg["seed"])

    cand = cross_mechanism_pairs(cohort.snps)
    s = search(cohort.G[tr], y[tr], search_covariates(cohort, ph)[tr], cand, cfg["search"], cfg["seed"])
    pairs = cand[s["chosen"]["qubo"]]

    raw = raw_cluster_scores(cohort.G, cohort.snps)
    b = {"snps": cohort.snps, "pairs": pairs,
         "score_mu": {c: float(v[tr].mean()) for c, v in raw.items()},
         "score_sd": {c: float(v[tr].std()) for c, v in raw.items()}}
    C = ph.clinical_matrix()
    A = design(b, cohort.prs, C, cohort.G)
    a_mu, a_sd = A[tr].mean(0), A[tr].std(0)
    q = cfg["quantum"]
    Xq = pack_pairs(cohort.G, pairs)
    enc, tlog = train_encoder("vqc", Xq[tr], (A[tr] - a_mu) / a_sd, y[tr], layers=q["layers"], epochs=q["epochs"],
                              lr=q["lr"], batch=q["batch"], seed=cfg["seed"])
    F = encode(enc, Xq)
    X = np.column_stack([A, cohort.G, F])
    p_cal, xgb = zoo.fit_xgb(X[tr], y[tr], X[cal], cfg["models"]["xgb"], cfg["seed"], return_model=True)
    calibrator = LogisticRegression(C=1e6, max_iter=1000).fit(zoo.logit(p_cal)[:, None], y[cal])
    b |= {
        "pair_rank_relevance": s["pvals"][s["chosen"]["qubo"]],
        "score_ref": {c: np.sort(v) for c, v in raw.items()},
        "a_mu": a_mu, "a_sd": a_sd,
        "encoder_state": enc.state_dict(), "encoder_shape": (enc.n_circuits, A.shape[1], q["layers"]),
        "xgb": xgb, "calibrator": calibrator,
        "risk_ref": np.sort(calibrator.predict_proba(zoo.logit(xgb.predict_proba(X)[:, 1])[:, None])[:, 1]),
        "prs_ref": np.sort(cohort.prs[:, -1]),
        "lean_bmi": cfg["eval"]["lean_bmi"],
        "features": ["prs_AFR", "prs_AMR", "prs_EAS", "prs_EUR", "prs_SAS", "age", "male", "bmi", "waist", "activity",
                     "family", *[f"score_{c}" for c in raw]],
        "metrics": {"cal_auc": auc(y[cal], p_cal), "n_train": len(tr), "n_cal": len(cal),
                    "cal_brier": float(np.mean((calibrator.predict_proba(zoo.logit(p_cal)[:, None])[:, 1]
                                                - y[cal]) ** 2)),
                    "prevalence": float(y.mean()), "encoder_loss": tlog.losses},
        "config_hash": cfg.hash(),
    }
    out = cfg.path("bundle")
    out.mkdir(parents=True, exist_ok=True)
    joblib.dump(b, out / "model.joblib")
    _write_prs_reference(cfg, out)
    save_json(dict(b["metrics"]) | {"config_hash": b["config_hash"], "n_pairs": len(pairs)}, out / "meta.json")
    log.info("bundle saved: calibration AUC %.3f", b["metrics"]["cal_auc"])
    return b


def _write_prs_reference(cfg: Config, out: Path) -> None:
    """D-PRISM weights with positions and South Asian ALT frequencies (for imputing missing genotypes)."""
    proc = cfg.path("processed")
    w = pd.read_csv(proc / "dprism_alt.tsv", sep="\t")
    pos = w["id"].str.split(":", expand=True)
    w["chr"], w["pos"], w["ref"] = pos[0], pos[1].astype(int), pos[2]
    freq = pd.read_csv(proc / "sas_freq.afreq", sep="\t", usecols=["ID", "ALT_FREQS"])
    w = w.merge(freq.rename(columns={"ID": "id", "ALT_FREQS": "alt_freq"}), on="id", how="left")
    w["alt_freq"] = w["alt_freq"].fillna(0.0)
    w.to_parquet(out / "prs_weights.parquet", index=False)
    mech = pd.read_csv(proc / "mech_snps.tsv", sep="\t", dtype={"chr": str})
    mech.to_csv(out / "mech_snps.tsv", sep="\t", index=False)


def load_bundle(path: str | Path) -> dict:
    path = Path(path)
    b = joblib.load(path / "model.joblib")
    from qgenomix.quantum.encoder import PairEncoder

    n_circ, n_cov, layers = b["encoder_shape"]
    enc = PairEncoder("vqc", n_circ, n_cov, layers)
    enc.load_state_dict(b["encoder_state"])
    enc.eval()
    b["encoder"] = enc
    b["prs_weights"] = pd.read_parquet(path / "prs_weights.parquet")
    torch.set_num_threads(4)
    return b
