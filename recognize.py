"""Read voice.wav and print recognized text using the configured engine."""
from recognizer import load_config, make_recognizer

config = load_config()
print(f"当前引擎: {config['recognize_engine']}")

recognizer = make_recognizer(config)
text = recognizer.recognize("voice.wav")

print("\n========== 识别结果 ==========")
print(text)
print("==============================")
