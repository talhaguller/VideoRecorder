import os
import shutil
import uuid

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from preprocess import preprocess
from visual import extract_visual

RUNS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "runs")
os.makedirs(RUNS_DIR, exist_ok=True)

app = FastAPI(title="Konuşma-Motor Backend", version="0.2")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
# üretilen dosyalar buradan servis edilsin (overlay.mp4, kinematics.png)
app.mount("/files", StaticFiles(directory=RUNS_DIR), name="files")


def _url(abs_path):
    rel = os.path.relpath(abs_path, RUNS_DIR).replace(os.sep, "/")
    return f"/files/{rel}"


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze")
async def analyze(video: UploadFile = File(...)):
    job_id = uuid.uuid4().hex[:12]
    job_dir = os.path.join(RUNS_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)

    # yüklenen videoyu diske yaz
    suffix = os.path.splitext(video.filename or "")[1] or ".webm"
    input_path = os.path.join(job_dir, f"input{suffix}")
    with open(input_path, "wb") as f:
        shutil.copyfileobj(video.file, f)

    try:
        meta = preprocess(input_path, job_dir)
        visual = extract_visual(meta["normalized_video"], job_dir, fps=meta["fps"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "job_id": job_id,
        "meta": meta,
        "visual": {
            "detected_ratio": visual["detected_ratio"],
            "metrics_summary": visual["metrics_summary"],
        },
        "files": {
            "kinematics_plot": _url(visual["kinematics_plot"]),
            "overlay_video": _url(visual["overlay_video"]),
            "sample_roi": _url(visual["sample_roi"]) if visual["sample_roi"] else None,
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
