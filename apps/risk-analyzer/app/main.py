from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import tempfile
import os

from app.audio_analyzer import analyze_audio
from app.video_analyzer import analyze_video
from app.fusion import calculate_risk_score

app = FastAPI(
    title="Risk Analyzer Service",
    description="Multimodal behavioral risk analysis using Parselmouth and MediaPipe",
    version="1.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalysisResponse(BaseModel):
    success: bool
    risk_score: str  # LOW, MEDIUM, HIGH
    confidence: float
    metrics: dict
    details: Optional[str] = None


class BaselineModel(BaseModel):
    jitter: Optional[float] = None
    pitch_sd: Optional[float] = None
    blink_rate: Optional[float] = None
    lip_tension: Optional[float] = None


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "risk-analyzer"}


@app.post("/analyze-audio", response_model=AnalysisResponse)
async def analyze_audio_endpoint(
    file: UploadFile = File(...),
    baseline_jitter: float = 0.8,
    baseline_pitch_sd: float = 15.0,
):
    """Analyze audio file for voice risk indicators (Jitter, Pitch SD)."""
    if not file.filename.endswith(('.wav', '.mp3', '.m4a', '.webm')):
        raise HTTPException(status_code=400, detail="Unsupported audio format")

    # Save to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        metrics = analyze_audio(tmp_path)
        risk_score, confidence = calculate_risk_score(
            audio_metrics=metrics,
            video_metrics=None,
            baseline={"jitter": baseline_jitter, "pitch_sd": baseline_pitch_sd}
        )
        return AnalysisResponse(
            success=True,
            risk_score=risk_score,
            confidence=confidence,
            metrics=metrics,
            details="Audio analysis complete using Parselmouth."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(tmp_path)


@app.post("/analyze-video", response_model=AnalysisResponse)
async def analyze_video_endpoint(
    file: UploadFile = File(...),
    baseline_blink_rate: float = 17.0,
    baseline_lip_tension: float = 1.0,
):
    """Analyze video file for visual risk indicators (Blink Rate, Lip Tension)."""
    if not file.filename.endswith(('.mp4', '.webm', '.mov')):
        raise HTTPException(status_code=400, detail="Unsupported video format")

    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        metrics = analyze_video(tmp_path)
        risk_score, confidence = calculate_risk_score(
            audio_metrics=None,
            video_metrics=metrics,
            baseline={"blink_rate": baseline_blink_rate, "lip_tension": baseline_lip_tension}
        )
        return AnalysisResponse(
            success=True,
            risk_score=risk_score,
            confidence=confidence,
            metrics=metrics,
            details="Video analysis complete using MediaPipe."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(tmp_path)


@app.post("/analyze-combined", response_model=AnalysisResponse)
async def analyze_combined_endpoint(
    audio_file: UploadFile = File(...),
    video_file: UploadFile = File(...),
    baseline_jitter: float = 0.8,
    baseline_pitch_sd: float = 15.0,
    baseline_blink_rate: float = 17.0,
    baseline_lip_tension: float = 1.0,
):
    """Full multimodal analysis of both audio and video."""
    # Save audio
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(audio_file.filename)[1]) as tmp:
        tmp.write(await audio_file.read())
        audio_path = tmp.name

    # Save video
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(video_file.filename)[1]) as tmp:
        tmp.write(await video_file.read())
        video_path = tmp.name

    try:
        audio_metrics = analyze_audio(audio_path)
        video_metrics = analyze_video(video_path)

        risk_score, confidence = calculate_risk_score(
            audio_metrics=audio_metrics,
            video_metrics=video_metrics,
            baseline={
                "jitter": baseline_jitter,
                "pitch_sd": baseline_pitch_sd,
                "blink_rate": baseline_blink_rate,
                "lip_tension": baseline_lip_tension,
            }
        )

        return AnalysisResponse(
            success=True,
            risk_score=risk_score,
            confidence=confidence,
            metrics={**audio_metrics, **video_metrics},
            details="Combined audio + video analysis complete."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(audio_path)
        os.unlink(video_path)
