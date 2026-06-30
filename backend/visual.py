import json
import os
import subprocess
import sys

import cv2
import numpy as np
from scipy.signal import savgol_filter

import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          "models", "face_landmarker.task")

ROI_SIZE = 112
ROI_PADDING = 0.35
SMOOTH_WINDOW = 7
SMOOTH_POLYORDER = 2

# kullandığım tekil noktalar
LM_UPPER_LIP = 13
LM_LOWER_LIP = 14
LM_MOUTH_L = 61
LM_MOUTH_R = 291
LM_CHIN = 152
LM_NOSE = 1
LM_FOREHEAD = 10

# ağız + çene + yanak bölgesini kapsayan noktalar
ROI_LANDMARKS = [
    61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291,
    78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308,
    13, 312, 311, 310, 415,
    152, 148, 176, 149, 150, 136, 172, 58, 132,
    377, 400, 378, 379, 365, 397, 288, 361,
    50, 280, 207, 427,
]


def _dist(a, b):
    return float(np.linalg.norm(a - b))


def _frame_metrics(pts):
    # ölçüleri yüz boyuna bölüyorum ki yakın/uzak fark etmesin
    face_h = _dist(pts[LM_FOREHEAD], pts[LM_CHIN]) + 1e-6
    return {
        "jaw_opening":  _dist(pts[LM_NOSE], pts[LM_CHIN]) / face_h,
        "lip_aperture": _dist(pts[LM_UPPER_LIP], pts[LM_LOWER_LIP]) / face_h,
        "lip_spread":   _dist(pts[LM_MOUTH_L], pts[LM_MOUTH_R]) / face_h,
    }


def _smooth(x):
    x = np.asarray(x, dtype=np.float64)
    n = len(x)
    if n == 0:
        return x
    idx = np.arange(n)
    good = np.isfinite(x)
    if good.sum() < 2:
        return np.nan_to_num(x, nan=0.0)
    x = np.interp(idx, idx[good], x[good])
    win = min(SMOOTH_WINDOW, n if n % 2 == 1 else n - 1)
    if win >= 3 and win > SMOOTH_POLYORDER:
        if win % 2 == 0:
            win -= 1
        x = savgol_filter(x, win, SMOOTH_POLYORDER)
    return x


def _roi_bbox(pts, w, h):
    # ROI noktalarının etrafına kare bir kutu, biraz da pay
    sub = pts[ROI_LANDMARKS]
    x0, y0, x1, y1 = sub[:, 0].min(), sub[:, 1].min(), sub[:, 0].max(), sub[:, 1].max()
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    half = max(x1 - x0, y1 - y0) * (1 + ROI_PADDING) / 2
    return (int(max(0, cx - half)), int(max(0, cy - half)),
            int(min(w, cx + half)), int(min(h, cy + half)))


def _draw_overlay(frame, pts, bbox):
    # kareye noktaları ve kutuyu çiz
    out = frame.copy()
    for (x, y) in pts[ROI_LANDMARKS]:
        cv2.circle(out, (int(x), int(y)), 1, (0, 255, 0), -1)
    cv2.rectangle(out, (bbox[0], bbox[1]), (bbox[2], bbox[3]), (0, 200, 255), 2)
    return out


def _plot(t_ms, metrics, out_path):
    fig, axes = plt.subplots(2, 1, figsize=(11, 6), sharex=True)
    for name, color in [("jaw_opening", "tab:blue"),
                        ("lip_aperture", "tab:green"),
                        ("lip_spread", "tab:orange")]:
        axes[0].plot(t_ms, metrics[name], color=color, label=name, lw=1.3)
    axes[0].set_ylabel("Konum (normalize)")
    axes[0].legend(loc="upper right", fontsize=8)
    axes[0].set_title("Çene/dudak kinematiği")

    for name, color in [("jaw_opening_velocity", "tab:blue"),
                        ("lip_aperture_velocity", "tab:green")]:
        axes[1].plot(t_ms, metrics[name], color=color, label=name, lw=1.0)
    axes[1].axhline(0, color="gray", lw=0.6)
    axes[1].set_ylabel("Hız (birim/s)")
    axes[1].set_xlabel("Zaman (ms)")
    axes[1].legend(loc="upper right", fontsize=8)
    fig.tight_layout()
    fig.savefig(out_path, dpi=120)
    plt.close(fig)


