import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Android 8 devices often ship a WebView that never updated: it cannot parse
 * <script type="module">. We emit a classic IIFE bundle and rewrite the tag so
 * the app runs on anything from roughly Chrome 55 upward.
 */
function classicScript(): Plugin {
  let isIife = false
  return {
    name: 'shadowcode-classic-script',
    enforce: 'post',
    configResolved(cfg) {
      const out = cfg.build.rollupOptions.output
      isIife = !!out && !Array.isArray(out) && out.format === 'iife'
    },
    transformIndexHtml(html) {
      if (!isIife) return html
      return html
        .replace(/<script([^>]*?)\stype="module"([^>]*)>/g, (_m, a, b) => `<script${a}${b} defer>`)
        .replace(/<script([^>]*?)\scrossorigin(?=[^>]*>)/g, '<script$1')
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), classicScript()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: ['es2017'],
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4096,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/app.js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  server: { host: '0.0.0.0', port: 5173, strictPort: true, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 4173, strictPort: true, allowedHosts: true },
})
