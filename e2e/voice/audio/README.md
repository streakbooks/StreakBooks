# Repeatable acoustic fixtures

These spoken WAV files were generated locally with [CMU Flite](https://github.com/festvox/flite), its traditional concatenative/diphone `kal` voice, and ffmpeg. No LLM, generative AI API, browser TTS provider, human voice recording or API key was used. Flite is a development tool only and is not shipped in the LinkBooks app. See its [permissive license](https://github.com/festvox/flite/blob/master/COPYING).

`python e2e/voice/audio/generate.py` regenerates 16 kHz mono PCM files. Requires Python 3, Linux `libflite1` and ffmpeg; CI consumes the committed fixtures without installing synthesis software. `enroll-1`, `enroll-2`, `enroll-3` use speeds 1.00, 0.96 and 1.04. Held-out target phrases use speed 0.90. Distractors use their base speed. Each includes leading/trailing silence. `*-enrollment.wav` concatenates the three enrollment examples; `enrollment.wav` is the Hey LinkBooks set.

Unit tests feed PCM through the actual segmenter and acoustic matcher. Browser tests use full Chromium's media-file capture device to exercise real getUserMedia, AudioWorklet, worker, segmentation and inference. They do not replace the wake engine with a fake success event. Only command transcription and application server APIs are mocked in the isolated form fixture.

The vocabulary is deliberately small, with near-sounding negatives as well as unrelated speech and silence. All audio comes from one traditional synthesizer. This is a regression corpus, not an independent human accuracy benchmark. Real speakers, accents, room noise, physical microphones, device performance, and other browser/OS combinations still need validation before broad rollout.
