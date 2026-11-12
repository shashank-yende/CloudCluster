from __future__ import annotations

import json
import os
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from time import monotonic
from uuid import uuid4

from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from .config import ACCESS_TOKEN_MINUTES, COOKIE_SECURE, MAX_UPLOAD_BYTES, REFRESH_TOKEN_DAYS, RESULT_DIR
from .database import Base, engine, get_db
from .executor import execute_workload
from .models import User, Workload
from .registry import TASKS, public_task
from .scheduler import worker_snapshot
from .schemas import AuthResponse, LoginRequest, RegisterRequest, UserView, WorkloadView
from .security import DUMMY_PASSWORD_HASH, create_access_token, current_user, hash_password, issue_refresh_session, revoke_refresh_session, rotate_refresh_session, verify_password

Base.metadata.create_all(bind=engine)

app = FastAPI(title="CloudCluster Studio API", description="A practical, secure workload control plane.", version="1.0.0")
allowed_origins = ["http://127.0.0.1:5174", "http://localhost:5174"]
extra_origins = os.getenv("CLOUDCLUSTER_CORS_ORIGINS", "")
allowed_origins.extend(origin.strip() for origin in extra_origins.split(",") if origin.strip())
app.add_middleware(CORSMiddleware, allow_origins=allowed_origins, allow_credentials=True, allow_methods=["GET", "POST", "DELETE", "OPTIONS"], allow_headers=["Authorization", "Content-Type"])
login_attempts: dict[str, deque[float]] = defaultdict(deque)


def _check_login_rate(request: Request) -> str:
    key = request.client.host if request.client else "unknown"
    attempts = login_attempts[key]
    now = monotonic()
    while attempts and now - attempts[0] > 300:
        attempts.popleft()
    if len(attempts) >= 8:
        raise HTTPException(status_code=429, detail="Too many sign-in attempts. Wait a few minutes and try again.", headers={"Retry-After": "300"})
    return key


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.path.startswith("/api/auth/"):
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


def _user_view(user: User) -> UserView:
    created_at = user.created_at.replace(tzinfo=timezone.utc) if user.created_at.tzinfo is None else user.created_at
    return UserView(id=user.id, name=user.name, email=user.email, created_at=created_at)


def _auth_payload(user: User) -> AuthResponse:
    return AuthResponse(access_token=create_access_token(user), expires_in=ACCESS_TOKEN_MINUTES * 60, user=_user_view(user))


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie("cc_refresh", token, max_age=REFRESH_TOKEN_DAYS * 24 * 60 * 60, httponly=True, secure=COOKIE_SECURE, samesite="strict", path="/api/auth")


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie("cc_refresh", path="/api/auth", httponly=True, secure=COOKIE_SECURE, samesite="strict")


def _as_workload(workload: Workload) -> WorkloadView:
    try:
        result = json.loads(workload.result_json or "{}")
    except json.JSONDecodeError:
        result = {}
    def as_utc(value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    return WorkloadView(id=workload.id, task_type=workload.task_type, title=workload.title, status=workload.status, input_name=workload.input_name, result=result, error_message=workload.error_message, worker_id=workload.worker_id, algorithm=workload.algorithm, progress=workload.progress, duration_ms=workload.duration_ms, created_at=as_utc(workload.created_at), started_at=as_utc(workload.started_at), finished_at=as_utc(workload.finished_at), artifact_name=workload.artifact_name)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "cloudcluster-studio", "time": datetime.now(timezone.utc).isoformat()}


@app.get("/api/workload-types")
def workload_types():
    return [public_task(task_id, spec) for task_id, spec in TASKS.items()]


@app.post("/api/auth/register", response_model=AuthResponse, status_code=201)
def register(body: RegisterRequest, response: Response, db: Session = Depends(get_db)):
    email = str(body.email).strip().lower()
    existing = db.query(User).filter(func.lower(User.email) == email).first()
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user = User(id=str(uuid4()), email=email, name=body.name.strip(), password_hash=hash_password(body.password))
    db.add(user)
    db.flush()
    refresh_token = issue_refresh_session(db, user)
    db.commit()
    db.refresh(user)
    _set_refresh_cookie(response, refresh_token)
    return _auth_payload(user)


@app.post("/api/auth/login", response_model=AuthResponse)
def login(body: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    rate_key = _check_login_rate(request)
    email = str(body.email).strip().lower()
    user = db.query(User).filter(func.lower(User.email) == email).first()
    password_ok = verify_password(body.password, user.password_hash) if user else verify_password(body.password, DUMMY_PASSWORD_HASH)
    if not user or not password_ok:
        login_attempts[rate_key].append(monotonic())
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    login_attempts.pop(rate_key, None)
    refresh_token = issue_refresh_session(db, user)
    db.commit()
    _set_refresh_cookie(response, refresh_token)
    return _auth_payload(user)


@app.post("/api/auth/refresh", response_model=AuthResponse)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    rotated = rotate_refresh_session(db, request.cookies.get("cc_refresh"))
    if not rotated:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="Your session has expired. Sign in again.")
    user, token = rotated
    _set_refresh_cookie(response, token)
    return _auth_payload(user)


