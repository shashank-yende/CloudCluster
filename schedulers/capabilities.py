TASK_NODE_CAPABILITIES = {
    # Workloads currently exposed in the workspace.
    "data_preprocessing": ["node1", "node2", "node4", "node5"],
    "csv_json_converter": ["node1", "node2", "node4", "node5"],
    "image_optimizer": ["node1", "node2", "node4", "node5"],
    "pdf_brief": ["node2", "node3", "node4", "node5"],
    "file_integrity": ["node1", "node2", "node3", "node4", "node5"],
    "qr_generator": ["node1", "node2", "node3", "node4", "node5"],
    # Keep assignments compatible with workloads already recorded in task history.
    "image_processing": ["node1", "node2", "node4", "node5"],
    "csv_profiler": ["node2", "node3", "node4", "node5"],
    "audio_processing": ["node2", "node3", "node4", "node5"],
    "csv_deduplicator": ["node2", "node3", "node4", "node5"],
    "image_palette": ["node1", "node2", "node4", "node5"],
    "text_analyzer": ["node1", "node2", "node4", "node5"],
}


def get_schedulable_nodes(task_type: str, available_nodes: dict) -> list[str]:
    allowed_nodes = TASK_NODE_CAPABILITIES.get(task_type, list(available_nodes.keys()))
    online_nodes = [
        node_id for node_id in allowed_nodes
        if available_nodes.get(node_id, {}).get("status") == "Online"
    ]
    primary_nodes = [
        node_id for node_id in online_nodes
        if available_nodes[node_id].get("role", "Primary") != "Backup"
    ]
    backup_nodes = [
        node_id for node_id in online_nodes
        if available_nodes[node_id].get("role") == "Backup"
    ]
    if primary_nodes:
        return primary_nodes
    if backup_nodes:
        return backup_nodes
    return online_nodes
