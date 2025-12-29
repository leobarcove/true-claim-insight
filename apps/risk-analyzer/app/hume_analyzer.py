"""
HumeAI Expression Measurement Analyzer.

Integrates HumeAI's Batch API for:
- Prosody analysis (voice emotions and vocal features)
- Face analysis (facial expressions and emotions)
- Combined multimodal analysis

Uses async job pattern: submit → poll → extract results
"""

import asyncio
import tempfile
import os
from datetime import datetime
from typing import Dict, Any, List, Tuple, Optional
from hume import AsyncHumeClient
from hume.expression_measurement.batch import Face, Prosody, Models
from hume.expression_measurement.batch.types import UnionPredictResult

from app.config import config


class HumeAnalyzer:
    """HumeAI-based emotion and expression analyzer."""
    
    def __init__(self):
        """Initialize HumeAI client."""
        if not config.HUME_API_KEY:
            raise ValueError("HUME_API_KEY not configured")
        
        self.api_key = config.HUME_API_KEY
        self.timeout = config.HUME_JOB_TIMEOUT
        self.poll_interval = config.HUME_POLL_INTERVAL
    
    async def analyze_audio(self, audio_path: str) -> Dict[str, Any]:
        """
        Analyze audio file for vocal prosody and emotions.
        
        Args:
            audio_path: Path to audio file (.wav, .mp3, .webm, etc.)
        
        Returns:
            Dictionary containing prosody metrics and emotion scores
        """
        client = AsyncHumeClient(api_key=self.api_key)
        
        try:
            # Upload file and create job
            prosody_config = Prosody()
            models = Models(prosody=prosody_config)
            
            # Start inference job with file
            with open(audio_path, 'rb') as f:
                job_id = await client.expression_measurement.batch.start_inference_job_from_local_file(
                    file=f,
                    models=models
                )
            
            print(f"[HumeAnalyzer] Audio job started: {job_id}")
            
            # Poll for completion
            await self._poll_until_complete(client, job_id)
            
            # Get predictions
            predictions = await client.expression_measurement.batch.get_job_predictions(id=job_id)
            
            # Extract and process results
            metrics = self._extract_prosody_metrics(predictions)
            
            return metrics
            
        except Exception as e:
            print(f"[HumeAnalyzer] Audio analysis failed: {e}")
            raise
    
    async def analyze_video(self, video_path: str) -> Dict[str, Any]:
        """
        Analyze video file for facial expressions and emotions.
        
        Args:
            video_path: Path to video file (.mp4, .webm, .mov, etc.)
        
        Returns:
            Dictionary containing face metrics and emotion scores
        """
        client = AsyncHumeClient(api_key=self.api_key)
        
        try:
            # Upload file and create job
            face_config = Face()
            models = Models(face=face_config)
            
            # Start inference job with file
            with open(video_path, 'rb') as f:
                job_id = await client.expression_measurement.batch.start_inference_job_from_local_file(
                    file=f,
                    models=models
                )
            
            print(f"[HumeAnalyzer] Video job started: {job_id}")
            
            # Poll for completion
            await self._poll_until_complete(client, job_id)
            
            # Get predictions
            predictions = await client.expression_measurement.batch.get_job_predictions(id=job_id)
            
            # Extract and process results
            metrics = self._extract_face_metrics(predictions)
            
            return metrics
            
        except Exception as e:
            print(f"[HumeAnalyzer] Video analysis failed: {e}")
            raise
    
    async def analyze_combined(self, audio_path: str, video_path: str) -> Dict[str, Any]:
        """
        Analyze both audio and video for comprehensive multimodal analysis.
        
        Args:
            audio_path: Path to audio file
            video_path: Path to video file
        
        Returns:
            Combined metrics from both prosody and face analysis
        """
        # Run both analyses concurrently
        audio_task = self.analyze_audio(audio_path)
        video_task = self.analyze_video(video_path)
        
        audio_metrics, video_metrics = await asyncio.gather(audio_task, video_task)
        
        # Combine results
        combined = {
            **audio_metrics,
            **video_metrics,
            "analysis_type": "combined",
            "timestamp": datetime.utcnow().isoformat()
        }
        
        return combined
    
    async def _poll_until_complete(self, client: AsyncHumeClient, job_id: str):
        """
        Poll job status until completion or timeout.
        
        Args:
            client: HumeAI client instance
            job_id: Job ID to poll
        
        Raises:
            TimeoutError: If job doesn't complete within timeout
            RuntimeError: If job fails
        """
        try:
            await asyncio.wait_for(
                self._poll_loop(client, job_id),
                timeout=self.timeout
            )
        except asyncio.TimeoutError:
            raise TimeoutError(f"HumeAI job {job_id} timed out after {self.timeout}s")
    
    async def _poll_loop(self, client: AsyncHumeClient, job_id: str):
        """Internal polling loop."""
        delay = 1  # Start with 1 second
        
        while True:
            await asyncio.sleep(delay)
            
            details = await client.expression_measurement.batch.get_job_details(job_id)
            status = details.state.status
            
            print(f"[HumeAnalyzer] Job {job_id} status: {status}")
            
            if status == "COMPLETED":
                return
            elif status == "FAILED":
                error_msg = details.state.message if hasattr(details.state, 'message') else "Unknown error"
                raise RuntimeError(f"HumeAI job failed: {error_msg}")
            
            # Exponential backoff, max 8 seconds
            delay = min(delay * 1.5, 8)
    
    def _extract_prosody_metrics(self, predictions: List[UnionPredictResult]) -> Dict[str, Any]:
        """
        Extract prosody metrics and emotions from HumeAI predictions.
        
        Returns:
            Dictionary with top emotions, scores, and prosody features
        """
        all_emotions = {}
        emotion_counts = {}
        
        # Aggregate emotions across all predictions
        for file_prediction in predictions:
            if not hasattr(file_prediction, 'results') or not file_prediction.results.predictions:
                continue
            
            for prediction in file_prediction.results.predictions:
                if not hasattr(prediction, 'models') or not hasattr(prediction.models, 'prosody'):
                    continue
                
                prosody_predictions = prediction.models.prosody.grouped_predictions
                
                for group in prosody_predictions:
                    for prosody_pred in group.predictions:
                        for emotion in prosody_pred.emotions:
                            emotion_name = emotion.name
                            emotion_score = emotion.score
                            
                            if emotion_name not in all_emotions:
                                all_emotions[emotion_name] = 0
                                emotion_counts[emotion_name] = 0
                            
                            all_emotions[emotion_name] += emotion_score
                            emotion_counts[emotion_name] += 1
        
        # Calculate averages
        avg_emotions = {
            name: all_emotions[name] / emotion_counts[name]
            for name in all_emotions
        }
        
        # Get top 5 emotions
        top_emotions = sorted(
            avg_emotions.items(),
            key=lambda x: x[1],
            reverse=True
        )[:5]
        
        # Calculate risk indicators
        high_risk_emotions = ['Anger', 'Fear', 'Anxiety', 'Distress', 'Contempt', 'Disgust']
        risk_sum = sum(avg_emotions.get(e, 0) for e in high_risk_emotions)
        
        return {
            "provider": "HumeAI-Prosody",
            "model": "prosody",
            "top_emotions": [{"name": name, "score": round(score, 4)} for name, score in top_emotions],
            "all_emotions": {k: round(v, 4) for k, v in avg_emotions.items()},
            "risk_emotion_sum": round(risk_sum, 4),
            "emotion_count": len(avg_emotions),
            "timestamp": datetime.utcnow().isoformat()
        }
    
    def _extract_face_metrics(self, predictions: List[UnionPredictResult]) -> Dict[str, Any]:
        """
        Extract face metrics and emotions from HumeAI predictions.
        
        Returns:
            Dictionary with top emotions, scores, and face features
        """
        all_emotions = {}
        emotion_counts = {}
        frame_count = 0
        
        # Aggregate emotions across all predictions
        for file_prediction in predictions:
            if not hasattr(file_prediction, 'results') or not file_prediction.results.predictions:
                continue
            
            for prediction in file_prediction.results.predictions:
                if not hasattr(prediction, 'models') or not hasattr(prediction.models, 'face'):
                    continue
                
                face_predictions = prediction.models.face.grouped_predictions
                
                for group in face_predictions:
                    for face_pred in group.predictions:
                        frame_count += 1
                        
                        for emotion in face_pred.emotions:
                            emotion_name = emotion.name
                            emotion_score = emotion.score
                            
                            if emotion_name not in all_emotions:
                                all_emotions[emotion_name] = 0
                                emotion_counts[emotion_name] = 0
                            
                            all_emotions[emotion_name] += emotion_score
                            emotion_counts[emotion_name] += 1
        
        # Calculate averages
        avg_emotions = {
            name: all_emotions[name] / emotion_counts[name]
            for name in all_emotions
        }
        
        # Get top 5 emotions
        top_emotions = sorted(
            avg_emotions.items(),
            key=lambda x: x[1],
            reverse=True
        )[:5]
        
        # Calculate risk indicators
        high_risk_emotions = ['Anger', 'Fear', 'Anxiety', 'Distress', 'Contempt', 'Disgust']
        risk_sum = sum(avg_emotions.get(e, 0) for e in high_risk_emotions)
        
        return {
            "provider": "HumeAI-Face",
            "model": "face",
            "top_emotions": [{"name": name, "score": round(score, 4)} for name, score in top_emotions],
            "all_emotions": {k: round(v, 4) for k, v in avg_emotions.items()},
            "risk_emotion_sum": round(risk_sum, 4),
            "frames_analyzed": frame_count,
            "emotion_count": len(avg_emotions),
            "timestamp": datetime.utcnow().isoformat()
        }


