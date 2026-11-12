import asyncio
import csv
import hashlib
import json
import tempfile
import unittest
from collections import defaultdict
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from fastapi import BackgroundTasks, UploadFile
from PIL import Image
from pypdf import PdfWriter
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from controller import execution_service, main
from controller.task_manager import TaskManager
from models.task import Base, UserModel
from nodes.worker_runtime import SUPPORTED_TASK_TYPES, TaskExecutionRequest, execute_task


class WorkloadApiDispatchTests(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.TemporaryDirectory(prefix="cloudcluster-batch-test-")
        self.engine = create_engine(
            f"sqlite:///{Path(self.temp_db.name) / 'tasks.db'}",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine)
        self.db = self.session_factory()
        self.user = UserModel(
            username="workload-test", name="Local Workload Test",
            email="local-workload-test@example.test", password_hash=main.hash_pw("workspace-test-passphrase"),
        )
        self.db.add(self.user)
        self.db.commit()
        self.db.refresh(self.user)

        worker_resources = {
            f"node{index}": {
                "status": "Online", "cpu_usage": 10.0, "ram_usage": 15.0,
                "available_ram_mb": 2048, "cpu_cores": 2 * index,
                "total_ram_gb": 4 * index, "role": "Primary" if index < 4 else "Backup",
            }
            for index in range(1, 6)
        }
        worker_urls = {f"node{index}": "http://127.0.0.1:1" for index in range(1, 6)}
        self.patches = [
            patch.object(main.resource_manager, "get_cluster_resources", return_value=worker_resources),
            patch.object(main.resource_manager, "nodes", worker_urls),
            patch.object(execution_service, "SessionLocal", self.session_factory),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.db.close()
        self.engine.dispose()
        self.temp_db.cleanup()

    def _submit(self, task_type, filename=None, payload=None, qr_content=None):
        uploaded = UploadFile(filename=filename, file=BytesIO(payload)) if filename else None
        background = BackgroundTasks()
        response = asyncio.run(main.submit_task(
            background, task_type, uploaded, qr_content or "", self.db, self.user,
        ))
        self.assertEqual(response["status"], "QUEUED")
        asyncio.run(background())
        task = TaskManager.get_task(self.db, response["task_id"], user_id=self.user.id)
        self.assertIsNotNone(task)
        self.assertEqual(task.status, "COMPLETED", task.error_message)
        artifact = Path(task.output_file).read_bytes()
        main.delete_task(task.task_id, self.db, self.user)
        return artifact

    def test_all_six_workloads_dispatch_and_return_the_expected_artifact(self):
        qr_bytes = self._submit("qr_generator", qr_content="https://example.test/workload")
        with Image.open(BytesIO(qr_bytes)) as qr:
            self.assertEqual(qr.format, "PNG")

        preprocessed = self._submit(
            "data_preprocessing", "contacts.csv",
            b"Full Name,Score\n Ada Lovelace , 98 \nAda Lovelace,98\n,,\n",
        ).decode("utf-8")
        self.assertEqual(list(csv.reader(preprocessed.splitlines())), [["full_name", "score"], ["Ada Lovelace", "98"]])

        converted = self._submit("csv_json_converter", "people.csv", b"name,score\nAda,98\n")
        self.assertEqual(json.loads(converted), [{"name": "Ada", "score": "98"}])

        image = BytesIO()
        Image.new("RGB", (80, 40), "#7163ed").save(image, format="PNG")
        optimized = self._submit("image_optimizer", "sample.png", image.getvalue())
        with Image.open(BytesIO(optimized)) as webp:
            self.assertEqual(webp.format, "WEBP")

        pdf = BytesIO()
        writer = PdfWriter()
        writer.add_blank_page(width=72, height=72)
        writer.write(pdf)
        brief = self._submit("pdf_brief", "brief.pdf", pdf.getvalue()).decode("utf-8")
        self.assertIn("Pages: 1", brief)

        checked = self._submit("file_integrity", "download.bin", b"verify this file")
        self.assertEqual(json.loads(checked)["sha256"], hashlib.sha256(b"verify this file").hexdigest())

    def test_worker_runtime_supports_and_executes_every_controller_workload(self):
        self.assertSetEqual(set(SUPPORTED_TASK_TYPES), set(main.ALLOWED_EXTENSIONS))
        with tempfile.TemporaryDirectory(prefix="cloudcluster-worker-test-") as input_dir:
            csv_file = Path(input_dir) / "records.csv"
            csv_file.write_text("name,score\nAda,99\n", encoding="utf-8")
            json_file = Path(input_dir) / "records.json"
            json_file.write_text('[{"name":"Ada","score":99}]', encoding="utf-8")
            image_file = Path(input_dir) / "photo.png"
            Image.new("RGB", (40, 30), "#7565ed").save(image_file)
            pdf_file = Path(input_dir) / "brief.pdf"
            writer = PdfWriter()
            writer.add_blank_page(width=72, height=72)
            with pdf_file.open("wb") as target:
                writer.write(target)
            link_file = Path(input_dir) / "link.txt"
            link_file.write_text("https://example.test/worker", encoding="utf-8")
            binary_file = Path(input_dir) / "download.bin"
            binary_file.write_bytes(b"integrity check")

            inputs = [
                ("qr_generator", link_file),
                ("data_preprocessing", csv_file),
                ("csv_json_converter", csv_file),
                ("image_optimizer", image_file),
                ("pdf_brief", pdf_file),
                ("file_integrity", binary_file),
            ]
            outputs = []
            for index, (task_type, input_file) in enumerate(inputs):
                result = execute_task(TaskExecutionRequest(
                    task_id=f"worker-runtime-{index}",
                    task_type=task_type,
                    input_file=str(input_file),
                ))
                self.assertEqual(result["status"], "COMPLETED", task_type)
                self.assertTrue(Path(result["output_file"]).is_file(), task_type)
                outputs.append(Path(result["output_file"]))
            for output in outputs:
                output.unlink(missing_ok=True)

    def test_mixed_multi_file_batch_balances_workers_and_queues_each_item(self):
        csv_a = b"name,score\nAda,99\n"
        csv_b = b"name,score\nLin,98\n"
        files = [
            UploadFile(filename="a.csv", file=BytesIO(csv_a)),
            UploadFile(filename="b.csv", file=BytesIO(csv_b)),
            UploadFile(filename="verify.dat", file=BytesIO(b"batch")),
        ]
        manifest = json.dumps([
            {"task_type": "data_preprocessing", "file_index": 0},
            {"task_type": "csv_json_converter", "file_index": 1},
            {"task_type": "file_integrity", "file_index": 2},
            {"task_type": "qr_generator", "qr_content": "https://example.test/batch"},
        ])
        background = BackgroundTasks()
        response = asyncio.run(main.submit_batch(background, manifest, files, self.db, self.user))
        self.assertEqual(len(response["tasks"]), 4)
        self.assertGreaterEqual(len({task["assigned_node"] for task in response["tasks"]}), 2)
        self.assertEqual({task["status"] for task in response["tasks"]}, {"QUEUED"})
        self.assertTrue(all(task["queue_position"] >= 1 for task in response["tasks"]))
        positions_by_worker = defaultdict(list)
        for task in response["tasks"]:
            positions_by_worker[task["assigned_node"]].append(task["queue_position"])
        for positions in positions_by_worker.values():
            self.assertEqual(sorted(positions), list(range(1, len(positions) + 1)))

        asyncio.run(background())
        tasks = [TaskManager.get_task(self.db, task["task_id"], user_id=self.user.id) for task in response["tasks"]]
        self.assertEqual({task.status for task in tasks}, {"COMPLETED"}, [task.error_message for task in tasks])
        for task in tasks:
            self.assertTrue(Path(task.output_file).is_file())
            main.delete_task(task.task_id, self.db, self.user)


if __name__ == "__main__":
    unittest.main()
