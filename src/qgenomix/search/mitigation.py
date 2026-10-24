"""Error mitigation for sampling QAOA circuits on noisy quantum hardware (experiment E7b).

Three standard techniques, applied to the shots of one transpiled circuit:

  readout      Per-qubit readout correction. Two calibration circuits (all qubits |0>, all qubits |1>) give each
               measured qubit's 2x2 assignment matrix; its inverse is applied to the measured distribution as a
               tensor product, then negative values are clipped (tensored mitigation, Bravyi et al. PRA 2021).
  postselect   Keep only samples that select exactly k pairs. The XY formulation conserves the number of ones,
               so any other weight is a detected error (symmetry verification, Bonet-Monroig et al. PRA 2018);
               for the penalty formulation it is plain feasibility filtering.
  zne          Zero-noise extrapolation (Temme et al. PRL 2017). The transpiled circuit U is folded into
               U (U^-1 U)^j, multiplying the noise by 1, 3, 5 while leaving the ideal result unchanged, and the
               quality measured at each scale is extrapolated linearly back to zero noise.
"""

from __future__ import annotations

import numpy as np

from qgenomix.search.qaoa import SelectionProblem, counts_to_probs, evaluate, qiskit_circuit


def assignment_rates(counts0: dict[str, int], counts1: dict[str, int], n: int) -> tuple[np.ndarray, np.ndarray]:
    """Per-qubit P(read 1 | prepared 0) and P(read 0 | prepared 1), qubit order = PennyLane wires."""
    p0, p1 = counts_to_probs(counts0, n), counts_to_probs(counts1, n)
    bits = (np.arange(2**n)[:, None] >> (n - 1 - np.arange(n))[None, :]) & 1   # wire 0 = most significant bit
    e01 = (p0[:, None] * (bits == 1)).sum(0)
    e10 = (p1[:, None] * (bits == 0)).sum(0)
    return e01, e10


def correct_readout(p: np.ndarray, e01: np.ndarray, e10: np.ndarray) -> np.ndarray:
    """Apply the inverse of each qubit's assignment matrix A = [[1-e01, e10], [e01, 1-e10]]; clip and renormalise."""
    n = len(e01)
    t = p.reshape((2,) * n)
    for i in range(n):
        A = np.array([[1 - e01[i], e10[i]], [e01[i], 1 - e10[i]]])
        t = np.moveaxis(np.tensordot(np.linalg.inv(A), t, axes=([1], [i])), 0, i)
    q = np.clip(t.reshape(-1), 0, None)
    return q / q.sum()


def postselect(problem: SelectionProblem, p: np.ndarray) -> tuple[np.ndarray, float]:
    """Distribution restricted to valid selections (exactly k ones) and the share of shots kept."""
    _, _, feas = problem.table()
    kept = float(p[feas].sum())
    return (np.where(feas, p, 0) / kept if kept > 0 else p), kept


def extrapolate(scales: np.ndarray, values: np.ndarray) -> float:
    """Linear least-squares fit of value against noise scale, read off at scale 0."""
    slope, intercept = np.polyfit(np.asarray(scales, float), np.asarray(values, float), 1)
    return float(intercept)


def _measured(tqc, n: int):
    """Physical qubit holding each logical qubit at the end of a transpiled circuit."""
    return list(tqc.layout.final_index_layout())[:n]


