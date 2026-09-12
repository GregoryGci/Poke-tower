import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    // three pèse lourd : on l'isole pour qu'il soit mis en cache séparément du code de jeu.
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'], supabase: ['@supabase/supabase-js'] },
      },
    },
  },
});
