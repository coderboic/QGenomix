"""Pair-selection strategies compared in experiment E6."""

from __future__ import annotations

import numpy as np

from qgenomix.search.qubo import build_qubo, qubo_energy


def select_topk(r: np.ndarray, k: int) -> np.ndarray:
    return np.argsort(-r)[:k]


def select_mrmr(r: np.ndarray, R: np.ndarray, k: int, lam: float) -> np.ndarray:
    """Greedy max-relevance min-redundancy: add the pair with the best r_p - lam * sum R to chosen pairs."""
    chosen: list[int] = []
    pen = np.zeros(len(r))
    available = np.ones(len(r), bool)
    for _ in range(min(k, len(r))):
        gain = np.where(available, r - lam * pen, -np.inf)
        p = int(np.argmax(gain))
        chosen.append(p)
        available[p] = False
        pen += R[p]
    return np.array(chosen)


def _repair(x: np.ndarray, r: np.ndarray, R: np.ndarray, k: int, lam: float) -> np.ndarray:
    """Force exactly k ones by greedy add/remove on the (penalty-free) objective."""
    x = x.astype(bool).copy()
    while x.sum() > k:
        on = np.flatnonzero(x)
        marginal = r[on] - lam * (R[np.ix_(on, on)].sum(1))
        x[on[np.argmin(marginal)]] = False
    while x.sum() < k:
        off = np.flatnonzero(~x)
        marginal = r[off] - lam * R[np.ix_(off, np.flatnonzero(x))].sum(1)
        x[off[np.argmax(marginal)]] = True
    return x


def _swap_polish(x: np.ndarray, r: np.ndarray, R: np.ndarray, lam: float,
                 max_iter: int = 2000) -> tuple[np.ndarray, int]:
    """Best-improvement 1-swap local search at fixed cardinality.

    Single bit flips must pass through an infeasible state (K-1 or K+1 pairs) that the penalty makes very
    costly, so annealing at low temperature cannot move between K-sets. A swap (drop p, add q) moves
    directly between feasible sets. Gain(p, q) = [r_q - lam(sum_S R_q. - R_qp)] - [r_p - lam sum_S R_p.].
    """
    x = x.astype(bool).copy()
    swaps = 0
    for _ in range(max_iter):
        S, O = np.flatnonzero(x), np.flatnonzero(~x)
        if len(S) == 0 or len(O) == 0:
            break
        red_in = R[np.ix_(S, S)].sum(1)                     # redundancy each chosen pair adds now
        red_out = R[np.ix_(O, S)]                           # (|O|, |S|)
        add_val = r[O][:, None] - lam * (red_out.sum(1, keepdims=True) - red_out)  # q's value if p is removed
        gain = add_val - (r[S] - lam * red_in)[None, :]
        q, p = np.unravel_index(np.argmax(gain), gain.shape)
        if gain[q, p] <= 1e-12:
            break
        x[S[p]], x[O[q]] = False, True
        swaps += 1
    return x, swaps


def select_qubo_sa(r: np.ndarray, R: np.ndarray, k: int, lam: float, num_reads: int = 100,
                   seed: int | None = None) -> tuple[np.ndarray, dict]:
    """Solve the QUBO with simulated annealing (D-Wave's open-source sampler), then polish with swap moves."""
    import dimod
    from dwave.samplers import SimulatedAnnealingSampler

    Q, offset = build_qubo(r, R, k, lam)
    bqm = dimod.BinaryQuadraticModel(Q, "BINARY")
    res = SimulatedAnnealingSampler().sample(bqm, num_reads=num_reads, seed=seed)
    best = res.first.sample
    x = np.array([best[i] for i in range(len(r))])
    raw_card = int(x.sum())
    x = _repair(x, r, R, k, lam)
    sa_energy = qubo_energy(Q, x, offset)
    x, swaps = _swap_polish(x, r, R, lam)
    info = {"energy": qubo_energy(Q, x, offset), "energy_sa_only": sa_energy, "raw_cardinality": raw_card,
            "polish_swaps": swaps, "objective": objective(np.flatnonzero(x), r, R, lam)}
    return np.flatnonzero(x), info


def objective(sel: np.ndarray, r: np.ndarray, R: np.ndarray, lam: float) -> float:
    """Penalty-free objective sum r - lam * sum_{p<q} R (higher is better)."""
    sel = np.asarray(sel)
    return float(r[sel].sum() - lam * R[np.ix_(sel, sel)].sum() / 2)


def mean_redundancy(sel: np.ndarray, R: np.ndarray) -> float:
    sel = np.asarray(sel)
    if len(sel) < 2:
        return 0.0
    sub = R[np.ix_(sel, sel)]
    return float(sub[np.triu_indices(len(sel), 1)].mean())
