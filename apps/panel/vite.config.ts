import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // servido em /app pela Core (mesma origem da API)
  base: '/app/',
  plugins: [react()],
  server: { port: 5173 },
});
