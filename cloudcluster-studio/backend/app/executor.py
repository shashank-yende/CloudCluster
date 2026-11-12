from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime, timezone
from pathlib import Path

from .config import RESULT_DIR
from .database import SessionLocal
from .models import Workload
from .registry import TASKS
from .scheduler import choose_worker


async def execute_workload(workload_id: str, data: bytes, filename: str, options: dict) -> None:
    db = SessionLocal()
    try:
        workload = db.get(Workload, workload_id)
        if not workload:
            return
        spec = TASKS[workload.task_type]
        worker_id, algorithm = choose_worker(db, spec["complexity"], workload_id)
        workload.worker_id = worker_id
        workload.algorithm = algorithm
        workload.status = "running"
        workload.started_at = datetime.now(timezone.utc)
        workload.progress = 18
        db.commit()
        start = time.perf_counter()
        workload.progress = 42
        db.commit()
        result, artifact, artifact_name, mime = await asyncio.to_thread(spec["run"], data, filename, options)
        workload.progress = 82
        db.commit()
        owner_dir = RESULT_DIR / workload.owner_id / workload.id
        owner_dir.mkdir(parents=True, exist_ok=True)
        output_path = owner_dir / Path(artifact_name).name
        output_path.write_bytes(artifact)
        workload.artifact_path = str(output_path.resolve())
        workload.artifact_name = Path(artifact_name).name
        workload.result_json = json.dumps({**result, "mime_type": mime}, ensure_ascii=False)
        workload.status = "completed"
        workload.progress = 100
        workload.duration_ms = max(1, int((time.perf_counter() - start) * 1000))
        workload.finished_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as error:
        db.rollback()
        workload = db.get(Workload, workload_id)
        if workload:
            workload.status = "failed"
            workload.error_message = str(error)[:400]
            workload.progress = 0
            workload.finished_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()
