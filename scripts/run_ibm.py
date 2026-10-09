"""E7 on real IBM quantum hardware: sample the trained QAOA circuits on an IBM device.

Needs your own free IBM Quantum account (Open Plan: 10 minutes of QPU time per 28 days).
Save your API key once, outside this repo:

    python -c "from qiskit_ibm_runtime import QiskitRuntimeService as S; \
        S.save_account(channel='ibm_quantum_platform', token='<YOUR KEY>', set_as_default=True)"

Then run (after `python scripts/run_experiments.py E7`):

    python scripts/run_ibm.py --backend ibm_kingston --depths 1 2 --shots 4000

The script submits one job holding all circuits (3 problems x 2 formulations x len(depths)), waits, writes
results/e7_hardware.json, which make_figures.py adds to the E7 figure. Typical QPU usage: well under a minute.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import numpy as np  # noqa: E402

from qgenomix.config import load_config  # noqa: E402
from qgenomix.search.qaoa import SelectionProblem, counts_to_probs, evaluate, qiskit_circuit  # noqa: E402
from qgenomix.utils import load_json, save_json  # noqa: E402

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--backend", default="ibm_kingston")
    ap.add_argument("--depths", type=int, nargs="+", default=[1, 2])
    ap.add_argument("--formulations", nargs="+", default=["penalty", "xy"])
    ap.add_argument("--shots", type=int, default=4000)
    args = ap.parse_args()
    from qiskit.transpiler import generate_preset_pass_manager
    from qiskit_ibm_runtime import QiskitRuntimeService, SamplerV2

    cfg = load_config()
    res_dir = cfg.path("results")
    e7 = load_json(res_dir / "e7_qaoa.json")
    service = QiskitRuntimeService()
    backend = service.backend(args.backend)
    pm = generate_preset_pass_manager(optimization_level=3, backend=backend, seed_transpiler=0)
    meta, circuits = [], []
    for prob_json in e7["problems"]:
        d = np.load(res_dir / f"e7_problem{prob_json['block']}.npz")
        prob = SelectionProblem(r=d["r"], R=d["R"], k=int(d["k"]), lam=float(d["lam"]))
        for row in prob_json["runs"]:
            if row["depth"] in args.depths and row["formulation"] in args.formulations:
                circuits.append(pm.run(qiskit_circuit(prob, row["formulation"], np.array(row["params"]))))
                meta.append((prob_json["block"], row["formulation"], row["depth"], prob))
    print(f"submitting {len(circuits)} circuits to {backend.name} ...")
    job = SamplerV2(mode=backend).run(circuits, shots=args.shots)
    print("job id:", job.job_id())
    t0 = time.time()
    result = job.result()
    out = []
    for (block, form, depth, prob), pub in zip(meta, result, strict=True):
        p = counts_to_probs(pub.data.meas.get_counts(), prob.n)
        ev = evaluate(prob, p)
        out.append({"block": block, "formulation": form, "depth": depth, **ev,
                    "probs": p.tolist() if (block == 0 and depth == 2) else None})
        print(f"block {block} {form:7s} p={depth}: AR {ev['approx_ratio']:.3f}  P(opt) {ev['p_optimal']:.3f}  "
              f"P(feasible) {ev['p_feasible']:.3f}")
    save_json({"backend": backend.name, "job_id": job.job_id(), "shots": args.shots, "results": out,
               "usage": job.metrics().get("usage", {}), "wall_seconds": time.time() - t0},
              res_dir / "e7_hardware.json")
