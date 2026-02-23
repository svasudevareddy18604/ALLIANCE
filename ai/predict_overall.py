import sys
import json
import joblib
import numpy as np
import os

# 🔥 ALWAYS RESOLVE PATH RELATIVE TO THIS FILE
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

model = joblib.load(os.path.join(BASE_DIR, "overall_model.pkl"))
label_encoder = joblib.load(os.path.join(BASE_DIR, "label_encoder.pkl"))

def predict_overall(academic, survey, video):
    X = np.array([[academic, survey, video]])
    probs = model.predict_proba(X)[0]
    idx = probs.argmax()

    label = label_encoder.inverse_transform([idx])[0]
    confidence = float(probs[idx])

    return {
        "overall_level": label,
        "overall_confidence": round(confidence, 3)
    }

if __name__ == "__main__":
    data = json.loads(sys.argv[1])

    result = predict_overall(
        data["academic_confidence"],
        data["survey_confidence"],
        data["video_confidence"]
    )

    print(json.dumps(result))
