import json
import os
import re
import sys
import tempfile
import subprocess
from pathlib import Path

def vtt_time(seconds):
    seconds = max(0.0, float(seconds or 0))
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"ok": False, "error": "source와 output 경로가 필요합니다."}, ensure_ascii=False)); return 2
    source, output = Path(sys.argv[1]), Path(sys.argv[2])
    if not source.exists():
        print(json.dumps({"ok": False, "error": "원본 영상 파일을 찾을 수 없습니다."}, ensure_ascii=False)); return 3
    try:
        from faster_whisper import WhisperModel
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"faster-whisper를 불러오지 못했습니다: {exc}"}, ensure_ascii=False)); return 4
    wav_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp: wav_path = Path(tmp.name)
        subprocess.run(["ffmpeg", "-y", "-i", str(source), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(wav_path)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        model_name = os.environ.get("SKYCLIP_WHISPER_MODEL", "tiny")
        model = WhisperModel(model_name, device="cpu", compute_type="int8")
        segments, info = model.transcribe(str(wav_path), vad_filter=True, beam_size=1)
        captions = []
        for segment in segments:
            text = re.sub(r'([,.!?\-])\1{2,}', r'\1', segment.text.strip())
            text = re.sub(r'\s+', ' ', text).strip(' ,.!?-')
            if text: captions.append({"start": float(segment.start), "end": float(segment.end), "text": text})
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text("WEBVTT\n\n" + "\n".join(f"{i}\n{vtt_time(x['start'])} --> {vtt_time(x['end'])}\n{x['text']}\n" for i, x in enumerate(captions, 1)), encoding="utf-8")
        # Windows 콘솔 코드페이지와 무관하게 Node가 UTF-8 JSON을 안전하게 복원하도록 escape한다.
        print(json.dumps({"ok": True, "captions": captions, "language": getattr(info, "language", None), "model": model_name}, ensure_ascii=True)); return 0
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.decode("utf-8", errors="replace")[-1000:]
        print(json.dumps({"ok": False, "error": f"오디오 변환 실패: {detail}"}, ensure_ascii=False)); return 5
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False)); return 6
    finally:
        if wav_path:
            try: wav_path.unlink(missing_ok=True)
            except Exception: pass

if __name__ == "__main__": raise SystemExit(main())
