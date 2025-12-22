"""
Audio Risk Analyzer using Parselmouth (Praat).

Extracts:
- Jitter (Local %) - Vocal instability
- Pitch Standard Deviation - Voice stress
- Shimmer (%) - Amplitude variation
"""

import parselmouth
from parselmouth.praat import call
import numpy as np
from typing import Dict, Any
import soundfile as sf


def analyze_audio(audio_path: str) -> Dict[str, Any]:
    """
    Analyze an audio file for voice risk indicators.
    
    Args:
        audio_path: Path to the audio file (.wav, .mp3, etc.)
    
    Returns:
        Dictionary containing risk metrics
    """
    # Load with Parselmouth
    sound = parselmouth.Sound(audio_path)
    
    # Get duration
    duration = sound.get_total_duration()
    
    # Get pitch object
    pitch = sound.to_pitch()
    
    # 1. Pitch Standard Deviation (Higher = potential stress)
    try:
        pitch_sd = call(pitch, "Get standard deviation", 0, 0, "Hertz")
        if np.isnan(pitch_sd):
            pitch_sd = 0.0
    except Exception:
        pitch_sd = 0.0
    
    # 2. Jitter (Local) - Vocal instability
    # Higher jitter (> 1.0%) often indicates stress or deception
    try:
        point_process = call(sound, "To PointProcess (periodic, cc)", 75, 500)
        jitter = call(point_process, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3)
        jitter_percent = jitter * 100 if not np.isnan(jitter) else 0.0
    except Exception:
        jitter_percent = 0.0
    
    # 3. Shimmer (amplitude variation) - Voice tremor
    try:
        shimmer = call([sound, point_process], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
        shimmer_percent = shimmer * 100 if not np.isnan(shimmer) else 0.0
    except Exception:
        shimmer_percent = 0.0
    
    # 4. Mean Pitch
    try:
        mean_pitch = call(pitch, "Get mean", 0, 0, "Hertz")
        if np.isnan(mean_pitch):
            mean_pitch = 0.0
    except Exception:
        mean_pitch = 0.0
    
    # 5. Harmonics-to-Noise Ratio (voice quality)
    try:
        harmonicity = sound.to_harmonicity()
        hnr = call(harmonicity, "Get mean", 0, 0)
        if np.isnan(hnr):
            hnr = 0.0
    except Exception:
        hnr = 0.0
    
    return {
        "jitter_percent": round(jitter_percent, 3),
        "shimmer_percent": round(shimmer_percent, 3),
        "pitch_sd_hz": round(pitch_sd, 2),
        "mean_pitch_hz": round(mean_pitch, 2),
        "hnr_db": round(hnr, 2),
        "duration_s": round(duration, 2),
    }

