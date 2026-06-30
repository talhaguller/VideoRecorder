import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import {
  AspectRatio,
  Badge,
  Box,
  Button,
  Center,
  HStack,
  Progress,
  Spinner,
  Text,
  VStack,
} from '@chakra-ui/react';
import {
  FaceDetector,
  FilesetResolver,
  type Detection,
} from '@mediapipe/tasks-vision';

const CONFIG = {
  faceWidthMinRatio: 0.25,
  faceWidthMaxRatio: 0.55,
  centerOffsetMax: 0.15,
  brightnessMin: 60,
  brightnessMax: 200,

  requireAllChecksToRecord: true,

  detectIntervalMs: 120,

  mirrorPreview: true,

  guideOvalWidthPct: 55,
  guideOvalHeightPct: 78,

  wasmBasePath:
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm',
  faceModelUrl:
    'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',

  messages: {
    noFace: 'Yüzünüz görünmüyor, kameraya bakın',
    tooSmall: 'Biraz yaklaşın',
    tooBig: 'Biraz uzaklaşın',
    offCenter: 'Yüzünüzü Ortalayın',
    lowLight: 'Işık yetersiz',
    highLight: 'Çok parlak',
    ready: 'Hazırsınız ✓',
    loadingModel: 'Yüz tespiti yükleniyor…',
    permissionDenied:
      'Kamera/mikrofon izni reddedildi. Lütfen tarayıcı ayarlarından izin verin ve sayfayı yenileyin.',
    noDevice: 'Kamera veya mikrofon bulunamadı.',
    genericCamError: 'Kameraya erişilemedi. Cihazı kontrol edip tekrar deneyin.',
  },
} as const;

interface Props {
  onRecordingComplete: (blob: Blob) => void;
  isReadyToRecord?: boolean; 
  maxDurationSec?: number;
}

type Arrow = 'left' | 'right' | 'up' | 'down' | null;

interface Analysis {
  status: 'ok' | 'warn' | 'error';
  message: string;
  arrow: Arrow;
  ready: boolean;
}

const DEFAULT_ANALYSIS: Analysis = {
  status: 'error',
  message: CONFIG.messages.noFace,
  arrow: null,
  ready: false,
};

function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return '';
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

