"""Fetch reference metadata from Crossref and format it in APA, the layout Google Scholar's "Cite" button gives.

    python3 build_references.py      writes references.json, which the report and the slides read

No DOI or URL is written into a reference. Sources that Crossref does not hold are listed in MANUAL.
"""
# ruff: noqa: E501  (the reference texts below are data and stay on one line each)
import html
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
LOOKUP = {  # key: DOI, or a title to search for
    "anjana": "10.1016/S2213-8587(23)00119-5",
    "ncdrisc": "10.1016/S0140-6736(24)02317-1",
    "hodgson": "Genetic basis of early onset and progression of type 2 diabetes in South Asians",
    "narayan": "Why are South Asians prone to type 2 diabetes? A hypothesis based on underexplored pathways",
    "caleyachetty": "10.1016/S2213-8587(21)00088-7",
    "gujral": "Ethnic differences in the prevalence of diabetes in underweight and normal weight individuals: The CARRS and NHANES studies",
    "siddiqui": "10.1007/s00125-022-05671-z",
    "ramachandran": "The Indian Diabetes Prevention Programme shows that lifestyle modification and metformin prevent type 2 diabetes in Asian Indian subjects with impaired glucose tolerance (IDPP-1)",
    "huerta": "10.1101/2025.07.21.25331778",
    "loesch": "10.1038/s41467-025-56695-z",
    "khera": "Genome-wide polygenic scores for common diseases identify individuals with risk equivalent to monogenic mutations",
    "udler": "Type 2 diabetes genetic loci informed by multi-trait associations point to disease mechanisms and subtypes: A soft clustering analysis",
    "ruan": "Improving polygenic prediction in ancestrally diverse populations",
    "mahajan": "Multi-ancestry genetic study of type 2 diabetes highlights the power of diverse populations for discovery and translation",
    "cordell": "Detecting gene-gene interactions that underlie human diseases",
    "wan": "BOOST: A fast approach to detecting gene-gene interactions in genome-wide case-control studies",
    "lucas": "Ising formulations of many NP problems",
    "hadfield": "From the quantum approximate optimization algorithm to a quantum alternating operator ansatz",
    "bartschi": "Deterministic preparation of Dicke states",
    "perez": "Data re-uploading for a universal quantum classifier",
    "havlicek": "Supervised learning with quantum-enhanced feature spaces",
    "temme": "Error mitigation for short-depth quantum circuits",
    "bravyi": "Mitigating measurement errors in multiqubit experiments",
    "bonet": "Low-cost error mitigation by symmetry verification",
    "marchini": "Genotype imputation for genome-wide association studies",
    "browning": "Genotype imputation with millions of reference samples",
    "kg": "A global reference for human genetic variation",
    "lambert": "The Polygenic Score Catalog as an open database for reproducibility and systematic evaluation",
    "plink": "Second-generation PLINK: rising to the challenge of larger and richer datasets",
    "tripod": "Transparent reporting of a multivariable prediction model for individual prognosis or diagnosis (TRIPOD): the TRIPOD statement",
    "peng": "Feature selection based on mutual information criteria of max-dependency, max-relevance, and min-redundancy",
    "delong": "Comparing the areas under two or more correlated receiver operating characteristic curves: a nonparametric approach",
    "sunxu": "Fast implementation of DeLong's algorithm for comparing the areas under correlated receiver operating characteristic curves",
}
MANUAL = {
    "tribune": ("2023", "Tribune News Service. (2023, June 10). 60 pc diabetes reversible: ICMR chief on finding 101 mn diabetics in India. *The Tribune*."),
    "theprint": ("2024", "Dutta, S. S. (2024, November 14). India had highest number of diabetics in the world in 2022, 62% were not on medication—Lancet report. *ThePrint*."),
    "idf": ("2025", "International Diabetes Federation. (2025). *IDF diabetes atlas* (11th ed.). International Diabetes Federation."),
    "mohan": ("2005", "Mohan, V., Deepa, R., Deepa, M., Somannavar, S., & Datta, M. (2005). A simplified Indian Diabetes Risk Score for screening for undiagnosed diabetic subjects. *The Journal of the Association of Physicians of India*, *53*, 759-763."),
    "farhi": ("2014", "Farhi, E., Goldstone, J., & Gutmann, S. (2014). A quantum approximate optimization algorithm. *arXiv preprint arXiv:1411.4028*."),
    "lundberg": ("2017", "Lundberg, S. M., & Lee, S. I. (2017). A unified approach to interpreting model predictions. *Advances in Neural Information Processing Systems*, *30*."),
    "shaw": ("1998", "Shaw, P. (1998). Using constraint programming and local search methods to solve vehicle routing problems. In *International Conference on Principles and Practice of Constraint Programming* (pp. 417-431). Springer."),
}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "qgenomix-references/1.0"})
    return json.load(urllib.request.urlopen(req, timeout=40))["message"]


