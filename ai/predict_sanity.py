import joblib
import numpy as np
import tensorflow as tf

# Load model
model = tf.keras.models.load_model(
    "holosenet_regressor.h5",
    compile=False
)

# Load scalers
scalers = joblib.load("holosenet_scalers.joblib")
scaler_vis = scalers["scaler_visual"]
scaler_aud = scalers["scaler_audio"]

# Model input sizes
vis_dim = model.inputs[0].shape[1]
aud_dim = model.inputs[1].shape[1]

print("Model visual dim:", vis_dim)
print("Model audio dim:", aud_dim)

# Scaler expected sizes
vis_n = scaler_vis.n_features_in_
aud_n = scaler_aud.n_features_in_

print("Scaler visual expects:", vis_n)
print("Scaler audio expects:", aud_n)

# Dummy inputs at MAX needed size
X_vis = np.zeros((1, max(vis_dim, vis_n)))
X_aud = np.zeros((1, max(aud_dim, aud_n)))

# --- VISUAL ---
X_vis_scaled = scaler_vis.transform(X_vis[:, :vis_n])
if X_vis_scaled.shape[1] < vis_dim:
    X_vis_scaled = np.pad(
        X_vis_scaled,
        ((0, 0), (0, vis_dim - X_vis_scaled.shape[1]))
    )
else:
    X_vis_scaled = X_vis_scaled[:, :vis_dim]

# --- AUDIO ---
X_aud_scaled = scaler_aud.transform(X_aud[:, :aud_n])
if X_aud_scaled.shape[1] < aud_dim:
    X_aud_scaled = np.pad(
        X_aud_scaled,
        ((0, 0), (0, aud_dim - X_aud_scaled.shape[1]))
    )
else:
    X_aud_scaled = X_aud_scaled[:, :aud_dim]

# Predict
pred = model.predict(
    {"vis_input": X_vis_scaled, "aud_input": X_aud_scaled},
    verbose=0
)

print("Prediction output:", float(pred[0][0]))
