"""Candidate SNP pairs and their interaction features."""

from __future__ import annotations

import numpy as np
import pandas as pd


def cross_mechanism_pairs(snps: pd.DataFrame) -> np.ndarray:
    """All SNP pairs whose two SNPs belong to different mechanism clusters. Shape (P, 2), i < j."""
    cl = snps["cluster"].to_numpy()
    m = len(cl)
    i, j = np.triu_indices(m, k=1)
    keep = cl[i] != cl[j]
    return np.column_stack([i[keep], j[keep]])


def pair_features(G: np.ndarray, pairs: np.ndarray, center: np.ndarray | None = None) -> np.ndarray:
    """Centred product features (g_i - mean_i)(g_j - mean_j). Pass training means as `center` to avoid leakage."""
    mu = G.mean(0) if center is None else center
    Gc = G - mu
    return (Gc[:, pairs[:, 0]] * Gc[:, pairs[:, 1]]).astype(np.float64)


def pair_labels(snps: pd.DataFrame, pairs: np.ndarray) -> list[str]:
    rs = snps["rsid"].fillna(snps["id"]).to_numpy()
    return [f"{rs[i]}x{rs[j]}" for i, j in pairs]
