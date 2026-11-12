from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import Workload

WORKERS = [
    {"id": "wk-01", "name": "Northstar", "region": "us-east-1", "cpu": 16, "memory": 64, "accent": "violet"},
    {"id": "wk-02", "name": "Daybreak", "region": "us-east-1", "cpu": 12, "memory": 48, "accent": "blue"},
    {"id": "wk-03", "name": "Juniper", "region": "ap-south-1", "cpu": 8, "memory": 32, "accent": "mint"},
    {"id": "wk-04", "name": "Solstice", "region": "us-west-2", "cpu": 16, "memory": 64, "accent": "orange"},
    {"id": "wk-05", "name": "Bluebell", "region": "ap-south-1", "cpu": 8, "memory": 32, "accent": "rose"},
]


def choose_worker(db: Session, complexity: int, task_id: str) -> tuple[str, str]:
    running = db.query(Workload.worker_id, func.count(Workload.id)).filter(Workload.status == "running").group_by(Workload.worker_id).all()
    load = {worker_id: int(count) for worker_id, count in running if worker_id}
    scored = [(node, load.get(node["id"], 0) / node["cpu"], load.get(node["id"], 0)) for node in WORKERS]
    if complexity == 1:
        worker = next((node for node, ratio, _ in scored if ratio < 1), min(scored, key=lambda item: item[1])[0])
        algorithm = "first-fit"
    elif complexity == 2:
        worker = min(scored, key=lambda item: (item[1], item[2]))[0]
        algorithm = "min-min"
    else:
        worker = max(scored, key=lambda item: (item[0]["cpu"] - item[2], -item[1]))[0]
        algorithm = "max-min"
    return worker["id"], algorithm


def worker_snapshot(db: Session) -> list[dict]:
    counts = dict(db.query(Workload.worker_id, func.count(Workload.id)).filter(Workload.status == "running").group_by(Workload.worker_id).all())
    queued = db.query(func.count(Workload.id)).filter(Workload.status == "queued").scalar() or 0
    result = []
    for node in WORKERS:
        active = int(counts.get(node["id"], 0))
        result.append({**node, "status": "busy" if active >= 2 else "online", "active_jobs": active, "utilization": min(96, 18 + active * 29 + (sum(node["id"].encode()) % 19)), "queue_depth": queued})
    return result
