"""
Centralized API keys and secrets.
For GitHub/Vercel, set environment variables (e.g., YOUTUBE_API_KEY) instead of editing this file.
"""

import os

# YouTube Data API v3 key (read from environment, fallback to provided key for debugging)
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "YOUTUBE_API_KEY")


