import numpy as np

from qgenomix.data.impute import Panel, apply, impute, ld_tags, plan, read_bed


def _haplotype_panel(rng, n=400, m=60):
    """Genotypes in blocks of 3 perfectly linked variants plus independent ones."""
    base = rng.binomial(2, 0.3, size=(n, m // 3)).astype(np.float32)
    X = np.repeat(base, 3, axis=1)
    noisy = rng.random(X.shape) < 0.03                       # a little recombination noise
    X[noisy] = rng.binomial(2, 0.3, size=noisy.sum())
    return X, np.arange(m) * 1000


def test_ld_tags_find_linked_neighbours(rng):
    X, pos = _haplotype_panel(rng)
    idx, r2, slope, mean = ld_tags(X, pos, k=3, window=10, chunk=16)
    j = 7                                                    # block {6, 7, 8}
    assert set(idx[j, :2]) == {6, 8} and (r2[j, :2] > 0.8).all()
    assert np.allclose(mean, X.mean(0), atol=1e-6)


def test_impute_beats_mean_filling(rng):
    X, pos = _haplotype_panel(rng)
    idx, r2, slope, mean = ld_tags(X[:300], pos, k=3, window=10)
    panel = Panel(mean, idx, r2, slope)
    test = X[300:]
    observed = np.ones(X.shape[1], bool)
    observed[1::3] = False                                   # middle variant of every block missing
    err_mean = np.abs(np.where(observed, test, mean) - test)[:, ~observed].mean()
    filled = np.vstack([impute(d, observed, panel)[0] for d in test])
    err_ld = np.abs(filled - test)[:, ~observed].mean()
    assert err_ld < 0.3 * err_mean
    assert np.array_equal(filled[:, observed], test[:, observed])        # measured values never change
    assert np.allclose(apply(test, plan(observed, panel), panel), filled)  # batch == one by one


def test_read_bed_decodes_plink_codes(tmp_path):
    # 3 samples, 2 variants; codes per sample: 00 -> 2, 10 -> 1, 11 -> 0, 01 -> missing
    v1 = 0b00 | (0b10 << 2) | (0b11 << 4)                    # samples: 00, 10, 11 (+ padding)
    v2 = 0b01 | (0b00 << 2) | (0b10 << 4)
    (tmp_path / "x.bed").write_bytes(bytes([0x6C, 0x1B, 0x01, v1, v2]))
    X = read_bed(tmp_path / "x", 3)
    assert X.shape == (3, 2)
    assert X[:, 0].tolist() == [2.0, 1.0, 0.0]
    assert np.isnan(X[0, 1]) and X[1:, 1].tolist() == [2.0, 1.0]
