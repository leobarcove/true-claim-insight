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
    
    Args:
        audio_metrics: Output from audio_analyzer.analyze_audio()
        video_metrics: Output from video_analyzer.analyze_video()
        baseline: Baseline values for comparison
    
    Returns:
        Tuple of (risk_level: str, confidence: float)
    """
    deviations = {}
    weighted_score = 0.0
    total_weight = 0.0
    
    # Process audio metrics
    if audio_metrics:
        if "jitter_percent" in audio_metrics and "jitter" in baseline:
            dev = calculate_deviation(audio_metrics["jitter_percent"], baseline["jitter"])
            deviations["jitter"] = dev
            weighted_score += abs(dev) * WEIGHTS["jitter"]
            total_weight += WEIGHTS["jitter"]
        
        if "pitch_sd_hz" in audio_metrics and "pitch_sd" in baseline:
            dev = calculate_deviation(audio_metrics["pitch_sd_hz"], baseline["pitch_sd"])
            deviations["pitch_sd"] = dev
            weighted_score += abs(dev) * WEIGHTS["pitch_sd"]
            total_weight += WEIGHTS["pitch_sd"]
        
        if "shimmer_percent" in audio_metrics:
            # No baseline for shimmer, use absolute threshold
            shimmer = audio_metrics["shimmer_percent"]
            if shimmer > 3.0:  # Shimmer > 3% is typically abnormal
                deviations["shimmer"] = shimmer / 3.0 - 1
                weighted_score += (shimmer / 3.0) * WEIGHTS["shimmer"]
                total_weight += WEIGHTS["shimmer"]
        
        if "pause_duration_s" in audio_metrics:
            pause = audio_metrics["pause_duration_s"]
            if pause > 1.5:  # Long pauses
                deviations["pause_duration"] = pause / 1.5 - 1
                weighted_score += (pause / 1.5) * WEIGHTS["pause_duration"]
                total_weight += WEIGHTS["pause_duration"]
    
    # Process video metrics
    if video_metrics:
        if "blink_rate_per_min" in video_metrics and "blink_rate" in baseline:
            # Blink rate: abnormal if too high OR too low
            current = video_metrics["blink_rate_per_min"]
            normal_min, normal_max = 12, 25  # Normal range
            
            if current < normal_min:
                dev = (normal_min - current) / normal_min  # Under-blinking
            elif current > normal_max:
                dev = (current - normal_max) / normal_max  # Over-blinking
            else:
                dev = 0.0
            
            deviations["blink_rate"] = dev
            weighted_score += abs(dev) * WEIGHTS["blink_rate"]
            total_weight += WEIGHTS["blink_rate"]
        
        if "avg_lip_tension" in video_metrics and "lip_tension" in baseline:
            dev = calculate_deviation(video_metrics["avg_lip_tension"], baseline["lip_tension"])
            # Negative deviation (compression) is the risk indicator
            deviations["lip_tension"] = dev
            if dev < -0.15:  # More than 15% compression
                weighted_score += abs(dev) * WEIGHTS["lip_tension"]
                total_weight += WEIGHTS["lip_tension"]
    
    # Normalize weighted score
    if total_weight > 0:
        normalized_score = weighted_score / total_weight
    else:
        normalized_score = 0.0
    
    # Determine risk level
    if normalized_score > 0.6:
        risk_level = "HIGH"
    elif normalized_score > 0.3:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"
    
    # Confidence is based on how much data we had
    confidence = min(total_weight / sum(WEIGHTS.values()), 1.0)
    
    return risk_level, round(confidence, 2)
