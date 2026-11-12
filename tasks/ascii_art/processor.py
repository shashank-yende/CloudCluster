import os

def run(input_file: str, task_id: str) -> str:
    """
    Generates retro ASCII art banner and diagnostics saved to an output file.
    """
    os.makedirs("storage/results", exist_ok=True)
    
    label = f"TASK-{task_id}"
    if input_file and os.path.exists(input_file):
        try:
            with open(input_file, 'r', encoding='utf-8', errors='ignore') as f:
                first_line = f.readline().strip()
                if first_line:
                    label = first_line[:30].upper()
        except Exception:
            pass

    ascii_art = f"""
######################################################################
#                                                                    #
#    ____ _                 _ ____  _       _    __                      #
#   / ___| | ___  _   _  __| |  _ \\| | __ _| |_ / _| ___  _ __ _ __ ___   #
#  | |   | |/ _ \\| | | |/ _` | |_) | |/ _` | __| |_ / _ \\| '__| '_ ` _ \\  #
#  | |___| | (_) | |_| | (_| |  __/| | (_| | |_|  _| (_) | |  | | | | | | #
#   \\____|_|\\___/ \\__,_|\\__,_|_|   |_|\\__,_|\\__|_|  \\___/|_|  |_| |_| |_| #
#                                                                    #
######################################################################
# TARGET: {label:<58} #
# TASK ID: {task_id:<57} #
# ENGINE: OS PROCESS SCHEDULER & DISPATCH CONTAINER                #
# STATUS: PROCESSED SUCCESSFULLY VIA WORKER SUBPROCESS               #
######################################################################
   [||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||] 100%
"""

    output_filename = f"storage/results/{task_id}_ascii.txt"
    with open(output_filename, 'w', encoding='utf-8') as f:
        f.write(ascii_art.strip())

    return output_filename
