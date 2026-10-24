import numpy as np

from qgenomix.search.mitigation import correct_readout, extrapolate, fold, postselect
from qgenomix.search.qaoa import SelectionProblem


def _readout(p, e01, e10):
    n = len(e01)
    t = p.reshape((2,) * n)
    for i in range(n):
        A = np.array([[1 - e01[i], e10[i]], [e01[i], 1 - e10[i]]])
        t = np.moveaxis(np.tensordot(A, t, axes=([1], [i])), 0, i)
    return t.reshape(-1)


def test_readout_correction_inverts_tensored_errors(rng):
    true = rng.dirichlet(np.ones(2**5))
    e01, e10 = rng.uniform(0.01, 0.05, 5), rng.uniform(0.01, 0.08, 5)
    assert np.allclose(correct_readout(_readout(true, e01, e10), e01, e10), true, atol=1e-12)


def test_postselect_keeps_only_valid_selections(rng):
    prob = SelectionProblem(r=rng.random(5), R=np.zeros((5, 5)), k=2, lam=0.5)
    p = rng.dirichlet(np.ones(2**5))
    q, kept = postselect(prob, p)
    weights = np.array([bin(i).count("1") for i in range(2**5)])
    assert np.isclose(q.sum(), 1) and (q[weights != 2] == 0).all()
    assert np.isclose(kept, p[weights == 2].sum())


def test_zne_extrapolates_linear_decay_and_folding_preserves_the_circuit():
    from qiskit import QuantumCircuit
    from qiskit.quantum_info import Operator

    assert np.isclose(extrapolate(np.array([1, 3, 5]), 0.8 - 0.05 * np.array([1, 3, 5])), 0.8)
    qc = QuantumCircuit(2)
    qc.ry(0.3, 0)
    qc.cx(0, 1)
    qc.rz(0.7, 1)
    folded = fold(qc, 3)
    assert folded.count_ops()["cx"] == 3
    assert Operator(folded.remove_final_measurements(inplace=False)).equiv(Operator(qc))
