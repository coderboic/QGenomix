"""E7 on real IBM quantum hardware: sample the trained QAOA circuits on an IBM device.

Needs your own free IBM Quantum account (Open Plan: 10 minutes of QPU time per 28 days).
Save your API key once, outside this repo:

    python -c "from qiskit_ibm_runtime import QiskitRuntimeService as S; \
        S.save_account(channel='ibm_quantum_platform', token='<YOUR KEY>', set_as_default=True)"

Then run (after `python scripts/run_experiments.py E7`):

    python scripts/run_ibm.py --backend ibm_kingston --depths 1 2 --shots 4000

Rehearse locally first, with no account and no QPU time (IBM Kingston noise model on your laptop):

    python scripts/run_ibm.py --backend fake_kingston --blocks 0 --depths 1 --shots 1000

The script submits one job holding every circuit, waits, and writes results/e7_hardware.json, which
make_figures.py adds to the E7 and E7b figures. With --mitigate (the default) each QAOA circuit is sent at noise
scales 1, 3 and 5 plus two readout-calibration circuits, the job uses dynamical decoupling and gate twirling,
and the same analysis as E7b (readout correction, post-selection, zero-noise extrapolation) is applied.
Typical QPU usage: one to two minutes for 3 problems x 2 formulations x 2 depths.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import numpy as np  # noqa: E402

from qgenomix.config import load_config  # noqa: E402
from qgenomix.search.mitigation import analyse, prepare  # noqa: E402
from qgenomix.search.qaoa import SelectionProblem, counts_to_probs, evaluate, qiskit_circuit  # noqa: E402
from qgenomix.utils import load_json, save_json  # noqa: E402

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--backend", default="ibm_kingston")
    ap.add_argument("--depths", type=int, nargs="+", default=[1, 2])
    ap.add_argument("--formulations", nargs="+", default=["penalty", "xy"])
    ap.add_argument("--blocks", type=int, nargs="+", default=[0, 1, 2], help="which E7 sub-problems to run")
    ap.add_argument("--shots", type=int, default=4000)
    ap.add_argument("--no-mitigate", dest="mitigate", action="store_false",
                    help="send only the plain circuits (no folding, calibration, decoupling or twirling)")
    args = ap.parse_args()
    from qiskit.transpiler import generate_preset_pass_manager
    from qiskit_ibm_runtime import QiskitRuntimeService, SamplerV2

    cfg = load_config()
    res_dir = cfg.path("results")
    e7 = load_json(res_dir / "e7_qaoa.json")
    if args.backend.startswith("fake_"):  # local rehearsal on a noise model; results go to a separate file
        from qiskit_ibm_runtime import fake_provider

        backend = getattr(fake_provider, "Fake" + args.backend[5:].capitalize())()
    else:
        backend = QiskitRuntimeService().backend(args.backend)
    pm = generate_preset_pass_manager(optimization_level=3, backend=backend, seed_transpiler=0)
    meta, circuits = [], []
    for prob_json in [p for p in e7["problems"] if p["block"] in args.blocks]:
        d = np.load(res_dir / f"e7_problem{prob_json['block']}.npz")
        prob = SelectionProblem(r=d["r"], R=d["R"], k=int(d["k"]), lam=float(d["lam"]))
        for row in prob_json["runs"]:
            if row["depth"] in args.depths and row["formulation"] in args.formulations:
                params = np.array(row["params"])
                if args.mitigate:
                    circs, ctx = prepare(prob, row["formulation"], params, backend, seed=prob_json["block"])
                else:
                    circs, ctx = [pm.run(qiskit_circuit(prob, row["formulation"], params))], None
                meta.append((prob_json["block"], row["formulation"], row["depth"], prob, ctx, len(circs),
                             row["ideal"]["approx_ratio"]))
                circuits += circs
    options = {"dynamical_decoupling": {"enable": True, "sequence_type": "XpXm"},
               "twirling": {"enable_gates": True, "enable_measure": False}} if args.mitigate else {}
    print(f"submitting {len(circuits)} circuits to {backend.name} ...")
    job = SamplerV2(mode=backend, options=options).run(circuits, shots=args.shots)
    print("job id:", job.job_id())
    t0 = time.time()
    result = list(job.result())
    out, i = [], 0
    for block, form, depth, prob, ctx, k, ideal in meta:
        counts = [pub.data.meas.get_counts() for pub in result[i:i + k]]
        i += k
        if ctx is not None:
            ev = analyse(prob, ctx, counts)
            print(f"block {block} {form:7s} p={depth}: ideal {ideal:.3f}  raw {ev['raw']:.3f}  "
                  f"mitigated {ev['readout_postselect_zne']:.3f}")
        else:
            ev = evaluate(prob, counts_to_probs(counts[0], prob.n))
            print(f"block {block} {form:7s} p={depth}: AR {ev['approx_ratio']:.3f}  P(feasible) {ev['p_feasible']:.3f}")
        out.append({"block": block, "formulation": form, "depth": depth, "ideal": ideal, **ev})
    usage = job.metrics().get("usage", {}) if hasattr(job, "metrics") else {}
    name = "e7_hardware_rehearsal.json" if args.backend.startswith("fake_") else "e7_hardware.json"
    save_json({"backend": backend.name, "job_id": job.job_id(), "shots": args.shots, "mitigated": args.mitigate,
               "results": out, "usage": usage, "wall_seconds": time.time() - t0}, res_dir / name)
    print("wrote", res_dir / name)
