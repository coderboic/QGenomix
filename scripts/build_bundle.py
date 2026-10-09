"""Train the deployable model bundle and a 200-person clinician cohort view.

    python scripts/build_bundle.py [--n 20000]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from qgenomix.app.bundle import build_bundle, load_bundle, predict, raw_cluster_scores  # noqa: E402
from qgenomix.clinical import idrs_category  # noqa: E402
from qgenomix.config import load_config  # noqa: E402
from qgenomix.data.cohort import synthetic_sas  # noqa: E402
from qgenomix.sim.simulator import simulate  # noqa: E402
from qgenomix.utils import setup_logging  # noqa: E402


def cohort_view(cfg, n: int = 200) -> pd.DataFrame:
    b = load_bundle(cfg.path("bundle"))
    rng = np.random.default_rng(cfg["seed"] + 404)
    c = synthetic_sas(cfg, n, rng)
    ph = simulate(c, dict(cfg["simulator"]), tuple(cfg["focus_pair"]), rng)
    risk, _ = predict(b, c.prs, ph.clinical_matrix(), c.G)
    pct = 100 * np.searchsorted(b["risk_ref"], risk) / len(b["risk_ref"])
    raw = raw_cluster_scores(c.G, c.snps)
    pc = {k: 100 * np.searchsorted(b["score_ref"][k], raw[k]) / len(b["score_ref"][k]) for k in raw}
    cl = ph.clinical
    df = pd.DataFrame({
        "person": [f"SYN-{i:04d}" for i in range(n)],
        "age": cl["age"].astype(int),
        "sex": np.where(cl["male"] == 1, "M", "F"),
        "bmi": ph.bmi.round(1),
        "waist_cm": cl["waist"],
        "lean": ph.bmi < cfg["eval"]["lean_bmi"],
        "idrs": cl["idrs"].astype(int),
        "idrs_category": [idrs_category(s) for s in cl["idrs"]],
        "risk_percentile": pct.round(0),
        "risk_tier": np.where(pct >= 80, "high", np.where(pct >= 50, "moderate", "low")),
        "beta_cell_pct": pc["beta_cell"].round(0),
        "lipodystrophy_pct": pc["lipodystrophy"].round(0),
        "combination_flag": (pc["beta_cell"] >= 80) & (pc["lipodystrophy"] >= 80),
        "simulated_outcome": ph.y.astype(bool),
    }).sort_values("risk_percentile", ascending=False)
    df.to_csv(cfg.path("bundle") / "cohort_view.csv", index=False)
    return df


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=20000)
    args = ap.parse_args()
    setup_logging()
    cfg = load_config()
    build_bundle(cfg, n=args.n)
    cohort_view(cfg)