def fetch(q):
    if q.startswith("10."):
        return get("https://api.crossref.org/works/" + urllib.parse.quote(q))
    def norm(t):
        return re.sub(r"[^a-z0-9]", "", html.unescape(t).lower())

    for field, rows in (("query.title", 8), ("query.bibliographic", 20)):
        for item in get(f"https://api.crossref.org/works?rows={rows}&{field}=" + urllib.parse.quote(q))["items"]:
            if norm((item.get("title") or [""])[0]).startswith(norm(q)[:55]):  # the title must really match
                return item
    return None


def initials(given):
    parts = re.split(r"[\s\-]+", given.strip())
    return " ".join(p[0].upper() + "." for p in parts if p)


def name(a):
    if "family" not in a:
        return a.get("name", "")
    return f"{a['family']}, {initials(a['given'])}" if a.get("given") else a["family"]


def clean(t):
    t = html.unescape(re.sub(r"<[^>]+>", "", t))
    return re.sub(r"\s+", " ", t).strip()


def apa(w):
    a = w.get("author", [])
    if len(a) > 7:                       # Google Scholar: first six authors, then "... &" the last one
        who = ", ".join(name(x) for x in a[:6]) + ", ... & " + name(a[-1])
    elif len(a) > 1:
        who = ", ".join(name(x) for x in a[:-1]) + ", & " + name(a[-1])
    else:
        who = name(a[0]) if a else clean((w.get("publisher") or ""))
    parts = w.get("issued", w.get("created", {})).get("date-parts", [[None]])[0]
    year = parts[0]
    title = clean((w.get("title") or [""])[0]).rstrip(".")
    box = clean((w.get("container-title") or [""])[0])
    vol, iss = w.get("volume"), w.get("issue")
    pages = (w.get("page") or w.get("article-number") or "").replace("–", "-")
    if w.get("type") == "posted-content":
        return year, f"{who} ({year}). {title}. *medRxiv*."
    if w.get("type") in ("book-chapter", "proceedings-article") or not vol:
        return year, f"{who} ({year}). {title}. In *{box}*" + (f" (pp. {pages})." if pages else ".")
    tail = f"*{box}*, *{vol}*" + (f"({iss})" if iss else "") + (f", {pages}" if pages else "")
    return year, f"{who} ({year}). {title}. {tail}."


def tidy(t):
    return re.sub(r"(?<![.])( \(\d{4}[^)]*\)\. )", r".\1", t, count=1)  # a group author ends with a full stop


out = {k: {"year": y, "apa": t} for k, (y, t) in MANUAL.items()}
missing = []
for key, q in LOOKUP.items():
    w = fetch(q)
    if w is None:
        missing.append(key)
        continue
    if not q.startswith("10."):            # APA sentence case: keep the title as written in LOOKUP
        w["title"] = [q]
    y, t = apa(w)
    out[key] = {"year": str(y), "apa": t}
    time.sleep(0.1)
if missing:
    print("NOT FOUND:", missing)
FIXES = {  # Crossref records that need correcting
    "hodgson": [("(2024)", "(2025)")],
    "gujral": [("Narayan, K.", "Narayan, K. M. V.")],
    "ramachandran": [("Bhaskar, A. D., Vijay, V., & Indian Diabetes Prevention Programme (IDPP)", "Bhaskar, A. D., & Vijay, V.")],
    "peng": [("Hanchuan Peng, Fuhui Long, & Ding, C.", "Peng, H., Long, F., & Ding, C."),
             ("mutual information criteria", "mutual information: criteria")],
    "delong": [("*44*(3), 837.", "*44*(3), 837-845.")],
    "lucas": [("*2*.", "*2*, 5.")],
    "plink": [("*Gigascience*", "*GigaScience*")],
    "bartschi": [("In *Lecture Notes in Computer Science* (pp. 126-139).",
                  "In *International Symposium on Fundamentals of Computation Theory* (pp. 126-139). Springer.")],
}
for key, pairs in FIXES.items():
    for a, b in pairs:
        if a not in out[key]["apa"]:
            raise SystemExit(f"fix for {key} did not apply: {a}")
        out[key]["apa"] = out[key]["apa"].replace(a, b)
out["hodgson"]["year"] = "2025"
out["kg"]["apa"] = "1000 Genomes Project Consortium. (2015). A global reference for human genetic variation. *Nature*, *526*(7571), 68-74."
for key in out:
    out[key]["apa"] = tidy(out[key]["apa"])
(HERE / "references.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
for k, v in out.items():
    print(f"{k:13s}{v['apa']}")
