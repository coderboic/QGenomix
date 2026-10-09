"""Pair relevance: how strongly does each candidate interaction add to an additive null model?

We use Rao's score test. Fit the null logistic model once (all main effects + covariates), then for every
candidate interaction feature x compute

    U = x' (y - p)                                   score
    I = x' W x - (x' W Z)(Z' W Z)^-1 (Z' W x)        efficient information, W = diag(p(1 - p))
    stat = U^2 / I  ~  chi-square(1) under H0

This equals what P separate likelihood-ratio or Wald fits would give asymptotically, but costs a few matrix
products instead of P model fits, so all 1,500+ candidates are scored in well under a second.
"""

from __future__ import annotations

import numpy as np
from scipy import stats
from sklearn.linear_model import LogisticRegression


def null_design(G: np.ndarray, covars: np.ndarray | None) -> np.ndarray:
    parts = [np.ones((G.shape[0], 1)), G - G.mean(0)]
    if covars is not None and covars.size:
        parts.append(covars)
    return np.column_stack(parts).astype(np.float64)


def score_test(X: np.ndarray, y: np.ndarray, Z: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Score-test chi-square statistics and p-values for each column of X added to the null design Z."""
    null = LogisticRegression(C=np.inf, fit_intercept=False, max_iter=5000, tol=1e-10)  # tight: thread-count robust
    null.fit(Z, y)
    p = null.predict_proba(Z)[:, 1]
    r = y - p
    w = p * (1 - p)
    ZW = Z * w[:, None]
    A = np.linalg.pinv(Z.T @ ZW)
    B = ZW.T @ X                                   # (q, P) = Z'WX
    info = np.einsum("ij,ij->j", X * w[:, None], X) - np.einsum("ij,ij->j", B, A @ B)
    U = X.T @ r
    stat = np.where(info > 1e-12, U**2 / np.maximum(info, 1e-12), 0.0)
    return stat, stats.chi2.sf(stat, df=1)


def relevance(pvals: np.ndarray, cap: float = 50.0) -> np.ndarray:
    """-log10 p, capped, used as the per-pair relevance in the QUBO."""
    return np.minimum(-np.log10(np.maximum(pvals, 1e-300)), cap)


def wald_test_single(xi: np.ndarray, xj: np.ndarray, y: np.ndarray, covars: np.ndarray | None = None) -> float:
    """Reference implementation: one logistic fit y ~ xi + xj + xi*xj (+ covars); p-value of the product.

    Slow; used only in tests to validate `score_test`.
    """
    import statsmodels.api as sm

    cols = [xi, xj, (xi - xi.mean()) * (xj - xj.mean())]
    if covars is not None:
        cols.append(covars)
    X = sm.add_constant(np.column_stack(cols))
    fit = sm.Logit(y, X).fit(disp=0)
    return float(fit.pvalues[3])
