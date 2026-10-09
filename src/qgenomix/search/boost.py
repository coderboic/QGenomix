"""Classical epistasis baseline: PLINK 1.9 --fast-epistasis boost (Wan et al. 2010)."""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd


def boost_ranking(G: np.ndarray, y: np.ndarray, snps: pd.DataFrame, cand: np.ndarray, plink_bin: str | Path) -> dict:
    """Rank candidate pairs by PLINK BOOST p-value. Pairs PLINK does not report go to the end in input order."""
    m = G.shape[1]
    names = [f"s{j}" for j in range(m)]
    chrom = snps["chr"].astype(str).to_numpy() if "chr" in snps else np.array(["1"] * m)
    pos = snps["pos"].to_numpy() if "pos" in snps else np.arange(1, m + 1) * 1000
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        pd.DataFrame({"chr": chrom, "id": names, "cm": 0, "bp": pos}).to_csv(tmp / "d.map", sep="\t", header=False,
                                                                            index=False)
        geno = np.asarray(np.rint(G), dtype=int)
        a1 = np.where(geno >= 1, "A", "C")
        a2 = np.where(geno == 2, "A", "C")
        alleles = np.empty((G.shape[0], 2 * m), dtype="<U1")
        alleles[:, 0::2], alleles[:, 1::2] = a1, a2
        lines = [f"f{i} i{i} 0 0 0 {int(y[i]) + 1} " + " ".join(row) for i, row in enumerate(alleles)]
        (tmp / "d.ped").write_text("\n".join(lines) + "\n")
        proc = subprocess.run([str(plink_bin), "--file", str(tmp / "d"), "--fast-epistasis", "boost", "--epi1", "1",
                               "--allow-no-sex", "--out", str(tmp / "o")], capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(proc.stdout[-2000:])
        res = pd.read_csv(tmp / "o.epi.cc", sep=r"\s+")
    idx = {n: j for j, n in enumerate(names)}
    pval = {}
    for s1, s2, p in zip(res["SNP1"], res["SNP2"], res["P"], strict=True):
        i, j = sorted((idx[s1], idx[s2]))
        pval[(i, j)] = float(p)
    p_cand = np.array([pval.get((int(i), int(j)), 1.0) for i, j in cand])
    order = np.argsort(p_cand, kind="stable")
    return {"order": order, "pvals": p_cand}
