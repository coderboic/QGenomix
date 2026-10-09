"""Model definitions for the benchmark (M1 to M12).

Every model maps (train matrix, train labels, test matrix) to a risk score for the test rows.
"""

from __future__ import annotations

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from xgboost import XGBClassifier

MODEL_INFO = {
    "M0_idrs": "Indian Diabetes Risk Score (age, waist, activity, family history): India's screening tool",
    "M1_bmi": "BMI rule: risk = BMI",
    "M2_prs": "D-PRISM multi-ancestry PRS (5 components), logistic regression",
    "M3c_clinical": "Clinical factors only (age, sex, BMI, waist, activity, family history), logistic regression",
    "M3_additive": "Clinical factors + PRS + 5 mechanism scores, logistic regression (best additive model)",
    "M4_rf": "Random forest on additive features + 62 mechanism SNPs",
    "M5_svm": "RBF support vector machine on the same inputs",
    "M6_xgb": "XGBoost on the same inputs",
    "M7_xgb_pairs": "XGBoost + explicit products of the K selected pairs (classical interaction model)",
    "M8_xgb_twin": "XGBoost + classical-twin encoder features",
    "M9_xgb_noent": "XGBoost + VQC features without entanglement",
    "M10_xgb_vqc": "XGBoost + VQC features (entangled)",
    "H_twin": "Classical twin encoder with its own linear head",
    "H_noent": "VQC without entanglement, own linear head",
    "H_vqc": "VQC (entangled), own linear head",
    "M11_qsvc": "Quantum fidelity-kernel SVC on the top circuit",
    "M12_stack": "QGenomix stack: logistic regression on M3, M10, M11 out-of-fold scores",
}


def fit_lr(Xtr, ytr, Xte, C: float = 1.0):
    sc = StandardScaler().fit(Xtr)
    m = LogisticRegression(C=C, max_iter=3000).fit(sc.transform(Xtr), ytr)
    return m.predict_proba(sc.transform(Xte))[:, 1]


def fit_rf(Xtr, ytr, Xte, seed: int = 0):
    m = RandomForestClassifier(n_estimators=300, min_samples_leaf=20, max_features="sqrt",
                               class_weight="balanced_subsample", n_jobs=8, random_state=seed)
    return m.fit(Xtr, ytr).predict_proba(Xte)[:, 1]


def fit_svm(Xtr, ytr, Xte, seed: int = 0, max_train: int = 6000):
    rng = np.random.default_rng(seed)
    idx = np.arange(len(ytr)) if len(ytr) <= max_train else rng.choice(len(ytr), max_train, replace=False)
    sc = StandardScaler().fit(Xtr[idx])
    m = SVC(C=1.0, gamma="scale", class_weight="balanced").fit(sc.transform(Xtr[idx]), ytr[idx])
    return 1 / (1 + np.exp(-m.decision_function(sc.transform(Xte))))  # monotone squashing; AUC unaffected


def make_xgb(params: dict, ytr: np.ndarray, seed: int = 0) -> XGBClassifier:
    spw = float((ytr == 0).sum() / max((ytr == 1).sum(), 1))
    return XGBClassifier(**params, scale_pos_weight=spw, eval_metric="logloss", tree_method="hist", n_jobs=8,
                         random_state=seed, verbosity=0)


def fit_xgb(Xtr, ytr, Xte, params: dict, seed: int = 0, return_model: bool = False):
    m = make_xgb(params, ytr, seed).fit(Xtr, ytr)
    p = m.predict_proba(Xte)[:, 1]
    return (p, m) if return_model else p


def logit(p: np.ndarray) -> np.ndarray:
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))
