"""Stage S1: build processed arrays from 1000 Genomes + PGS Catalog files.

    python scripts/prepare_data.py [--config configs/main.yaml] [--mosaic-only]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from qgenomix.config import load_config  # noqa: E402
from qgenomix.data import plink  # noqa: E402
from qgenomix.data.prepare import build_sas_mosaic, prepare_1000g  # noqa: E402
from qgenomix.utils import setup_logging  # noqa: E402

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="configs/main.yaml")
    ap.add_argument("--threads", type=int, default=12)
    ap.add_argument("--mosaic-only", action="store_true", help="rebuild only the SAS haplotype library")
    args = ap.parse_args()
    setup_logging()
    cfg = load_config(args.config)
    if args.mosaic_only:
        import pandas as pd

        out = cfg.path("processed")
        pvar = plink.read_pvar(out / "kg")
        w = pd.read_csv(out / "dprism_alt.tsv", sep="\t")
        mech = pd.read_csv(out / "mech_snps.tsv", sep="\t", dtype={"chr": str})
        build_sas_mosaic(cfg, pvar, w, mech, threads=args.threads)
    else:
        prepare_1000g(cfg, threads=args.threads)
