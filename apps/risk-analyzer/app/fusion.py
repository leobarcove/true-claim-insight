"""
Fusion Scoring Engine

Combines audio and video risk indicators into a unified risk score
by comparing metrics against baseline values and applying weighted scoring.
"""

from typing import Dict, Any, Optional, Tuple


# Default weights for each indicator (can be tuned)
WEIGHTS = {
    "jitter": 0.30,        # Voice instability
    "pitch_sd": 0.15,      # Pitch variation
    "shimmer": 0.10,       # Amplitude variation
    "hnr": 0.10,           # Harmonics-to-Noise Ratio
    "blink_rate": 0.20,    # Eye behavior
    "lip_tension": 0.15,   # Facial tension
}

# Thresholds for HIGH risk (percentage deviation from baseline)
HIGH_RISK_THRESHOLDS = {
    "jitter": 0.50,        # 50% increase
    "pitch_sd": 0.60,      # 60% increase
    "shimmer": 0.50,       # 50% increase
    "blink_rate": 0.40,    # 40% deviation (high or low)
    "lip_tension": -0.30,  # 30% decrease (compression)
}


def calculate_deviation(current: float, baseline: float) -> float:
    """Calculate percentage deviation from baseline."""
    if baseline == 0:
        return 0.0
    return (current - baseline) / baseline


def calculate_risk_score(
    audio_metrics: Optional[Dict[str, Any]],
    video_metrics: Optional[Dict[str, Any]],
    baseline: Dict[str, float]
) -> Tuple[str, float]:
    """
    Calculate a unified risk score by combining audio and video metrics.
    Normal or missing metrics dilute the risk. Pure noise is ignored.
    """
    weighted_score = 0.0
    total_weight = 0.0
    
    # Check for noise-only signal (from audio_analyzer)
    is_noise = audio_metrics.get("is_noise_only") if audio_metrics else False
    
    # 1. Jitter (Vocal Instability)
    if audio_metrics and audio_metrics.get("jitter_percent", 0) > 0 and not is_noise:
        val = audio_metrics["jitter_percent"]
        base = baseline.get("jitter", 0.8)
        dev = max(0, (val - base) / (base * 5))
        weighted_score += dev * WEIGHTS["jitter"]
        total_weight += WEIGHTS["jitter"]
    
    # 2. Pitch Standard Deviation (Voice Stress)
    if audio_metrics and audio_metrics.get("pitch_sd_hz", 0) > 0 and not is_noise:
        val = audio_metrics["pitch_sd_hz"]
        base = baseline.get("pitch_sd", 15.0)
        dev = max(0, (val - base) / (base * 5))
        weighted_score += dev * WEIGHTS["pitch_sd"]
        total_weight += WEIGHTS["pitch_sd"]
        
    # 3. Shimmer (Amplitude Variation)
    if audio_metrics and audio_metrics.get("shimmer_percent", 0) > 0 and not is_noise:
        val = audio_metrics["shimmer_percent"]
        dev = max(0, (val - 3.0) / 10.0)
        weighted_score += dev * WEIGHTS["shimmer"]
        total_weight += WEIGHTS["shimmer"]

    # 4. HNR (Voice Quality) - SKIP IF NOISE ONLY
    if audio_metrics and audio_metrics.get("hnr_db", 0) > 0 and not is_noise:
        val = audio_metrics["hnr_db"]
        # HNR below 12 dB starts indicating poor quality
        dev = max(0, (12 - val) / 15.0)
        weighted_score += dev * WEIGHTS["hnr"]
        total_weight += WEIGHTS["hnr"]
    
    # 5. Blink Rate
    if video_metrics and "blink_rate_per_min" in video_metrics:
        val = video_metrics["blink_rate_per_min"]
        duration = video_metrics.get("duration_s", 0)
        
        if val == 0 and duration < 10.0:
            dev = 0.0
        elif val < 12:
            dev = (12 - val) / 12.0
        elif val > 25:
            dev = (val - 25) / 25.0
        else:
            dev = 0.0
            
        weighted_score += dev * WEIGHTS["blink_rate"]
        total_weight += WEIGHTS["blink_rate"]
        
    # 6. Lip Tension (Compression)
    if video_metrics and video_metrics.get("avg_lip_tension", 0) > 0:
        val = video_metrics["avg_lip_tension"]
        base = baseline.get("lip_tension", 0.45)
        dev = max(0, (base - val) / base)
        contribution = dev if dev > 0.20 else 0.0
        weighted_score += contribution * WEIGHTS["lip_tension"]
        total_weight += WEIGHTS["lip_tension"]
    
    # Calculate final normalized score
    if total_weight > 0:
        normalized_score = weighted_score / total_weight
    else:
        normalized_score = 0.0
    
    if normalized_score > 0.45:
        risk_level = "HIGH"
    elif normalized_score > 0.2:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"
    
    confidence = min(total_weight / sum(WEIGHTS.values()), 1.0)
    
    return risk_level, round(confidence, 2)



