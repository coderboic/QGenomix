"""Thin wrappers around the PLINK 2 and PLINK 1.9 command lines."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pandas as pd

from qgenomix.utils import log


def run(binary: str | Path, *args: str | Path, threads: int | None = 8, memory_mb: int = 6000) -> None:
    """Run PLINK; pass threads=None for modes that accept no extra flags (e.g. --zst-decompress)."""
    cmd = [str(binary), *map(str, args)]
    if threads is not None:
        cmd += ["--threads", str(threads), "--memory", str(memory_mb)]
    log.info("$ %s", " ".join(cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"PLINK failed ({proc.returncode}):\n{proc.stdout[-3000:]}\n{proc.stderr[-3000:]}")


def read_pvar(prefix: str | Path) -> pd.DataFrame:
    """Read a .pvar written by PLINK 2 into chr, pos, id, ref, alt (strings except pos)."""
    path = Path(f"{prefix}.pvar")
    with open(path) as fh:
        skip = 0
        for line in fh:
            if line.startswith("##"):
                skip += 1
                continue
            break
    df = pd.read_csv(path, sep="\t", skiprows=skip, usecols=[0, 1, 2, 3, 4], dtype=str)
    df.columns = ["chr", "pos", "id", "ref", "alt"]
    df["pos"] = df["pos"].astype(int)
    return df


def read_raw(path: str | Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Read an `--export A` .raw file. Returns (samples, dosages with columns = variant IDs)."""
    df = pd.read_csv(path, sep=r"\s+")
    samples = df[["FID", "IID"]] if "FID" in df else df[["IID"]]
    geno = df.iloc[:, 6:] if "FID" in df else df.iloc[:, 5:]
    geno.columns = [c.rsplit("_", 1)[0] for c in geno.columns]  # strip the "_<allele>" suffix
    return samples.reset_index(drop=True), geno.reset_index(drop=True)
