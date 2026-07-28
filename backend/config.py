"""Runtime configuration, read from environment variables."""

import os

APP_NAME: str = os.getenv("APP_NAME", "wsnet")
APP_VERSION: str = os.getenv("APP_VERSION", "dev")
