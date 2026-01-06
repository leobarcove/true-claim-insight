"""
Video Risk Analyzer using MediaPipe Face Mesh.

Extracts:
- Blink Rate (blinks per minute)
- Average Blink Duration (ms)
- Lip Tension Score (compression ratio)
- Gaze Direction (future: eye tracking)
"""

import cv2
import mediapipe as mp
import numpy as np
from typing import Dict, Any, Tuple

# MediaPipe Initialization with Robust Import
mp_face_mesh = None
try:
    if hasattr(mp, "solutions"):
        mp_face_mesh = mp.solutions.face_mesh
    else:
        # Fallback for environments where mp.solutions is not auto-loaded
        import mediapipe.python.solutions.face_mesh
        mp_face_mesh = mediapipe.python.solutions.face_mesh
except (ImportError, AttributeError) as e:
    print(f"ERROR: MediaPipe Solutions (FaceMesh) import failed: {e}")
    mp_face_mesh = None

# Eye landmarks for EAR calculation (Right and Left eyes)
# See: https://google.github.io/mediapipe/solutions/face_mesh.html
RIGHT_EYE_INDICES = [33, 160, 158, 133, 153, 144]  # Outer to inner, top to bottom
LEFT_EYE_INDICES = [362, 385, 387, 263, 373, 380]

# Lip landmarks for tension measurement
UPPER_LIP_TOP = 13
LOWER_LIP_BOTTOM = 14
LIP_LEFT_CORNER = 61
LIP_RIGHT_CORNER = 291


def calculate_ear(landmarks, eye_indices: list) -> float:
    """
    Calculate Eye Aspect Ratio (EAR) for blink detection.
    EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
    Low EAR (< 0.2) indicates a blink.
    """
    # Get the 6 eye points
    p = [landmarks[i] for i in eye_indices]
    
    # Vertical distances
    v1 = np.linalg.norm(np.array([p[1].x, p[1].y]) - np.array([p[5].x, p[5].y]))
    v2 = np.linalg.norm(np.array([p[2].x, p[2].y]) - np.array([p[4].x, p[4].y]))
    
    # Horizontal distance
    h = np.linalg.norm(np.array([p[0].x, p[0].y]) - np.array([p[3].x, p[3].y]))
    
    if h == 0:
        return 0.0
    
    ear = (v1 + v2) / (2.0 * h)
    return ear


def calculate_lip_tension(landmarks) -> float:
    """
    Calculate lip tension based on vertical compression.
    Lower values = more compressed lips (potential stress or suppression).
    """
    upper = landmarks[UPPER_LIP_TOP]
    lower = landmarks[LOWER_LIP_BOTTOM]
    left = landmarks[LIP_LEFT_CORNER]
    right = landmarks[LIP_RIGHT_CORNER]
    
    # Vertical lip opening
    vertical = np.linalg.norm(np.array([upper.x, upper.y]) - np.array([lower.x, lower.y]))
    
    # Horizontal lip width
    horizontal = np.linalg.norm(np.array([left.x, left.y]) - np.array([right.x, right.y]))
    
    if horizontal == 0:
        return 0.0
    
    # Tension ratio: lower value = more compressed
    tension = vertical / horizontal
    return tension


