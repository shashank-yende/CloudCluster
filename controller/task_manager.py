from sqlalchemy.orm import Session
from models.task import TaskModel
import datetime
import logging
import os
from pathlib import Path
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)

class TaskManager:
    @staticmethod
    def create_task(
        db: Session,
        task_id: str,
        task_type: str,
        algorithm: str,
        input_file: Optional[str] = None,
        user_id: Optional[int] = None,
    ) -> TaskModel:
        task = TaskModel(
            task_id=task_id,
            task_type=task_type,
            algorithm=algorithm,
            status="SUBMITTED",
            input_file=input_file,
            user_id=str(user_id) if user_id is not None else None,
            submission_time=datetime.datetime.utcnow()
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return task

    @staticmethod
    def update_status(db: Session, task_id: str, status: str, extra_fields: Optional[Dict[str, Any]] = None) -> Optional[TaskModel]:
        task = db.query(TaskModel).filter(TaskModel.task_id == task_id).first()
        if task:
            task.status = status
            if extra_fields:
                for key, value in extra_fields.items():
                    if hasattr(task, key):
                        setattr(task, key, value)
            db.commit()
            db.refresh(task)
        return task

    @staticmethod
    def get_task(db: Session, task_id: str, user_id: Optional[int] = None) -> Optional[TaskModel]:
        query = db.query(TaskModel).filter(TaskModel.task_id == task_id)
        if user_id is not None:
            query = query.filter(TaskModel.user_id == str(user_id))
        return query.first()

    @staticmethod
    def get_all_tasks(db: Session, user_id: Optional[int] = None) -> List[TaskModel]:
        query = db.query(TaskModel)
        if user_id is not None:
            query = query.filter(TaskModel.user_id == str(user_id))
        return query.order_by(TaskModel.submission_time.desc()).all()

    @staticmethod
    def delete_task(db: Session, task_id: str, user_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
        task = TaskManager.get_task(db, task_id, user_id=user_id)
        if not task:
            return None
        details = task.to_dict()
        db.delete(task)
        db.commit()
        return details

    @staticmethod
    def cleanup_artifact(path: Optional[str]) -> Optional[str]:
        if not path:
            return None

        storage_root = Path("storage").resolve()
        artifact_path = Path(path).resolve()
        allowed_roots = (storage_root / "uploads", storage_root / "results")
        try:
            allowed = any(os.path.commonpath((str(root), str(artifact_path))) == str(root) for root in allowed_roots)
        except ValueError:
            allowed = False

        if not allowed:
            warning = f"Refusing to remove artifact outside task storage: {path}"
            logger.warning(warning)
            return warning

        try:
            artifact_path.unlink(missing_ok=True)
        except OSError as error:
            warning = f"Unable to remove task artifact {path}: {error}"
            logger.exception(warning)
            return warning
        return None
