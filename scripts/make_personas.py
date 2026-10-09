"""Generate the three synthetic demo personas (23andMe-style genotype files) into data/personas/.

    python scripts/make_personas.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from qgenomix.app.personas import make_personas  # noqa: E402
from qgenomix.config import load_config  # noqa: E402
from qgenomix.utils import setup_logging  # noqa: E402

if __name__ == "__main__":
    setup_logging()
    for name, p in make_personas(load_config()).items():
        print(name, p["title"], {k: round(v) for k, v in p["percentiles"].items()})
