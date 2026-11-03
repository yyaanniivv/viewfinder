import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt'],
      manifest: {
        name: 'Horizon Overlook',
        short_name: 'Horizon',
        description: 'See locations on the horizon through AR',
        theme_color: '#0A0A0F',
        background_color: '#0A0A0F',
        display: 'fullscreen',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ],
        categories: ['navigation', 'social'],
        screenshots: [],
        shortcuts: [
          {
            name: 'Calibrate Compass',
            short_name: 'Calibrate',
            url: '/#calibrate',
            description: 'Calibrate compass for accurate bearings'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.mapbox\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
              }
            }
          }
        ]
      }
    }),
    // Serve simple version statically
    {
      name: 'serve-simple',
      configureServer(server) {
        server.middlewares.use('/simple', (req, res, next) => {
          const reqUrl = req.url || '/';
          // Remove /simple prefix for file lookup
          const filePath = reqUrl.replace(/^\/simple/, '') || '/index.html';
          const fullPath = path.join(__dirname, 'public/simple', filePath);

          // Security: prevent directory traversal
          if (!fullPath.startsWith(path.join(__dirname, 'public/simple'))) {
            return next();
          }

          // Try to serve file
          fs.readFile(fullPath, (err, data) => {
            if (err) {
              // Fallback to index.html for SPA-like behavior within /simple/
              if (reqUrl.endsWith('/') || !reqUrl.includes('.')) {
                fs.readFile(path.join(__dirname, 'public/simple/index.html'), (err2, data2) => {
                  if (err2) return next();
                  res.setHeader('Content-Type', 'text/html');
                  res.end(data2);
                });
              } else {
                return next();
              }
            } else {
              const ext = path.extname(fullPath);
              const mimeTypes: Record<string, string> = {
                '.html': 'text/html',
                '.js': 'application/javascript',
                '.css': 'text/css',
                '.json': 'application/json',
                '.svg': 'image/svg+xml',
                '.png': 'image/png',
                '.ico': 'image/x-icon',
              };
              res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
              res.end(data);
            }
          });
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    host: true,
    port: 5173,
    https: {
      key: fs.readFileSync('./key.pem'),
      cert: fs.readFileSync('./cert.pem'),
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
  },
})