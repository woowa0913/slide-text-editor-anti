import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on current directory ('.') to avoid 'process' type issues
  const env = loadEnv(mode, '.', '');
  // Support both API_KEY and GEMINI_API_KEY naming conventions
  const resolvedApiKey = env.API_KEY || env.GEMINI_API_KEY || process.env.API_KEY || process.env.GEMINI_API_KEY || '';
  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
    },
    define: {
      'process.env.API_KEY': JSON.stringify(resolvedApiKey),
    },
  };
});