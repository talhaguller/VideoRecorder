import { useState } from 'react';
import {
  Box,
  Container,
  Heading,
  Text,
  VStack,
  HStack,
  Spinner,
  Alert,
  AlertIcon,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  SimpleGrid,
  Image,
  AspectRatio,
} from '@chakra-ui/react';
import PositionedVideoRecorder from '../components/PositionedVideoRecorder';

const API_BASE = 'http://127.0.0.1:8000';
// /files/... göreli yolunu tam URL'e çevir
const fileUrl = (p: string) => (p.startsWith('http') ? p : `${API_BASE}${p}`);

interface Meta {
  fps: number;
  frame_count: number;
  duration_s: number;
  width: number;
  height: number;
  audio_sr: number;
}

interface AnalyzeResult {
  meta: Meta;
  visual: {
    detected_ratio: number;
    metrics_summary: Record<string, { mean: number; std: number }>;
  };
  files: {
    kinematics_plot: string;
    overlay_video: string;
    sample_roi: string | null;
  };
}

type Phase = 'idle' | 'uploading' | 'done' | 'error';

export default function VideoRecorderDemo() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleComplete = async (blob: Blob) => {
    setResult(null);
    setError(null);
    setPhase('uploading');
    try {
      const form = new FormData();
      form.append('video', blob, 'recording.webm');
      const res = await fetch(`${API_BASE}/analyze`, { method: 'POST', body: form });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          if (j?.detail) detail = j.detail;
        } catch {
          /* yoksay */
        }
        throw new Error(detail);
      }
      setResult(await res.json());
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  };

  const meta = result?.meta;
  const visual = result?.visual;

  return (
    <Container maxW="900px" py={8}>
      <VStack spacing={6} align="stretch">
        <Box>
          <Heading size="lg">Aşama 1 + 2 — Ön İşleme & Görsel (Face Mesh)</Heading>
          <Text color="gray.500" mt={1}>
            Kaydı al; video normalize edilir, yüz noktaları bulunur ve çene/dudak
            hareketi çıkarılır. Sonuçlar aşağıda.
          </Text>
        </Box>

        <PositionedVideoRecorder onRecordingComplete={handleComplete} maxDurationSec={60} />

        {phase === 'uploading' && (
          <HStack p={4} bg="blue.50" borderRadius="md" color="blue.700" spacing={3}>
            <Spinner size="sm" />
            <Text>
              İşleniyor: ön işleme → yüz landmark → kinematik… (CPU'da birkaç saniye)
            </Text>
          </HStack>
        )}

        {phase === 'error' && error && (
          <Alert status="error" borderRadius="md">
            <AlertIcon />
            <Box>
              <Text fontWeight="bold">İşleme başarısız</Text>
              <Text fontSize="sm">{error}</Text>
              <Text fontSize="xs" mt={1} color="gray.600">
                Backend çalışıyor mu? (.venv/bin/python server.py)
              </Text>
            </Box>
          </Alert>
        )}

        {phase === 'done' && result && meta && visual && (
          <VStack align="stretch" spacing={6}>
            {/* Aşama 1 — ön işleme meta */}
            <Box>
              <Heading size="md" mb={2}>
                Ön işleme
              </Heading>
              <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
                <Stat p={3} bg="gray.50" borderRadius="md">
                  <StatLabel>Kare hızı</StatLabel>
                  <StatNumber>{meta.fps}</StatNumber>
                  <StatHelpText>fps (CFR)</StatHelpText>
                </Stat>
                <Stat p={3} bg="gray.50" borderRadius="md">
                  <StatLabel>Kare</StatLabel>
                  <StatNumber>{meta.frame_count}</StatNumber>
                  <StatHelpText>{meta.duration_s} sn</StatHelpText>
                </Stat>
                <Stat p={3} bg="gray.50" borderRadius="md">
                  <StatLabel>Çözünürlük</StatLabel>
                  <StatNumber fontSize="lg">
                    {meta.width}×{meta.height}
                  </StatNumber>
                </Stat>
                <Stat p={3} bg="gray.50" borderRadius="md">
                  <StatLabel>Yüz tespiti</StatLabel>
                  <StatNumber>{(visual.detected_ratio * 100).toFixed(0)}%</StatNumber>
                  <StatHelpText>karelerde yüz</StatHelpText>
                </Stat>
              </SimpleGrid>
            </Box>

            {/* Aşama 2 — overlay video */}
            <Box>
              <Heading size="sm" mb={2}>
                Landmark + ROI overlay
              </Heading>
              <AspectRatio ratio={4 / 3} maxW="520px">
                <video
                  src={fileUrl(result.files.overlay_video)}
                  controls
                  style={{ borderRadius: 8, background: '#000' }}
                />
              </AspectRatio>
            </Box>

            {/* Aşama 2 — kinematik grafiği */}
            <Box>
              <Heading size="sm" mb={2}>
                Çene/dudak kinematiği (zaman içinde)
              </Heading>
              <Image
                src={fileUrl(result.files.kinematics_plot)}
                alt="kinematik grafiği"
                borderRadius="md"
                border="1px solid"
                borderColor="gray.200"
              />
            </Box>
          </VStack>
        )}
      </VStack>
    </Container>
  );
}