def analyze_video(video_path: str) -> Dict[str, Any]:
    """
    Analyze a video file for visual risk indicators.
    
    Args:
        video_path: Path to the video file (.mp4, .webm, etc.)
    
    Returns:
        Dictionary containing risk metrics
    """
    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {video_path}")
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames_raw = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    metadata_valid = True

    try:
        total_frames = int(total_frames_raw)
        if total_frames < 0 or total_frames > 100000:  # Max 100k frames (~1 hr at 30fps)
            metadata_valid = False
            total_frames = 0
    except (ValueError, OverflowError):
        metadata_valid = False
        total_frames = 0
    
    # Validate FPS - many webcams report 0 or garbage in webm
    if fps <= 0 or fps > 240:
        print(f"WARNING: Invalid FPS from metadata ({fps}). Defaulting to 30.0")
        fps = 30.0
    
    duration_seconds = total_frames / fps if (metadata_valid and total_frames > 0) else 0.0
    cap.release()


    EAR_THRESHOLD = 0.21

    # If MediaPipe is unavailable, return empty/error result as requested
    if mp_face_mesh is None:
        print("ERROR: MediaPipe unavailable. Returning empty analysis.")
        return {
            "blink_count": 0,
            "blink_rate_per_min": 0,
            "avg_blink_duration_ms": 0,
            "avg_lip_tension": 0,
            "avg_ear": 0,
            "duration_s": round(duration_seconds, 2),
            "frames_analyzed": 0,
            "analysis_type": "error_mediapipe_unavailable"
        }

    # REAL ANALYSIS
    cap = cv2.VideoCapture(video_path) # Re-open
    
    # Skip length check if metadata is missing/suspicious, we'll check after processing
    if metadata_valid and (total_frames < 5 or duration_seconds < 0.5):
        print(f"WARNING: Video too short for analysis ({duration_seconds}s).")
        cap.release()
        return {
             "blink_count": 0, "blink_rate_per_min": 0, "avg_blink_duration_ms": 0,
             "avg_lip_tension": 0, "avg_ear": 0, "duration_s": round(duration_seconds, 2), 
             "frames_analyzed": 0,
             "analysis_type": "error_video_too_short"
        }

    blink_count = 0
    blink_durations = []
    lip_tensions = []
    ear_values = []
    
    in_blink = False
    blink_start_frame = 0
    
    try:
        with mp_face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        ) as face_mesh:
            
            frame_count = 0
            while cap.isOpened():
                success, frame = cap.read()
                if not success:
                    break
                
                frame_count += 1
                
                # Process every 3rd frame for performance
                if frame_count % 3 != 0:
                    continue
                
                # Convert to RGB
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = face_mesh.process(rgb_frame)
                
                if results and results.multi_face_landmarks:
                    # Get landmarks for the first face detected
                    face_landmarks = results.multi_face_landmarks[0]
                    landmarks = face_landmarks.landmark
                    
                    if landmarks:
                        # Calculate EAR for both eyes
                        left_ear = calculate_ear(landmarks, LEFT_EYE_INDICES)
                        right_ear = calculate_ear(landmarks, RIGHT_EYE_INDICES)
                        avg_ear = (left_ear + right_ear) / 2
                        ear_values.append(avg_ear)
                        
                        # Blink detection
                        if avg_ear < EAR_THRESHOLD:
                            if not in_blink:
                                in_blink = True
                                blink_start_frame = frame_count
                        else:
                            if in_blink:
                                in_blink = False
                                blink_count += 1
                                blink_duration_frames = frame_count - blink_start_frame
                                blink_duration_ms = (blink_duration_frames / fps) * 1000 if fps > 0 else 0
                                blink_durations.append(blink_duration_ms)
                        
                        # Lip tension
                        tension = calculate_lip_tension(landmarks)
                        lip_tensions.append(tension)

    except Exception as e:
        print(f"ERROR during FaceMesh processing: {e}")
    finally:
        cap.release()
    
    # Calculate final metrics using actual frame count if metadata was missing
    if frame_count > 0:
        duration_seconds = frame_count / fps
        
    duration_minutes = duration_seconds / 60 if duration_seconds > 0 else 1.0/60.0
    blink_rate = blink_count / duration_minutes  # blinks per minute
    
    avg_blink_duration = float(np.mean(blink_durations)) if blink_durations else 0.0
    avg_lip_tension = float(np.mean(lip_tensions)) if lip_tensions else 0.0
    avg_ear = float(np.mean(ear_values)) if ear_values else 0.0
    
    return {
        "blink_count": blink_count,
        "blink_rate_per_min": round(blink_rate, 2),
        "avg_blink_duration_ms": round(avg_blink_duration, 2),
        "avg_lip_tension": round(avg_lip_tension, 4),
        "avg_ear": round(avg_ear, 4),
        "duration_s": round(duration_seconds, 2),
        "frames_analyzed": frame_count // 3,
        "analysis_type": "real_mediapipe"
    }
