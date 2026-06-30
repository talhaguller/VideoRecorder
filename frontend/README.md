# Frontend — Kayıt Arayüzü

React + TypeScript + Vite ile yazdığım kayıt arayüzü.

Kişiyi kayıt sırasında kameraya doğru hizalaması için yönlendiriyorum:
yaklaş / uzaklaş / ortala uyarıları ve ışık kontrolü. Yüz tespitini tarayıcının
içinde MediaPipe ile yapıyorum, yani bunun için sunucuya gitmeye gerek yok.

Kayıt bitince video backend'e gönderiliyor; dönen bilgiler (fps, kare sayısı,
süre, çözünürlük) ekranda kartlar halinde gösteriliyor.

## Çalıştırma

```bash
npm install
npm run dev
```

Tarayıcıda http://localhost:5173 (port doluysa Vite 5174'e geçiyor).

Backend'in çalışıyor olması gerekiyor (bkz. `backend/README.md`). Backend adresini
`src/pages/VideoRecorderDemo.tsx` içindeki `API_BASE` belirliyor; varsayılan
`http://127.0.0.1:8000`.

## Dosyalar

- `src/components/PositionedVideoRecorder.tsx` — kamera, yüz hizalama ve kayıt
- `src/pages/VideoRecorderDemo.tsx` — kaydı backend'e gönderip sonucu gösteren sayfa
