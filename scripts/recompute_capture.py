"""Recompute screening-capture metrics in results/e1_seed*.json from the saved test predictions.

Needed once after the tie-handling fix in qgenomix.eval.metrics.screen_capture; new E1 runs already use it.

    python scripts/recompute_capture.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import numpy as np  # noqa: E402

from qgenomix.config import load_config  # noqa: E402
from qgenomix.eval.metrics import screen_capture  # noqa: E402

if __name__ == "__main__":
    cfg = load_config()
    for js in sorted((ROOT / "results").glob("e1_seed*.json")):
        seed = js.stem.replace("e1_seed", "")
        d = np.load(ROOT / "results" / f"e1_preds_seed{seed}.npz")
        res = json.loads(js.read_text())
        for name in res["metrics"]:
            if f"p_{name}" in d:
                res["metrics"][name] |= screen_capture(d["y"], d["bmi"], d[f"p_{name}"], cfg["eval"]["screen_budget"],
                                                       cfg["eval"]["lean_bmi"])
        js.write_text(json.dumps(res, indent=2))
        print("updated", js.name)
