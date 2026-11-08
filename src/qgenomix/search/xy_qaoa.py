"""XY-mixer QAOA simulated inside the valid selections, and the decomposition that lets 12-qubit QAOA make the
full 48-of-200 pair selection (experiment E15).

The XY mixer never changes how many pairs are selected, so a circuit started in the Dicke state |D(n, k)> stays
among the C(n, k) valid selections. Simulating only those amplitudes is exact and fast: 495 numbers for n = 12,
k = 4, instead of 4,096. A layer applies the cost phase exp(-i g C(s)) to each selection s, then, for each ring
edge (i, i+1) in turn, the hop exp(-i b (XX + YY) / 2), which mixes every selection holding exactly one of pairs i
and i+1 with the selection that swaps them. This is the circuit of qaoa._apply (checked in the tests), so angles
trained here run unchanged in Qiskit and on IBM hardware.

Decomposition (quantum large-neighbourhood search): start from a valid K-pair selection and repeatedly cut out a
block of 12 candidates, 4 of them selected. With the other candidates held fixed, choosing which 4 of the 12 to
keep is again a 12-variable selection problem, a hardware-sized circuit. QAOA solves it, the best of `shots`
samples is kept if it improves the full objective, and the next block is cut. Two controls use the same blocks:
the same number of valid selections drawn uniformly at random (what QAOA's sampling must beat), and exhaustive
search over the block (the best any sub-solver could do).
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass, field

import numpy as np
from scipy.optimize import minimize

from qgenomix.search.qaoa import SelectionProblem, _hamiltonian, _ring


@dataclass
class Subspace:
    """The C(n, k) valid selections in increasing bitstring order (wire 0 = most significant bit)."""

    n: int
    k: int
    bits: np.ndarray                                   # (m, n) 0/1
    hops: list[tuple[np.ndarray, np.ndarray]] = field(default_factory=list)  # per ring edge: (rows, partner rows)

    @classmethod
    def build(cls, n: int, k: int) -> Subspace:
        codes = sorted(sum(1 << (n - 1 - i) for i in c) for c in itertools.combinations(range(n), k))
        codes = np.array(codes, dtype=np.int64)
        bits = ((codes[:, None] >> (n - 1 - np.arange(n))) & 1).astype(np.int8)
        hops = []
        for i, j in _ring(n):
            rows = np.flatnonzero(bits[:, i] != bits[:, j])
            partner = codes[rows] ^ (1 << (n - 1 - i)) ^ (1 << (n - 1 - j))
            hops.append((rows, np.searchsorted(codes, partner)))
        return cls(n, k, bits, hops)

    @property
    def codes(self) -> np.ndarray:
        return self.bits.astype(np.int64) @ (1 << (self.n - 1 - np.arange(self.n)))


def cost_vector(problem: SelectionProblem, sub: Subspace) -> np.ndarray:
    """The Ising cost of every valid selection, scaled exactly as qaoa.train_qaoa scales it."""
    h, J, _ = _hamiltonian(problem.objective_qubo())
    z = 1.0 - 2.0 * sub.bits
    c = z @ h
    for (i, j), v in J.items():
        c += v * z[:, i] * z[:, j]
    return c


def values(problem: SelectionProblem, sub: Subspace) -> np.ndarray:
    """The objective f(s) = sum r - lam * sum R of every valid selection (higher is better)."""
    b = sub.bits.astype(float)
    return b @ problem.r - problem.lam * np.einsum("bi,ij,bj->b", b, np.triu(problem.R, 1), b)


def state(params: np.ndarray, sub: Subspace, cost: np.ndarray) -> np.ndarray:
    """Amplitudes over the valid selections after the circuit with angles params = [[g_1..g_p], [b_1..b_p]]."""
    psi = np.full(len(sub.bits), 1 / np.sqrt(len(sub.bits)), dtype=complex)
    for g, b in zip(params[0], params[1], strict=True):
        psi = psi * np.exp(-1j * g * cost)
        c, s = np.cos(b), np.sin(b)
        for rows, partner in sub.hops:
            new = psi.copy()
            new[rows] = c * psi[rows] - 1j * s * psi[partner]
            psi = new
    return psi


def train(problem: SelectionProblem, depth: int, sub: Subspace | None = None, restarts: int = 4,
          seed: int = 0) -> tuple[np.ndarray, np.ndarray]:
    """Angles that minimise the expected cost, and the resulting distribution over valid selections."""
    sub = sub or Subspace.build(problem.n, problem.k)
    cost = cost_vector(problem, sub)

    def energy(x):
        p = np.abs(state(x.reshape(2, depth), sub, cost)) ** 2
        return float(p @ cost)

    rng = np.random.default_rng(seed)
    best = None
    for _ in range(restarts):
        res = minimize(energy, rng.uniform(0, 0.6, 2 * depth), method="L-BFGS-B")
        if best is None or res.fun < best.fun:
            best = res
    params = best.x.reshape(2, depth)
    return params, np.abs(state(params, sub, cost)) ** 2


# ---------------------------------------------------------------- decomposition over the full selection
def full_objective(x: np.ndarray, r: np.ndarray, R: np.ndarray, lam: float) -> float:
    s = np.flatnonzero(x)
    return float(r[s].sum() - lam * R[np.ix_(s, s)].sum() / 2)


def block_problem(x: np.ndarray, block: np.ndarray, r: np.ndarray, R: np.ndarray, lam: float) -> SelectionProblem:
    """Choose which of the block's candidates to keep, with everything outside the block held fixed."""
    outside = np.flatnonzero(x & ~np.isin(np.arange(len(x)), block))
    r_b = r[block] - lam * R[np.ix_(block, outside)].sum(1)
    return SelectionProblem(r=r_b, R=R[np.ix_(block, block)], k=int(x[block].sum()), lam=lam)


