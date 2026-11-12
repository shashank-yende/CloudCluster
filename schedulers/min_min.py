from schedulers.capabilities import get_schedulable_nodes
from schedulers.execution_estimator import estimate_execution_time

def select_node_min_min(tasks_queue: list, available_nodes: dict) -> dict:
    """
    Min-Min scheduling algorithm implementation.
    Iteratively finds task with overall minimum completion time across available nodes.
    Returns mapping: task_id -> assigned_node.
    """
    assignments = {}
    remaining_tasks = list(tasks_queue)
    
    node_ready_times = {node_id: 0.0 for node_id in available_nodes.keys()}
    
    while remaining_tasks:
        min_completion_time = float('inf')
        best_task = None
        best_node = None

        for task in remaining_tasks:
            t_type = task.get("task_type")
            t_file = task.get("input_file")
            allowed = get_schedulable_nodes(t_type, available_nodes)

            for node_id, node_info in available_nodes.items():
                if node_id not in allowed:
                    continue

                exec_time = estimate_execution_time(t_type, t_file, node_info)
                completion_time = node_ready_times[node_id] + exec_time

                if completion_time < min_completion_time:
                    min_completion_time = completion_time
                    best_task = task
                    best_node = node_id

        if best_task and best_node:
            task_id = best_task.get("task_id")
            assignments[task_id] = best_node
            t_type = best_task.get("task_type")
            t_file = best_task.get("input_file")
            exec_time = estimate_execution_time(t_type, t_file, available_nodes[best_node])
            node_ready_times[best_node] += exec_time
            remaining_tasks.remove(best_task)
        else:
            raise RuntimeError("No online worker can run one or more queued workloads")

    return assignments
