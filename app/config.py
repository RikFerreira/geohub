"""Runtime configuration, read from environment variables."""

import os

APP_NAME: str = os.getenv("APP_NAME", "geohub")
APP_VERSION: str = os.getenv("APP_VERSION", "dev")

# Portal holding the group, and the account allowed to publish into it.
# Reading the survey layer is anonymous; publishing is not.
ARCGIS_URL: str = os.getenv("ARCGIS_URL", "https://www.arcgis.com")
ARCGIS_USERNAME: str | None = os.getenv("ARCGIS_USERNAME")
ARCGIS_PASSWORD: str | None = os.getenv("ARCGIS_PASSWORD")
