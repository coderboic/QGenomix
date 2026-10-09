"""Pair selection as a QUBO (quadratic unconstrained binary optimisation).

Choose x in {0,1}^P (x_p = 1 means "encode pair p") to minimise

    E(x) = - sum_p r_p x_p  +  lam * sum_{p<q} R_pq x_p x_q  +  A * (sum_p x_p - K)^2

r_p   relevance of pair p (score-test -log10 p, scaled to [0, 1])
R_pq  redundancy: genotype overlap of the two pairs, max |corr| between a SNP of p and a SNP of q
      (1 when they share a SNP, the LD r when SNPs are linked, 0 below a noise floor tau)
A     penalty that makes "exactly K pairs" the cheapest choice

Why overlap and not the correlation of the product features: centred products of two pairs that share a
SNP are almost uncorrelated, yet such pairs are the classic false positive in epistasis scans: a strong
true pair (a, b) drags "shadow" pairs (a, c) up the ranking. Penalising overlap spends the quantum
encoding budget on distinct SNPs and suppresses shadow pairs.

Expanding the penalty (x_p^2 = x_p): A * sum x_p (1 - 2K) + 2A * sum_{p<q} x_p x_q + A K^2.
Q is stored upper-triangular: diagonal = linear terms, Q[p, q] (p < q) = full pair coefficient.
"""

from __future__ import annotations

import itertools

import numpy as np


def redundancy_matrix(G: np.ndarray, pairs: np.ndarray, tau: float = 0.1) -> np.ndarray:
    """R_pq = max |corr(g_a, g_b)| over a in pair p, b in pair q; shared SNP gives 1; values < tau set to 0."""
    snps = np.unique(pairs)
    C = np.abs(np.nan_to_num(np.corrcoef(G[:, snps], rowvar=False)))
    np.fill_diagonal(C, 1.0)
    pos = {s: i for i, s in enumerate(snps)}
    a = np.array([pos[s] for s in pairs[:, 0]])
    b = np.array([pos[s] for s in pairs[:, 1]])
    R = np.maximum.reduce([C[np.ix_(a, a)], C[np.ix_(a, b)], C[np.ix_(b, a)], C[np.ix_(b, b)]])
    R[R < tau] = 0.0
    np.fill_diagonal(R, 0.0)
    return R


def auto_penalty(r: np.ndarray, R: np.ndarray, k: int, lam: float) -> float:
    """Smallest A that makes removing or adding one pair from a K-set never profitable (with margin)."""
    k = max(1, min(k, len(r)))
    worst = np.sort(R, axis=1)[:, ::-1][:, : k - 1].sum(1).max() if k > 1 else 0.0
    return float(1.0 + lam * worst + r.max())


def build_qubo(r: np.ndarray, R: np.ndarray, k: int, lam: float, A: float | None = None) -> tuple[np.ndarray, float]:
    """Return (upper-triangular Q, constant offset)."""
    r = np.asarray(r, float)
    A = auto_penalty(r, R, k, lam) if A is None else A
    P = len(r)
    Q = np.triu(lam * R + 2.0 * A, k=1)
    Q[np.diag_indices(P)] = -r + A * (1 - 2 * k)
    return Q, A * k * k


def qubo_energy(Q: np.ndarray, x: np.ndarray, offset: float = 0.0) -> float:
    x = np.asarray(x, float)
    return float(x @ Q @ x + offset)


def qubo_to_ising(Q: np.ndarray) -> tuple[np.ndarray, dict[tuple[int, int], float], float]:
    """Map x = (1 - z)/2 with z in {+1, -1}. Returns (h, J, c) with E = c + sum h_i z_i + sum J_ij z_i z_j."""
    n = len(Q)
    h = np.zeros(n)
    J: dict[tuple[int, int], float] = {}
    c = 0.0
    for i in range(n):
        c += Q[i, i] / 2
        h[i] -= Q[i, i] / 2
        for j in range(i + 1, n):
            q = Q[i, j]
            if q == 0:
                continue
            c += q / 4
            h[i] -= q / 4
            h[j] -= q / 4
            J[(i, j)] = q / 4
    return h, J, c


def brute_force(Q: np.ndarray, offset: float = 0.0) -> tuple[np.ndarray, np.ndarray]:
    """Energies of all 2^n bitstrings (n <= ~20).

    Row b of `bits` is the binary expansion of b with x_0 as the most significant bit, which is the same
    ordering PennyLane uses for `qml.probs` (wire 0 first), so probabilities and energies line up directly.
    """
    n = len(Q)
    bits = np.array(list(itertools.product([0, 1], repeat=n)), dtype=float)
    E = np.einsum("bi,ij,bj->b", bits, Q, bits) + offset
    return E, bits
