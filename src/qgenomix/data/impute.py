"""LD-aware imputation of genotypes missing from consumer DNA files (23andMe, AncestryDNA).

Consumer chips measure about 600k SNPs, so a typical file contains only around half of the 1.3M D-PRISM
variants. Filling a missing variant with the population mean pulls every score towards average. Instead, each
missing variant is predicted from the best-correlated variant the file does contain (its "tag"), using the
linkage disequilibrium (LD) measured in the 489 South Asian genomes of 1000 Genomes:

    d_v  ~  mean_v + slope_vt * (d_t - mean_t),        slope_vt = cov(v, t) / var(t)

This is the single-tag linear predictor used by early imputation methods; it needs no external software and runs
in about a second for a whole genome.

    build_panel()   for every panel variant, its K best tags within +-window variants and +-max_kb
    impute()        apply the panel to one person's dosages and missing mask
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

# PLINK .bed 2-bit codes, A1 (= ALT in PLINK 2 output) counted: 00 hom A1, 01 missing, 10 het, 11 hom A2
_LUT = np.array([[(2.0, np.nan, 1.0, 0.0)[(b >> (2 * i)) & 3] for i in range(4)] for b in range(256)],
                dtype=np.float32)


def read_bim(prefix: str | Path) -> pd.DataFrame:
    bim = pd.read_csv(f"{prefix}.bim", sep="\t", header=None, dtype={0: str, 1: str, 4: str, 5: str},
                      names=["chr", "id", "cm", "pos", "alt", "ref"])
    return bim[["chr", "id", "pos", "ref", "alt"]]


def read_bed(prefix: str | Path, n_samples: int, rows: slice | None = None) -> np.ndarray:
    """ALT dosages (n_samples, variants in `rows`) from a variant-major PLINK .bed; missing calls are NaN."""
    raw = np.fromfile(f"{prefix}.bed", dtype=np.uint8)
    assert raw[0] == 0x6C and raw[1] == 0x1B and raw[2] == 1, "not a variant-major PLINK .bed file"
    bpv = (n_samples + 3) // 4
    body = raw[3:].reshape(-1, bpv)
    if rows is not None:
        body = body[rows]
    return _LUT[body].reshape(body.shape[0], -1)[:, :n_samples].T


@dataclass
class Panel:
    mean: np.ndarray      # (m,) ALT dosage mean in the reference samples
    partner: np.ndarray   # (m, K) global index of the K best tags, best first
    r2: np.ndarray        # (m, K) squared correlation with each tag
    slope: np.ndarray     # (m, K) regression slope of the variant on each tag

    def save(self, path: str | Path, **extra: np.ndarray) -> None:
        np.savez_compressed(path, mean=self.mean, partner=self.partner, r2=self.r2.astype(np.float16),
                            slope=self.slope.astype(np.float16), **extra)

    @classmethod
    def load(cls, path: str | Path) -> tuple[Panel, dict]:
        d = np.load(path, allow_pickle=False)
        extra = {k: d[k] for k in d.files if k not in ("mean", "partner", "r2", "slope")}
        return cls(d["mean"], d["partner"], d["r2"].astype(np.float32), d["slope"].astype(np.float32)), extra


def ld_tags(X: np.ndarray, pos: np.ndarray, k: int = 6, window: int = 300, max_kb: int = 500,
            chunk: int = 2048) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """K best LD tags for every column of X (people x variants on one chromosome, sorted by position).

    Returns local tag indices, r^2, slopes and column means. Monomorphic variants get r^2 = 0.
    """
    X = X.astype(np.float32, copy=True)
    mean = np.nanmean(X, axis=0)
    X = np.where(np.isnan(X), mean, X)
    n, m = X.shape
    sd = X.std(axis=0)
    Z = np.where(sd > 0, (X - mean) / np.where(sd > 0, sd, 1), 0).astype(np.float32)
    k = min(k, max(m - 1, 1))
    idx = np.zeros((m, k), np.int32)
    r2 = np.zeros((m, k), np.float32)
    slope = np.zeros((m, k), np.float32)
    max_bp = max_kb * 1000
    for s in range(0, m, chunk):
        e = min(s + chunk, m)
        lo, hi = max(0, s - window), min(m, e + window)
        C = Z[:, s:e].T @ Z[:, lo:hi] / n                       # correlations, (e - s, hi - lo)
        rows = np.arange(e - s)
        C[rows, rows + s - lo] = 0.0                            # not your own tag
        far = np.abs(pos[s:e, None] - pos[None, lo:hi]) > max_bp
        C[far] = 0.0
        R2 = C * C
        top = np.argpartition(-R2, k - 1, axis=1)[:, :k] if R2.shape[1] > k else \
            np.tile(np.arange(R2.shape[1]), (e - s, 1))[:, :k]
        order = np.argsort(-np.take_along_axis(R2, top, 1), axis=1)
        top = np.take_along_axis(top, order, 1)
        idx[s:e] = lo + top
        r2[s:e] = np.take_along_axis(R2, top, 1)
        c = np.take_along_axis(C, top, 1)
        sd_t = sd[lo + top]
        slope[s:e] = np.where(sd_t > 0, c * sd[s:e, None] / np.where(sd_t > 0, sd_t, 1), 0)
    return idx, r2, slope, mean


def build_panel(bed_prefix: str | Path, keep: np.ndarray | None = None, k: int = 6, window: int = 300,
                max_kb: int = 500) -> tuple[Panel, pd.DataFrame]:
    """LD tag panel for every variant of a PLINK .bed, using the samples in `keep` (default: all)."""
    bim = read_bim(bed_prefix)
    n = sum(1 for _ in open(f"{bed_prefix}.fam"))
    keep = np.arange(n) if keep is None else np.asarray(keep)
    m = len(bim)
    mean = np.zeros(m, np.float32)
    partner = np.zeros((m, k), np.int32)
    r2 = np.zeros((m, k), np.float32)
    slope = np.zeros((m, k), np.float32)
    chrom = bim["chr"].to_numpy()
    for c in pd.unique(chrom):
        sel = np.flatnonzero(chrom == c)
        a, b = sel[0], sel[-1] + 1
        assert (sel == np.arange(a, b)).all(), "bim must be grouped by chromosome"
        X = read_bed(bed_prefix, n, slice(a, b))[keep]
        i, q, s, mu = ld_tags(X, bim["pos"].to_numpy()[a:b], k=k, window=window, max_kb=max_kb)
        partner[a:b], r2[a:b], slope[a:b], mean[a:b] = a + i, q, s, mu
    return Panel(mean, partner, r2, slope), bim


@dataclass
class Plan:
    """Which tag fills each variant, for one pattern of observed variants (one chip layout)."""
    observed: np.ndarray
    tag: np.ndarray       # (m,) index of the tag used (undefined where has is False)
    slope: np.ndarray     # (m,)
    has: np.ndarray       # (m,) a usable tag was observed
    quality: np.ndarray   # (m,) 1 if observed, r^2 of the tag if imputed, 0 if mean-filled


def plan(observed: np.ndarray, panel: Panel, r2_min: float = 0.1) -> Plan:
    ok = observed[panel.partner] & (panel.r2 >= r2_min)
    has = ok.any(axis=1) & ~observed
    first = ok.argmax(axis=1)
    rows = np.arange(len(observed))
    quality = np.where(observed, 1.0, np.where(has, panel.r2[rows, first], 0.0)).astype(np.float32)
    return Plan(observed, panel.partner[rows, first], panel.slope[rows, first], has, quality)


def apply(D: np.ndarray, p: Plan, panel: Panel) -> np.ndarray:
    """Complete dosages D (variants on the last axis; one person or a batch) that share the plan's chip layout."""
    pred = np.clip(panel.mean + p.slope * (D[..., p.tag] - panel.mean[p.tag]), 0.0, 2.0)
    filled = np.where(p.has, pred, panel.mean)
    return np.where(p.observed, D, filled).astype(np.float32)


def impute(d: np.ndarray, observed: np.ndarray, panel: Panel, r2_min: float = 0.1) -> tuple[np.ndarray, np.ndarray]:
    """Fill missing dosages from each variant's best observed tag (r^2 >= r2_min), else the reference mean.

    Returns the completed dosages and the r^2 of the tag used for each variant (1 if observed, 0 if mean-filled).
    """
    p = plan(observed, panel, r2_min)
    return apply(d, p, panel), p.quality
