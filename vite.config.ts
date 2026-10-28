import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// A tela fala com o servidor local (core/server.ts) pelo /api; o proxy evita CORS e endereço fixo no código.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': `http://127.0.0.1:${process.env.CACALEAD_PORTA ?? 4790}` },
  },
});
