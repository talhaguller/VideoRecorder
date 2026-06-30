# VideoRecorder — Konuşma-Motor Multimodal Demo

Konuşma sırasında yüz/ağız hareketiyle sesi aynı zaman ekseninde analiz etmeye
çalıştığım bir demo. Amacım, motor konuşma değerlendirmesine yönelik görsel
(çene/dudak hareketi) ve işitsel sinyalleri birlikte işlemek.

Sistemi aşama aşama kuruyorum. Şu anda ön işleme (Aşama 1) hazır: gelen video
sabit 30 fps'e, ses 16 kHz'e normalize ediliyor; videonun gerçek özellikleri
(fps, kare sayısı, süre, çözünürlük) çıkarılıp arayüzde gösteriliyor. Görsel
(Face Mesh), akustik (Wav2Vec2) ve füzyon aşamaları sırada.

Proje iki parçadan oluşuyor:

- `frontend/` — React + Vite ile yazdığım kayıt arayüzü. Kişiyi kameraya
  hizalayıp video kaydediyor.
- `backend/` — Python + FastAPI. Kaydı alıp işliyor.

## Çalıştırma

İki terminal gerekiyor. Önce sistemde ffmpeg kurulu olmalı (`brew install ffmpeg`).

Backend:

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python server.py        # http://127.0.0.1:8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev                        # http://localhost:5173
```

Tarayıcıda kaydı alıyorsun; video backend'e gidip işleniyor ve sonuç ekranda
görünüyor. Daha fazla ayrıntı için `backend/README.md` ve `frontend/README.md`.
