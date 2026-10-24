"""Inference: genotype file + clinical form -> mechanism-profile report (JSON-serialisable dict).

Two steps, so the dashboard can re-score instantly while someone moves the lifestyle sliders:
  genotype_features(file bytes)  slow part, ~5 s: parse, PRS, mechanism SNP dosages (cache this)
  report(features, form)         fast part: clinical factors, quantum features, model, SHAP, what-ifs
"""

from __future__ import annotations

from dataclasses import dataclass, replace

import numpy as np

from qgenomix.app.bundle import load_bundle, predict
from qgenomix.app.parser import allele_dosage, read_genotype_file
from qgenomix.clinical import ACTIVITY_LEVELS, FAMILY_LEVELS, idrs, idrs_category

CLUSTER_LABEL = {
    "beta_cell": "Insulin production (β-cell)",
    "lipodystrophy": "Fat distribution (lipodystrophy)",
    "obesity": "Obesity",
    "liver_lipid": "Liver / lipid",
    "proinsulin": "Proinsulin processing",
}
# Consumer chips (23andMe, AncestryDNA) carry ~600k SNPs, so they cover roughly 40-50% of the 1.3M PRS
# variants. Missing variants are imputed from their best-correlated measured neighbour (LD imputation, see
# qgenomix.data.impute) when the bundle has a panel, else at the South Asian mean, which pulls scores toward
# average. "Effective coverage" counts measured variants plus those imputed from a tag with r^2 >= WELL_TAGGED;
# below GOOD_COVERAGE the report says so; below the hard floors the file is probably the wrong build/format.
GOOD_COVERAGE = 0.8
WELL_TAGGED = 0.5
MIN_PRS_COVERAGE = 0.10
MIN_MECH_COVERAGE = 0.30


@dataclass
class Form:
    age: int
    sex: str                     # "F" or "M"
    bmi: float
    waist_cm: float
    activity: int = 2            # 0 vigorous, 1 moderate, 2 mild, 3 sedentary
    family_history: int = 0      # 0 none, 1 one parent, 2 both parents

    def clinical_row(self) -> np.ndarray:
        return np.array([[self.age, 1 if self.sex.upper().startswith("M") else 0, self.bmi, self.waist_cm,
                          self.activity, self.family_history]], dtype=float)

    def idrs(self) -> int:
        male = self.sex.upper().startswith("M")
        return int(idrs(self.age, male, self.waist_cm, self.activity, self.family_history))


@dataclass
class GenoFeatures:
    prs: np.ndarray          # (5,) D-PRISM components
    g: np.ndarray            # (62,) mechanism SNP dosages, missing ones imputed
    observed: np.ndarray     # (62,) which mechanism SNPs were in the file
    prs_coverage: float
    n_calls: int
    prs_effective: float = 0.0  # measured + imputed from a tag with r^2 >= WELL_TAGGED
    imputation: str = "mean"     # "ld" or "mean"


def _pct(ref_sorted: np.ndarray, v: float) -> float:
    return float(100 * np.searchsorted(ref_sorted, v) / len(ref_sorted))


