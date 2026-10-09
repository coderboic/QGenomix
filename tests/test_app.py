from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from qgenomix.app.parser import GenotypeFileError, allele_dosage, read_genotype_file, to_23andme
from qgenomix.config import ROOT


def _calls(n=2000, rng=None):
    rng = rng or np.random.default_rng(0)
    letters = np.array(list("ACGT"))
    return pd.DataFrame({"rsid": [f"rs{i}" for i in range(n)], "chr": "1", "pos": np.arange(1, n + 1) * 100,
                         "a1": letters[rng.integers(0, 4, n)], "a2": letters[rng.integers(0, 4, n)]})


def test_roundtrip_and_dosage():
    calls = _calls()
    parsed = read_genotype_file(to_23andme(calls))
    assert len(parsed) == len(calls)
    targets = pd.DataFrame({"chr": ["1", "1", "9"], "pos": [100, 200, 5], "alt": [calls.a1[0], "N", "A"]})
    d, obs = allele_dosage(parsed, targets, "alt")
    assert obs.tolist() == [True, True, False]
    assert d[0] >= 1 and d[1] == 0


def test_missing_calls_and_bad_files_are_rejected():
    calls = _calls()
    calls.loc[:10, "a1"] = "-"
    text = to_23andme(calls).replace("\t-", "\t-")
    assert len(read_genotype_file(text)) == len(calls) - 11
    with pytest.raises(GenotypeFileError):
        read_genotype_file("rs1\t1\t100\tAG\n")


@pytest.mark.skipif(not (ROOT / "bundle" / "model.joblib").exists(), reason="bundle not built")
def test_api_profile_on_persona():
    from fastapi.testclient import TestClient

    from qgenomix.app.api import app

    persona = ROOT / "data" / "personas" / "asha_lean_high.txt"
    if not persona.exists():
        pytest.skip("personas not generated")
    client = TestClient(app)
    with open(persona, "rb") as fh:
        r = client.post("/v1/profile", files={"genotype": ("p.txt", fh, "text/plain")},
                        data={"age": 34, "sex": "F", "bmi": 21.6, "waist_cm": 84, "activity": 2, "family_history": 1})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["lean"] is True
    assert body["coverage"]["mechanism_snps"] > 0.95
    assert set(body["mechanisms"]) >= {"beta_cell", "lipodystrophy"}
    assert body["idrs"]["score"] == 0 + 10 + 20 + 10  # age 34, waist 84 (F), mild activity, one parent
    assert body["what_if"] and all(w["risk_probability"] <= body["risk_probability"] + 1e-9 for w in body["what_if"])
    bad = client.post("/v1/profile", files={"genotype": ("x.txt", b"rs1 1 1 AA\n", "text/plain")},
                      data={"age": 30, "sex": "M", "bmi": 22, "waist_cm": 85})
    assert bad.status_code == 422
    with open(persona, "rb") as fh:
        assert client.post("/v1/profile", files={"genotype": ("p.txt", fh, "text/plain")},
                           data={"age": 30, "sex": "M", "bmi": 22, "waist_cm": 85, "activity": 7}).status_code == 422
    assert Path(persona).exists()


def test_duplicate_positions_and_allele_mismatch_are_handled():
    calls = _calls()
    calls.loc[0, ["a1", "a2"]] = ["A", "G"]
    dup = pd.concat([calls, calls.iloc[:50].assign(a1="T", a2="T")], ignore_index=True)  # repeated positions
    parsed = read_genotype_file(to_23andme(dup))
    assert len(parsed) == len(calls)                      # first call per position kept
    targets = pd.DataFrame({"chr": ["1", "1"], "pos": [100, 100 * 2], "alt": ["G", "N"], "ref": ["A", "M"]})
    d, obs = allele_dosage(parsed, targets, "alt", "ref")
    assert obs[0] and d[0] == 1.0                         # AG at an A/G site: one copy of G
    assert not obs[1] and d[1] == 0.0                     # alleles that do not match the site: missing


@pytest.mark.skipif(not (ROOT / "bundle" / "model.joblib").exists(), reason="bundle not built")
def test_service_accepts_chip_coverage_with_warning_and_rejects_wrong_build():
    from qgenomix.app.service import Form, ProfileService

    persona = ROOT / "data" / "personas" / "meera_low.txt"
    if not persona.exists():
        pytest.skip("personas not generated")
    lines = persona.read_text().splitlines()
    head, body = [x for x in lines if x.startswith("#")], [x for x in lines if not x.startswith("#")]
    rng = np.random.default_rng(0)
    chip = "\n".join(head + [b for b in body if rng.random() < 0.45])
    svc = ProfileService(str(ROOT / "bundle"))
    r = svc.profile(chip.encode(), Form(age=29, sex="F", bmi=22.4, waist_cm=74))
    assert r["coverage"]["low"] and 0.35 < r["coverage"]["prs_variants"] < 0.55
    shifted = "\n".join(f"{b.split()[0]}\t{b.split()[1]}\t{int(b.split()[2]) + 1_000_003}\t{b.split()[3]}"
                        for b in body[:200000])
    with pytest.raises(ValueError, match="GRCh37"):
        svc.profile(shifted.encode(), Form(age=29, sex="F", bmi=22.4, waist_cm=74))
