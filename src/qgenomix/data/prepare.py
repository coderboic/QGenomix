"""Turn raw 1000 Genomes + PGS Catalog files into the arrays every later stage uses.

Outputs (in `paths.processed`):
  mech_snps.tsv     mechanism SNPs: id, rsid, chr, pos, effect, other, weight, cluster, eaf_sas, eaf_all
  real.npz          real 1000G genomes: G (n x m effect dosages), prs (n x 5 D-PRISM components), iid
  samples.tsv       IID, SuperPop, Population, Sex
  pcs_all.tsv       top 10 genetic PCs, all 2,504 samples
  sas_mosaic.npz    South Asian haplotype library for synthetic cohorts (see cohort.py)
  sas_panel.bed     South Asian genotypes at every panel variant, for LD imputation (see impute.py)
  qc_report.json    counts at each step
"""

from __future__ import annotations

import gc
from pathlib import Path

import numpy as np
import pandas as pd

from qgenomix.config import Config
from qgenomix.data import plink
from qgenomix.data.pgs import match_alleles, read_scoring_file
from qgenomix.utils import log, save_json


def prepare_1000g(cfg: Config, threads: int = 12) -> None:
    raw = cfg.path("raw_1kg")
    out = cfg.path("processed")
    out.mkdir(parents=True, exist_ok=True)
    p2 = cfg.path("plink2")
    report: dict = {}

    # 0. decompress genotypes once
    if not Path(f"{raw}.pgen").exists():
        plink.run(p2, "--zst-decompress", f"{raw}.pgen.zst", f"{raw}.pgen", threads=None)

    # 1. target positions = D-PRISM variants + mechanism SNPs
    pgs_dir = cfg.path("raw_pgs")
    mech_scores = {
        k: read_scoring_file(pgs_dir / f"{pgs_id}_hmPOS_GRCh37.txt.gz") for k, pgs_id in cfg["mechanisms"].items()
    }
    bg_scores = {
        anc: read_scoring_file(pgs_dir / f"{pgs_id}_hmPOS_GRCh37.txt.gz")
        for anc, pgs_id in cfg["background_prs"].items()
    }
    targets = pd.concat([s[["chr", "pos"]] for s in [*mech_scores.values(), *bg_scores.values()]]).drop_duplicates()
    targets = targets.assign(end=targets["pos"]).sort_values(["chr", "pos"])
    targets[["chr", "pos", "end"]].to_csv(out / "targets.bed1", sep="\t", header=False, index=False)
    report["target_positions"] = len(targets)
    del bg_scores, targets
    gc.collect()  # the five D-PRISM tables are large; free them while PLINK runs

    # 2. extract target positions first (cheap), then harmonise IDs and QC on the small set
    samples = pd.read_csv(f"{raw}.psam", sep="\t")
    samples = samples.rename(columns={"#IID": "IID"})
    samples[["IID"]].to_csv(out / "all.ids", header=False, index=False)
    samples.loc[samples["SuperPop"] == "SAS", ["IID"]].to_csv(out / "sas.ids", header=False, index=False)
    if not (out / "kgA.pgen").exists():  # loading 84M variants needs ~6.5 GB; run this with little else open
        plink.run(p2, "--pfile", raw, "vzs", "--chr", "1-22", "--extract", "bed1", out / "targets.bed1",
                  "--snps-only", "just-acgt", "--max-alleles", "2", "--make-pgen", "--out", out / "kgA",
                  threads=threads, memory_mb=8000)
    plink.run(p2, "--pfile", out / "kgA", "--set-all-var-ids", "@:#:$r:$a", "--rm-dup", "exclude-all",
              "--geno", cfg["data"]["geno_max"], "--maf", cfg["data"]["maf_min"], "--make-pgen", "--out", out / "kg0",
              threads=threads, memory_mb=3000)
    bg_scores = {
        anc: read_scoring_file(pgs_dir / f"{pgs_id}_hmPOS_GRCh37.txt.gz")
        for anc, pgs_id in cfg["background_prs"].items()
    }
    plink.run(p2, "--pfile", out / "kg0", "--keep", out / "sas.ids", "--hwe", cfg["data"]["hwe_p_sas"],
              "--write-snplist", "--out", out / "sas_hwe", threads=threads)
    plink.run(p2, "--pfile", out / "kg0", "--extract", out / "sas_hwe.snplist", "--make-pgen", "--out", out / "kg",
              threads=threads)
    pvar = plink.read_pvar(out / "kg")
    report["variants_after_qc"] = len(pvar)

    # 3. principal components (all samples; LD-pruned common SNPs)
    plink.run(p2, "--pfile", out / "kg", "--maf", 0.05, "--indep-pairwise", 200, 50, 0.2, "--out", out / "prune",
              threads=threads)
    plink.run(p2, "--pfile", out / "kg", "--extract", out / "prune.prune.in", "--pca", 10, "--out", out / "pcs_all",
              threads=threads)
    pcs = pd.read_csv(out / "pcs_all.eigenvec", sep="\t").rename(columns={"#IID": "IID"})
    pcs.to_csv(out / "pcs_all.tsv", sep="\t", index=False)
    report["pca_snps"] = sum(1 for _ in open(out / "prune.prune.in"))

    # 4. mechanism SNPs
    mech = []
    for cluster, sc in mech_scores.items():
        m = match_alleles(sc, pvar)
        m["cluster"] = cluster
        report[f"mech_{cluster}"] = f"{len(m)}/{len(sc)}"
        mech.append(m)
    mech = pd.concat(mech).drop_duplicates(subset=["id"]).reset_index(drop=True)
    mech[["id"]].to_csv(out / "mech.ids", header=False, index=False)
    mech[["id", "effect"]].to_csv(out / "mech_effect.txt", sep="\t", header=False, index=False)
    plink.run(p2, "--pfile", out / "kg", "--extract", out / "mech.ids", "--export", "A",
              "--export-allele", out / "mech_effect.txt", "--out", out / "mech", threads=threads)
    raw_samples, dos = plink.read_raw(out / "mech.raw")
    dos = dos[mech["id"]].to_numpy(dtype=np.float32)

    # 5. D-PRISM background PRS, ALT-coded so the five components share one allele column
    w = pvar[["id", "alt"]].copy()
    for anc, sc in bg_scores.items():
        m = match_alleles(sc, pvar)
        sign = np.where(m["effect"] == m["alt"], 1.0, -1.0)
        w = w.merge(pd.DataFrame({"id": m["id"], anc: m["weight"].to_numpy() * sign}), on="id", how="left")
        report[f"dprism_{anc}_matched"] = f"{len(m)}/{len(sc)}"
    anc_cols = list(cfg["background_prs"])
    w[anc_cols] = w[anc_cols].fillna(0.0)
    w = w[(w[anc_cols] != 0).any(axis=1)]
    w.to_csv(out / "dprism_alt.tsv", sep="\t", index=False)
    plink.run(p2, "--pfile", out / "kg", "--score", out / "dprism_alt.tsv", 1, 2, "header", "cols=+scoresums",
              "--score-col-nums", f"3-{2 + len(anc_cols)}", "--out", out / "prs", threads=threads)
    prs = pd.read_csv(out / "prs.sscore", sep="\t").rename(columns={"#IID": "IID"})
    sum_cols = [f"SCORE{i + 1}_SUM" for i in range(len(anc_cols))]  # column order = anc_cols
    prs_mat = prs[sum_cols].to_numpy(dtype=np.float64)

    # 6. assemble real-genome arrays in psam order
    order = raw_samples["IID"].tolist()
    assert order == prs["IID"].tolist(), "sample order mismatch between .raw and .sscore"
    meta = samples.set_index("IID").loc[order].reset_index()
    sas = (meta["SuperPop"] == "SAS").to_numpy()
    mech["eaf_sas"] = dos[sas].mean(0) / 2
    mech["eaf_all"] = dos.mean(0) / 2
    mech.to_csv(out / "mech_snps.tsv", sep="\t", index=False)
    meta[["IID", "SuperPop", "Population", "SEX"]].to_csv(out / "samples.tsv", sep="\t", index=False)
    np.savez_compressed(out / "real.npz", G=dos, prs=prs_mat, iid=np.array(order), prs_cols=np.array(anc_cols))

    # 7. South Asian haplotype library for synthetic cohorts, and genotypes for the LD imputation panel
    build_sas_mosaic(cfg, pvar, w, mech, threads=threads, report=report)
    export_sas_panel(cfg, threads=threads)
    save_json(report, out / "qc_report.json")
    log.info("prepare_1000g done: %s", report)


