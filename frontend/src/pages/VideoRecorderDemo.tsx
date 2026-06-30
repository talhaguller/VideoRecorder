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
  Code,
} from '@chakra-ui/react';
import PositionedVideoRecorder from '../components/PositionedVideoRecorder';

const API_BASE = 'http://127.0.0.1:8000';

// Backendin preprocess te döndürdüğü bilgisinin tipi
interface Meta {
  fps: number;
  frame_count: number;
  duration_s: number;
  width: number;
  height: number;
  audio_sr: number;
}

type Phase = 'idle' | 'uploading' | 'done' | 'error';

export default function VideoRecorderDemo() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Kayıt bitince: blobu preprocess e yolla dönen bilgileri göster
  const handleComplete = async (blob: Blob) => {
    setMeta(null);
    setError(null);
    setPhase('uploading');
    try {
      const form = new FormData();
      form.append('video', blob, 'recording.webm');
      const res = await fetch(`${API_BASE}/preprocess`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMeta(data.meta);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  };

  return (
    <Container maxW="900px" py={8}>
      <VStack spacing={6} align="stretch">
        <Box>
          <Heading size="lg">Aşama 1 — Ön İşleme</Heading>
          <Text color="gray.500" mt={1}>
            Kaydı al; video backend'de 30 fps (CFR) + 16 kHz sese normalize
            edilir ve gerçek özellikleri aşağıda görünür.
          </Text>
        </Box>

        <PositionedVideoRecorder
          onRecordingComplete={handleComplete}
          maxDurationSec={60}
        />

        {/* İşleme durumu */}
        {phase === 'uploading' && (
          <HStack p={4} bg="blue.50" borderRadius="md" color="blue.700" spacing={3}>
            <Spinner size="sm" />
            <Text>Video backend'e yüklendi, ön işleme çalışıyor…</Text>
          </HStack>
        )}

        {phase === 'error' && error && (
          <Alert status="error" borderRadius="md">
            <AlertIcon />
            <Box>
              <Text fontWeight="bold">Ön işleme başarısız</Text>
              <Text fontSize="sm">{error}</Text>
              <Text fontSize="xs" mt={1} color="gray.600">
                Backend çalışıyor mu? (.venv/bin/python server.py)
              </Text>
            </Box>
          </Alert>
        )}

        {/* Sonuç fps bilgiler kartlarda */}
        {phase === 'done' && meta && (
          <VStack align="stretch" spacing={4}>
            <Heading size="md">Ön işleme sonucu</Heading>
            <SimpleGrid columns={{ base: 2, md: 3 }} spacing={4}>
              <Stat p={4} bg="gray.50" borderRadius="md">
                <StatLabel>Kare hızı (fps)</StatLabel>
                <StatNumber>{meta.fps}</StatNumber>
                <StatHelpText>sabit (CFR)</StatHelpText>
              </Stat>
              <Stat p={4} bg="gray.50" borderRadius="md">
                <StatLabel>Toplam kare</StatLabel>
                <StatNumber>{meta.frame_count}</StatNumber>
                <StatHelpText>adet</StatHelpText>
              </Stat>
              <Stat p={4} bg="gray.50" borderRadius="md">
                <StatLabel>Süre</StatLabel>
                <StatNumber>{meta.duration_s}</StatNumber>
                <StatHelpText>saniye</StatHelpText>
              </Stat>
              <Stat p={4} bg="gray.50" borderRadius="md">
                <StatLabel>Çözünürlük</StatLabel>
                <StatNumber>
                  {meta.width}×{meta.height}
                </StatNumber>
                <StatHelpText>piksel</StatHelpText>
              </Stat>
              <Stat p={4} bg="gray.50" borderRadius="md">
                <StatLabel>Ses örnekleme</StatLabel>
                <StatNumber>{meta.audio_sr / 1000} kHz</StatNumber>
                <StatHelpText>mono</StatHelpText>
              </Stat>
            </SimpleGrid>

            <Box p={3} bg="green.50" borderRadius="md">
              <Text fontSize="sm" color="green.800">
                Doğrulama: {meta.frame_count} kare ÷ {meta.fps} fps ={' '}
                <b>{(meta.frame_count / meta.fps).toFixed(3)} sn</b> ≈ süre{' '}
                {meta.duration_s} sn → CFR sayesinde{' '}
                <Code>t = kare / fps</Code> formülü geçerli.
              </Text>
            </Box>
          </VStack>
        )}
      </VStack>
    </Container>
  );
}
