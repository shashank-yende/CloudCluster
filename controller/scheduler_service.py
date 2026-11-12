from schedulers.execution_estimator import estimate_execution_time
from schedulers.capabilities import get_schedulable_nodes
from pathlib import Path

class SchedulerService:
    @staticmethod
    def _algorithm_for(task_type: str, input_file: str) -> str:
        try:
            file_size_mb = Path(input_file).stat().st_size / (1024 * 1024) if input_file else 0.0
        except OSError:
            file_size_mb = 0.0
        if task_type in {"qr_generator", "data_preprocessing"} or (task_type != "pdf_brief" and file_size_mb < 0.2):
            return "first_fit"
        if task_type == "pdf_brief" or file_size_mb > 2.0:
            return "max_min"
        return "min_min"

    @staticmethod
    def schedule_batch(tasks_queue: list, available_nodes: dict, existing_jobs: list | None = None) -> dict:
        """Schedule a mixed batch with shared virtual worker queues.

        Heavy jobs use Max-Min, standard transforms use Min-Min, and quick jobs
        rotate across eligible workers with First Fit. Queue positions are kept
        per worker so jobs beyond current capacity remain visibly queued.
        """
        online_nodes = [node for node, details in available_nodes.items() if details.get("status") == "Online"]
        if not online_nodes:
            raise RuntimeError("No online worker nodes are available for this workload")

        grouped = {"max_min": [], "min_min": [], "first_fit": []}
        for task in tasks_queue:
            task["algorithm"] = SchedulerService._algorithm_for(task.get("task_type", ""), task.get("input_file", ""))
            grouped[task["algorithm"]].append(task)

        # Estimated existing worker load, in seconds, lets each algorithm account
        # for jobs already assigned earlier in this same batch.
        reserved = {
            node_id: max(float(info.get("cpu_usage", 0.0)), float(info.get("ram_usage", 0.0))) / 100.0 * 2.0
            for node_id, info in available_nodes.items()
        }
        positions = {node_id: 0 for node_id in available_nodes}
        for existing in existing_jobs or []:
            node_id = getattr(existing, "assigned_node", None) if not isinstance(existing, dict) else existing.get("assigned_node")
            if node_id not in reserved:
                continue
            task_type = getattr(existing, "task_type", None) if not isinstance(existing, dict) else existing.get("task_type")
            input_file = getattr(existing, "input_file", None) if not isinstance(existing, dict) else existing.get("input_file")
            status = getattr(existing, "status", "QUEUED") if not isinstance(existing, dict) else existing.get("status", "QUEUED")
            positions[node_id] += 1
            duration = estimate_execution_time(task_type, input_file, available_nodes[node_id])
            reserved[node_id] += duration * (0.45 if status == "RUNNING" else 1.0)
        assignment_order = []
        first_fit_cursor = 0

        for algorithm in ("max_min", "min_min"):
            remaining = list(grouped[algorithm])
            while remaining:
                chosen_task = None
                chosen_node = None
                chosen_finish = None
                for task in remaining:
                    candidates = get_schedulable_nodes(task["task_type"], available_nodes)
                    task_best = None
                    task_best_node = None
                    for node_id in candidates:
                        duration = estimate_execution_time(task["task_type"], task.get("input_file"), available_nodes[node_id])
                        finish = reserved.get(node_id, 0.0) + duration
                        if task_best is None or finish < task_best:
                            task_best = finish
                            task_best_node = node_id
                    if task_best is None:
                        raise RuntimeError(f"No online worker can run {task['task_type']}")
                    is_better = chosen_finish is None or (task_best > chosen_finish if algorithm == "max_min" else task_best < chosen_finish)
                    if is_better:
                        chosen_task, chosen_node, chosen_finish = task, task_best_node, task_best
                duration = estimate_execution_time(chosen_task["task_type"], chosen_task.get("input_file"), available_nodes[chosen_node])
                reserved[chosen_node] = reserved.get(chosen_node, 0.0) + duration
                assignment_order.append((chosen_task, chosen_node))
                remaining.remove(chosen_task)

        for task in grouped["first_fit"]:
            candidates = get_schedulable_nodes(task["task_type"], available_nodes)
            if not candidates:
                raise RuntimeError(f"No online worker can run {task['task_type']}")
            node_id = candidates[first_fit_cursor % len(candidates)]
            first_fit_cursor += 1
            duration = estimate_execution_time(task["task_type"], task.get("input_file"), available_nodes[node_id])
            reserved[node_id] = reserved.get(node_id, 0.0) + duration
            assignment_order.append((task, node_id))

        assignments = {}
        for task, node_id in assignment_order:
            positions[node_id] = positions.get(node_id, 0) + 1
            assignments[task["task_id"]] = {
                "algorithm": task["algorithm"],
                "assigned_node": node_id,
                "queue_position": positions[node_id],
            }
        return assignments

    @staticmethod
    def auto_select_algorithm(task_type: str, input_file: str, available_nodes: dict) -> tuple[str, str]:
        """
        Intelligently decides which DAA algorithm to deploy based on workload characteristics:
        - Quick tasks (QR generation and CSV preprocessing) -> 'first_fit'
        - Moderate tasks or small images/charts (< 2MB) -> 'min_min' (Prioritizes shortest completion times)
        - Advanced document/archive jobs and large uploads -> 'max_min'
        
        Returns: (algorithm_name, selected_node_id)
        """
        assignment = SchedulerService.schedule_batch(
            [{"task_id": "auto_eval", "task_type": task_type, "input_file": input_file}],
            available_nodes,
        )["auto_eval"]
        return assignment["algorithm"], assignment["assigned_node"]
