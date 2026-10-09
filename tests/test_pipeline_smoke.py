"""End-to-end smoke test on a toy cohort (no downloads): every stage runs and produces sane numbers."""

from qgenomix.config import load_config
from qgenomix.pipeline.run import run_once, search_only
from qgenomix.sim.simulator import simulate


def test_full_run_on_toy_cohort(toy, rng):
    cfg = load_config(search__k=8, search__prescreen=40, search__sa_reads=20, quantum__epochs=1, cv__folds=2,
                      models__xgb__n_estimators=30)
    sim = dict(cfg["simulator"]) | {"delta": 0.5}
    ph = simulate(toy, sim, tuple(cfg["focus_pair"]), rng)
    res = run_once(toy, ph, cfg, seed=0, quantum=True)
    m = res["metrics"]
    for name in ("M0_idrs", "M1_bmi", "M3c_clinical", "M3_additive", "M7_xgb_pairs", "M10_xgb_vqc", "H_vqc",
                 "M11_qsvc", "M12_stack"):
        assert 0.4 < m[name]["auc"] <= 1.0, name
    assert m["M3_additive"]["auc"] > 0.6
    assert m["M1_bmi"]["lean_case_capture"] == 0.0
    assert len(res["selected_pairs"]) == 8
    assert {"score_test", "M7_xgb_pairs", "M10_xgb_vqc"} <= set(res["edr"])


def test_search_only_sweep_mode(toy, rng):
    cfg = load_config(search__k=8, search__prescreen=40, search__sa_reads=20)
    ph = simulate(toy, dict(cfg["simulator"]) | {"delta": 0.6}, tuple(cfg["focus_pair"]), rng)
    out = search_only(toy, ph, cfg, seed=0)
    assert out["edr"]["score_test"]["edr@48"] >= out["edr"]["score_test"]["edr@10"]
    assert 0 <= out["selection"]["qubo"]["recall"] <= 1
