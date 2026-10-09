import numpy as np
from sklearn.metrics import roc_auc_score

from qgenomix.eval.metrics import edr_at_k, screen_capture
from qgenomix.eval.stats import auc_ci, delong_test, holm


def test_edr_counts_unordered_pairs():
    ranked = np.array([[1, 2], [5, 3], [7, 8]])
    assert edr_at_k(ranked, [(2, 1), (3, 5)], 2) == 1.0
    assert edr_at_k(ranked, [(2, 1), (8, 7)], 2) == 0.5


def test_bmi_rule_cannot_catch_lean_cases(rng):
    n = 5000
    bmi = rng.normal(23.5, 3.5, n)
    y = rng.binomial(1, 0.11, n)
    cap = screen_capture(y, bmi, risk=bmi, budget=0.2, lean_cut=23.0)
    assert cap["lean_case_capture"] == 0.0


def test_delong_matches_sklearn_auc_and_detects_difference(rng):
    n = 2000
    y = rng.binomial(1, 0.2, n)
    good = y + rng.normal(0, 0.8, n)
    bad = y + rng.normal(0, 2.0, n)
    res = delong_test(y, good, bad)
    assert np.isclose(res["auc1"], roc_auc_score(y, good))
    assert res["p"] < 1e-3
    assert delong_test(y, good, good)["p"] > 0.99
    a, lo, hi = auc_ci(y, good)
    assert lo < a < hi


def test_holm_is_monotone_and_bounded():
    adj = holm([0.01, 0.04, 0.03, 0.5])
    assert adj[0] == 0.04 and max(adj) <= 1.0