export default function PositionedVideoRecorder({
  onRecordingComplete,
  isReadyToRecord = true,
  maxDurationSec = 120,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<FaceDetector | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastDetectTsRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  const recordedUrlRef = useRef<string | null>(null);

  const [modelReady, setModelReady] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis>(DEFAULT_ANALYSIS);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);

  const analyzeFrame = useCallback(
    (detections: Detection[], video: HTMLVideoElement): Analysis => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;

      let brightness = 128;
      const canvas = canvasRef.current;
      if (canvas && vw && vh) {
        const sw = 64; 
        const sh = Math.max(1, Math.round((sw * vh) / vw));
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, sw, sh);
          const { data } = ctx.getImageData(0, 0, sw, sh);
          let sum = 0;
          for (let i = 0; i < data.length; i += 16) {
            sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          }
          brightness = sum / (data.length / 16);
        }
      }

      const lowLight = brightness < CONFIG.brightnessMin;
      const highLight = brightness > CONFIG.brightnessMax;

      if (!detections.length || !vw || !vh) {
        return {
          status: 'error',
          message: CONFIG.messages.noFace,
          arrow: null,
          ready: false,
        };
      }

      const box = detections
        .map((d) => d.boundingBox!)
        .filter(Boolean)
        .sort((a, b) => b.width - a.width)[0];

      const widthRatio = box.width / vw;
      const faceCx = box.originX + box.width / 2;
      const faceCy = box.originY + box.height / 2;

      let offsetX = faceCx / vw - 0.5;
      const offsetY = faceCy / vh - 0.5;
      if (CONFIG.mirrorPreview) offsetX = -offsetX;

      if (widthRatio < CONFIG.faceWidthMinRatio) {
        return { status: 'warn', message: CONFIG.messages.tooSmall, arrow: null, ready: false };
      }
      if (widthRatio > CONFIG.faceWidthMaxRatio) {
        return { status: 'warn', message: CONFIG.messages.tooBig, arrow: null, ready: false };
      }

      const absX = Math.abs(offsetX);
      const absY = Math.abs(offsetY);
      if (absX > CONFIG.centerOffsetMax || absY > CONFIG.centerOffsetMax) {
        let arrow: Arrow;
        if (absX >= absY) arrow = offsetX > 0 ? 'left' : 'right';
        else arrow = offsetY > 0 ? 'up' : 'down';
        return { status: 'warn', message: CONFIG.messages.offCenter, arrow, ready: false };
      }

      if (lowLight) {
        return { status: 'warn', message: CONFIG.messages.lowLight, arrow: null, ready: false };
      }
      if (highLight) {
        return { status: 'warn', message: CONFIG.messages.highLight, arrow: null, ready: false };
      }

      return { status: 'ok', message: CONFIG.messages.ready, arrow: null, ready: true };
    },
    []
  );

  const detectLoop = useCallback(() => {
    const video = videoRef.current;
    const detector = detectorRef.current;
    const now = performance.now();

    if (
      video &&
      detector &&
      video.readyState >= 2 &&
      now - lastDetectTsRef.current >= CONFIG.detectIntervalMs
    ) {
      lastDetectTsRef.current = now;
      if (video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        try {
          const result = detector.detectForVideo(video, now);
          setAnalysis(analyzeFrame(result.detections, video));
        } catch {
        }
      }
    }
    rafRef.current = requestAnimationFrame(detectLoop);
  }, [analyzeFrame]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(CONFIG.wasmBasePath);
        const detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: { modelAssetPath: CONFIG.faceModelUrl, delegate: 'GPU' },
          runningMode: 'VIDEO',
        });
        if (cancelled) {
          detector.close();
          return;
        }
        detectorRef.current = detector;
        setModelReady(true);
      } catch {
        if (!cancelled) setModelReady(true);
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        rafRef.current = requestAnimationFrame(detectLoop);
      } catch (err) {
        if (cancelled) return;
        const e = err as DOMException;
        if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
          setCamError(CONFIG.messages.permissionDenied);
        } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
          setCamError(CONFIG.messages.noDevice);
        } else {
          setCamError(CONFIG.messages.genericCamError);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (timerRef.current != null) clearInterval(timerRef.current);
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop();
        } catch {
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      detectorRef.current?.close();
      detectorRef.current = null;
      if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
    };
  }, []);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || isRecording) return;

    if (recordedUrlRef.current) {
      URL.revokeObjectURL(recordedUrlRef.current);
      recordedUrlRef.current = null;
      setRecordedUrl(null);
    }

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: mimeType || 'video/webm',
      });
      const url = URL.createObjectURL(blob);
      recordedUrlRef.current = url;
      setRecordedUrl(url);
      onRecordingComplete(blob);
    };

    recorder.start(1000);
    recorderRef.current = recorder;
    setIsRecording(true);
    setElapsed(0);

    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        if (next >= maxDurationSec) {
          stopRecording(); 
        }
        return next;
      });
    }, 1000);
  }, [isRecording, maxDurationSec, onRecordingComplete]);

  const stopRecording = useCallback(() => {
    if (timerRef.current != null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    setIsRecording(false);
  }, []);

  const checksPass = analysis.ready;
  const canStart =
    !camError &&
    isReadyToRecord &&
    (!CONFIG.requireAllChecksToRecord || checksPass);

  const arrowChar = (a: Arrow) =>
    a === 'left' ? '←' : a === 'right' ? '→' : a === 'up' ? '↑' : a === 'down' ? '↓' : '';

  const overlayColor =
    analysis.status === 'ok' ? 'green.500' : analysis.status === 'warn' ? 'orange.500' : 'red.500';

  const fixWebmDuration = (e: SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (v.duration === Infinity || Number.isNaN(v.duration)) {
      const onTimeUpdate = () => {
        v.removeEventListener('timeupdate', onTimeUpdate);
        v.currentTime = 0;
      };
      v.addEventListener('timeupdate', onTimeUpdate);
      v.currentTime = 1e101;
    }
  };

  if (camError) {
    return (
      <Box
        w="100%"
        maxW="900px"
        mx="auto"
        p={6}
        borderWidth="1px"
        borderRadius="xl"
        bg="red.50"
        borderColor="red.200"
      >
        <VStack spacing={3} align="stretch">
          <Text fontSize="xl" fontWeight="bold" color="red.600">
            Kamera Hatası
          </Text>
          <Text color="red.700">{camError}</Text>
          <Button colorScheme="red" onClick={() => window.location.reload()}>
            Sayfayı Yenile
          </Button>
        </VStack>
      </Box>
    );
  }

  return (
    <Box w="100%" maxW="900px" mx="auto">
      <VStack spacing={4} align="stretch">
        <Box position="relative" borderRadius="xl" overflow="hidden" bg="black">
          <AspectRatio ratio={4 / 3}>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: CONFIG.mirrorPreview ? 'scaleX(-1)' : undefined,
              }}
            />
          </AspectRatio>

          {/* yüzün oturacağı hizalama ovali */}
          <Center position="absolute" inset={0} pointerEvents="none">
            <Box
              w={`${CONFIG.guideOvalWidthPct}%`}
              h={`${CONFIG.guideOvalHeightPct}%`}
              border="3px dashed"
              borderColor={analysis.status === 'ok' ? 'green.300' : 'whiteAlpha.700'}
              borderRadius="50%"
              transition="border-color 0.2s"
            />
          </Center>

          {!modelReady && (
            <Center position="absolute" inset={0} bg="blackAlpha.500">
              <HStack color="white">
                <Spinner size="sm" />
                <Text>{CONFIG.messages.loadingModel}</Text>
              </HStack>
            </Center>
          )}

          {/* gerçek zamanlı yönlendirme balonu */}
          <Center position="absolute" top={3} left={0} right={0} pointerEvents="none">
            <HStack
              bg={overlayColor}
              color="white"
              px={5}
              py={2}
              borderRadius="full"
              boxShadow="lg"
              spacing={3}
            >
              {analysis.arrow && (
                <Text fontSize="2xl" fontWeight="bold" lineHeight={1}>
                  {arrowChar(analysis.arrow)}
                </Text>
              )}
              <Text fontSize={{ base: 'lg', md: 'xl' }} fontWeight="bold">
                {analysis.message}
              </Text>
            </HStack>
          </Center>

          {isRecording && (
            <HStack position="absolute" top={3} right={3} bg="red.600" color="white" px={3} py={1} borderRadius="md">
              <Box w="10px" h="10px" borderRadius="full" bg="white" />
              <Text fontWeight="bold">REC {fmt(elapsed)}</Text>
            </HStack>
          )}
        </Box>

        {/* sadece parlaklık ölçümü için */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        <HStack justify="space-between">
          <Badge
            colorScheme={analysis.status === 'ok' ? 'green' : analysis.status === 'warn' ? 'orange' : 'red'}
            fontSize="md"
            px={3}
            py={1}
            borderRadius="md"
          >
            {analysis.message}
          </Badge>
          <Text color="gray.500" fontSize="sm">
            {fmt(elapsed)} / {fmt(maxDurationSec)}
          </Text>
        </HStack>

        {isRecording && (
          <Progress
            value={(elapsed / maxDurationSec) * 100}
            size="sm"
            colorScheme="red"
            borderRadius="full"
          />
        )}

        <HStack spacing={3}>
          {!isRecording ? (
            <Button
              colorScheme="green"
              size="lg"
              flex={1}
              onClick={startRecording}
              isDisabled={!canStart}
            >
              Kayıt Başlat
            </Button>
          ) : (
            <Button colorScheme="red" size="lg" flex={1} onClick={stopRecording}>
              Durdur
            </Button>
          )}
        </HStack>

        {!isRecording && !canStart && CONFIG.requireAllChecksToRecord && (
          <Text fontSize="sm" color="orange.500" textAlign="center">
            Kayıt için yönlendirmeleri tamamlayın ({analysis.message}).
          </Text>
        )}
        {!isRecording && !isReadyToRecord && (
          <Text fontSize="sm" color="gray.500" textAlign="center">
            Kayıt şu anda dışarıdan kilitli.
          </Text>
        )}

        {recordedUrl && !isRecording && (
          <Box borderWidth="1px" borderRadius="xl" p={4}>
            <VStack spacing={3} align="stretch">
              <Text fontWeight="bold">Kayıt Önizlemesi</Text>
              <AspectRatio ratio={4 / 3} borderRadius="md" overflow="hidden" bg="black">
                <video
                  ref={previewVideoRef}
                  src={recordedUrl}
                  controls
                  playsInline
                  onLoadedMetadata={fixWebmDuration}
                  style={{
                    width: '100%',
                    height: '100%',
                  }}
                />
              </AspectRatio>
              <Button
                as="a"
                href={recordedUrl}
                download={`kayit-${Date.now()}.webm`}
                colorScheme="blue"
                variant="outline"
              >
                İndir
              </Button>
            </VStack>
          </Box>
        )}
      </VStack>
    </Box>
  );
}
