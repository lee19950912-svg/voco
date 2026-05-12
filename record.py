"""
Step 1: Record 3 seconds from the default microphone and save as voice.wav.
"""

import sounddevice as sd
import soundfile as sf

SAMPLE_RATE = 16000  # 16kHz, standard for speech recognition
DURATION = 3         # seconds
OUTPUT_FILE = "voice.wav"

print(f"准备录音 {DURATION} 秒，开始说话...")
audio = sd.rec(
    int(DURATION * SAMPLE_RATE),
    samplerate=SAMPLE_RATE,
    channels=1,
    dtype="int16",
)
sd.wait()  # block until recording finishes
sf.write(OUTPUT_FILE, audio, SAMPLE_RATE)
print(f"录完了，已存到 {OUTPUT_FILE}")
