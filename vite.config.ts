import { defineConfig } from 'vite'
import { resolve } from 'path'

// Custom plugin to replace template variables in HTML
function htmlTemplatePlugin() {
  return {
    name: 'html-template',
    transformIndexHtml(html: string) {
      const appTitle = process.env.APP_TITLE || 'Scrum Poker';
      const appSubtitle = process.env.APP_SUBTITLE || 'Collaborative Story Point Estimation for Your Team';
      
      return html
        .replace(/{{APP_TITLE}}/g, appTitle)
        .replace(/{{APP_SUBTITLE}}/g, appSubtitle);
    }
  }
}

export default defineConfig({
  root: 'src/client',
  plugins: [htmlTemplatePlugin()],
  build: {
    outDir: '../../dist/public',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/client/index.html')
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/client'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  }
})