class ProfileService:
    def __init__(self, bundle_dir: str):
        self.b = load_bundle(bundle_dir)
        self.w = self.b["prs_weights"]
        self.snps = self.b["snps"].copy()
        self.snps["chr"] = self.snps["chr"].astype(str)
        self.anc = [c for c in ("AFR", "AMR", "EAS", "EUR", "SAS") if c in self.w]

    # ---------------------------------------------------------------- slow part
    def genotype_features(self, genotype_bytes: bytes) -> GenoFeatures:
        calls = read_genotype_file(genotype_bytes)
        imp = self.b.get("impute")
        if imp is not None:
            from qgenomix.data.impute import impute

            d, obs_all = allele_dosage(calls, imp["sites"], "alt", "ref")
            full, quality = impute(d, obs_all, imp["panel"])
            obs, mobs = obs_all[imp["w_idx"]], obs_all[imp["m_idx"]]
            alt_d = full[imp["w_idx"]]
            gm = full[imp["m_idx"]]
            g = np.where(imp["m_effect_is_alt"], gm, 2 - gm)
            effective = float((quality[imp["w_idx"]] >= WELL_TAGGED).mean())
        else:
            alt_d, obs = allele_dosage(calls, self.w, "alt", "ref")
            alt_d = np.where(obs, alt_d, 2 * self.w["alt_freq"].to_numpy())
            g, mobs = allele_dosage(calls, self.snps, "effect", "other")
            g = np.where(mobs, g, 2 * self.snps["eaf_sas"].to_numpy())
            effective = float(obs.mean())
        prs = alt_d @ self.w[self.anc].to_numpy()
        prs_cov, mech_cov = float(obs.mean()), float(mobs.mean())
        if prs_cov < MIN_PRS_COVERAGE or mech_cov < MIN_MECH_COVERAGE:
            raise ValueError(f"Too few of the required SNPs were found (PRS variants {prs_cov:.0%}, mechanism SNPs "
                             f"{mech_cov:.0%}). This usually means the file is not on genome build GRCh37 (hg19), "
                             "or it is not a genotype file.")
        return GenoFeatures(prs=prs, g=g, observed=mobs, prs_coverage=prs_cov, n_calls=int(len(calls)),
                            prs_effective=effective, imputation="ld" if imp is not None else "mean")

    # ---------------------------------------------------------------- fast part
    def risk(self, f: GenoFeatures, form: Form) -> tuple[float, np.ndarray]:
        r, X = predict(self.b, f.prs[None, :], form.clinical_row(), f.g[None, :].astype(np.float32))
        return float(r[0]), X

    def what_if(self, f: GenoFeatures, form: Form) -> list[dict]:
        """Risk under lifestyle changes a person can make; genes, age and family history stay fixed."""
        base, _ = self.risk(f, form)
        scenarios = []
        if form.activity > 0:
            scenarios.append(("Regular vigorous exercise", replace(form, activity=0)))
        if form.waist_cm > 70:
            scenarios.append(("Waist 5 cm smaller (about 2 kg/m² less BMI)",
                              replace(form, waist_cm=form.waist_cm - 5, bmi=form.bmi - 2.0)))
        if form.activity > 0 and form.waist_cm > 70:
            scenarios.append(("Both", replace(form, activity=0, waist_cm=form.waist_cm - 5, bmi=form.bmi - 2.0)))
        out = []
        for label, alt in scenarios:
            r, _ = self.risk(f, alt)
            out.append({"change": label, "risk_probability": r, "risk_percentile": _pct(self.b["risk_ref"], r),
                        "relative_change": (r - base) / base if base > 0 else 0.0})
        return out

    def report(self, f: GenoFeatures, form: Form) -> dict:
        b = self.b
        risk, X = self.risk(f, form)
        risk_pct = _pct(b["risk_ref"], risk)
        w, cl = self.snps["weight"].to_numpy(float), self.snps["cluster"].to_numpy()
        raw = {c: float(f.g[cl == c] @ w[cl == c]) for c in b["score_mu"]}
        mechanisms = {c: {"label": CLUSTER_LABEL[c], "percentile": _pct(b["score_ref"][c], raw[c])} for c in raw}
        combo = mechanisms["beta_cell"]["percentile"] >= 80 and mechanisms["lipodystrophy"]["percentile"] >= 80
        lean = form.bmi < b["lean_bmi"]
        tier = "high" if risk_pct >= 80 else "moderate" if risk_pct >= 50 else "low"
        score = form.idrs()

        import shap

        sv = shap.TreeExplainer(b["xgb"]).shap_values(X)[0]
        start = len(b["features"]) + len(f.g)
        pair_imp = np.abs(sv[start:start + 2 * len(b["pairs"])]).reshape(len(b["pairs"]), 2).sum(1)
        rs = self.snps["rsid"].fillna(self.snps["id"]).to_numpy()
        carried = [(i, j, imp) for (i, j), imp in zip(b["pairs"], pair_imp, strict=True) if f.g[i] >= 1 and f.g[j] >= 1]
        carried.sort(key=lambda t: -t[2])
        top_pairs = [{"snp1": rs[i], "snp2": rs[j], "cluster1": cl[i], "cluster2": cl[j],
                      "dosage1": float(f.g[i]), "dosage2": float(f.g[j]), "importance": float(imp)}
                     for i, j, imp in carried[:5]]
        clinical_shap = dict(zip(["age", "male", "bmi", "waist", "activity", "family"], sv[5:11].tolist(), strict=True))
        genetic_shap = float(sv[:5].sum() + sv[11:].sum())
        missing = self.snps.loc[~f.observed, "rsid"].fillna(self.snps.loc[~f.observed, "id"])
        return {
            "risk_probability": risk,
            "risk_percentile": risk_pct,
            "risk_tier": tier,
            "lean": bool(lean),
            "missed_by_bmi_screening": bool(lean and tier == "high"),
            "idrs": {"score": score, "category": idrs_category(score),
                     "inputs": {"age": form.age, "waist_cm": form.waist_cm,
                                "activity": ACTIVITY_LEVELS[form.activity],
                                "family_history": FAMILY_LEVELS[form.family_history]}},
            "missed_by_idrs": bool(tier == "high" and idrs_category(score) != "high"),
            "mechanisms": mechanisms,
            "combination_flag": bool(combo),
            "top_pairs": top_pairs,
            "contributions": {"genetic": genetic_shap, **clinical_shap},
            "what_if": self.what_if(f, form),
            "prs_percentile": _pct(b["prs_ref"], float(f.prs[-1])),
            "coverage": {"prs_variants": f.prs_coverage, "prs_effective": f.prs_effective,
                         "imputation": f.imputation, "mechanism_snps": float(f.observed.mean()), "n_calls": f.n_calls,
                         "low": bool(f.prs_effective < GOOD_COVERAGE
                                     or (f.imputation == "mean" and f.observed.mean() < GOOD_COVERAGE))},
            "missing_mechanism_snps": [str(x) for x in missing],
            "advice": advice(tier, lean, combo, form),
            "model_version": f"2.2+{b['config_hash']}",
            "disclaimer": "Research prototype trained on simulated outcomes. Not a diagnosis.",
        }

    def profile(self, genotype_bytes: bytes, form: Form) -> dict:
        return self.report(self.genotype_features(genotype_bytes), form)


def advice(tier: str, lean: bool, combo: bool, form: Form) -> list[str]:
    out = []
    if tier == "high":
        out.append("Ask a doctor about a fasting glucose or HbA1c test now, and yearly after that.")
    if lean and tier != "low":
        out.append("A normal BMI does not rule out diabetes risk for South Asians; BMI-based screening may miss you.")
    if combo:
        out.append("Both insulin-production and fat-distribution scores are high. In British South Asians this "
                   "combination was linked to diagnosis about 8 years earlier (Hodgson et al., Nat Med 2025).")
    if form.activity >= 2:
        out.append("Regular exercise is the change with the clearest evidence: structured lifestyle change lowered "
                   "progression to diabetes by about 28% in Indian adults with impaired glucose tolerance, including "
                   "non-obese people without large weight loss (IDPP-1).")
    else:
        out.append("Keep up your activity: structured lifestyle change lowered progression to diabetes by about 28% "
                   "in Indian adults with impaired glucose tolerance (IDPP-1).")
    return out
