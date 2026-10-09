"""The QGenomix pair circuit: 8 qubits carry 4 SNP pairs (pair k on wires 2k and 2k+1).

Each of L layers does, on every wire w,
    RY(pi * g_w / 2)      data re-uploading: dosage 0, 1, 2 -> angle 0, pi/2, pi
    RY(theta_lw) RZ(phi_lw)  trainable rotation (weights shared by every circuit)
followed by CZ gates inside each pair (0-1, 2-3, 4-5, 6-7) and between neighbouring pairs (1-2, 3-4, 5-6).
The readout is <Z_w> on all 8 wires, so one circuit gives 8 features.

Two implementations that must agree to numerical precision (see tests/test_quantum.py):
  pennylane_circuit()   the reference, written with PennyLane gates; used for drawing and verification
  FastSimulator         a batched PyTorch state-vector simulator specialised to this circuit; used for training

Why the fast path is exact: RY(a) RY(b) = RY(a + b), so the data rotation and the trainable RY fuse into
one gate, and the seven CZs are all diagonal, so together they are one fixed +-1 phase vector over the
256 basis states. A layer is therefore 8 batched 2x2 gates and one element-wise multiply.

Without the CZs the state stays a product state and <Z_w> depends on g_w alone: no qubit can "see" its
partner SNP. Entanglement is the only thing that lets a measured feature depend on both SNPs of a pair.
"""

from __future__ import annotations

import math

import numpy as np
import torch

N_QUBITS = 8
PAIRS_PER_CIRCUIT = N_QUBITS // 2
CZ_EDGES = [(0, 1), (2, 3), (4, 5), (6, 7), (1, 2), (3, 4), (5, 6)]


def _bits() -> np.ndarray:
    k = np.arange(2**N_QUBITS)
    return np.stack([(k >> (N_QUBITS - 1 - w)) & 1 for w in range(N_QUBITS)], axis=1)  # wire 0 = MSB


def cz_phase(edges=CZ_EDGES) -> np.ndarray:
    b = _bits()
    phase = np.ones(2**N_QUBITS)
    for i, j in edges:
        phase *= np.where((b[:, i] == 1) & (b[:, j] == 1), -1.0, 1.0)
    return phase


class FastSimulator(torch.nn.Module):
    """Batched simulator for the pair circuit. forward(x, W) -> <Z_w>, shape (batch, 8)."""

    def __init__(self, entangle: bool = True):
        super().__init__()
        self.entangle = entangle
        self.register_buffer("phase", torch.tensor(cz_phase(), dtype=torch.complex64))
        self.register_buffer("zsign", torch.tensor(1 - 2 * _bits(), dtype=torch.float32))  # (256, 8)

    def states(self, x: torch.Tensor, W: torch.Tensor) -> torch.Tensor:
        B = x.shape[0]
        psi = torch.zeros(B, 2**N_QUBITS, dtype=torch.complex64, device=x.device)
        psi[:, 0] = 1.0
        for layer in range(W.shape[0]):
            theta = math.pi * x / 2 + W[layer, :, 0]          # (B, 8) fused RY angle
            phi = W[layer, :, 1].expand(B, N_QUBITS)          # (B, 8) RZ angle
            c, s = torch.cos(theta / 2), torch.sin(theta / 2)
            em, ep = torch.exp(-0.5j * phi), torch.exp(0.5j * phi)
            U = torch.stack([torch.stack([em * c, -em * s], -1), torch.stack([ep * s, ep * c], -1)], -2)  # (B,8,2,2)
            for w in range(N_QUBITS):
                v = psi.view(B, 2**w, 2, 2 ** (N_QUBITS - 1 - w))
                psi = torch.einsum("bij,bajc->baic", U[:, w], v).reshape(B, -1)
            if self.entangle:
                psi = psi * self.phase
        return psi

    def forward(self, x: torch.Tensor, W: torch.Tensor) -> torch.Tensor:
        psi = self.states(x, W)
        return (psi.real**2 + psi.imag**2) @ self.zsign


def pennylane_circuit(entangle: bool = True, state: bool = False):
    """Reference QNode with the same gates. Call as f(x, W) with x (batch, 8) dosages."""
    import pennylane as qml

    dev = qml.device("default.qubit", wires=N_QUBITS)

    @qml.qnode(dev, interface="torch")
    def circuit(x, W):
        for layer in range(W.shape[0]):
            qml.AngleEmbedding(math.pi * x / 2, wires=range(N_QUBITS), rotation="Y")
            for w in range(N_QUBITS):
                qml.RY(W[layer, w, 0], wires=w)
                qml.RZ(W[layer, w, 1], wires=w)
            if entangle:
                for i, j in CZ_EDGES:
                    qml.CZ(wires=[i, j])
        if state:
            return qml.state()
        return [qml.expval(qml.PauliZ(w)) for w in range(N_QUBITS)]

    return circuit


def draw(path: str, layers: int = 2) -> None:
    """Save a matplotlib drawing of the circuit (example input, random weights)."""
    import matplotlib

    matplotlib.use("Agg")
    import pennylane as qml

    circ = pennylane_circuit(entangle=True)
    x = torch.tensor([[2.0, 1.0, 0.0, 1.0, 1.0, 2.0, 0.0, 0.0]])
    W = 0.3 * torch.ones(layers, N_QUBITS, 2)
    fig, _ = qml.draw_mpl(circ, decimals=1, style="pennylane")(x, W)
    fig.savefig(path, dpi=160, bbox_inches="tight")
