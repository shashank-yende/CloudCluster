import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import os

def run(input_file: str, task_id: str) -> str:
    """
    Generates a dual-panel audio frequency waveform & energy spectrogram graphic.
    """
    os.makedirs("storage/results", exist_ok=True)
    
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(8, 5), facecolor='#0b132b')
    ax1.set_facecolor('#1c2541')
    ax2.set_facecolor('#1c2541')

    # Generate synthetic frequency waveform
    time_pts = np.linspace(0, 2.0, 1500)
    freq1, freq2 = 12.0, 35.0
    waveform = np.sin(2 * np.pi * freq1 * time_pts) * np.exp(-1.2 * time_pts) + \
               0.5 * np.sin(2 * np.pi * freq2 * time_pts) * np.cos(np.pi * time_pts)

    ax1.plot(time_pts, waveform, color='#48cae4', linewidth=1.2)
    ax1.set_title(f"Audio Waveform Signal - Task {task_id}", color='#edf2f4', fontsize=11, fontweight='bold')
    ax1.set_ylabel("Amplitude", color='#8d99ae', fontsize=9)
    ax1.tick_params(colors='#8d99ae', labelsize=8)
    ax1.grid(True, linestyle=':', alpha=0.4, color='#4a5568')

    # Spectrogram simulation
    spec_data = np.abs(np.outer(np.linspace(1, 100, 80), np.sin(time_pts[:80]))) + np.random.uniform(0, 10, (80, 80))
    im = ax2.imshow(spec_data, aspect='auto', origin='lower', cmap='plasma', extent=[0, 2, 0, 5000])
    ax2.set_title("Frequency Energy Distribution (Spectrogram)", color='#edf2f4', fontsize=11, fontweight='bold')
    ax2.set_xlabel("Time (s)", color='#8d99ae', fontsize=9)
    ax2.set_ylabel("Frequency (Hz)", color='#8d99ae', fontsize=9)
    ax2.tick_params(colors='#8d99ae', labelsize=8)

    for ax in [ax1, ax2]:
        for spine in ax.spines.values():
            spine.set_color('#3a506b')

    plt.tight_layout()
    output_filename = f"storage/results/{task_id}_spectrogram.png"
    plt.savefig(output_filename, dpi=150, facecolor=fig.get_facecolor(), edgecolor='none')
    plt.close()

    return output_filename
