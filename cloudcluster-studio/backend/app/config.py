from __future__ import annotations

import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
RESULT_DIR = DATA_DIR / "results"
for directory in (DATA_DIR, UPLOAD_DIR, RESULT_DIR):
    directory.mkdir(parents=True, exist_ok=True)

load_dotenv(BASE_DIR / ".env")


def _jwt_secret() -> str:
    configured = os.getenv("CLOUDCLUSTER_JWT_SECRET")
    if configured:
        if len(configured) < 32:
            raise RuntimeError("CLOUDCLUSTER_JWT_SECRET must contain at least 32 characters")
        return configured
    secret_path = DATA_DIR / ".jwt-secret"
    if secret_path.exists():
        return secret_path.read_text(encoding="utf-8").strip()
    value = secrets.token_urlsafe(48)
    secret_path.write_text(value, encoding="utf-8")
    try:
        secret_path.chmod(0o600)
    except OSError:
        pass
    return value


JWT_SECRET = _jwt_secret()
JWT_ISSUER = "cloudcluster-studio"
JWT_AUDIENCE = "cloudcluster-studio-web"
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = int(os.getenv("CLOUDCLUSTER_ACCESS_MINUTES", "10"))
REFRESH_TOKEN_DAYS = int(os.getenv("CLOUDCLUSTER_REFRESH_DAYS", "7"))
COOKIE_SECURE = os.getenv("CLOUDCLUSTER_COOKIE_SECURE", "false").lower() == "true"
DATABASE_URL = os.getenv("CLOUDCLUSTER_DATABASE_URL", f"sqlite:///{(DATA_DIR / 'cloudcluster.db').as_posix()}")
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
