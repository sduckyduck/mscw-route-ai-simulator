import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Cloudflare Pages / custom domain: keep base as '/'.
// GitHub Pages under /repo-name/ can override this when needed.
export default defineConfig({
  plugins: [react()],
  base: '/',
});
