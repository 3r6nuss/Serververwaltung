import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Im Dev-Modus läuft das Frontend auf Port 5174 und leitet alle /api-Anfragen
// an den Express-Server (Port 3001) weiter. So bleibt der API-Key serverseitig.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // WebSocket-Upgrades (SSH-Konsole) ebenfalls weiterleiten.
        ws: true,
      },
    },
  },
})
