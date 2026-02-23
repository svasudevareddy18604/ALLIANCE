import json
import sys
import joblib
import numpy as np
import tensorflow as tf

# ---------------- CONFIG ---------------- #

VISUAL_FEATURES = [
    "face_detect_rate",
    "eye_openness_mean",
    "eye_openness_std",
    "left_eye_mean",
    "right_eye_mean",
    "mouth_open_mean",
    "mouth_open_std",
    "blink_rate_per_sec",
    "gaze_forward_mean",
    "gaze_forward_std",
    "head_pitch_mean",
    "head_pitch_std",
    "head_yaw_mean",
    "head_yaw_std",
    "torso_angle_mean",
    "torso_angle_std",
    "motion_mean",
    "motion_std",
    "fps",
    "duration_sec",
    "sampled_frames",
    "frame_count",
    "pad_feature"   # ensures 23 features
]

# ---------------- LOAD MODEL ---------------- #

model = tf.keras.models.load_model(
    "holosenet_regressor.h5",
    compile=False
)

scalers = joblib.load("holosenet_scalers.joblib")
scaler_vis = scalers["scaler_visual"]

VIS_DIM = model.inputs[0].shape[1]
AUD_DIM = model.inputs[1].shape[1]

# ---------------- LOAD JSON ---------------- #

json_path = sys.argv[1]
with open(json_path, "r") as f:
    data = json.load(f)

# ---------------- BUILD VISUAL VECTOR ---------------- #

vis_values = []
for key in VISUAL_FEATURES:
    val = data.get(key, 0.0)
    if isinstance(val, (int, float)):
        vis_values.append(float(val))
    else:
        vis_values.append(0.0)

X_vis = np.array(vis_values).reshape(1, -1)

# Align with scaler
vis_n = scaler_vis.n_features_in_
X_vis = scaler_vis.transform(X_vis[:, :vis_n])

# Pad to model size if needed
if X_vis.shape[1] < VIS_DIM:
    X_vis = np.pad(X_vis, ((0,0),(0, VIS_DIM - X_vis.shape[1])))

# ---------------- AUDIO PLACEHOLDER ---------------- #
# (your current JSONs don’t have audio features)

X_aud = np.zeros((1, AUD_DIM))

# ---------------- PREDICT ---------------- #

pred = model.predict(
    {"vis_input": X_vis, "aud_input": X_aud},
    verbose=0
)[0][0]

# ---------------- OUTPUT ---------------- #

print("\n=== STUDENT PERFORMANCE ===")
print(f"Confidence score: {round(float(pred), 2)}")
