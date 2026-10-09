"""Clinical risk factors and the Indian Diabetes Risk Score (IDRS).

IDRS (Mohan et al., J Assoc Physicians India 2005;53:759-63) is the standard simple screening score in India.
It adds points for four things anyone can answer without a blood test:

    age                <35: 0      35-49: 20      >=50: 30
    waist (women)      <80: 0      80-89: 10      >=90: 20        (cm)
    waist (men)        <90: 0      90-99: 10      >=100: 20       (cm)
    physical activity  vigorous: 0   moderate: 10   mild: 20   none / sedentary: 30
    family history     none: 0     one parent: 10   both parents: 20

Total 0-100: under 30 low, 30-50 moderate, 60 and above high risk.
"""

from __future__ import annotations

import numpy as np

ACTIVITY_LEVELS = ["vigorous", "moderate", "mild", "sedentary"]   # coded 0..3
FAMILY_LEVELS = ["none", "one parent", "both parents"]            # coded 0..2
CLINICAL_COLUMNS = ["age", "male", "waist", "activity", "family"]


def idrs(age, male, waist, activity, family) -> np.ndarray:
    age, male, waist = np.asarray(age, float), np.asarray(male, bool), np.asarray(waist, float)
    activity, family = np.asarray(activity, int), np.asarray(family, int)
    pts_age = np.select([age < 35, age < 50], [0, 20], 30)
    lo, hi = np.where(male, 90, 80), np.where(male, 100, 90)
    pts_waist = np.select([waist < lo, waist < hi], [0, 10], 20)
    return pts_age + pts_waist + 10 * activity + 10 * family


def idrs_category(score: float) -> str:
    return "high" if score >= 60 else "moderate" if score >= 30 else "low"