def export_sas_panel(cfg: Config, threads: int = 12) -> Path:
    """South Asian genotypes at all QC-passed target variants as a PLINK .bed (A1 = ALT), ~180 MB."""
    out = cfg.path("processed")
    plink.run(cfg.path("plink2"), "--pfile", out / "kg", "--keep", out / "sas.ids", "--make-bed",
              "--out", out / "sas_panel", threads=threads)
    return out / "sas_panel"


def _read_haps(prefix: Path) -> tuple[pd.DataFrame, np.ndarray]:
    """Read an Oxford .haps file: returns (variant table, haplotype matrix variants x haplotypes)."""
    meta = pd.read_csv(f"{prefix}.haps", sep=" ", header=None, usecols=[0, 1, 2, 3, 4], dtype=str)
    meta.columns = ["chr", "id", "pos", "a0", "a1"]
    ncol = len(open(f"{prefix}.haps").readline().split())
    hap = pd.read_csv(f"{prefix}.haps", sep=" ", header=None, usecols=range(5, ncol), dtype=np.int8).to_numpy()
    return meta, hap


def build_sas_mosaic(cfg: Config, pvar: pd.DataFrame, w: pd.DataFrame, mech: pd.DataFrame,
                     threads: int = 12, report: dict | None = None) -> None:
    """Pre-compute per-block, per-haplotype partial PRS for the South Asian reference haplotypes.

    A synthetic person is a mosaic: for every genomic block, two haplotypes drawn at random from the
    978 phased South Asian haplotypes. Because blocks are independent, their genome-wide PRS is just the
    sum of the pre-computed partial scores of the drawn haplotypes, so we never store a synthetic genome.
    """
    out = cfg.path("processed")
    p2 = cfg.path("plink2")
    block_bp = int(cfg["data"]["block_mb"] * 1_000_000)
    anc_cols = list(cfg["background_prs"])
    keep_ids = set(w["id"]) | set(mech["id"])
    pd.Series(sorted(keep_ids)).to_csv(out / "hap.ids", header=False, index=False)

    block_keys: list[str] = []
    partial: list[np.ndarray] = []
    mech_hap = None
    mech_block = np.full(len(mech), -1)
    mech_index = {vid: j for j, vid in enumerate(mech["id"])}
    wmap = w.set_index("id")

    for c in range(1, 23):
        prefix = out / f"haps_sas_chr{c}"
        plink.run(p2, "--pfile", out / "kg", "--keep", out / "sas.ids", "--chr", c, "--extract", out / "hap.ids",
                  "--export", "haps", "--out", prefix, threads=threads)
        meta, hap = _read_haps(prefix)
        if mech_hap is None:
            mech_hap = np.zeros((hap.shape[1], len(mech)), dtype=np.int8)
        alt = pvar.set_index("id").loc[meta["id"], "alt"].to_numpy()
        alt_dose = np.where((meta["a1"].to_numpy() == alt)[:, None], hap, 1 - hap).astype(np.float32)
        pos = meta["pos"].astype(int).to_numpy()
        blk = pos // block_bp
        wts = wmap.reindex(meta["id"])[anc_cols].fillna(0.0).to_numpy(dtype=np.float32)
        for b in np.unique(blk):
            sel = blk == b
            block_keys.append(f"{c}:{b}")
            partial.append(wts[sel].T @ alt_dose[sel])  # (5, n_hap)
        # mechanism SNP haplotypes, effect-allele coded, with their block index
        for i, vid in enumerate(meta["id"]):
            j = mech_index.get(vid)
            if j is None:
                continue
            eff_is_alt = mech.loc[j, "effect"] == alt[i]
            mech_hap[:, j] = alt_dose[i] if eff_is_alt else 1 - alt_dose[i]
            mech_block[j] = block_keys.index(f"{c}:{blk[i]}")
        for ext in (".haps", ".sample", ".log"):
            Path(f"{prefix}{ext}").unlink(missing_ok=True)

    S = np.stack(partial).transpose(0, 2, 1).astype(np.float32)  # (n_blocks, n_hap, 5)
    assert (mech_block >= 0).all(), "some mechanism SNPs were not found in the haplotype export"
    np.savez_compressed(out / "sas_mosaic.npz", S=S, mech_hap=mech_hap, mech_block=mech_block,
                        block_keys=np.array(block_keys))
    if report is not None:
        report["mosaic_blocks"] = len(block_keys)
        report["mosaic_haplotypes"] = int(S.shape[1])
    log.info("SAS mosaic: %d blocks x %d haplotypes", S.shape[0], S.shape[1])
