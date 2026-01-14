from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import tempfile
import os
import asyncio

from app.audio_analyzer import analyze_audio
from app.video_analyzer import analyze_video
from app.hume_analyzer import HumeAnalyzer, calculate_hume_risk_score
from app.fusion import calculate_risk_score
from app.pdf_generator import generate_consent_form

# HumeAI & Supabase Integration
import time
import httpx
import uuid
from hume import AsyncHumeClient
from app.config import config

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

# Singleton client
hume_analyzer = HumeAnalyzer()

@app.on_event("startup")
async def startup_event():
    """Connect to Hume AI Stream on startup."""
    try:
        global hume_analyzer
        await hume_analyzer._connect()
    except Exception as e:
        print(f"Warning: Failed to connect to Hume on startup: {e}")

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
    sessionId: str = "unknown",
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
        # Run Parselmouth Analysis (Existing)
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
            details="Audio analysis complete using Parselmouth & HumeAI."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

async def _upload_to_supabase(file_path: str, session_id: str, claim_id: str = "unknown", bucket_name: str = None) -> str:
    """Upload file to Supabase Storage."""
    if bucket_name is None:
        bucket_name = config.SUPABASE_BUCKET_NAME

    if not claim_id:
        claim_id = "unknown"
    base_url = config.SUPABASE_URL.rstrip('/')
    timestamp = int(time.time())
    ext = os.path.splitext(file_path)[1].lower()
    file_name = f"{session_id}_{timestamp}{ext}"
    storage_path = f"document/{claim_id}/{file_name}"
    
    url = f"{base_url}/storage/v1/object/{bucket_name}/{storage_path}"
    headers = {
        "Authorization": f"Bearer {config.SUPABASE_SERVICE_ROLE_KEY}",
        "x-upsert": "true",
        "Content-Type": "application/pdf" if ext == ".pdf" else "application/octet-stream"
    }
    
    async with httpx.AsyncClient() as client:
        with open(file_path, 'rb') as f:
            file_content = f.read()
            
        resp = await client.post(url, content=file_content, headers=headers)
        if not resp.is_success:
            print(f"[_upload_to_supabase] Upload failed: {resp.text}")
        resp.raise_for_status()
            
    return storage_path


class GenerateConsentRequest(BaseModel):
    sessionId: str
    claimId: Optional[str] = None
    claimant: dict
    claim: dict
    analysis: Optional[dict] = {}
    adjuster: Optional[dict] = {}

@app.post("/generate-consent-pdf")
async def generate_consent_pdf_endpoint(request: GenerateConsentRequest):
    """Generate consent PDF and upload to Supabase."""
    pdf_path = None
    try:
        data = request.dict()
        pdf_path = generate_consent_form(data)
        
        # Ensure bucket exists in Supabase.
        bucket_name = "consent_form"
        storage_path = await _upload_to_supabase(pdf_path, request.sessionId, claim_id=request.claimId, bucket_name=bucket_name)
        file_size = os.path.getsize(pdf_path)
        signed_url = await _get_signed_url(storage_path, bucket_name=bucket_name)
        print(f"[GenerateConsent] Uploaded to storage path: {signed_url}, Size: {file_size} bytes")
        
        return {
             "success": True,
             "storage_path": storage_path,
             "bucket": bucket_name,
             "signed_url": signed_url,
             "file_size": file_size
        }
    except httpx.HTTPStatusError as e:
        print(f"[GenerateConsent] Supabase API Error: {e.response.text}")
        raise HTTPException(status_code=500, detail=f"Supabase Error: {e.response.text}")
    except Exception as e:
        print(f"[GenerateConsent] Unexpected Error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if pdf_path and os.path.exists(pdf_path):
            os.unlink(pdf_path)

async def _get_signed_url(storage_path: str, bucket_name: str = None, expires_in: int = 31536000) -> str:
    """Generate a signed URL for a private file in Supabase Storage."""
    if bucket_name is None:
        bucket_name = config.SUPABASE_BUCKET_NAME
        
    base_url = config.SUPABASE_URL.rstrip('/')
    url = f"{base_url}/storage/v1/object/sign/{bucket_name}/{storage_path}"    
    headers = {
        "Authorization": f"Bearer {config.SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json"
    }
    
    # Default: 1 year = 31536000 seconds
    payload = {"expiresIn": expires_in}
    
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json=payload, headers=headers)
        if not resp.is_success:
            print(f"[_get_signed_url] Error Response: {resp.text}")
            resp.raise_for_status()
            
        data = resp.json()
        
    signed_url = data.get("signedURL") or data.get("signedUrl")
    if not signed_url:
        raise ValueError(f"Failed to generate signed URL. Response: {data}")

    # Ensure it's a full URL
    if signed_url.startswith('/'):
        signed_url = f"{base_url}/storage/v1{signed_url}"
        
    return signed_url

