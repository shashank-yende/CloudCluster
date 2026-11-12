import os

def estimate_execution_time(task_type: str, input_file: str, node_info: dict) -> float:
    """
    Estimates execution time based on file size, task complexity factor, and node CPU capacity.
    """
    file_size_mb = 1.0
    if input_file and os.path.exists(input_file):
        try:
            file_size_mb = max(0.2, os.path.getsize(input_file) / (1024 * 1024))
        except Exception:
            file_size_mb = 1.0

    # Base complexity weights per task type
    weights = {
        "data_preprocessing": 1.1,
        "image_optimizer": 2.5,
        "pdf_brief": 2.4,
        "file_integrity": 0.6,
        "qr_generator": 0.5,
        "csv_json_converter": 1.2,
        "image_processing": 2.5,
        "csv_profiler": 1.8,
        "audio_processing": 3.0,
        "csv_deduplicator": 1.8,
        "image_palette": 2.1,
        "text_analyzer": 0.9,
    }
    
    base_weight = weights.get(task_type, 2.0)
    cpu_cores = float(node_info.get("cpu_cores", 2.0))
    current_load = float(node_info.get("cpu_usage", 0.0)) / 100.0  # Load ratio 0 to 1

    load_multiplier = 1.0 + current_load
    estimated_time = (file_size_mb * base_weight * load_multiplier) / max(cpu_cores, 1.0)
    
    return round(max(estimated_time, 0.1), 3)
