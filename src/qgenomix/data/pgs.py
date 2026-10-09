"""Reading PGS Catalog harmonised scoring files (GRCh37 positions)."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

COMPLEMENT = str.maketrans("ACGT", "TGCA")


def read_scoring_file(path: str | Path) -> pd.DataFrame:
    """Return chr, pos, effect, other, weight (+ rsid when present) using harmonised coordinates."""
    df = pd.read_csv(path, sep="\t", comment="#", dtype=str, low_memory=False)
    out = pd.DataFrame(
        {
            "chr": df["hm_chr"],
            "pos": pd.to_numeric(df["hm_pos"], errors="coerce"),
            "effect": df["effect_allele"].str.upper(),
            "other": df.get("other_allele", df.get("hm_inferOtherAllele", pd.Series(index=df.index))).str.upper(),
            "weight": pd.to_numeric(df["effect_weight"], errors="coerce"),
        }
    )
    if "rsID" in df:
        out["rsid"] = df["rsID"]
    elif "hm_rsID" in df:
        out["rsid"] = df["hm_rsID"]
    out = out.dropna(subset=["chr", "pos", "weight"])
    out = out[out["chr"].isin([str(c) for c in range(1, 23)])]
    out["pos"] = out["pos"].astype(int)
    return out.reset_index(drop=True)


def match_alleles(score: pd.DataFrame, pvar: pd.DataFrame) -> pd.DataFrame:
    """Join a scoring file to target variants by position and allele pair.

    `pvar` needs chr, pos, ref, alt, id. Rows whose alleles do not match the target directly or after a
    strand flip are dropped. Returns score rows with the target `id` and the target-strand effect allele.
    """
    m = score.merge(pvar, on=["chr", "pos"], how="inner")
    m["other"] = m["other"].fillna("")
    eff, oth = m["effect"], m["other"]

    def pair_ok(e: pd.Series, o: pd.Series) -> pd.Series:
        # other allele may be missing in some files: then the effect allele alone must match
        o_ok = (o == "") | ((e == m["alt"]) & (o == m["ref"])) | ((e == m["ref"]) & (o == m["alt"]))
        return ((e == m["alt"]) | (e == m["ref"])) & o_ok

    direct = pair_ok(eff, oth)
    flipped = ~direct & pair_ok(eff.str.translate(COMPLEMENT), oth.str.translate(COMPLEMENT))
    m.loc[flipped, "effect"] = m.loc[flipped, "effect"].str.translate(COMPLEMENT)
    m = m[direct | flipped].copy()
    m["other"] = m["ref"].where(m["effect"] == m["alt"], m["alt"])
    return m.drop_duplicates(subset=["id"]).reset_index(drop=True)
