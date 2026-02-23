import json
import sys
import joblib
import numpy as np

BASE = "ai/hybrid_model"

# =========================
# LOAD ARTIFACTS
# =========================
model = joblib.load(f"{BASE}/xgb_model.pkl")
scaler = joblib.load(f"{BASE}/scaler.pkl")
FEATURE_ORDER = joblib.load(f"{BASE}/feature_order.pkl")

# =========================
# INPUT CHECK
# =========================
if len(sys.argv) < 2:
    print(json.dumps({"prediction": "Moderate", "confidence": 0.0}))
    sys.exit(0)

inp = json.loads(sys.argv[1])

# =========================
# NORMALIZATION (FIXED)
# =========================
def normalize(v, feature_name=None):
    if v is None:
        return None

    # ---------- STRING ----------
    if isinstance(v, str):
        s = v.strip().lower()

        # YES / NO
        if s == "yes":
            return 1.0
        if s == "no":
            return 0.0

        # LIKERT
        likert = {
            "strongly agree": 1.0,
            "agree": 0.8,
            "neutral": 0.5,
            "disagree": 0.2,
            "strongly disagree": 0.0
        }
        if s in likert:
            return likert[s]

        # NUMERIC STRING
        try:
            v = float(s)
        except:
            return None
    else:
        try:
            v = float(v)
        except:
            return None

    # ---------- NUMERIC NORMALIZATION ----------
    fname = feature_name.lower() if feature_name else ""

    # Hours per day / week
    if "hour" in fname:
        # assume 0–14 hours realistic
        return max(0.0, min(v / 14.0, 1.0))

    # Percentage / marks
    if "percent" in fname or "mark" in fname or "score" in fname:
        return max(0.0, min(v / 100.0, 1.0))

    # Default numeric clamp
    return max(0.0, min(v, 1.0))

# =========================
# BUILD FEATURE VECTORS
# =========================
values = []        # only available signals
full_row = []      # ordered for ML

for f in FEATURE_ORDER:
    if f in inp:
        val = normalize(inp[f], f)
        if val is not None:
            values.append(val)
            full_row.append(val)
        else:
            full_row.append(0.0)
    else:
        full_row.append(0.0)

# =========================
# NO SIGNAL
# =========================
if not values:
    print(json.dumps({
        "prediction": "Moderate",
        "confidence": 0.0
    }))
    sys.exit(0)

# =========================
# 🔥 RULE ENGINE (PRIMARY)
# =========================
avg = float(np.mean(values))
risk_score = 1.0 - avg

# CLEAR SEPARATION
if risk_score >= 0.65:
    print(json.dumps({
        "prediction": "At_Risk",
        "confidence": round(risk_score, 4)
    }))
    sys.exit(0)

if risk_score <= 0.35:
    print(json.dumps({
        "prediction": "High_Confidence",
        "confidence": round(1 - risk_score, 4)
    }))
    sys.exit(0)

# =========================
# PARTIAL DATA → STOP ML
# =========================
if len(values) < len(FEATURE_ORDER):
    print(json.dumps({
        "prediction": "Moderate",
        "confidence": round(1 - abs(0.5 - avg), 4)
    }))
    sys.exit(0)

# =========================
# ML PATH (FULL DATA ONLY)
# =========================
X = scaler.transform([full_row])
proba = model.predict_proba(X)[0]

p_at_risk = float(proba[0])
p_moderate = float(proba[1])
p_high = float(proba[2])

# =========================
# FINAL DECISION
# =========================
if p_high >= 0.6:
    prediction = "High_Confidence"
    confidence = p_high
elif p_at_risk >= 0.6:
    prediction = "At_Risk"
    confidence = p_at_risk
else:
    prediction = "Moderate"
    confidence = p_moderate

# =========================
# OUTPUT
# =========================
print(json.dumps({
    "prediction": prediction,
    "confidence": round(confidence, 4)
}))
