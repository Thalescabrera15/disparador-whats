import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

/** Redireciona http://localhost:5173/ -> /app/ */
function redirectRoot(): Plugin {
  return {
    name: 'redirect-root',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/' || req.url === '') {
          res.statusCode = 302;
          res.setHeader('Location', '/app/');
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base: '/app/',
  plugins: [react(), redirectRoot()],
  server: {
    port: 5173,
    open: '/app/',
  },
  preview: { port: 5173, open: '/app/' },
});