def extract_visual(video_path, out_dir=None, fps=30.0):
    if not os.path.isfile(MODEL_PATH):
        raise FileNotFoundError(f"Face Mesh modeli yok: {MODEL_PATH}")
    if out_dir is None:
        out_dir = os.path.dirname(os.path.abspath(video_path))
    os.makedirs(out_dir, exist_ok=True)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Video açılamadı: {video_path}")

    options = vision.FaceLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=vision.RunningMode.VIDEO,
        num_faces=1,
    )
    landmarker = vision.FaceLandmarker.create_from_options(options)

    dt = 1.0 / fps
    frame_idx = 0
    detected = 0
    last_ts = -1
    t_ms = []
    series = {"jaw_opening": [], "lip_aperture": [], "lip_spread": []}

    sample_overlay = os.path.join(out_dir, "sample_overlay.jpg")
    sample_roi = os.path.join(out_dir, "sample_roi.jpg")
    sample_saved = False
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    mid = total // 2

    overlay_tmp = os.path.join(out_dir, "_overlay_tmp.mp4")
    writer = None

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            h, w = frame.shape[:2]
            t_ms.append(frame_idx * dt * 1000.0)   # kare -> ms

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            ts = int(frame_idx * dt * 1000)
            if ts <= last_ts:                       # mediapipe artan ts ister
                ts = last_ts + 1
            last_ts = ts

            res = landmarker.detect_for_video(mp_image, ts)
            over = frame
            if res.face_landmarks:
                detected += 1
                lm = res.face_landmarks[0]
                pts = np.array([[p.x * w, p.y * h] for p in lm], dtype=np.float32)
                fm = _frame_metrics(pts)
                for k, v in fm.items():
                    series[k].append(v)

                bbox = _roi_bbox(pts, w, h)
                over = _draw_overlay(frame, pts, bbox)
                if not sample_saved and frame_idx >= mid:   # ortadan bir örnek al
                    crop = frame[bbox[1]:bbox[3], bbox[0]:bbox[2]]
                    if crop.size:
                        cv2.imwrite(sample_overlay, over)
                        cv2.imwrite(sample_roi, cv2.resize(crop, (ROI_SIZE, ROI_SIZE)))
                        sample_saved = True
            else:
                for k in series:
                    series[k].append(np.nan)        # yüz yoksa NaN

            if writer is None:
                writer = cv2.VideoWriter(
                    overlay_tmp, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
            writer.write(over)

            frame_idx += 1
    finally:
        cap.release()
        landmarker.close()
        if writer is not None:
            writer.release()

    # cv2'nin çıktısı her tarayıcıda oynamıyor, H.264'e çeviriyorum
    overlay_video = os.path.join(out_dir, "overlay.mp4")
    if os.path.isfile(overlay_tmp):
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-i", overlay_tmp,
                 "-c:v", "libx264", "-pix_fmt", "yuv420p", overlay_video],
                check=True, capture_output=True,
            )
            os.remove(overlay_tmp)
        except Exception:
            overlay_video = overlay_tmp

    # yumuşat + hız + ivme
    t_arr = np.array(t_ms)
    metrics = {}
    for name, raw in series.items():
        sig = _smooth(raw)
        vel = np.gradient(sig, dt)
        acc = np.gradient(vel, dt)
        metrics[name] = sig
        metrics[f"{name}_velocity"] = vel
        metrics[f"{name}_acceleration"] = acc

    kin_png = os.path.join(out_dir, "kinematics.png")
    _plot(t_arr, metrics, kin_png)

    summary = {}
    for name in ("jaw_opening", "lip_aperture", "lip_spread"):
        arr = metrics[name]
        summary[name] = {"mean": round(float(np.mean(arr)), 4),
                         "std": round(float(np.std(arr)), 4)}

    return {
        "frames": frame_idx,
        "detected_ratio": round(detected / frame_idx if frame_idx else 0.0, 3),
        "metrics_summary": summary,
        "kinematics_plot": kin_png,
        "overlay_video": overlay_video,
        "sample_overlay": sample_overlay if sample_saved else None,
        "sample_roi": sample_roi if sample_saved else None,
    }


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        print("Kullanım: python visual.py <normalized.mp4> [cikti_klasoru]")
        sys.exit(1)
    out_dir = sys.argv[2] if len(sys.argv) == 3 else None
    info = extract_visual(sys.argv[1], out_dir)
    print(json.dumps(info, indent=2, ensure_ascii=False))