def fold(tqc_unitary, scale: int):
    """Global unitary folding at the ISA level: U (U^-1 U)^((scale-1)/2), separated by barriers so the
    transpiler cannot cancel the folds (the result is re-translated with optimisation level 0)."""
    assert scale % 2 == 1
    out = tqc_unitary.copy()
    inv = tqc_unitary.inverse()
    for _ in range((scale - 1) // 2):
        out.barrier()
        out.compose(inv, inplace=True)
        out.barrier()
        out.compose(tqc_unitary, inplace=True)
    return out


def measured_circuit(tqc_unitary, phys: list[int]):
    from qiskit import ClassicalRegister

    qc = tqc_unitary.copy()
    creg = ClassicalRegister(len(phys), "meas")
    qc.add_register(creg)
    qc.barrier()
    for i, q in enumerate(phys):
        qc.measure(q, creg[i])
    return qc


def calibration_circuits(num_qubits: int, phys: list[int]):
    from qiskit import ClassicalRegister, QuantumCircuit

    out = []
    for flip in (False, True):
        qc = QuantumCircuit(num_qubits)
        creg = ClassicalRegister(len(phys), "meas")
        qc.add_register(creg)
        if flip:
            qc.x(phys)
        qc.barrier()
        for i, q in enumerate(phys):
            qc.measure(q, creg[i])
        out.append(qc)
    return out


def prepare(problem: SelectionProblem, formulation: str, params: np.ndarray, backend, scales=(1, 3, 5),
            seed: int = 0) -> tuple[list, dict]:
    """Transpiled circuits to sample: one folded circuit per noise scale, then the two readout calibrations."""
    from qiskit import transpile

    n = problem.n
    logical = qiskit_circuit(problem, formulation, params, measure=False)
    tqc = transpile(logical, backend, optimization_level=3, seed_transpiler=seed)
    phys = _measured(tqc, n)
    folded = [transpile(measured_circuit(fold(tqc, s), phys), backend, optimization_level=0) for s in scales]
    cal = [transpile(c, backend, optimization_level=0) for c in calibration_circuits(tqc.num_qubits, phys)]
    context = {"scales": list(scales), "logical": logical,
               "n_2q": int(sum(1 for i in tqc.data if i.operation.num_qubits == 2))}
    return folded + cal, context


def analyse(problem: SelectionProblem, context: dict, counts: list[dict[str, int]]) -> dict:
    """Quality after each mitigation stage, from the counts of the circuits made by prepare()."""
    from qiskit.quantum_info import Statevector

    n, scales = problem.n, context["scales"]
    e01, e10 = assignment_rates(counts[-2], counts[-1], n)
    stages: dict[str, list[float]] = {"raw": [], "readout": [], "readout_postselect": []}
    kept = []
    for c in counts[: len(scales)]:
        p = counts_to_probs(c, n)
        q = correct_readout(p, e01, e10)
        s, k = postselect(problem, q)
        stages["raw"].append(evaluate(problem, p)["approx_ratio"])
        stages["readout"].append(evaluate(problem, q)["approx_ratio"])
        stages["readout_postselect"].append(evaluate(problem, s)["approx_ratio"])
        kept.append(k)
    ideal = counts_to_probs(Statevector(context["logical"]).probabilities_dict(), n)
    return {
        "ideal_postselect": evaluate(problem, postselect(problem, ideal)[0])["approx_ratio"],
        "by_scale": stages, "scales": scales, "postselect_kept": kept,
        "raw": stages["raw"][0], "readout": stages["readout"][0],
        "readout_postselect": stages["readout_postselect"][0],
        "readout_postselect_zne": min(1.0, extrapolate(np.array(scales), np.array(stages["readout_postselect"]))),
        "readout_error_mean": float(np.mean((e01 + e10) / 2)), "n_2q": context["n_2q"],
    }


def mitigated_run(problem: SelectionProblem, formulation: str, params: np.ndarray, backend, shots: int = 4000,
                  scales=(1, 3, 5), seed: int = 0) -> dict:
    """Sample the QAOA circuit on an Aer `backend` with every mitigation stage and report the quality after each.
    For IBM hardware, scripts/run_ibm.py calls prepare() and analyse() around one batched Runtime job."""
    circuits, context = prepare(problem, formulation, params, backend, scales, seed)
    res = backend.run(circuits, shots=shots, seed_simulator=seed).result()
    return analyse(problem, context, [res.get_counts(i) for i in range(len(circuits))])
