import os
import tempfile
import unittest
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from controller.task_manager import TaskManager
from models.task import Base, TaskModel


class TaskDeletionTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_delete_task_removes_record_and_returns_artifact_metadata(self):
        task = TaskModel(
            task_id="delete-test-task",
            task_type="image_processing",
            algorithm="first_fit",
            status="COMPLETED",
            input_file="storage/uploads/input.png",
            output_file="storage/results/output.png",
        )
        self.db.add(task)
        self.db.commit()

        deleted = TaskManager.delete_task(self.db, task.task_id)

        self.assertEqual(deleted["task_id"], task.task_id)
        self.assertEqual(deleted["input_file"], "storage/uploads/input.png")
        self.assertIsNone(TaskManager.get_task(self.db, task.task_id))

    def test_cleanup_artifact_removes_files_inside_storage(self):
        upload_dir = Path("storage/uploads").resolve()
        upload_dir.mkdir(parents=True, exist_ok=True)
        descriptor, file_path = tempfile.mkstemp(prefix="task-delete-test-", dir=upload_dir)
        os.close(descriptor)
        try:
            self.assertIsNone(TaskManager.cleanup_artifact(file_path))
            self.assertFalse(Path(file_path).exists())
        finally:
            Path(file_path).unlink(missing_ok=True)

    def test_cleanup_artifact_refuses_paths_outside_storage(self):
        descriptor, file_path = tempfile.mkstemp(prefix="task-delete-outside-")
        os.close(descriptor)
        try:
            warning = TaskManager.cleanup_artifact(file_path)
            self.assertIsNotNone(warning)
            self.assertTrue(Path(file_path).exists())
        finally:
            Path(file_path).unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
