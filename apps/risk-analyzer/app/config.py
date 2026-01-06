"""
Configuration loader for Risk Analyzer Service.
Loads environment variables and provides configuration access.
"""

import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class Config:
    """Application configuration."""
    
    # HumeAI Configuration
    HUME_API_KEY: str = os.getenv("HUME_API_KEY", "")
    
    # Analysis timeouts (seconds)
    HUME_JOB_TIMEOUT: int = int(os.getenv("HUME_JOB_TIMEOUT", "120"))
    HUME_POLL_INTERVAL: int = int(os.getenv("HUME_POLL_INTERVAL", "2"))
    
    # Risk thresholds
    HIGH_RISK_EMOTION_THRESHOLD: float = float(os.getenv("HIGH_RISK_EMOTION_THRESHOLD", "0.7"))
    MEDIUM_RISK_EMOTION_THRESHOLD: float = float(os.getenv("MEDIUM_RISK_EMOTION_THRESHOLD", "0.4"))

    
    # Supabase Configuration
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    SUPABASE_BUCKET_NAME: str = os.getenv("SUPABASE_BUCKET_NAME", "risk_analysis")
    
    @classmethod
    def validate(cls):
        """Validate required configuration."""
        if not cls.HUME_API_KEY:
            raise ValueError("HUME_API_KEY environment variable is required")
        return True


# Create singleton instance
config = Config()
