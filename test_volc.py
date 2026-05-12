"""端到端火山 WebSocket ASR 测试"""
import sys, time, wave
import sounddevice as sd
import numpy as np
import yaml

sys.path.insert(0, '.')

cfg = yaml.safe_load(open('config.yaml', encoding='utf-8'))
device_keyword = cfg.get('input_device', '')
picked = None
for i, d in enumerate(sd.query_devices()):
    if d['max_input_channels'] > 0 and device_keyword and device_keyword.split()[0] in d['name']:
        picked = i; break

print('3 秒后录 5 秒，请说"今天天气真好"...')
time.sleep(3)
audio = sd.rec(int(16000 * 5), samplerate=16000, channels=1, dtype='int16', device=picked)
sd.wait()
print(f'录音峰值 {int(np.abs(audio).max())}/32767')

with wave.open('test.wav', 'wb') as f:
    f.setnchannels(1); f.setsampwidth(2); f.setframerate(16000)
    f.writeframes(audio.tobytes())

from recognizer import make_recognizer, load_config
r = make_recognizer(load_config())
print(f'调用火山 WebSocket ASR...')
try:
    text = r.recognize('test.wav')
    print(f'识别结果：[{text}]')
except Exception as e:
    print(f'识别失败: {type(e).__name__}: {e}')
    import traceback
    traceback.print_exc()
