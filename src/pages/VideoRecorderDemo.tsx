import { useState } from 'react';
import { Box, Container, Heading, Text, VStack, Code, Switch, HStack } from '@chakra-ui/react';
import PositionedVideoRecorder from '../components/PositionedVideoRecorder';

export default function VideoRecorderDemo() {
  const [lastBlob, setLastBlob] = useState<{ size: number; type: string } | null>(null);
  const [externalReady, setExternalReady] = useState(true);

  const handleComplete = (blob: Blob) => {
    // gerçek projede blob burada backend'e (GCS) yüklenir
    setLastBlob({ size: blob.size, type: blob.type });
    console.log('Kayıt tamamlandı:', blob);
  };

  return (
    <Container maxW="900px" py={8}>
      <VStack spacing={6} align="stretch">
        <Box>
          <Heading size="lg">Konumlandırmalı Video Kayıt — Demo</Heading>
          <Text color="gray.500" mt={1}>
            Yüzünüzü ovalin içine ortalayın; üstteki yönlendirmeyi takip edin.
          </Text>
        </Box>

        {/* sadece isReadyToRecord prop'unu denemek için; gerçek projede olmaz */}
        <HStack>
          <Switch
            isChecked={externalReady}
            onChange={(e) => setExternalReady(e.target.checked)}
          />
          <VStack align="start" spacing={0}>
            <Text fontWeight="medium">
              Kayıt dışarıdan açık (isReadyToRecord) — TEST
            </Text>
            <Text fontSize="xs" color="gray.500">
              Kamera izni değil; uygulamanın kaydı uygun anda açmasını simüle eder.
            </Text>
          </VStack>
        </HStack>

        <PositionedVideoRecorder
          onRecordingComplete={handleComplete}
          isReadyToRecord={externalReady}
          maxDurationSec={60}
        />

        {lastBlob && (
          <Box p={4} bg="gray.50" borderRadius="md">
            <Text fontWeight="bold">Son kayıt callback'i:</Text>
            <Code display="block" mt={2}>
              type: {lastBlob.type} · size: {(lastBlob.size / 1024).toFixed(1)} KB
            </Code>
          </Box>
        )}
      </VStack>
    </Container>
  );
}
