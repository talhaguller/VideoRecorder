import os
import shutil
import uuid

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from preprocess import preprocess

RUNS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "runs")
os.makedirs(RUNS_DIR, exist_ok=True)

app = FastAPI(title="Ön İşleme Backend", version="0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],     
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/preprocess")
async def do_preprocess(video: UploadFile = File(...)):
    job_id = uuid.uuid4().hex[:12]
    job_dir = os.path.join(RUNS_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)

    suffix = os.path.splitext(video.filename or "")[1] or ".webm"
    input_path = os.path.join(job_dir, f"input{suffix}")
    with open(input_path, "wb") as f:
        shutil.copyfileobj(video.file, f)

    try:
        meta = preprocess(input_path, job_dir)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"job_id": job_id, "meta": meta}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