@app.post("/api/auth/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    revoke_refresh_session(db, request.cookies.get("cc_refresh"))
    _clear_refresh_cookie(response)
    response.status_code = 204
    return response


@app.get("/api/auth/me", response_model=UserView)
def me(user: User = Depends(current_user)):
    return _user_view(user)


@app.get("/api/dashboard")
def dashboard(user: User = Depends(current_user), db: Session = Depends(get_db)):
    query = db.query(Workload).filter(Workload.owner_id == user.id)
    total = query.count()
    completed = query.filter(Workload.status == "completed").count()
    failed = query.filter(Workload.status == "failed").count()
    running = query.filter(Workload.status == "running").count()
    queued = query.filter(Workload.status == "queued").count()
    avg_duration = db.query(func.avg(Workload.duration_ms)).filter(Workload.owner_id == user.id, Workload.status == "completed").scalar() or 0
    now = datetime.now(timezone.utc)
    chart = []
    for offset in range(6, -1, -1):
        day = (now - timedelta(days=offset)).date()
        count = query.filter(func.date(Workload.created_at) == day.isoformat()).count()
        chart.append({"day": day.strftime("%a"), "workloads": count})
    recent = query.order_by(Workload.created_at.desc()).limit(6).all()
    finished = completed + failed
    return {"metrics": {"total": total, "completed": completed, "failed": failed, "running": running, "queued": queued, "success_rate": round((completed / finished) * 100) if finished else None, "avg_duration_ms": round(avg_duration)}, "activity": chart, "recent": [_as_workload(item).model_dump(mode="json") for item in recent], "workers": worker_snapshot(db)}


@app.get("/api/workers")
def workers(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return worker_snapshot(db)


@app.get("/api/workloads", response_model=list[WorkloadView])
def list_workloads(status_filter: str | None = None, task: str | None = None, limit: int = 100, user: User = Depends(current_user), db: Session = Depends(get_db)):
    query = db.query(Workload).filter(Workload.owner_id == user.id)
    if status_filter in {"queued", "running", "completed", "failed"}:
        query = query.filter(Workload.status == status_filter)
    if task in TASKS:
        query = query.filter(Workload.task_type == task)
    return [_as_workload(item) for item in query.order_by(Workload.created_at.desc()).limit(min(max(limit, 1), 200)).all()]


@app.post("/api/workloads", response_model=WorkloadView, status_code=202)
async def submit_workload(
    background_tasks: BackgroundTasks,
    task_type: str = Form(...),
    url: str = Form(""),
    title: str = Form(""),
    max_edge: int = Form(1800),
    file: UploadFile | None = File(None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    spec = TASKS.get(task_type)
    if not spec:
        raise HTTPException(status_code=422, detail="Choose one of the available workload types.")
    payload_buffer = bytearray()
    if file:
        while chunk := await file.read(64 * 1024):
            payload_buffer.extend(chunk)
            if len(payload_buffer) > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="Files must be smaller than 20 MB.")
    payload = bytes(payload_buffer)
    input_name = file.filename if file and file.filename else (url.strip()[:255] if task_type == "link-qr" else "")
    clean_title = " ".join(title.split())[:160] if title.strip() else spec["title"]
    options = {"url": url, "max_edge": max_edge}
    workload = Workload(id=str(uuid4()), owner_id=user.id, task_type=task_type, title=clean_title, status="queued", input_name=input_name[:255], input_json=json.dumps({"url": url} if task_type == "link-qr" else {"filename": input_name}), result_json="{}", progress=0)
    db.add(workload)
    db.commit()
    db.refresh(workload)
    background_tasks.add_task(execute_workload, workload.id, payload, input_name, options)
    return _as_workload(workload)


@app.get("/api/workloads/{workload_id}", response_model=WorkloadView)
def get_workload(workload_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    workload = db.query(Workload).filter(Workload.id == workload_id, Workload.owner_id == user.id).first()
    if not workload:
        raise HTTPException(status_code=404, detail="Workload not found.")
    return _as_workload(workload)


@app.get("/api/workloads/{workload_id}/artifact")
def download_artifact(workload_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    workload = db.query(Workload).filter(Workload.id == workload_id, Workload.owner_id == user.id).first()
    if not workload or workload.status != "completed" or not workload.artifact_path:
        raise HTTPException(status_code=404, detail="No finished artifact is available.")
    artifact = Path(workload.artifact_path).resolve()
    if not artifact.is_relative_to(RESULT_DIR.resolve()) or not artifact.is_file():
        raise HTTPException(status_code=404, detail="No finished artifact is available.")
    return FileResponse(artifact, filename=workload.artifact_name, media_type=json.loads(workload.result_json or "{}").get("mime_type", "application/octet-stream"))


@app.delete("/api/workloads/{workload_id}", status_code=204)
def delete_workload(workload_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    workload = db.query(Workload).filter(Workload.id == workload_id, Workload.owner_id == user.id).first()
    if not workload:
        raise HTTPException(status_code=404, detail="Workload not found.")
    if workload.status in {"queued", "running"}:
        raise HTTPException(status_code=409, detail="Wait for this workload to finish before deleting it.")
    if workload.artifact_path:
        artifact = Path(workload.artifact_path).resolve()
        if artifact.is_relative_to(RESULT_DIR.resolve()) and artifact.is_file():
            artifact.unlink()
    db.delete(workload)
    db.commit()
    return Response(status_code=204)
