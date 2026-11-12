from schedulers.capabilities import get_schedulable_nodes

def select_node_first_fit(task_type: str, input_file: str, available_nodes: dict) -> str:
    """
    Selects the first node capable of running the task that is Online.
    """
    schedulable_nodes = get_schedulable_nodes(task_type, available_nodes)
    if schedulable_nodes:
        return schedulable_nodes[0]
    raise RuntimeError("No online worker can run this workload")
