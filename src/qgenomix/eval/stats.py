"""Significance tests: DeLong (paired AUCs), McNemar (paired classifications), Holm correction."""

from __future__ import annotations

import numpy as np
from scipy import stats


def _delong_components(preds: np.ndarray, m: int) -> tuple[np.ndarray, np.ndarray]:
    """Fast DeLong (Sun & Xu, IEEE Signal Processing Letters 2014). preds: (k, n), positives first."""
    n = preds.shape[1] - m
    pos, neg = preds[:, :m], preds[:, m:]
    tx = np.vstack([stats.rankdata(r) for r in pos])
    ty = np.vstack([stats.rankdata(r) for r in neg])
    tz = np.vstack([stats.rankdata(r) for r in preds])
    aucs = tz[:, :m].sum(1) / m / n - (m + 1.0) / 2.0 / n
    v01 = (tz[:, :m] - tx) / n
    v10 = 1.0 - (tz[:, m:] - ty) / m
    cov = np.atleast_2d(np.cov(v01)) / m + np.atleast_2d(np.cov(v10)) / n
    return aucs, cov


def delong_test(y: np.ndarray, p1: np.ndarray, p2: np.ndarray) -> dict[str, float]:
    """Two-sided test of AUC(p1) == AUC(p2) on the same people."""
    y = np.asarray(y).astype(int)
    order = np.argsort(-y, kind="stable")
    m = int(y.sum())
    aucs, cov = _delong_components(np.vstack([p1, p2])[:, order], m)
    diff = aucs[0] - aucs[1]
    var = cov[0, 0] + cov[1, 1] - 2 * cov[0, 1]
    z = diff / np.sqrt(var) if var > 0 else 0.0
    return {"auc1": float(aucs[0]), "auc2": float(aucs[1]), "diff": float(diff), "z": float(z),
            "p": float(2 * stats.norm.sf(abs(z)))}


def auc_ci(y: np.ndarray, p: np.ndarray, level: float = 0.95) -> tuple[float, float, float]:
    y = np.asarray(y).astype(int)
    order = np.argsort(-y, kind="stable")
    aucs, cov = _delong_components(np.atleast_2d(p)[:, order], int(y.sum()))
    se = np.sqrt(cov[0, 0])
    zc = stats.norm.ppf(0.5 + level / 2)
    return float(aucs[0]), float(aucs[0] - zc * se), float(aucs[0] + zc * se)


def mcnemar_test(y: np.ndarray, pred1: np.ndarray, pred2: np.ndarray) -> dict[str, float]:
    from statsmodels.stats.contingency_tables import mcnemar

    c1, c2 = pred1 == y, pred2 == y
    table = [[int((c1 & c2).sum()), int((c1 & ~c2).sum())], [int((~c1 & c2).sum()), int((~c1 & ~c2).sum())]]
    res = mcnemar(table, exact=False, correction=True)
    return {"b": table[0][1], "c": table[1][0], "stat": float(res.statistic), "p": float(res.pvalue)}


def holm(pvals: list[float]) -> list[float]:
    p = np.asarray(pvals, float)
    order = np.argsort(p)
    adj = np.empty_like(p)
    running = 0.0
    for rank, i in enumerate(order):
        running = max(running, (len(p) - rank) * p[i])
        adj[i] = min(running, 1.0)
    return adj.tolist()