def choose_block(x: np.ndarray, r: np.ndarray, R: np.ndarray, lam: float, rng: np.random.Generator,
                 n_in: int = 4, n_out: int = 8) -> np.ndarray:
    """Weak selected pairs (redundant or low relevance) and promising unselected ones are drawn most often."""
    S, O = np.flatnonzero(x), np.flatnonzero(~x)
    keep = r[S] - lam * (R[np.ix_(S, S)].sum(1))       # what each selected pair adds now
    gain = r[O] - lam * R[np.ix_(O, S)].sum(1)           # what each unselected pair would add

    def draw(pool, score, m, sign):
        z = sign * (score - score.mean()) / (score.std() + 1e-9)
        w = np.exp(z - z.max())
        return rng.choice(pool, size=m, replace=False, p=w / w.sum())

    return np.concatenate([draw(S, keep, n_in, -1.0), draw(O, gain, n_out, 1.0)])


def solve_block(problem: SelectionProblem, sub: Subspace, method: str, shots: int, depth: int,
                rng: np.random.Generator) -> tuple[np.ndarray, dict]:
    """The best selection a sub-solver returns for one block, and how good it is among all valid selections."""
    v = values(problem, sub)
    if method == "exact":
        i = int(np.argmax(v))
    elif method == "random":
        i = int(max(rng.integers(0, len(v), shots), key=lambda j: v[j]))
    else:
        _, p = train(problem, depth, sub, seed=int(rng.integers(1 << 30)))
        draws = rng.choice(len(v), size=shots, p=p / p.sum())
        i = int(max(draws, key=lambda j: v[j]))
    rank = float((v < v[i]).mean())                     # share of valid selections the answer beats
    return sub.bits[i].astype(bool), {"is_block_optimum": bool(np.isclose(v[i], v.max())), "percentile": rank}


def lns(x0: np.ndarray, r: np.ndarray, R: np.ndarray, lam: float, method: str, blocks: int = 150,
        shots: int = 32, depth: int = 2, seed: int = 0, n_in: int = 4, n_out: int = 8) -> dict:
    """Improve a valid selection block by block with the given sub-solver ("qaoa", "random" or "exact")."""
    rng = np.random.default_rng(seed)
    sub = Subspace.build(n_in + n_out, n_in)
    x = x0.astype(bool).copy()
    trace = [full_objective(x, r, R, lam)]
    found = []
    for _ in range(blocks):
        block = choose_block(x, r, R, lam, rng, n_in, n_out)
        prob = block_problem(x, block, r, R, lam)
        y, info = solve_block(prob, sub, method, shots, depth, rng)
        if method == "qaoa":  # what uniform sampling with the same number of shots finds on the same block
            info |= {f"random_{k}": v for k, v in solve_block(prob, sub, "random", shots, depth, rng)[1].items()}
        cand = x.copy()
        cand[block] = y
        if full_objective(cand, r, R, lam) > trace[-1] + 1e-12:
            x = cand
        trace.append(full_objective(x, r, R, lam))
        found.append(info)
    out = {"x": x, "trace": trace}
    for key in found[0]:
        out[f"mean_{key}"] = float(np.mean([f[key] for f in found]))
    return out
