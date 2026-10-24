"""Build the LD imputation panel used by the app for partial consumer DNA files.

    python scripts/build_impute_panel.py      (needs data/processed from `make data`; about 2 minutes)
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from qgenomix.app.bundle import build_impute_panel  # noqa: E402
from qgenomix.config import load_config  # noqa: E402
from qgenomix.utils import setup_logging  # noqa: E402

if __name__ == "__main__":
    setup_logging()
    build_impute_panel(load_config("configs/main.yaml"))
