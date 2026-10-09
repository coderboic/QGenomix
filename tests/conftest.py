import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from qgenomix.config import load_config  # noqa: E402
from qgenomix.data.cohort import toy_cohort  # noqa: E402


@pytest.fixture
def rng():
    return np.random.default_rng(7)


@pytest.fixture
def cfg():
    return load_config()


@pytest.fixture
def toy(rng):
    return toy_cohort(3000, rng)
