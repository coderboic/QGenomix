"""Mechanism-aware phenotype simulator with clinical risk factors.

Liability (every term standardised, so coefficients read as standard-deviation effects):

    L = a_bg * z(PRS_bg)                                genome-wide background (D-PRISM, SAS weights)
      + sum_k a_k * z(S_k)                              additive mechanism scores (5 T2D clusters)
      + gamma * z(z(S_beta) * z(S_lipo))                mechanism x mechanism interaction (diffuse)
      + delta * z(sum_planted (g_i - mean)(g_j - mean))   planted SNP-pair interactions (sparse truth)
      + a_bmi * z(BMI) + a_waist * z(waist)             general and central adiposity
      + a_age * z(age) + a_act * z(activity) + a_fam * z(family history)
      + noise

a_x = sqrt(variance share). The noise variance fills the remainder so Var(L) is about 1, and cases are the
top `prevalence` fraction of L (liability-threshold model).

Clinical factors are drawn so their relationships look like South Asian data:
  * BMI = mean + b_obesity z(S_obesity) + b_lipo z(S_lipo) + b_act (activity - mean) + noise: a high
    lipodystrophy score gives diabetes risk *without* high BMI (the lean high-risk phenotype);
  * waist rises with BMI and, at a given BMI, with the lipodystrophy score (central fat, "thin-fat" Indians);
  * family history is more likely with a high genetic load (it partly measures the same genes).

Because the generating model is known, `true_risk` gives each person's exact probability of being a case,
which lets the app's lifestyle what-ifs be checked against the truth (experiment E10).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from scipy import stats

from qgenomix.clinical import idrs
from qgenomix.data.cohort import CLUSTERS, Cohort
from qgenomix.utils import zscore


@dataclass
class Phenotype:
    y: np.ndarray                      # 0/1 case status
    bmi: np.ndarray
    liability: np.ndarray
    scores: dict[str, np.ndarray]      # standardised mechanism scores (truth, for diagnostics only)
    planted: list[tuple[int, int]]     # SNP column-index pairs that truly interact
    clinical: dict[str, np.ndarray] = field(default_factory=dict)   # age, male, waist, activity, family, idrs
    components: dict[str, float] = field(default_factory=dict)     # realised variance shares
    model: dict = field(default_factory=dict)                      # coefficients and scalers, for true_risk

    def clinical_matrix(self) -> np.ndarray:
        """Clinical inputs in a fixed order: age, male, BMI, waist, activity, family history."""
        c = self.clinical
        return np.column_stack([c["age"], c["male"], self.bmi, c["waist"], c["activity"], c["family"]])

    def true_risk(self, signal_shift: np.ndarray | float = 0.0) -> np.ndarray:
        """P(case | everything but noise), optionally after shifting the non-noise part of the liability."""
        m = self.model
        return stats.norm.sf((m["threshold"] - (m["signal"] + signal_shift)) / m["noise_sd"])

    def lifestyle_shift(self, activity: np.ndarray | None = None, waist: np.ndarray | None = None,
                        bmi: np.ndarray | None = None) -> np.ndarray:
        """Change in liability if activity / waist / BMI took the given values (other factors fixed)."""
        m, shift = self.model, np.zeros(len(self.y))
        for name, new, old in (("activity", activity, self.clinical.get("activity")),
                               ("waist", waist, self.clinical.get("waist")), ("bmi", bmi, self.bmi)):
            if new is not None and name in m["coef"]:
                shift = shift + m["coef"][name] * (np.asarray(new, float) - old) / m["sd"][name]
        return shift


def mechanism_scores(cohort: Cohort) -> dict[str, np.ndarray]:
    """Weighted allele sums per cluster using the published PGS weights, standardised."""
    w = cohort.snps["weight"].to_numpy(dtype=float)
    out = {}
    for cl in CLUSTERS:
        idx = cohort.cluster_index(cl)
        if len(idx):
            out[cl] = zscore(cohort.G[:, idx] @ w[idx])
    return out


def choose_planted_pairs(snps: pd.DataFrame, focus: tuple[str, str], n_pairs: int, min_maf: float,
                         rng: np.random.Generator) -> list[tuple[int, int]]:
    """Pick n disjoint cross-mechanism SNP pairs (one SNP from each focus cluster) with MAF >= min_maf."""
    maf = np.minimum(snps["eaf_sas"], 1 - snps["eaf_sas"]).to_numpy()
    a = [i for i in np.flatnonzero(snps["cluster"] == focus[0]) if maf[i] >= min_maf]
    b = [i for i in np.flatnonzero(snps["cluster"] == focus[1]) if maf[i] >= min_maf]
    n_pairs = min(n_pairs, len(a), len(b))
    a = rng.choice(a, n_pairs, replace=False)
    b = rng.choice(b, n_pairs, replace=False)
    return sorted((int(min(i, j)), int(max(i, j))) for i, j in zip(a, b, strict=True))


def _clinical(n: int, S: dict, bg: np.ndarray, ccfg: dict, bcfg: dict, rng: np.random.Generator) -> dict:
    age = np.clip(rng.normal(ccfg["age_mean"], ccfg["age_sd"], n), 25, 75).round()
    male = rng.integers(0, 2, n)
    activity = rng.choice(4, n, p=ccfg["activity_p"])
    genetic_load = 0.6 * bg + 0.3 * zscore(sum(S.values())) + rng.normal(0, 0.8, n)
    p_none, p_one, _ = ccfg["family_p"]
    family = np.digitize(genetic_load, np.quantile(genetic_load, [p_none, p_none + p_one]))
    bmi = (bcfg["mean"] + bcfg["obesity"] * S.get("obesity", 0) + bcfg["lipodystrophy"] * S.get("lipodystrophy", 0)
           + bcfg.get("activity", 0.0) * (activity - activity.mean()) + rng.normal(0, bcfg["sd_noise"], n))
    w = ccfg["waist"]
    waist = (np.where(male == 1, w["male"], w["female"]) + w["per_bmi"] * (bmi - bcfg["mean"])
             + w["lipodystrophy"] * S.get("lipodystrophy", 0) + rng.normal(0, w["sd"], n))
    return {"age": age, "male": male, "waist": waist.round(1), "activity": activity, "family": family,
            "bmi": bmi.round(1)}


def simulate(cohort: Cohort, sim_cfg: dict, focus: tuple[str, str], rng: np.random.Generator,
             planted: list[tuple[int, int]] | None = None) -> Phenotype:
    n = cohort.n
    S = mechanism_scores(cohort)
    bg = zscore(cohort.prs[:, -1])  # SAS-weight component is the "true" background

    ccfg = sim_cfg.get("clinical")
    bcfg = sim_cfg["bmi"]
    if ccfg:
        clin = _clinical(n, S, bg, ccfg, bcfg, rng)
        bmi = clin.pop("bmi")
    else:
        clin = {}
        bmi = (bcfg["mean"] + bcfg["obesity"] * S.get("obesity", 0) + bcfg["lipodystrophy"] * S.get("lipodystrophy", 0)
               + rng.normal(0, bcfg["sd_noise"], n))

    if planted is None:
        planted = choose_planted_pairs(cohort.snps, focus, sim_cfg["n_planted"], sim_cfg["planted_min_maf"], rng)
    Gc = cohort.G - cohort.G.mean(0)
    pair_term = np.zeros(n)
    for i, j in planted:
        pair_term += Gc[:, i] * Gc[:, j]

    coef = {"bmi": np.sqrt(sim_cfg["var_bmi"])}
    raw = {"bmi": bmi}
    if ccfg:
        coef |= {"age": np.sqrt(ccfg["var_age"]), "waist": np.sqrt(ccfg["var_waist"]),
                 "activity": np.sqrt(ccfg["var_activity"]), "family": np.sqrt(ccfg["var_family"])}
        raw |= {k: clin[k].astype(float) for k in ("age", "waist", "activity", "family")}
    mean = {k: float(v.mean()) for k, v in raw.items()}
    sd = {k: float(v.std()) for k, v in raw.items()}

    terms = {
        "background": np.sqrt(sim_cfg["var_bg"]) * bg,
        "mechanisms": sum(np.sqrt(v) * S[k] for k, v in sim_cfg["var_mech"].items() if k in S),
        "mech_interaction": sim_cfg["gamma"] * zscore(S[focus[0]] * S[focus[1]]),
        "planted_pairs": sim_cfg["delta"] * zscore(pair_term) if planted and sim_cfg["delta"] else np.zeros(n),
    }
    terms |= {k: coef[k] * (raw[k] - mean[k]) / sd[k] for k in coef}
    signal = sum(terms.values())
    var_noise = max(1.0 - signal.var(), 0.05)
    liability = signal + rng.normal(0, np.sqrt(var_noise), n)
    threshold = float(np.quantile(liability, 1 - sim_cfg["prevalence"]))
    y = (liability > threshold).astype(np.int8)
    if ccfg:
        clin["idrs"] = idrs(clin["age"], clin["male"], clin["waist"], clin["activity"], clin["family"])
    shares = {k: float(np.var(v)) for k, v in terms.items()} | {"noise": float(var_noise)}
    model = {"signal": signal, "threshold": threshold, "noise_sd": float(np.sqrt(var_noise)), "coef": coef,
             "sd": sd}
    return Phenotype(y=y, bmi=bmi, liability=liability, scores=S, planted=planted, clinical=clin,
                     components=shares, model=model)

