from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from .config import ACCESS_TOKEN_MINUTES, JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER, JWT_SECRET, REFRESH_TOKEN_DAYS
from .database import get_db
from .models import RefreshSession, User, utcnow

password_hasher = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)
DUMMY_PASSWORD_HASH = password_hasher.hash("not-a-real-account-password")


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return password_hasher.verify(password, password_hash)
    except Exception:
        return False


def create_access_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": user.id, "email": user.email, "iat": now, "exp": now + timedelta(minutes=ACCESS_TOKEN_MINUTES), "iss": JWT_ISSUER, "aud": JWT_AUDIENCE, "jti": str(uuid4())}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def issue_refresh_session(db: Session, user: User) -> str:
    token = secrets.token_urlsafe(48)
    session = RefreshSession(id=str(uuid4()), token_hash=_digest(token), user_id=user.id, expires_at=utcnow() + timedelta(days=REFRESH_TOKEN_DAYS))
    db.add(session)
    return token


def rotate_refresh_session(db: Session, token: str | None) -> tuple[User, str] | None:
    if not token:
        return None
    session = db.query(RefreshSession).filter(RefreshSession.token_hash == _digest(token), RefreshSession.revoked.is_(False)).with_for_update().first()
    if not session:
        return None
    expiry = session.expires_at
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    if expiry <= datetime.now(timezone.utc):
        session.revoked = True
        db.commit()
        return None
    session.revoked = True
    user = session.user
    new_token = issue_refresh_session(db, user)
    db.commit()
    return user, new_token


def revoke_refresh_session(db: Session, token: str | None) -> None:
    if token:
        session = db.query(RefreshSession).filter(RefreshSession.token_hash == _digest(token), RefreshSession.revoked.is_(False)).first()
        if session:
            session.revoked = True
            db.commit()


def current_user(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in to continue.", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM], issuer=JWT_ISSUER, audience=JWT_AUDIENCE, options={"require": ["exp", "iat", "sub", "iss", "aud", "jti"]})
        user_id = payload.get("sub")
    except jwt.PyJWTError as error:
        raise HTTPException(status_code=401, detail="Your session has expired. Sign in again.", headers={"WWW-Authenticate": "Bearer"}) from error
    user = db.get(User, user_id) if user_id else None
    if not user:
        raise HTTPException(status_code=401, detail="Your account is no longer available.", headers={"WWW-Authenticate": "Bearer"})
    return user
