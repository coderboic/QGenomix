"""Quantum fidelity kernel k(x, x') = |<psi(x)|psi(x')>|^2 and the QSVC built on it.

On a simulator we can compute each person's 256-amplitude state once; the whole kernel matrix is then one
complex matrix product. On hardware each entry would need its own circuit (a swap or inversion test),
which is why the kernel route scales poorly and is trained on a subsample.
"""

from __future__ import annotations

import numpy as np
from sklearn.svm import SVC


def fidelity_kernel(SA: np.ndarray, SB: np.ndarray) -> np.ndarray:
    return np.abs(SA @ SB.conj().T) ** 2


class QSVC:
    def __init__(self, C: float = 1.0, max_train: int = 3000, seed: int = 0):
        self.C, self.max_train, self.seed = C, max_train, seed

    def fit(self, S: np.ndarray, y: np.ndarray) -> QSVC:
        rng = np.random.default_rng(self.seed)
        idx = np.arange(len(y))
        if len(y) > self.max_train:  # stratified subsample keeps the case fraction
            cases, ctrls = idx[y == 1], idx[y == 0]
            n_case = int(round(self.max_train * len(cases) / len(y)))
            idx = np.concatenate([rng.choice(cases, n_case, replace=False),
                                  rng.choice(ctrls, self.max_train - n_case, replace=False)])
        self.S_train = S[idx]
        K = fidelity_kernel(self.S_train, self.S_train)
        self.svc = SVC(C=self.C, kernel="precomputed", class_weight="balanced", probability=True,
                       random_state=self.seed).fit(K, y[idx])
        return self

    def predict_proba(self, S: np.ndarray) -> np.ndarray:
        return self.svc.predict_proba(fidelity_kernel(S, self.S_train))[:, 1]
