import logging
import os
from concurrent.futures import ThreadPoolExecutor

import requests


logger = logging.getLogger(__name__)

NODE_SPECS = {
    "node1": {"cpu_cores": 2.0, "total_ram_gb": 4},
    "node2": {"cpu_cores": 4.0, "total_ram_gb": 8},
    "node3": {"cpu_cores": 8.0, "total_ram_gb": 16},
    "node4": {"cpu_cores": 2.0, "total_ram_gb": 4, "role": "Backup"},
    "node5": {"cpu_cores": 2.0, "total_ram_gb": 4, "role": "Backup"}
}


class ResourceManager:
    def __init__(self):
        self.nodes = {
            "node1": os.getenv("NODE1_URL", "http://localhost:8001"),
            "node2": os.getenv("NODE2_URL", "http://localhost:8002"),
            "node3": os.getenv("NODE3_URL", "http://localhost:8003"),
            "node4": os.getenv("NODE4_URL", "http://localhost:8004"),
            "node5": os.getenv("NODE5_URL", "http://localhost:8005")
        }
        self._health_executor = ThreadPoolExecutor(
            max_workers=len(self.nodes),
            thread_name_prefix="worker-health"
        )

    def get_cluster_resources(self) -> dict:
        """
        Polls all workers; reachable backups stay scheduling-offline until failover.
        """
        node_results = self._health_executor.map(self._get_node_resources, self.nodes.items())
        resources = dict(node_results)
        primary_failure = any(
            specs.get("role", "Primary") == "Primary"
            and resources[node_id]["health_status"] != "Online"
            for node_id, specs in NODE_SPECS.items()
        )

        for node_id, specs in NODE_SPECS.items():
            if specs.get("role") == "Backup":
                is_reachable = resources[node_id]["health_status"] == "Online"
                resources[node_id]["status"] = (
                    "Online" if is_reachable and primary_failure else "Offline"
                )
                resources[node_id]["standby"] = is_reachable and not primary_failure

        return resources

    @staticmethod
    def _get_node_resources(node_entry: tuple[str, str]) -> tuple[str, dict]:
        node_id, url = node_entry
        specs = NODE_SPECS[node_id]

        try:
            response = requests.get(f"{url}/health", timeout=0.8)
            response.raise_for_status()
            data = response.json()
            return node_id, {
                "status": "Online",
                "health_status": "Online",
                "cpu_usage": data["cpu_usage"],
                "ram_usage": data["ram_usage"],
                "available_ram_mb": data["available_ram_mb"],
                "supported_tasks": data.get("supported_tasks", []),
                "cpu_cores": specs["cpu_cores"],
                "total_ram_gb": specs["total_ram_gb"],
                "role": specs.get("role", "Primary")
            }
        except (requests.RequestException, ValueError, KeyError) as error:
            logger.warning("Worker %s health check failed at %s: %s", node_id, url, error)
            return node_id, {
                "status": "Offline",
                "health_status": "Offline",
                "cpu_usage": 0.0,
                "ram_usage": 0.0,
                "available_ram_mb": 0,
                "cpu_cores": specs["cpu_cores"],
                "total_ram_gb": specs["total_ram_gb"],
                "role": specs.get("role", "Primary")
            }
