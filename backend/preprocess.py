import json
import os
import shutil
import subprocess
import sys



def _require_ffmpeg() -> None:
    """ffmpeg/ffprobe PATH'te mi? Değilse anlaşılır hata ver."""
    eksik = [t for t in ("ffmpeg", "ffprobe") if shutil.which(t) is None]
    if eksik:
        raise RuntimeError(
            f"Gerekli araç bulunamadı: {', '.join(eksik)}. "
            "Kurulum -> macOS: brew install ffmpeg | Linux: sudo apt install ffmpeg"
        )


def _has_audio(path: str) -> bool:
    """Videoda ses akışı var mı? (ilk ses stream'ine bak)"""
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0",
         "-show_entries", "stream=codec_type", "-of", "csv=p=0", path],
        capture_output=True, text=True,
    ).stdout.strip()
    return out == "audio"


def _probe(path: str) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,avg_frame_rate,nb_read_frames",
         "-show_entries", "format=duration",
         "-count_frames", "-of", "json", path],
        capture_output=True, text=True, check=True,
    ).stdout
    return json.loads(out)


def _parse_fps(avg_frame_rate: str) -> float:
    if "/" in avg_frame_rate:
        num, den = avg_frame_rate.split("/")
        return float(num) / float(den) if float(den) else 0.0
    return float(avg_frame_rate or 0.0)


def preprocess(input_path: str, out_dir: str) -> dict:
    _require_ffmpeg()
    if not os.path.isfile(input_path):
        raise FileNotFoundError(f"Girdi videosu bulunamadı: {input_path}")
    os.makedirs(out_dir, exist_ok=True)
    if not _has_audio(input_path):
        raise ValueError("Videoda ses kanalı yok — bu sistem konuşma sesi gerektirir.")

    normalized = os.path.join(out_dir, "normalized.mp4")
    audio_wav = os.path.join(out_dir, "audio.wav")

    # sabit 30 fps (CFR)
    subprocess.run([
        "ffmpeg", "-y", "-i", input_path,
        "-r", "30", "-fps_mode", "cfr",   
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-an",
        normalized,
    ], check=True)

    subprocess.run([
        "ffmpeg", "-y", "-i", input_path,
        "-vn", "-ac", "1", "-ar", "16000",
        "-af", "highpass=f=80,afftdn",
        "-c:a", "pcm_s16le",
        audio_wav,
    ], check=True)

    info = _probe(normalized)
    stream = info["streams"][0]
    fmt = info.get("format", {})

    width = int(stream["width"])
    height = int(stream["height"])
    fps = _parse_fps(stream.get("avg_frame_rate", "30/1")) or 30.0
    frame_count = int(stream.get("nb_read_frames") or 0)
    duration_s = float(fmt.get("duration") or (frame_count / fps if fps else 0.0))

    return {
        "normalized_video": normalized,
        "audio_wav": audio_wav,
        "fps": fps,
        "frame_count": frame_count,
        "duration_s": round(duration_s, 3),
        "width": width,
        "height": height,
        "audio_sr": 16000,
        "denoised": True,
    }


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Kullanım: python preprocess.py <girdi_video> <cikti_klasoru>")
        sys.exit(1)
    meta = preprocess(sys.argv[1], sys.argv[2])
    print("\n=== ÖN İŞLEME META ===")
    print(json.dumps(meta, indent=2, ensure_ascii=False))
