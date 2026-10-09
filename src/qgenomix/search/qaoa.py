"""QAOA for small pair-selection problems (experiment E7).

Problem: choose exactly k of n candidate pairs to maximise f(x) = sum r_p x_p - lam * sum_{p<q} R_pq x_p x_q.

Two formulations are compared:

  "penalty"     the textbook route. Minimise the QUBO with the cardinality penalty A (sum x - k)^2, start in
                |+>^n and mix with X rotations. Every bitstring is reachable, so most probability can leak
                onto infeasible selections, and the penalty dominates the energy scale.

  "xy"          a constraint-preserving Quantum Alternating Operator Ansatz (Hadfield et al., Algorithms 2019).
                Start in the Dicke state |D(n,k)>, the equal superposition of all C(n,k) valid selections,
                and mix with XY hopping terms exp(-i b (XX + YY)/2) on a ring. XY hopping swaps a 1 and a 0,
                so the number of ones never changes: every sample is a valid k-selection, no penalty needed.
                On hardware the Dicke state is built with the deterministic O(nk) circuit of Baertschi and
                Eidenbenz (FCT 2019); on the simulator it is loaded directly (same state, verified in tests).

Both use the same cost layer exp(-i g H_C) with H_C = sum h_i Z_i + sum J_ij Z_i Z_j from the Ising map of
the QUBO (x = (1 - z)/2, so measuring |1> on wire i means "pair i selected"). Angles are trained on a
simulator; the identical circuit is rebuilt in Qiskit for sampling on noisy simulators and IBM hardware.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass

import numpy as np
import pennylane as qml
from pennylane import numpy as pnp

from qgenomix.search.qubo import auto_penalty, qubo_to_ising


@dataclass
class SelectionProblem:
    r: np.ndarray
    R: np.ndarray
    k: int
    lam: float

    @property
    def n(self) -> int:
        return len(self.r)

    def objective_qubo(self) -> np.ndarray:
        """Minimisation QUBO of -f(x) (no cardinality term)."""
        Q = np.triu(self.lam * self.R, k=1)
        Q[np.diag_indices(self.n)] = -self.r
        return Q

    def penalty_qubo(self) -> np.ndarray:
        A = auto_penalty(self.r, self.R, self.k, self.lam)
        Q = np.triu(self.lam * self.R + 2 * A, k=1)
        Q[np.diag_indices(self.n)] = -self.r + A * (1 - 2 * self.k)
        return Q

    def table(self) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """All 2^n bitstrings (wire 0 = most significant bit, PennyLane order), f(x) and feasibility."""
        bits = np.array(list(itertools.product([0, 1], repeat=self.n)), dtype=float)
        f = bits @ self.r - self.lam * np.einsum("bi,ij,bj->b", bits, np.triu(self.R, 1), bits)
        return bits, f, bits.sum(1) == self.k

    def warm_start(self) -> np.ndarray:
        x = np.zeros(self.n, int)
        x[np.argsort(-self.r)[: self.k]] = 1
        return x


@dataclass
class QAOAResult:
    formulation: str
    depth: int
    params: np.ndarray
    probs: np.ndarray
    metrics: dict


def evaluate(problem: SelectionProblem, p: np.ndarray, extra_baseline: np.ndarray | None = None) -> dict:
    """Quality of an output distribution p over bitstrings.

    approx_ratio: E[v] rescaled so 1 = always the best feasible selection and 0 = always the worst feasible
    one, where infeasible samples count as the worst. p_optimal: probability of the exact optimum.
    """
    bits, f, feas = problem.table()
    v_best, v_worst = f[feas].max(), f[feas].min()
    v = np.where(feas, f, v_worst)
    ar = float((p @ v - v_worst) / (v_best - v_worst)) if v_best > v_worst else 1.0
    out = {"approx_ratio": ar, "p_optimal": float(p[feas & np.isclose(f, v_best)].sum()),
           "p_feasible": float(p[feas].sum()), "n_feasible": int(feas.sum())}
    if extra_baseline is not None:
        idx = int("".join(map(str, extra_baseline.astype(int))), 2)
        out["warm_start_value_ratio"] = float((v[idx] - v_worst) / (v_best - v_worst))
        out["warm_start_is_optimal"] = bool(np.isclose(f[idx], v_best) and feas[idx])
    return out


def baselines(problem: SelectionProblem) -> dict:
    bits, f, feas = problem.table()
    uniform = np.full(len(f), 1 / len(f))
    feasible_uniform = feas / feas.sum()
    return {"uniform_all": evaluate(problem, uniform), "uniform_feasible": evaluate(problem, feasible_uniform),
            "warm_start": evaluate(problem, np.eye(len(f))[int("".join(map(str, problem.warm_start())), 2)])}


def _ring(n: int) -> list[tuple[int, int]]:
    return [(i, (i + 1) % n) for i in range(n)]


def _hamiltonian(Q: np.ndarray) -> tuple[np.ndarray, dict, float]:
    h, J, _ = qubo_to_ising(Q)
    scale = max(np.abs(h).max(), max((abs(v) for v in J.values()), default=0.0), 1e-9)
    return h / scale, {key: v / scale for key, v in J.items()}, scale


def dicke_vector(n: int, k: int) -> np.ndarray:
    w = np.array([bin(i).count("1") for i in range(2**n)])
    v = (w == k).astype(float)
    return v / np.linalg.norm(v)


def dicke_circuit(n: int, k: int):
    """Baertschi-Eidenbenz deterministic Dicke-state preparation (Qiskit), O(nk) gates."""
    from qiskit import QuantumCircuit
    from qiskit.circuit.library import RYGate

    def scs(qc, m, kk):  # split-and-cyclic-shift on the first m qubits
        qc.cx(m - 2, m - 1)
        qc.cry(2 * np.arccos(np.sqrt(1 / m)), m - 1, m - 2)
        qc.cx(m - 2, m - 1)
        for l in range(2, kk + 1):
            qc.cx(m - l - 1, m - 1)
            qc.append(RYGate(2 * np.arccos(np.sqrt(l / m))).control(2), [m - 1, m - l, m - l - 1])
            qc.cx(m - l - 1, m - 1)

    qc = QuantumCircuit(n)
    qc.x(range(n - k, n))
    for m in range(n, k, -1):
        scs(qc, m, k)
    for m in range(k, 1, -1):
        scs(qc, m, m - 1)
    return qc


def _apply(params, h, J, n, formulation: str, k: int):
    if formulation == "xy":
        qml.StatePrep(dicke_vector(n, k), wires=range(n))
    else:
        for w in range(n):
            qml.Hadamard(wires=w)
    for layer in range(params.shape[1]):
        g, beta = params[0, layer], params[1, layer]
        for i, hi in enumerate(h):
            if hi != 0:
                qml.RZ(2 * g * hi, wires=i)
        for (i, j), v in J.items():
            qml.IsingZZ(2 * g * v, wires=[i, j])
        if formulation == "xy":
            for i, j in _ring(n):
                qml.IsingXX(beta, wires=[i, j])
                qml.IsingYY(beta, wires=[i, j])
        else:
            for w in range(n):
                qml.RX(2 * beta, wires=w)


def train_qaoa(problem: SelectionProblem, formulation: str, depth: int, steps: int = 150, restarts: int = 3,
               lr: float = 0.05, init: np.ndarray | None = None, seed: int = 0) -> QAOAResult:
    assert formulation in ("penalty", "xy")
    Q = problem.penalty_qubo() if formulation == "penalty" else problem.objective_qubo()
    h, J, _ = _hamiltonian(Q)
    n = problem.n
    init_bits = problem.warm_start()
    H = qml.Hamiltonian([*map(float, h), *map(float, J.values())],
                        [*[qml.PauliZ(i) for i in range(n)], *[qml.PauliZ(i) @ qml.PauliZ(j) for i, j in J]])
    dev = qml.device("lightning.qubit", wires=n)

    @qml.qnode(dev, diff_method="adjoint")
    def energy(params):
        _apply(params, h, J, n, formulation, problem.k)
        return qml.expval(H)

    @qml.qnode(dev)
    def probs(params):
        _apply(params, h, J, n, formulation, problem.k)
        return qml.probs(wires=range(n))

    rng = np.random.default_rng(seed)
    best, best_val = None, np.inf
    for rs in range(restarts):
        start = np.asarray(init, float) if (init is not None and rs == 0) else \
            np.vstack([rng.uniform(0, 0.6, depth), rng.uniform(0, 0.6, depth)])
        params = pnp.array(start, requires_grad=True)
        opt = qml.AdamOptimizer(lr)
        for _ in range(steps):
            params = opt.step(energy, params)
        val = float(energy(params))
        if val < best_val:
            best_val, best = val, np.array(params)
    p = np.asarray(probs(best))
    return QAOAResult(formulation, depth, best, p, evaluate(problem, p, init_bits))


def qiskit_circuit(problem: SelectionProblem, formulation: str, params: np.ndarray, measure: bool = True):
    """The same circuit in Qiskit: RZ, RZZ cost terms; RXX + RYY ring (xy) or RX (penalty) mixer."""
    from qiskit import QuantumCircuit

    Q = problem.penalty_qubo() if formulation == "penalty" else problem.objective_qubo()
    h, J, _ = _hamiltonian(Q)
    n = problem.n
    qc = QuantumCircuit(n)
    if formulation == "xy":
        qc.compose(dicke_circuit(n, problem.k), inplace=True)  # permutation-symmetric, so bit order is moot
    else:
        qc.h(range(n))
    for layer in range(params.shape[1]):
        g, beta = float(params[0, layer]), float(params[1, layer])
        for i, hi in enumerate(h):
            if hi != 0:
                qc.rz(2 * g * hi, i)
        for (i, j), v in J.items():
            qc.rzz(2 * g * v, i, j)
        if formulation == "xy":
            for i, j in _ring(n):
                qc.rxx(beta, i, j)
                qc.ryy(beta, i, j)
        else:
            qc.rx(2 * beta, range(n))
    if measure:
        qc.measure_all()
    return qc


def counts_to_probs(counts: dict[str, int], n: int) -> np.ndarray:
    """Qiskit bitstrings are little-endian (qubit 0 rightmost); convert to PennyLane ordering."""
    p = np.zeros(2**n)
    total = sum(counts.values())
    for bitstring, c in counts.items():
        s = bitstring.replace(" ", "")[-n:]
        p[int(s[::-1], 2)] += c / total
    return p
