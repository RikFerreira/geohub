"""Runtime configuration, read from environment variables."""

import os

APP_NAME: str = os.getenv("APP_NAME", "geohub")
APP_VERSION: str = os.getenv("APP_VERSION", "dev")

# Shared secret the frontend sends on the webhook. None disables the check.
OPENFLOWS_API_TOKEN: str | None = os.getenv("OPENFLOWS_API_TOKEN")
