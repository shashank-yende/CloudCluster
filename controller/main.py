from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, BackgroundTasks, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
import base64
import hmac
import json
import uuid
import os
import hashlib
import datetime
import re
import secrets
import time
from pathlib import Path

from controller.database import engine, get_db
from models.task import Base, TaskModel, UserModel, UserSessionModel
from controller.resource_manager import ResourceManager
from controller.task_manager import TaskManager
from controller.scheduler_service import SchedulerService
from controller.execution_service import ExecutionService

# Create database tables
Base.metadata.create_all(bind=engine)
if "user_id" not in {column["name"] for column in inspect(engine).get_columns("tasks")}:
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE tasks ADD COLUMN user_id VARCHAR(64)"))
if "name" not in {column["name"] for column in inspect(engine).get_columns("users")}:
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE users ADD COLUMN name VARCHAR(100)"))
if "queue_position" not in {column["name"] for column in inspect(engine).get_columns("tasks")}:
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE tasks ADD COLUMN queue_position INTEGER"))

app = FastAPI(
    title="Cloud Resource Optimization Platform",
    description="High-level distributed workload orchestrator and performance analytics suite.",
    version="2.0.0"
)

# Enable CORS for frontend and API consumers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure storage directories exist
os.makedirs("storage/uploads", exist_ok=True)
os.makedirs("storage/results", exist_ok=True)
os.makedirs("storage/processing", exist_ok=True)

# Mount static assets if build directory exists
react_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(react_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(react_dist, "assets")), name="react_assets")

# Initialize Resource Manager
resource_manager = ResourceManager()
auth_scheme = HTTPBearer(auto_error=False)
SESSION_DURATION = datetime.timedelta(days=30)
PASSWORD_HASH_ITERATIONS = 310_000
JWT_ISSUER = "cloudcluster"


def load_jwt_secret() -> bytes:
    """Use an explicitly configured secret, or create a persistent local key."""
    configured = os.getenv("CLOUDCLUSTER_JWT_SECRET")
    if configured:
        if len(configured.encode("utf-8")) < 32:
            raise RuntimeError("CLOUDCLUSTER_JWT_SECRET must contain at least 32 bytes")
        return configured.encode("utf-8")

    secret_path = Path(os.getenv("CLOUDCLUSTER_JWT_SECRET_FILE") or (Path(__file__).resolve().parent.parent / ".jwt-secret"))
    secret_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with secret_path.open("xb") as secret_file:
            secret_file.write(secrets.token_urlsafe(48).encode("ascii"))
    except FileExistsError:
        pass
    secret = secret_path.read_bytes().strip()
    if len(secret) < 32:
        raise RuntimeError(f"JWT signing key at {secret_path} is invalid")
    return secret


JWT_SECRET = load_jwt_secret()


