import numpy as np
from scipy import stats

from qgenomix.search.candidates import cross_mechanism_pairs, pair_features
from qgenomix.search.relevance import null_design, score_test, wald_test_single


def _data(rng, n=4000, effect=0.6):
    G = rng.binomial(2, 0.3, size=(n, 6)).astype(float)
    Gc = G - G.mean(0)
    eta = -2.2 + 0.3 * Gc[:, 0] + 0.2 * Gc[:, 3] + effect * Gc[:, 1] * Gc[:, 4]
    y = rng.binomial(1, 1 / (1 + np.exp(-eta)))
    return G, y


def test_score_test_agrees_with_individual_wald_fits(rng):
    G, y = _data(rng)
    pairs = np.array([(1, 4), (0, 2), (2, 5), (0, 3)])
    X = pair_features(G, pairs)
    _, p_score = score_test(X, y, null_design(G[:, :6], None))
    # the reference fit uses only the pair's own main effects; agreement should still be close in rank and scale
    p_wald = np.array([wald_test_single(G[:, i], G[:, j], y, np.delete(G, [i, j], 1)) for i, j in pairs])
    assert np.argmin(p_score) == np.argmin(p_wald) == 0
    assert stats.spearmanr(-np.log10(p_score), -np.log10(p_wald))[0] > 0.7
    assert p_score[0] < 1e-3


def test_null_pvalues_are_roughly_uniform(rng):
    G, y = _data(rng, effect=0.0)
    i, j = np.triu_indices(6, 1)
    pairs = np.column_stack([i, j])
    ps = []
    for s in range(30):
        y = np.random.default_rng(s).binomial(1, 0.11, len(y))
        _, p = score_test(pair_features(G, pairs), y, null_design(G, None))
        ps.extend(p)
    assert 0.03 < np.mean(np.array(ps) < 0.05) < 0.08


def test_cross_mechanism_pairs_only_span_clusters(toy):
    pairs = cross_mechanism_pairs(toy.snps)
    cl = toy.snps["cluster"].to_numpy()
    assert (cl[pairs[:, 0]] != cl[pairs[:, 1]]).all()
    sizes = toy.snps["cluster"].value_counts()
    expected = (sizes.sum() ** 2 - (sizes**2).sum()) // 2
    assert len(pairs) == expected
