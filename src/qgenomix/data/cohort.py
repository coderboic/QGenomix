"""Cohorts that the simulator and models consume.

`Cohort` is the single data container used everywhere:
  G      (n, m) effect-allele dosages (0, 1, 2) of the mechanism SNPs
  prs    (n, 5) D-PRISM background PRS components (one per GWAS ancestry weight file)
  snps   DataFrame describing the m mechanism SNPs (id, rsid, cluster, weight, eaf_sas, ...)
  meta   per-person DataFrame (IID, SuperPop, ...) for real genomes; None for synthetic people

Three ways to get one:
  load_real()        the real 1000 Genomes genomes (2,504 people, 489 South Asian)
  synthetic_sas()    any number of synthetic South Asians built as haplotype mosaics
  toy_cohort()       independent SNPs from allele frequencies; for tests and CI without downloads
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from qgenomix.config import Config

CLUSTERS = ["beta_cell", "lipodystrophy", "liver_lipid", "obesity", "proinsulin"]


@dataclass
class Cohort:
    G: np.ndarray
    prs: np.ndarray
    snps: pd.DataFrame
    meta: pd.DataFrame | None = None
    source: str = "synthetic"

    @property
    def n(self) -> int:
        return self.G.shape[0]

    def subset(self, idx: np.ndarray) -> Cohort:
        meta = None if self.meta is None else self.meta.iloc[idx].reset_index(drop=True)
        return Cohort(self.G[idx], self.prs[idx], self.snps, meta, self.source)

    def cluster_index(self, cluster: str) -> np.ndarray:
        return np.flatnonzero(self.snps["cluster"].to_numpy() == cluster)


def load_snps(cfg: Config) -> pd.DataFrame:
    return pd.read_csv(cfg.path("processed") / "mech_snps.tsv", sep="\t", dtype={"chr": str})


def load_real(cfg: Config) -> Cohort:
    d = np.load(cfg.path("processed") / "real.npz", allow_pickle=False)
    meta = pd.read_csv(cfg.path("processed") / "samples.tsv", sep="\t")
    assert (meta["IID"].to_numpy() == d["iid"]).all()
    return Cohort(d["G"].astype(np.float32), d["prs"], load_snps(cfg), meta, source="1000G")


def synthetic_sas(cfg: Config, n: int, rng: np.random.Generator, chunk: int = 2000) -> Cohort:
    """Draw n synthetic South Asians as block-wise mosaics of real 1000G SAS haplotypes."""
    lib = np.load(cfg.path("processed") / "sas_mosaic.npz", allow_pickle=False)
    S, mech_hap, mech_block = lib["S"], lib["mech_hap"], lib["mech_block"]
    n_blocks, n_hap, n_comp = S.shape
    G = np.empty((n, mech_hap.shape[1]), dtype=np.float32)
    prs = np.empty((n, n_comp), dtype=np.float64)
    rows = np.arange(n_blocks)[None, :]
    for start in range(0, n, chunk):
        m = min(chunk, n - start)
        a = rng.integers(0, n_hap, (m, n_blocks))
        b = rng.integers(0, n_hap, (m, n_blocks))
        prs[start:start + m] = S[rows, a].sum(1) + S[rows, b].sum(1)
        G[start:start + m] = mech_hap[a[:, mech_block], np.arange(len(mech_block))] + \
            mech_hap[b[:, mech_block], np.arange(len(mech_block))]
    return Cohort(G, prs, load_snps(cfg), None, source="mosaic")


def toy_cohort(n: int, rng: np.random.Generator, m_per_cluster: dict[str, int] | None = None) -> Cohort:
    """Independent SNPs with random allele frequencies; Gaussian PRS components. No downloads needed."""
    m_per_cluster = m_per_cluster or {"beta_cell": 30, "lipodystrophy": 20, "liver_lipid": 5, "obesity": 5,
                                      "proinsulin": 7}
    rows = []
    for cl, k in m_per_cluster.items():
        for i in range(k):
            rows.append({"id": f"{cl}_{i}", "rsid": f"rs_{cl}_{i}", "cluster": cl,
                         "weight": float(rng.uniform(0.5, 3.0)), "eaf_sas": float(rng.uniform(0.08, 0.6))})
    snps = pd.DataFrame(rows)
    p = snps["eaf_sas"].to_numpy()
    G = rng.binomial(2, p, size=(n, len(p))).astype(np.float32)
    base = rng.normal(size=(n, 1))
    prs = 0.8 * base + 0.6 * rng.normal(size=(n, 5))  # five correlated components
    return Cohort(G, prs, snps, None, source="toy")
