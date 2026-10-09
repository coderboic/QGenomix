"""Synthetic demo personas: whole genotype files for people who do not exist.

Each persona is a haplotype mosaic (see data/cohort.py) chosen to fit a profile, then written out as a
23andMe-style file covering the ~1.4M variants the model uses. No real person's genome is shown in the demo.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from qgenomix.app.parser import to_23andme
from qgenomix.config import Config
from qgenomix.data import plink
from qgenomix.data.prepare import _read_haps
from qgenomix.utils import log

PERSONAS = {
    "asha_lean_high": {"title": "Lean, high genetic risk", "age": 34, "sex": "F", "bmi": 21.6, "waist_cm": 84,
                       "activity": 2, "family_history": 1,
                        "want": {"beta_cell": (85, 100), "lipodystrophy": (85, 100), "obesity": (0, 60),
                                 "prs": (70, 100)}},
    "ravi_obese_high": {"title": "Overweight, high obesity-driven risk", "age": 45, "sex": "M", "bmi": 29.8,
                        "waist_cm": 102, "activity": 3, "family_history": 2,
                        "want": {"beta_cell": (0, 60), "lipodystrophy": (0, 60), "obesity": (85, 100),
                                 "prs": (75, 100)}},
    "meera_low": {"title": "Low genetic risk", "age": 29, "sex": "F", "bmi": 22.4, "waist_cm": 74,
                  "activity": 1, "family_history": 0,
                  "want": {"beta_cell": (0, 35), "lipodystrophy": (0, 35), "obesity": (0, 50), "prs": (0, 30)}},
}


def make_personas(cfg: Config, n_pool: int = 20000, seed: int = 11) -> dict:
    proc = cfg.path("processed")
    lib = np.load(proc / "sas_mosaic.npz", allow_pickle=False)
    S, mech_hap, mech_block, keys = lib["S"], lib["mech_hap"], lib["mech_block"], lib["block_keys"]
    snps = pd.read_csv(proc / "mech_snps.tsv", sep="\t", dtype={"chr": str})
    rng = np.random.default_rng(seed)
    n_blocks, n_hap, _ = S.shape
    A = rng.integers(0, n_hap, (n_pool, n_blocks))
    B = rng.integers(0, n_hap, (n_pool, n_blocks))
    rows = np.arange(n_blocks)[None, :]
    prs = np.vstack([S[rows, A[i:i + 2000]].sum(1) + S[rows, B[i:i + 2000]].sum(1) for i in range(0, n_pool, 2000)])
    j = np.arange(len(mech_block))
    G = mech_hap[A[:, mech_block], j] + mech_hap[B[:, mech_block], j]
    w, cl = snps["weight"].to_numpy(float), snps["cluster"].to_numpy()
    pct = {c: 100 * pd.Series(G[:, cl == c] @ w[cl == c]).rank(pct=True).to_numpy() for c in np.unique(cl)}
    pct["prs"] = 100 * pd.Series(prs[:, -1]).rank(pct=True).to_numpy()

    chosen = {}
    for name, spec in PERSONAS.items():
        ok = np.ones(n_pool, bool)
        for key, (lo, hi) in spec["want"].items():
            ok &= (pct[key] >= lo) & (pct[key] <= hi)
        if not ok.any():
            raise RuntimeError(f"no mosaic matched persona {name}; enlarge n_pool")
        chosen[name] = int(np.flatnonzero(ok)[0])
        log.info("persona %s -> pool index %d", name, chosen[name])

    out = cfg.path("processed").parent / "personas"
    out.mkdir(parents=True, exist_ok=True)
    pieces = {name: [] for name in PERSONAS}
    block_index = {k: i for i, k in enumerate(keys)}
    block_bp = int(cfg["data"]["block_mb"] * 1_000_000)
    rs_by_id = dict(zip(snps["id"], snps["rsid"].fillna(snps["id"]), strict=True))
    for c in range(1, 23):
        prefix = proc / f"persona_haps_chr{c}"
        plink.run(cfg.path("plink2"), "--pfile", proc / "kg", "--keep", proc / "sas.ids", "--chr", c,
                  "--extract", proc / "hap.ids", "--export", "haps", "--out", prefix)
        meta, hap = _read_haps(prefix)
        blk = np.array([block_index[f"{c}:{p // block_bp}"] for p in meta["pos"].astype(int)])
        a0, a1 = meta["a0"].to_numpy(), meta["a1"].to_numpy()
        for name, i in chosen.items():
            h1 = hap[np.arange(len(blk)), A[i, blk]]
            h2 = hap[np.arange(len(blk)), B[i, blk]]
            pieces[name].append(pd.DataFrame({
                "rsid": [rs_by_id.get(v, f"i{v.replace(':', '_')}") for v in meta["id"]],
                "chr": meta["chr"].to_numpy(), "pos": meta["pos"].astype(int).to_numpy(),
                "a1": np.where(h1 == 1, a1, a0), "a2": np.where(h2 == 1, a1, a0)}))
        for ext in (".haps", ".sample", ".log"):
            Path(f"{prefix}{ext}").unlink(missing_ok=True)

    index = {}
    for name, spec in PERSONAS.items():
        (out / f"{name}.txt").write_text(to_23andme(pd.concat(pieces[name], ignore_index=True)))
        index[name] = {k: v for k, v in spec.items() if k != "want"} | {
            "file": f"{name}.txt", "percentiles": {k: float(v[chosen[name]]) for k, v in pct.items()}}
    (out / "personas.json").write_text(json.dumps(index, indent=2))
    return index
