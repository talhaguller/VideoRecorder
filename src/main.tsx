import React from 'react';
import ReactDOM from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import VideoRecorderDemo from './pages/VideoRecorderDemo';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ChakraProvider>
      <VideoRecorderDemo />
    </ChakraProvider>
  </React.StrictMode>
);
