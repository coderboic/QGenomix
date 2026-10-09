import numpy as np

from qgenomix.sim.simulator import simulate


def test_prevalence_planted_pairs_and_lean_phenotype(toy, cfg, rng):
    sim = dict(cfg["simulator"])
    ph = simulate(toy, sim, ("beta_cell", "lipodystrophy"), rng)
    assert abs(ph.y.mean() - sim["prevalence"]) < 0.01
    cl = toy.snps["cluster"].to_numpy()
    flat = [i for p in ph.planted for i in p]
    assert len(set(flat)) == len(flat), "planted pairs must be disjoint"
    assert all({cl[i], cl[j]} == {"beta_cell", "lipodystrophy"} for i, j in ph.planted)
    # high lipodystrophy score -> lower BMI but higher risk: the lean high-risk phenotype
    hi = ph.scores["lipodystrophy"] > 1
    assert ph.bmi[hi].mean() < ph.bmi[~hi].mean()
    assert ph.y[hi].mean() > ph.y[~hi].mean()
    assert abs(sum(ph.components.values()) - 1) < 0.2


def test_null_scenario_has_no_interaction_terms(toy, cfg, rng):
    sim = dict(cfg["simulator"]) | {"gamma": 0.0, "delta": 0.0}
    ph = simulate(toy, sim, ("beta_cell", "lipodystrophy"), rng)
    assert ph.components["mech_interaction"] == 0 and ph.components["planted_pairs"] == 0
    assert np.isfinite(ph.liability).all()


def test_clinical_factors_and_idrs(toy, cfg, rng):
    from qgenomix.clinical import idrs

    ph = simulate(toy, dict(cfg["simulator"]), ("beta_cell", "lipodystrophy"), rng)
    cl = ph.clinical
    assert set(cl) >= {"age", "male", "waist", "activity", "family", "idrs"}
    assert 25 <= cl["age"].min() and cl["age"].max() <= 75
    assert np.allclose(np.bincount(cl["family"], minlength=3) / toy.n, cfg["simulator"]["clinical"]["family_p"],
                       atol=0.01)
    # risk rises with age and with inactivity, as in real data
    old, young = cl["age"] >= 50, cl["age"] < 35
    assert ph.y[old].mean() > ph.y[young].mean()
    assert ph.y[cl["activity"] == 3].mean() > ph.y[cl["activity"] == 0].mean()
    assert ph.clinical_matrix().shape == (toy.n, 6)
    # the true-risk model reproduces prevalence and responds to a lifestyle change in the right direction
    assert abs(ph.true_risk().mean() - ph.y.mean()) < 0.02
    shift = ph.lifestyle_shift(activity=np.zeros(toy.n))
    assert (shift <= 1e-12).all() and ph.true_risk(shift).mean() < ph.true_risk().mean()
    # IDRS rules (Mohan et al. 2005)
    assert idrs(34, False, 79, 0, 0) == 0
    assert idrs(50, True, 100, 3, 2) == 100
    assert idrs(40, False, 85, 2, 1) == 20 + 10 + 20 + 10
