"""Parse consumer-genotyping text files (23andMe / AncestryDNA style, GRCh37, forward strand).

Expected columns (tab or whitespace separated, '#' comments):  rsid  chromosome  position  genotype
Genotype is two letters such as "AG"; "--", "00" or "DD/II" (indels) are treated as missing.
"""

from __future__ import annotations

import io

import numpy as np
import pandas as pd

VALID = set("ACGT")


class GenotypeFileError(ValueError):
    pass


def read_genotype_file(data: bytes | str) -> pd.DataFrame:
    """Return a table chr (str), pos (int), a1, a2 (single letters) for every called SNP."""
    text = data.decode("utf-8", errors="replace") if isinstance(data, bytes) else data
    try:
        raw = pd.read_csv(io.StringIO(text), sep=r"\s+", comment="#", header=None, dtype=str, engine="c")
    except pd.errors.EmptyDataError as exc:
        raise GenotypeFileError("The file has no genotype rows. Expected: rsid, chromosome, position, "
                                "genotype.") from exc
    if raw.shape[1] < 4:
        raise GenotypeFileError("Expected at least 4 columns: rsid, chromosome, position, genotype.")
    df = raw.iloc[:, :3].copy()
    df.columns = ["rsid", "chr", "pos"]
    # 23andMe: one genotype column ("AG"); AncestryDNA: two allele columns ("A", "G")
    df["genotype"] = raw[3] + raw[4] if raw.shape[1] >= 5 and raw[4].str.len().eq(1).mean() > 0.9 else raw[3]
    if str(df["rsid"].iloc[0]).lower() in ("rsid", "snp"):
        df = df.iloc[1:]
    g = df["genotype"].fillna("").str.upper()
    ok = (g.str.len() == 2) & g.str[0].isin(VALID) & g.str[1].isin(VALID)
    df = df[ok]
    pos = pd.to_numeric(df["pos"], errors="coerce")
    out = pd.DataFrame({"rsid": df["rsid"].to_numpy(), "chr": df["chr"].str.replace("chr", "", regex=False).to_numpy(),
                        "pos": pos.to_numpy(), "a1": g[ok].str[0].to_numpy(), "a2": g[ok].str[1].to_numpy()})
    out = out.dropna(subset=["pos"])
    out["pos"] = out["pos"].astype(int)
    # 23andMe files repeat some positions under internal "i" IDs; keep the first call at each position
    out = out.drop_duplicates(subset=["chr", "pos"], keep="first").reset_index(drop=True)
    if len(out) < 1000:
        raise GenotypeFileError(f"Only {len(out)} usable genotype rows were found; a genotyping file has 100k+.")
    return out


def allele_dosage(calls: pd.DataFrame, targets: pd.DataFrame, allele_col: str,
                  other_col: str | None = None) -> tuple[np.ndarray, np.ndarray]:
    """Count copies of targets[allele_col] at each target (chr, pos). Returns (dosage, observed mask).

    With `other_col`, a call only counts as observed when both called alleles are the target's two alleles;
    anything else (a different allele, the opposite strand, a multi-allelic site) is treated as missing.
    """
    calls = calls.drop_duplicates(subset=["chr", "pos"], keep="first")
    cols = ["chr", "pos", allele_col] + ([other_col] if other_col else [])
    m = targets[cols].merge(calls[["chr", "pos", "a1", "a2"]], on=["chr", "pos"], how="left")
    assert len(m) == len(targets), "duplicate target positions"
    a, a1, a2 = m[allele_col].to_numpy(), m["a1"].to_numpy(), m["a2"].to_numpy()
    observed = m["a1"].notna().to_numpy()
    if other_col:
        o = m[other_col].to_numpy()
        observed = observed & ((a1 == a) | (a1 == o)) & ((a2 == a) | (a2 == o))
    d = np.where(observed, (a1 == a).astype(float) + (a2 == a).astype(float), 0.0)
    return d, observed


def to_23andme(rows: pd.DataFrame) -> str:
    """Serialise (rsid, chr, pos, a1, a2) rows to 23andMe text format."""
    header = "# QGenomix synthetic genotype file (GRCh37). Not a real person.\n# rsid\tchromosome\tposition\tgenotype\n"
    body = (rows["rsid"] + "\t" + rows["chr"].astype(str) + "\t" + rows["pos"].astype(str) + "\t"
            + rows["a1"] + rows["a2"])
    return header + "\n".join(body) + "\n"
