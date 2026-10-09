"""Evaluation metrics, including the two project-specific ones: EDR@K and lean-case capture."""

from __future__ import annotations

import numpy as np
from sklearn.metrics import average_precision_score, brier_score_loss, f1_score, roc_auc_score


def auc(y: np.ndarray, p: np.ndarray) -> float:
    return float(roc_auc_score(y, p))


def best_f1_threshold(y: np.ndarray, p: np.ndarray) -> float:
    """Threshold that maximises F1; choose it on training/OOF data, then apply it to the test set."""
    qs = np.unique(np.quantile(p, np.linspace(0.5, 0.995, 200)))
    scores = [f1_score(y, p >= t) for t in qs]
    return float(qs[int(np.argmax(scores))])


def summary(y: np.ndarray, p: np.ndarray, threshold: float, prob: bool = True) -> dict[str, float]:
    out = {"auc": auc(y, p), "ap": float(average_precision_score(y, p)), "f1": float(f1_score(y, p >= threshold))}
    if prob:
        out["brier"] = float(brier_score_loss(y, np.clip(p, 0, 1)))
    return out


def edr_at_k(ranked_pairs: np.ndarray, true_pairs: list[tuple[int, int]], k: int) -> float:
    """Epistasis Detection Rate at K: share of the truly interacting pairs found in the top-K of a ranking."""
    if not true_pairs:
        return float("nan")
    top = {frozenset(map(int, p)) for p in np.asarray(ranked_pairs)[:k]}
    truth = {frozenset(map(int, p)) for p in true_pairs}
    return len(top & truth) / len(truth)


def recall_of_set(selected_pairs: np.ndarray, true_pairs: list[tuple[int, int]]) -> float:
    return edr_at_k(selected_pairs, true_pairs, len(selected_pairs))


def shadow_pairs(selected_pairs: np.ndarray, true_pairs: list[tuple[int, int]]) -> int:
    """Selected pairs that are not true but share exactly one SNP with a true pair (classic false positives)."""
    truth = [frozenset(p) for p in true_pairs]
    n = 0
    for p in np.asarray(selected_pairs):
        fp = frozenset(map(int, p))
        if fp not in truth and any(len(fp & t) == 1 for t in truth):
            n += 1
    return n


def screen_capture(y: np.ndarray, bmi: np.ndarray, risk: np.ndarray, budget: float = 0.2,
                   lean_cut: float = 23.0) -> dict[str, float]:
    """Screen the top `budget` fraction by `risk`. Returns the share of all cases and of lean cases caught.

    For the BMI rule pass risk = bmi: it flags the heaviest people, so it can never catch a lean case.
    Exactly round(budget * n) people are flagged; ties (coarse scores such as IDRS, which moves in steps of 10)
    are broken at random with a fixed seed, so a tied score cannot quietly flag more than the budget.
    """
    n = len(risk)
    k = int(round(budget * n))
    tiebreak = np.random.default_rng(0).random(n)
    order = np.lexsort((tiebreak, -np.asarray(risk, float)))  # highest risk first
    flagged = np.zeros(n, bool)
    flagged[order[:k]] = True
    cases = y == 1
    lean_cases = cases & (bmi < lean_cut)
    return {
        "case_capture": float((flagged & cases).sum() / max(cases.sum(), 1)),
        "lean_case_capture": float((flagged & lean_cases).sum() / max(lean_cases.sum(), 1)),
        "lean_case_share": float(lean_cases.sum() / max(cases.sum(), 1)),
    }


def calibration_curve(y: np.ndarray, p: np.ndarray, bins: int = 10) -> tuple[np.ndarray, np.ndarray]:
    edges = np.quantile(p, np.linspace(0, 1, bins + 1))
    idx = np.clip(np.searchsorted(edges, p, side="right") - 1, 0, bins - 1)
    pred = np.array([p[idx == b].mean() if (idx == b).any() else np.nan for b in range(bins)])
    obs = np.array([y[idx == b].mean() if (idx == b).any() else np.nan for b in range(bins)])
    return pred, obs
