# Konumlandırmalı Video Kayıt (PositionedVideoRecorder)

React 18 + TypeScript + Chakra UI + Vite ile bağımsız çalışan video kayıt bileşeni.
Hastayı kayıt sırasında kameraya doğru konumlanması için gerçek zamanlı yönlendirir
(yaklaş / uzaklaş / ortalan / ışık). Depolama/upload yoktur; kayıt biten `Blob`
`onRecordingComplete` callback'i ile döndürülür.

## Kurulum

```bash
npm install
npm run dev
```

Tarayıcıda Vite'in verdiği adresi (genelde http://localhost:5173) açın.

