"""FastAPI backend.

    uvicorn qgenomix.app.api:app --port 8000        (run from the repo root with src/ on PYTHONPATH)

POST /v1/profile     multipart form: genotype (file), age, sex, bmi, waist_cm, activity (0 vigorous .. 3 sedentary),
                     family_history (0 none, 1 one parent, 2 both parents)  ->  report JSON with IDRS and what-ifs
POST /v1/report.pdf  same form  ->  the report as a one-page PDF
GET  /v1/personas  the three synthetic demo personas
GET  /v1/health
Uploaded files are processed in memory and never written to disk.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile

from qgenomix.app.parser import GenotypeFileError
from qgenomix.app.service import Form as ProfileForm
from qgenomix.app.service import ProfileService
from qgenomix.config import ROOT

BUNDLE = Path(os.environ.get("QGENOMIX_BUNDLE", ROOT / "bundle"))
PERSONAS = Path(os.environ.get("QGENOMIX_PERSONAS", ROOT / "data" / "personas"))
MAX_BYTES = 80 * 1024 * 1024

app = FastAPI(title="QGenomix", version="2.0", description="Mechanism-profile risk report (research prototype)")


@lru_cache(maxsize=1)
def service() -> ProfileService:
    return ProfileService(str(BUNDLE))


@app.get("/v1/health")
def health() -> dict:
    return {"status": "ok", "bundle": BUNDLE.exists()}


@app.get("/v1/personas")
def personas() -> dict:
    path = PERSONAS / "personas.json"
    if not path.exists():
        raise HTTPException(404, "Personas not generated yet. Run: python scripts/make_personas.py")
    return json.loads(path.read_text())


async def _report(genotype: UploadFile, age: int, sex: str, bmi: float, waist_cm: float, activity: int,
                  family_history: int) -> tuple[dict, ProfileForm]:
    checks = [(18 <= age <= 100, "Age must be between 18 and 100."),
              (sex.upper()[:1] in ("F", "M"), "Sex must be F or M."),
              (10 <= bmi <= 70, "BMI must be between 10 and 70 kg/m²."),
              (40 <= waist_cm <= 200, "Waist must be between 40 and 200 cm."),
              (activity in (0, 1, 2, 3), "Activity must be 0 (vigorous), 1 (moderate), 2 (mild) or 3 (sedentary)."),
              (family_history in (0, 1, 2), "Family history must be 0 (none), 1 (one parent) or 2 (both parents).")]
    for ok, message in checks:
        if not ok:
            raise HTTPException(422, message)
    data = await genotype.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Genotype file is larger than 80 MB.")
    try:
        form = ProfileForm(age=age, sex=sex, bmi=bmi, waist_cm=waist_cm, activity=activity,
                           family_history=family_history)
        return service().profile(data, form), form
    except GenotypeFileError as exc:
        raise HTTPException(422, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/v1/profile")
async def profile(genotype: UploadFile = File(...), age: int = Form(...), sex: str = Form(...),
                  bmi: float = Form(...), waist_cm: float = Form(...), activity: int = Form(2),
                  family_history: int = Form(0)) -> dict:
    report, _ = await _report(genotype, age, sex, bmi, waist_cm, activity, family_history)
    return report


@app.post("/v1/report.pdf", response_class=Response)
async def report_pdf(genotype: UploadFile = File(...), age: int = Form(...), sex: str = Form(...),
                     bmi: float = Form(...), waist_cm: float = Form(...), activity: int = Form(2),
                     family_history: int = Form(0)) -> Response:
    from qgenomix.app.pdf import render_report

    report, form = await _report(genotype, age, sex, bmi, waist_cm, activity, family_history)
    return Response(render_report(report, form), media_type="application/pdf",
                    headers={"Content-Disposition": 'attachment; filename="qgenomix_report.pdf"'})
