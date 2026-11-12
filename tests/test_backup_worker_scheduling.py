import unittest
from unittest.mock import patch

from controller.resource_manager import NODE_SPECS, ResourceManager
from controller.scheduler_service import SchedulerService
from schedulers.first_fit import select_node_first_fit
from schedulers.max_min import select_node_max_min
from schedulers.min_min import select_node_min_min


def worker_status(online_node=None):
    return {
        node_id: {
            **spec,
            "status": "Online" if node_id == online_node else "Offline",
            "cpu_usage": 10.0,
        }
        for node_id, spec in NODE_SPECS.items()
    }


class BackupWorkerSchedulingTests(unittest.TestCase):
    def test_resource_manager_registers_backup_workers_and_capacity(self):
        manager = ResourceManager()

        self.assertEqual(manager.nodes.keys(), NODE_SPECS.keys())
        self.assertEqual(NODE_SPECS["node4"]["cpu_cores"], 2.0)
        self.assertEqual(NODE_SPECS["node4"]["total_ram_gb"], 4)
        self.assertEqual(NODE_SPECS["node4"]["role"], "Backup")
        self.assertEqual(NODE_SPECS["node5"]["role"], "Backup")

    def test_reachable_backup_workers_are_standby_offline_until_primary_failure(self):
        manager = ResourceManager()
        resources = {
            node_id: {
                **spec,
                "status": "Online",
                "health_status": "Online",
            }
            for node_id, spec in NODE_SPECS.items()
        }

        with patch.object(
            manager,
            "_get_node_resources",
            side_effect=lambda entry: (entry[0], resources[entry[0]]),
        ):
            standby = manager.get_cluster_resources()
            self.assertEqual(standby["node4"]["status"], "Offline")
            self.assertTrue(standby["node4"]["standby"])

            resources["node1"]["health_status"] = "Offline"
            resources["node1"]["status"] = "Offline"

            active = manager.get_cluster_resources()
            self.assertEqual(active["node4"]["status"], "Online")
            self.assertFalse(active["node4"]["standby"])

    def test_first_fit_uses_online_backup_after_primary_workers_are_offline(self):
        selected = select_node_first_fit(
            "image_processing",
            "missing-input.png",
            worker_status("node4"),
        )

        self.assertEqual(selected, "node4")

    def test_min_min_and_max_min_can_schedule_on_backup_workers(self):
        task = {"task_id": "backup-task", "task_type": "audio_processing", "input_file": ""}
        available = worker_status("node5")

        self.assertEqual(select_node_min_min([task], available)["backup-task"], "node5")
        self.assertEqual(select_node_max_min([task], available)["backup-task"], "node5")

    def test_all_schedulers_prefer_online_primaries_over_backups(self):
        available = worker_status()
        for node_id in ("node1", "node2", "node3", "node4", "node5"):
            available[node_id]["status"] = "Online"
        image_task = {"task_id": "image-task", "task_type": "image_processing", "input_file": ""}
        audio_task = {"task_id": "audio-task", "task_type": "audio_processing", "input_file": ""}

        self.assertEqual(select_node_first_fit("image_processing", "", available), "node1")
        self.assertIn(select_node_min_min([image_task], available)["image-task"], {"node1", "node2"})
        self.assertIn(select_node_max_min([audio_task], available)["audio-task"], {"node2", "node3"})

    def test_scheduler_service_rejects_an_offline_fleet(self):
        with self.assertRaisesRegex(RuntimeError, "No online worker"):
            SchedulerService.auto_select_algorithm("qr_generator", "", worker_status())

    def test_scheduler_service_selects_online_backup_worker(self):
        _, selected = SchedulerService.auto_select_algorithm(
            "qr_generator",
            "",
            worker_status("node4"),
        )

        self.assertEqual(selected, "node4")


if __name__ == "__main__":
    unittest.main()
