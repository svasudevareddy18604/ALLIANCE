import joblib

scalers = joblib.load("holosenet_scalers.joblib")

print("Type:", type(scalers))

if isinstance(scalers, dict):
    print("Keys:", scalers.keys())
else:
    print("Scaler object:", scalers)
