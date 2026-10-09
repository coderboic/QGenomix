"""Trainable pair encoders: the VQC (entangled or not) and its same-size classical twin.

Input  X: (n, n_circuits, 8) dosages; circuit c holds selected pairs 4c..4c+3.
Output features: (n, n_circuits * 8).

Training objective ("residual" training): the encoder output feeds a linear head together with the
additive covariates (PRS components, BMI, mechanism scores), so the encoder is pushed to learn only the
signal those additive terms cannot explain, which is the interaction signal we are looking for.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import torch

from qgenomix.quantum.circuit import N_QUBITS, PAIRS_PER_CIRCUIT, FastSimulator

VARIANTS = ("vqc", "vqc_noent", "twin")


def pack_pairs(G: np.ndarray, pairs: np.ndarray) -> np.ndarray:
    """Arrange selected pairs into circuits: (n, n_circuits, 8). Pads the last circuit with zeros."""
    n = G.shape[0]
    n_circ = int(np.ceil(len(pairs) / PAIRS_PER_CIRCUIT))
    X = np.zeros((n, n_circ * PAIRS_PER_CIRCUIT, 2), dtype=np.float32)
    X[:, : len(pairs), 0] = G[:, pairs[:, 0]]
    X[:, : len(pairs), 1] = G[:, pairs[:, 1]]
    return X.reshape(n, n_circ, N_QUBITS)


class TwinCell(torch.nn.Module):
    """Classical stand-in for one circuit: 8 -> h -> 8 with tanh, weights shared across circuits."""

    def __init__(self, hidden: int = 6):
        super().__init__()
        self.net = torch.nn.Sequential(torch.nn.Linear(N_QUBITS, hidden), torch.nn.Tanh(),
                                       torch.nn.Linear(hidden, N_QUBITS), torch.nn.Tanh())

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x - 1.0)  # centre dosages around 1


class PairEncoder(torch.nn.Module):
    def __init__(self, variant: str, n_circuits: int, n_covars: int, layers: int = 4, twin_hidden: int = 6):
        super().__init__()
        assert variant in VARIANTS
        self.variant, self.n_circuits = variant, n_circuits
        if variant == "twin":
            self.cell = TwinCell(twin_hidden)
        else:
            self.W = torch.nn.Parameter(0.1 * torch.randn(layers, N_QUBITS, 2))
            self.sim = FastSimulator(entangle=(variant == "vqc"))
        self.head = torch.nn.Linear(n_circuits * N_QUBITS, 1)
        self.cov = torch.nn.Linear(n_covars, 1, bias=False) if n_covars else None

    def n_encoder_params(self) -> int:
        mod = self.cell if self.variant == "twin" else None
        return sum(p.numel() for p in mod.parameters()) if mod is not None else self.W.numel()

    def features(self, X: torch.Tensor) -> torch.Tensor:
        n = X.shape[0]
        flat = X.reshape(n * self.n_circuits, N_QUBITS)
        out = self.cell(flat) if self.variant == "twin" else self.sim(flat, self.W)
        return out.reshape(n, self.n_circuits * N_QUBITS)

    def forward(self, X: torch.Tensor, C: torch.Tensor | None) -> torch.Tensor:
        logit = self.head(self.features(X)).squeeze(-1)
        if self.cov is not None and C is not None:
            logit = logit + self.cov(C).squeeze(-1)
        return logit


@dataclass
class TrainLog:
    losses: list[float]
    n_params: int


def train_encoder(variant: str, X: np.ndarray, C: np.ndarray | None, y: np.ndarray, layers: int = 4,
                  epochs: int = 12, lr: float = 0.03, batch: int = 128, twin_hidden: int = 6,
                  seed: int = 0, threads: int = 8) -> tuple[PairEncoder, TrainLog]:
    torch.manual_seed(seed)
    torch.set_num_threads(threads)
    n_cov = 0 if C is None else C.shape[1]
    model = PairEncoder(variant, X.shape[1], n_cov, layers, twin_hidden)
    Xt = torch.tensor(X, dtype=torch.float32)
    Ct = None if C is None else torch.tensor(C, dtype=torch.float32)
    yt = torch.tensor(y, dtype=torch.float32)
    pos_weight = torch.tensor((1 - y.mean()) / max(y.mean(), 1e-6))
    loss_fn = torch.nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=epochs)
    g = torch.Generator().manual_seed(seed)
    losses = []
    for _ in range(epochs):
        perm = torch.randperm(len(yt), generator=g)
        total = 0.0
        for start in range(0, len(yt), batch):
            idx = perm[start:start + batch]
            opt.zero_grad()
            loss = loss_fn(model(Xt[idx], None if Ct is None else Ct[idx]), yt[idx])
            loss.backward()
            opt.step()
            total += float(loss.detach()) * len(idx)
        sched.step()
        losses.append(total / len(yt))
    return model, TrainLog(losses, model.n_encoder_params())


@torch.no_grad()
def encode(model: PairEncoder, X: np.ndarray, chunk: int = 4096) -> np.ndarray:
    model.eval()
    Xt = torch.tensor(X, dtype=torch.float32)
    return torch.cat([model.features(Xt[i:i + chunk]) for i in range(0, len(Xt), chunk)]).numpy()


@torch.no_grad()
def circuit_states(model: PairEncoder, X_circuit: np.ndarray) -> np.ndarray:
    """256-amplitude states of one circuit for every person (for the fidelity kernel)."""
    assert model.variant != "twin"
    return model.sim.states(torch.tensor(X_circuit, dtype=torch.float32), model.W).numpy()
