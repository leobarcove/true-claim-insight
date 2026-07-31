# True Claim Insight — risk-analyzer (Python FastAPI: Hume, Parselmouth,
# MediaPipe). Built from the REPO ROOT:
#   docker build -f deploy/staging/risk-analyzer.Dockerfile .
#
# python:3.11-slim for maximum published-wheel coverage (mediapipe, scipy).
# ffmpeg for audio extraction; libgl1/libglib2.0-0 are opencv runtime deps.
FROM python:3.11-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg libgl1 libglib2.0-0 curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/risk-analyzer

COPY apps/risk-analyzer/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/risk-analyzer/app ./app

EXPOSE 3005
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3005"]
