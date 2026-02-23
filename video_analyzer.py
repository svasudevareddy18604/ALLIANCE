import cv2
import mediapipe as mp
import numpy as np
import sys

# ==================================================
# INPUT
# ==================================================
# Usage: python video_analyzer.py path_to_video.mp4
video_path = sys.argv[1]

# ==================================================
# MEDIAPIPE SETUP
# ==================================================
mp_face = mp.solutions.face_mesh
mp_pose = mp.solutions.pose

face_mesh = mp_face.FaceMesh(refine_landmarks=True)
pose = mp_pose.Pose()

# ==================================================
# VIDEO READ
# ==================================================
cap = cv2.VideoCapture(video_path)
fps = int(cap.get(cv2.CAP_PROP_FPS))

frame_count = 0
eye_contact_frames = 0
total_frames = 0
head_movements = []

prev_nose_y = None

MAX_SECONDS = 20
MAX_FRAMES = fps * MAX_SECONDS

while cap.isOpened() and frame_count < MAX_FRAMES:
    ret, frame = cap.read()

    if not ret:
        break

    frame_count += 1

    # Sample 1 frame per second
    if fps > 0 and frame_count % fps != 0:
        continue

    total_frames += 1

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    face_result = face_mesh.process(rgb)
    pose.process(rgb)

    # -------- Eye contact proxy (face visible) --------
    if face_result.multi_face_landmarks:
        eye_contact_frames += 1

        nose_y = face_result.multi_face_landmarks[0].landmark[1].y
        if prev_nose_y is not None:
            head_movements.append(abs(nose_y - prev_nose_y))
        prev_nose_y = nose_y

cap.release()

# ==================================================
# BASIC VIDEO FEATURES
# ==================================================
eye_contact_ratio = eye_contact_frames / total_frames if total_frames else 0
head_movement = np.mean(head_movements) if head_movements else 0

# ==================================================
# INTERPRETABLE HUMAN METRICS
# ==================================================

# Posture
if head_movement < 0.005:
    posture = "GOOD"
elif head_movement < 0.015:
    posture = "AVERAGE"
else:
    posture = "POOR"

# Nervousness
if head_movement > 0.02:
    nervousness = "HIGH"
elif head_movement > 0.01:
    nervousness = "MEDIUM"
else:
    nervousness = "LOW"

# Stress
if eye_contact_ratio < 0.3:
    stress = "HIGH"
elif eye_contact_ratio < 0.6:
    stress = "MEDIUM"
else:
    stress = "LOW"

# Confidence score (video-only, explainable)
confidence_score = int(
    (eye_contact_ratio * 70) +
    ((1 - min(head_movement / 0.03, 1)) * 30)
)

# ==================================================
# FINAL OUTPUT (VIDEO MODALITY)
# ==================================================
result = {
    "eye_contact_ratio": round(eye_contact_ratio, 2),
    "head_movement": round(head_movement, 4),
    "posture": posture,
    "nervousness": nervousness,
    "stress": stress,
    "confidence_score": confidence_score,
    "frames_analyzed": total_frames
}

print(result)
