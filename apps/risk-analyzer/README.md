# Risk Analyzer Service

A Python FastAPI service for multimodal behavioral risk analysis using Parselmouth (audio) and MediaPipe (video).

## Dependencies

- Python 3.10+
- FastAPI + Uvicorn
- Parselmouth (Praat interface)
- Librosa (audio processing)
- MediaPipe (face mesh)
- OpenCV (video processing)

## Running the Service

```bash
cd apps/risk-analyzer
pip install -r requirements.txt
uvicorn app.main:app --reload --port 3005
```

## API Endpoints

- `POST /analyze-audio` - Analyze audio file for voice risk indicators
- `POST /analyze-video` - Analyze video file for visual risk indicators
- `POST /analyze-combined` - Full multimodal analysis
- `GET /health` - Health check
