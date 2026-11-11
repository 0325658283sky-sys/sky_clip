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
        language = os.environ.get("SKYCLIP_WHISPER_LANGUAGE", "").strip() or None
        model = WhisperModel(model_name, device="cpu", compute_type="int8")
        transcribe_options = {"vad_filter": True, "beam_size": 5, "condition_on_previous_text": False, "no_speech_threshold": 0.6, "compression_ratio_threshold": 2.4, "log_prob_threshold": -1.0}
        if language: transcribe_options["language"] = language
        segments, info = model.transcribe(str(wav_path), **transcribe_options)
        captions = []
        previous_end = 0.0
        for segment in segments:
            text = re.sub(r'([,.!?\-])\1{2,}', r'\1', segment.text.strip())
            text = re.sub(r'\s+', ' ', text).strip(' ,.!?-')
            compact = re.sub(r'[^\w가-힣]+', '', text, flags=re.UNICODE)
            if not text or len(compact) < 2 or (len(compact) > 10 and len(set(compact)) <= 2): continue
            start = max(previous_end, float(segment.start)); end = max(start + 0.05, float(segment.end)); previous_end = end
            captions.append({"start": round(start, 3), "end": round(end, 3), "text": text})
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text("WEBVTT\n\n" + "\n".join(f"{i}\n{vtt_time(x['start'])} --> {vtt_time(x['end'])}\n{x['text']}\n" for i, x in enumerate(captions, 1)), encoding="utf-8")
        # Windows 콘솔 코드페이지와 무관하게 Node가 UTF-8 JSON을 안전하게 복원하도록 escape한다.
        print(json.dumps({"ok": True, "captions": captions, "language": language or getattr(info, "language", None), "model": model_name, "beamSize": 5}, ensure_ascii=True)); return 0
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
