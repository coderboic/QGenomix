import numpy as np

from qgenomix.search.qubo import brute_force, build_qubo, qubo_energy, qubo_to_ising, redundancy_matrix
from qgenomix.search.solvers import objective, select_mrmr, select_qubo_sa, select_topk


def _problem(rng, n=12):
    r = rng.random(n)
    G = rng.binomial(2, 0.3, size=(5000, 2 * n)).astype(float)
    pairs = np.column_stack([np.arange(n), np.arange(n, 2 * n)])
    pairs[1, 0] = pairs[0, 0]  # pairs 0 and 1 share a SNP
    G[:, pairs[3, 0]] = G[:, pairs[2, 1]]  # pairs 2 and 3 contain SNPs in perfect LD
    return r, redundancy_matrix(G, pairs)


def test_redundancy_flags_shared_snps_and_ld(rng):
    _, R = _problem(rng)
    assert R[0, 1] == 1.0 and R[2, 3] > 0.99
    assert (R[4:, 4:] == 0).all()  # independent SNPs fall under the noise floor


def test_ising_matches_qubo_on_every_bitstring(rng):
    r, R = _problem(rng)
    Q, off = build_qubo(r, R, k=4, lam=1.0)
    h, J, c = qubo_to_ising(Q)
    E, bits = brute_force(Q, off)
    z = 1 - 2 * bits
    Ei = c + off + z @ h + sum(v * z[:, i] * z[:, j] for (i, j), v in J.items())
    assert np.allclose(E, Ei)


def test_penalty_makes_optimum_have_k_ones(rng):
    for k in (2, 4, 6):
        r, R = _problem(rng)
        Q, off = build_qubo(r, R, k=k, lam=1.0)
        E, bits = brute_force(Q, off)
        assert bits[np.argmin(E)].sum() == k


def test_simulated_annealing_finds_brute_force_optimum(rng):
    r, R = _problem(rng)
    Q, off = build_qubo(r, R, k=4, lam=1.0)
    E, bits = brute_force(Q, off)
    sel, info = select_qubo_sa(r, R, 4, 1.0, num_reads=200, seed=1)
    x = np.zeros(len(r))
    x[sel] = 1
    assert np.isclose(qubo_energy(Q, x, off), E.min())


def test_qubo_avoids_redundant_pair_that_topk_takes(rng):
    r = np.array([1.0, 0.99, 0.5, 0.45, 0.4, 0.1])
    R = np.zeros((6, 6))
    R[0, 1] = R[1, 0] = 0.95  # the two best pairs are near-duplicates
    top = set(select_topk(r, 2))
    sel, _ = select_qubo_sa(r, R, 2, lam=1.0, num_reads=100, seed=0)
    assert top == {0, 1}
    assert set(sel) == {0, 2}
    assert objective(sel, r, R, 1.0) > objective(np.array(sorted(top)), r, R, 1.0)
    assert set(select_mrmr(r, R, 2, 1.0)) == {0, 2}
