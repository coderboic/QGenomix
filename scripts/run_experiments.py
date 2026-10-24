"""Run the experiments that produce every figure and table in the report.

    python scripts/run_experiments.py E0 E1 E2 E3 E4 E7 E7b E9 E10 E11 E12 E13
        (any subset; E7b needs E7, E10 and E13 need the bundle)
    python scripts/run_experiments.py E1 --seeds 0 --n 10000
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from qgenomix.config import load_config  # noqa: E402
from qgenomix.pipeline import experiments as ex  # noqa: E402
from qgenomix.utils import log, setup_logging  # noqa: E402

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("which", nargs="+",
                    choices=["E0", "E1", "E2", "E3", "E4", "E7", "E7b", "E9", "E10", "E11", "E12", "E13"])
    ap.add_argument("--config", default="configs/main.yaml")
    ap.add_argument("--seeds", type=int, nargs="*", default=[0, 1, 2])
    ap.add_argument("--n", type=int, default=None)
    args = ap.parse_args()
    setup_logging()
    cfg = load_config(args.config)
    for name in args.which:
        t0 = time.time()
        if name == "E0":
            ex.e0_data_checks(cfg)
        elif name == "E1":
            ex.e1_benchmark(cfg, seeds=tuple(args.seeds), n=args.n)
        elif name == "E2":
            ex.e2_power(cfg)
        elif name == "E3":
            ex.e3_sample_size(cfg)
        elif name == "E4":
            ex.e4_null(cfg)
        elif name == "E7":
            ex.e7_qaoa(cfg)
        elif name == "E9":
            ex.e9_real_genomes(cfg)
        elif name == "E10":
            ex.e10_lifestyle(cfg)
        elif name == "E7b":
            ex.e7b_mitigation(cfg)
        elif name == "E11":
            ex.e11_fairness(cfg)
        elif name == "E12":
            ex.e12_robustness(cfg)
        elif name == "E13":
            ex.e13_imputation(cfg)
        log.info("%s finished in %.1f min", name, (time.time() - t0) / 60)
