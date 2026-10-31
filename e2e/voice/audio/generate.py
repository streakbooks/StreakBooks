"""Regenerate test speech with CMU Flite kal (traditional diphone synthesis) and ffmpeg.
Dev-only: requires libflite1, Python 3 and ffmpeg on Linux. No online service or model API.
"""
import ctypes
from ctypes.util import find_library
from pathlib import Path
import subprocess
import tempfile

output = Path(__file__).resolve().parent
lib = ctypes.CDLL(find_library("flite"), mode=ctypes.RTLD_GLOBAL)
voice = ctypes.CDLL(find_library("flite_cmu_us_kal"))
lib.flite_init()
voice.register_cmu_us_kal.restype = ctypes.c_void_p
voice.register_cmu_us_kal.argtypes = [ctypes.c_char_p]
speaker = voice.register_cmu_us_kal(None)
lib.flite_text_to_wave.restype = ctypes.c_void_p
lib.flite_text_to_wave.argtypes = [ctypes.c_char_p, ctypes.c_void_p]
lib.cst_wave_save_riff.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
lib.delete_wave.argtypes = [ctypes.c_void_p]
phrases = {
    "hey-linkbooks": "Hey link books", "hello-linkbooks": "Hello link books",
    "hey-luna": "Hey Luna", "hey-link-cooks": "Hey link cooks",
    "open-invoices": "Open invoices", "unrelated": "The supplier invoice is due tomorrow",
    "hey-lincoln": "Hey Lincoln",
}
with tempfile.TemporaryDirectory() as directory:
    for name, text in phrases.items():
        raw = Path(directory) / f"{name}.wav"
        wave = lib.flite_text_to_wave(text.encode(), speaker)
        lib.cst_wave_save_riff(wave, str(raw).encode())
        lib.delete_wave(wave)
        variants = [("enroll-1", 1), ("enroll-2", .96), ("enroll-3", 1.04), ("heldout", .90)] if name in ["hey-linkbooks", "hello-linkbooks", "hey-luna"] else [("heldout", 1)]
        for tag, speed in variants:
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-af", f"atempo={speed},adelay=700,apad=pad_dur=1.2", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(output / f"{name}-{tag}.wav")], check=True)
    for name in ["hey-linkbooks", "hello-linkbooks", "hey-luna"]:
        manifest = Path(directory) / "concat.txt"
        manifest.write_text("".join(f"file '{output / f'{name}-enroll-{n}.wav'}'\n" for n in [1, 2, 3]))
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(manifest), "-c", "copy", str(output / ("enrollment.wav" if name == "hey-linkbooks" else f"{name}-enrollment.wav"))], check=True)
