import numpy as np

from qgenomix.search.qaoa import (
    SelectionProblem,
    baselines,
    counts_to_probs,
    dicke_circuit,
    dicke_vector,
    qiskit_circuit,
    train_qaoa,
)


def _problem(rng, n=6, k=2):
    r = rng.random(n)
    R = np.zeros((n, n))
    R[0, 1] = R[1, 0] = 1.0  # pairs 0 and 1 share a SNP
    return SelectionProblem(r=r, R=R, k=k, lam=0.5)


def test_xy_mixer_never_leaves_the_feasible_subspace(rng):
    prob = _problem(rng)
    res = train_qaoa(prob, "xy", depth=2, steps=40, restarts=1, seed=0)
    assert np.isclose(res.metrics["p_feasible"], 1.0, atol=1e-9)
    assert np.isclose(res.probs.sum(), 1)


def test_both_formulations_beat_random_guessing(rng):
    prob = _problem(rng)
    base = baselines(prob)
    for form in ("penalty", "xy"):
        res = train_qaoa(prob, form, depth=2, steps=80, restarts=2, seed=1)
        assert res.metrics["approx_ratio"] > base["uniform_all"]["approx_ratio"]


def test_qiskit_circuit_reproduces_pennylane_distribution(rng):
    from qiskit.quantum_info import Statevector

    prob = _problem(rng)
    for form in ("penalty", "xy"):
        res = train_qaoa(prob, form, depth=1, steps=30, restarts=1, seed=2)
        sv = Statevector(qiskit_circuit(prob, form, res.params, measure=False)).probabilities_dict()
        assert np.allclose(counts_to_probs(sv, prob.n), res.probs, atol=1e-6), form


def test_dicke_circuit_prepares_uniform_feasible_state():
    from qiskit.quantum_info import Statevector

    for n, k in ((5, 2), (8, 3)):
        sv = Statevector(dicke_circuit(n, k)).data
        assert np.allclose(np.abs(sv), dicke_vector(n, k), atol=1e-9)