def _b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def encode_jwt(claims: dict) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    signing_input = ".".join((
        _b64url_encode(json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8")),
        _b64url_encode(json.dumps(claims, separators=(",", ":"), sort_keys=True).encode("utf-8")),
    ))
    signature = hmac.new(JWT_SECRET, signing_input.encode("ascii"), hashlib.sha256).digest()
    return f"{signing_input}.{_b64url_encode(signature)}"


def decode_jwt(token: str) -> dict:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Malformed JWT")
    header = json.loads(_b64url_decode(parts[0]))
    claims = json.loads(_b64url_decode(parts[1]))
    if not isinstance(header, dict) or header.get("alg") != "HS256" or header.get("typ") != "JWT":
        raise ValueError("Unsupported JWT header")
    signing_input = f"{parts[0]}.{parts[1]}"
    expected = hmac.new(JWT_SECRET, signing_input.encode("ascii"), hashlib.sha256).digest()
    supplied = _b64url_decode(parts[2])
    if not hmac.compare_digest(expected, supplied) or not isinstance(claims, dict):
        raise ValueError("Invalid JWT signature")
    return claims

# Format validation rules per task
ALLOWED_EXTENSIONS = {
    "data_preprocessing": [".csv"],
    "csv_json_converter": [".csv", ".json"],
    "image_optimizer": [".png", ".jpg", ".jpeg", ".webp"],
    "pdf_brief": [".pdf"],
    "file_integrity": [],
    "qr_generator": [],
}

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_BATCH_ITEMS = 50
MAX_BATCH_FILES = 50
MAX_BATCH_BYTES = 100 * 1024 * 1024

def hash_pw(pw: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt, PASSWORD_HASH_ITERATIONS)
    return f"pbkdf2_sha256${PASSWORD_HASH_ITERATIONS}${_b64url_encode(salt)}${_b64url_encode(digest)}"


def verify_pw(pw: str, stored_hash: str) -> bool:
    if stored_hash.startswith("pbkdf2_sha256$"):
        try:
            algorithm, rounds, salt, expected = stored_hash.split("$", 3)
            if algorithm != "pbkdf2_sha256":
                return False
            actual = hashlib.pbkdf2_hmac(
                "sha256", pw.encode("utf-8"), _b64url_decode(salt), int(rounds)
            )
            return hmac.compare_digest(_b64url_encode(actual), expected)
        except (ValueError, TypeError):
            return False
    # Existing accounts used a plain SHA-256 digest; verify it once and upgrade on login.
    return hmac.compare_digest(hashlib.sha256(pw.encode("utf-8")).hexdigest(), stored_hash)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(auth_scheme),
    db: Session = Depends(get_db)
) -> UserModel:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        claims = decode_jwt(credentials.credentials)
        now = int(time.time())
        if (
            claims.get("iss") != JWT_ISSUER
            or not isinstance(claims.get("sub"), str)
            or not isinstance(claims.get("exp"), int)
            or claims["exp"] <= now
            or not isinstance(claims.get("iat"), int)
            or claims["iat"] > now + 60
            or not claims.get("jti")
        ):
            raise ValueError("Invalid JWT claims")
    except (ValueError, TypeError, json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_hash = hashlib.sha256(credentials.credentials.encode("utf-8")).hexdigest()
    session = db.query(UserSessionModel).filter(UserSessionModel.token_hash == token_hash).first()
    if not session or session.expires_at <= datetime.datetime.utcnow():
        if session:
            db.delete(session)
            db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(UserModel).filter(UserModel.id == session.user_id).first()
    if not user or str(user.id) != claims["sub"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session user no longer exists",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def create_session(db: Session, user: UserModel) -> str:
    now = int(time.time())
    expires_at = now + int(SESSION_DURATION.total_seconds())
    token = encode_jwt({
        "iss": JWT_ISSUER,
        "sub": str(user.id),
        "username": user.username,
        "name": user.name or user.username,
        "role": user.role or "Cloud Engineer",
        "iat": now,
        "exp": expires_at,
        "jti": secrets.token_urlsafe(18),
    })
    session = UserSessionModel(
        token_hash=hashlib.sha256(token.encode("utf-8")).hexdigest(),
        user_id=user.id,
        expires_at=datetime.datetime.fromtimestamp(expires_at, datetime.timezone.utc).replace(tzinfo=None),
    )
    db.add(session)
    db.commit()
    return token


class AuthRequest(BaseModel):
    username: str | None = None
    name: str | None = None
    password: str
    email: str | None = None
    role: str | None = "Cloud Engineer"

@app.get("/")
def read_root():
    """Serves React dashboard when built, or API status in development mode."""
    dist_index = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist", "index.html")
    if os.path.exists(dist_index):
        return FileResponse(dist_index)
    return {
        "status": "online",
        "service": "Cloud Resource Optimization Platform API",
        "docs_url": "/docs",
        "frontend": "React UI runs at http://localhost:5173 (via Vite in frontend)"
    }

# Authentication Endpoints
@app.post("/api/auth/register")
def register(user_data: AuthRequest, db: Session = Depends(get_db)):
    display_name = (user_data.name or user_data.username or "").strip()
    email = (user_data.email or (f"{user_data.username}@cloud.local" if user_data.username else "")).strip().lower()
    if not display_name or not email or not user_data.password:
        raise HTTPException(status_code=400, detail="Your name, email address, and password are required")
    if len(display_name) > 100:
        raise HTTPException(status_code=400, detail="Your name must be 100 characters or fewer")
    if len(email) > 128 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(status_code=400, detail="Enter a valid email address")
    if len(user_data.password) < 12:
        raise HTTPException(status_code=400, detail="Use a passphrase with at least 12 characters")
    if len(user_data.password) > 128:
        raise HTTPException(status_code=400, detail="Your passphrase must be 128 characters or fewer")

    requested_username = (user_data.username or "").strip()
    existing_query = db.query(UserModel).filter(UserModel.email == email)
    if requested_username:
        existing_query = db.query(UserModel).filter(
            (UserModel.username == requested_username) | (UserModel.email == email)
        )
    existing = existing_query.first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email address already exists")

    username = requested_username or re.sub(r"[^a-z0-9_.-]+", "-", email.split("@", 1)[0].lower()).strip(".-_")[:56] or "cloud-user"
    if not requested_username and db.query(UserModel).filter(UserModel.username == username).first():
        username = f"{username[:54]}-{uuid.uuid4().hex[:8]}"

    new_user = UserModel(
        username=username,
        name=display_name,
        email=email,
        password_hash=hash_pw(user_data.password),
        role="Cloud Engineer"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {
        "message": "Workspace created",
        "token": create_session(db, new_user),
        "token_type": "bearer",
        "expires_in": int(SESSION_DURATION.total_seconds()),
        "user": new_user.to_dict(),
    }

@app.post("/api/auth/login")
def login(user_data: AuthRequest, db: Session = Depends(get_db)):
    identity = (user_data.email or user_data.username or "").strip()
    user = db.query(UserModel).filter(
        (UserModel.email == identity.lower()) | (UserModel.username == identity)
    ).first() if identity else None

    if not user or not verify_pw(user_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if not user.password_hash.startswith("pbkdf2_sha256$"):
        user.password_hash = hash_pw(user_data.password)
        db.commit()

    return {
        "token": create_session(db, user),
        "token_type": "bearer",
        "expires_in": int(SESSION_DURATION.total_seconds()),
        "user": user.to_dict()
    }


@app.get("/api/auth/me")
def current_user_profile(current_user: UserModel = Depends(get_current_user)):
    return {"user": current_user.to_dict()}

@app.post("/api/auth/logout")
def logout(
    credentials: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    token_hash = hashlib.sha256(credentials.credentials.encode("utf-8")).hexdigest()
    session = db.query(UserSessionModel).filter(
        UserSessionModel.token_hash == token_hash,
        UserSessionModel.user_id == current_user.id,
    ).first()
    if session:
        db.delete(session)
        db.commit()
    return {"message": "Signed out"}

@app.get("/api/health")
def api_health():
    return {
        "status": "Cloud Controller is Online",
        "cluster_version": "2.5.0",
        "nodes_configured": len(resource_manager.nodes)
    }

@app.get("/nodes/status")
def get_nodes_status():
    """Returns live CPU, RAM, and status for all cluster worker nodes."""
    return resource_manager.get_cluster_resources()

@app.post("/tasks/submit")
async def submit_task(
    background_tasks: BackgroundTasks,
    task_type: str = Form(...),
    file: UploadFile = File(None),
    qr_content: str = Form(""),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    valid_task_types = list(ALLOWED_EXTENSIONS.keys())
    if task_type not in valid_task_types:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid task type '{task_type}'. Allowed types: {', '.join(valid_task_types)}"
        )

    input_file_path = None
    if task_type == "qr_generator":
        content = normalize_qr_url(qr_content)

        task_id = f"T-{str(uuid.uuid4())[:6].upper()}"
        os.makedirs("storage/uploads", exist_ok=True)
        input_file_path = f"storage/uploads/{task_id}_link.txt"
        with open(input_file_path, "w", encoding="utf-8") as link_file:
            link_file.write(content)
    elif file and file.filename:
        _, ext = os.path.splitext(file.filename.lower())
        allowed = ALLOWED_EXTENSIONS[task_type]
        if allowed and ext not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file format '{ext}' for {task_type.replace('_', ' ').title()}. Only {', '.join(allowed)} files are accepted."
            )
        
        task_id = f"T-{str(uuid.uuid4())[:6].upper()}"
        original_name = Path(file.filename).name
        safe_filename = "".join(character if character.isalnum() or character in "._-" else "_" for character in original_name).strip("._")
        if not safe_filename:
            safe_filename = f"upload{ext}"
        input_file_path = f"storage/uploads/{task_id}_{safe_filename}"
        with open(input_file_path, "wb") as buffer:
            contents = await file.read(MAX_UPLOAD_BYTES + 1)
            if len(contents) > MAX_UPLOAD_BYTES:
                os.remove(input_file_path)
                raise HTTPException(status_code=413, detail="Uploads must be 20 MB or smaller")
            buffer.write(contents)
    else:
        raise HTTPException(status_code=400, detail="Choose an input file for this workload")

    available_nodes = resource_manager.get_cluster_resources()

    try:
        active_queue = db.query(TaskModel).filter(TaskModel.status.in_(["SUBMITTED", "QUEUED", "RUNNING"])).all()
        assignment = SchedulerService.schedule_batch(
            [{"task_id": task_id, "task_type": task_type, "input_file": input_file_path}],
            available_nodes,
            active_queue,
        )[task_id]
        selected_algo = assignment["algorithm"]
        selected_node = assignment["assigned_node"]
        queue_position = assignment["queue_position"]
    except RuntimeError as error:
        if input_file_path and os.path.exists(input_file_path):
            os.remove(input_file_path)
        raise HTTPException(status_code=503, detail=str(error)) from error

    task_record = TaskManager.create_task(
        db=db, 
        task_id=task_id, 
        task_type=task_type, 
        algorithm=selected_algo, 
        input_file=input_file_path,
        user_id=current_user.id,
    )

    TaskManager.update_status(db, task_id, "QUEUED", {
        "assigned_node": selected_node,
        "queue_position": queue_position,
        "scheduling_time": datetime.datetime.utcnow()
    })

    node_url = resource_manager.nodes.get(selected_node, "http://localhost:8001")
    background_tasks.add_task(
        ExecutionService.dispatch_to_node,
        node_url=node_url,
        task_id=task_id,
        task_type=task_type,
        input_file=input_file_path
    )

    return {
        "message": "Task validated, optimized, and dispatched!",
        "task_id": task_id,
        "task_type": task_type,
        "assigned_node": selected_node,
        "algorithm": selected_algo,
        "status": "QUEUED"
    }


def normalize_qr_url(value: str) -> str:
    content = (value or "").strip()
    if not content or len(content) > 2048:
        raise HTTPException(status_code=400, detail="Enter a URL up to 2,048 characters long")
    if any(character.isspace() or ord(character) < 32 for character in content):
        raise HTTPException(status_code=400, detail="The URL cannot contain spaces or control characters")
    from urllib.parse import urlsplit

    lower_content = content.lower()
    if not lower_content.startswith(("http://", "https://")):
        authority = content.split("/", 1)[0]
        port_suffix = authority.rsplit(":", 1)[-1] if ":" in authority else ""
        if "://" in content or (":" in authority and not port_suffix.isdigit()):
            raise HTTPException(status_code=400, detail="Enter a valid http or https URL")
        content = f"https://{content}"
    if len(content) > 2048:
        raise HTTPException(status_code=400, detail="Enter a URL up to 2,048 characters long")
    try:
        parsed_url = urlsplit(content)
        parsed_url.port
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Enter a valid http or https URL") from error
    if parsed_url.scheme.lower() not in {"http", "https"} or not parsed_url.hostname or parsed_url.username or parsed_url.password:
        raise HTTPException(status_code=400, detail="Enter a valid http or https URL")
    return content


def safe_upload_name(filename: str | None, extension: str) -> str:
    original_name = Path(filename or f"upload{extension}").name
    cleaned = "".join(character if character.isalnum() or character in "._-" else "_" for character in original_name).strip("._")
    return (cleaned or f"upload{extension}")[-180:]


@app.post("/tasks/submit-batch")
async def submit_batch(
    background_tasks: BackgroundTasks,
    manifest: str = Form(...),
    files: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Validate, schedule, and queue a mixed batch of independent workloads."""
    try:
        jobs = json.loads(manifest)
    except (TypeError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=400, detail="The workload batch is not valid JSON") from error
    if not isinstance(jobs, list) or not jobs:
        raise HTTPException(status_code=400, detail="Add at least one workload to the batch")
    if len(jobs) > MAX_BATCH_ITEMS or len(files) > MAX_BATCH_FILES:
        raise HTTPException(status_code=413, detail=f"A batch can contain up to {MAX_BATCH_ITEMS} workloads")

    normalized_jobs = []
    referenced_files = []
    total_bytes = 0
    for index, job in enumerate(jobs):
        if not isinstance(job, dict):
            raise HTTPException(status_code=400, detail=f"Workload {index + 1} is invalid")
        task_type = job.get("task_type")
        if task_type not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"Workload {index + 1} uses an unsupported task")
        task_id = f"T-{uuid.uuid4().hex[:6].upper()}"
        input_path = None
        if task_type == "qr_generator":
            content = normalize_qr_url(job.get("qr_content", ""))
            normalized_jobs.append({"task_id": task_id, "task_type": task_type, "qr_content": content, "input_path": None, "upload": None, "content": None})
        else:
            file_index = job.get("file_index")
            if isinstance(file_index, bool) or not isinstance(file_index, int) or not 0 <= file_index < len(files):
                raise HTTPException(status_code=400, detail=f"Choose one valid input file for workload {index + 1}")
            referenced_files.append(file_index)
            upload = files[file_index]
            extension = Path(upload.filename or "").suffix.lower()
            allowed = ALLOWED_EXTENSIONS[task_type]
            if allowed and extension not in allowed:
                accepted = ", ".join(allowed)
                raise HTTPException(status_code=400, detail=f"File {Path(upload.filename or 'input').name} is not supported by {task_type.replace('_', ' ')}. Choose {accepted}.")
            content = await upload.read(MAX_UPLOAD_BYTES + 1)
            if len(content) > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail=f"{Path(upload.filename or 'This file').name} exceeds the 20 MB per-file limit")
            total_bytes += len(content)
            if total_bytes > MAX_BATCH_BYTES:
                raise HTTPException(status_code=413, detail="A batch can contain up to 100 MB of files")
            normalized_jobs.append({"task_id": task_id, "task_type": task_type, "input_path": None, "upload": upload, "content": content})
            continue

    if sorted(referenced_files) != list(range(len(files))):
        raise HTTPException(status_code=400, detail="Each selected file must belong to exactly one workload")

    os.makedirs("storage/uploads", exist_ok=True)
    try:
        for job in normalized_jobs:
            if job["task_type"] == "qr_generator":
                job["input_path"] = f"storage/uploads/{job['task_id']}_link.txt"
                Path(job["input_path"]).write_text(job["qr_content"], encoding="utf-8")
            if job.get("upload"):
                extension = Path(job["upload"].filename or "").suffix.lower()
                name = safe_upload_name(job["upload"].filename, extension)
                job["input_path"] = f"storage/uploads/{job['task_id']}_{name}"
                Path(job["input_path"]).write_bytes(job["content"])
    except OSError as error:
        for job in normalized_jobs:
            if job.get("input_path") and os.path.exists(job["input_path"]):
                os.remove(job["input_path"])
        raise HTTPException(status_code=500, detail="The batch inputs could not be saved") from error

    scheduling_jobs = [
        {"task_id": job["task_id"], "task_type": job["task_type"], "input_file": job["input_path"]}
        for job in normalized_jobs
    ]
    try:
        available_nodes = resource_manager.get_cluster_resources()
        active_queue = db.query(TaskModel).filter(TaskModel.status.in_(["SUBMITTED", "QUEUED", "RUNNING"])).all()
        assignments = SchedulerService.schedule_batch(scheduling_jobs, available_nodes, active_queue)
    except RuntimeError as error:
        for job in normalized_jobs:
            if job.get("input_path") and os.path.exists(job["input_path"]):
                os.remove(job["input_path"])
        raise HTTPException(status_code=503, detail=str(error)) from error

    submitted_at = datetime.datetime.utcnow()
    records = []
    dispatch_jobs = []
    try:
        for job in normalized_jobs:
            assignment = assignments[job["task_id"]]
            node_url = resource_manager.nodes.get(assignment["assigned_node"], "http://localhost:8001")
            record = TaskModel(
                task_id=job["task_id"],
                task_type=job["task_type"],
                algorithm=assignment["algorithm"],
                status="QUEUED",
                assigned_node=assignment["assigned_node"],
                queue_position=assignment["queue_position"],
                input_file=job["input_path"],
                user_id=str(current_user.id),
                submission_time=submitted_at,
                scheduling_time=submitted_at,
            )
            records.append(record)
            dispatch_jobs.append({
                "node_url": node_url,
                "task_id": job["task_id"],
                "task_type": job["task_type"],
                "input_file": job["input_path"],
                "queue_position": assignment["queue_position"],
            })
        db.add_all(records)
        db.commit()
    except Exception:
        db.rollback()
        for job in normalized_jobs:
            if job.get("input_path") and os.path.exists(job["input_path"]):
                os.remove(job["input_path"])
        raise

    batch_id = f"B-{uuid.uuid4().hex[:8].upper()}"
    parallel_workers = len({job["node_url"] for job in dispatch_jobs})
    dispatch_jobs.sort(key=lambda job: (job["queue_position"], job["task_id"]))
    background_tasks.add_task(
        ExecutionService.dispatch_batch,
        [{key: value for key, value in job.items() if key != "queue_position"} for job in dispatch_jobs],
        max(1, parallel_workers),
    )
    return {
        "batch_id": batch_id,
        "message": f"{len(records)} workloads queued across {parallel_workers} worker(s)",
        "tasks": [record.to_dict() for record in records],
    }

@app.get("/tasks")
def list_tasks(db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    """Retrieves the authenticated user's tasks and execution metrics."""
    tasks = TaskManager.get_all_tasks(db, user_id=current_user.id)
    return [task.to_dict() for task in tasks]

@app.get("/tasks/{task_id}")
def get_task_details(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Retrieves a task belonging to the authenticated user."""
    task = TaskManager.get_task(db, task_id, user_id=current_user.id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task.to_dict()


@app.delete("/tasks/{task_id}")
def delete_task(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Deletes the authenticated user's workload and its stored artifacts."""
    task = TaskManager.delete_task(db, task_id, user_id=current_user.id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    in_flight = task["status"] in {"SUBMITTED", "QUEUED", "RUNNING"}
    cleanup_warnings = []
    if not in_flight:
        for path in (task.get("input_file"), task.get("output_file")):
            warning = TaskManager.cleanup_artifact(path)
            if warning:
                cleanup_warnings.append(warning)

    return {
        "deleted": True,
        "cleanup_deferred": in_flight,
        "cleanup_warnings": cleanup_warnings,
    }


@app.get("/tasks/{task_id}/artifact/{artifact_type}")
def get_task_artifact(
    task_id: str,
    artifact_type: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    if artifact_type not in {"input", "output"}:
        raise HTTPException(status_code=404, detail="Artifact not found")

    task = TaskManager.get_task(db, task_id, user_id=current_user.id)
    if not task:
        raise HTTPException(status_code=404, detail="Artifact not found")

    artifact_path = getattr(task, f"{artifact_type}_file")
    if not artifact_path:
        raise HTTPException(status_code=404, detail="Artifact not found")

    allowed_root = os.path.realpath(os.path.join("storage", "uploads" if artifact_type == "input" else "results"))
    resolved_path = os.path.realpath(artifact_path)
    try:
        within_storage = os.path.commonpath((allowed_root, resolved_path)) == allowed_root
    except ValueError:
        within_storage = False
    if not within_storage or not os.path.isfile(resolved_path):
        raise HTTPException(status_code=404, detail="Artifact not found")

    return FileResponse(resolved_path, filename=os.path.basename(resolved_path))
