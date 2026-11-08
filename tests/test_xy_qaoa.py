import numpy as np

from qgenomix.search.qaoa import SelectionProblem, train_qaoa
from qgenomix.search.xy_qaoa import Subspace, cost_vector, full_objective, lns, state, train, values


def _problem(rng, n=6, k=2):
    r = rng.random(n)
    R = np.zeros((n, n))
    R[0, 1] = R[1, 0] = 1.0  # pairs 0 and 1 share a SNP
    R[2, 4] = R[4, 2] = 0.4  # pairs 2 and 4 are in LD
    return SelectionProblem(r=r, R=R, k=k, lam=0.5)


def test_subspace_simulator_matches_the_full_circuit(rng):
    prob = _problem(rng)
    res = train_qaoa(prob, "xy", depth=2, steps=20, restarts=1, seed=0)  # PennyLane, all 2^n amplitudes
    sub = Subspace.build(prob.n, prob.k)
    p = np.abs(state(res.params, sub, cost_vector(prob, sub))) ** 2
    assert np.isclose(p.sum(), 1)
    assert np.allclose(p, res.probs[sub.codes], atol=1e-8)


def test_trained_angles_favour_better_selections(rng):
    prob = _problem(rng, n=8, k=3)
    sub = Subspace.build(8, 3)
    _, p = train(prob, depth=2, sub=sub, restarts=2, seed=0)
    v = values(prob, sub)
    assert p @ v > v.mean()


def test_decomposition_keeps_k_pairs_and_never_loses_ground(rng):
    n, k = 40, 10
    r = rng.random(n)
    R = np.triu((rng.random((n, n)) < 0.1) * rng.random((n, n)), 1)
    R = R + R.T
    x0 = np.zeros(n, bool)
    x0[np.argsort(-r)[:k]] = True
    for method in ("qaoa", "random", "exact"):
        out = lns(x0, r, R, 0.5, method, blocks=12, shots=16, depth=1, seed=0)
        assert out["x"].sum() == k
        assert all(b >= a - 1e-12 for a, b in zip(out["trace"], out["trace"][1:], strict=False))
        assert out["trace"][-1] >= full_objective(x0, r, R, 0.5)
