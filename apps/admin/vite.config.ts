import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Admin console — separate Vite app, deployed to Cloudflare Pages.
 *
 * ⚠️ `base` باید `/` باشد: روی Cloudflare Pages اپ در ریشهٔ ساب‌دامین
 * سرو می‌شود (admin.infolange.ir)، نه در زیرمسیر.
 */
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
  },
  server: { port: 5180 },
});
