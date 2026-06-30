# Backend — Ön İşleme

Konuşma videosunu analize hazırlayan Python servisi. Şu an ön işleme aşamasını
yapıyor; sonraki aşamaları (görsel, akustik, füzyon) buraya ekleyeceğim.

## Ne yapıyor

Gelen videoyu iki dosyaya çeviriyorum:

- `normalized.mp4` — sabit 30 fps (CFR), H.264
- `audio.wav` — 16 kHz mono, üstüne hafif gürültü bastırma (highpass + afftdn)

Videoyu sabit kare hızına (CFR) çevirmemin sebebi şu: tarayıcı kayıtları değişken
kare hızlı (VFR) çıkıyor, bu da "kaçıncı kare hangi ana denk geliyor" hesabını
bozuyor. CFR'ye çevirince `t = kare / fps` formülü birebir tutuyor; sesle görüntüyü
ancak böyle güvenle hizalayabiliyorum.

Bunların yanında ffprobe ile videonun gerçek fps / kare sayısı / süre / çözünürlük
bilgisini okuyup geri döndürüyorum — ekranda gösterilen değerler bunlar.

## Çalıştırma

ffmpeg sistemde kurulu olmalı (pip ile gelmez):

```bash
brew install ffmpeg          # macOS
# sudo apt install ffmpeg    # Linux
```

Sonra:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python server.py        # http://127.0.0.1:8000
```

Tek bir dosyayı sunucusuz da işleyebiliyorum:

```bash
.venv/bin/python preprocess.py video.webm out/
```

## Uçlar

- `GET /health` — servis ayakta mı
- `POST /preprocess` — video yükle; `{ job_id, meta }` döner. `meta` içinde fps,
  kare sayısı, süre, çözünürlük, ses örnekleme bilgisi var.

## Notlar

- Sağlamlık: ffmpeg yoksa, girdi dosyası yoksa veya videoda ses kanalı yoksa
  ham hata yerine anlaşılır mesaj veriyor.
- Çıktılar `runs/<job_id>/` altına yazılıyor.
- Not: gürültü bastırma agresif olursa ileride jitter/shimmer gibi akustik
  ölçümleri etkileyebilir; akustik aşamasını eklerken bu ayarı gözden geçireceğim.