async def analyze_with_hume(file_path: str, session_id: str = "default"):
    try:
        if not config.HUME_API_KEY:
             print("HumeAI Error: HUME_API_KEY not configured")
             return None
             
        client = AsyncHumeClient(api_key=config.HUME_API_KEY)
        
        # 1. Upload to Supabase and get signed URL
        storage_path = await _upload_to_supabase(file_path, session_id, claim_id="unknown")
        signed_url = await _get_signed_url(storage_path)
        print(f"File uploaded to Supabase, signed URL generated (valid for 1 year)")

        # 2. Configure Prosody model for Audio
        from hume.expression_measurement.batch import Models
        from hume.expression_measurement.batch.types import Prosody
        models = Models(prosody=Prosody())
        
        # 3. Start Inference Job using URLs
        # Correct argument for URLs is 'urls' in AsyncBatchClient.start_inference_job
        job_id = await client.expression_measurement.batch.start_inference_job(
            models=models,
            urls=[signed_url]
        )
        print(f"Hume Job Started: {job_id}")
        
        # Poll for completion
        timeout = 60
        start_time = asyncio.get_event_loop().time()
        
        while (asyncio.get_event_loop().time() - start_time) < timeout:
            job_details = await client.expression_measurement.batch.get_job_details(job_id)
            status = job_details.state.status
            
            if status == "COMPLETED":
                break
            if status == "FAILED":
                print(f"Hume Job Failed: {job_details.state.message}")
                return None
                
            await asyncio.sleep(2)
        else:
            print("Hume Job Timed Out")
            return None
            
        # Get Predictions
        job_predictions = await client.expression_measurement.batch.get_job_predictions(id=job_id)
        
        top_emotions = []
        if job_predictions and job_predictions[0].results:
            emotions_sum = {}
            total_segments = 0
            
            for file_pred in job_predictions:
                if not file_pred.results or not file_pred.results.predictions:
                    continue
                for prediction in file_pred.results.predictions:
                     if hasattr(prediction.models, 'prosody') and prediction.models.prosody:
                        for grouped in prediction.models.prosody.grouped_predictions:
                            for segment in grouped.predictions:
                                total_segments += 1
                                for emotion in segment.emotions:
                                    emotions_sum[emotion.name] = emotions_sum.get(emotion.name, 0) + emotion.score
            
            if total_segments > 0:
                for name in emotions_sum:
                    emotions_sum[name] /= total_segments

                sorted_emotions = sorted(emotions_sum.items(), key=lambda x: x[1], reverse=True)
                top_emotions = [{"name": k, "score": round(v, 4)} for k, v in sorted_emotions[:5]]
            
        return top_emotions

    except Exception as e:
        print(f"HumeAI Error: {e}")
        return None


@app.post("/analyze-video", response_model=AnalysisResponse)
async def analyze_video_endpoint(
    file: UploadFile = File(...),
    baseline_blink_rate: float = 17.0,
    baseline_lip_tension: float = 0.45,
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


@app.post("/analyze-expression", response_model=AnalysisResponse)
async def analyze_expression_endpoint(
    file: UploadFile = File(...),
    sessionId: str = "unknown",
    noAudio: bool = False
):
    """Analyze video file for facial expressions using HumeAI."""
    if not file.filename.endswith(('.mp4', '.webm', '.mov')):
        raise HTTPException(status_code=400, detail="Unsupported video format")

    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Analyze using Hume
        metrics = await hume_analyzer.analyze_video(tmp_path, has_audio=not noAudio)
        
        # Calculate risk score specifically for Hume metrics
        risk_score, confidence = calculate_hume_risk_score(metrics)
        
        return AnalysisResponse(
            success=True,
            risk_score=risk_score,
            confidence=confidence,
            metrics=metrics,
            details="Expression analysis complete using HumeAI."
        )
    except Exception as e:
        print(f"[AnalyzeExpression] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
