import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import tailwindcss from '@tailwindcss/vite';

// Custom plugin to replace template variables in HTML
function htmlTemplatePlugin(env: Record<string, string>) {
  return {
    name: 'html-template',
    transformIndexHtml(html: string) {
      const appTitle = env.VITE_APP_TITLE || 'Scrum Poker';
      const appSubtitle =
        env.VITE_APP_SUBTITLE || 'Collaborative Story Point Estimation for Your Team';

      return html.replace(/{{APP_TITLE}}/g, appTitle).replace(/{{APP_SUBTITLE}}/g, appSubtitle);
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory
  const env = loadEnv(mode, process.cwd(), '');

  return {
    root: 'src/client',
    plugins: [htmlTemplatePlugin(env), tailwindcss()],
    build: {
      outDir: '../../dist/public',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'src/client/index.html'),
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/socket.io': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          ws: true,
        },
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/client'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
  };
});
