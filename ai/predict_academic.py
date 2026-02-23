# ai/predict_academic.py

import sys
import json
import pickle
import numpy as np
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "hybrid_model", "hybrid_performance_model.pkl")

# ----------------------------
# LOAD MODEL BUNDLE
# ----------------------------
with open(MODEL_PATH, "rb") as f:
    bundle = pickle.load(f)

model = bundle["model"]
label_encoder = bundle["label_encoder"]
feature_order = bundle["feature_order"]

# ----------------------------
# READ INPUT FEATURES
# ----------------------------
if len(sys.argv) < 2:
    print(json.dumps({"error": "No features provided"}))
    sys.exit(1)

try:
    features = json.loads(sys.argv[1])
except Exception:
    print(json.dumps({"error": "Invalid JSON input"}))
    sys.exit(1)

# ----------------------------
# BUILD FEATURE VECTOR
# ----------------------------
try:
    X = np.array([[features[k] for k in feature_order]])
except KeyError as e:
    print(json.dumps({"error": f"Missing feature {str(e)}"}))
    sys.exit(1)

# ----------------------------
# PREDICT
# ----------------------------
pred_idx = model.predict(X)[0]
pred_label = label_encoder.inverse_transform([pred_idx])[0]

confidence = None
if hasattr(model, "predict_proba"):
    confidence = float(np.max(model.predict_proba(X)))

# ----------------------------
# OUTPUT JSON (ONLY)
# ----------------------------
print(json.dumps({
    "prediction": pred_label,
    "confidence": round(confidence, 4) if confidence else None
}))
