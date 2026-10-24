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
def test_service_imputes_chip_files_and_rejects_wrong_build():
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
    cov = r["coverage"]
    assert 0.35 < cov["prs_variants"] < 0.55
    if cov["imputation"] == "ld":   # LD imputation fills most gaps from correlated measured variants
        assert cov["prs_effective"] > 0.75 and not cov["low"]
    else:                           # mean filling: the report must warn
        assert cov["low"]
    shifted = "\n".join(f"{b.split()[0]}\t{b.split()[1]}\t{int(b.split()[2]) + 1_000_003}\t{b.split()[3]}"
                        for b in body[:200000])
    with pytest.raises(ValueError, match="GRCh37"):
        svc.profile(shifted.encode(), Form(age=29, sex="F", bmi=22.4, waist_cm=74))


@pytest.mark.skipif(not (ROOT / "bundle" / "model.joblib").exists(), reason="bundle not built")
def test_pdf_report_endpoint():
    from fastapi.testclient import TestClient

    from qgenomix.app.api import app

    persona = ROOT / "data" / "personas" / "ravi_obese_high.txt"
    if not persona.exists():
        pytest.skip("personas not generated")
    with open(persona, "rb") as fh:
        r = TestClient(app).post("/v1/report.pdf", files={"genotype": ("p.txt", fh, "text/plain")},
                                 data={"age": 45, "sex": "M", "bmi": 29.8, "waist_cm": 102, "activity": 3,
                                       "family_history": 2})
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert r.content[:5] == b"%PDF-" and len(r.content) > 10_000


def test_pdf_renders_from_a_report_dict():
    from qgenomix.app.pdf import render_report
    from qgenomix.app.service import Form

    pct = {"beta_cell": 96.0, "lipodystrophy": 88.0, "obesity": 24.0, "liver_lipid": 4.0, "proinsulin": 0.4}
    mech = {c: {"label": c, "percentile": p} for c, p in pct.items()}
    report = {
        "risk_probability": 0.23, "risk_percentile": 84.0, "risk_tier": "high", "lean": True,
        "missed_by_bmi_screening": True, "missed_by_idrs": True, "idrs": {"score": 40, "category": "moderate"},
        "mechanisms": mech, "combination_flag": True, "prs_percentile": 91.0,
        "what_if": [{"change": "Regular vigorous exercise", "risk_probability": 0.15, "relative_change": -0.38}],
        "top_pairs": [{"snp1": "rs1", "snp2": "rs2", "cluster1": "beta_cell", "cluster2": "lipodystrophy",
                       "dosage1": 2.0, "dosage2": 1.0, "importance": 0.25}],
        "advice": ["Ask a doctor about a fasting glucose or HbA1c test (≥ 6.5% means diabetes)."],
        "coverage": {"prs_variants": 0.45, "prs_effective": 0.85, "imputation": "ld", "mechanism_snps": 0.4,
                     "n_calls": 655090, "low": False},
        "model_version": "2.2+test",
    }
    pdf = render_report(report, Form(age=34, sex="F", bmi=21.6, waist_cm=84, activity=2, family_history=1), "Test")
    assert pdf[:5] == b"%PDF-" and len(pdf) > 5_000
