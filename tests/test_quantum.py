import numpy as np
import torch

from qgenomix.quantum.circuit import FastSimulator, pennylane_circuit
from qgenomix.quantum.encoder import encode, pack_pairs, train_encoder
from qgenomix.quantum.kernel import fidelity_kernel


def test_fast_simulator_matches_pennylane():
    torch.manual_seed(0)
    for entangle in (True, False):
        W = torch.randn(3, 8, 2)
        x = torch.randint(0, 3, (32, 8)).float()
        ref = torch.stack(pennylane_circuit(entangle)(x.double(), W.double()), 1).float()
        assert torch.allclose(FastSimulator(entangle)(x, W), ref, atol=1e-5)


def test_without_entanglement_each_qubit_sees_only_its_own_snp():
    torch.manual_seed(1)
    W = torch.randn(4, 8, 2)
    sim = FastSimulator(entangle=False)
    x = torch.zeros(3, 8)
    x[1, 1] = 2.0  # change only wire 1 (the partner SNP of wire 0)
    x[2, 0] = 2.0  # change wire 0 itself
    out = sim(x, W)
    assert torch.allclose(out[0, 0], out[1, 0])        # wire 0 blind to its partner
    assert not torch.allclose(out[0, 0], out[2, 0])
    out_ent = FastSimulator(entangle=True)(x, W)
    assert not torch.allclose(out_ent[0, 0], out_ent[1, 0])  # with CZs it can see it


def test_states_are_normalised_and_kernel_is_psd():
    W = torch.randn(2, 8, 2)
    x = torch.randint(0, 3, (20, 8)).float()
    S = FastSimulator(True).states(x, W).numpy()
    assert np.allclose(np.linalg.norm(S, axis=1), 1, atol=1e-5)
    K = fidelity_kernel(S, S)
    assert np.allclose(np.diag(K), 1, atol=1e-5)
    assert np.linalg.eigvalsh(K).min() > -1e-5


def test_encoder_learns_a_planted_interaction(rng):
    n = 3000
    G = rng.binomial(2, 0.35, size=(n, 8)).astype(np.float32)
    Gc = G - G.mean(0)
    eta = -2.0 + 1.2 * Gc[:, 0] * Gc[:, 1]
    y = rng.binomial(1, 1 / (1 + np.exp(-eta)))
    pairs = np.array([[0, 1], [2, 3], [4, 5], [6, 7]])
    X = pack_pairs(G, pairs)
    assert X.shape == (n, 1, 8)
    model, log = train_encoder("vqc", X, None, y, layers=3, epochs=8, lr=0.05, seed=0)
    assert log.losses[-1] < log.losses[0]
    assert encode(model, X).shape == (n, 8)
    assert log.n_params == 3 * 8 * 2