def calculate_hume_risk_score(metrics: Dict[str, Any]) -> Tuple[str, float]:
    """
    Calculate risk score from HumeAI metrics.
    
    Args:
        metrics: HumeAI analysis metrics
    
    Returns:
        Tuple of (risk_score, confidence)
    """
    risk_sum = metrics.get("risk_emotion_sum", 0)
    emotion_count = metrics.get("emotion_count", 1)
    
    # Confidence based on number of emotions detected
    confidence = min(0.95, 0.5 + (emotion_count / 100))
    
    # Risk score thresholds
    if risk_sum > config.HIGH_RISK_EMOTION_THRESHOLD:
        return "HIGH", confidence
    elif risk_sum > config.MEDIUM_RISK_EMOTION_THRESHOLD:
        return "MEDIUM", confidence
    else:
        return "LOW", confidence


# Synchronous wrapper for FastAPI
def analyze_audio_sync(audio_path: str) -> Dict[str, Any]:
    """Synchronous wrapper for audio analysis."""
    analyzer = HumeAnalyzer()
    return asyncio.run(analyzer.analyze_audio(audio_path))


def analyze_video_sync(video_path: str) -> Dict[str, Any]:
    """Synchronous wrapper for video analysis."""
    analyzer = HumeAnalyzer()
    return asyncio.run(analyzer.analyze_video(video_path))


def analyze_combined_sync(audio_path: str, video_path: str) -> Dict[str, Any]:
    """Synchronous wrapper for combined analysis."""
    analyzer = HumeAnalyzer()
    return asyncio.run(analyzer.analyze_combined(audio_path, video_path))
